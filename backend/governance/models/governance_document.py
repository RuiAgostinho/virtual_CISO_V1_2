import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .base import TimeStampedModel
from .documents import Procedure, TechnicalRegulation
from .internal_control import InternalControl
from .policy_management import Policy


class GovernanceDocument(TimeStampedModel):
    class DocumentType(models.TextChoices):
        POLICY = "policy", "Policy"
        STANDARD = "standard", "Standard"
        PROCEDURE = "procedure", "Procedure"
        GUIDELINE = "guideline", "Guideline"
        TECHNICAL_REGULATION = "technical_regulation", "Technical regulation"
        RUNBOOK = "runbook", "Runbook"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        UNDER_REVIEW = "under_review", "Under review"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        DEPRECATED = "deprecated", "Deprecated"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    document_type = models.CharField(
        max_length=30,
        choices=DocumentType.choices,
        default=DocumentType.POLICY,
    )
    version = models.CharField(max_length=20, default="1.0")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    owner = models.CharField(max_length=255, blank=True)
    parent_document = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="children",
    )
    scope = models.TextField(blank=True)
    purpose = models.TextField(blank=True)
    content = models.TextField(blank=True)
    approval_date = models.DateField(null=True, blank=True)
    review_date = models.DateField(null=True, blank=True)
    legacy_policy = models.ForeignKey(
        Policy,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="governance_documents",
    )
    legacy_technical_regulation = models.ForeignKey(
        TechnicalRegulation,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="governance_documents",
    )
    legacy_procedure = models.ForeignKey(
        Procedure,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="governance_documents",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["document_type", "title"]
        indexes = [
            models.Index(fields=["document_type"], name="ix_gdoc_type"),
            models.Index(fields=["status"], name="ix_gdoc_status"),
            models.Index(fields=["owner"], name="ix_gdoc_owner"),
            models.Index(fields=["parent_document"], name="ix_gdoc_parent"),
            models.Index(fields=["is_active"], name="ix_gdoc_active"),
        ]

    def clean(self):
        super().clean()
        if self.parent_document_id and self.parent_document_id == self.id:
            raise ValidationError({"parent_document": "Um documento não pode ser parent de si próprio."})

    def __str__(self):
        return f"{self.get_document_type_display()}: {self.title}"


class GovernanceDocumentControl(TimeStampedModel):
    class Purpose(models.TextChoices):
        DEFINES = "defines", "Defines"
        IMPLEMENTS = "implements", "Implements"
        OPERATIONALIZES = "operationalizes", "Operationalizes"
        EVIDENCES = "evidences", "Evidences"

    class MappingSource(models.TextChoices):
        MANUAL = "manual", "Manual"
        MIGRATED = "migrated", "Migrated"
        IMPORTED = "imported", "Imported"
        AI_SUGGESTED = "ai_suggested", "AI suggested"
        RULE_BASED = "rule_based", "Rule based"
        TEMPLATE = "template", "Template"

    class ValidationStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        DEPRECATED = "deprecated", "Deprecated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        GovernanceDocument,
        on_delete=models.CASCADE,
        related_name="control_links",
    )
    internal_control = models.ForeignKey(
        InternalControl,
        on_delete=models.CASCADE,
        related_name="document_links",
    )
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.DEFINES)
    rationale = models.TextField(blank=True)
    mapping_source = models.CharField(
        max_length=20,
        choices=MappingSource.choices,
        default=MappingSource.MANUAL,
    )
    validation_status = models.CharField(
        max_length=20,
        choices=ValidationStatus.choices,
        default=ValidationStatus.DRAFT,
    )
    confidence_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_governance_document_controls",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_governance_document_controls",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="validated_governance_document_controls",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["document__title", "internal_control__code", "purpose"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "internal_control", "purpose"],
                name="uq_gdoc_control_purpose",
            ),
            models.CheckConstraint(
                condition=Q(confidence_score__gte=0) & Q(confidence_score__lte=100),
                name="ck_gdc_confidence_0_100",
            ),
        ]
        indexes = [
            models.Index(fields=["document"], name="ix_gdc_document"),
            models.Index(fields=["internal_control"], name="ix_gdc_internal"),
            models.Index(fields=["purpose"], name="ix_gdc_purpose"),
            models.Index(fields=["mapping_source"], name="ix_gdc_source"),
            models.Index(fields=["validation_status"], name="ix_gdc_validation"),
        ]

    def clean(self):
        super().clean()
        if self.confidence_score is not None and (
            self.confidence_score < 0 or self.confidence_score > 100
        ):
            raise ValidationError({"confidence_score": "O valor deve estar entre 0 e 100."})

    @property
    def is_active(self):
        return self.validation_status not in {
            self.ValidationStatus.REJECTED,
            self.ValidationStatus.DEPRECATED,
        }

    @property
    def is_official(self):
        return self.validation_status == self.ValidationStatus.APPROVED

    def approve(self, user=None):
        self.validation_status = self.ValidationStatus.APPROVED
        self.validated_at = timezone.now()
        if user and getattr(user, "is_authenticated", False):
            self.validated_by = user
            self.updated_by = user

    def reject(self, rationale, user=None):
        self.validation_status = self.ValidationStatus.REJECTED
        self.rationale = rationale
        self.validated_at = timezone.now()
        if user and getattr(user, "is_authenticated", False):
            self.validated_by = user
            self.updated_by = user

    def mark_deprecated(self, user=None):
        self.validation_status = self.ValidationStatus.DEPRECATED
        if user and getattr(user, "is_authenticated", False):
            self.updated_by = user

    def __str__(self):
        return f"{self.document.title} -> {self.internal_control.code} ({self.purpose})"


class GovernanceDocumentSection(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        GovernanceDocument,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    section_number = models.CharField(max_length=50, blank=True)
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    parent_section = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="subsections",
    )

    class Meta:
        ordering = ["document__title", "order", "section_number"]
        indexes = [
            models.Index(fields=["document"], name="ix_gdsec_document"),
            models.Index(fields=["parent_section"], name="ix_gdsec_parent"),
            models.Index(fields=["order"], name="ix_gdsec_order"),
        ]

    def clean(self):
        super().clean()
        if self.parent_section and self.parent_section.document_id != self.document_id:
            raise ValidationError({"parent_section": "A secção parent tem de pertencer ao mesmo documento."})

    def __str__(self):
        return f"{self.document.title} - {self.title}"


class RunbookStep(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    runbook = models.ForeignKey(
        GovernanceDocument,
        on_delete=models.CASCADE,
        related_name="runbook_steps",
    )
    step_number = models.PositiveIntegerField()
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    expected_output = models.TextField(blank=True)
    evidence_required = models.BooleanField(default=False)

    class Meta:
        ordering = ["runbook__title", "step_number"]
        constraints = [
            models.UniqueConstraint(fields=["runbook", "step_number"], name="uq_runbook_step_number"),
        ]
        indexes = [
            models.Index(fields=["runbook"], name="ix_runbook_step_doc"),
            models.Index(fields=["step_number"], name="ix_runbook_step_no"),
        ]

    def clean(self):
        super().clean()
        if self.runbook and self.runbook.document_type != GovernanceDocument.DocumentType.RUNBOOK:
            raise ValidationError({"runbook": "RunbookStep só pode ser associado a GovernanceDocument do tipo runbook."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.runbook.title} - {self.step_number}. {self.title}"
