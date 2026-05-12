import uuid
from django.db import models
from .base import TimeStampedModel


class DecisionRecord(TimeStampedModel):
    class DecisionType(models.TextChoices):
        RISK = "risk", "Risk"
        VULNERABILITY = "vulnerability", "Vulnerability"
        COMPLIANCE_GAP = "compliance_gap", "Compliance Gap"
        ASSISTANT_RECOMMENDATION = "assistant_recommendation", "Assistant Recommendation"

    class Decision(models.TextChoices):
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        DEFERRED = "deferred", "Deferred"
        CONVERTED_TO_ACTION = "converted_to_action", "Converted to Action"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    decision_type = models.CharField(max_length=40, choices=DecisionType.choices)
    target_type = models.CharField(max_length=100)
    target_id = models.CharField(max_length=100)

    title = models.CharField(max_length=255)
    recommendation = models.TextField(blank=True)
    rationale = models.TextField(blank=True)

    source_snapshot = models.JSONField(default=list, blank=True)
    score_snapshot = models.JSONField(default=dict, blank=True)

    decision = models.CharField(max_length=30, choices=Decision.choices, default=Decision.DEFERRED)
    justification = models.TextField(blank=True)
    decided_by = models.CharField(max_length=150, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["decision_type", "decision"], name="ix_decision_type_status"),
            models.Index(fields=["target_type", "target_id"], name="ix_decision_target"),
            models.Index(fields=["decided_at"], name="ix_decision_decided_at"),
        ]

    def __str__(self):
        return f"{self.get_decision_display()} - {self.title}"