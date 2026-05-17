import logging

from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import ComplianceGap, Control, Policy, PolicyEvidence, PolicySection, Procedure, TechnicalRegulation
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