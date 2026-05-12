import logging

from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import ComplianceGap, Policy, PolicyEvidence, PolicySection, Procedure, TechnicalRegulation

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