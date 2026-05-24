from decimal import Decimal

from django.apps import apps
from django.utils import timezone

from governance.models import (
    GovernanceRiskLink,
    InternalControlMechanism,
)


class GovernanceResidualRiskService:
    """
    Estimates governance impact on residual risk without changing the legacy
    risk engine. The base score remains Risk.risk_score; governance links only
    produce an explainable adjusted projection.
    """

    MODE_STATUSES = {
        "official": [GovernanceRiskLink.ValidationStatus.APPROVED],
        "simulation": [
            GovernanceRiskLink.ValidationStatus.APPROVED,
            GovernanceRiskLink.ValidationStatus.PENDING_REVIEW,
        ],
        "exploratory": [
            GovernanceRiskLink.ValidationStatus.APPROVED,
            GovernanceRiskLink.ValidationStatus.PENDING_REVIEW,
            GovernanceRiskLink.ValidationStatus.DRAFT,
        ],
    }

    IMPLEMENTATION_FACTORS = {
        InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED: Decimal("0.00"),
        InternalControlMechanism.ImplementationStatus.PLANNED: Decimal("0.20"),
        InternalControlMechanism.ImplementationStatus.PARTIALLY_IMPLEMENTED: Decimal("0.40"),
        InternalControlMechanism.ImplementationStatus.IMPLEMENTED: Decimal("0.70"),
        InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED: Decimal("1.00"),
        InternalControlMechanism.ImplementationStatus.NOT_APPLICABLE: Decimal("0.00"),
    }

    @classmethod
    def overview(cls, mode="official"):
        statuses = cls._statuses_for_mode(mode)
        active = GovernanceRiskLink.objects.filter(validation_status__in=statuses)
        return {
            "mode": mode,
            "generated_at": timezone.now().isoformat(),
            "total_links": GovernanceRiskLink.objects.count(),
            "approved": GovernanceRiskLink.objects.filter(
                validation_status=GovernanceRiskLink.ValidationStatus.APPROVED
            ).count(),
            "pending_review": GovernanceRiskLink.objects.filter(
                validation_status=GovernanceRiskLink.ValidationStatus.PENDING_REVIEW
            ).count(),
            "draft": GovernanceRiskLink.objects.filter(
                validation_status=GovernanceRiskLink.ValidationStatus.DRAFT
            ).count(),
            "rejected": GovernanceRiskLink.objects.filter(
                validation_status=GovernanceRiskLink.ValidationStatus.REJECTED
            ).count(),
            "deprecated": GovernanceRiskLink.objects.filter(
                validation_status=GovernanceRiskLink.ValidationStatus.DEPRECATED
            ).count(),
            "active_links": active.count(),
            "targets": cls._count_by(active, "target_type"),
            "sources": cls._count_by(active, "source_type"),
        }

    @classmethod
    def risk_impact(cls, risk_id, mode="official", include_inactive=False):
        Risk = apps.get_model("risk", "Risk")
        risk = Risk.objects.select_related("asset", "vulnerability").filter(id=risk_id).first()
        if not risk:
            return {"found": False, "detail": "Risco nao encontrado."}

        target_keys = cls._risk_target_keys(risk)
        links = cls._links_for_targets(target_keys, mode=mode)
        inactive_links = cls._inactive_links_for_targets(target_keys) if include_inactive else GovernanceRiskLink.objects.none()
        return cls._risk_payload(risk, links, mode=mode, inactive_links=inactive_links)

    @classmethod
    def asset_impact(cls, asset_id, mode="official", include_inactive=False):
        Asset = apps.get_model("risk", "Asset")
        Risk = apps.get_model("risk", "Risk")
        asset = Asset.objects.filter(id=asset_id).first()
        if not asset:
            return {"found": False, "detail": "Ativo nao encontrado."}

        risks = Risk.objects.select_related("asset", "vulnerability").filter(asset=asset)
        risk_results = [cls.risk_impact(risk.id, mode=mode, include_inactive=include_inactive) for risk in risks]
        asset_links = cls._links_for_targets([(GovernanceRiskLink.TargetType.ASSET, str(asset.id))], mode=mode)
        inactive_links = (
            cls._inactive_links_for_targets([(GovernanceRiskLink.TargetType.ASSET, str(asset.id))])
            if include_inactive
            else GovernanceRiskLink.objects.none()
        )
        return {
            "found": True,
            "mode": mode,
            "asset": cls._object_summary(asset),
            "risk_count": len(risk_results),
            "risk_results": risk_results,
            "direct_links": cls._serialize_links(asset_links),
            "inactive_links": cls._serialize_links(inactive_links),
            "aggregate": cls._aggregate_risks(risk_results),
            "generated_at": timezone.now().isoformat(),
        }

    @classmethod
    def vulnerability_impact(cls, vulnerability_id, mode="official", include_inactive=False):
        Vulnerability = apps.get_model("risk", "Vulnerability")
        Risk = apps.get_model("risk", "Risk")
        vulnerability = Vulnerability.objects.filter(id=vulnerability_id).first()
        if not vulnerability:
            return {"found": False, "detail": "Vulnerabilidade nao encontrada."}

        risks = Risk.objects.select_related("asset", "vulnerability").filter(vulnerability=vulnerability)
        risk_results = [cls.risk_impact(risk.id, mode=mode, include_inactive=include_inactive) for risk in risks]
        vuln_links = cls._links_for_targets(
            [(GovernanceRiskLink.TargetType.VULNERABILITY, str(vulnerability.id))],
            mode=mode,
        )
        inactive_links = (
            cls._inactive_links_for_targets([(GovernanceRiskLink.TargetType.VULNERABILITY, str(vulnerability.id))])
            if include_inactive
            else GovernanceRiskLink.objects.none()
        )
        return {
            "found": True,
            "mode": mode,
            "vulnerability": cls._object_summary(vulnerability),
            "risk_count": len(risk_results),
            "risk_results": risk_results,
            "direct_links": cls._serialize_links(vuln_links),
            "inactive_links": cls._serialize_links(inactive_links),
            "aggregate": cls._aggregate_risks(risk_results),
            "generated_at": timezone.now().isoformat(),
        }

    @classmethod
    def source_impact(cls, source_type, source_id, mode="official", include_inactive=False):
        links = cls._links_for_source(source_type, source_id, mode=mode)
        inactive_links = cls._inactive_links_for_source(source_type, source_id) if include_inactive else GovernanceRiskLink.objects.none()
        risks = []
        for link in links:
            risks.extend(cls._risks_impacted_by_link(link))
        unique_risks = {str(risk.id): risk for risk in risks}
        return {
            "found": True,
            "mode": mode,
            "source_type": source_type,
            "source_id": str(source_id),
            "source": cls._source_summary(source_type, source_id),
            "links": cls._serialize_links(links),
            "inactive_links": cls._serialize_links(inactive_links),
            "risk_results": [
                cls.risk_impact(risk.id, mode=mode, include_inactive=include_inactive)
                for risk in unique_risks.values()
            ],
            "generated_at": timezone.now().isoformat(),
        }

    @classmethod
    def _risk_payload(cls, risk, links, mode, inactive_links=None):
        base_score = Decimal(str(risk.risk_score or 0))
        contributions = [cls._link_contribution(link) for link in links]
        reduction = cls._combined_reduction(contributions)
        adjusted = max(Decimal("0"), base_score * (Decimal("1") - (reduction / Decimal("100"))))
        return {
            "found": True,
            "mode": mode,
            "risk": cls._object_summary(risk),
            "asset": cls._object_summary(risk.asset) if risk.asset_id else None,
            "vulnerability": cls._object_summary(risk.vulnerability) if risk.vulnerability_id else None,
            "base_score": cls._round(base_score),
            "governance_reduction_percentage": cls._round(reduction),
            "adjusted_residual_score": cls._round(adjusted),
            "adjusted_level": cls._level_for_score(adjusted),
            "links_used": cls._serialize_links(links, include_contribution=True),
            "inactive_links": cls._serialize_links(inactive_links or GovernanceRiskLink.objects.none()),
            "generated_at": timezone.now().isoformat(),
        }

    @classmethod
    def _risk_target_keys(cls, risk):
        keys = [
            (GovernanceRiskLink.TargetType.RISK, str(risk.id)),
            (GovernanceRiskLink.TargetType.ASSET, str(risk.asset_id)),
        ]
        if risk.vulnerability_id:
            keys.append((GovernanceRiskLink.TargetType.VULNERABILITY, str(risk.vulnerability_id)))
            AssetVulnerability = apps.get_model("risk", "AssetVulnerability")
            occurrences = AssetVulnerability.objects.filter(asset_id=risk.asset_id, vulnerability_id=risk.vulnerability_id)
            keys.extend((GovernanceRiskLink.TargetType.ASSET_VULNERABILITY, str(occurrence.id)) for occurrence in occurrences)
        return keys

    @classmethod
    def _links_for_targets(cls, target_keys, mode="official"):
        query = cls._target_query(target_keys)
        if query is None:
            return GovernanceRiskLink.objects.none()
        return GovernanceRiskLink.objects.filter(query, validation_status__in=cls._statuses_for_mode(mode))

    @classmethod
    def _inactive_links_for_targets(cls, target_keys):
        query = cls._target_query(target_keys)
        if query is None:
            return GovernanceRiskLink.objects.none()
        return GovernanceRiskLink.objects.filter(
            query,
            validation_status__in=[
                GovernanceRiskLink.ValidationStatus.REJECTED,
                GovernanceRiskLink.ValidationStatus.DEPRECATED,
            ],
        )

    @classmethod
    def _links_for_source(cls, source_type, source_id, mode="official"):
        return GovernanceRiskLink.objects.filter(
            source_type=source_type,
            source_id=str(source_id),
            validation_status__in=cls._statuses_for_mode(mode),
        )

    @classmethod
    def _inactive_links_for_source(cls, source_type, source_id):
        return GovernanceRiskLink.objects.filter(
            source_type=source_type,
            source_id=str(source_id),
            validation_status__in=[
                GovernanceRiskLink.ValidationStatus.REJECTED,
                GovernanceRiskLink.ValidationStatus.DEPRECATED,
            ],
        )

    @classmethod
    def _target_query(cls, target_keys):
        from django.db.models import Q

        query = None
        for target_type, target_id in target_keys:
            if not target_id:
                continue
            clause = Q(target_type=target_type, target_id=str(target_id))
            query = clause if query is None else query | clause
        return query

    @classmethod
    def _risks_impacted_by_link(cls, link):
        Risk = apps.get_model("risk", "Risk")
        if link.target_type == GovernanceRiskLink.TargetType.RISK:
            return list(Risk.objects.filter(id=link.target_id))
        if link.target_type == GovernanceRiskLink.TargetType.ASSET:
            return list(Risk.objects.filter(asset_id=link.target_id))
        if link.target_type == GovernanceRiskLink.TargetType.VULNERABILITY:
            return list(Risk.objects.filter(vulnerability_id=link.target_id))
        if link.target_type == GovernanceRiskLink.TargetType.ASSET_VULNERABILITY:
            AssetVulnerability = apps.get_model("risk", "AssetVulnerability")
            occurrence = AssetVulnerability.objects.filter(id=link.target_id).first()
            if occurrence:
                return list(Risk.objects.filter(asset=occurrence.asset, vulnerability=occurrence.vulnerability))
        return []

    @classmethod
    def _link_contribution(cls, link):
        base = Decimal(link.residual_impact_percentage or 0)
        effectiveness = Decimal(link.effectiveness_percentage or 0) / Decimal("100")
        implementation_factor = cls._implementation_factor(link)
        return max(Decimal("0"), min(Decimal("100"), base * effectiveness * implementation_factor))

    @classmethod
    def _implementation_factor(cls, link):
        if link.source_type == GovernanceRiskLink.SourceType.INTERNAL_CONTROL_MECHANISM:
            source = cls._resolve_source(link.source_type, link.source_id)
            if not source:
                return Decimal("0.00")
            return cls.IMPLEMENTATION_FACTORS.get(source.implementation_status, Decimal("0.00"))
        return Decimal("1.00")

    @classmethod
    def _combined_reduction(cls, contributions):
        remaining = Decimal("1.00")
        for contribution in contributions:
            remaining *= Decimal("1.00") - (contribution / Decimal("100"))
        return (Decimal("1.00") - remaining) * Decimal("100")

    @classmethod
    def _statuses_for_mode(cls, mode):
        return cls.MODE_STATUSES.get(mode, cls.MODE_STATUSES["official"])

    @classmethod
    def _serialize_links(cls, links, include_contribution=False):
        items = []
        for link in links:
            item = {
                "id": str(link.id),
                "source_type": link.source_type,
                "source_id": link.source_id,
                "source": cls._source_summary(link.source_type, link.source_id),
                "target_type": link.target_type,
                "target_id": link.target_id,
                "target": cls._target_summary(link.target_type, link.target_id),
                "relationship_type": link.relationship_type,
                "effectiveness_percentage": cls._round(link.effectiveness_percentage),
                "residual_impact_percentage": cls._round(link.residual_impact_percentage),
                "mapping_source": link.mapping_source,
                "validation_status": link.validation_status,
                "confidence_score": cls._round(link.confidence_score),
                "rationale": link.rationale,
            }
            if include_contribution:
                item["effective_reduction_percentage"] = cls._round(cls._link_contribution(link))
                item["implementation_factor"] = cls._round(cls._implementation_factor(link) * Decimal("100"))
            items.append(item)
        return items

    @classmethod
    def _source_summary(cls, source_type, source_id):
        return cls._summary(cls._source_model(source_type), source_id)

    @classmethod
    def _target_summary(cls, target_type, target_id):
        return cls._summary(cls._target_model(target_type), target_id)

    @classmethod
    def _resolve_source(cls, source_type, source_id):
        model = cls._source_model(source_type)
        if not model:
            return None
        return model.objects.filter(id=source_id).first()

    @classmethod
    def _source_model(cls, source_type):
        model_map = {
            GovernanceRiskLink.SourceType.INTERNAL_CONTROL: ("governance", "InternalControl"),
            GovernanceRiskLink.SourceType.MECHANISM: ("governance", "Mechanism"),
            GovernanceRiskLink.SourceType.INTERNAL_CONTROL_MECHANISM: ("governance", "InternalControlMechanism"),
            GovernanceRiskLink.SourceType.POLICY: ("governance", "Policy"),
            GovernanceRiskLink.SourceType.GOVERNANCE_DOCUMENT: ("governance", "GovernanceDocument"),
        }
        ref = model_map.get(source_type)
        return apps.get_model(*ref) if ref else None

    @classmethod
    def _target_model(cls, target_type):
        model_map = {
            GovernanceRiskLink.TargetType.RISK: ("risk", "Risk"),
            GovernanceRiskLink.TargetType.ASSET: ("risk", "Asset"),
            GovernanceRiskLink.TargetType.VULNERABILITY: ("risk", "Vulnerability"),
            GovernanceRiskLink.TargetType.ASSET_VULNERABILITY: ("risk", "AssetVulnerability"),
        }
        ref = model_map.get(target_type)
        return apps.get_model(*ref) if ref else None

    @classmethod
    def _summary(cls, model, object_id):
        if not model or not object_id:
            return None
        obj = model.objects.filter(id=object_id).first()
        if not obj:
            return {"id": str(object_id), "missing": True}
        return cls._object_summary(obj)

    @classmethod
    def _object_summary(cls, obj):
        if obj.__class__.__name__ == "Risk":
            asset_name = getattr(getattr(obj, "asset", None), "name", "")
            vulnerability = getattr(obj, "vulnerability", None)
            vulnerability_label = getattr(vulnerability, "cve_id", "") if vulnerability else "Risco de ativo"
            label = f"{asset_name} - {vulnerability_label}".strip(" -")
            return {
                "id": str(obj.id),
                "code": "",
                "title": label,
                "label": label,
            }
        if obj.__class__.__name__ == "AssetVulnerability":
            asset_name = getattr(getattr(obj, "asset", None), "name", "")
            vulnerability_label = getattr(getattr(obj, "vulnerability", None), "cve_id", "")
            label = f"{vulnerability_label} on {asset_name}".strip()
            return {
                "id": str(obj.id),
                "code": vulnerability_label,
                "title": asset_name,
                "label": label,
            }
        code = getattr(obj, "code", "") or getattr(obj, "cve_id", "")
        title = getattr(obj, "title", "") or getattr(obj, "name", "") or getattr(obj, "cve_id", "")
        fallback = f"{obj.__class__.__name__} {obj.pk}"
        return {
            "id": str(obj.id),
            "code": code,
            "title": title or fallback,
            "label": f"{code} - {title}" if code and title else title or code or fallback,
        }

    @classmethod
    def _aggregate_risks(cls, risk_results):
        assessed = [result for result in risk_results if result.get("found")]
        if not assessed:
            return {
                "base_score_average": 0,
                "adjusted_residual_score_average": 0,
                "risk_count": 0,
            }
        base_avg = sum(Decimal(str(item["base_score"])) for item in assessed) / len(assessed)
        adjusted_avg = sum(Decimal(str(item["adjusted_residual_score"])) for item in assessed) / len(assessed)
        return {
            "base_score_average": cls._round(base_avg),
            "adjusted_residual_score_average": cls._round(adjusted_avg),
            "risk_count": len(assessed),
        }

    @classmethod
    def _count_by(cls, queryset, field_name):
        counts = {}
        for row in queryset.values(field_name):
            key = row[field_name]
            counts[key] = counts.get(key, 0) + 1
        return counts

    @classmethod
    def _level_for_score(cls, score):
        score = Decimal(score)
        if score >= 80:
            return "critical"
        if score >= 60:
            return "high"
        if score >= 40:
            return "medium"
        if score > 0:
            return "low"
        return "very_low"

    @classmethod
    def _round(cls, value):
        return float(Decimal(value or 0).quantize(Decimal("0.01")))
