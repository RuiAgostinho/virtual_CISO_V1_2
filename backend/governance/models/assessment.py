import uuid

from django.db import models

from .framework import FrameworkProfile

from .control import Control

from .base import TimeStampedModel

from django.core.exceptions import ValidationError

from django.db.models import Q





class ControlAssessment(TimeStampedModel):

    class ImplementationStatus(models.TextChoices):

        NOT_STARTED = "not_started", "Not started"

        PLANNED = "planned", "Planned"

        PARTIAL = "partial", "Partial"

        IMPLEMENTED = "implemented", "Implemented"

        OPTIMIZED = "optimized", "Optimized"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    profile = models.ForeignKey(FrameworkProfile, on_delete=models.CASCADE, related_name="assessments")

    control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="assessments")



    implementation_status = models.CharField(

        max_length=20, choices=ImplementationStatus.choices, default=ImplementationStatus.NOT_STARTED

    )

    maturity_level = models.PositiveSmallIntegerField(default=0)

    effectiveness = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)  # 0..1



    risk_inherent = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)  # 0..1 (opcional)

    risk_residual = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)  # 0..1 (opcional)



    notes = models.TextField(blank=True)

    assessed_at = models.DateTimeField(null=True, blank=True)

    assessed_by = models.CharField(max_length=150, blank=True)



    class Meta:

        constraints = [

            models.UniqueConstraint(fields=["profile", "control"], name="uq_assessment_profile_control"),

            models.CheckConstraint(condition=Q(maturity_level__gte=0), name="ck_assessment_maturity_gte_0"),

            models.CheckConstraint(condition=Q(effectiveness__gte=0) & Q(effectiveness__lte=1), name="ck_assessment_eff_0_1"),

            models.CheckConstraint(condition=Q(risk_inherent__gte=0) & Q(risk_inherent__lte=1), name="ck_assessment_rin_0_1"),

            models.CheckConstraint(condition=Q(risk_residual__gte=0) & Q(risk_residual__lte=1), name="ck_assessment_rres_0_1"),

        ]

        indexes = [

            models.Index(fields=["profile", "implementation_status"], name="ix_assessment_profile_status"),

            models.Index(fields=["control"], name="ix_assessment_control"),

        ]



    def clean(self):

        super().clean()

        if self.profile and self.control and self.control.framework_id != self.profile.framework_id:

            raise ValidationError("O controlo e o profile tÃªm de ser da mesma framework.")

        if self.profile and self.maturity_level is not None and self.maturity_level > self.profile.max_level:

            raise ValidationError(f"maturity_level ({self.maturity_level}) excede o max_level do profile ({self.profile.max_level}).")



    def save(self, *args, **kwargs):

        # garante validaÃ§Ã£o tambÃ©m em save() quando nÃ£o hÃ¡ forms

        self.full_clean()

        return super().save(*args, **kwargs)

    

class Evidence(TimeStampedModel):

    class EvidenceType(models.TextChoices):

        POLICY = "policy", "Policy"

        PROCEDURE = "procedure", "Procedure"

        LOG = "log", "Log"

        SCREENSHOT = "screenshot", "Screenshot"

        TICKET = "ticket", "Ticket"

        CONFIG = "config", "Config"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    assessment = models.ForeignKey(ControlAssessment, on_delete=models.CASCADE, related_name="evidence")

    evidence_type = models.CharField(max_length=20, choices=EvidenceType.choices)

    title = models.CharField(max_length=255)

    uri = models.CharField(max_length=2048, blank=True)

    hash_sha256 = models.CharField(max_length=64, blank=True)

    collected_at = models.DateTimeField(null=True, blank=True)



    class Meta:

        indexes = [

            models.Index(fields=["assessment", "evidence_type"], name="ix_evidence_assessment_type"),

        ]



class Finding(TimeStampedModel):

    class Severity(models.TextChoices):

        LOW = "low", "Low"

        MEDIUM = "medium", "Medium"

        HIGH = "high", "High"

        CRITICAL = "critical", "Critical"



    class Status(models.TextChoices):

        OPEN = "open", "Open"

        MITIGATED = "mitigated", "Mitigated"

        ACCEPTED = "accepted", "Accepted"

        CLOSED = "closed", "Closed"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    assessment = models.ForeignKey(ControlAssessment, on_delete=models.CASCADE, related_name="findings")

    severity = models.CharField(max_length=10, choices=Severity.choices)

    title = models.CharField(max_length=255)

    description = models.TextField()

    reference = models.CharField(max_length=255, blank=True)  # CVE|CWE|ISO clause|etc

    opened_at = models.DateTimeField(null=True, blank=True)

    closed_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)



    class Meta:

        indexes = [

            models.Index(fields=["assessment", "severity"], name="ix_finding_assessment_sev"),

            models.Index(fields=["status"], name="ix_finding_status"),

        ]



class ImprovementAction(TimeStampedModel):

    class Status(models.TextChoices):

        OPEN = "open", "Open"

        IN_PROGRESS = "in_progress", "In progress"

        DONE = "done", "Done"

        BLOCKED = "blocked", "Blocked"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    assessment = models.ForeignKey(ControlAssessment, on_delete=models.CASCADE, related_name="actions")

    title = models.CharField(max_length=255)

    plan = models.TextField(blank=True)

    owner = models.CharField(max_length=150, blank=True)

    due_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)



    class Meta:

        indexes = [

            models.Index(fields=["assessment", "status"], name="ix_action_assessment_status"),

            models.Index(fields=["due_date"], name="ix_action_due_date"),

        ]





