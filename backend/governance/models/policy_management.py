import uuid
from django.db import models
from .base import TimeStampedModel

class Policy(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Rascunho'
        ACTIVE = 'active', 'Ativa'
        REVIEW = 'review', 'Em RevisÃ£o'
        OBSOLETE = 'obsolete', 'Obsoleta'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    objective = models.TextField(blank=True, null=True)
    scope = models.TextField(blank=True, null=True)
    owner = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    version = models.CharField(max_length=20, default='1.0')
    approval_date = models.DateField(blank=True, null=True)
    review_date = models.DateField(blank=True, null=True)
    next_review_date = models.DateField(blank=True, null=True)

    # Relations for convenience
    related_frameworks = models.ManyToManyField('governance.Framework', blank=True, related_name='managed_policies')

    class Meta:
        verbose_name = "PolÃ­tica de SeguranÃ§a"
        verbose_name_plural = "PolÃ­ticas de SeguranÃ§a"
        ordering = ['code']

    def __str__(self):
        return f"[{self.code}] {self.title}"


class PolicyControl(models.Model):
    class Applicability(models.TextChoices):
        MANDATORY = 'mandatory', 'ObrigatÃ³rio'
        RECOMMENDED = 'recommended', 'Recomendado'
        NOT_APPLICABLE = 'not_applicable', 'NÃ£o AplicÃ¡vel'

    class Priority(models.TextChoices):
        LOW = 'low', 'Baixa'
        MEDIUM = 'medium', 'MÃ©dia'
        HIGH = 'high', 'Alta'
        CRITICAL = 'critical', 'CrÃ­tica'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(Policy, on_delete=models.CASCADE, related_name='policy_controls')
    control = models.ForeignKey('governance.Control', on_delete=models.CASCADE, related_name='policy_links')
    rationale = models.TextField(blank=True, null=True)
    applicability = models.CharField(max_length=20, choices=Applicability.choices, default=Applicability.MANDATORY)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    start_date = models.DateField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    progress = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('policy', 'control')

    def __str__(self):
        return f"{self.policy.code} -> {self.control.code}"


class ImplementationMechanism(TimeStampedModel):
    class MechanismType(models.TextChoices):
        TECHNICAL = 'technical', 'TÃ©cnico'
        PROCEDURAL = 'procedural', 'Procedimental'
        ORGANIZATIONAL = 'organizational', 'Organizacional'
        CONTRACTUAL = 'contractual', 'Contratual'

    class Status(models.TextChoices):
        NOT_STARTED = 'not_started', 'NÃ£o Iniciado'
        IN_PROGRESS = 'in_progress', 'Em Progresso'
        IMPLEMENTED = 'implemented', 'Implementado'
        PARTIALLY_IMPLEMENTED = 'partially_implemented', 'Parcialmente Implementado'
        NOT_APPLICABLE = 'not_applicable', 'NÃ£o AplicÃ¡vel'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy_control = models.ForeignKey(PolicyControl, on_delete=models.CASCADE, related_name='mechanisms')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    mechanism_type = models.CharField(max_length=20, choices=MechanismType.choices, default=MechanismType.TECHNICAL)
    implementation_status = models.CharField(max_length=30, choices=Status.choices, default=Status.NOT_STARTED)
    responsible = models.CharField(max_length=255, blank=True, null=True)
    start_date = models.DateField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    progress = models.PositiveIntegerField(default=0) # 0 to 100
    notes = models.TextField(blank=True, null=True)
    
    # Placeholder for assets integration
    # target_assets = models.ManyToManyField('assets.Asset', blank=True)

    def __str__(self):
        return self.name


class PolicyEvidence(TimeStampedModel):
    class EvidenceType(models.TextChoices):
        DOCUMENT = 'document', 'Documento'
        SCREENSHOT = 'screenshot', 'Captura de EcrÃ£'
        CONFIGURATION = 'configuration', 'ConfiguraÃ§Ã£o'
        LOG = 'log', 'Log'
        REPORT = 'report', 'RelatÃ³rio'
        AUDIT_RECORD = 'audit_record', 'Registo de Auditoria'
        LINK = 'link', 'Link Externo'

    class Status(models.TextChoices):
        VALID = 'valid', 'VÃ¡lida'
        EXPIRED = 'expired', 'Expirada'
        PENDING_REVIEW = 'pending_review', 'Pendente de RevisÃ£o'
        REJECTED = 'rejected', 'Rejeitada'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mechanism = models.ForeignKey(ImplementationMechanism, on_delete=models.CASCADE, related_name='evidences')
    title = models.CharField(max_length=255)
    evidence_type = models.CharField(max_length=20, choices=EvidenceType.choices, default=EvidenceType.DOCUMENT)
    description = models.TextField(blank=True, null=True)
    file = models.FileField(upload_to='policy_evidence/', blank=True, null=True)
    url = models.URLField(blank=True, null=True)
    collected_by = models.CharField(max_length=255, blank=True, null=True)
    collected_at = models.DateTimeField(blank=True, null=True)
    validity_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING_REVIEW)

    def __str__(self):
        return self.title


class PolicyAssessment(TimeStampedModel):
    class OverallStatus(models.TextChoices):
        COMPLIANT = 'compliant', 'Conforme'
        PARTIALLY_COMPLIANT = 'partially_compliant', 'Parcialmente Conforme'
        NON_COMPLIANT = 'non_compliant', 'NÃ£o Conforme'
        NOT_ASSESSED = 'not_assessed', 'NÃ£o Avaliado'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(Policy, on_delete=models.CASCADE, related_name='assessments')
    overall_status = models.CharField(max_length=20, choices=OverallStatus.choices, default=OverallStatus.NOT_ASSESSED)
    score = models.FloatField(default=0.0)
    last_assessed_at = models.DateTimeField(auto_now=True)
    assessed_by = models.CharField(max_length=255, blank=True, null=True)
    summary = models.TextField(blank=True, null=True)
    recommendations = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Assessment for {self.policy.code} - {self.overall_status}"


class PolicySection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy = models.ForeignKey(Policy, on_delete=models.CASCADE, related_name='sections')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subsections')
    order = models.PositiveIntegerField(default=0)
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['order']
        verbose_name = "SecÃ§Ã£o de PolÃ­tica"
        verbose_name_plural = "SecÃ§Ãµes de PolÃ­tica"

    def __str__(self):
        return f"{self.policy.code} - {self.title}"



