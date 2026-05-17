import uuid

from django.db import models

from governance.models import Control

from company.models import Person, OrgUnit



class RiskConfiguration(models.Model):

    weight_cia = models.FloatField(default=0.30, help_text="Peso para CID (0.0 a 1.0)")

    weight_exposure = models.FloatField(default=0.25, help_text="Peso para Exposição (0.0 a 1.0)")

    weight_value = models.FloatField(default=0.25, help_text="Peso para Valor (0.0 a 1.0)")

    weight_dependency = models.FloatField(default=0.20, help_text="Peso para Dependência (0.0 a 1.0)")

    

    is_active = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)



    class Meta:

        verbose_name = "Configuração de Risco"



    @classmethod

    def get_config(cls):

        config = cls.objects.filter(is_active=True).first()

        if not config:

            config = cls.objects.create()

        return config



    def save(self, *args, **kwargs):

        if self.is_active:

            RiskConfiguration.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)

        super().save(*args, **kwargs)



class AssetCategory(models.Model):

    name = models.CharField(max_length=255, unique=True, db_index=True)

    description = models.TextField(blank=True, null=True)



    def __str__(self):

        return self.name



class AssetType(models.Model):

    category = models.ForeignKey(AssetCategory, on_delete=models.CASCADE, related_name='types')

    name = models.CharField(max_length=255, db_index=True)

    description = models.TextField(blank=True, null=True)



    def __str__(self):

        return f"{self.category.name} - {self.name}"



class Asset(models.Model):

    ASSET_TYPES = (

        ('Information', 'Information'),

        ('Application', 'Application'),

        ('Infrastructure', 'Infrastructure'),

        ('Service', 'Service'),

        ('People', 'People'),

        ('Supplier', 'Supplier'),

        ('Facility', 'Facility'),

    )



    CRITICALITY_CHOICES = (

        ('Critical', 'Crítico (5)'),

        ('High', 'Alto (4)'),

        ('Medium', 'Médio (3)'),

        ('Low', 'Baixo (2)'),

        ('Very Low', 'Muito Baixo (1)'),

    )



    CIA_CHOICES = (

        (1, 'Muito Baixo (1)'),

        (2, 'Baixo (2)'),

        (3, 'Médio (3)'),

        (4, 'Alto (4)'),

        (5, 'Crítico (5)'),

    )





    EXPOSURE_CHOICES = (

        ('Isolated', 'Interno (Isolado)'),

        ('Internal', 'Interno (Restrito)'),

        ('ThirdParty', 'Entidades Terceiras / VPN'),

        ('InternetProtected', 'Internet (Protegido)'),

        ('InternetPublic', 'Internet (Público)'),

    )



    STATUS_CHOICES = (

        ('New', 'Novo'),

        ('Active', 'Ativo'),

        ('Retired', 'Descontinuado'),

        ('Maintenance', 'Em Manutenção'),

    )



    SOURCE_CHOICES = (

        ('manual', 'Manual'),

        ('wazuh', 'Wazuh'),

        ('discovery', 'Network Discovery'),

    )



    CATEGORY_CHOICES = (

        ('Workstation', 'Workstation'),

        ('Laptop', 'Laptop'),

        ('Server', 'Server'),

        ('Router', 'Router'),

        ('Switch', 'Switch'),

        ('Firewall', 'Firewall'),

        ('Gateway', 'Gateway / VPN Concentrator'),

        ('Mobile', 'Mobile'),

        ('IoT', 'IoT'),

        ('Other', 'Other'),

    )



    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(max_length=255)

    description = models.TextField(blank=True, null=True)

    category = models.ForeignKey(AssetCategory, on_delete=models.SET_NULL, null=True, blank=True)

    asset_type = models.ForeignKey(AssetType, on_delete=models.SET_NULL, null=True, blank=True)

    

    # 1. Identificação do ativo

    unique_identifier = models.CharField(max_length=255, blank=True, null=True, help_text="ID interno ou inventário")

    serial_number = models.CharField(max_length=255, blank=True, null=True, help_text="Número de série")

    brand = models.CharField(max_length=255, blank=True, null=True, help_text="Marca")

    model = models.CharField(max_length=255, blank=True, null=True, help_text="Modelo")

    

    # 2. Função / Papel no negócio (CRÍTICO QNCS)

    supported_service = models.CharField(max_length=255, blank=True, null=True)

    business_process = models.CharField(max_length=255, blank=True, null=True)

    importance = models.CharField(max_length=50, choices=CRITICALITY_CHOICES, default='Medium')

    service_dependency = models.TextField(blank=True, null=True, help_text="Dependência de outros serviços")

    

    # 3. Localização e contexto

    location = models.ForeignKey('AssetLocation', on_delete=models.SET_NULL, null=True, blank=True, help_text="Localização física ou lógica")

    network_segment = models.ForeignKey('NetworkRange', on_delete=models.SET_NULL, null=True, blank=True)

    environment = models.ForeignKey('AssetEnvironment', on_delete=models.SET_NULL, null=True, blank=True, help_text="Produção, teste, etc.")

    deployment_type = models.ForeignKey('AssetInfrastructure', on_delete=models.SET_NULL, null=True, blank=True)



    # 4. Responsabilidade (OBRIGATÓRIO)

    business_owner = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_assets')

    technical_owner = models.ForeignKey(Person, on_delete=models.SET_NULL, null=True, blank=True, related_name='technically_owned_assets')

    org_unit = models.ForeignKey(OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')

    

    # 5. Dependências (MUITO IMPORTANTE QNCS)

    dependent_systems = models.TextField(blank=True, null=True) # Legacy text

    dependent_assets = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='depends_on_me')

    

    external_services = models.TextField(blank=True, null=True) # Legacy text

    external_service_assets = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='serves_as_external_for')

    

    integrations = models.TextField(blank=True, null=True) # Legacy text

    integration_assets = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='integrated_with')



    # 6. Estado e ciclo de vida

    end_of_life = models.DateField(blank=True, null=True, help_text="Data de Fim de Vida (EOL)")



    secondary_ips = models.JSONField(default=list, blank=True, help_text="Lista de IPs adicionais (Multi-homed)")

    owner = models.CharField(max_length=255, blank=True, null=True) # Keeping for legacy/compatibility

    

    criticality = models.CharField(max_length=50, choices=CRITICALITY_CHOICES, default='Medium', db_index=True)

    confidentiality = models.SmallIntegerField(choices=CIA_CHOICES, default=3)

    integrity = models.SmallIntegerField(choices=CIA_CHOICES, default=3)

    availability = models.SmallIntegerField(choices=CIA_CHOICES, default=3)

    exposure = models.SmallIntegerField(choices=CIA_CHOICES, default=3)

    business_value = models.SmallIntegerField(choices=CIA_CHOICES, default=3, help_text="Valor do ativo para o negócio")

    dependency_score = models.SmallIntegerField(choices=CIA_CHOICES, default=3, help_text="Nível de dependência de outros ativos")

    

    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Active')

    

    # Origin Metadata

    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual', db_index=True)

    last_sync_at = models.DateTimeField(null=True, blank=True)



    # Technical Inventory (Wazuh)

    wazuh_agent_id = models.CharField(max_length=255, null=True, blank=True)

    wazuh_node_name = models.CharField(max_length=255, null=True, blank=True)

    wazuh_os_name = models.CharField(max_length=255, null=True, blank=True)

    wazuh_os_version = models.CharField(max_length=255, null=True, blank=True)

    wazuh_last_seen = models.DateTimeField(null=True, blank=True)

    wazuh_ip = models.CharField(max_length=255, null=True, blank=True)

    wazuh_hardware = models.JSONField(blank=True, null=True, help_text="Hardware info from Syscollector")

    wazuh_packages = models.JSONField(blank=True, null=True, help_text="Installed software from Syscollector")

    

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)



    parent = models.ForeignKey(

        'self', 

        on_delete=models.SET_NULL, 

        null=True, 

        blank=True, 

        related_name='dependencies',

        help_text="Ativo do qual este depende (ex: Host de uma VM, ou Servidor de uma App)"

    )

    controls = models.ManyToManyField(Control, related_name='assets', blank=True)



    def __str__(self):

        return self.name



    def criticality_breakdown(self):
        """
        Weighted criticality derivation: the single source of truth for the
        score, its per-component contributions and the resulting level. Used by
        save() and exposed via the API so the criticality is explainable.
        """
        config = RiskConfiguration.get_config()
        cia_avg = (self.confidentiality + self.integrity + self.availability) / 3.0
        components = [
            {"label": "CIA (média C/I/D)", "value": round(cia_avg, 2), "weight": config.weight_cia},
            {"label": "Exposição", "value": self.exposure, "weight": config.weight_exposure},
            {"label": "Valor de negócio", "value": self.business_value, "weight": config.weight_value},
            {"label": "Dependência", "value": self.dependency_score, "weight": config.weight_dependency},
        ]
        for component in components:
            component["contribution"] = round(component["value"] * component["weight"], 3)
        score = round(sum(c["contribution"] for c in components), 2)
        if score >= 4.5:
            level = "Critical"
        elif score >= 3.5:
            level = "High"
        elif score >= 2.5:
            level = "Medium"
        else:
            level = "Low"
        return {"score": score, "level": level, "components": components}

    def save(self, *args, **kwargs):
        if not self.unique_identifier:
            self.unique_identifier = f"AST-{str(self.id).split('-')[0].upper()}"
        # Ativos vindos de discovery começam sempre como 'Novo'
        if not self.pk and self.source == 'discovery':
            self.status = 'New'
        # Criticidade ponderada — derivação completa em criticality_breakdown()
        self.criticality = self.criticality_breakdown()["level"]
        super().save(*args, **kwargs)



    class Meta:

        ordering = ['-created_at']



class AssetHistory(models.Model):

    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='history')

    action = models.CharField(max_length=100, help_text="Ex: Created, Updated name, Merged from...")

    details = models.TextField(blank=True, null=True)

    user = models.CharField(max_length=255, blank=True, null=True)

    timestamp = models.DateTimeField(auto_now_add=True)



    class Meta:

        ordering = ['-timestamp']

        verbose_name_plural = "Asset Histories"



    def __str__(self):

        return f"{self.action} on {self.asset.name} at {self.timestamp}"



