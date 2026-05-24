import uuid

from django.core.exceptions import ValidationError
from django.db import models

from .base import TimeStampedModel
from .evidence_item import EvidenceItem
from .mechanism import Mechanism


class MechanismEvidenceRequirement(TimeStampedModel):
    """Reusable catalogue of expected evidence for mechanisms.

    These are templates/requirements, not collected evidence. EvidenceItem and
    EvidenceLink remain the source of actual collected or expected evidence.
    """

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        TEMPLATE = "template", "Template"
        RULE_BASED = "rule_based", "Rule based"
        IMPORTED = "imported", "Imported"
        AI_SUGGESTED = "ai_suggested", "AI suggested"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mechanism = models.ForeignKey(
        Mechanism,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="evidence_requirements",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    evidence_type = models.CharField(
        max_length=30,
        choices=EvidenceItem.EvidenceType.choices,
        default=EvidenceItem.EvidenceType.REPORT,
    )
    mechanism_type = models.CharField(max_length=50, blank=True)
    keywords = models.JSONField(default=list, blank=True)
    control_domain = models.CharField(max_length=120, blank=True)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.TEMPLATE)
    rationale = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["priority", "title"]
        constraints = [
            models.UniqueConstraint(
                fields=["mechanism", "title", "evidence_type"],
                name="uq_mech_evidence_req_specific",
                condition=models.Q(mechanism__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["title", "evidence_type", "mechanism_type", "control_domain"],
                name="uq_mech_evidence_req_template",
                condition=models.Q(mechanism__isnull=True),
            ),
        ]
        indexes = [
            models.Index(fields=["mechanism"], name="ix_mevreq_mechanism"),
            models.Index(fields=["evidence_type"], name="ix_mevreq_type"),
            models.Index(fields=["mechanism_type"], name="ix_mevreq_mech_type"),
            models.Index(fields=["control_domain"], name="ix_mevreq_domain"),
            models.Index(fields=["priority"], name="ix_mevreq_priority"),
            models.Index(fields=["source"], name="ix_mevreq_source"),
            models.Index(fields=["is_active"], name="ix_mevreq_active"),
        ]

    def clean(self):
        super().clean()
        if self.keywords is None:
            self.keywords = []
        if not isinstance(self.keywords, list):
            raise ValidationError({"keywords": "Keywords must be a list."})
        cleaned_keywords = []
        for keyword in self.keywords:
            value = str(keyword).strip()
            if value:
                cleaned_keywords.append(value)
        self.keywords = cleaned_keywords

    def matches_mechanism(self, mechanism, control_domain=""):
        if not self.is_active:
            return False
        if self.mechanism_id and self.mechanism_id == mechanism.id:
            return True
        if self.mechanism_id:
            return False

        if self.mechanism_type and self.mechanism_type != mechanism.mechanism_type:
            return False
        if self.control_domain and control_domain:
            if self.control_domain.lower() not in str(control_domain).lower():
                return False

        text = " ".join(
            [
                mechanism.title or "",
                mechanism.description or "",
                mechanism.mechanism_type or "",
                control_domain or "",
            ]
        ).lower()
        if not self.keywords:
            return True
        return any(str(keyword).lower() in text for keyword in self.keywords)

    def __str__(self):
        scope = self.mechanism.title if self.mechanism_id else "template"
        return f"{self.title} ({scope})"
