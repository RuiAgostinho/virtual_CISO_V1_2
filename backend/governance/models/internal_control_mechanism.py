import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .base import TimeStampedModel
from .internal_control import InternalControl
from .mechanism import Mechanism


class InternalControlMechanism(TimeStampedModel):
    class ImplementationStatus(models.TextChoices):
        NOT_IMPLEMENTED = "not_implemented", "Not implemented"
        PLANNED = "planned", "Planned"
        PARTIALLY_IMPLEMENTED = "partially_implemented", "Partially implemented"
        IMPLEMENTED = "implemented", "Implemented"
        IMPLEMENTED_EVIDENCED = "implemented_evidenced", "Implemented evidenced"
        NOT_APPLICABLE = "not_applicable", "Not applicable"

    class RelationshipType(models.TextChoices):
        PRIMARY = "primary", "Primary"
        SUPPORTING = "supporting", "Supporting"
        COMPENSATING = "compensating", "Compensating"
        PREVENTIVE = "preventive", "Preventive"
        DETECTIVE = "detective", "Detective"
        CORRECTIVE = "corrective", "Corrective"

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
        related_name="mechanism_links",
    )
    mechanism = models.ForeignKey(
        Mechanism,
        on_delete=models.CASCADE,
        related_name="internal_control_links",
    )
    contribution_weight = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    mandatory = models.BooleanField(default=False)
    implementation_status = models.CharField(
        max_length=30,
        choices=ImplementationStatus.choices,
        default=ImplementationStatus.NOT_IMPLEMENTED,
    )
    relationship_type = models.CharField(
        max_length=20,
        choices=RelationshipType.choices,
        default=RelationshipType.SUPPORTING,
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
        related_name="created_internal_control_mechanisms",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_internal_control_mechanisms",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="validated_internal_control_mechanisms",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["internal_control__code", "mechanism__title"]
        constraints = [
            models.UniqueConstraint(
                fields=["internal_control", "mechanism"],
                name="uq_internal_control_mechanism",
            ),
            models.CheckConstraint(
                condition=Q(contribution_weight__gte=0) & Q(contribution_weight__lte=100),
                name="ck_icm_weight_0_100",
            ),
            models.CheckConstraint(
                condition=Q(confidence_score__gte=0) & Q(confidence_score__lte=100),
                name="ck_icm_confidence_0_100",
            ),
        ]
        indexes = [
            models.Index(fields=["internal_control"], name="ix_icm_internal_control"),
            models.Index(fields=["mechanism"], name="ix_icm_mechanism"),
            models.Index(fields=["relationship_type"], name="ix_icm_relationship"),
            models.Index(fields=["mandatory"], name="ix_icm_mandatory"),
            models.Index(fields=["implementation_status"], name="ix_icm_impl_status"),
            models.Index(fields=["mapping_source"], name="ix_icm_source"),
            models.Index(fields=["validation_status"], name="ix_icm_validation"),
        ]

    def clean(self):
        super().clean()
        for field_name in ("contribution_weight", "confidence_score"):
            value = getattr(self, field_name)
            if value is not None and (value < 0 or value > 100):
                raise ValidationError({field_name: "O valor deve estar entre 0 e 100."})

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
        return f"{self.internal_control.code} -> {self.mechanism.title}"
