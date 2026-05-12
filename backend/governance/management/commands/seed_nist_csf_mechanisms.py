from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import Control, ControlMechanism, Mechanism, SuggestedMechanism, Tag


NIST_FRAMEWORK_NAME = "NIST Cybersecurity Framework"


NEW_MECHANISMS = {
    "Perfil Organizacional CSF Atual e Alvo": {
        "type": "Processo",
        "description": "Perfil que compara o estado atual e o estado alvo dos outcomes do NIST CSF, com prioridades, lacunas e responsáveis.",
    },
    "Avaliação de Tier de Maturidade CSF": {
        "type": "Processo",
        "description": "Avaliação do rigor das práticas de governação e gestão de risco cibernético segundo os tiers do NIST CSF.",
    },
    "Dashboard de Risco Cibernético e KRIs": {
        "type": "Técnico",
        "description": "Painel executivo com indicadores de risco, exposição, conformidade, exceções, incidentes e evolução dos planos de tratamento.",
    },
    "Plano de Recursos e Orçamento de Cibersegurança": {
        "type": "Processo",
        "description": "Planeamento de recursos, orçamento, capacidades, responsabilidades e prioridades para suportar a gestão de risco cibernético.",
    },
    "Registo de Partes Interessadas e Expectativas de Cibersegurança": {
        "type": "Processo",
        "description": "Registo de stakeholders internos e externos, necessidades, expectativas, responsabilidades, requisitos e canais de comunicação.",
    },
    "Integração do Risco Cibernético na Gestão de Risco Empresarial": {
        "type": "Processo",
        "description": "Processo para integrar risco cibernético em reporting, comités, apetite ao risco, decisões de negócio e gestão de risco corporativo.",
    },
    "Registo de Oportunidades Estratégicas de Cibersegurança": {
        "type": "Processo",
        "description": "Registo de oportunidades positivas associadas a cibersegurança, como melhoria de confiança, eficiência, conformidade ou resiliência.",
    },
    "Registo de Criticidade de Fornecedores": {
        "type": "Fornecedor",
        "description": "Classificação de fornecedores por criticidade, dependência operacional, exposição, dados tratados e impacto potencial.",
    },
    "Due Diligence de Segurança em Aquisições e Terceiros": {
        "type": "Fornecedor",
        "description": "Avaliação de segurança e risco antes de contratar fornecedores, adquirir tecnologia ou integrar serviços externos.",
    },
    "Controlos de Proteção de Dados em Uso": {
        "type": "Técnico",
        "description": "Medidas para proteger dados durante processamento, incluindo isolamento, controlo de sessões, permissões, monitorização e proteção aplicacional.",
    },
    "Guardrails de Proteção de Dados em Serviços Externos": {
        "type": "Técnico",
        "description": "Regras de configuração, cifragem, logging, residência, partilha e acesso para dados tratados em cloud, SaaS ou terceiros.",
    },
    "Critérios de Ativação e Encerramento da Recuperação": {
        "type": "Processo",
        "description": "Critérios objetivos para iniciar recuperação, priorizar serviços, validar restauro e declarar fim formal da recuperação.",
    },
    "Comunicação Pública e Gestão Reputacional Pós-Incidente": {
        "type": "Processo",
        "description": "Playbook para comunicação pública, relação com media, clientes e parceiros, e recuperação de confiança após incidentes.",
    },
}


CONTROL_MAP = {
    "GV.OC-01": ["Mapa de Contexto Organizacional e Serviços Críticos", "Perfil Organizacional CSF Atual e Alvo"],
    "GV.OC-02": ["Registo de Partes Interessadas e Expectativas de Cibersegurança", "Mapa de Contexto Organizacional e Serviços Críticos"],
    "GV.OC-03": ["Mapeamento de Requisitos Legais e Regulamentares", "Cláusulas Contratuais de Segurança e Privacidade"],
    "GV.OC-04": ["Mapa de Contexto Organizacional e Serviços Críticos", "Análise de Impacto no Negócio (BIA)"],
    "GV.OC-05": ["Catálogo de Sistemas Externos e Interligações", "Gestão de Capacidade e Resiliência de Serviços Críticos"],
    "GV.OV-01": ["Dashboard de Risco Cibernético e KRIs", "Perfil Organizacional CSF Atual e Alvo"],
    "GV.OV-02": ["Avaliação de Tier de Maturidade CSF", "Dashboard de Risco Cibernético e KRIs"],
    "GV.PO-01": ["Política de Segurança de Informação", "Metodologia de Avaliação de Risco"],
    "GV.PO-02": ["Revisão Periódica de Políticas", "Autoavaliação de Conformidade com Políticas"],
    "GV.RM-01": ["Metodologia de Avaliação de Risco", "Registo de Partes Interessadas e Expectativas de Cibersegurança"],
    "GV.RM-02": ["Registo de Tolerância e Aceitação de Risco", "Metodologia de Avaliação de Risco"],
    "GV.RM-03": ["Integração do Risco Cibernético na Gestão de Risco Empresarial", "Dashboard de Risco Cibernético e KRIs"],
    "GV.RM-04": ["Plano de Tratamento de Risco Priorizado", "Registo de Tolerância e Aceitação de Risco"],
    "GV.RM-05": ["Plano de Tratamento de Risco Priorizado", "Dashboard de Risco Cibernético e KRIs"],
    "GV.RM-06": ["Metodologia de Avaliação de Risco", "Registo de Riscos (Risk Register)"],
    "GV.RM-07": ["Registo de Oportunidades Estratégicas de Cibersegurança", "Integração do Risco Cibernético na Gestão de Risco Empresarial"],
    "GV.RR-01": ["Declaração de Responsabilidades da Gestão", "Dashboard de Risco Cibernético e KRIs"],
    "GV.RR-02": ["Atribuição de Responsabilidades de Segurança", "Matriz de Segregação de Funções"],
    "GV.RR-03": ["Plano de Recursos e Orçamento de Cibersegurança", "Perfil Organizacional CSF Atual e Alvo"],
    "GV.SC-01": ["Processo de Gestão de Risco da Cadeia Logística", "Questionários de Segurança para Fornecedores"],
    "GV.SC-02": ["Registo de Criticidade de Fornecedores", "Processo de Gestão de Risco da Cadeia Logística"],
    "GV.SC-03": ["Cláusulas Contratuais de Segurança e Privacidade", "Processo de Gestão de Risco da Cadeia Logística"],
    "GV.SC-04": ["Revisão Periódica de Serviços de Fornecedores", "Questionários de Segurança para Fornecedores"],
    "GV.SC-05": ["Exercícios de Continuidade de Negócio", "Plano de Comunicação de Incidentes e Recuperação"],
    "ID.AM-01": ["Ferramenta de Descoberta de Ativos (Asset Discovery)", "Inventário de Ativos de Informação"],
    "ID.AM-02": ["Catálogo de Aplicações Críticas", "Inventário de Ativos de Informação"],
    "ID.AM-03": ["Mapa de Fluxos de Dados e Dependências de Rede", "Segmentação de Rede (VLANs / Microsegmentação)"],
    "ID.AM-04": ["Catálogo de Sistemas Externos e Interligações", "Registo de Criticidade de Fornecedores"],
    "ID.AM-05": ["Esquema de Classificação de Informação", "Mapa de Contexto Organizacional e Serviços Críticos"],
    "ID.AM-06": ["Atribuição de Responsabilidades de Segurança", "Inventário de Ativos de Informação"],
    "ID.BE-01": ["Mapa de Contexto Organizacional e Serviços Críticos", "Análise de Impacto no Negócio (BIA)"],
    "ID.BE-02": ["Mapa de Contexto Organizacional e Serviços Críticos", "Mapeamento de Requisitos Legais e Regulamentares"],
    "ID.BE-03": ["Mapa de Contexto Organizacional e Serviços Críticos", "Perfil Organizacional CSF Atual e Alvo"],
    "ID.BE-04": ["Mapa de Contexto Organizacional e Serviços Críticos", "Catálogo de Sistemas Externos e Interligações"],
    "ID.BE-05": ["Gestão de Capacidade e Resiliência de Serviços Críticos", "Análise de Impacto no Negócio (BIA)"],
    "ID.GV-01": ["Política de Segurança de Informação", "Revisão Periódica de Políticas"],
    "ID.GV-02": ["Atribuição de Responsabilidades de Segurança", "Matriz de Segregação de Funções"],
    "ID.GV-03": ["Mapeamento de Requisitos Legais e Regulamentares", "Autoavaliação de Conformidade com Políticas"],
    "ID.GV-04": ["Metodologia de Avaliação de Risco", "Integração do Risco Cibernético na Gestão de Risco Empresarial"],
    "ID.IM-01": ["Autoavaliação de Conformidade com Políticas", "Avaliação da Eficácia de Tecnologias de Proteção"],
    "ID.IM-02": ["Plano de Tratamento de Risco Priorizado", "Avaliação da Eficácia de Tecnologias de Proteção"],
    "ID.RA-01": ["Gestão Centralizada de Vulnerabilidades", "Registo de Riscos (Risk Register)"],
    "ID.RA-02": ["Participação em Grupos de Confiança Setoriais", "Plataforma de Inteligência de Ameaças"],
    "ID.RA-03": ["Plataforma de Inteligência de Ameaças", "Registo de Riscos (Risk Register)"],
    "ID.RA-04": ["Análise de Impacto no Negócio (BIA)", "Metodologia de Avaliação de Risco"],
    "ID.RA-05": ["Plano de Tratamento de Risco Priorizado", "Registo de Riscos (Risk Register)"],
    "ID.RA-06": ["Metodologia de Avaliação de Risco", "Dashboard de Risco Cibernético e KRIs"],
    "PR.AC-01": ["Gestão Centralizada de Identidades (IdP/AD)", "Política de Autenticação e Gestão de Credenciais"],
    "PR.AC-02": ["Controlo de Acessos Físicos (Biometria/Cartão)", "Registo de Visitantes"],
    "PR.AC-03": ["Gestão Segura de Acessos Remotos", "Autenticação Multifator (MFA)"],
    "PR.AC-04": ["Princípio do Privilégio Mínimo (PoLP)", "Gestão de Acessos Privilegiados (PAM)", "Matriz de Segregação de Funções"],
    "PR.AC-05": ["Segmentação de Rede (VLANs / Microsegmentação)", "Firewall de Próxima Geração (NGFW)", "Mapa de Fluxos de Dados e Dependências de Rede"],
    "PR.AC-06": ["Norma de Controlo de Acesso", "Matriz RBAC/ABAC de Acesso à Informação"],
    "PR.AC-07": ["Autenticação Multifator (MFA)", "Política de Autenticação e Gestão de Credenciais"],
    "PR.AT-01": ["Formação de Acolhimento em Segurança (Onboarding)", "Programa Anual de Sensibilização (Awareness)"],
    "PR.AT-02": ["Gestão de Acessos Privilegiados (PAM)", "Atribuição de Responsabilidades de Segurança"],
    "PR.AT-03": ["Cláusulas Contratuais de Segurança e Privacidade", "Registo de Partes Interessadas e Expectativas de Cibersegurança"],
    "PR.AT-04": ["Declaração de Responsabilidades da Gestão", "Política de Segurança de Informação"],
    "PR.AT-05": ["Atribuição de Responsabilidades de Segurança", "Programa Anual de Sensibilização (Awareness)"],
    "PR.DS-01": ["Encriptação de Dados em Repouso", "Gestão do Ciclo de Vida de Chaves Criptográficas"],
    "PR.DS-02": ["Cifragem de Dados em Trânsito", "Gestão do Ciclo de Vida de Chaves Criptográficas"],
    "PR.DS-03": ["Procedimento de Devolução de Equipamentos", "Limpeza Segura de Dados (Wiping)"],
    "PR.DS-04": ["Monitorização de Capacidade e Alertas", "Gestão de Capacidade e Resiliência de Serviços Críticos"],
    "PR.DS-05": ["Proteção contra Perda de Dados (DLP)", "Filtragem Web e DNS"],
    "PR.DS-06": ["Verificação de Integridade de Software e Firmware", "Baselines de Configuração Segura"],
    "PR.DS-07": ["Segregação de Ambientes (Dev/Test/Prod)", "Workflow de Gestão de Alterações"],
    "PR.DS-08": ["Guardrails de Proteção de Dados em Serviços Externos", "Cláusulas Contratuais de Segurança e Privacidade"],
    "PR.DS-09": ["Guardrails de Proteção de Dados em Serviços Externos", "Gestão de Fornecedores de Cloud"],
    "PR.IP-01": ["Baselines de Configuração Segura", "Deteção de Desvios de Configuração"],
    "PR.IP-02": ["Requisitos de Segurança no Desenvolvimento (Secure by Design)", "Revisão de Arquitetura Segura"],
    "PR.IP-03": ["Workflow de Gestão de Alterações", "Processo de Aprovação de Software"],
    "PR.IP-04": ["Cópia de Segurança Diária (Backups)", "Testes Regulares de Restauro (Restore Tests)"],
    "PR.IP-05": ["Norma de Segurança para Salas e Escritórios", "Sensores Ambientais e Proteção Física"],
    "PR.IP-06": ["Limpeza Segura de Dados (Wiping)", "Workflow de Eliminação Segura de Informação"],
    "PR.IP-07": ["Autoavaliação de Conformidade com Políticas", "Avaliação da Eficácia de Tecnologias de Proteção"],
    "PR.IP-08": ["Avaliação da Eficácia de Tecnologias de Proteção", "Teste de Eficácia de Controlos de Deteção"],
    "PR.IP-09": ["Plano de Resposta a Incidentes (IRP)", "Plano de Recuperação Pós-Incidente"],
    "PR.IP-10": ["Exercícios de Continuidade de Negócio", "Testes de Redundância e Failover"],
    "PR.IP-11": ["Background Checks (Verificação de Antecedentes)", "Cláusulas de Segurança no Contrato de Trabalho", "Checklist de Saída e Mudança de Função"],
    "PR.IP-12": ["Gestão Centralizada de Vulnerabilidades", "Gestão de Patches (Patch Management)"],
    "PR.MA-01": ["Programa de Manutenção Controlada", "Registo de Manutenção e Intervenção Técnica"],
    "PR.MA-02": ["Controlo de Manutenção Remota", "Gestão de Acessos Privilegiados (PAM)"],
    "PR.PT-01": ["Monitorização de Eventos e Logs (SIEM)", "Política de Retenção e Integridade de Logs"],
    "PR.PT-02": ["Inventário e Custódia de Suportes Removíveis", "Bloqueio de Entradas USB (Device Control)", "Destruição Segura de Meios Físicos"],
    "PR.PT-03": ["Hardening e Minimização de Funcionalidades", "Baselines de Configuração Segura"],
    "PR.PT-04": ["Firewall de Próxima Geração (NGFW)", "Segmentação de Rede (VLANs / Microsegmentação)", "Catálogo de Serviços de Rede Seguros"],
    "PR.PT-05": ["Gestão de Capacidade e Resiliência de Serviços Críticos", "Testes de Redundância e Failover"],
    "DE.AE-01": ["Modelo de Referência de Operações de Rede", "Mapa de Fluxos de Dados e Dependências de Rede"],
    "DE.AE-02": ["Casos de Uso SOC e Alertas de Segurança", "Playbook de Triagem de Ameaças", "Monitorização de Eventos e Logs (SIEM)"],
    "DE.AE-03": ["Monitorização de Eventos e Logs (SIEM)", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.AE-04": ["Playbook de Triagem e Classificação de Eventos", "Ferramenta de Ticketing para Incidentes"],
    "DE.AE-05": ["Definição de Limiares de Alerta de Segurança", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.CM-01": ["Monitorização de Eventos e Logs (SIEM)", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.CM-02": ["Monitorização Física por CCTV e Alarmes", "Sensores Ambientais e Proteção Física"],
    "DE.CM-03": ["Monitorização de Eventos e Logs (SIEM)", "Revisão Periódica de Acessos"],
    "DE.CM-04": ["Proteção Antimalware / EDR", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.CM-05": ["Gestão de Dispositivos Móveis (MDM)", "Bloqueio de Entradas USB (Device Control)"],
    "DE.CM-06": ["Revisão Periódica de Serviços de Fornecedores", "Monitorização de Eventos e Logs (SIEM)"],
    "DE.CM-07": ["Monitorização de Eventos e Logs (SIEM)", "Gestão de Acessos Privilegiados (PAM)", "Revisão Periódica de Acessos"],
    "DE.CM-08": ["Gestão Centralizada de Vulnerabilidades", "Testes de Penetração (Pentesting)"],
    "DE.DP-01": ["Atribuição de Responsabilidades de Segurança", "Equipa de Resposta a Incidentes (CSIRT/SOC)"],
    "DE.DP-02": ["Mapeamento de Requisitos Legais e Regulamentares", "Autoavaliação de Conformidade com Políticas"],
    "DE.DP-03": ["Teste de Eficácia de Controlos de Deteção", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.DP-04": ["Plano de Comunicação de Incidentes e Recuperação", "Canal de Reporte de Eventos de Segurança"],
    "DE.DP-05": ["Revisão Pós-Incidente e Lições Aprendidas", "Avaliação da Eficácia de Tecnologias de Proteção"],
    "RS.RP-01": ["Plano de Resposta a Incidentes (IRP)", "Plataforma de Resposta a Incidentes (SOAR/IR)"],
    "RS.MA-01": ["Plataforma de Resposta a Incidentes (SOAR/IR)", "Gestão de Patches (Patch Management)"],
    "RS.MA-02": ["Playbook de Triagem e Classificação de Eventos", "Ferramenta de Ticketing para Incidentes"],
    "RS.MA-03": ["Playbook de Triagem e Classificação de Eventos", "Ferramenta de Ticketing para Incidentes"],
    "RS.MA-04": ["Plano de Comunicação de Incidentes e Recuperação", "Matriz de Contactos com Autoridades"],
    "RS.MA-05": ["Critérios de Ativação e Encerramento da Recuperação", "Plano de Recuperação Pós-Incidente"],
    "RS.CO-01": ["Equipa de Resposta a Incidentes (CSIRT/SOC)", "Plataforma de Resposta a Incidentes (SOAR/IR)"],
    "RS.CO-02": ["Canal de Reporte de Eventos de Segurança", "Ferramenta de Ticketing para Incidentes"],
    "RS.CO-03": ["Plano de Comunicação de Incidentes e Recuperação", "Procedimento de Transferência Segura de Informação"],
    "RS.CO-04": ["Plano de Comunicação de Incidentes e Recuperação", "Matriz de Contactos com Autoridades"],
    "RS.CO-05": ["Participação em Grupos de Confiança Setoriais", "Matriz de Contactos com Autoridades"],
    "RS.AN-01": ["Monitorização de Eventos e Logs (SIEM)", "Playbook de Triagem e Classificação de Eventos"],
    "RS.AN-02": ["Playbook de Triagem e Classificação de Eventos", "Registo de Riscos (Risk Register)"],
    "RS.AN-03": ["Capacidade de Análise Forense Digital", "Cadeia de Custódia de Evidências"],
    "RS.AN-04": ["Playbook de Triagem e Classificação de Eventos", "Ferramenta de Ticketing para Incidentes"],
    "RS.AN-05": ["Gestão Centralizada de Vulnerabilidades", "Plataforma de Inteligência de Ameaças", "Ferramenta de Ticketing para Incidentes"],
    "RS.IM-01": ["Revisão Pós-Incidente e Lições Aprendidas", "Plano de Resposta a Incidentes (IRP)"],
    "RS.IM-02": ["Revisão Pós-Incidente e Lições Aprendidas", "Plano de Resposta a Incidentes (IRP)"],
    "RS.MI-01": ["Plataforma de Resposta a Incidentes (SOAR/IR)", "Plano de Resposta a Incidentes (IRP)"],
    "RS.MI-02": ["Plataforma de Resposta a Incidentes (SOAR/IR)", "Gestão de Patches (Patch Management)"],
    "RC.RP-01": ["Plano de Recuperação Pós-Incidente", "Exercícios de Continuidade de Negócio"],
    "RC.CO-01": ["Comunicação Pública e Gestão Reputacional Pós-Incidente", "Plano de Comunicação de Incidentes e Recuperação"],
    "RC.CO-02": ["Comunicação Pública e Gestão Reputacional Pós-Incidente", "Plano de Comunicação de Incidentes e Recuperação"],
    "RC.IM-01": ["Plano de Recuperação Pós-Incidente", "Revisão Pós-Incidente e Lições Aprendidas"],
    "RC.IM-02": ["Plano de Recuperação Pós-Incidente", "Avaliação da Eficácia de Tecnologias de Proteção"],
}


KNOWN_BAD_LINKS = [
    ("DE.AE-05", "Autenticação Multifator (MFA)"),
]


def owner_for(mechanism_type):
    if mechanism_type == "Fornecedor":
        return "Gestão de Fornecedores / CISO"
    if mechanism_type == "Pessoas":
        return "RH / CISO"
    if mechanism_type == "Técnico":
        return "Equipa de TI / Segurança"
    return "CISO / Responsável do Controlo"


def tag_name_for_code(code):
    return f"nist-csf-{code.lower()}"


class Command(BaseCommand):
    help = "Seeds NIST CSF mechanisms and links existing mechanisms to NIST controls."

    def add_arguments(self, parser):
        parser.add_argument(
            "--library-only",
            action="store_true",
            help="Create mechanisms, tags and suggested mappings only, without creating ControlMechanism associations.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        library_only = options["library_only"]
        created_mechanisms = 0
        updated_tags = 0
        created_suggestions = 0
        created_control_links = 0
        removed_bad_links = 0
        missing_controls = set()
        missing_mechanisms = set()

        nist_tag, _ = Tag.objects.get_or_create(name="nist-csf", defaults={"category": Tag.Category.REG})

        for title, defaults in NEW_MECHANISMS.items():
            mechanism, created = Mechanism.objects.get_or_create(
                title=title,
                defaults={
                    "description": defaults["description"],
                    "mechanism_type": defaults["type"],
                },
            )
            if created:
                created_mechanisms += 1
            if not mechanism.tags.filter(id=nist_tag.id).exists():
                mechanism.tags.add(nist_tag)
                updated_tags += 1

        if not library_only:
            for code, mechanism_title in KNOWN_BAD_LINKS:
                deleted, _ = ControlMechanism.objects.filter(
                    control__framework__name=NIST_FRAMEWORK_NAME,
                    control__code=code,
                    mechanism__title=mechanism_title,
                ).delete()
                removed_bad_links += deleted

        for code, mechanism_titles in CONTROL_MAP.items():
            control = Control.objects.filter(framework__name=NIST_FRAMEWORK_NAME, code=code).first()
            if not control:
                missing_controls.add(code)
                continue

            code_tag, _ = Tag.objects.get_or_create(
                name=tag_name_for_code(code),
                defaults={"category": Tag.Category.REG},
            )

            for title in mechanism_titles:
                mechanism = Mechanism.objects.filter(title=title).first()
                if not mechanism:
                    missing_mechanisms.add(title)
                    continue

                for tag in (nist_tag, code_tag):
                    if not mechanism.tags.filter(id=tag.id).exists():
                        mechanism.tags.add(tag)
                        updated_tags += 1

                _suggestion, suggestion_created = SuggestedMechanism.objects.get_or_create(
                    mechanism=mechanism,
                    control=control,
                )
                if suggestion_created:
                    created_suggestions += 1

                if library_only:
                    continue

                _control_mechanism, link_created = ControlMechanism.objects.get_or_create(
                    mechanism=mechanism,
                    control=control,
                    defaults={
                        "status": ControlMechanism.ImplementationStatus.NOT_STARTED,
                        "responsible": owner_for(mechanism.mechanism_type),
                        "acceptance_criteria": (
                            "Evidência mínima: política, perfil CSF, matriz, configuração, registo, "
                            "relatório, métrica, teste, ticket ou aprovação que demonstre o outcome."
                        ),
                    },
                )
                if link_created:
                    created_control_links += 1

        self.stdout.write(self.style.SUCCESS("NIST CSF mechanism seed completed."))
        self.stdout.write(f"Mechanisms created      : {created_mechanisms}")
        self.stdout.write(f"Tags added              : {updated_tags}")
        self.stdout.write(f"Suggested links created : {created_suggestions}")
        self.stdout.write(f"Control links created   : {created_control_links}")
        self.stdout.write(f"Bad links removed       : {removed_bad_links}")

        if missing_controls:
            self.stdout.write(self.style.WARNING("Controls not found       : " + ", ".join(sorted(missing_controls))))
        if missing_mechanisms:
            self.stdout.write(self.style.WARNING("Mechanisms not found     : " + ", ".join(sorted(missing_mechanisms))))