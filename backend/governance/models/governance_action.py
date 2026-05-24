import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from .base import TimeStampedModel
from .decision import DecisionRecord
from .governance_exception import GovernanceException


class GovernanceAction(TimeStampedModel):
    class ActionType(models.TextChoices):
        CORRECT_POLICY = "correct_policy", "Correct policy"
        MAP_CONTROL = "map_control", "Map control"
        IMPLEMENT_MECHANISM = "implement_mechanism", "Implement mechanism"
        COLLECT_EVIDENCE = "collect_evidence", "Collect evidence"
        REVIEW_DOCUMENT = "review_document", "Review document"
        APPROVE_MAPPING = "approve_mapping", "Approve mapping"
        UPDATE_FRAMEWORK = "update_framework", "Update framework"
        REVIEW_EXCEPTION = "review_exception", "Review exception"
        REVIEW_SCORE = "review_score", "Review score"
        OTHER = "other", "Other"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        BLOCKED = "blocked", "Blocked"
        DONE = "done", "Done"
        DEFERRED = "deferred", "Deferred"
        CANCELLED = "cancelled", "Cancelled"

    class SourceType(models.TextChoices):
        MANUAL = "manual", "Manual"
        WORKBENCH = "workbench", "Workbench"
        COMPLIANCE_GAP = "compliance_gap", "Compliance gap"
        AI_RECOMMENDATION = "ai_recommendation", "AI recommendation"
        SCORE = "score", "Score"
        EXCEPTION = "exception", "Exception"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    action_type = models.CharField(max_length=40, choices=ActionType.choices, default=ActionType.OTHER)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    recommendation = models.TextField(blank=True)
    target_type = models.CharField(max_length=80, blank=True)
    target_id = models.CharField(max_length=100, blank=True)
    source_type = models.CharField(max_length=40, choices=SourceType.choices, default=SourceType.MANUAL)
    source_key = models.CharField(max_length=120, blank=True)
    owner = models.CharField(max_length=255, blank=True)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    due_date = models.DateField(null=True, blank=True)
    estimated_effort_hours = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    required_roles = models.TextField(blank=True)
    required_materials = models.TextField(blank=True)
    evidence_required = models.BooleanField(default=False)
    expected_evidence = models.TextField(blank=True)
    ai_generated = models.BooleanField(default=False)
    ai_rationale = models.TextField(blank=True)
    dependency_notes = models.TextField(blank=True)
    score_impact = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    linked_decision = models.ForeignKey(
        DecisionRecord,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="governance_actions",
    )
    linked_exception = models.ForeignKey(
        GovernanceException,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="governance_actions",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_governance_actions",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_governance_actions",
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="completed_governance_actions",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["status", "due_date", "-created_at"]
        indexes = [
            models.Index(fields=["status", "priority"], name="ix_gov_action_status_prio"),
            models.Index(fields=["action_type"], name="ix_gov_action_type"),
            models.Index(fields=["due_date"], name="ix_gov_action_due"),
            models.Index(fields=["source_type", "source_key"], name="ix_gov_action_source"),
            models.Index(fields=["target_type", "target_id"], name="ix_gov_action_target"),
            models.Index(fields=["owner"], name="ix_gov_action_owner"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(score_impact__gte=-100) & Q(score_impact__lte=100),
                name="ck_gov_action_score_impact",
            ),
            models.UniqueConstraint(
                fields=["source_type", "source_key"],
                condition=~Q(source_key="") & ~Q(status__in=["done", "cancelled"]),
                name="uq_gov_action_active_source",
            ),
        ]

    @property
    def is_overdue(self):
        return bool(self.due_date and self.status not in {self.Status.DONE, self.Status.CANCELLED} and self.due_date < timezone.localdate())

    def set_status(self, status, user=None):
        self.status = status
        if status == self.Status.DONE:
            self.completed_at = timezone.now()
            if user and getattr(user, "is_authenticated", False):
                self.completed_by = user
        elif status != self.Status.DONE:
            self.completed_at = None
            self.completed_by = None
        if user and getattr(user, "is_authenticated", False):
            self.updated_by = user

    def __str__(self):
        return f"{self.get_action_type_display()} - {self.title}"
