import re
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from integrations.models import IntegrationSyncStatus
from risk.models import Asset, AssetVulnerability, Software, Vulnerability
from risk.services.wazuh_service import WazuhService


CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}", re.IGNORECASE)
SEVERITIES = {"Low", "Medium", "High", "Critical"}


def _get_path(data, path, default=None):
    current = data
    for part in path.split("."):
        if not isinstance(current, dict):
            return default
        current = current.get(part)
        if current is None:
            return default
    return current


def _first(data, *paths):
    for path in paths:
        value = _get_path(data, path)
        if value not in (None, "", [], {}):
            return value
    return None


def _extract_cve(raw):
    candidates = [
        _first(raw, "vulnerability.id", "vulnerability.cve", "vulnerability.cve_id"),
        _first(raw, "cve", "cve_id", "id"),
    ]
    if isinstance(raw.get("vulnerability"), str):
        candidates.append(raw["vulnerability"])
    for candidate in candidates:
        if not candidate:
            continue
        match = CVE_RE.search(str(candidate))
        if match:
            return match.group(0).upper()
    return None


def _decimal(value):
    if isinstance(value, dict):
        value = _first(value, "base", "score", "value")
    if value in (None, ""):
        return None
    match = re.search(r"\d+(?:\.\d+)?", str(value))
    if not match:
        return None
    try:
        return Decimal(match.group(0)).quantize(Decimal("0.1"))
    except (InvalidOperation, ValueError):
        return None


def _severity(raw, score):
    value = _first(raw, "vulnerability.severity", "severity")
    if value:
        normalized = str(value).strip().capitalize()
        if normalized in SEVERITIES:
            return normalized
    if score is None:
        return "Medium"
    if score >= Decimal("9.0"):
        return "Critical"
    if score >= Decimal("7.0"):
        return "High"
    if score >= Decimal("4.0"):
        return "Medium"
    return "Low"


def _published_date(raw):
    value = _first(raw, "vulnerability.published_at", "vulnerability.published", "published_at", "published")
    if not value:
        return None
    if hasattr(value, "date"):
        return value.date()
    parsed_dt = parse_datetime(str(value))
    if parsed_dt:
        return parsed_dt.date()
    return parse_date(str(value)[:10])


def _package(raw):
    package = raw.get("package") if isinstance(raw.get("package"), dict) else {}
    vuln_package = _get_path(raw, "vulnerability.package", {}) or {}
    data = {**vuln_package, **package}
    name = data.get("name") or _first(raw, "package_name", "name")
    version = data.get("version") or _first(raw, "package_version", "version")
    architecture = data.get("architecture") or _first(raw, "architecture")
    vendor = data.get("vendor") or _first(raw, "vendor")
    return {
        "name": str(name).strip() if name else "",
        "version": str(version).strip() if version else "",
        "architecture": str(architecture).strip() if architecture else "",
        "vendor": str(vendor).strip() if vendor else "",
    }


def _description(raw, package):
    package_label = f" no pacote {package['name']}" if package["name"] else ""
    return (
        _first(raw, "vulnerability.description", "description")
        or _first(raw, "vulnerability.title", "title")
        or f"Vulnerabilidade detetada pelo Wazuh{package_label}."
    )


def _upsert_vulnerability(raw):
    cve_id = _extract_cve(raw)
    if not cve_id:
        return None
    score = _decimal(_first(raw, "vulnerability.score.base", "vulnerability.cvss3_score", "cvss3_score", "cvss_score", "score"))
    package = _package(raw)
    vulnerability, created = Vulnerability.objects.get_or_create(
        cve_id=cve_id,
        defaults={
            "severity": _severity(raw, score),
            "cvss_score": score,
            "description": _description(raw, package),
            "published_at": _published_date(raw),
            "source": "wazuh",
        },
    )
    update_fields = []
    if score is not None and vulnerability.cvss_score is None:
        vulnerability.cvss_score = score
        update_fields.append("cvss_score")
    if vulnerability.severity == "Medium" and not created:
        severity = _severity(raw, score)
        if severity != vulnerability.severity:
            vulnerability.severity = severity
            update_fields.append("severity")
    if not vulnerability.description:
        vulnerability.description = _description(raw, package)
        update_fields.append("description")
    if not vulnerability.published_at:
        published = _published_date(raw)
        if published:
            vulnerability.published_at = published
            update_fields.append("published_at")
    if not vulnerability.source:
        vulnerability.source = "wazuh"
        update_fields.append("source")
    if update_fields:
        vulnerability.save(update_fields=update_fields)
    return vulnerability


def _upsert_software(asset, package):
    if not package["name"]:
        return None
    software, _created = Software.objects.get_or_create(
        name=package["name"],
        version=package["version"] or None,
        vendor=package["vendor"] or None,
        defaults={
            "architecture": package["architecture"] or None,
            "source": "wazuh",
            "status": "New",
        },
    )
    software.assets.add(asset)
    return software


def _upsert_occurrence(asset, vulnerability, software, package):
    occurrence, created = AssetVulnerability.objects.get_or_create(
        asset=asset,
        vulnerability=vulnerability,
        software=software,
        software_version=package["version"] or "",
        defaults={
            "source": "wazuh",
            "status": "Open",
            "missing_count": 0,
        },
    )
    if not created:
        occurrence.missing_count = 0
        occurrence.last_seen = timezone.now()
        if occurrence.status in {"Resolved", "Mitigated"}:
            occurrence.status = "Open"
            occurrence.resolved_at = None
        occurrence.save(update_fields=["missing_count", "last_seen", "status", "resolved_at"])
    return occurrence, created


class Command(BaseCommand):
    help = "Synchronize Wazuh vulnerability states and link them to assets."

    def add_arguments(self, parser):
        parser.add_argument("--agent-id", help="Synchronize only one Wazuh agent id.")
        parser.add_argument("--missing-threshold", type=int, default=2, help="Scans missing before resolving an occurrence.")

    def handle(self, *args, **options):
        started_at = timezone.now()
        sync, _created = IntegrationSyncStatus.objects.get_or_create(provider="wazuh", sync_type="vulns")
        sync.status = "RUNNING"
        sync.last_error = ""
        sync.save(update_fields=["status", "last_error", "last_run_at"])

        created_count = 0
        updated_count = 0
        skipped_count = 0

        try:
            service = WazuhService()
            assets = Asset.objects.exclude(wazuh_agent_id__isnull=True).exclude(wazuh_agent_id="")
            if options.get("agent_id"):
                assets = assets.filter(wazuh_agent_id=options["agent_id"])

            for asset in assets:
                raw_items = service.get_vulnerabilities(asset.wazuh_agent_id)
                seen_ids = set()
                for raw in raw_items:
                    vulnerability = _upsert_vulnerability(raw)
                    if not vulnerability:
                        skipped_count += 1
                        continue
                    package = _package(raw)
                    software = _upsert_software(asset, package)
                    occurrence, created = _upsert_occurrence(asset, vulnerability, software, package)
                    seen_ids.add(occurrence.id)
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

                stale = AssetVulnerability.objects.filter(asset=asset, source="wazuh").exclude(id__in=seen_ids)
                for occurrence in stale:
                    occurrence.missing_count += 1
                    update_fields = ["missing_count"]
                    if occurrence.missing_count >= options["missing_threshold"] and occurrence.status == "Open":
                        occurrence.status = "Resolved"
                        occurrence.resolved_at = timezone.now()
                        update_fields.extend(["status", "resolved_at"])
                    occurrence.save(update_fields=update_fields)

                asset.last_sync_at = timezone.now()
                asset.save(update_fields=["last_sync_at", "updated_at"])

            sync.status = "SUCCESS"
            sync.duration_seconds = int((timezone.now() - started_at).total_seconds())
            sync.last_error = ""
            sync.save(update_fields=["status", "duration_seconds", "last_error", "last_run_at"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"Wazuh vulnerabilities synchronized: {created_count} created, {updated_count} updated, {skipped_count} skipped."
                )
            )
        except Exception as exc:
            sync.status = "FAILED"
            sync.duration_seconds = int((timezone.now() - started_at).total_seconds())
            sync.last_error = str(exc)
            sync.save(update_fields=["status", "duration_seconds", "last_error", "last_run_at"])
            raise
