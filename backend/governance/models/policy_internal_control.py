import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .base import TimeStampedModel
from .internal_control import InternalControl
from .policy_management import Policy


class PolicyInternalControl(TimeStampedModel):
    class Applicability(models.TextChoices):
        MANDATORY = "mandatory", "Mandatory"
        RECOMMENDED = "recommended", "Recommended"
        NOT_APPLICABLE = "not_applicable", "Not applicable"

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
    policy = models.ForeignKey(
        Policy,
        on_delete=models.CASCADE,
        related_name="internal_control_links",
    )
    internal_control = models.ForeignKey(
        InternalControl,
        on_delete=models.CASCADE,
        related_name="policy_links",
    )
    applicability = models.CharField(
        max_length=20,
        choices=Applicability.choices,
        default=Applicability.MANDATORY,
    )
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
        related_name="created_policy_internal_controls",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_policy_internal_controls",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="validated_policy_internal_controls",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["policy__code", "internal_control__code"]
        constraints = [
            models.UniqueConstraint(
                fields=["policy", "internal_control"],
                name="uq_policy_internal_control",
            ),
            models.CheckConstraint(
                condition=Q(confidence_score__gte=0) & Q(confidence_score__lte=100),
                name="ck_pic_confidence_0_100",
            ),
        ]
        indexes = [
            models.Index(fields=["policy"], name="ix_pic_policy"),
            models.Index(fields=["internal_control"], name="ix_pic_internal_control"),
            models.Index(fields=["applicability"], name="ix_pic_applicability"),
            models.Index(fields=["mapping_source"], name="ix_pic_source"),
            models.Index(fields=["validation_status"], name="ix_pic_validation"),
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
        return f"{self.policy.code} -> {self.internal_control.code}"
