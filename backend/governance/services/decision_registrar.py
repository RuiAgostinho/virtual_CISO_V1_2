"""
Persist a CISO decision with a server-rebuilt snapshot — Cap. 4.12.5.

The function rebuilds the decision context server-side at registration time so
the audit trail is defensible regardless of what the client sent.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional

from django.db import transaction
from django.utils.timezone import now

from governance.models.decision import DecisionRecord
from governance.services.decision_context_builder import (
    ACTION_BY_CODE,
    DecisionContextBuilder,
)
from risk.models.vulnerability import AssetVulnerability, VulnerabilityHistory


VALID_STATUSES = {choice[0] for choice in AssetVulnerability.STATUS_CHOICES}


class DecisionValidationError(Exception):
    def __init__(self, errors: Dict[str, str]):
        super().__init__("Invalid decision payload")
        self.errors = errors


@dataclass
class RegistrationResult:
    decision_id: str
    occurrence_id: str
    decision_code: str
    decided_at: str
    decided_by: str
    occurrence_status: str
    snapshot_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def validate(decision_code: str, justification: str) -> Dict[str, str]:
    errors: Dict[str, str] = {}
    if not decision_code:
        errors["decision_code"] = "Campo obrigatório."
    elif decision_code not in ACTION_BY_CODE:
        errors["decision_code"] = (
            f"Valor inválido. Aceita um de: {', '.join(sorted(ACTION_BY_CODE))}."
        )
    if not justification:
        errors["justification"] = "Justificação obrigatória para registar a decisão."
    elif len(justification.strip()) < 10:
        errors["justification"] = "Justificação demasiado curta (mínimo 10 caracteres)."
    return errors


def register_decision(
    occurrence: AssetVulnerability,
    *,
    decision_code: str,
    justification: str,
    actor: str = "sistema",
    title: Optional[str] = None,
    transfer_to: Optional[str] = None,
    due_date: Optional[str] = None,
) -> RegistrationResult:
    """
    Create a DecisionRecord with a fresh server-side snapshot, record history
    and update occurrence status when applicable.

    Raises DecisionValidationError on input errors.
    """
    decision_code = (decision_code or "").strip()
    justification = (justification or "").strip()

    errors = validate(decision_code, justification)
    if errors:
        raise DecisionValidationError(errors)

    action_meta = ACTION_BY_CODE[decision_code]
    snapshot = DecisionContextBuilder.build(occurrence)
    score_snapshot = snapshot["score"]
    sources = _extract_sources(snapshot)

    record_title = (title or "").strip() or _auto_title(occurrence, action_meta)
    rationale = _compose_rationale(score_snapshot, action_meta, transfer_to, due_date)

    with transaction.atomic():
        record = DecisionRecord.objects.create(
            decision_type=DecisionRecord.DecisionType.VULNERABILITY,
            target_type="asset_vulnerability",
            target_id=str(occurrence.id),
            title=record_title,
            recommendation=score_snapshot.get("recommended_action", ""),
            rationale=rationale,
            source_snapshot=sources,
            score_snapshot=score_snapshot,
            decision=decision_code,
            justification=justification,
            decided_by=actor,
            decided_at=now(),
        )

        VulnerabilityHistory.objects.create(
            asset_vuln=occurrence,
            action=f"Decisão registada: {action_meta['label']}",
            user=actor,
            notes=justification,
        )

        new_status = action_meta.get("next_status")
        if new_status and new_status in VALID_STATUSES and occurrence.status != new_status:
            occurrence.status = new_status
            occurrence.save(update_fields=["status", "last_seen"])

    return RegistrationResult(
        decision_id=str(record.id),
        occurrence_id=str(occurrence.id),
        decision_code=decision_code,
        decided_at=record.decided_at.isoformat(),
        decided_by=actor,
        occurrence_status=occurrence.status,
        snapshot_at=snapshot["snapshot_at"],
    )


# ----------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------


def _auto_title(occurrence: AssetVulnerability, action_meta) -> str:
    return f"{action_meta['label']}: {occurrence.vulnerability.cve_id} em {occurrence.asset.name}"


def _compose_rationale(score_snapshot, action_meta, transfer_to, due_date) -> str:
    bits = [
        f"Classificação: {score_snapshot.get('classification_label', '—')} "
        f"(score {score_snapshot.get('global_score', '?')}/100).",
        f"Ação recomendada pelo sistema: {action_meta['description']}",
    ]
    if transfer_to:
        bits.append(f"Transferência para: {transfer_to}.")
    if due_date:
        bits.append(f"Prazo indicativo: {due_date}.")
    return " ".join(bits)


def _extract_sources(snapshot) -> list:
    """Compact list of structured sources that backed the decision."""
    sources = []
    for entry in snapshot.get("compliance_chain", []):
        sources.append(
            {
                "type": "control",
                "ref": f"{entry['framework']['code']}:{entry['control']['code']}",
                "title": entry["control"]["title"],
                "mechanisms": [m["title"] for m in entry.get("mechanisms", [])],
                "findings_count": len(entry.get("findings", [])),
                "gaps_count": len(entry.get("compliance_gaps", [])),
            }
        )
    for dim in snapshot.get("score", {}).get("dimensions", []):
        sources.append(
            {
                "type": "score_dimension",
                "ref": dim["code"],
                "title": dim["label"],
                "normalized_score": dim["normalized_score"],
                "contribution": dim["contribution"],
            }
        )
    return sources
