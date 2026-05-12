from django.db import models
import uuid
from company.models.company import CompanyProfile

class RegulatoryContext(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.OneToOneField(CompanyProfile, on_delete=models.CASCADE, related_name='regulatory_context')
    nis2_classification = models.CharField(max_length=50, choices=[('Essential', 'Essencial'), ('Important', 'Importante'), ('Out of Scope', 'NÃ£o Abrangida'), ('Pending', 'Pendente')], default='Pending')
    classification_criteria = models.TextField(blank=True, null=True)
    applicable_obligations = models.TextField(blank=True, null=True)
    competent_authority = models.CharField(max_length=255, blank=True, null=True)
    last_reviewed_at = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Regulatory Context - {self.organization.legal_name}"

class Stakeholder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(CompanyProfile, on_delete=models.CASCADE, related_name='stakeholders')
    name = models.CharField(max_length=255)
    stakeholder_type = models.CharField(max_length=50, choices=[('Internal', 'Interno'), ('External', 'Externo'), ('Regulator', 'Regulador'), ('Supplier', 'Fornecedor'), ('Partner', 'Parceiro')])
    responsibility = models.CharField(max_length=255, blank=True, null=True)
    contact = models.CharField(max_length=255, blank=True, null=True)
    security_relevance = models.TextField(blank=True, null=True)
    critical_process_relation = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name



