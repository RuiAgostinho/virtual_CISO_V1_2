"""
Builds the full context payload for the Decision screen — Cap. 4.11 of the dissertation.

Aggregates, for one AssetVulnerability occurrence:
  - identification (asset + vulnerability) — Cap. 4.5
  - multidimensional priority score — Cap. 4.9
  - compliance chain (framework -> control -> mechanisms -> evidence -> findings) — Cap. 4.8 / 4.12.4
  - decision history (audit log of past events) — Cap. 4.12.5
  - available decision actions — Cap. 4.11.4
  - placeholder for AI recommendation (filled by a separate endpoint in Fase 3)

The output is a plain dict ready to be serialized to JSON for the frontend.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from django.db.models import QuerySet
from django.utils.timezone import now

from governance.models.assessment import ControlAssessment, Evidence, Finding, ImprovementAction
from governance.models.compliance_gap import ComplianceGap
from governance.models.decision import DecisionRecord
from governance.models.mechanism import ControlMechanism, MechanismEvidence
from risk.models.vulnerability import AssetVulnerability, VulnerabilityHistory
from risk.services.multidimensional_scoring import MultidimensionalScoringEngine


AVAILABLE_ACTIONS: List[Dict[str, Any]] = [
    {
        "code": "accepted",
        "label": "Aceitar risco",
        "description": "Registar aceitação formal e fechar a ocorrência.",
        "requires_justification": True,
        "next_status": "Accepted risk",
    },
    {
        "code": "mitigate",
        "label": "Mitigar agora",
        "description": "Criar ação imediata com responsável e prazo.",
        "requires_justification": True,
        "next_status": "In remediation",
    },
    {
        "code": "deferred",
        "label": "Diferir",
        "description": "Adiar a decisão até uma data definida.",
        "requires_justification": True,
        "next_status": None,
    },
    {
        "code": "transferred",
        "label": "Transferir",
        "description": "Atribuir a responsabilidade a outra equipa ou entidade.",
        "requires_justification": True,
        "next_status": "In remediation",
    },
    {
        "code": "converted_to_action",
        "label": "Converter em ação de melhoria",
        "description": "Criar ImprovementAction ligada e manter rastreabilidade.",
        "requires_justification": True,
        "next_status": None,
    },
]


ACTION_BY_CODE: Dict[str, Dict[str, Any]] = {a["code"]: a for a in AVAILABLE_ACTIONS}


class DecisionContextBuilder:
    """Public entrypoint. Use :meth:`build` to get the full payload."""

    @classmethod
    def build(cls, occurrence: AssetVulnerability) -> Dict[str, Any]:
        score = MultidimensionalScoringEngine.score_occurrence(occurrence)
        applicable_controls = (
            occurrence.asset.controls.all() | occurrence.vulnerability.controls.all()
        ).distinct()

        return {
            "occurrence_id": str(occurrence.id),
            "occurrence": cls._serialize_occurrence(occurrence),
            "score": MultidimensionalScoringEngine.to_dict(score),
            "compliance_chain": cls._build_compliance_chain(applicable_controls),
            "decision_history": cls._build_history(occurrence),
            "available_actions": AVAILABLE_ACTIONS,
            "ai_recommendation": None,  # Fase 3 — preenchido por endpoint dedicado.
            "snapshot_at": (score.computed_at or now()).isoformat(),
        }

    # ------------------------------------------------------------------
    # occurrence
    # ------------------------------------------------------------------

    @staticmethod
    def _serialize_occurrence(occ: AssetVulnerability) -> Dict[str, Any]:
        asset = occ.asset
        vuln = occ.vulnerability
        return {
            "id": str(occ.id),
            "status": occ.status,
            "first_detected": occ.first_detected.isoformat() if occ.first_detected else None,
            "last_seen": occ.last_seen.isoformat() if occ.last_seen else None,
            "source": occ.source,
            "asset": {
                "id": str(asset.id),
                "name": asset.name,
                "criticality": asset.criticality,
                "exposure": asset.exposure,
                "business_value": asset.business_value,
                "dependency_score": asset.dependency_score,
                "owner": asset.owner,
                "category": asset.category.name if asset.category else None,
            },
            "vulnerability": {
                "id": str(vuln.id),
                "cve_id": vuln.cve_id,
                "severity": vuln.severity,
                "cvss_score": float(vuln.cvss_score) if vuln.cvss_score is not None else None,
                "epss_score": float(vuln.epss_score) if vuln.epss_score is not None else None,
                "is_in_kev": bool(vuln.is_in_kev),
                "description": vuln.description,
                "mitigation": vuln.mitigation,
                "published_at": vuln.published_at.isoformat() if vuln.published_at else None,
            },
        }

    # ------------------------------------------------------------------
    # compliance chain
    # ------------------------------------------------------------------

    @classmethod
    def _build_compliance_chain(cls, controls_qs: QuerySet) -> List[Dict[str, Any]]:
        if not controls_qs.exists():
            return []

        controls = list(controls_qs.select_related("framework", "section"))
        chain: List[Dict[str, Any]] = []

        assessments_by_control = {
            a.control_id: a
            for a in ControlAssessment.objects.filter(control__in=controls).select_related("profile")
        }
        mechanisms_by_control = cls._mechanisms_by_control(controls)
        findings_by_assessment = cls._findings_by_assessment(controls)
        gaps_by_control = cls._gaps_by_control(controls)
        evidence_count_by_assessment = cls._evidence_count_by_assessment(controls)

        for control in controls:
            assessment = assessments_by_control.get(control.id)
            entry = {
                "framework": {
                    "id": str(control.framework.id),
                    "code": control.framework.code,
                    "name": control.framework.name,
                    "version": control.framework.version,
                },
                "control": {
                    "id": str(control.id),
                    "code": control.code,
                    "title": control.title,
                    "is_mandatory": control.is_mandatory,
                    "section": control.section.code if control.section else None,
                },
                "assessment": cls._serialize_assessment(assessment, evidence_count_by_assessment)
                if assessment
                else None,
                "mechanisms": mechanisms_by_control.get(control.id, []),
                "findings": findings_by_assessment.get(assessment.id, []) if assessment else [],
                "compliance_gaps": gaps_by_control.get(control.id, []),
            }
            chain.append(entry)

        return chain

    @staticmethod
    def _serialize_assessment(assessment: ControlAssessment, evidence_counts: Dict[str, int]) -> Dict[str, Any]:
        return {
            "id": str(assessment.id),
            "implementation_status": assessment.implementation_status,
            "maturity_level": assessment.maturity_level,
            "effectiveness": float(assessment.effectiveness),
            "risk_residual": float(assessment.risk_residual),
            "assessed_at": assessment.assessed_at.isoformat() if assessment.assessed_at else None,
            "assessed_by": assessment.assessed_by,
            "evidence_count": evidence_counts.get(assessment.id, 0),
        }

    @staticmethod
    def _mechanisms_by_control(controls) -> Dict[str, List[Dict[str, Any]]]:
        cms = (
            ControlMechanism.objects.filter(control__in=controls)
            .select_related("mechanism", "control")
            .prefetch_related("evidences")
        )
        result: Dict[str, List[Dict[str, Any]]] = {}
        for cm in cms:
            result.setdefault(cm.control_id, []).append(
                {
                    "id": str(cm.id),
                    "title": cm.mechanism.title,
                    "type": cm.mechanism.mechanism_type,
                    "status": cm.status,
                    "responsible": cm.responsible,
                    "deadline": cm.deadline.isoformat() if cm.deadline else None,
                    "evidences_count": cm.evidences.count(),
                }
            )
        return result

    @staticmethod
    def _findings_by_assessment(controls) -> Dict[str, List[Dict[str, Any]]]:
        findings = Finding.objects.filter(assessment__control__in=controls).select_related("assessment")
        result: Dict[str, List[Dict[str, Any]]] = {}
        for f in findings:
            result.setdefault(f.assessment_id, []).append(
                {
                    "id": str(f.id),
                    "title": f.title,
                    "severity": f.severity,
                    "status": f.status,
                    "reference": f.reference,
                    "opened_at": f.opened_at.isoformat() if f.opened_at else None,
                }
            )
        return result

    @staticmethod
    def _gaps_by_control(controls) -> Dict[str, List[Dict[str, Any]]]:
        gaps = ComplianceGap.objects.filter(control__in=controls).select_related("framework")
        result: Dict[str, List[Dict[str, Any]]] = {}
        for g in gaps:
            result.setdefault(g.control_id, []).append(
                {
                    "id": str(g.id),
                    "status": g.status,
                    "confidence_score": g.confidence_score,
                    "evidence_count": g.evidence_count,
                    "framework_code": g.framework.code if g.framework else None,
                    "last_evaluated": g.last_evaluated.isoformat() if g.last_evaluated else None,
                }
            )
        return result

    @staticmethod
    def _evidence_count_by_assessment(controls) -> Dict[str, int]:
        evid = Evidence.objects.filter(assessment__control__in=controls).values_list("assessment_id", flat=True)
        counts: Dict[str, int] = {}
        for aid in evid:
            counts[aid] = counts.get(aid, 0) + 1
        return counts

    # ------------------------------------------------------------------
    # decision history
    # ------------------------------------------------------------------

    @classmethod
    def _build_history(cls, occurrence: AssetVulnerability) -> List[Dict[str, Any]]:
        """
        Merge two streams in reverse chronological order:
          - VulnerabilityHistory entries for this occurrence
          - DecisionRecord entries that target this occurrence (asset_vulnerability)
        """
        events: List[Dict[str, Any]] = []

        for hist in VulnerabilityHistory.objects.filter(asset_vuln=occurrence).order_by("-timestamp"):
            events.append(
                {
                    "timestamp": hist.timestamp.isoformat(),
                    "type": "occurrence_event",
                    "title": hist.action,
                    "actor": hist.user or "sistema",
                    "details": hist.notes or "",
                }
            )

        decisions = DecisionRecord.objects.filter(
            target_type__in=("asset_vulnerability", "vulnerability"),
            target_id=str(occurrence.id),
        ).order_by("-decided_at", "-created_at")
        for d in decisions:
            events.append(
                {
                    "timestamp": (d.decided_at or d.created_at).isoformat(),
                    "type": "decision",
                    "title": f"{d.get_decision_display()}: {d.title}",
                    "actor": d.decided_by or "—",
                    "details": d.justification or d.rationale or "",
                }
            )

        events.sort(key=lambda e: e["timestamp"], reverse=True)
        return events[:30]
