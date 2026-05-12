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

    Perfil da organizaÃ§Ã£o assessorada (single-tenant).

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

    org_type = models.CharField(max_length=50, choices=[('Public', 'PÃºblica'), ('Private', 'Privada'), ('ThirdSector', 'Terceiro Setor')], default='Private')

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

            ('none', 'Setor nÃ£o abrangido'),

            # Anexo I

            ('annex1_energy', 'Anexo I - Energia'),

            ('annex1_transport', 'Anexo I - Transportes'),

            ('annex1_banking', 'Anexo I - Banca'),

            ('annex1_fin_infra', 'Anexo I - Infraestruturas do Mercado Financeiro'),

            ('annex1_health', 'Anexo I - SaÃºde'),

            ('annex1_water', 'Anexo I - Ãgua PotÃ¡vel'),

            ('annex1_waste_water', 'Anexo I - Ãguas Residuais'),

            ('annex1_dig_infra', 'Anexo I - Infraestrutura Digital'),

            ('annex1_ict_mgmt', 'Anexo I - GestÃ£o de ServiÃ§os de TIC (B2B)'),

            ('annex1_pub_admin', 'Anexo I - AdministraÃ§Ã£o PÃºblica'),

            ('annex1_space', 'Anexo I - EspaÃ§o'),

            # Anexo II

            ('annex2_postal', 'Anexo II - ServiÃ§os Postais e de Estafeta'),

            ('annex2_waste_mgmt', 'Anexo II - GestÃ£o de ResÃ­duos'),

            ('annex2_chem', 'Anexo II - Fabrico, ProduÃ§Ã£o e DistribuiÃ§Ã£o de Produtos QuÃ­micos'),

            ('annex2_food', 'Anexo II - ProduÃ§Ã£o, TransformaÃ§Ã£o e DistribuiÃ§Ã£o de Alimentos'),

            ('annex2_mfg', 'Anexo II - Fabrico (Maquinaria, VeÃ­culos, Equipamentos)'),

            ('annex2_dig_prov', 'Anexo II - Fornecedores Digitais (Marketplaces, Motores de Busca, Redes Sociais)'),

            ('annex2_research', 'Anexo II - OrganizaÃ§Ãµes de InvestigaÃ§Ã£o'),

        ], 

        default='none'

    )



    nis2_subsector = models.CharField(

        max_length=100, 

        blank=True, 

        null=True,

        choices=[

            # Energia

            ('electricity', 'Eletricidade'), ('district_heating', 'Aquecimento/Arrefecimento Urbano'), ('oil', 'PetrÃ³leo'), ('gas', 'GÃ¡s'), ('hydrogen', 'HidrogÃ©nio'),

            # Transportes

            ('air', 'Transporte AÃ©reo'), ('rail', 'Transporte FerroviÃ¡rio'), ('water', 'Transporte por Vias NavegÃ¡veis'), ('road', 'Transporte RodoviÃ¡rio'),

            # Banca e FinanÃ§as

            ('credit_inst', 'InstituiÃ§Ãµes de CrÃ©dito'), ('trading_venue', 'Operadores de Plataformas de NegociaÃ§Ã£o'), ('ccp', 'Contrapartes Centrais'),

            # SaÃºde

            ('healthcare_prov', 'Prestadores de Cuidados de SaÃºde'), ('eu_ref_lab', 'LaboratÃ³rios de ReferÃªncia da UE'), ('pharma_r_d', 'InvestigaÃ§Ã£o e Desenvolvimento de Medicamentos'), ('pharma_mfg', 'Fabrico de Produtos FarmacÃªuticos'), ('med_device_mfg', 'Fabrico de Dispositivos MÃ©dicos'),

            # Ãgua

            ('water_supply', 'Abastecimento e DistribuiÃ§Ã£o de Ãgua'), ('waste_water_coll', 'Recolha e Tratamento de Ãguas Residuais'),

            # Infra Digital

            ('ixp', 'Pontos de Troca de TrÃ¡fego Internet (IXP)'), ('dns', 'Sistemas de Nomes de DomÃ­nio (DNS)'), ('tld', 'Registos de Nomes de DomÃ­nio de Topo (TLD)'), ('cloud', 'ServiÃ§os de ComputaÃ§Ã£o em Nuvem'), ('data_centre', 'ServiÃ§os de Centro de Dados'), ('cdn', 'Redes de DÃ©bito de ConteÃºdo (CDN)'), ('trust_service', 'ServiÃ§os de ConfianÃ§a'), ('elec_comm', 'Redes/ServiÃ§os de ComunicaÃ§Ãµes EletrÃ³nicas PÃºblicas'),

            # TIC B2B

            ('msp', 'Managed Service Providers (MSP)'), ('mssp', 'Managed Security Service Providers (MSSP)'),

            # Admin PÃºblica e EspaÃ§o

            ('central_gov', 'AdministraÃ§Ã£o Central'), ('regional_gov', 'AdministraÃ§Ã£o Regional'), ('space_ops', 'Operadores de Infraestruturas Terrestres (EspaÃ§o)'),

            # Anexo II

            ('postal_services', 'ServiÃ§os Postais e de Estafeta'), ('waste_coll', 'Recolha, Transporte e GestÃ£o de ResÃ­duos'), ('chem_mfg', 'Fabrico de Produtos QuÃ­micos'), ('food_prod', 'ProduÃ§Ã£o, TransformaÃ§Ã£o e DistribuiÃ§Ã£o de Alimentos'),

            # Fabrico Anexo II

            ('mfg_med_devices', 'Fabrico de Dispositivos MÃ©dicos (Geral)'), ('mfg_comp_elec', 'Fabrico de Produtos InformÃ¡ticos e EletrÃ³nicos'), ('mfg_elec_eq', 'Fabrico de Equipamentos ElÃ©tricos'), ('mfg_machinery', 'Fabrico de MÃ¡quinas e Equipamentos'), ('mfg_vehicles', 'Fabrico de VeÃ­culos AutomÃ³veis'), ('mfg_transport_eq', 'Fabrico de Outro Equipamento de Transporte'),

            # Fornecedores Digitais

            ('online_mkt', 'Mercados em Linha (Marketplaces)'), ('search_engine', 'Motores de Busca em Linha'), ('social_net', 'Redes Sociais'),

            # InvestigaÃ§Ã£o

            ('research_org', 'Organismos de InvestigaÃ§Ã£o / Universidades'),

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

