import uuid

from django.db import models
from django.utils import timezone

from .base import TimeStampedModel


class CompliancePropagationResult(TimeStampedModel):
    class ResultType(models.TextChoices):
        MECHANISM = "mechanism", "Mechanism"
        INTERNAL_CONTROL = "internal_control", "Internal control"
        POLICY = "policy", "Policy"
        GOVERNANCE_DOCUMENT = "governance_document", "Governance document"
        FRAMEWORK_CONTROL = "framework_control", "Framework control"
        FRAMEWORK = "framework", "Framework"
        DOMAIN = "domain", "Domain"

    class CalculationMode(models.TextChoices):
        OFFICIAL = "official", "Official"
        SIMULATION = "simulation", "Simulation"
        EXPLORATORY = "exploratory", "Exploratory"

    class Status(models.TextChoices):
        NOT_ASSESSED = "not_assessed", "Not assessed"
        NON_COMPLIANT = "non_compliant", "Non compliant"
        PARTIALLY_COMPLIANT = "partially_compliant", "Partially compliant"
        MOSTLY_COMPLIANT = "mostly_compliant", "Mostly compliant"
        COMPLIANT = "compliant", "Compliant"
        NOT_APPLICABLE = "not_applicable", "Not applicable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    result_type = models.CharField(max_length=30, choices=ResultType.choices)
    target_type = models.CharField(max_length=40)
    target_id = models.CharField(max_length=100)
    score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.NOT_ASSESSED)
    calculation_mode = models.CharField(
        max_length=20,
        choices=CalculationMode.choices,
        default=CalculationMode.OFFICIAL,
    )
    calculated_at = models.DateTimeField(default=timezone.now)
    details = models.JSONField(default=dict, blank=True)
    gaps = models.JSONField(default=list, blank=True)
    recommendations = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-calculated_at", "result_type", "target_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["result_type", "target_type", "target_id", "calculation_mode"],
                name="uq_compliance_propagation_result",
            ),
        ]
        indexes = [
            models.Index(fields=["result_type"], name="ix_cpr_result_type"),
            models.Index(fields=["target_type", "target_id"], name="ix_cpr_target"),
            models.Index(fields=["calculation_mode"], name="ix_cpr_mode"),
            models.Index(fields=["status"], name="ix_cpr_status"),
            models.Index(fields=["calculated_at"], name="ix_cpr_calculated_at"),
        ]

    def __str__(self):
        return f"{self.result_type}:{self.target_id} {self.score}% ({self.calculation_mode})"
