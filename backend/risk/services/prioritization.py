import logging
from dataclasses import asdict, dataclass, field
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.apps import apps
from django.conf import settings
from django.db.models import QuerySet
from django.utils.timezone import now

from risk.models.asset import Asset
from risk.models.vulnerability import AssetVulnerability, Vulnerability

logger = logging.getLogger(__name__)


DEFAULT_RISK_WEIGHTS = getattr(
    settings,
    "VIRTUAL_CISO_RISK_WEIGHTS",
    {
        "cvss": 0.22,
        "epss": 0.16,
        "kev": 0.12,
        "asset_criticality": 0.14,
        "exposure": 0.10,
        "business_value": 0.08,
        "dependency": 0.06,
        "mechanism_gap": 0.05,
        "evidence_gap": 0.03,
        "regulatory_relevance": 0.02,
        "residual_risk_gap": 0.02,
    },
)

DEFAULT_REMEDIATION_WEIGHTS = getattr(
    settings,
    "VIRTUAL_CISO_REMEDIATION_WEIGHTS",
    {
        "patchability": 0.70,
        "age_urgency": 0.30,
    },
)

PRIORITY_FORMULA_WEIGHTS = getattr(
    settings,
    "VIRTUAL_CISO_PRIORITY_WEIGHTS",
    {
        "risk_ratio": 0.80,
        "remediation_ratio": 0.20,
    },
)

CRITICALITY_SCOREMAP = {
    "critical": 1.0,
    "high": 0.8,
    "medium": 0.5,
    "low": 0.2,
    "very low": 0.1,
}

IMPLEMENTATION_GAP = {
    "not_implemented": 1.0,
    "planned": 0.8,
    "partially_implemented": 0.5,
    "implemented": 0.25,
    "implemented_evidenced": 0.05,
    "not_applicable": 0.0,
}

REGULATORY_KEYWORDS = {
    "nis2": 1.0,
    "dl125": 1.0,
    "qnrc": 0.75,
    "dora": 0.85,
    "iso": 0.55,
    "27001": 0.55,
    "nist": 0.55,
}


@dataclass
class AssetDTO:
    id: str
    name: str
    criticality: str
    exposure_level: str


@dataclass
class RiskBreakdown:
    cvss: float
    epss: float
    asset_criticality: float
    exposure: float
    exploit_availability: float


@dataclass
class RemediationBreakdown:
    patch_actionability: float
    age_urgency_bonus: float


@dataclass
class ContributionFactor:
    code: str
    label: str
    raw_value: str
    normalized_score: float
    weight: float
    contribution: float
    source: str
    explanation: str


@dataclass
class PrioritizedVulnerabilityDTO:
    rank: int
    vulnerability_id: str
    occurrence_id: str
    cve_id: str
    title: str
    severity: str
    asset: AssetDTO
    risk_score: float
    remediation_score: float
    priority_score: float
    risk_breakdown: RiskBreakdown
    remediation_breakdown: RemediationBreakdown
    risk_reasons: List[str]
    remediation_reasons: List[str]
    priority_summary: str
    model_mode: str = "explainable_weighted"
    model_note: str = ""
    contribution_breakdown: List[ContributionFactor] = field(default_factory=list)
    recommended_action: str = ""
    comparison_group: Dict[str, Any] = field(default_factory=dict)
    data_quality: Dict[str, Any] = field(default_factory=dict)
    governance_context: Dict[str, Any] = field(default_factory=dict)
    experimental_model: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)


class VulnerabilityScoringEngine:
    @staticmethod
    def _clamp(value: float, min_val: float, max_val: float) -> float:
        return max(min_val, min(value, max_val))

    @classmethod
    def calculate_scores(
        cls,
        asset_vuln: AssetVulnerability,
        mode: str = "explainable_weighted",
    ) -> Dict[str, Any]:
        vuln = asset_vuln.vulnerability
        asset = asset_vuln.asset

        safe_cvss = cls._clamp(float(vuln.cvss_score) if vuln.cvss_score else 0.0, 0.0, 10.0)
        safe_epss = cls._clamp(float(vuln.epss_score) if vuln.epss_score else 0.0, 0.0, 1.0)
        kev_score = 1.0 if getattr(vuln, "is_in_kev", False) else 0.0

        asset_context = cls._asset_context(asset)
        governance_context = cls._governance_context(asset_vuln)

        factors = [
            cls._factor(
                "cvss",
                "CVSS",
                safe_cvss / 10.0,
                DEFAULT_RISK_WEIGHTS["cvss"],
                f"{safe_cvss:.1f}/10",
                "NVD/scan",
                "Severidade tecnica base.",
            ),
            cls._factor(
                "epss",
                "EPSS",
                safe_epss,
                DEFAULT_RISK_WEIGHTS["epss"],
                f"{int(safe_epss * 100)}%",
                "FIRST EPSS",
                "Probabilidade real estimada de exploracao.",
            ),
            cls._factor(
                "kev",
                "CISA KEV",
                kev_score,
                DEFAULT_RISK_WEIGHTS["kev"],
                "Sim" if kev_score else "Nao",
                "CISA KEV",
                "Exploracao conhecida e ativa.",
            ),
            cls._factor(
                "asset_criticality",
                "Criticidade do ativo",
                CRITICALITY_SCOREMAP.get((asset.criticality or "").lower(), 0.5),
                DEFAULT_RISK_WEIGHTS["asset_criticality"],
                asset.criticality or "Medium",
                f"Ativo {asset.name}",
                "Importancia do ativo para a organizacao.",
            ),
            cls._factor(
                "exposure",
                "Exposicao",
                asset_context["exposure_score"],
                DEFAULT_RISK_WEIGHTS["exposure"],
                asset_context["exposure_label"],
                "Inventario/Nmap",
                "Superficie de ataque do ativo.",
            ),
            cls._factor(
                "business_value",
                "Valor de negocio",
                asset_context["business_value_score"],
                DEFAULT_RISK_WEIGHTS["business_value"],
                f"{asset.business_value}/5",
                "Classificacao do ativo",
                "Impacto no negocio se o ativo for afetado.",
            ),
            cls._factor(
                "dependency",
                "Dependencia",
                asset_context["dependency_score"],
                DEFAULT_RISK_WEIGHTS["dependency"],
                f"{asset.dependency_score}/5",
                "Classificacao do ativo",
                "Dependencia de outros processos/ativos.",
            ),
            cls._factor(
                "mechanism_gap",
                "Estado dos mecanismos",
                governance_context["mechanism_gap"],
                DEFAULT_RISK_WEIGHTS["mechanism_gap"],
                governance_context["mechanism_label"],
                "Governo/Risco",
                "Maturidade dos mecanismos mitigadores ligados ao risco.",
            ),
            cls._factor(
                "evidence_gap",
                "Evidencia valida",
                governance_context["evidence_gap"],
                DEFAULT_RISK_WEIGHTS["evidence_gap"],
                governance_context["evidence_label"],
                "EvidenceLink",
                "Ausencia de evidencia valida aumenta a prioridade.",
            ),
            cls._factor(
                "regulatory_relevance",
                "Relevancia normativa",
                governance_context["regulatory_relevance"],
                DEFAULT_RISK_WEIGHTS["regulatory_relevance"],
                governance_context["regulatory_label"],
                "Framework mappings",
                "Peso normativo, com NIS2/DL125 acima de ISO/NIST.",
            ),
            cls._factor(
                "residual_risk_gap",
                "Risco residual",
                governance_context["residual_gap"],
                DEFAULT_RISK_WEIGHTS["residual_risk_gap"],
                governance_context["residual_label"],
                "GovernanceRiskLink",
                "Quanto menor a mitigacao validada, maior a prioridade.",
            ),
        ]
        risk_score = round(cls._clamp(sum(f["contribution"] for f in factors), 0.0, 100.0), 2)

        risk_bd = {
            "cvss": cls._contribution(factors, "cvss"),
            "epss": cls._contribution(factors, "epss"),
            "asset_criticality": cls._contribution(factors, "asset_criticality"),
            "exposure": cls._contribution(factors, "exposure"),
            "exploit_availability": cls._contribution(factors, "kev"),
        }

        has_mitigation = bool(vuln.mitigation and len(vuln.mitigation.strip()) > 5)
        patch_comp = (DEFAULT_REMEDIATION_WEIGHTS["patchability"] * 100) if has_mitigation else 0.0

        age_bonus = 0.0
        if getattr(asset_vuln, "first_detected", None):
            delta_days = max(0, (now() - asset_vuln.first_detected).days)
            age_factor = min(30.0, delta_days) / 30.0
            age_bonus = age_factor * (DEFAULT_REMEDIATION_WEIGHTS["age_urgency"] * 100)

        remediation_bd = {
            "patch_actionability": round(patch_comp, 2),
            "age_urgency_bonus": round(age_bonus, 2),
        }
        remediation_score = round(cls._clamp(sum(remediation_bd.values()), 0.0, 100.0), 2)

        priority_score = (
            (risk_score * PRIORITY_FORMULA_WEIGHTS["risk_ratio"])
            + (remediation_score * PRIORITY_FORMULA_WEIGHTS["remediation_ratio"])
        )
        priority_score = round(cls._clamp(priority_score, 0.0, 100.0), 2)

        risk_reasons = cls._risk_reasons(
            safe_cvss,
            safe_epss,
            kev_score,
            asset,
            asset_context,
            governance_context,
        )
        remediation_reasons = cls._remediation_reasons(
            patch_comp,
            age_bonus,
            governance_context,
        )
        priority_summary = (
            f"Prioridade baseada em {'ameaca severa' if risk_score > 70 else 'risco moderado'} "
            f"com {'remediacao acionavel' if remediation_score > 50 else 'mitigacao ainda pouco definida'}."
        )

        return {
            "risk_score": risk_score,
            "remediation_score": remediation_score,
            "priority_score": priority_score,
            "risk_breakdown": risk_bd,
            "remediation_breakdown": remediation_bd,
            "risk_reasons": risk_reasons,
            "remediation_reasons": remediation_reasons,
            "priority_summary": priority_summary,
            "derived_exposure": asset_context["exposure_label"],
            "contribution_breakdown": factors,
            "recommended_action": cls._recommended_action(
                vuln,
                asset,
                safe_cvss,
                safe_epss,
                kev_score,
                governance_context,
            ),
            "model_mode": "xgboost_experimental" if mode == "xgboost_experimental" else "explainable_weighted",
            "model_note": cls._model_note(mode),
            "data_quality": cls._data_quality(vuln, governance_context),
            "governance_context": governance_context,
            "experimental_model": cls._experimental_model_note(mode),
        }

    @classmethod
    def _factor(cls, code, label, normalized, weight, raw_value, source, explanation):
        normalized_score = round(cls._clamp(float(normalized), 0.0, 1.0) * 100, 2)
        return {
            "code": code,
            "label": label,
            "raw_value": str(raw_value),
            "normalized_score": normalized_score,
            "weight": weight,
            "contribution": round(normalized_score * weight, 2),
            "source": source,
            "explanation": explanation,
        }

    @staticmethod
    def _contribution(factors, code):
        return round(next(f["contribution"] for f in factors if f["code"] == code), 2)

    @staticmethod
    def _asset_context(asset: Asset) -> Dict[str, Any]:
        exposure_value = int(asset.exposure or 3)
        exposure_score = max(0.0, min(1.0, exposure_value / 5.0))
        return {
            "exposure_score": exposure_score,
            "exposure_label": f"{exposure_value}/5",
            "business_value_score": max(0.0, min(1.0, float(asset.business_value or 3) / 5.0)),
            "dependency_score": max(0.0, min(1.0, float(asset.dependency_score or 3) / 5.0)),
        }

    @classmethod
    def _governance_context(cls, asset_vuln: AssetVulnerability) -> Dict[str, Any]:
        vuln = asset_vuln.vulnerability
        asset = asset_vuln.asset
        target_types = ["asset_vulnerability", "vulnerability", "asset"]
        target_ids = [str(asset_vuln.id), str(vuln.id), str(asset.id)]

        GovernanceRiskLink = apps.get_model("governance", "GovernanceRiskLink")
        EvidenceLink = apps.get_model("governance", "EvidenceLink")
        InternalControl = apps.get_model("governance", "InternalControl")
        InternalControlMechanism = apps.get_model("governance", "InternalControlMechanism")
        InternalControlFrameworkMapping = apps.get_model("governance", "InternalControlFrameworkMapping")

        risk_links = GovernanceRiskLink.objects.filter(
            target_type__in=target_types,
            target_id__in=target_ids,
        ).exclude(validation_status__in=["rejected", "deprecated"])
        approved_links = risk_links.filter(validation_status="approved")

        source_control_ids = [
            link.source_id
            for link in approved_links
            if link.source_type == "internal_control"
        ]
        source_icm_ids = [
            link.source_id
            for link in approved_links
            if link.source_type == "internal_control_mechanism"
        ]
        if source_icm_ids:
            source_control_ids += list(
                InternalControlMechanism.objects.filter(id__in=source_icm_ids).values_list(
                    "internal_control_id",
                    flat=True,
                )
            )
        controls = InternalControl.objects.filter(id__in=source_control_ids)
        controls = controls.distinct()

        mechanisms = InternalControlMechanism.objects.filter(
            internal_control__in=controls
        ).exclude(validation_status__in=["rejected", "deprecated"])
        official_mechanisms = mechanisms.filter(validation_status="approved")
        statuses = list(official_mechanisms.values_list("implementation_status", flat=True))
        if statuses:
            mechanism_gap = sum(IMPLEMENTATION_GAP.get(status, 0.6) for status in statuses) / len(statuses)
            mechanism_label = f"{len(statuses)} mecanismo(s)"
        elif approved_links.exists():
            mechanism_gap = 0.6
            mechanism_label = "Sem mecanismos aprovados"
        else:
            mechanism_gap = 0.75
            mechanism_label = "Sem mitigacao mapeada"

        evidence_links = EvidenceLink.objects.filter(
            target_type__in=target_types,
            target_id__in=target_ids,
        ).exclude(validation_status__in=["rejected", "deprecated"]).select_related("evidence_item")
        valid_evidence = [
            link
            for link in evidence_links
            if link.validation_status == "approved" and getattr(link.evidence_item, "is_score_eligible", False)
        ]
        mechanism_ids = list(official_mechanisms.values_list("mechanism_id", flat=True))
        mechanism_evidence_links = EvidenceLink.objects.filter(
            target_type="mechanism",
            target_id__in=mechanism_ids,
        ).exclude(validation_status__in=["rejected", "deprecated"]).select_related("evidence_item")
        valid_mechanism_evidence = [
            link
            for link in mechanism_evidence_links
            if link.validation_status == "approved" and getattr(link.evidence_item, "is_score_eligible", False)
        ]
        valid_evidence.extend(valid_mechanism_evidence)
        evidence_gap = 0.0 if valid_evidence else 1.0
        evidence_label = f"{len(valid_evidence)} evidencia(s) valida(s)" if valid_evidence else "Sem evidencia valida"
        evidence_items = []
        seen_evidence_ids = set()
        for link in valid_evidence:
            evidence = link.evidence_item
            if not evidence or evidence.id in seen_evidence_ids:
                continue
            seen_evidence_ids.add(evidence.id)
            evidence_items.append(
                {
                    "id": str(evidence.id),
                    "title": evidence.title,
                    "type": evidence.evidence_type,
                    "status": evidence.status,
                    "confidence_level": float(evidence.confidence_level or 0),
                    "valid_until": evidence.valid_until.isoformat() if evidence.valid_until else None,
                }
            )

        framework_values = list(vuln.controls.values_list("framework__code", flat=True))
        framework_values += list(vuln.controls.values_list("framework__name", flat=True))
        framework_values += list(asset.controls.values_list("framework__code", flat=True))
        framework_values += list(asset.controls.values_list("framework__name", flat=True))
        if controls.exists():
            mappings = InternalControlFrameworkMapping.objects.filter(
                internal_control__in=controls,
                validation_status="approved",
            ).select_related("framework_control__framework")
            framework_values += list(mappings.values_list("framework_control__framework__code", flat=True))
            framework_values += list(mappings.values_list("framework_control__framework__name", flat=True))
            framework_items = [
                {
                    "framework": mapping.framework_control.framework.code,
                    "framework_name": mapping.framework_control.framework.name,
                    "control_code": mapping.framework_control.code,
                    "control_title": mapping.framework_control.title,
                    "coverage_percentage": float(mapping.coverage_percentage or 0),
                    "relationship_type": mapping.relationship_type,
                }
                for mapping in mappings[:10]
            ]
        else:
            framework_items = []
        regulatory_relevance, regulatory_label = cls._regulatory_relevance(framework_values)

        residual_reduction = 0.0
        if approved_links.exists():
            from governance.services.residual_risk_service import GovernanceResidualRiskService

            residual_reduction = float(
                GovernanceResidualRiskService._combined_reduction(
                    [GovernanceResidualRiskService._link_contribution(link) for link in approved_links]
                )
            )
        residual_gap = max(0.0, min(1.0, 1.0 - (residual_reduction / 100.0)))

        return {
            "governance_links": risk_links.count(),
            "approved_governance_links": approved_links.count(),
            "internal_controls": controls.count(),
            "internal_control_items": [
                {
                    "id": str(control.id),
                    "code": control.code,
                    "title": control.title,
                    "domain": control.control_domain,
                    "criticality": control.criticality,
                }
                for control in controls[:10]
            ],
            "mechanisms": official_mechanisms.count(),
            "mechanism_items": [
                {
                    "id": str(link.mechanism_id),
                    "title": link.mechanism.title,
                    "relationship_type": link.relationship_type,
                    "implementation_status": link.implementation_status,
                    "mandatory": link.mandatory,
                    "contribution_weight": float(link.contribution_weight or 0),
                }
                for link in official_mechanisms.select_related("mechanism")[:10]
            ],
            "mechanism_gap": round(mechanism_gap, 3),
            "mechanism_label": mechanism_label,
            "valid_evidence": len(valid_evidence),
            "evidence_items": evidence_items[:10],
            "evidence_gap": evidence_gap,
            "evidence_label": evidence_label,
            "regulatory_relevance": regulatory_relevance,
            "regulatory_label": regulatory_label,
            "framework_items": framework_items,
            "residual_reduction": residual_reduction,
            "residual_gap": residual_gap,
            "residual_label": f"{round(residual_reduction)}% mitigacao validada" if residual_reduction else "Sem mitigacao residual validada",
            "missing_controls": controls.count() == 0,
            "missing_mechanisms": controls.exists() and official_mechanisms.count() == 0,
            "missing_evidence": len(valid_evidence) == 0,
        }

    @staticmethod
    def _regulatory_relevance(values):
        score = 0.3
        labels = set()
        for value in values:
            text = str(value or "").lower().replace(" ", "")
            if not text:
                continue
            labels.add(str(value))
            for keyword, weight in REGULATORY_KEYWORDS.items():
                if keyword in text:
                    score = max(score, weight)
        return score, ", ".join(sorted(labels)[:4]) if labels else "Sem framework relevante"

    @staticmethod
    def _risk_reasons(safe_cvss, safe_epss, kev_score, asset, asset_context, governance_context):
        reasons = []
        if safe_cvss >= 9:
            reasons.append("CVSS critico")
        if CRITICALITY_SCOREMAP.get((asset.criticality or "").lower(), 0.5) >= 0.8:
            reasons.append("Afeta ativo critico ou alto")
        if kev_score:
            reasons.append("CISA KEV: exploit conhecido ativo")
        if safe_epss > 0.60:
            reasons.append(f"Alta probabilidade EPSS ({int(safe_epss * 100)}%)")
        if asset_context["exposure_score"] >= 0.75:
            reasons.append("Superficie exposta")
        if governance_context["regulatory_relevance"] >= 0.85:
            reasons.append("Relevancia normativa elevada")
        if governance_context["residual_gap"] >= 0.75:
            reasons.append("Mitigacao residual fraca")
        return reasons or ["Vulnerabilidade de risco basal"]

    @staticmethod
    def _remediation_reasons(patch_comp, age_bonus, governance_context):
        reasons = []
        if patch_comp > 0:
            reasons.append("Mitigacao detalhada/Patch disponivel")
        if governance_context["valid_evidence"] > 0:
            reasons.append("Existe evidencia validada relevante")
        if age_bonus > 15:
            reasons.append("Vulnerabilidade aberta ha mais de 15 dias")
        return reasons or ["Mitigacao complexa/Sem patch obvio registado"]

    @staticmethod
    def _data_quality(vuln: Vulnerability, governance_context: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "has_cvss": vuln.cvss_score is not None,
            "has_epss": vuln.epss_score is not None,
            "has_kev_check": vuln.kev_last_updated is not None,
            "has_nvd": vuln.nvd_data is not None,
            "has_mitigation": bool((vuln.mitigation or "").strip()),
            "has_valid_evidence": governance_context["valid_evidence"] > 0,
        }

    @staticmethod
    def _recommended_action(vuln, asset, safe_cvss, safe_epss, kev_score, governance_context):
        if kev_score or safe_epss >= 0.6 or safe_cvss >= 9:
            prefix = "Remediar imediatamente"
        elif governance_context["regulatory_relevance"] >= 0.85:
            prefix = "Priorizar por obrigacao normativa"
        elif governance_context["evidence_gap"] >= 1:
            prefix = "Validar mitigacao e recolher evidencia"
        else:
            prefix = "Planear remediacao controlada"
        if (vuln.mitigation or "").strip():
            return f"{prefix}: aplicar/validar mitigacao registada para {vuln.cve_id} no ativo {asset.name}."
        return f"{prefix}: investigar correcao para {vuln.cve_id}, definir owner, prazo e evidencia de fecho."

    @staticmethod
    def _model_note(mode):
        if mode == "xgboost_experimental":
            return (
                "Modo experimental: sem dataset historico suficiente, o sistema mantem o score ponderado "
                "explicavel e usa EPSS como sinal preditivo externo. XGBoost/SHAP fica preparado como evolucao."
            )
        return "Modelo oficial explainable_weighted: score multidimensional ponderado, auditavel e rastreavel."

    @staticmethod
    def _experimental_model_note(mode):
        if mode != "xgboost_experimental":
            return {}
        return {
            "enabled": False,
            "reason": "Sem historico real suficiente de exploracao, remediacao e decisao para treinar XGBoost de forma defendivel.",
            "current_ml_signal": "EPSS",
            "future_extension": "Substituir ou complementar contribuicoes por XGBoost + SHAP quando existir dataset historico.",
        }


class VulnerabilityPrioritizationService:
    DEFAULT_CANDIDATE_LIMIT = 120

    @classmethod
    def get_top_vulnerabilities(
        cls,
        limit: int = 5,
        filters: Optional[dict] = None,
        mode: str = "explainable_weighted",
    ) -> List[PrioritizedVulnerabilityDTO]:
        logger.info("Applying Vulnerability Risk Prioritization [Limit: %s, Mode: %s]", limit, mode)
        qs = AssetVulnerability.objects.select_related("asset", "vulnerability")

        if not filters or "status" not in filters:
            qs = qs.filter(status__iexact="open")

        qs = cls._apply_filters(qs, filters)
        qs = cls._order_for_candidate_selection(qs)
        candidate_limit = cls._candidate_limit(limit, filters)
        occurrences = list(qs[:candidate_limit])
        if not occurrences:
            return []

        scored_candidates = []
        for asset_vuln in occurrences:
            try:
                score_data = VulnerabilityScoringEngine.calculate_scores(asset_vuln, mode=mode)
                scored_candidates.append((asset_vuln, score_data))
            except Exception as exc:
                logger.error("[PRIORITIZATION_ENGINE] Skipped AssetVulnerability %s: %s", asset_vuln.id, exc)
                continue

        scored_candidates.sort(key=lambda item: item[1]["priority_score"], reverse=True)
        return cls._build_dto_array(scored_candidates, limit)

    @classmethod
    def _candidate_limit(cls, limit: int, filters: Optional[dict]) -> int:
        requested = (filters or {}).get("candidate_limit")
        if requested:
            try:
                return max(limit, min(int(requested), 1000))
            except (TypeError, ValueError):
                pass
        return max(limit * 15, cls.DEFAULT_CANDIDATE_LIMIT)

    @staticmethod
    def _order_for_candidate_selection(qs: QuerySet) -> QuerySet:
        # First pass is deliberately cheap and DB-side. Full governance scoring is
        # then applied only to the strongest candidates, otherwise the frontend
        # blocks while scoring thousands of occurrences one by one.
        return qs.order_by(
            "-vulnerability__is_in_kev",
            "-vulnerability__cvss_score",
            "-vulnerability__epss_score",
            "-asset__exposure",
            "-asset__business_value",
            "-asset__dependency_score",
            "first_detected",
        )

    @classmethod
    def _apply_filters(cls, qs: QuerySet, filters: Optional[dict]) -> QuerySet:
        if not filters:
            return qs

        if occurrence_id := filters.get("occurrence_id"):
            qs = qs.filter(id=occurrence_id)
        if asset_id := filters.get("asset_id"):
            qs = qs.filter(asset_id=asset_id)
        if crit := filters.get("asset_criticality"):
            qs = qs.filter(asset__criticality__iexact=crit)
        if severity := filters.get("severity"):
            qs = qs.filter(vulnerability__severity__iexact=severity)
        if status := filters.get("status"):
            qs = qs.filter(status__iexact=status)
        if source := filters.get("source"):
            qs = qs.filter(source__iexact=source)
        if filters.get("only_known_exploited"):
            qs = qs.filter(vulnerability__is_in_kev=True)
        if detected_since_days := filters.get("detected_since_days"):
            try:
                days = max(1, int(detected_since_days))
            except (TypeError, ValueError):
                days = 7
            qs = qs.filter(first_detected__gte=now() - timedelta(days=days))

        return qs

    @classmethod
    def _build_dto_array(cls, scored_candidates: list, limit: int) -> List[PrioritizedVulnerabilityDTO]:
        results = []
        for rank, (asset_vuln, score_data) in enumerate(scored_candidates[:limit], start=1):
            vuln = asset_vuln.vulnerability
            asset = asset_vuln.asset

            dto = PrioritizedVulnerabilityDTO(
                rank=rank,
                vulnerability_id=str(vuln.id),
                occurrence_id=str(asset_vuln.id),
                cve_id=getattr(vuln, "cve_id", None) or "Undisclosed CVE",
                title=getattr(vuln, "title", None) or "Vulnerability descriptor missing",
                severity=getattr(vuln, "severity", None) or "unknown",
                asset=AssetDTO(
                    id=str(asset.id),
                    name=asset.name or "Unnamed",
                    criticality=asset.criticality or "unknown",
                    exposure_level=score_data.get("derived_exposure", "unknown"),
                ),
                risk_score=score_data["risk_score"],
                remediation_score=score_data["remediation_score"],
                priority_score=score_data["priority_score"],
                risk_breakdown=RiskBreakdown(**score_data["risk_breakdown"]),
                remediation_breakdown=RemediationBreakdown(**score_data["remediation_breakdown"]),
                risk_reasons=score_data["risk_reasons"],
                remediation_reasons=score_data["remediation_reasons"],
                priority_summary=score_data["priority_summary"],
                model_mode=score_data.get("model_mode", "explainable_weighted"),
                model_note=score_data.get("model_note", ""),
                contribution_breakdown=[
                    ContributionFactor(**factor) for factor in score_data.get("contribution_breakdown", [])
                ],
                recommended_action=score_data.get("recommended_action", ""),
                comparison_group=cls._comparison_group(asset_vuln, scored_candidates),
                data_quality=score_data.get("data_quality", {}),
                governance_context=score_data.get("governance_context", {}),
                experimental_model=score_data.get("experimental_model", {}),
            )
            results.append(dto)
        return results

    @classmethod
    def _comparison_group(cls, asset_vuln, scored_candidates):
        vuln = asset_vuln.vulnerability
        if vuln.cvss_score is None:
            return {"enabled": False, "reason": "Sem CVSS para comparacao."}

        same_cvss = [
            (candidate, score)
            for candidate, score in scored_candidates
            if candidate.vulnerability.cvss_score == vuln.cvss_score
        ]
        if len(same_cvss) <= 1:
            return {"enabled": False, "reason": "Nao existem outras vulnerabilidades abertas com CVSS igual."}

        ordered = sorted(same_cvss, key=lambda item: item[1]["priority_score"], reverse=True)
        position = next(
            (index + 1 for index, (candidate, _) in enumerate(ordered) if candidate.id == asset_vuln.id),
            None,
        )
        top_candidate, top_score = ordered[0]
        return {
            "enabled": True,
            "cvss_score": float(vuln.cvss_score),
            "same_cvss_count": len(same_cvss),
            "position_in_same_cvss": position,
            "top_same_cvss": {
                "cve_id": top_candidate.vulnerability.cve_id,
                "asset_name": top_candidate.asset.name,
                "priority_score": top_score["priority_score"],
            },
            "explanation": (
                "Com CVSS igual, a ordem muda por EPSS, KEV, criticidade, exposicao, "
                "evidencia, mecanismos e relevancia normativa."
            ),
        }


class VulnerabilityContextBuilder:
    @staticmethod
    def build_llm_context(dtos: List[PrioritizedVulnerabilityDTO]) -> str:
        if not dtos:
            return "Nenhuma vulnerabilidade critica detetada."

        context_lines = [
            "### DADOS DETERMINISTICOS - PRIORIZACAO DE VULNERABILIDADES ###",
            "Modelo oficial: explainable_weighted. EPSS e usado como sinal preditivo externo.",
            "",
        ]

        for dto in dtos:
            factors = ", ".join(
                f"{factor.label}: {factor.contribution}"
                for factor in sorted(dto.contribution_breakdown, key=lambda item: item.contribution, reverse=True)[:5]
            )
            governance = dto.governance_context or {}
            controls = governance.get("internal_control_items") or []
            mechanisms = governance.get("mechanism_items") or []
            evidences = governance.get("evidence_items") or []
            frameworks = governance.get("framework_items") or []
            controls_text = "; ".join(
                f"{item.get('code')} - {item.get('title')}" for item in controls[:4]
            ) or "Sem controlos internos aprovados ligados a esta ocorrencia/ativo/vulnerabilidade"
            mechanisms_text = "; ".join(
                f"{item.get('title')} ({item.get('implementation_status')})" for item in mechanisms[:4]
            ) or "Sem mecanismos aprovados ligados"
            evidences_text = "; ".join(
                f"{item.get('title')} ({item.get('status')})" for item in evidences[:4]
            ) or "Sem evidencias reais validas"
            frameworks_text = "; ".join(
                f"{item.get('framework')}:{item.get('control_code')} ({item.get('coverage_percentage')}%)"
                for item in frameworks[:4]
            ) or "Sem mapeamento normativo aprovado"
            context_lines.append(
                f"Rank #{dto.rank} | {dto.cve_id}\n"
                f"   - Prioridade: {dto.priority_score}/100 | Risco: {dto.risk_score}/100 | Remediacao: {dto.remediation_score}/100\n"
                f"   - Ativo: {dto.asset.name} (criticidade: {dto.asset.criticality}, exposicao: {dto.asset.exposure_level})\n"
                f"   - Principais contribuicoes: {factors}\n"
                f"   - Razoes: {', '.join(dto.risk_reasons + dto.remediation_reasons)}\n"
                f"   - Controlos internos: {controls_text}\n"
                f"   - Mecanismos: {mechanisms_text}\n"
                f"   - Evidencias: {evidences_text}\n"
                f"   - Frameworks/rastreabilidade: {frameworks_text}\n"
                f"   - Acao recomendada: {dto.recommended_action}\n"
            )

        context_lines.append("### FIM DA INFORMACAO PRIORIZADA ###")
        return "\n".join(context_lines)

    @staticmethod
    def build_sources(dtos: List[PrioritizedVulnerabilityDTO]) -> List[dict]:
        sources = []
        for dto in dtos:
            governance = dto.governance_context or {}
            controls = governance.get("internal_control_items") or []
            mechanisms = governance.get("mechanism_items") or []
            evidences = governance.get("evidence_items") or []
            frameworks = governance.get("framework_items") or []
            framework_refs = [
                f"{item.get('framework')}:{item.get('control_code')}"
                for item in frameworks
            ]
            content = (
                f"Rank #{dto.rank}; prioridade {dto.priority_score}/100; risco {dto.risk_score}/100. "
                f"Ativo {dto.asset.name} ({dto.asset.criticality}, exposicao {dto.asset.exposure_level}). "
                f"Razoes: {', '.join(dto.risk_reasons + dto.remediation_reasons)}. "
                f"Controlos internos: {', '.join(item.get('code', '') for item in controls) or 'sem controlos aprovados'}. "
                f"Mecanismos: {', '.join(item.get('title', '') for item in mechanisms) or 'sem mecanismos aprovados'}. "
                f"Evidencias: {', '.join(item.get('title', '') for item in evidences) or 'sem evidencias validas'}. "
                f"Frameworks: {', '.join(framework_refs) or 'sem framework aprovado'}."
            )
            sources.append(
                {
                    "title": f"Rank #{dto.rank}: {dto.cve_id} em {dto.asset.name}",
                    "source_type": "vulnerability_prioritization",
                    "source_ref": f"occurrence:{dto.occurrence_id}; asset:{dto.asset.id}; vulnerability:{dto.vulnerability_id}",
                    "content": content,
                    "score": dto.priority_score,
                    "url": f"/risks/prioritization?occurrence={dto.occurrence_id}",
                }
            )
        return sources
