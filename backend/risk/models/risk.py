from django.db import models
from .asset import Asset
from .vulnerability import Vulnerability
import uuid

class Risk(models.Model):
    class RiskLevel(models.TextChoices):
        VERY_LOW = 'very_low', 'Muito Baixo'
        LOW = 'low', 'Baixo'
        MEDIUM = 'medium', 'Médio'
        HIGH = 'high', 'Elevado'
        CRITICAL = 'critical', 'Crítico'

    class RiskStatus(models.TextChoices):
        OPEN = 'open', 'Em Aberto'
        IN_PROGRESS = 'in_progress', 'Em Tratamento'
        MITIGATED = 'mitigated', 'Mitigado'
        ACCEPTED = 'accepted', 'Aceite'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='risks_v2')
    vulnerability = models.ForeignKey(Vulnerability, on_delete=models.SET_NULL, related_name='risks_v2', null=True, blank=True)
    
    risk_score = models.FloatField(default=0.0) # 0-100
    risk_level = models.CharField(max_length=20, choices=RiskLevel.choices, default=RiskLevel.MEDIUM, db_index=True)
    
    likelihood = models.FloatField(default=1.0) # 1-5 or 0-1 depending on calculation
    impact = models.FloatField(default=1.0)     # 1-5
    
    status = models.CharField(max_length=20, choices=RiskStatus.choices, default=RiskStatus.OPEN, db_index=True)
    
    ai_explanation = models.TextField(null=True, blank=True, help_text="Justificação gerada pelo modelo preditivo")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        v_title = self.vulnerability.title if self.vulnerability else "Risco de Ativo"
        return f"{self.asset.name} - {v_title}"

    class Meta:
        ordering = ['-risk_score']

class RiskFactor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    risk = models.ForeignKey(Risk, on_delete=models.CASCADE, related_name='factors')
    name = models.CharField(max_length=100) # ex: CVSS, EPSS, Asset Criticality
    value = models.CharField(max_length=100) # ex: 8.5, 0.95, Critical
    weight = models.FloatField(default=1.0)
    contribution = models.FloatField(help_text="Impacto percentual ou absoluto no score final")

    def __str__(self):
        return f"{self.name}: {self.value} (Risk: {self.risk.id})"

class RiskAssessment(models.Model):
    class OverallLevel(models.TextChoices):
        VERY_LOW = 'very_low', 'Muito Baixo'
        LOW = 'low', 'Baixo'
        MEDIUM = 'medium', 'Médio'
        HIGH = 'high', 'Elevado'
        CRITICAL = 'critical', 'Crítico'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='assessments')
    overall_score = models.FloatField(default=0.0)
    overall_level = models.CharField(max_length=20, choices=OverallLevel.choices, default=OverallLevel.MEDIUM)
    last_assessed_at = models.DateTimeField(auto_now=True)
    summary = models.TextField(null=True, blank=True)
    recommendations = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Avaliação de {self.asset.name} - {self.overall_level}"

class RiskTreatment(models.Model):
    class TreatmentType(models.TextChoices):
        MITIGATE = 'mitigate', 'Mitigar'
        TRANSFER = 'transfer', 'Transferir'
        ACCEPT = 'accept', 'Aceitar'
        AVOID = 'avoid', 'Evitar'

    class TreatmentStatus(models.TextChoices):
        PLANNED = 'planned', 'Planeado'
        IN_PROGRESS = 'in_progress', 'Em Curso'
        COMPLETED = 'completed', 'Concluído'
        CANCELLED = 'cancelled', 'Cancelado'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    risk = models.ForeignKey(Risk, on_delete=models.CASCADE, related_name='treatments')
    treatment_type = models.CharField(max_length=20, choices=TreatmentType.choices, default=TreatmentType.MITIGATE)
    action = models.TextField()
    responsible = models.CharField(max_length=255, null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=TreatmentStatus.choices, default=TreatmentStatus.PLANNED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_treatment_type_display()} para {self.risk}"


