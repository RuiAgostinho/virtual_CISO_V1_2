import uuid

from django.db import models

from company.models import OrgUnit, Person
from .asset import Asset, AssetCategory, AssetType


class Software(models.Model):
    CRITICALITY_CHOICES = Asset.CRITICALITY_CHOICES
    CIA_CHOICES = Asset.CIA_CHOICES
    STATUS_CHOICES = Asset.STATUS_CHOICES

    SOURCE_CHOICES = (
        ("manual", "Manual"),
        ("wazuh", "Wazuh"),
        ("nmap", "Nmap"),
        ("discovery", "Discovery"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, db_index=True)
    version = models.CharField(max_length=255, blank=True, null=True)
    architecture = models.CharField(max_length=120, blank=True, null=True)
    vendor = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    category = models.ForeignKey(AssetCategory, on_delete=models.SET_NULL, null=True, blank=True)
    asset_type = models.ForeignKey(AssetType, on_delete=models.SET_NULL, null=True, blank=True)
    location = models.ForeignKey("risk.AssetLocation", on_delete=models.SET_NULL, null=True, blank=True)
    environment = models.ForeignKey("risk.AssetEnvironment", on_delete=models.SET_NULL, null=True, blank=True)
    deployment_type = models.ForeignKey("risk.AssetInfrastructure", on_delete=models.SET_NULL, null=True, blank=True)
    business_owner = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name="owned_software")
    technical_owner = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name="technical_software")
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name="software")
    criticality = models.CharField(max_length=50, choices=CRITICALITY_CHOICES, default="Medium", db_index=True)
    confidentiality = models.SmallIntegerField(choices=CIA_CHOICES, default=3)
    integrity = models.SmallIntegerField(choices=CIA_CHOICES, default=3)
    availability = models.SmallIntegerField(choices=CIA_CHOICES, default=3)
    exposure = models.SmallIntegerField(choices=CIA_CHOICES, default=3)
    business_value = models.SmallIntegerField(choices=CIA_CHOICES, default=3)
    dependency_score = models.SmallIntegerField(choices=CIA_CHOICES, default=3)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="Active")
    end_of_life = models.DateField(blank=True, null=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="manual", db_index=True)
    unique_identifier = models.CharField(max_length=255, blank=True, null=True)
    assets = models.ManyToManyField(Asset, blank=True, related_name="installed_software")
    dependent_assets = models.ManyToManyField(Asset, blank=True, related_name="depends_on_software")
    external_service_assets = models.ManyToManyField(Asset, blank=True, related_name="external_software_services")
    integration_assets = models.ManyToManyField(Asset, blank=True, related_name="software_integrations")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "version"]
        unique_together = ("name", "version", "vendor")

    def __str__(self):
        return f"{self.name} {self.version or ''}".strip()


class SoftwareHistory(models.Model):
    software = models.ForeignKey(Software, on_delete=models.CASCADE, related_name="history")
    action = models.CharField(max_length=100)
    details = models.TextField(blank=True, null=True)
    user = models.CharField(max_length=255, blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name_plural = "Software histories"

    def __str__(self):
        return f"{self.action} on {self.software}"
