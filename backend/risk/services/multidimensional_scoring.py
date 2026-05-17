"""
Multidimensional priority score engine — Cap. 4.9 of the dissertation.

Computes the 8-dimension score for an AssetVulnerability occurrence by combining
technical risk, asset criticality, exposure, compliance state, mechanism maturity,
evidence availability, open findings/gaps and regulatory relevance.

This module is additive: it does not modify or replace the existing
`RiskEngineService` (risk/services/risk_engine.py) or `VulnerabilityScoringEngine`
(risk/services/prioritization.py). The new engine is intended to feed the
"Decision screen" described in the application mockup and the multidimensional
priority panel.

Weights are read from settings.VIRTUAL_CISO_MULTIDIM_WEIGHTS and can be tuned
without code changes. Per Cap. 4.9.3, the scoring formula is parameterizable.
"""

from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.utils.timezone import now

from governance.models.assessment import ControlAssessment, Evidence, Finding
from governance.models.compliance_gap import ComplianceGap
from governance.models.mechanism import ControlMechanism
from risk.models.asset import Asset
from risk.models.vulnerability import AssetVulnerability, Vulnerability


# ============================================================================
# CONFIGURATION
# ============================================================================

DEFAULT_DIMENSION_WEIGHTS: Dict[str, float] = getattr(
    settings,
    "VIRTUAL_CISO_MULTIDIM_WEIGHTS",
    {
        "technical_risk": 0.30,
        "asset_criticality": 0.20,
        "exposure": 0.10,
        "compliance_state": 0.10,
        "mechanism_maturity": 0.10,
        "evidence_availability": 0.05,
        "open_findings": 0.10,
        "regulatory_relevance": 0.05,
    },
)

# Maps Asset.CRITICALITY_CHOICES to a 0-100 priority score (higher = more urgent).
CRITICALITY_TO_SCORE: Dict[str, float] = {
    "Critical": 100.0,
    "High": 80.0,
    "Medium": 60.0,
    "Low": 30.0,
    "Very Low": 10.0,
}

# Maps Asset.exposure (SmallIntegerField 1..5) to a 0-100 priority score.
EXPOSURE_SMALLINT_TO_SCORE: Dict[int, float] = {
    1: 10.0,
    2: 30.0,
    3: 50.0,
    4: 75.0,
    5: 95.0,
}

EXPOSURE_SMALLINT_LABEL: Dict[int, str] = {
    1: "Muito Baixo",
    2: "Baixo",
    3: "Médio",
    4: "Alto",
    5: "Crítico",
}

# Maps ControlAssessment.implementation_status to a gap score (higher = larger gap).
ASSESSMENT_STATUS_GAP: Dict[str, float] = {
    "not_started": 100.0,
    "planned": 80.0,
    "partial": 50.0,
    "implemented": 20.0,
    "optimized": 5.0,
}

# Maps ControlMechanism.ImplementationStatus to a gap score (higher = larger gap).
MECHANISM_STATUS_GAP: Dict[str, float] = {
    "Não iniciado": 100.0,
    "Em implementação": 50.0,
    "Implementado": 10.0,
}

# Maps ComplianceGap.status to a gap score (higher = larger gap).
COMPLIANCE_GAP_STATUS_SCORE: Dict[str, float] = {
    "MISSING": 100.0,
    "PARTIAL": 50.0,
    "IMPLEMENTED": 0.0,
}

# Severity weight applied per open Finding (sum, capped at 100).
FINDING_SEVERITY_WEIGHT: Dict[str, float] = {
    "critical": 30.0,
    "high": 20.0,
    "medium": 10.0,
    "low": 5.0,
}

# Regulatory weight per framework. NIS2 and equivalents carry legal obligation,
# so they dominate ISO/NIST when both apply to the same occurrence.
FRAMEWORK_REGULATORY_WEIGHT: Dict[str, float] = getattr(
    settings,
    "VIRTUAL_CISO_FRAMEWORK_WEIGHT",
    {
        "NIS2": 100.0,
        "DL125": 100.0,
        "QNRC": 75.0,
        "ISO27001": 50.0,
        "NISTCSF": 50.0,
    },
)

# Classification bands (Tabela 21, Cap. 4.9.5).
CLASSIFICATION_BANDS = [
    (81.0, 100.0, "Crítica", "Intervenção imediata"),
    (61.0, 80.99, "Elevada", "Priorizar mitigação"),
    (41.0, 60.99, "Média", "Definir ação e prazo"),
    (21.0, 40.99, "Baixa", "Acompanhar em ciclo regular"),
    (0.0, 20.99, "Muito baixa", "Monitorizar"),
]


# ============================================================================
# DTOs
# ============================================================================


@dataclass
class DimensionScore:
    """One row of the score breakdown panel (A. region of the Decision screen)."""

    code: str
    label: str
    raw_value: str
    normalized_score: float
    weight: float
    contribution: float
    source: str
    explanation: str


@dataclass
class MultidimensionalScore:
    """Full output of the engine — feeds the multidimensional panel."""

    occurrence_id: Optional[str]
    global_score: float
    classification_label: str
    classification_band: str
    recommended_action: str
    dimensions: List[DimensionScore] = field(default_factory=list)
    computed_at: Optional[datetime] = None
    weights_profile: str = "default"


# ============================================================================
# ENGINE
# ============================================================================


class MultidimensionalScoringEngine:
    """
    Score an AssetVulnerability occurrence across 8 dimensions (Cap. 4.9.2).

    Usage:
        score = MultidimensionalScoringEngine.score_occurrence(asset_vuln)
        payload = MultidimensionalScoringEngine.to_dict(score)

    The engine resolves applicable controls by union of Asset.controls and
    Vulnerability.controls. All compliance/mechanism/evidence/finding
    aggregations are computed over that control set.
    """

    @classmethod
    def score_occurrence(
        cls,
        asset_vuln: AssetVulnerability,
        weights: Optional[Dict[str, float]] = None,
    ) -> MultidimensionalScore:
        asset = asset_vuln.asset
        vuln = asset_vuln.vulnerability
        w = weights or DEFAULT_DIMENSION_WEIGHTS

        applicable_controls = cls._resolve_applicable_controls(asset, vuln)

        dimensions = [
            cls._dim_technical_risk(vuln, w["technical_risk"]),
            cls._dim_asset_criticality(asset, w["asset_criticality"]),
            cls._dim_exposure(asset, w["exposure"]),
            cls._dim_compliance_state(applicable_controls, w["compliance_state"]),
            cls._dim_mechanism_maturity(applicable_controls, w["mechanism_maturity"]),
            cls._dim_evidence_availability(applicable_controls, w["evidence_availability"]),
            cls._dim_open_findings(applicable_controls, w["open_findings"]),
            cls._dim_regulatory_relevance(applicable_controls, w["regulatory_relevance"]),
        ]

        global_score = round(
            max(0.0, min(100.0, sum(d.contribution for d in dimensions))),
            2,
        )
        label, band, action = cls._classify(global_score)

        return MultidimensionalScore(
            occurrence_id=str(asset_vuln.id),
            global_score=global_score,
            classification_label=label,
            classification_band=band,
            recommended_action=action,
            dimensions=dimensions,
            computed_at=now(),
            weights_profile="custom" if weights else "default",
        )

    @staticmethod
    def to_dict(score: MultidimensionalScore) -> Dict[str, Any]:
        payload = asdict(score)
        payload["computed_at"] = score.computed_at.isoformat() if score.computed_at else None
        return payload

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_applicable_controls(asset: Asset, vuln: Vulnerability):
        """Union of controls linked to the asset and to the vulnerability."""
        return (asset.controls.all() | vuln.controls.all()).distinct()

    @staticmethod
    def _classify(score: float):
        for low, high, label, action in CLASSIFICATION_BANDS:
            if low <= score <= high:
                band = f"{int(low)}-{int(high) if high >= 100 else int(high) + 1}"
                return label, band, action
        return "Muito baixa", "0-20", "Monitorizar"

    # ------------------------------------------------------------------
    # dimension calculators (one method per dimension to keep them testable)
    # ------------------------------------------------------------------

    @staticmethod
    def _dim_technical_risk(vuln: Vulnerability, weight: float) -> DimensionScore:
        cvss = float(vuln.cvss_score or 0.0)
        epss = float(vuln.epss_score or 0.0)
        kev = 1.0 if vuln.is_in_kev else 0.0

        # 70% CVSS, 20% EPSS, 10% KEV flag — all renormalized to 0..100.
        normalized = (cvss * 7.0) + (epss * 20.0) + (kev * 10.0)
        normalized = max(0.0, min(100.0, normalized))

        bits = []
        if cvss > 0:
            bits.append(f"CVSS {cvss:.1f}")
        if epss > 0:
            bits.append(f"EPSS {int(epss * 100)}%")
        if vuln.is_in_kev:
            bits.append("CISA KEV")
        explanation = " · ".join(bits) if bits else "Sem métricas técnicas disponíveis"

        return DimensionScore(
            code="technical_risk",
            label="Risco técnico",
            raw_value=explanation,
            normalized_score=round(normalized, 2),
            weight=weight,
            contribution=round(normalized * weight, 2),
            source="NVD · FIRST · CISA",
            explanation=explanation,
        )

    @staticmethod
    def _dim_asset_criticality(asset: Asset, weight: float) -> DimensionScore:
        normalized = CRITICALITY_TO_SCORE.get(asset.criticality, 60.0)
        return DimensionScore(
            code="asset_criticality",
            label="Criticidade do ativo",
            raw_value=asset.criticality or "Medium",
            normalized_score=normalized,
            weight=weight,
            contribution=round(normalized * weight, 2),
            source=f"Asset: {asset.name}",
            explanation=f"Criticidade classificada como {asset.criticality or 'Medium'}",
        )

    @staticmethod
    def _dim_exposure(asset: Asset, weight: float) -> DimensionScore:
        value = asset.exposure or 3
        normalized = EXPOSURE_SMALLINT_TO_SCORE.get(value, 50.0)
        label = EXPOSURE_SMALLINT_LABEL.get(value, "Médio")
        return DimensionScore(
            code="exposure",
            label="Exposição",
            raw_value=f"{value}/5 ({label})",
            normalized_score=normalized,
            weight=weight,
            contribution=round(normalized * weight, 2),
            source="Asset.exposure",
            explanation=f"Exposição classificada como {label}",
        )

    @staticmethod
    def _dim_compliance_state(controls_qs, weight: float) -> DimensionScore:
        if not controls_qs.exists():
            return DimensionScore(
                code="compliance_state",
                label="Estado de conformidade",
                raw_value="Sem controlos aplicáveis",
                normalized_score=50.0,
                weight=weight,
                contribution=round(50.0 * weight, 2),
                source="ControlAssessment",
                explanation="Nenhum controlo mapeado a este ativo/vulnerabilidade; valor neutro aplicado.",
            )

        assessments = ControlAssessment.objects.filter(control__in=controls_qs)
        if not assessments.exists():
            return DimensionScore(
                code="compliance_state",
                label="Estado de conformidade",
                raw_value="Não avaliado",
                normalized_score=100.0,
                weight=weight,
                contribution=round(100.0 * weight, 2),
                source="ControlAssessment",
                explanation=f"{controls_qs.count()} controlo(s) aplicável(eis) ainda sem avaliação registada.",
            )

        statuses = list(assessments.values_list("implementation_status", flat=True))
        gap_avg = sum(ASSESSMENT_STATUS_GAP.get(s, 50.0) for s in statuses) / len(statuses)

        # Surface up to 3 distinct status labels for readability.
        unique_statuses = sorted(set(statuses))
        unique_preview = ", ".join(unique_statuses[:3])
        if len(unique_statuses) > 3:
            unique_preview += " …"

        return DimensionScore(
            code="compliance_state",
            label="Estado de conformidade",
            raw_value=f"{len(statuses)} avaliações · gap médio {round(gap_avg)}",
            normalized_score=round(gap_avg, 2),
            weight=weight,
            contribution=round(gap_avg * weight, 2),
            source="ControlAssessment",
            explanation=f"Estados observados: {unique_preview}",
        )

    @staticmethod
    def _dim_mechanism_maturity(controls_qs, weight: float) -> DimensionScore:
        if not controls_qs.exists():
            return DimensionScore(
                code="mechanism_maturity",
                label="Maturidade dos mecanismos",
                raw_value="Sem controlos aplicáveis",
                normalized_score=50.0,
                weight=weight,
                contribution=round(50.0 * weight, 2),
                source="ControlMechanism",
                explanation="Sem controlos aplicáveis para avaliar mecanismos.",
            )

        cms = ControlMechanism.objects.filter(control__in=controls_qs)
        if not cms.exists():
            return DimensionScore(
                code="mechanism_maturity",
                label="Maturidade dos mecanismos",
                raw_value="Sem mecanismos registados",
                normalized_score=100.0,
                weight=weight,
                contribution=round(100.0 * weight, 2),
                source="ControlMechanism",
                explanation="Controlos sem mecanismos de implementação registados — gap máximo aplicado.",
            )

        statuses = list(cms.values_list("status", flat=True))
        gap_avg = sum(MECHANISM_STATUS_GAP.get(s, 50.0) for s in statuses) / len(statuses)

        return DimensionScore(
            code="mechanism_maturity",
            label="Maturidade dos mecanismos",
            raw_value=f"{len(statuses)} mecanismo(s)",
            normalized_score=round(gap_avg, 2),
            weight=weight,
            contribution=round(gap_avg * weight, 2),
            source="ControlMechanism",
            explanation=f"Gap médio de operacionalização: {round(gap_avg)} / 100",
        )

    @staticmethod
    def _dim_evidence_availability(controls_qs, weight: float) -> DimensionScore:
        if not controls_qs.exists():
            return DimensionScore(
                code="evidence_availability",
                label="Evidência disponível",
                raw_value="Sem controlos aplicáveis",
                normalized_score=50.0,
                weight=weight,
                contribution=round(50.0 * weight, 2),
                source="Evidence",
                explanation="Sem controlos aplicáveis para verificar evidência.",
            )

        assessments_count = ControlAssessment.objects.filter(control__in=controls_qs).count()
        if assessments_count == 0:
            return DimensionScore(
                code="evidence_availability",
                label="Evidência disponível",
                raw_value="Sem avaliações",
                normalized_score=100.0,
                weight=weight,
                contribution=round(100.0 * weight, 2),
                source="Evidence",
                explanation="Sem avaliações registadas; evidência não verificável.",
            )

        evidence_count = Evidence.objects.filter(assessment__control__in=controls_qs).count()
        per_assessment = evidence_count / assessments_count
        # Target: 2 pieces of evidence per assessment for full coverage.
        coverage = min(1.0, per_assessment / 2.0)
        gap = (1.0 - coverage) * 100.0

        return DimensionScore(
            code="evidence_availability",
            label="Evidência disponível",
            raw_value=f"{evidence_count} evid. para {assessments_count} aval.",
            normalized_score=round(gap, 2),
            weight=weight,
            contribution=round(gap * weight, 2),
            source="Evidence",
            explanation=f"Cobertura de evidência: {round(coverage * 100)}%",
        )

    @staticmethod
    def _dim_open_findings(controls_qs, weight: float) -> DimensionScore:
        if not controls_qs.exists():
            return DimensionScore(
                code="open_findings",
                label="Findings associados",
                raw_value="0",
                normalized_score=0.0,
                weight=weight,
                contribution=0.0,
                source="Finding · ComplianceGap",
                explanation="Sem controlos aplicáveis para procurar findings/gaps.",
            )

        # Formal findings tied to control assessments.
        formal = Finding.objects.filter(
            assessment__control__in=controls_qs,
            status=Finding.Status.OPEN,
        )
        formal_score = sum(FINDING_SEVERITY_WEIGHT.get(f.severity, 5.0) for f in formal)

        # Auto-detected compliance gaps (MISSING / PARTIAL).
        gaps = ComplianceGap.objects.filter(
            control__in=controls_qs,
            status__in=("MISSING", "PARTIAL"),
        )
        gap_score = sum(COMPLIANCE_GAP_STATUS_SCORE.get(g.status, 50.0) for g in gaps) * 0.2

        combined = min(100.0, formal_score + gap_score)
        total_items = formal.count() + gaps.count()

        if total_items == 0:
            return DimensionScore(
                code="open_findings",
                label="Findings associados",
                raw_value="0 em aberto",
                normalized_score=0.0,
                weight=weight,
                contribution=0.0,
                source="Finding · ComplianceGap",
                explanation="Sem findings ou gaps em aberto nos controlos aplicáveis.",
            )

        return DimensionScore(
            code="open_findings",
            label="Findings associados",
            raw_value=f"{formal.count()} formais · {gaps.count()} gaps",
            normalized_score=round(combined, 2),
            weight=weight,
            contribution=round(combined * weight, 2),
            source="Finding · ComplianceGap",
            explanation=f"{total_items} item(ns) em aberto nos controlos aplicáveis (formais + auto-detetados).",
        )

    @staticmethod
    def _dim_regulatory_relevance(controls_qs, weight: float) -> DimensionScore:
        if not controls_qs.exists():
            return DimensionScore(
                code="regulatory_relevance",
                label="Relevância normativa",
                raw_value="Sem controlos aplicáveis",
                normalized_score=0.0,
                weight=weight,
                contribution=0.0,
                source="Framework",
                explanation="Sem mapeamento normativo conhecido.",
            )

        framework_codes = sorted(
            {code for code in controls_qs.values_list("framework__code", flat=True) if code}
        )
        if not framework_codes:
            return DimensionScore(
                code="regulatory_relevance",
                label="Relevância normativa",
                raw_value="Frameworks não identificadas",
                normalized_score=30.0,
                weight=weight,
                contribution=round(30.0 * weight, 2),
                source="Framework",
                explanation="Controlos sem código de framework associado.",
            )

        max_weight = 0.0
        chosen = ""
        for code in framework_codes:
            w = FRAMEWORK_REGULATORY_WEIGHT.get(code, 30.0)
            if w > max_weight:
                max_weight = w
                chosen = code

        return DimensionScore(
            code="regulatory_relevance",
            label="Relevância normativa",
            raw_value=", ".join(framework_codes),
            normalized_score=max_weight,
            weight=weight,
            contribution=round(max_weight * weight, 2),
            source="Framework",
            explanation=f"Maior peso regulatório aplicável: {chosen}",
        )
