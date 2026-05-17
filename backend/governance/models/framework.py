import uuid

from django.db import models

from .base import TimeStampedModel

from django.core.exceptions import ValidationError

from django.db.models import Q

from django.utils import timezone



class Framework(TimeStampedModel):

    class FrameworkCode(models.TextChoices):

        ISO27001 = "ISO27001", "ISO/IEC 27001"

        NISTCSF = "NISTCSF", "NIST CSF"

        QNRC = "QNRC", "QNRC"

    

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    code = models.CharField(max_length=20, choices=FrameworkCode.choices)

    name = models.CharField(max_length=200)

    version = models.CharField(max_length=50)

    publisher = models.CharField(max_length=250, null=True, blank=True)

    source_uri = models.URLField(blank=True)

    description = models.CharField(max_length=250, null=True, blank=True)

    is_active = models.BooleanField(default=True)

    published_at = models.DateField(null=True, blank=True)



    class Meta:

        constraints = [

            models.UniqueConstraint(fields=["code", "version"], name="uq_framework_code_version"),

        ]

        indexes = [

            models.Index(fields=["code", "version"], name="ix_framework_code_version"),

        ]



    def __str__(self):

        return f"{self.code} {self.version}"







class FrameworkLevel(TimeStampedModel):

    """

    Dicionário de níveis por framework.

    Ex: ISO27002 -> 1=Domínio, 2=Tema, 3=Controlo

    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    framework = models.ForeignKey("Framework", on_delete=models.CASCADE, related_name="levels")



    # nível numérico para mapear dados existentes

    level = models.PositiveSmallIntegerField()  # 1..n



    # significado/label do nível

    name = models.CharField(max_length=100)      # ex: Domínio, Categoria...

    description = models.TextField(blank=True, default="")



    class Meta:

        constraints = [

            models.UniqueConstraint(fields=["framework", "level"], name="uq_level_framework_level"),

            models.CheckConstraint(condition=Q(level__gte=1), name="ck_level_level_gte_1"),

        ]

        indexes = [

            models.Index(fields=["framework", "level"], name="ix_level_fw_level"),

        ]



    def __str__(self):

        return f"{self.framework.code}:L{self.level} {self.name}"





class FrameworkSection(TimeStampedModel):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    framework = models.ForeignKey(Framework, on_delete=models.CASCADE, related_name="sections")

    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")

    code = models.CharField(max_length=50)

    name = models.CharField(max_length=255)



    level = models.PositiveSmallIntegerField()  # TEMP (vai sair)

    level_ref = models.ForeignKey(

        "FrameworkLevel",

        null=True,

        blank=True,

        on_delete=models.PROTECT,

        related_name="sections",

    )



    sort_order = models.IntegerField(default=0)



    class Meta:

        constraints = [

            models.UniqueConstraint(fields=["framework", "code"], name="uq_section_framework_code"),

            models.CheckConstraint(condition=Q(level__gte=1), name="ck_section_level_gte_1"),

        ]

        indexes = [

            models.Index(fields=["framework", "level", "sort_order"], name="ix_section_fw_level_sort"),

            models.Index(fields=["framework", "code"], name="ix_section_fw_code"),

        ]



    def clean(self):

        super().clean()

        if self.parent and self.parent.framework_id != self.framework_id:

            raise ValidationError("A secção parent tem de pertencer à mesma framework.")





    

class FrameworkProfile(TimeStampedModel):

    """

    Baseline/Target/Regulatory, com maturidade configurável por profile.

    """

    class ProfileType(models.TextChoices):

        BASELINE = "baseline", "Baseline"

        TARGET = "target", "Target"

        REGULATORY = "regulatory", "Regulatory"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    framework = models.ForeignKey(Framework, on_delete=models.CASCADE, related_name="profiles")

    name = models.CharField(max_length=100, choices=ProfileType.choices, default=ProfileType.BASELINE)

    maturity_model = models.CharField(max_length=100, blank=True)  # ex: "CMMI", "NIST Tiers", "Custom"

    max_level = models.PositiveSmallIntegerField(default=5)  # configurável



    class Meta:

        constraints = [

            models.UniqueConstraint(fields=["framework", "name"], name="uq_profile_framework_name"),

            models.CheckConstraint(condition=Q(max_level__gte=1) & Q(max_level__lte=20), name="ck_profile_maxlevel_1_20"),

        ]

        indexes = [

            models.Index(fields=["framework", "name"], name="ix_profile_fw_name"),

        ]



    def __str__(self):

        return f"{self.framework.code}:{self.name} (max={self.max_level})"





