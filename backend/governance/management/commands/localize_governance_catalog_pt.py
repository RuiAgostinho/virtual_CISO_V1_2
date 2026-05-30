import os

from django.core.management.base import BaseCommand

from governance.models import Control, Framework, FrameworkSection, InternalControl


NIS2_TITLES = {
    "NIS2-01-01": "Política de gestão de riscos de cibersegurança",
    "NIS2-01-02": "Avaliações de risco de cibersegurança",
    "NIS2-02-01": "Procedimentos de resposta a incidentes",
    "NIS2-02-02": "Capacidade de comunicação de incidentes",
    "NIS2-03-01": "Planeamento de continuidade de negócio",
    "NIS2-03-02": "Gestão de cópias de segurança",
    "NIS2-04-01": "Gestão do risco de cibersegurança da cadeia de abastecimento",
    "NIS2-04-02": "Avaliação de cibersegurança de fornecedores",
    "NIS2-04-03": "Monitorização contínua da segurança de fornecedores",
    "NIS2-05-01": "Aquisição segura de sistemas",
    "NIS2-05-02": "Ciclo de vida de desenvolvimento seguro",
    "NIS2-05-03": "Manutenção segura e aplicação de correções",
    "NIS2-06-01": "Gestão de vulnerabilidades",
    "NIS2-06-02": "Revisão da eficácia dos controlos de cibersegurança",
    "NIS2-06-03": "Acompanhamento da remediação e melhoria",
    "NIS2-07-01": "Práticas de higiene cibernética",
    "NIS2-07-02": "Formação e sensibilização em cibersegurança",
    "NIS2-07-03": "Controlos base de higiene cibernética",
    "NIS2-08-01": "Política de criptografia e cifragem",
    "NIS2-08-02": "Gestão de chaves criptográficas",
    "NIS2-09-01": "Medidas de segurança de recursos humanos",
    "NIS2-09-02": "Política de controlo de acessos",
    "NIS2-09-03": "Inventário e propriedade de ativos",
    "NIS2-10-01": "Autenticação multifator",
    "NIS2-10-02": "Comunicações seguras",
    "NIS2-10-03": "Autenticação contínua ou adaptativa",
}


NIS2_GUIDANCE = {
    "NIS2-01-01": "Definir, aprovar e rever periodicamente políticas documentadas de gestão de riscos de cibersegurança que cubram todos os sistemas de rede e informação.",
    "NIS2-01-02": "Identificar ameaças, vulnerabilidades e impactos que afetem os sistemas de rede e informação, atualizando regularmente as avaliações de risco.",
    "NIS2-02-01": "Criar planos de resposta a incidentes, definir papéis e vias de escalamento e implementar capacidades de deteção e resposta.",
    "NIS2-02-02": "Assegurar que os incidentes podem ser detetados, analisados e comunicados às autoridades competentes de acordo com os requisitos regulamentares.",
    "NIS2-03-01": "Desenvolver planos de continuidade de negócio e procedimentos de gestão de crise para assegurar a resiliência dos serviços críticos e dos sistemas de suporte.",
    "NIS2-03-02": "Manter cópias de segurança seguras, definir procedimentos de recuperação e testar regularmente os processos de restauro segundo os requisitos do negócio.",
    "NIS2-04-01": "Definir requisitos de segurança para fornecedores, avaliar risco de terceiros e integrar a cibersegurança dos fornecedores na contratação e gestão contratual.",
    "NIS2-04-02": "Estabelecer processos para avaliar controlos de segurança de fornecedores, requisitos contratuais, mecanismos de garantia e exposição ao risco de cibersegurança.",
    "NIS2-04-03": "Definir atividades periódicas de reavaliação, indicadores de desempenho e procedimentos de escalamento para fornecedores que suportam serviços ou sistemas críticos.",
    "NIS2-05-01": "Definir requisitos de segurança para processos de aquisição e incluir critérios de avaliação de segurança na seleção de produtos, sistemas e fornecedores.",
    "NIS2-05-02": "Adotar práticas de desenvolvimento seguro, revisão de código, análise de vulnerabilidades, testes de segurança e controlo de alterações ao longo do ciclo de vida dos sistemas.",
    "NIS2-05-03": "Implementar procedimentos de manutenção que incluam gestão de correções, controlo de configuração, planeamento de reversão e validação após alterações relevantes para a segurança.",
    "NIS2-06-01": "Identificar, avaliar, priorizar e remediar vulnerabilidades em sistemas de rede e informação, incluindo divulgação coordenada de vulnerabilidades quando aplicável.",
    "NIS2-06-02": "Executar revisões periódicas, auditorias internas, testes de controlos e avaliações baseadas em evidência para determinar se as medidas de segurança continuam eficazes.",
    "NIS2-06-03": "Registar deficiências identificadas, atribuir responsáveis, definir prazos e acompanhar a remediação até ao encerramento, com supervisão da gestão.",
    "NIS2-07-01": "Assegurar que gestão de correções, configuração segura, proteção contra malware, hardening e práticas de administração segura são aplicadas nos sistemas.",
    "NIS2-07-02": "Desenvolver e executar programas periódicos de sensibilização, formação por função e exercícios práticos, mantendo registos de presença e eficácia.",
    "NIS2-07-03": "Implementar práticas de base como correções, configuração segura, funcionalidade mínima, proteção contra malware e procedimentos de administração segura.",
    "NIS2-08-01": "Especificar mecanismos criptográficos aprovados, requisitos de gestão de chaves, casos de uso de proteção de dados e responsabilidades de implementação e revisão.",
    "NIS2-08-02": "Definir requisitos de geração, distribuição, armazenamento, rotação, revogação, cópia de segurança e destruição de chaves criptográficas de acordo com risco e criticidade.",
    "NIS2-09-01": "Definir responsabilidades de segurança, controlos de onboarding e offboarding, alterações de função, tratamento disciplinar e, quando apropriado, procedimentos de verificação.",
    "NIS2-09-02": "Definir controlos de ciclo de vida de identidades, regras de atribuição de privilégios, segregação de funções, revisões periódicas de acessos e remoção célere de acessos desnecessários.",
    "NIS2-09-03": "Identificar ativos, classificá-los quando apropriado, atribuir responsáveis e manter registos de ciclo de vida para suportar decisões de risco e proteção.",
    "NIS2-10-01": "Implementar autenticação multifator ou soluções de autenticação contínua para sistemas críticos, contas privilegiadas e cenários de acesso sensível.",
    "NIS2-10-02": "Proteger comunicações com cifragem adequada, autenticação forte, plataformas aprovadas e medidas de resiliência para casos críticos ou de emergência.",
    "NIS2-10-03": "Aplicar controlos de autenticação contextual ou baseada em risco para sistemas críticos, acessos privilegiados e transações sensíveis, de acordo com o risco organizacional.",
}


NIST_CSF_20_TITLES = {
    "GV.OC-01": "A missão organizacional é compreendida e informa a gestão do risco de cibersegurança",
    "GV.OC-02": "As partes interessadas internas e externas são compreendidas e as suas necessidades e expectativas são consideradas",
    "GV.OC-03": "Os requisitos legais, regulamentares e contratuais de cibersegurança, incluindo privacidade e liberdades civis, são compreendidos e geridos",
    "GV.OC-04": "Os objetivos, capacidades e serviços críticos esperados por partes interessadas externas são compreendidos e comunicados",
    "GV.OC-05": "Os resultados, capacidades e serviços de que a organização depende são compreendidos e comunicados",
    "GV.RM-01": "Os objetivos de gestão de risco são definidos e acordados pelas partes interessadas da organização",
    "GV.RM-02": "As declarações de apetite e tolerância ao risco são definidas, comunicadas e mantidas",
    "GV.RM-03": "As atividades e resultados de gestão do risco de cibersegurança são integrados nos processos de gestão de risco empresarial",
    "GV.RM-04": "A orientação estratégica sobre opções de resposta ao risco é definida e comunicada",
    "GV.RM-05": "São estabelecidas linhas de comunicação sobre riscos de cibersegurança, incluindo riscos de fornecedores e terceiros",
    "GV.RM-06": "É definido e comunicado um método normalizado para calcular, documentar, categorizar e priorizar riscos de cibersegurança",
    "GV.RM-07": "As oportunidades estratégicas, enquanto riscos positivos, são caracterizadas e incluídas nas discussões de cibersegurança",
    "GV.RR-01": "A liderança é responsável e responsabilizável pelo risco de cibersegurança e promove uma cultura consciente do risco, ética e de melhoria contínua",
    "GV.RR-02": "Os papéis, responsabilidades e autoridades de cibersegurança são definidos, comunicados, compreendidos e aplicados",
    "GV.RR-03": "São alocados recursos adequados à estratégia, papéis, responsabilidades e políticas de cibersegurança",
    "GV.RR-04": "A cibersegurança é integrada nas práticas de recursos humanos",
    "GV.PO-01": "A política de gestão de riscos de cibersegurança é estabelecida com base no contexto, estratégia e prioridades da organização, sendo comunicada e aplicada",
    "GV.PO-02": "A política de gestão de riscos de cibersegurança é revista, atualizada, comunicada e aplicada face a alterações de requisitos, ameaças, tecnologia e missão",
    "GV.OV-01": "Os resultados da estratégia de gestão do risco de cibersegurança são revistos para informar e ajustar a direção estratégica",
    "GV.OV-02": "A estratégia de gestão do risco de cibersegurança é revista e ajustada para assegurar cobertura dos requisitos e riscos organizacionais",
    "GV.OV-03": "O desempenho da gestão do risco de cibersegurança é avaliado e revisto para identificar ajustes necessários",
    "GV.SC-01": "É estabelecido e acordado um programa de gestão do risco de cibersegurança da cadeia de abastecimento",
    "GV.SC-02": "Os papéis e responsabilidades de cibersegurança de fornecedores, clientes e parceiros são definidos, comunicados e coordenados",
    "GV.SC-03": "A gestão do risco da cadeia de abastecimento é integrada na cibersegurança, gestão de risco empresarial, avaliação de risco e melhoria",
    "GV.SC-04": "Os fornecedores são conhecidos e priorizados de acordo com a sua criticidade",
    "GV.SC-05": "Os requisitos para tratar riscos de cibersegurança na cadeia de abastecimento são definidos, priorizados e integrados em contratos e acordos",
    "GV.SC-06": "São realizados planeamento e diligência prévia para reduzir riscos antes de relações formais com fornecedores ou terceiros",
    "GV.SC-07": "Os riscos colocados por fornecedores, produtos, serviços e terceiros são compreendidos, registados, priorizados, avaliados, tratados e monitorizados",
    "GV.SC-08": "Fornecedores e terceiros relevantes são incluídos no planeamento, resposta e recuperação de incidentes",
    "GV.SC-09": "As práticas de segurança da cadeia de abastecimento são integradas nos programas de cibersegurança e gestão de risco empresarial e monitorizadas ao longo do ciclo de vida",
    "GV.SC-10": "Os planos de gestão do risco da cadeia de abastecimento incluem atividades posteriores ao fim de uma parceria ou acordo de serviço",
    "ID.AM-01": "São mantidos inventários de hardware gerido pela organização",
    "ID.AM-02": "São mantidos inventários de software, serviços e sistemas geridos pela organização",
    "ID.AM-03": "São mantidas representações das comunicações de rede autorizadas e dos fluxos de dados internos e externos",
    "ID.AM-04": "São mantidos inventários de serviços prestados por fornecedores",
    "ID.AM-05": "Os ativos são priorizados com base na classificação, criticidade, recursos e impacto na missão",
    "ID.AM-07": "São mantidos inventários de dados e metadados correspondentes para tipos de dados designados",
    "ID.AM-08": "Sistemas, hardware, software, serviços e dados são geridos ao longo dos respetivos ciclos de vida",
    "ID.RA-01": "As vulnerabilidades em ativos são identificadas, validadas e registadas",
    "ID.RA-02": "A inteligência sobre ameaças cibernéticas é recebida a partir de fóruns e fontes de partilha de informação",
    "ID.RA-03": "As ameaças internas e externas à organização são identificadas e registadas",
    "ID.RA-04": "São identificados e registados os impactos potenciais e as probabilidades de ameaças explorarem vulnerabilidades",
    "ID.RA-05": "Ameaças, vulnerabilidades, probabilidades e impactos são usados para compreender o risco inerente e priorizar a resposta",
    "ID.RA-06": "As respostas ao risco são escolhidas, priorizadas, planeadas, acompanhadas e comunicadas",
    "ID.RA-07": "Alterações e exceções são geridas, avaliadas quanto ao impacto no risco, registadas e acompanhadas",
    "ID.RA-08": "São estabelecidos processos para receber, analisar e responder a divulgações de vulnerabilidades",
    "ID.RA-09": "A autenticidade e integridade de hardware e software são avaliadas antes da aquisição e utilização",
    "ID.RA-10": "Os fornecedores críticos são avaliados antes da aquisição",
    "ID.IM-01": "São identificadas melhorias a partir de avaliações",
    "ID.IM-02": "São identificadas melhorias a partir de testes e exercícios de segurança, incluindo os realizados com fornecedores e terceiros relevantes",
    "ID.IM-03": "São identificadas melhorias a partir da execução de processos, procedimentos e atividades operacionais",
    "ID.IM-04": "Planos de resposta a incidentes e outros planos de cibersegurança que afetam operações são estabelecidos, comunicados, mantidos e melhorados",
    "PR.AA-01": "As identidades e credenciais de utilizadores, serviços e hardware autorizados são geridas pela organização",
    "PR.AA-02": "As identidades são verificadas e associadas a credenciais com base no contexto das interações",
    "PR.AA-03": "Utilizadores, serviços e hardware são autenticados",
    "PR.AA-04": "As afirmações de identidade são protegidas, transmitidas e verificadas",
    "PR.AA-05": "Permissões, direitos e autorizações de acesso são definidos em política, geridos, aplicados e revistos, incorporando menor privilégio e segregação de funções",
    "PR.AA-06": "O acesso físico a ativos é gerido, monitorizado e aplicado de forma proporcional ao risco",
    "PR.AT-01": "O pessoal recebe sensibilização e formação para executar tarefas gerais tendo em conta riscos de cibersegurança",
    "PR.AT-02": "Pessoas em funções especializadas recebem sensibilização e formação para executar tarefas relevantes tendo em conta riscos de cibersegurança",
    "PR.DS-01": "A confidencialidade, integridade e disponibilidade dos dados em repouso são protegidas",
    "PR.DS-02": "A confidencialidade, integridade e disponibilidade dos dados em trânsito são protegidas",
    "PR.DS-10": "A confidencialidade, integridade e disponibilidade dos dados em utilização são protegidas",
    "PR.DS-11": "São criadas, protegidas, mantidas e testadas cópias de segurança dos dados",
    "PR.PS-01": "São estabelecidas e aplicadas práticas de gestão de configuração",
    "PR.PS-02": "O software é mantido, substituído e removido de forma proporcional ao risco",
    "PR.PS-03": "O hardware é mantido, substituído e removido de forma proporcional ao risco",
    "PR.PS-04": "São gerados registos de eventos e disponibilizados para monitorização contínua",
    "PR.PS-05": "A instalação e execução de software não autorizado são prevenidas",
    "PR.PS-06": "Práticas de desenvolvimento seguro são integradas e o seu desempenho é monitorizado ao longo do ciclo de vida de desenvolvimento",
    "PR.IR-01": "Redes e ambientes são protegidos contra acesso lógico e utilização não autorizados",
    "PR.IR-02": "Os ativos tecnológicos da organização são protegidos contra ameaças ambientais",
    "PR.IR-03": "São implementados mecanismos para cumprir requisitos de resiliência em situações normais e adversas",
    "PR.IR-04": "É mantida capacidade adequada de recursos para assegurar disponibilidade",
    "DE.CM-01": "Redes e serviços de rede são monitorizados para encontrar eventos potencialmente adversos",
    "DE.CM-02": "O ambiente físico é monitorizado para encontrar eventos potencialmente adversos",
    "DE.CM-03": "A atividade do pessoal e a utilização de tecnologia são monitorizadas para encontrar eventos potencialmente adversos",
    "DE.CM-06": "Atividades e serviços de prestadores externos são monitorizados para encontrar eventos potencialmente adversos",
    "DE.CM-09": "Hardware, software, ambientes de execução e respetivos dados são monitorizados para encontrar eventos potencialmente adversos",
    "DE.AE-02": "Eventos potencialmente adversos são analisados para compreender melhor as atividades associadas",
    "DE.AE-03": "A informação é correlacionada a partir de múltiplas fontes",
    "DE.AE-04": "O impacto e âmbito estimados dos eventos adversos são compreendidos",
    "DE.AE-06": "Informação sobre eventos adversos é disponibilizada a pessoal e ferramentas autorizados",
    "DE.AE-07": "Inteligência sobre ameaças e outra informação contextual são integradas na análise",
    "DE.AE-08": "Incidentes são declarados quando eventos adversos cumprem os critérios definidos",
    "RS.MA-01": "O plano de resposta a incidentes é executado em coordenação com terceiros relevantes quando um incidente é declarado",
    "RS.MA-02": "Os relatórios de incidentes são triados e validados",
    "RS.MA-03": "Os incidentes são categorizados e priorizados",
    "RS.MA-04": "Os incidentes são escalados ou elevados quando necessário",
    "RS.MA-05": "São aplicados os critérios para iniciar a recuperação de incidentes",
    "RS.AN-03": "É realizada análise para determinar o que aconteceu durante o incidente e a sua causa-raiz",
    "RS.AN-06": "As ações realizadas durante uma investigação são registadas e a integridade e proveniência dos registos são preservadas",
    "RS.AN-07": "Dados e metadados de incidentes são recolhidos e a sua integridade e proveniência são preservadas",
    "RS.AN-08": "A magnitude de um incidente é estimada e validada",
    "RS.CO-02": "Partes interessadas internas e externas são notificadas dos incidentes",
    "RS.CO-03": "A informação é partilhada com partes interessadas internas e externas designadas",
    "RS.MI-01": "Os incidentes são contidos",
    "RS.MI-02": "Os incidentes são erradicados",
    "RC.RP-01": "A componente de recuperação do plano de resposta a incidentes é executada após o processo de resposta ser iniciado",
    "RC.RP-02": "As ações de recuperação são selecionadas, delimitadas, priorizadas e executadas",
    "RC.RP-03": "A integridade das cópias de segurança e outros ativos de restauro é verificada antes da sua utilização",
    "RC.RP-04": "Funções críticas da missão e gestão do risco de cibersegurança são consideradas para estabelecer normas operacionais pós-incidente",
    "RC.RP-05": "A integridade dos ativos restaurados é verificada, sistemas e serviços são repostos e o estado normal de operação é confirmado",
    "RC.RP-06": "O fim da recuperação de incidente é declarado com base em critérios e a documentação do incidente é concluída",
    "RC.CO-03": "As atividades de recuperação e o progresso no restabelecimento de capacidades operacionais são comunicados a partes interessadas designadas",
    "RC.CO-04": "Atualizações públicas sobre a recuperação de incidentes são partilhadas por métodos e mensagens aprovados",
}


SECTION_NAMES = {
    "GV": "Governar",
    "ID": "Identificar",
    "PR": "Proteger",
    "DE": "Detetar",
    "RS": "Responder",
    "RC": "Recuperar",
    "GV.OC": "Contexto organizacional",
    "GV.RM": "Estratégia de gestão de risco",
    "GV.RR": "Papéis, responsabilidades e autoridades",
    "GV.PO": "Política",
    "GV.OV": "Supervisão",
    "GV.SC": "Gestão do risco da cadeia de abastecimento",
    "ID.AM": "Gestão de ativos",
    "ID.RA": "Avaliação de risco",
    "ID.IM": "Melhoria",
    "PR.AA": "Identidade, autenticação e controlo de acessos",
    "PR.AT": "Sensibilização e formação",
    "PR.DS": "Segurança dos dados",
    "PR.PS": "Segurança da plataforma",
    "PR.IR": "Resiliência da infraestrutura tecnológica",
    "DE.CM": "Monitorização contínua",
    "DE.AE": "Análise de eventos adversos",
    "RS.MA": "Gestão da resposta a incidentes",
    "RS.AN": "Análise de incidentes",
    "RS.CO": "Comunicação da resposta a incidentes",
    "RS.MI": "Mitigação de incidentes",
    "RC.RP": "Execução da recuperação",
    "RC.CO": "Comunicação da recuperação",
}


INTERNAL_CONTROL_TEXTS = {
    "IC-GOV-001": ("Governação de segurança da informação", "Governação"),
    "IC-RISK-001": ("Gestão do risco de cibersegurança", "Risco"),
    "IC-ASSET-001": ("Inventário, propriedade e classificação de ativos", "Gestão de ativos"),
    "IC-AC-001": ("Autenticação forte e gestão de identidades", "Controlo de acessos"),
    "IC-AC-002": ("Gestão de privilégios e acessos administrativos", "Controlo de acessos"),
    "IC-AC-003": ("Ciclo de vida de acessos", "Controlo de acessos"),
    "IC-INC-001": ("Gestão de incidentes de cibersegurança", "Gestão de incidentes"),
    "IC-BCM-001": ("Continuidade de negócio e recuperação", "Continuidade"),
    "IC-SUP-001": ("Gestão de risco de fornecedores", "Fornecedores"),
    "IC-VUL-001": ("Gestão de vulnerabilidades", "Vulnerabilidades"),
    "IC-LOG-001": ("Registo, monitorização e deteção", "Monitorização"),
    "IC-DP-001": ("Proteção de dados e criptografia", "Proteção de dados"),
    "IC-DEV-001": ("Aquisição, desenvolvimento e manutenção segura", "Desenvolvimento seguro"),
    "IC-PHY-001": ("Segurança física e ambiental", "Segurança física"),
    "IC-AWARE-001": ("Sensibilização e formação em segurança", "Sensibilização"),
    "IC-EVID-001": ("Evidência, auditoria e melhoria contínua", "Auditoria e melhoria"),
    "IC-NET-001": ("Segurança de redes e comunicações", "Segurança de redes"),
    "IC-UC1-VULN-001": ("Priorização contextual de vulnerabilidades", "Gestão de vulnerabilidades"),
}


class Command(BaseCommand):
    help = "Normaliza textos visíveis de governance/frameworks para português de Portugal."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        os.environ.setdefault("VIRTUAL_CISO_DISABLE_RAG_SIGNALS", "1")
        dry_run = options["dry_run"]
        updated_controls = 0
        updated_sections = 0
        updated_internal = 0

        for control in Control.objects.select_related("framework").filter(framework__code="NIS2", framework__version="2022"):
            title = NIS2_TITLES.get(control.code)
            guidance = NIS2_GUIDANCE.get(control.code, control.implementation_guidance)
            if title and (
                control.title != title
                or control.description != title
                or control.implementation_guidance != guidance
            ):
                if not dry_run:
                    control.title = title
                    control.description = title
                    control.implementation_guidance = guidance
                    control.save(update_fields=["title", "description", "implementation_guidance", "updated_at"])
                updated_controls += 1

        for control in Control.objects.select_related("framework").filter(framework__code="NISTCSF", framework__version="2.0"):
            title = NIST_CSF_20_TITLES.get(control.code)
            if title and (control.title != title or control.description != title):
                if not dry_run:
                    control.title = title
                    control.description = title
                    control.save(update_fields=["title", "description", "updated_at"])
                updated_controls += 1

        for control in Control.objects.select_related("framework").filter(framework__code="DL125", framework__version="2025"):
            replacements = {
                "DL125-LOG-001": "Registo, monitorização e deteção operacional",
            }
            title = replacements.get(control.code)
            if title and (control.title != title or control.description != title):
                if not dry_run:
                    control.title = title
                    control.description = title
                    control.save(update_fields=["title", "description", "updated_at"])
                updated_controls += 1

        for section in FrameworkSection.objects.select_related("framework").filter(framework__code="NISTCSF", framework__version="2.0"):
            name = SECTION_NAMES.get(section.code)
            if name and section.name != name:
                if not dry_run:
                    section.name = name
                    section.save(update_fields=["name", "updated_at"])
                updated_sections += 1

        for control in InternalControl.objects.filter(is_active=True):
            replacement = INTERNAL_CONTROL_TEXTS.get(control.code)
            if not replacement:
                continue
            title, domain = replacement
            if control.title != title or control.control_domain != domain:
                if not dry_run:
                    control.title = title
                    control.control_domain = domain
                    if control.code == "IC-GOV-001":
                        control.objective = "Definir responsabilidades, políticas, estruturas de governo e supervisão de segurança."
                        control.risk_statement = "Sem governação clara, a organização perde alinhamento, responsabilização e capacidade de controlo."
                        control.description = control.objective
                    control.save(update_fields=[
                        "title",
                        "control_domain",
                        "objective",
                        "risk_statement",
                        "description",
                        "updated_at",
                    ])
                updated_internal += 1

        suffix = " (simulação)" if dry_run else ""
        self.stdout.write(self.style.SUCCESS(f"Localização PT-PT concluída{suffix}."))
        self.stdout.write(f"Controlos externos atualizados: {updated_controls}")
        self.stdout.write(f"Secções atualizadas: {updated_sections}")
        self.stdout.write(f"Controlos internos atualizados: {updated_internal}")
