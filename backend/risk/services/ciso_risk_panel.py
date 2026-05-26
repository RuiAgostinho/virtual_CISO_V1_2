from decimal import Decimal

from django.db.models import Avg, Count, Max, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from governance.models import GovernanceRiskLink
from governance.services.residual_risk_service import GovernanceResidualRiskService
from risk.models import Asset, AssetClassificationReview, AssetVulnerability, Risk


class CisoRiskPanelService:
    """Builds a CISO risk view from database facts only."""

    ACTIVE_OCCURRENCE_STATUSES = ["Open", "In remediation"]
    ACTIVE_RISK_STATUSES = ["open", "in_progress"]
    HIGH_ASSET_LEVELS = ["Critical", "High"]

    @classmethod
    def dashboard(cls, priority_limit=10):
        generated_at = timezone.now()
        assets = Asset.objects.all()
        active_occurrences = AssetVulnerability.objects.select_related(
            "asset",
            "vulnerability",
        ).filter(status__in=cls.ACTIVE_OCCURRENCE_STATUSES)
        active_risks = Risk.objects.select_related("asset", "vulnerability").filter(
            status__in=cls.ACTIVE_RISK_STATUSES
        )

        critical_exposed_assets = cls._critical_exposed_assets(assets)
        assets_without_classification = cls._assets_without_valid_classification(assets)
        assets_without_owner = cls._assets_without_owner(assets)
        critical_vulnerabilities = active_occurrences.filter(
            asset__criticality__in=cls.HIGH_ASSET_LEVELS
        ).filter(Q(vulnerability__severity="Critical") | Q(vulnerability__cvss_score__gte=9))
        kev_open = active_occurrences.filter(vulnerability__is_in_kev=True)
        without_mitigation = active_occurrences.filter(
            Q(vulnerability__mitigation__isnull=True) | Q(vulnerability__mitigation="")
        )

        risk_scores = cls._risk_scores(active_risks)
        top_priorities = [
            cls._occurrence_payload(occurrence, include_attention_score=True)
            for occurrence in cls._top_attention_occurrences(active_occurrences, priority_limit)
        ]

        return {
            "generated_at": generated_at.isoformat(),
            "metrics": {
                "total_assets": assets.count(),
                "critical_exposed_assets": critical_exposed_assets.count(),
                "assets_without_classification": assets_without_classification.count(),
                "assets_without_owner": assets_without_owner.count(),
                "active_vulnerabilities": active_occurrences.count(),
                "critical_vulnerabilities_on_critical_assets": critical_vulnerabilities.count(),
                "kev_open": kev_open.count(),
                "vulnerabilities_without_mitigation": without_mitigation.count(),
                "open_risks": active_risks.count(),
                "inherent_risk_average": risk_scores["inherent_average"],
                "residual_risk_average": risk_scores["residual_average"],
                "governance_reduction_average": risk_scores["reduction_average"],
            },
            "governance": cls._governance_summary(),
            "lists": {
                "critical_exposed_assets": [cls._asset_payload(asset) for asset in critical_exposed_assets[:10]],
                "assets_without_classification": [cls._asset_payload(asset) for asset in assets_without_classification[:10]],
                "assets_without_owner": [cls._asset_payload(asset) for asset in assets_without_owner[:10]],
                "critical_vulnerabilities_on_critical_assets": [
                    cls._occurrence_payload(occurrence) for occurrence in critical_vulnerabilities[:10]
                ],
                "kev_open": [cls._occurrence_payload(occurrence) for occurrence in kev_open[:10]],
                "vulnerabilities_without_mitigation": [
                    cls._occurrence_payload(occurrence) for occurrence in without_mitigation[:10]
                ],
                "top_prioritized_vulnerabilities": top_priorities,
            },
            "top_risks_by_domain": cls._top_risks_by_domain(active_risks[:500]),
            "temporal_evolution": cls._temporal_evolution(),
        }

    @classmethod
    def _critical_exposed_assets(cls, assets):
        return assets.filter(criticality__in=cls.HIGH_ASSET_LEVELS).filter(
            Q(exposure__gte=4) | Q(exposure_snapshots__exposure_score__gte=4)
        ).distinct()

    @staticmethod
    def _assets_without_owner(assets):
        return assets.filter(
            Q(owner__isnull=True) | Q(owner=""),
            business_owner__isnull=True,
            technical_owner__isnull=True,
        )

    @staticmethod
    def _assets_without_valid_classification(assets):
        return assets.exclude(
            classification_reviews__is_current=True,
            classification_reviews__status=AssetClassificationReview.Status.VALIDATED,
        ).distinct()

    @classmethod
    def _risk_scores(cls, active_risks):
        count = active_risks.count()
        if count == 0:
            return {
                "inherent_average": 0,
                "residual_average": 0,
                "reduction_average": 0,
            }
        inherent = cls._round(active_risks.aggregate(value=Avg("risk_score"))["value"])
        residual_values = []
        reductions = []
        for risk in active_risks[:1000]:
            payload = GovernanceResidualRiskService.risk_impact(risk.id, mode="official")
            if not payload.get("found"):
                continue
            residual_values.append(Decimal(str(payload.get("adjusted_residual_score", 0))))
            reductions.append(Decimal(str(payload.get("governance_reduction_percentage", 0))))
        residual = cls._round(sum(residual_values, Decimal("0")) / Decimal(len(residual_values))) if residual_values else inherent
        reduction = cls._round(sum(reductions, Decimal("0")) / Decimal(len(reductions))) if reductions else 0
        return {
            "inherent_average": inherent,
            "residual_average": residual,
            "reduction_average": reduction,
        }

    @staticmethod
    def _governance_summary():
        approved = GovernanceRiskLink.objects.filter(
            validation_status=GovernanceRiskLink.ValidationStatus.APPROVED
        )
        return {
            "approved_risk_links": approved.count(),
            "assets_with_governance_links": approved.filter(
                target_type=GovernanceRiskLink.TargetType.ASSET
            ).values("target_id").distinct().count(),
            "vulnerabilities_with_governance_links": approved.filter(
                target_type=GovernanceRiskLink.TargetType.VULNERABILITY
            ).values("target_id").distinct().count(),
            "occurrences_with_governance_links": approved.filter(
                target_type=GovernanceRiskLink.TargetType.ASSET_VULNERABILITY
            ).values("target_id").distinct().count(),
            "risks_with_governance_links": approved.filter(
                target_type=GovernanceRiskLink.TargetType.RISK
            ).values("target_id").distinct().count(),
        }

    @classmethod
    def _top_risks_by_domain(cls, risks):
        domains = {}
        for risk in risks:
            links = GovernanceResidualRiskService._links_for_targets(
                GovernanceResidualRiskService._risk_target_keys(risk),
                mode="official",
            )
            for link in links:
                domain = cls._domain_for_source(link)
                if not domain:
                    continue
                entry = domains.setdefault(domain, {"domain": domain, "count": 0, "score_sum": Decimal("0")})
                entry["count"] += 1
                entry["score_sum"] += Decimal(str(risk.risk_score or 0))
        values = []
        for entry in domains.values():
            values.append({
                "domain": entry["domain"],
                "risk_count": entry["count"],
                "average_inherent_score": cls._round(entry["score_sum"] / Decimal(entry["count"])),
            })
        return sorted(values, key=lambda item: item["average_inherent_score"], reverse=True)[:10]

    @staticmethod
    def _domain_for_source(link):
        source = GovernanceResidualRiskService._resolve_source(link.source_type, link.source_id)
        if not source:
            return ""
        if link.source_type == GovernanceRiskLink.SourceType.INTERNAL_CONTROL:
            return source.control_domain or "Sem dominio"
        if link.source_type == GovernanceRiskLink.SourceType.INTERNAL_CONTROL_MECHANISM:
            return source.internal_control.control_domain or "Sem dominio"
        return ""

    @classmethod
    def _temporal_evolution(cls):
        rows = (
            Risk.objects.annotate(month=TruncMonth("updated_at"))
            .values("month")
            .annotate(
                count=Count("id"),
                average_inherent_score=Avg("risk_score"),
                max_score=Max("risk_score"),
            )
            .order_by("month")
        )
        return [
            {
                "month": row["month"].date().isoformat() if row["month"] else None,
                "risk_count": row["count"],
                "average_inherent_score": cls._round(row["average_inherent_score"]),
                "max_score": cls._round(row["max_score"]),
            }
            for row in rows
        ]

    @classmethod
    def _top_attention_occurrences(cls, active_occurrences, limit):
        return active_occurrences.order_by(
            "-vulnerability__is_in_kev",
            "-vulnerability__cvss_score",
            "-vulnerability__epss_score",
            "-asset__exposure",
            "-asset__business_value",
        )[:limit]

    @staticmethod
    def _asset_payload(asset):
        owner = getattr(asset.business_owner, "name", "") or getattr(asset.technical_owner, "name", "") or asset.owner or ""
        return {
            "id": str(asset.id),
            "name": asset.name,
            "criticality": asset.criticality,
            "exposure": asset.exposure,
            "business_value": asset.business_value,
            "dependency_score": asset.dependency_score,
            "owner": owner,
        }

    @classmethod
    def _occurrence_payload(cls, occurrence, include_attention_score=False):
        vulnerability = occurrence.vulnerability
        asset = occurrence.asset
        payload = {
            "id": str(occurrence.id),
            "asset_id": str(asset.id),
            "asset_name": asset.name,
            "asset_criticality": asset.criticality,
            "cve_id": vulnerability.cve_id,
            "vulnerability_id": str(vulnerability.id),
            "severity": vulnerability.severity,
            "cvss_score": float(vulnerability.cvss_score) if vulnerability.cvss_score is not None else None,
            "epss_score": float(vulnerability.epss_score) if vulnerability.epss_score is not None else None,
            "is_in_kev": vulnerability.is_in_kev,
            "status": occurrence.status,
            "last_seen": occurrence.last_seen.isoformat() if occurrence.last_seen else None,
        }
        if include_attention_score:
            cvss = float(vulnerability.cvss_score or 0)
            epss = float(vulnerability.epss_score or 0)
            score = min(
                100,
                (cvss * 6)
                + (epss * 20)
                + (25 if vulnerability.is_in_kev else 0)
                + (10 if asset.criticality in cls.HIGH_ASSET_LEVELS else 0)
                + (float(asset.exposure or 0) * 2),
            )
            reasons = []
            if vulnerability.is_in_kev:
                reasons.append("CISA KEV")
            if cvss >= 9:
                reasons.append("CVSS critico")
            if epss >= 0.5:
                reasons.append("EPSS elevado")
            if asset.criticality in cls.HIGH_ASSET_LEVELS:
                reasons.append("Ativo critico/alto")
            payload["attention_score"] = cls._round(score)
            payload["priority_reason"] = ", ".join(reasons) or "Ordenado por CVSS, EPSS, exposicao e valor do ativo."
        return payload

    @staticmethod
    def _round(value):
        if value is None:
            return 0
        return float(Decimal(str(value)).quantize(Decimal("0.01")))
