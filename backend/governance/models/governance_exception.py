import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .base import TimeStampedModel
from .decision import DecisionRecord


class GovernanceException(TimeStampedModel):
    class ExceptionType(models.TextChoices):
        POLICY_EXCEPTION = "policy_exception", "Policy exception"
        CONTROL_EXCEPTION = "control_exception", "Control exception"
        RISK_ACCEPTANCE = "risk_acceptance", "Risk acceptance"
        IMPLEMENTATION_DELAY = "implementation_delay", "Implementation delay"
        COMPENSATING_CONTROL = "compensating_control", "Compensating control"

    class TargetType(models.TextChoices):
        POLICY = "policy", "Policy"
        INTERNAL_CONTROL = "internal_control", "Internal control"
        FRAMEWORK_CONTROL = "framework_control", "Framework control"
        MECHANISM = "mechanism", "Mechanism"
        INTERNAL_CONTROL_MECHANISM = "internal_control_mechanism", "Internal control mechanism"
        GOVERNANCE_DOCUMENT = "governance_document", "Governance document"
        RISK = "risk", "Risk"
        ASSET = "asset", "Asset"
        VULNERABILITY = "vulnerability", "Vulnerability"

    class ApprovalStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exception_type = models.CharField(
        max_length=40,
        choices=ExceptionType.choices,
        default=ExceptionType.RISK_ACCEPTANCE,
    )
    target_type = models.CharField(max_length=40, choices=TargetType.choices)
    target_id = models.CharField(max_length=100)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    business_justification = models.TextField(blank=True)
    compensating_control_description = models.TextField(blank=True)
    risk_impact = models.TextField(blank=True)
    compliance_impact = models.TextField(blank=True)
    score_impact = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        help_text="Estimated impact in percentage points. Negative values reduce the adjusted score.",
    )
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    owner = models.CharField(max_length=255, blank=True)
    approver = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.DRAFT,
    )
    review_note = models.TextField(blank=True)
    evidence_reference = models.TextField(blank=True)
    action_reference = models.TextField(blank=True)
    linked_decision = models.ForeignKey(
        DecisionRecord,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="governance_exceptions",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_governance_exceptions",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_governance_exceptions",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_governance_exceptions",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["exception_type"], name="ix_gov_exc_type"),
            models.Index(fields=["target_type", "target_id"], name="ix_gov_exc_target"),
            models.Index(fields=["approval_status"], name="ix_gov_exc_status"),
            models.Index(fields=["valid_until"], name="ix_gov_exc_valid_until"),
            models.Index(fields=["owner"], name="ix_gov_exc_owner"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(score_impact__gte=-100) & Q(score_impact__lte=100),
                name="ck_gov_exc_score_impact",
            ),
        ]

    def clean(self):
        super().clean()
        if self.valid_from and self.valid_until and self.valid_until < self.valid_from:
            raise ValidationError({"valid_until": "A data de fim deve ser posterior ao inicio."})

    @property
    def is_expired(self):
        return bool(self.valid_until and self.valid_until < timezone.localdate())

    @property
    def is_currently_active(self):
        today = timezone.localdate()
        starts_ok = not self.valid_from or self.valid_from <= today
        ends_ok = not self.valid_until or self.valid_until >= today
        return self.approval_status == self.ApprovalStatus.APPROVED and starts_ok and ends_ok

    def approve(self, user=None):
        self.approval_status = self.ApprovalStatus.APPROVED
        self.approved_at = timezone.now()
        if user and getattr(user, "is_authenticated", False):
            self.approved_by = user
            self.updated_by = user

    def reject(self, review_note="", user=None):
        self.approval_status = self.ApprovalStatus.REJECTED
        if review_note:
            self.review_note = review_note
        if user and getattr(user, "is_authenticated", False):
            self.updated_by = user

    def revoke(self, review_note="", user=None):
        self.approval_status = self.ApprovalStatus.REVOKED
        if review_note:
            self.review_note = review_note
        if user and getattr(user, "is_authenticated", False):
            self.updated_by = user

    def mark_expired(self, user=None):
        self.approval_status = self.ApprovalStatus.EXPIRED
        if user and getattr(user, "is_authenticated", False):
            self.updated_by = user

    def __str__(self):
        return f"{self.get_exception_type_display()} - {self.title}"
