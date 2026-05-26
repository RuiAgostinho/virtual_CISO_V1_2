import csv
import gzip
import io
import json
import time
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Iterable
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.db.models import Q
from django.utils import timezone

from integrations.models import IntegrationConfig, IntegrationSyncStatus
from risk.models.vulnerability import Vulnerability


class IntelService:
    """Imports vulnerability intelligence without changing scan-origin data.

    The scan pipeline creates the vulnerability records. This service enriches
    those records with external intelligence that can be used by prioritization:
    CVSS/NVD, FIRST EPSS and CISA KEV.
    """

    DEFAULT_EPSS_URL = "https://epss.empiricalsecurity.com/epss_scores-current.csv.gz"
    DEFAULT_NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
    DEFAULT_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"

    SYNC_TYPE = "vulnerability_intel"

    @classmethod
    def sync_epss(cls, limit=None, cve_ids=None, url=None):
        sync = cls._start_sync("epss")
        started = timezone.now()
        try:
            config = cls._config("epss")
            feed_url = url or (config.api_url if config else None) or cls.DEFAULT_EPSS_URL
            cve_filter = {cve.upper() for cve in cve_ids or []}
            known_cves = cve_filter or set(
                Vulnerability.objects.values_list("cve_id", flat=True)
            )
            rows = cls._read_epss_rows(feed_url)
            now = timezone.now()
            total_rows = 0
            matched = 0
            updated = []

            for row in rows:
                total_rows += 1
                cve = (row.get("cve") or row.get("CVE") or "").upper().strip()
                if not cve or cve not in known_cves:
                    continue
                vulnerability = Vulnerability.objects.filter(cve_id=cve).first()
                if not vulnerability:
                    continue
                epss = cls._decimal(row.get("epss"))
                percentile = cls._decimal(row.get("percentile"))
                if epss is None:
                    continue
                vulnerability.epss_score = epss
                vulnerability.epss_percentile = percentile
                vulnerability.epss_last_updated = now
                updated.append(vulnerability)
                matched += 1
                if limit and matched >= int(limit):
                    break

            cls._bulk_update_vulnerabilities(
                updated,
                ["epss_score", "epss_percentile", "epss_last_updated"],
            )
            result = {
                "provider": "epss",
                "source_url": feed_url,
                "total_rows": total_rows,
                "matched": matched,
                "updated": len(updated),
            }
            cls._finish_sync(sync, "SUCCESS", started)
            return result
        except Exception as exc:
            cls._finish_sync(sync, "FAILED", started, str(exc))
            raise

    @classmethod
    def sync_nist(cls, limit=50, cve_ids=None, url=None, sleep_seconds=0.6):
        sync = cls._start_sync("nist")
        started = timezone.now()
        try:
            config = cls._config("nist")
            api_url = url or (config.api_url if config else None) or cls.DEFAULT_NVD_URL
            headers = {}
            if config and config.password:
                headers["apiKey"] = config.password
            targets = cls._nist_targets(cve_ids, limit)
            updated = 0
            not_found = []
            errors = []

            for index, cve_id in enumerate(targets):
                try:
                    payload = cls._fetch_nvd_payload(api_url, cve_id, headers=headers)
                    cve_payload = cls._first_nvd_cve(payload)
                    if not cve_payload:
                        not_found.append(cve_id)
                        continue
                    if cls._apply_nvd_payload(cve_id, cve_payload):
                        updated += 1
                except Exception as exc:
                    errors.append({"cve_id": cve_id, "error": str(exc)})
                if sleep_seconds and index < len(targets) - 1:
                    time.sleep(float(sleep_seconds))

            result = {
                "provider": "nist",
                "source_url": api_url,
                "processed": len(targets),
                "updated": updated,
                "not_found": not_found,
                "errors": errors,
            }
            status = "FAILED" if errors and updated == 0 else "SUCCESS"
            cls._finish_sync(sync, status, started, json.dumps(errors) if errors else None)
            return result
        except Exception as exc:
            cls._finish_sync(sync, "FAILED", started, str(exc))
            raise

    @classmethod
    def sync_kev(cls, url=None):
        sync = cls._start_sync("kev")
        started = timezone.now()
        try:
            config = cls._config("kev")
            feed_url = url or (config.api_url if config else None) or cls.DEFAULT_KEV_URL
            payload = cls._download_json(feed_url)
            entries = payload.get("vulnerabilities", [])
            result = cls.apply_kev_entries(entries)
            result["provider"] = "kev"
            result["source_url"] = feed_url
            cls._finish_sync(sync, "SUCCESS", started)
            return result
        except Exception as exc:
            cls._finish_sync(sync, "FAILED", started, str(exc))
            raise

    @classmethod
    def apply_kev_entries(cls, entries: Iterable[dict]):
        now = timezone.now()
        normalized = {
            (entry.get("cveID") or entry.get("cve_id") or "").upper().strip(): entry
            for entry in entries
            if entry.get("cveID") or entry.get("cve_id")
        }
        kev_cves = set(normalized)
        existing = list(Vulnerability.objects.all())
        updated = []
        matched = 0
        checked = 0

        for vulnerability in existing:
            checked += 1
            cve_id = vulnerability.cve_id.upper()
            entry = normalized.get(cve_id)
            vulnerability.is_in_kev = cve_id in kev_cves
            vulnerability.kev_last_updated = now
            if entry:
                matched += 1
                vulnerability.nvd_data = {
                    **(vulnerability.nvd_data or {}),
                    "kev": entry,
                }
                required_action = entry.get("requiredAction")
                if required_action and not (vulnerability.mitigation or "").strip():
                    vulnerability.mitigation = required_action
            updated.append(vulnerability)

        cls._bulk_update_vulnerabilities(
            updated,
            ["is_in_kev", "kev_last_updated", "nvd_data", "mitigation"],
        )
        return {
            "feed_entries": len(kev_cves),
            "checked": checked,
            "matched": matched,
            "updated": len(updated),
        }

    @classmethod
    def intel_quality(cls):
        total = Vulnerability.objects.count()
        cvss_present = Vulnerability.objects.filter(cvss_score__isnull=False).count()
        epss_present = Vulnerability.objects.filter(epss_score__isnull=False).count()
        nvd_present = Vulnerability.objects.filter(nvd_data__isnull=False).count()
        kev_checked = Vulnerability.objects.filter(kev_last_updated__isnull=False).count()
        kev_present = Vulnerability.objects.filter(is_in_kev=True).count()
        mitigation_present = Vulnerability.objects.exclude(
            Q(mitigation__isnull=True) | Q(mitigation="")
        ).count()
        missing_enrichment = Vulnerability.objects.filter(
            Q(cvss_score__isnull=True)
            | Q(epss_score__isnull=True)
            | Q(nvd_data__isnull=True)
            | Q(mitigation__isnull=True)
            | Q(mitigation="")
        ).count()
        without_any_enrichment = Vulnerability.objects.filter(
            cvss_score__isnull=True,
            epss_score__isnull=True,
            nvd_data__isnull=True,
            kev_last_updated__isnull=True,
        ).filter(Q(mitigation__isnull=True) | Q(mitigation="")).count()

        statuses = {
            f"{item.provider}:{item.sync_type}": {
                "provider": item.provider,
                "sync_type": item.sync_type,
                "status": item.status,
                "last_run_at": item.last_run_at,
                "last_error": item.last_error,
                "duration_seconds": item.duration_seconds,
            }
            for item in IntegrationSyncStatus.objects.filter(
                provider__in=["epss", "nist", "kev"]
            )
        }
        return {
            "total": total,
            "cvss_present": cvss_present,
            "epss_present": epss_present,
            "nvd_present": nvd_present,
            "kev_checked": kev_checked,
            "kev_present": kev_present,
            "mitigation_present": mitigation_present,
            "missing_cvss": max(total - cvss_present, 0),
            "missing_epss": max(total - epss_present, 0),
            "missing_nvd": max(total - nvd_present, 0),
            "missing_kev_check": max(total - kev_checked, 0),
            "missing_mitigation": max(total - mitigation_present, 0),
            "missing_enrichment": missing_enrichment,
            "without_any_enrichment": without_any_enrichment,
            "sync_statuses": statuses,
            "generated_at": timezone.now(),
        }

    @classmethod
    def serialize_quality_flags(cls, vulnerability):
        has_mitigation = bool((vulnerability.mitigation or "").strip())
        has_nvd = vulnerability.nvd_data is not None
        return {
            "has_cvss": vulnerability.cvss_score is not None,
            "has_epss": vulnerability.epss_score is not None,
            "has_nvd": has_nvd,
            "has_kev_check": vulnerability.kev_last_updated is not None,
            "has_kev": bool(vulnerability.is_in_kev),
            "has_mitigation": has_mitigation,
            "is_fully_enriched": all(
                [
                    vulnerability.cvss_score is not None,
                    vulnerability.epss_score is not None,
                    has_nvd,
                    vulnerability.kev_last_updated is not None,
                    has_mitigation,
                ]
            ),
        }

    @classmethod
    def _config(cls, provider):
        return IntegrationConfig.objects.filter(provider=provider, is_active=True).first()

    @classmethod
    def _start_sync(cls, provider):
        sync, _ = IntegrationSyncStatus.objects.get_or_create(
            provider=provider,
            sync_type=cls.SYNC_TYPE,
        )
        sync.status = "RUNNING"
        sync.last_error = None
        sync.duration_seconds = 0
        sync.save(update_fields=["status", "last_error", "duration_seconds", "last_run_at"])
        return sync

    @classmethod
    def _finish_sync(cls, sync, status, started, error=None):
        sync.status = status
        sync.last_error = error
        sync.duration_seconds = int((timezone.now() - started).total_seconds())
        sync.save(update_fields=["status", "last_error", "duration_seconds", "last_run_at"])

    @classmethod
    def _bulk_update_vulnerabilities(cls, vulnerabilities, fields, chunk_size=500):
        if not vulnerabilities:
            return
        Vulnerability.objects.bulk_update(vulnerabilities, fields, batch_size=chunk_size)

    @classmethod
    def _read_epss_rows(cls, url):
        data = cls._download_bytes(url)
        if url.endswith(".gz") or data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
        text = data.decode("utf-8", errors="replace")
        csv_text = "\n".join(line for line in text.splitlines() if not line.startswith("#"))
        return csv.DictReader(io.StringIO(csv_text))

    @classmethod
    def _download_json(cls, url, headers=None):
        return json.loads(cls._download_bytes(url, headers=headers).decode("utf-8"))

    @classmethod
    def _download_bytes(cls, url, headers=None, timeout=60):
        request = Request(url, headers=headers or {})
        with urlopen(request, timeout=timeout) as response:
            return response.read()

    @classmethod
    def _fetch_nvd_payload(cls, api_url, cve_id, headers=None):
        query = urlencode({"cveId": cve_id})
        separator = "&" if "?" in api_url else "?"
        return cls._download_json(f"{api_url}{separator}{query}", headers=headers)

    @classmethod
    def _first_nvd_cve(cls, payload):
        vulnerabilities = payload.get("vulnerabilities") or []
        if not vulnerabilities:
            return None
        return vulnerabilities[0].get("cve")

    @classmethod
    def _nist_targets(cls, cve_ids=None, limit=50):
        if cve_ids:
            return [cve.upper().strip() for cve in cve_ids if cve]
        queryset = Vulnerability.objects.order_by("nist_last_updated", "cve_id")
        if limit:
            return list(queryset.values_list("cve_id", flat=True)[: int(limit)])
        return list(queryset.values_list("cve_id", flat=True))

    @classmethod
    def _apply_nvd_payload(cls, cve_id, cve_payload):
        vulnerability = Vulnerability.objects.filter(cve_id=cve_id).first()
        if not vulnerability:
            return False
        cvss = cls._extract_cvss(cve_payload)
        description = cls._extract_description(cve_payload)
        published_at = cls._date(cve_payload.get("published"))
        now = timezone.now()

        if cvss["score"] is not None:
            vulnerability.cvss_score = cvss["score"]
        if cvss["severity"]:
            vulnerability.severity = cvss["severity"]
        if cvss["exploitability"] is not None:
            vulnerability.cvss_exploitability_score = cvss["exploitability"]
        if description:
            vulnerability.description = description
        if published_at:
            vulnerability.published_at = published_at
        vulnerability.nist_last_updated = now
        vulnerability.nvd_data = {
            **(vulnerability.nvd_data or {}),
            "nvd": cve_payload,
        }
        vulnerability.save(
            update_fields=[
                "cvss_score",
                "severity",
                "cvss_exploitability_score",
                "description",
                "published_at",
                "nist_last_updated",
                "nvd_data",
            ]
        )
        return True

    @classmethod
    def _extract_cvss(cls, cve_payload):
        metrics = cve_payload.get("metrics") or {}
        for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            items = metrics.get(key) or []
            if not items:
                continue
            item = items[0]
            data = item.get("cvssData") or {}
            score = cls._decimal(data.get("baseScore"))
            severity = data.get("baseSeverity") or item.get("baseSeverity")
            exploitability = cls._decimal(item.get("exploitabilityScore"))
            return {
                "score": score,
                "severity": cls._severity_from_cvss(score, severity),
                "exploitability": exploitability,
            }
        return {"score": None, "severity": None, "exploitability": None}

    @classmethod
    def _extract_description(cls, cve_payload):
        descriptions = cve_payload.get("descriptions") or []
        if not descriptions:
            return ""
        english = next((item for item in descriptions if item.get("lang") == "en"), None)
        return (english or descriptions[0]).get("value") or ""

    @classmethod
    def _severity_from_cvss(cls, score, severity=None):
        if severity:
            normalized = str(severity).title()
            if normalized in {"Low", "Medium", "High", "Critical"}:
                return normalized
        if score is None:
            return None
        value = float(score)
        if value >= 9:
            return "Critical"
        if value >= 7:
            return "High"
        if value >= 4:
            return "Medium"
        return "Low"

    @staticmethod
    def _decimal(value):
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return None

    @staticmethod
    def _date(value):
        if not value:
            return None
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            return None
