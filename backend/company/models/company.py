import uuid

from django.db import models

from .base import TimeStampedModel





class OrgUnit(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Person(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=255, blank=True)
    org_unit = models.ForeignKey(
        OrgUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="people",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class CompanyProfile(TimeStampedModel):

    """

    Perfil da organização assessorada (single-tenant).

    Deve existir apenas um registo.

    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)



    legal_name = models.CharField(max_length=255)

    tax_id = models.CharField(max_length=50, blank=True)

    sector = models.CharField(max_length=150, blank=True)



    country = models.CharField(max_length=100, default="Portugal")

    city = models.CharField(max_length=120, blank=True)



    website = models.URLField(blank=True)

    main_email = models.EmailField(blank=True)

    main_phone = models.CharField(max_length=40, blank=True)



    # Governance Fields

    org_type = models.CharField(max_length=50, choices=[('Public', 'Pública'), ('Private', 'Privada'), ('ThirdSector', 'Terceiro Setor')], default='Private')

    geographic_scope = models.CharField(max_length=255, blank=True, null=True)

    critical_services = models.TextField(blank=True, null=True)

    mission = models.TextField(blank=True, null=True)

    vision = models.TextField(blank=True, null=True)

    strategic_objectives = models.TextField(blank=True, null=True)

    security_objectives = models.TextField(blank=True, null=True)



    employee_count = models.PositiveIntegerField(null=True, blank=True)

    annual_revenue = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    

    nis2_sector = models.CharField(

        max_length=100, 

        choices=[

            ('none', 'Setor não abrangido'),

            # Anexo I

            ('annex1_energy', 'Anexo I - Energia'),

            ('annex1_transport', 'Anexo I - Transportes'),

            ('annex1_banking', 'Anexo I - Banca'),

            ('annex1_fin_infra', 'Anexo I - Infraestruturas do Mercado Financeiro'),

            ('annex1_health', 'Anexo I - Saúde'),

            ('annex1_water', 'Anexo I - Água Potável'),

            ('annex1_waste_water', 'Anexo I - Águas Residuais'),

            ('annex1_dig_infra', 'Anexo I - Infraestrutura Digital'),

            ('annex1_ict_mgmt', 'Anexo I - Gestão de Serviços de TIC (B2B)'),

            ('annex1_pub_admin', 'Anexo I - Administração Pública'),

            ('annex1_space', 'Anexo I - Espaço'),

            # Anexo II

            ('annex2_postal', 'Anexo II - Serviços Postais e de Estafeta'),

            ('annex2_waste_mgmt', 'Anexo II - Gestão de Resíduos'),

            ('annex2_chem', 'Anexo II - Fabrico, Produção e Distribuição de Produtos Químicos'),

            ('annex2_food', 'Anexo II - Produção, Transformação e Distribuição de Alimentos'),

            ('annex2_mfg', 'Anexo II - Fabrico (Maquinaria, Veículos, Equipamentos)'),

            ('annex2_dig_prov', 'Anexo II - Fornecedores Digitais (Marketplaces, Motores de Busca, Redes Sociais)'),

            ('annex2_research', 'Anexo II - Organizações de Investigação'),

        ], 

        default='none'

    )



    nis2_subsector = models.CharField(

        max_length=100, 

        blank=True, 

        null=True,

        choices=[

            # Energia

            ('electricity', 'Eletricidade'), ('district_heating', 'Aquecimento/Arrefecimento Urbano'), ('oil', 'Petróleo'), ('gas', 'Gás'), ('hydrogen', 'Hidrogénio'),

            # Transportes

            ('air', 'Transporte Aéreo'), ('rail', 'Transporte Ferroviário'), ('water', 'Transporte por Vias Navegáveis'), ('road', 'Transporte Rodoviário'),

            # Banca e Finanças

            ('credit_inst', 'Instituições de Crédito'), ('trading_venue', 'Operadores de Plataformas de Negociação'), ('ccp', 'Contrapartes Centrais'),

            # Saúde

            ('healthcare_prov', 'Prestadores de Cuidados de Saúde'), ('eu_ref_lab', 'Laboratórios de Referência da UE'), ('pharma_r_d', 'Investigação e Desenvolvimento de Medicamentos'), ('pharma_mfg', 'Fabrico de Produtos Farmacêuticos'), ('med_device_mfg', 'Fabrico de Dispositivos Médicos'),

            # Água

            ('water_supply', 'Abastecimento e Distribuição de Água'), ('waste_water_coll', 'Recolha e Tratamento de Águas Residuais'),

            # Infra Digital

            ('ixp', 'Pontos de Troca de Tráfego Internet (IXP)'), ('dns', 'Sistemas de Nomes de Domínio (DNS)'), ('tld', 'Registos de Nomes de Domínio de Topo (TLD)'), ('cloud', 'Serviços de Computação em Nuvem'), ('data_centre', 'Serviços de Centro de Dados'), ('cdn', 'Redes de Débito de Conteúdo (CDN)'), ('trust_service', 'Serviços de Confiança'), ('elec_comm', 'Redes/Serviços de Comunicações Eletrónicas Públicas'),

            # TIC B2B

            ('msp', 'Managed Service Providers (MSP)'), ('mssp', 'Managed Security Service Providers (MSSP)'),

            # Admin Pública e Espaço

            ('central_gov', 'Administração Central'), ('regional_gov', 'Administração Regional'), ('space_ops', 'Operadores de Infraestruturas Terrestres (Espaço)'),

            # Anexo II

            ('postal_services', 'Serviços Postais e de Estafeta'), ('waste_coll', 'Recolha, Transporte e Gestão de Resíduos'), ('chem_mfg', 'Fabrico de Produtos Químicos'), ('food_prod', 'Produção, Transformação e Distribuição de Alimentos'),

            # Fabrico Anexo II

            ('mfg_med_devices', 'Fabrico de Dispositivos Médicos (Geral)'), ('mfg_comp_elec', 'Fabrico de Produtos Informáticos e Eletrónicos'), ('mfg_elec_eq', 'Fabrico de Equipamentos Elétricos'), ('mfg_machinery', 'Fabrico de Máquinas e Equipamentos'), ('mfg_vehicles', 'Fabrico de Veículos Automóveis'), ('mfg_transport_eq', 'Fabrico de Outro Equipamento de Transporte'),

            # Fornecedores Digitais

            ('online_mkt', 'Mercados em Linha (Marketplaces)'), ('search_engine', 'Motores de Busca em Linha'), ('social_net', 'Redes Sociais'),

            # Investigação

            ('research_org', 'Organismos de Investigação / Universidades'),

        ]

    )



    is_critical_provider = models.BooleanField(default=False)





    primary_security_goals = models.JSONField(default=list, blank=True)

    preferred_frameworks = models.JSONField(default=list, blank=True)

    risk_appetite = models.CharField(
        max_length=30,
        choices=[
            ("conservative", "Conservador"),
            ("balanced", "Equilibrado"),
            ("tolerant", "Tolerante"),
        ],
        default="balanced",
    )

    onboarding_answers = models.JSONField(default=dict, blank=True)

    onboarding_recommended_actions = models.JSONField(default=list, blank=True)

    onboarding_completed_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)





    class Meta:

        verbose_name = "Company Profile"

        verbose_name_plural = "Company Profile"



    def __str__(self):

        return self.legal_name

