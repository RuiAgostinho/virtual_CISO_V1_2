import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .base import TimeStampedModel
from .control import Control


class InternalControl(TimeStampedModel):
    class Criticality(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        MIGRATED = "migrated", "Migrated"
        IMPORTED = "imported", "Imported"
        AI_SUGGESTED = "ai_suggested", "AI suggested"
        RULE_BASED = "rule_based", "Rule based"
        TEMPLATE = "template", "Template"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        DEPRECATED = "deprecated", "Deprecated"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=100, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    control_domain = models.CharField(max_length=150, blank=True)
    objective = models.TextField(blank=True)
    risk_statement = models.TextField(blank=True)
    owner_role = models.CharField(max_length=150, blank=True)
    criticality = models.CharField(
        max_length=20,
        choices=Criticality.choices,
        default=Criticality.MEDIUM,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
    )
    legacy_control = models.ForeignKey(
        Control,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="internal_controls",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        indexes = [
            models.Index(fields=["code"], name="ix_internal_control_code"),
            models.Index(fields=["status"], name="ix_internal_control_status"),
            models.Index(fields=["source"], name="ix_internal_control_source"),
            models.Index(fields=["control_domain"], name="ix_internal_control_domain"),
            models.Index(fields=["is_active"], name="ix_internal_control_active"),
        ]

    def __str__(self):
        return f"{self.code} {self.title}"


class InternalControlFrameworkMapping(TimeStampedModel):
    class RelationshipType(models.TextChoices):
        EQUIVALENT = "equivalent", "Equivalent"
        PARTIAL = "partial", "Partial"
        SUPPORTS = "supports", "Supports"
        OVERLAPS = "overlaps", "Overlaps"
        DERIVED = "derived", "Derived"

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
    internal_control = models.ForeignKey(
        InternalControl,
        on_delete=models.CASCADE,
        related_name="framework_mappings",
    )
    framework_control = models.ForeignKey(
        Control,
        on_delete=models.CASCADE,
        related_name="internal_control_mappings",
    )
    relationship_type = models.CharField(
        max_length=20,
        choices=RelationshipType.choices,
        default=RelationshipType.PARTIAL,
    )
    coverage_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
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
        related_name="created_internal_control_mappings",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_internal_control_mappings",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="validated_internal_control_mappings",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["internal_control__code", "framework_control__framework__code", "framework_control__code"]
        constraints = [
            models.UniqueConstraint(
                fields=["internal_control", "framework_control"],
                name="uq_internal_control_framework_control",
            ),
            models.CheckConstraint(
                condition=Q(coverage_percentage__gte=0) & Q(coverage_percentage__lte=100),
                name="ck_icfm_coverage_0_100",
            ),
            models.CheckConstraint(
                condition=Q(confidence_score__gte=0) & Q(confidence_score__lte=100),
                name="ck_icfm_confidence_0_100",
            ),
        ]
        indexes = [
            models.Index(fields=["internal_control"], name="ix_icfm_internal_control"),
            models.Index(fields=["framework_control"], name="ix_icfm_framework_control"),
            models.Index(fields=["relationship_type"], name="ix_icfm_relationship"),
            models.Index(fields=["mapping_source"], name="ix_icfm_source"),
            models.Index(fields=["validation_status"], name="ix_icfm_validation"),
        ]

    def clean(self):
        super().clean()
        for field_name in ("coverage_percentage", "confidence_score"):
            value = getattr(self, field_name)
            if value is not None and (value < 0 or value > 100):
                raise ValidationError({field_name: "O valor deve estar entre 0 e 100."})

    @property
    def is_official(self):
        return self.validation_status == self.ValidationStatus.APPROVED

    @property
    def is_active(self):
        return self.validation_status not in {
            self.ValidationStatus.REJECTED,
            self.ValidationStatus.DEPRECATED,
        }

    def approve(self, user=None):
        self.validation_status = self.ValidationStatus.APPROVED
        self.validated_at = timezone.now()
        if user and getattr(user, "is_authenticated", False):
            self.validated_by = user
            self.updated_by = user

    def reject(self, user=None):
        self.validation_status = self.ValidationStatus.REJECTED
        if user and getattr(user, "is_authenticated", False):
            self.validated_by = user
            self.validated_at = timezone.now()
            self.updated_by = user

    def mark_deprecated(self, user=None):
        self.validation_status = self.ValidationStatus.DEPRECATED
        if user and getattr(user, "is_authenticated", False):
            self.updated_by = user

    def __str__(self):
        return f"{self.internal_control.code} -> {self.framework_control.framework.code}:{self.framework_control.code}"
