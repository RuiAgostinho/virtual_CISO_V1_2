from django.utils import timezone
from governance.models import (
    Framework, Control, ComplianceGap, ControlMechanism, MechanismEvidence,
    ImplementationMechanism, PolicyEvidence
)
from governance.models.assessment import ControlAssessment, Evidence, Finding

class ComplianceGapEngine:
    """
    Independent compliance evaluation engine that operates without interfering
    with the Hybrid RAG architecture or existing orchestration layers.
    """
    
    @staticmethod
    def evaluate_all() -> dict:
        total_missing = 0
        total_partial = 0
        total_implemented = 0
        total_controls = 0
        
        frameworks = Framework.objects.filter(is_active=True)
        for framework in frameworks:
            stats = ComplianceGapEngine.evaluate_framework(framework)
            total_missing += stats['missing']
            total_partial += stats['partial']
            total_implemented += stats['implemented']
            total_controls += stats['total']
            
        return {
            "total_frameworks": frameworks.count(),
            "total_controls": total_controls,
            "missing": total_missing,
            "partial": total_partial,
            "implemented": total_implemented
        }

    @staticmethod
    def evaluate_framework(framework: Framework) -> dict:
        controls = Control.objects.filter(framework=framework)
        
        stats = {
            "total": controls.count(),
            "missing": 0,
            "partial": 0,
            "implemented": 0
        }
        
        for control in controls:
            gap = ComplianceGapEngine.evaluate_control(framework, control)
            if gap.status == 'MISSING':
                stats['missing'] += 1
            elif gap.status == 'PARTIAL':
                stats['partial'] += 1
            elif gap.status == 'IMPLEMENTED':
                stats['implemented'] += 1
                
        return stats

    @staticmethod
    def evaluate_control(framework: Framework, control: Control) -> ComplianceGap:
        # Aggregates both formal assessment evidence and operational mechanism evidence.
        assessment_evidence_count = Evidence.objects.filter(assessment__control=control).count()
        mechanism_evidence_count = MechanismEvidence.objects.filter(control_mechanism__control=control).count()
        policy_evidence_count = PolicyEvidence.objects.filter(mechanism__policy_control__control=control).count()
        evidence_count = assessment_evidence_count + mechanism_evidence_count + policy_evidence_count

        findings_count = Finding.objects.filter(
            assessment__control=control, 
            status=Finding.Status.OPEN
        ).count()

        control_mechanisms = ControlMechanism.objects.filter(control=control)
        policy_mechanisms = ImplementationMechanism.objects.filter(policy_control__control=control)
        mechanism_count = control_mechanisms.count() + policy_mechanisms.count()
        implemented_mechanisms = (
            control_mechanisms.filter(status=ControlMechanism.ImplementationStatus.IMPLEMENTED).count()
            + policy_mechanisms.filter(implementation_status=ImplementationMechanism.Status.IMPLEMENTED).count()
        )
        in_progress_mechanisms = (
            control_mechanisms.filter(status=ControlMechanism.ImplementationStatus.IN_PROGRESS).count()
            + policy_mechanisms.filter(
                implementation_status__in=[
                    ImplementationMechanism.Status.IN_PROGRESS,
                    ImplementationMechanism.Status.PARTIALLY_IMPLEMENTED,
                ]
            ).count()
        )
        implemented_assessment_exists = ControlAssessment.objects.filter(
            control=control,
            implementation_status__in=[
                ControlAssessment.ImplementationStatus.IMPLEMENTED,
                ControlAssessment.ImplementationStatus.OPTIMIZED,
            ],
        ).exists()

        if evidence_count == 0:
            status = 'MISSING'
            confidence = 0.0
            notes = (
                f"Sem evidência registada para demonstrar a implementação do controlo. "
                f"Mecanismos associados: {mechanism_count}; em implementação: {in_progress_mechanisms}; "
                f"implementados sem evidência: {implemented_mechanisms}."
            )
        elif findings_count > 0:
            status = 'PARTIAL'
            confidence = 0.5
            notes = (
                f"Existem {evidence_count} evidência(s), incluindo {mechanism_evidence_count} associada(s) "
                f"a mecanismos, mas há {findings_count} finding(s) aberto(s)."
            )
        elif mechanism_count > 0 and implemented_mechanisms == 0 and not implemented_assessment_exists:
            status = 'PARTIAL'
            confidence = 0.5
            notes = (
                f"Existem {evidence_count} evidência(s), mas nenhum mecanismo está marcado como implementado. "
                f"Mecanismos em implementação: {in_progress_mechanisms}."
            )
        elif evidence_count > 0:
            status = 'IMPLEMENTED'
            confidence = 1.0
            notes = (
                f"Implementação suportada por {evidence_count} evidência(s): "
                f"{assessment_evidence_count} de avaliação, {mechanism_evidence_count} de mecanismo "
                f"e {policy_evidence_count} de política. Sem findings abertos."
            )
        else:
            status = 'MISSING'
            confidence = 0.0
            notes = "Estado desconhecido."

        gap, created = ComplianceGap.objects.update_or_create(
            framework=framework,
            control=control,
            defaults={
                'status': status,
                'confidence_score': confidence,
                'evidence_count': evidence_count,
                'notes': notes,
                'last_evaluated': timezone.now()
            }
        )
        return gap


