import logging

from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import (
    ComplianceGap,
    Control,
    EvidenceItem,
    EvidenceLink,
    GovernanceAction,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceDocumentSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Policy,
    PolicyEvidence,
    PolicyInternalControl,
    PolicySection,
    Procedure,
    RunbookStep,
    TechnicalRegulation,
)
from governance.models.mechanism import Mechanism, SuggestedMechanism

logger = logging.getLogger(__name__)


def schedule_policy_index(policy_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_policy(policy_id))


def schedule_technical_regulation_index(regulation_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_technical_regulation(regulation_id))


def schedule_procedure_index(procedure_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_procedure(procedure_id))


def schedule_policy_evidence_index(evidence_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_policy_evidence(evidence_id))


def schedule_compliance_gap_index(gap_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_compliance_gap(gap_id))


def schedule_control_index(control_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_control(control_id))


def schedule_mechanism_index(mechanism_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_mechanism(mechanism_id))


def schedule_internal_control_index(control_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_internal_control(control_id))


def schedule_governance_document_index(document_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_governance_document(document_id))


def schedule_governance_section_index(section_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_governance_section(section_id))


def schedule_runbook_step_parent_index(step_id):
    def index_parent_document():
        try:
            step = RunbookStep.objects.only("runbook_id").get(id=step_id)
        except RunbookStep.DoesNotExist:
            return
        KnowledgeIngestionService.upsert_governance_document(step.runbook_id)

    transaction.on_commit(index_parent_document)


def schedule_evidence_item_index(evidence_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_evidence_item(evidence_id))


def schedule_framework_mapping_index(mapping_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_framework_mapping(mapping_id))


def schedule_internal_control_mechanism_index(link_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_internal_control_mechanism(link_id))


def schedule_governance_action_index(action_id):
    transaction.on_commit(lambda: KnowledgeIngestionService.upsert_governance_action(action_id))


def schedule_evidence_link_target_index(link):
    target_type = link.target_type
    target_id = link.target_id
    if not target_type or not target_id:
        return

    if target_type == EvidenceLink.TargetType.INTERNAL_CONTROL:
        schedule_internal_control_index(target_id)
    elif target_type == EvidenceLink.TargetType.MECHANISM:
        schedule_mechanism_index(target_id)
    elif target_type == EvidenceLink.TargetType.GOVERNANCE_DOCUMENT:
        schedule_governance_document_index(target_id)
    elif target_type == EvidenceLink.TargetType.RUNBOOK_STEP:
        schedule_runbook_step_parent_index(target_id)
    elif target_type == EvidenceLink.TargetType.FRAMEWORK_CONTROL:
        schedule_control_index(target_id)
    elif target_type == EvidenceLink.TargetType.POLICY:
        schedule_policy_index(target_id)


@receiver(post_save, sender=Policy)
def index_policy_after_save(sender, instance, **kwargs):
    schedule_policy_index(instance.id)


@receiver(post_delete, sender=Policy)
def delete_policy_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_policy(instance.id))


@receiver(post_save, sender=PolicySection)
def reindex_policy_after_section_save(sender, instance, **kwargs):
    schedule_policy_index(instance.policy_id)


@receiver(post_delete, sender=PolicySection)
def reindex_policy_after_section_delete(sender, instance, **kwargs):
    schedule_policy_index(instance.policy_id)


@receiver(m2m_changed, sender=Policy.related_frameworks.through)
def reindex_policy_after_framework_change(sender, instance, action, **kwargs):
    if action in {"post_add", "post_remove", "post_clear"}:
        schedule_policy_index(instance.id)


@receiver(post_save, sender=TechnicalRegulation)
def index_technical_regulation_after_save(sender, instance, **kwargs):
    schedule_technical_regulation_index(instance.id)


@receiver(post_delete, sender=TechnicalRegulation)
def delete_technical_regulation_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_technical_regulation(instance.id))


@receiver(m2m_changed, sender=TechnicalRegulation.controls.through)
def reindex_technical_regulation_after_control_change(sender, instance, action, **kwargs):
    if action in {"post_add", "post_remove", "post_clear"}:
        schedule_technical_regulation_index(instance.id)


@receiver(post_save, sender=Procedure)
def index_procedure_after_save(sender, instance, **kwargs):
    schedule_procedure_index(instance.id)


@receiver(post_delete, sender=Procedure)
def delete_procedure_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_procedure(instance.id))


@receiver(m2m_changed, sender=Procedure.controls.through)
def reindex_procedure_after_control_change(sender, instance, action, **kwargs):
    if action in {"post_add", "post_remove", "post_clear"}:
        schedule_procedure_index(instance.id)


@receiver(post_save, sender=PolicyEvidence)
def index_policy_evidence_after_save(sender, instance, **kwargs):
    schedule_policy_evidence_index(instance.id)


@receiver(post_delete, sender=PolicyEvidence)
def delete_policy_evidence_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_policy_evidence(instance.id))


@receiver(post_save, sender=ComplianceGap)
def index_compliance_gap_after_save(sender, instance, **kwargs):
    schedule_compliance_gap_index(instance.id)


@receiver(post_delete, sender=ComplianceGap)
def delete_compliance_gap_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_compliance_gap(instance.id))


# --- Control and Mechanism: incremental indexing ------------------------------
# Asset and Vulnerability are deliberately excluded: they are imported in bulk by
# scanners / network discovery, so a synchronous per-row embedding call would be
# prohibitively slow. They remain on the `ingest_knowledge` management command.


@receiver(post_save, sender=Control)
def index_control_after_save(sender, instance, **kwargs):
    schedule_control_index(instance.id)


@receiver(post_delete, sender=Control)
def delete_control_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_control(instance.id))


@receiver(post_save, sender=Mechanism)
def index_mechanism_after_save(sender, instance, **kwargs):
    schedule_mechanism_index(instance.id)


@receiver(post_delete, sender=Mechanism)
def delete_mechanism_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_mechanism(instance.id))


@receiver(post_save, sender=SuggestedMechanism)
def reindex_mechanism_after_suggested_control_save(sender, instance, **kwargs):
    # A mechanism chunk embeds its linked controls, so a change to the
    # SuggestedMechanism link table must re-index the parent mechanism.
    schedule_mechanism_index(instance.mechanism_id)


@receiver(post_delete, sender=SuggestedMechanism)
def reindex_mechanism_after_suggested_control_delete(sender, instance, **kwargs):
    schedule_mechanism_index(instance.mechanism_id)


# --- New transversal governance layer ----------------------------------------


@receiver(post_save, sender=InternalControl)
def index_internal_control_after_save(sender, instance, **kwargs):
    schedule_internal_control_index(instance.id)


@receiver(post_delete, sender=InternalControl)
def delete_internal_control_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_internal_control(instance.id))


@receiver(post_save, sender=PolicyInternalControl)
def reindex_policy_internal_control_after_save(sender, instance, **kwargs):
    schedule_policy_index(instance.policy_id)
    schedule_internal_control_index(instance.internal_control_id)


@receiver(post_delete, sender=PolicyInternalControl)
def reindex_policy_internal_control_after_delete(sender, instance, **kwargs):
    if instance.policy_id:
        schedule_policy_index(instance.policy_id)
    if instance.internal_control_id:
        schedule_internal_control_index(instance.internal_control_id)


@receiver(post_save, sender=InternalControlFrameworkMapping)
def index_framework_mapping_after_save(sender, instance, **kwargs):
    schedule_framework_mapping_index(instance.id)
    schedule_internal_control_index(instance.internal_control_id)


@receiver(post_delete, sender=InternalControlFrameworkMapping)
def delete_framework_mapping_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_framework_mapping(instance.id))
    if instance.internal_control_id:
        schedule_internal_control_index(instance.internal_control_id)


@receiver(post_save, sender=InternalControlMechanism)
def index_internal_control_mechanism_after_save(sender, instance, **kwargs):
    schedule_internal_control_mechanism_index(instance.id)
    schedule_internal_control_index(instance.internal_control_id)
    schedule_mechanism_index(instance.mechanism_id)


@receiver(post_delete, sender=InternalControlMechanism)
def delete_internal_control_mechanism_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_internal_control_mechanism(instance.id))
    if instance.internal_control_id:
        schedule_internal_control_index(instance.internal_control_id)
    if instance.mechanism_id:
        schedule_mechanism_index(instance.mechanism_id)


@receiver(post_save, sender=GovernanceDocument)
def index_governance_document_after_save(sender, instance, **kwargs):
    schedule_governance_document_index(instance.id)


@receiver(post_delete, sender=GovernanceDocument)
def delete_governance_document_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_governance_document(instance.id))


@receiver(post_save, sender=GovernanceDocumentControl)
def reindex_governance_document_control_after_save(sender, instance, **kwargs):
    schedule_governance_document_index(instance.document_id)
    schedule_internal_control_index(instance.internal_control_id)


@receiver(post_delete, sender=GovernanceDocumentControl)
def reindex_governance_document_control_after_delete(sender, instance, **kwargs):
    if instance.document_id:
        schedule_governance_document_index(instance.document_id)
    if instance.internal_control_id:
        schedule_internal_control_index(instance.internal_control_id)


@receiver(post_save, sender=GovernanceDocumentSection)
def index_governance_section_after_save(sender, instance, **kwargs):
    schedule_governance_section_index(instance.id)
    schedule_governance_document_index(instance.document_id)


@receiver(post_delete, sender=GovernanceDocumentSection)
def delete_governance_section_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_governance_section(instance.id))
    if instance.document_id:
        schedule_governance_document_index(instance.document_id)


@receiver(post_save, sender=RunbookStep)
def reindex_runbook_document_after_step_save(sender, instance, **kwargs):
    schedule_governance_document_index(instance.runbook_id)


@receiver(post_delete, sender=RunbookStep)
def reindex_runbook_document_after_step_delete(sender, instance, **kwargs):
    if instance.runbook_id:
        schedule_governance_document_index(instance.runbook_id)


@receiver(post_save, sender=EvidenceItem)
def index_evidence_item_after_save(sender, instance, **kwargs):
    schedule_evidence_item_index(instance.id)


@receiver(post_delete, sender=EvidenceItem)
def delete_evidence_item_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_evidence_item(instance.id))


@receiver(post_save, sender=EvidenceLink)
def reindex_evidence_item_after_link_save(sender, instance, **kwargs):
    schedule_evidence_item_index(instance.evidence_item_id)
    schedule_evidence_link_target_index(instance)


@receiver(post_delete, sender=EvidenceLink)
def reindex_evidence_item_after_link_delete(sender, instance, **kwargs):
    if instance.evidence_item_id:
        schedule_evidence_item_index(instance.evidence_item_id)
    schedule_evidence_link_target_index(instance)


@receiver(post_save, sender=GovernanceAction)
def index_governance_action_after_save(sender, instance, **kwargs):
    schedule_governance_action_index(instance.id)


@receiver(post_delete, sender=GovernanceAction)
def delete_governance_action_chunk_after_delete(sender, instance, **kwargs):
    transaction.on_commit(lambda: KnowledgeIngestionService.delete_governance_action(instance.id))
