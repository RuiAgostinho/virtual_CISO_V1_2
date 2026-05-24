import uuid

from django.apps import apps
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .assessment import Evidence
from .base import TimeStampedModel


class EvidenceItem(TimeStampedModel):
    class EvidenceType(models.TextChoices):
        REPORT = "report", "Report"
        SCREENSHOT = "screenshot", "Screenshot"
        TICKET = "ticket", "Ticket"
        LOG = "log", "Log"
        AUDIT_REPORT = "audit_report", "Audit report"
        CONFIGURATION_EXPORT = "configuration_export", "Configuration export"
        MEETING_MINUTES = "meeting_minutes", "Meeting minutes"
        APPROVAL_RECORD = "approval_record", "Approval record"
        VULNERABILITY_SCAN = "vulnerability_scan", "Vulnerability scan"
        SIEM_ALERT = "siem_alert", "SIEM alert"
        MANUAL_ATTESTATION = "manual_attestation", "Manual attestation"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        VALID = "valid", "Valid"
        EXPIRED = "expired", "Expired"
        REJECTED = "rejected", "Rejected"
        DEPRECATED = "deprecated", "Deprecated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    evidence_type = models.CharField(max_length=30, choices=EvidenceType.choices, default=EvidenceType.OTHER)
    source = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to="evidence_items/", blank=True, null=True)
    external_reference = models.CharField(max_length=2048, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    confidence_level = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    owner = models.CharField(max_length=255, blank=True)
    legacy_evidence = models.ForeignKey(
        Evidence,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="evidence_items",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["title"]
        constraints = [
            models.CheckConstraint(
                condition=Q(confidence_level__gte=0) & Q(confidence_level__lte=100),
                name="ck_eitem_confidence_0_100",
            ),
        ]
        indexes = [
            models.Index(fields=["evidence_type"], name="ix_eitem_type"),
            models.Index(fields=["status"], name="ix_eitem_status"),
            models.Index(fields=["owner"], name="ix_eitem_owner"),
            models.Index(fields=["valid_until"], name="ix_eitem_valid_until"),
            models.Index(fields=["is_active"], name="ix_eitem_active"),
        ]

    def clean(self):
        super().clean()
        if self.confidence_level is not None and (
            self.confidence_level < 0 or self.confidence_level > 100
        ):
            raise ValidationError({"confidence_level": "O valor deve estar entre 0 e 100."})

    @property
    def is_expired(self):
        if self.status == self.Status.EXPIRED:
            return True
        return bool(self.valid_until and self.valid_until < timezone.localdate())

    @property
    def is_score_eligible(self):
        return self.is_active and self.status == self.Status.VALID and not self.is_expired

    def __str__(self):
        return self.title


class EvidenceLink(TimeStampedModel):
    class TargetType(models.TextChoices):
        INTERNAL_CONTROL = "internal_control", "Internal control"
        MECHANISM = "mechanism", "Mechanism"
        GOVERNANCE_DOCUMENT = "governance_document", "Governance document"
        RUNBOOK_STEP = "runbook_step", "Runbook step"
        FRAMEWORK_CONTROL = "framework_control", "Framework control"
        POLICY = "policy", "Policy"
        RISK = "risk", "Risk"
        ASSET = "asset", "Asset"
        VULNERABILITY = "vulnerability", "Vulnerability"
        FINDING = "finding", "Finding"
        IMPROVEMENT_ACTION = "improvement_action", "Improvement action"

    class LinkType(models.TextChoices):
        EVIDENCES = "evidences", "Evidences"
        SUPPORTS = "supports", "Supports"
        VALIDATES = "validates", "Validates"
        DEMONSTRATES = "demonstrates", "Demonstrates"
        MITIGATES = "mitigates", "Mitigates"
        JUSTIFIES = "justifies", "Justifies"
        PRODUCED_BY = "produced_by", "Produced by"
        REQUIRED_BY = "required_by", "Required by"

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

    TARGET_MODEL_MAP = {
        TargetType.INTERNAL_CONTROL: ("governance", "InternalControl"),
        TargetType.MECHANISM: ("governance", "Mechanism"),
        TargetType.GOVERNANCE_DOCUMENT: ("governance", "GovernanceDocument"),
        TargetType.RUNBOOK_STEP: ("governance", "RunbookStep"),
        TargetType.FRAMEWORK_CONTROL: ("governance", "Control"),
        TargetType.POLICY: ("governance", "Policy"),
        TargetType.RISK: ("risk", "Risk"),
        TargetType.ASSET: ("risk", "Asset"),
        TargetType.VULNERABILITY: ("risk", "Vulnerability"),
        TargetType.FINDING: ("governance", "Finding"),
        TargetType.IMPROVEMENT_ACTION: ("governance", "ImprovementAction"),
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    evidence_item = models.ForeignKey(EvidenceItem, on_delete=models.CASCADE, related_name="links")
    target_type = models.CharField(max_length=40, choices=TargetType.choices)
    target_id = models.UUIDField()
    target_content_type = models.ForeignKey(
        ContentType,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="evidence_links",
    )
    target = GenericForeignKey("target_content_type", "target_id")
    link_type = models.CharField(max_length=20, choices=LinkType.choices, default=LinkType.EVIDENCES)
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
        related_name="created_evidence_links",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_evidence_links",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="validated_evidence_links",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["evidence_item__title", "target_type", "link_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["evidence_item", "target_type", "target_id", "link_type"],
                name="uq_evidence_link_target_type",
            ),
            models.CheckConstraint(
                condition=Q(confidence_score__gte=0) & Q(confidence_score__lte=100),
                name="ck_elink_confidence_0_100",
            ),
        ]
        indexes = [
            models.Index(fields=["evidence_item"], name="ix_elink_evidence"),
            models.Index(fields=["target_type", "target_id"], name="ix_elink_target"),
            models.Index(fields=["link_type"], name="ix_elink_link_type"),
            models.Index(fields=["mapping_source"], name="ix_elink_source"),
            models.Index(fields=["validation_status"], name="ix_elink_validation"),
        ]

    @classmethod
    def content_type_for_target_type(cls, target_type):
        app_label, model_name = cls.TARGET_MODEL_MAP[target_type]
        model = apps.get_model(app_label, model_name)
        return ContentType.objects.get_for_model(model)

    def clean(self):
        super().clean()
        if self.confidence_score is not None and (
            self.confidence_score < 0 or self.confidence_score > 100
        ):
            raise ValidationError({"confidence_score": "O valor deve estar entre 0 e 100."})
        if self.target_type and self.target_type not in self.TARGET_MODEL_MAP:
            raise ValidationError({"target_type": "Tipo de alvo não suportado."})

    def save(self, *args, **kwargs):
        if self.target_type and not self.target_content_type_id:
            self.target_content_type = self.content_type_for_target_type(self.target_type)
        return super().save(*args, **kwargs)

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
        return f"{self.evidence_item.title} -> {self.target_type}:{self.target_id}"
