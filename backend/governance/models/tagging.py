import uuid

from django.db import models

from .base import TimeStampedModel
from .control import Control


class Tag(TimeStampedModel):
    class Category(models.TextChoices):
        DOMAIN = "domain", "Domain"
        TECH = "tech", "Tech"
        REG = "reg", "Reg"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80, unique=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.DOMAIN)

    def __str__(self):
        return self.name


class ControlTag(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="control_tags")
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name="control_tags")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["control", "tag"], name="uq_control_tag"),
        ]
        indexes = [
            models.Index(fields=["tag"], name="ix_controltag_tag"),
        ]
