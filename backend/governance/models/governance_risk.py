import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .base import TimeStampedModel


class GovernanceRiskLink(TimeStampedModel):
    class SourceType(models.TextChoices):
        INTERNAL_CONTROL = "internal_control", "Internal control"
        MECHANISM = "mechanism", "Mechanism"
        INTERNAL_CONTROL_MECHANISM = "internal_control_mechanism", "Internal control mechanism"
        POLICY = "policy", "Policy"
        GOVERNANCE_DOCUMENT = "governance_document", "Governance document"

    class TargetType(models.TextChoices):
        RISK = "risk", "Risk"
        ASSET = "asset", "Asset"
        VULNERABILITY = "vulnerability", "Vulnerability"
        ASSET_VULNERABILITY = "asset_vulnerability", "Asset vulnerability"

    class RelationshipType(models.TextChoices):
        MITIGATES = "mitigates", "Mitigates"
        REDUCES_LIKELIHOOD = "reduces_likelihood", "Reduces likelihood"
        REDUCES_IMPACT = "reduces_impact", "Reduces impact"
        DETECTS = "detects", "Detects"
        PREVENTS = "prevents", "Prevents"
        COMPENSATES = "compensates", "Compensates"
        MONITORS = "monitors", "Monitors"

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
    source_type = models.CharField(max_length=40, choices=SourceType.choices)
    source_id = models.CharField(max_length=100)
    target_type = models.CharField(max_length=40, choices=TargetType.choices)
    target_id = models.CharField(max_length=100)
    relationship_type = models.CharField(
        max_length=40,
        choices=RelationshipType.choices,
        default=RelationshipType.MITIGATES,
    )
    effectiveness_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100,
        help_text="Estimated effectiveness of the governance source in this risk context.",
    )
    residual_impact_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Estimated percentage reduction contribution to residual risk.",
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
        related_name="created_governance_risk_links",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_governance_risk_links",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="validated_governance_risk_links",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["target_type", "target_id", "source_type", "source_id"]
        indexes = [
            models.Index(fields=["source_type", "source_id"], name="ix_grl_source"),
            models.Index(fields=["target_type", "target_id"], name="ix_grl_target"),
            models.Index(fields=["relationship_type"], name="ix_grl_relation"),
            models.Index(fields=["mapping_source"], name="ix_grl_source_type"),
            models.Index(fields=["validation_status"], name="ix_grl_validation"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "source_type",
                    "source_id",
                    "target_type",
                    "target_id",
                    "relationship_type",
                ],
                name="uq_governance_risk_link",
            ),
            models.CheckConstraint(
                condition=Q(effectiveness_percentage__gte=0) & Q(effectiveness_percentage__lte=100),
                name="ck_grl_effectiveness_0_100",
            ),
            models.CheckConstraint(
                condition=Q(residual_impact_percentage__gte=0) & Q(residual_impact_percentage__lte=100),
                name="ck_grl_residual_0_100",
            ),
            models.CheckConstraint(
                condition=Q(confidence_score__gte=0) & Q(confidence_score__lte=100),
                name="ck_grl_confidence_0_100",
            ),
        ]

    def clean(self):
        super().clean()
        for field_name in ("effectiveness_percentage", "residual_impact_percentage", "confidence_score"):
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
        return f"{self.source_type}:{self.source_id} -> {self.target_type}:{self.target_id}"
