import uuid

from django.db import models

from .base import TimeStampedModel

from .control import Control





class Mechanism(TimeStampedModel):

    """

    Biblioteca de mecanismos reutilizÃ¡veis (e.g., 'MFA', 'Backups diÃ¡rios').

    """

    class MechanismType(models.TextChoices):

        PROCESS = "Processo", "Processo"

        TECHNICAL = "TÃ©cnico", "TÃ©cnico"

        PEOPLE = "Pessoas", "Pessoas"

        SUPPLIER = "Fornecedor", "Fornecedor"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    title = models.CharField(max_length=255)

    description = models.TextField(blank=True)

    mechanism_type = models.CharField(

        max_length=50, choices=MechanismType.choices, default=MechanismType.TECHNICAL

    )

    tags = models.ManyToManyField("governance.Tag", related_name="mechanisms", blank=True)



    class Meta:

        verbose_name = "Mechanism"

        verbose_name_plural = "Mechanisms"

        indexes = [

            models.Index(fields=["mechanism_type"], name="ix_mech_type"),

        ]



    def __str__(self):

        return f"{self.title} ({self.mechanism_type})"





class SuggestedMechanism(TimeStampedModel):

    """

    LigaÃ§Ã£o global sugerida entre um Mecanismo e um Controlo da Framework.

    Usado para filtrar a biblioteca ao adicionar mecanismos a um controlo.

    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    mechanism = models.ForeignKey(Mechanism, on_delete=models.CASCADE, related_name="suggested_controls")

    control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="suggested_mechanisms")



    class Meta:

        verbose_name = "Suggested Mechanism"

        verbose_name_plural = "Suggested Mechanisms"

        constraints = [

            models.UniqueConstraint(fields=["mechanism", "control"], name="uq_suggested_mechanism"),

        ]



    def __str__(self):

        return f"{self.mechanism.title} sugerido para {self.control.code}"





class ControlMechanism(TimeStampedModel):

    """

    LigaÃ§Ã£o de um Mecanismo a um Controlo (e estado da implementaÃ§Ã£o nessa ligaÃ§Ã£o).

    Isto permite ter o 'MFA' aplicado a 5 controlos, mas talvez o estado seja diferente,

    ou entÃ£o o estado reflete a realidade da empresa.

    Para MVP, o status fica nesta tabela de ligaÃ§Ã£o.

    """

    class ImplementationStatus(models.TextChoices):

        NOT_STARTED = "NÃ£o iniciado", "NÃ£o iniciado"

        IN_PROGRESS = "Em implementaÃ§Ã£o", "Em implementaÃ§Ã£o"

        IMPLEMENTED = "Implementado", "Implementado"



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="mechanisms")

    mechanism = models.ForeignKey(Mechanism, on_delete=models.CASCADE, related_name="controls")

    

    status = models.CharField(

        max_length=50, choices=ImplementationStatus.choices, default=ImplementationStatus.NOT_STARTED

    )

    responsible = models.CharField(max_length=150, blank=True)

    deadline = models.DateField(null=True, blank=True)

    acceptance_criteria = models.TextField(blank=True)



    class Meta:

        verbose_name = "Control Mechanism"

        verbose_name_plural = "Control Mechanisms"

        constraints = [

            models.UniqueConstraint(fields=["control", "mechanism"], name="uq_control_mechanism"),

        ]



    def __str__(self):

        return f"{self.control.code} - {self.mechanism.title}"





class MechanismEvidence(TimeStampedModel):

    """

    EvidÃªncia fornecida para a implementaÃ§Ã£o de um mecanismo num controlo especÃ­fico.

    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    control_mechanism = models.ForeignKey(ControlMechanism, on_delete=models.CASCADE, related_name="evidences")

    title = models.CharField(max_length=255)

    description = models.TextField(blank=True, null=True)

    url = models.URLField(max_length=2000, blank=True)

    provided_at = models.DateTimeField(auto_now_add=True)



    class Meta:

        verbose_name = "Mechanism Evidence"

        verbose_name_plural = "Mechanism Evidences"

        ordering = ["-provided_at"]



    def __str__(self):

        return f"Evidence: {self.title} for {self.control_mechanism.mechanism.title}"



