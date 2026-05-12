import uuid

from django.db import models

from .base import TimeStampedModel


class TechnicalRegulation(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        ACTIVE = "active", "Ativo"
        REVIEW = "review", "Em revisão"
        OBSOLETE = "obsolete", "Obsoleto"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey("governance.Policy", on_delete=models.CASCADE, related_name="technical_regulations")
    code = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    version = models.CharField(max_length=20, default="1.0")
    technical_owner = models.CharField(max_length=255, blank=True, null=True)
    approved_at = models.DateField(blank=True, null=True)
    next_review_at = models.DateField(blank=True, null=True)
    technical_objective = models.TextField(blank=True, null=True)
    covered_systems = models.TextField(blank=True, null=True)
    technical_requirements = models.TextField(blank=True, null=True)
    controls = models.ManyToManyField("governance.Control", blank=True, related_name="technical_regulations")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"[{self.code}] {self.title}"


class Procedure(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Rascunho"
        ACTIVE = "active", "Ativo"
        REVIEW = "review", "Em revisão"
        OBSOLETE = "obsolete", "Obsoleto"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey("governance.Policy", on_delete=models.SET_NULL, blank=True, null=True, related_name="procedures")
    technical_regulation = models.ForeignKey(
        "governance.TechnicalRegulation",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="procedures",
    )
    code = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    version = models.CharField(max_length=20, default="1.0")
    owner = models.CharField(max_length=255, blank=True, null=True)
    periodicity = models.CharField(max_length=120, blank=True, null=True)
    next_review_at = models.DateField(blank=True, null=True)
    steps = models.TextField(blank=True, null=True)
    expected_evidence = models.TextField(blank=True, null=True)
    controls = models.ManyToManyField("governance.Control", blank=True, related_name="procedures")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"[{self.code}] {self.title}"

