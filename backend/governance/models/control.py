import uuid

from django.db import models

from .framework import Framework, FrameworkSection

from .base import TimeStampedModel

from django.core.exceptions import ValidationError

from django.db.models import Q, F





class Control(TimeStampedModel):

    class Status(models.TextChoices):

        ACTIVE = "active", "Active"

        DEPRECATED = "deprecated", "Deprecated"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    framework = models.ForeignKey(Framework, on_delete=models.CASCADE, related_name="controls")

    section = models.ForeignKey(FrameworkSection, on_delete=models.PROTECT, related_name="controls", null=True, blank=True)

    code = models.CharField(max_length=50)  # ex: "A.5.1", "ID.AM-01"

    title = models.CharField(max_length=255)

    description = models.TextField()

    implementation_guidance = models.TextField(blank=True)

    is_mandatory = models.BooleanField(default=False)

    applicability_scope = models.CharField(max_length=50, blank=True)  # ex: org|it|ot|cloud (opcional)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)



    class Meta:

        constraints = [

            models.UniqueConstraint(fields=["framework", "code"], name="uq_control_framework_code"),

        ]

        indexes = [

            models.Index(fields=["framework", "code"], name="ix_control_fw_code"),

            models.Index(fields=["section"], name="ix_control_section"),

        ]



    def clean(self):

        super().clean()

        if self.section and self.section.framework_id != self.framework_id:

            raise ValidationError("A secÃ§Ã£o do controlo tem de pertencer Ã  mesma framework.")



    def __str__(self):

        return f"{self.framework.code}:{self.code} {self.title}"

    

class ControlMapping(TimeStampedModel):

    class MappingType(models.TextChoices):

        EQUIVALENT = "equivalent", "Equivalent"

        PARTIAL = "partial", "Partial"

        SUPPORTS = "supports", "Supports"

        CONFLICTS = "conflicts", "Conflicts"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    source_control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="mappings_out")

    target_control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="mappings_in")

    mapping_type = models.CharField(max_length=20, choices=MappingType.choices)

    confidence = models.DecimalField(max_digits=3, decimal_places=2, default=1.00)  # 0.00..1.00

    rationale = models.TextField(blank=True)



    class Meta:

        constraints = [

            models.UniqueConstraint(

                fields=["source_control", "target_control", "mapping_type"],

                name="uq_mapping_src_tgt_type",

            ),

            models.CheckConstraint(condition=Q(confidence__gte=0) & Q(confidence__lte=1), name="ck_mapping_conf_0_1"),

            models.CheckConstraint(condition=~Q(source_control=models.F("target_control")), name="ck_mapping_no_self"),

        ]

        indexes = [

            models.Index(fields=["source_control"], name="ix_mapping_source"),

            models.Index(fields=["target_control"], name="ix_mapping_target"),

        ]



