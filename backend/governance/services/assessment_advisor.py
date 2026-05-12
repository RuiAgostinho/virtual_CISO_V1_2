from decimal import Decimal

from governance.models import (
    ComplianceGap,
    ControlAssessment,
    ControlMechanism,
    Evidence,
    Finding,
    ImplementationMechanism,
    ImprovementAction,
    MechanismEvidence,
    PolicyEvidence,
)


class AssessmentAdvisor:
    """
    Deterministic advisory layer for control assessments.

    It does not replace the human assessment. It gives a traceable suggestion
    based on the same objects used by the Compliance Gap Engine.
    """

    STATUS_LABELS = {
        ControlAssessment.ImplementationStatus.NOT_STARTED: "Nao iniciado",
        ControlAssessment.ImplementationStatus.PLANNED: "Planeado",
        ControlAssessment.ImplementationStatus.PARTIAL: "Parcial",
        ControlAssessment.ImplementationStatus.IMPLEMENTED: "Implementado",
        ControlAssessment.ImplementationStatus.OPTIMIZED: "Otimizado",
    }

    @classmethod
    def recommend(cls, assessment):
        control = assessment.control
        gap = ComplianceGap.objects.filter(control=control, framework=control.framework).first()

        formal_evidence_count = Evidence.objects.filter(assessment__control=control).count()
        mechanism_evidence_count = MechanismEvidence.objects.filter(control_mechanism__control=control).count()
        policy_evidence_qs = PolicyEvidence.objects.filter(mechanism__policy_control__control=control)
        policy_evidence_count = policy_evidence_qs.count()
        valid_policy_evidence_count = policy_evidence_qs.filter(status=PolicyEvidence.Status.VALID).count()
        total_evidence_count = formal_evidence_count + mechanism_evidence_count + policy_evidence_count

        open_findings_count = Finding.objects.filter(
            assessment__control=control,
            status=Finding.Status.OPEN,
        ).count()
        open_actions_count = ImprovementAction.objects.filter(
            assessment__control=control,
        ).exclude(status=ImprovementAction.Status.DONE).count()

        control_mechanism_qs = ControlMechanism.objects.filter(control=control)
        policy_mechanism_qs = ImplementationMechanism.objects.filter(policy_control__control=control)
        mechanism_count = control_mechanism_qs.count() + policy_mechanism_qs.count()
        implemented_mechanism_count = (
            control_mechanism_qs.filter(status=ControlMechanism.ImplementationStatus.IMPLEMENTED).count()
            + policy_mechanism_qs.filter(implementation_status=ImplementationMechanism.Status.IMPLEMENTED).count()
        )
        in_progress_mechanism_count = (
            control_mechanism_qs.filter(status=ControlMechanism.ImplementationStatus.IN_PROGRESS).count()
            + policy_mechanism_qs.filter(
                implementation_status__in=[
                    ImplementationMechanism.Status.IN_PROGRESS,
                    ImplementationMechanism.Status.PARTIALLY_IMPLEMENTED,
                ]
            ).count()
        )

        suggested_status, confidence, summary, rationale, missing_evidence, next_actions = cls._decide(
            assessment=assessment,
            total_evidence_count=total_evidence_count,
            formal_evidence_count=formal_evidence_count,
            mechanism_evidence_count=mechanism_evidence_count,
            valid_policy_evidence_count=valid_policy_evidence_count,
            open_findings_count=open_findings_count,
            open_actions_count=open_actions_count,
            mechanism_count=mechanism_count,
            implemented_mechanism_count=implemented_mechanism_count,
            in_progress_mechanism_count=in_progress_mechanism_count,
        )

        return {
            "assessment_id": str(assessment.id),
            "control": {
                "id": str(control.id),
                "code": control.code,
                "title": control.title,
                "framework": control.framework.code,
            },
            "current_status": assessment.implementation_status,
            "current_status_label": cls.STATUS_LABELS.get(assessment.implementation_status, assessment.implementation_status),
            "suggested_status": suggested_status,
            "suggested_status_label": cls.STATUS_LABELS.get(suggested_status, suggested_status),
            "confidence": confidence,
            "executive_summary": summary,
            "rationale": rationale,
            "missing_evidence": missing_evidence,
            "next_actions": next_actions,
            "source_metrics": {
                "formal_evidence": formal_evidence_count,
                "mechanism_evidence": mechanism_evidence_count,
                "policy_evidence": policy_evidence_count,
                "valid_policy_evidence": valid_policy_evidence_count,
                "total_evidence": total_evidence_count,
                "open_findings": open_findings_count,
                "open_actions": open_actions_count,
                "linked_mechanisms": mechanism_count,
                "implemented_mechanisms": implemented_mechanism_count,
                "in_progress_mechanisms": in_progress_mechanism_count,
                "gap_status": gap.status if gap else None,
                "gap_confidence": gap.confidence_score if gap else None,
            },
            "traceability": [
                {"label": "Evidencia formal", "value": formal_evidence_count},
                {"label": "Evidencia operacional", "value": mechanism_evidence_count},
                {"label": "Evidencia de politicas", "value": policy_evidence_count},
                {"label": "Findings abertos", "value": open_findings_count},
                {"label": "Mecanismos implementados", "value": implemented_mechanism_count},
            ],
        }

    @classmethod
    def _decide(
        cls,
        *,
        assessment,
        total_evidence_count,
        formal_evidence_count,
        mechanism_evidence_count,
        valid_policy_evidence_count,
        open_findings_count,
        open_actions_count,
        mechanism_count,
        implemented_mechanism_count,
        in_progress_mechanism_count,
    ):
        rationale = []
        missing_evidence = []
        next_actions = []

        has_assurance_evidence = (
            formal_evidence_count > 0
            or mechanism_evidence_count > 0
            or valid_policy_evidence_count > 0
        )
        current_is_strong = assessment.implementation_status in [
            ControlAssessment.ImplementationStatus.IMPLEMENTED,
            ControlAssessment.ImplementationStatus.OPTIMIZED,
        ]

        if open_findings_count:
            rationale.append(f"Existem {open_findings_count} finding(s) aberto(s) associados ao controlo.")
            if has_assurance_evidence:
                rationale.append("Ja existe alguma evidencia, mas os findings impedem fechar o controlo com seguranca.")
            else:
                missing_evidence.append("Evidencia minima que demonstre a implementacao do controlo.")
            next_actions.append("Mitigar, aceitar formalmente ou fechar os findings antes de marcar como implementado.")
            next_actions.append("Registar a evidencia que suporta a decisao no proprio controlo.")
            return (
                ControlAssessment.ImplementationStatus.PARTIAL,
                0.88 if has_assurance_evidence else 0.76,
                "O controlo deve ficar como parcial enquanto existirem findings abertos.",
                rationale,
                missing_evidence,
                next_actions,
            )

        if has_assurance_evidence and (implemented_mechanism_count > 0 or current_is_strong):
            rationale.append(f"Existem {total_evidence_count} evidencia(s) associadas ao controlo.")
            if implemented_mechanism_count:
                rationale.append(f"Existem {implemented_mechanism_count} mecanismo(s) marcado(s) como implementado(s).")
            if current_is_strong:
                rationale.append("A avaliacao humana atual ja indica implementacao forte.")
            if total_evidence_count < 2:
                missing_evidence.append("Segunda evidencia independente para aumentar a rastreabilidade da avaliacao.")
            next_actions.append("Confirmar que a evidencia cobre todo o ambito do controlo e nao apenas um caso pontual.")
            next_actions.append("Definir data de revisao para manter a evidencia atualizada.")
            suggested = (
                ControlAssessment.ImplementationStatus.OPTIMIZED
                if assessment.implementation_status == ControlAssessment.ImplementationStatus.OPTIMIZED
                and Decimal(str(assessment.effectiveness)) >= Decimal("0.90")
                else ControlAssessment.ImplementationStatus.IMPLEMENTED
            )
            return (
                suggested,
                0.86 if total_evidence_count >= 2 else 0.78,
                "O controlo tem evidencia e sinais de implementacao suficientes para ser considerado implementado.",
                rationale,
                missing_evidence,
                next_actions,
            )

        if has_assurance_evidence:
            rationale.append(f"Existe {total_evidence_count} evidencia(s), mas nenhum mecanismo esta marcado como implementado.")
            missing_evidence.append("Associacao a mecanismo implementado ou nota de avaliacao que explique a cobertura do controlo.")
            next_actions.append("Validar se a evidencia recolhida prova desenho e funcionamento do controlo.")
            next_actions.append("Ligar a evidencia a um mecanismo operacional sempre que possivel.")
            return (
                ControlAssessment.ImplementationStatus.PARTIAL,
                0.72,
                "Ha evidencia, mas falta demonstrar claramente a implementacao operacional.",
                rationale,
                missing_evidence,
                next_actions,
            )

        if in_progress_mechanism_count or open_actions_count or mechanism_count:
            if in_progress_mechanism_count:
                rationale.append(f"Existem {in_progress_mechanism_count} mecanismo(s) em progresso.")
            if open_actions_count:
                rationale.append(f"Existem {open_actions_count} acao(oes) de melhoria abertas.")
            if mechanism_count and not in_progress_mechanism_count:
                rationale.append(f"Existem {mechanism_count} mecanismo(s) ligados, mas ainda sem evidencia.")
            missing_evidence.append("Evidencia de execucao ou configuracao do controlo.")
            next_actions.append("Recolher evidencia minima antes de subir para parcial ou implementado.")
            return (
                ControlAssessment.ImplementationStatus.PLANNED,
                0.66,
                "O controlo esta planeado ou em preparacao, mas ainda sem evidencia suficiente.",
                rationale,
                missing_evidence,
                next_actions,
            )

        rationale.append("Nao existem evidencias, findings, acoes ou mecanismos suficientes associados ao controlo.")
        missing_evidence.append("Evidencia formal ou operacional que prove a existencia do controlo.")
        next_actions.append("Selecionar mecanismo aplicavel e definir responsavel pela implementacao.")
        next_actions.append("Registar a primeira evidencia quando o controlo estiver demonstravel.")
        return (
            ControlAssessment.ImplementationStatus.NOT_STARTED,
            0.84,
            "Ainda nao ha base suficiente para considerar o controlo avaliado.",
            rationale,
            missing_evidence,
            next_actions,
        )