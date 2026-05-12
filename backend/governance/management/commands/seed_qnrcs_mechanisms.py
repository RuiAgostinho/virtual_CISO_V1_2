from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import Control, ControlMechanism, Mechanism, SuggestedMechanism, Tag


QNRC_FRAMEWORK_NAME = "Quadro Nacional de Referência em Cibersegurança"


NEW_MECHANISMS = {
    "Mapa de Contexto Organizacional e Serviços Críticos": {
        "type": "Processo",
        "description": "Registo que relaciona missão, serviços críticos, dependências, responsáveis, requisitos de resiliência e posição da organização no ecossistema.",
    },
    "Catálogo de Aplicações Críticas": {
        "type": "Processo",
        "description": "Inventário de aplicações e plataformas que suportam processos críticos, incluindo proprietário, criticidade, dependências e exposição.",
    },
    "Mapa de Fluxos de Dados e Dependências de Rede": {
        "type": "Técnico",
        "description": "Representação das comunicações internas e externas, dependências de rede, sistemas envolvidos e fluxos esperados para serviços críticos.",
    },
    "Catálogo de Sistemas Externos e Interligações": {
        "type": "Processo",
        "description": "Registo de sistemas externos, interligações, fornecedores, interfaces, dados trocados e dependências relevantes para a operação.",
    },
    "Gestão de Capacidade e Resiliência de Serviços Críticos": {
        "type": "Processo",
        "description": "Processo para definir requisitos de capacidade, disponibilidade, continuidade e resiliência para serviços críticos.",
    },
    "Processo de Gestão de Risco da Cadeia Logística": {
        "type": "Fornecedor",
        "description": "Processo para identificar, avaliar, tratar e monitorizar riscos de cibersegurança associados a fornecedores e componentes da cadeia logística.",
    },
    "Registo de Tolerância e Aceitação de Risco": {
        "type": "Processo",
        "description": "Registo formal dos critérios de tolerância, decisões de aceitação, responsáveis, validade e condições de revisão dos riscos.",
    },
    "Plano de Tratamento de Risco Priorizado": {
        "type": "Processo",
        "description": "Plano de ações para mitigar, transferir, aceitar ou evitar riscos, com prioridade, responsável, prazo e estado de execução.",
    },
    "Gestão Segura de Acessos Remotos": {
        "type": "Técnico",
        "description": "Controlo de acessos remotos com MFA, canais seguros, autorização, registo, restrições por perfil e monitorização.",
    },
    "Programa de Manutenção Controlada": {
        "type": "Processo",
        "description": "Planeamento e registo de atividades de manutenção, reparação e intervenção técnica em ativos críticos.",
    },
    "Controlo de Manutenção Remota": {
        "type": "Técnico",
        "description": "Processo e configuração técnica para aprovar, monitorizar, registar e encerrar sessões de manutenção remota.",
    },
    "Modelo de Referência de Operações de Rede": {
        "type": "Técnico",
        "description": "Baseline operacional com padrões esperados de tráfego, utilizadores, sistemas, fluxos de dados e comportamentos normais.",
    },
    "Definição de Limiares de Alerta de Segurança": {
        "type": "Processo",
        "description": "Critérios quantitativos e qualitativos para gerar alertas, escalar eventos e abrir incidentes de segurança.",
    },
    "Teste de Eficácia de Controlos de Deteção": {
        "type": "Processo",
        "description": "Testes planeados para validar se logs, sensores, regras, alertas e playbooks detetam cenários relevantes.",
    },
    "Capacidade de Análise Forense Digital": {
        "type": "Técnico",
        "description": "Ferramentas, procedimentos e competências para recolher, preservar e analisar evidências digitais durante investigação de incidentes.",
    },
    "Plataforma de Resposta a Incidentes (SOAR/IR)": {
        "type": "Técnico",
        "description": "Plataforma ou conjunto de ferramentas para orquestrar tarefas de resposta, conter incidentes e registar ações executadas.",
    },
    "Plano de Comunicação de Incidentes e Recuperação": {
        "type": "Processo",
        "description": "Plano que define mensagens, canais, destinatários, aprovações e momentos de comunicação durante incidentes e recuperação.",
    },
    "Plano de Recuperação Pós-Incidente": {
        "type": "Processo",
        "description": "Procedimento para restaurar serviços, validar integridade, acompanhar ações de recuperação e voltar a operação normal.",
    },
    "Verificação de Integridade de Software e Firmware": {
        "type": "Técnico",
        "description": "Validação de assinaturas, checksums, versões autorizadas e alterações indevidas em software, firmware e dados.",
    },
    "Validação de Integridade de Hardware": {
        "type": "Técnico",
        "description": "Verificação física e lógica de componentes críticos para detetar alteração, substituição, manipulação ou degradação.",
    },
    "Hardening e Minimização de Funcionalidades": {
        "type": "Técnico",
        "description": "Remoção ou desativação de serviços, portas, contas, software e funcionalidades não essenciais em sistemas.",
    },
    "Avaliação da Eficácia de Tecnologias de Proteção": {
        "type": "Processo",
        "description": "Revisão recorrente da eficácia de tecnologias de proteção face a ameaças, testes, incidentes e alterações do ambiente.",
    },
}


CONTROL_MAP = {
    "ID.GA-1": ["Ferramenta de Descoberta de Ativos (Asset Discovery)", "Inventário de Ativos de Informação"],
    "ID.GA-2": ["Catálogo de Aplicações Críticas", "Inventário de Ativos de Informação"],
    "ID.GA-3": ["Mapa de Fluxos de Dados e Dependências de Rede", "Segmentação de Rede (VLANs / Microsegmentação)"],
    "ID.GA-4": ["Catálogo de Sistemas Externos e Interligações", "Questionários de Segurança para Fornecedores"],
    "ID.GA-5": ["Esquema de Classificação de Informação", "Mapa de Contexto Organizacional e Serviços Críticos"],
    "ID.AO-1": ["Mapa de Contexto Organizacional e Serviços Críticos", "Processo de Gestão de Risco da Cadeia Logística"],
    "ID.AO-2": ["Mapa de Contexto Organizacional e Serviços Críticos", "Mapeamento de Requisitos Legais e Regulamentares"],
    "ID.AO-3": ["Mapa de Contexto Organizacional e Serviços Críticos", "Política de Segurança de Informação"],
    "ID.AO-4": ["Mapa de Contexto Organizacional e Serviços Críticos", "Inventário de Ativos de Informação"],
    "ID.AO-5": ["Gestão de Capacidade e Resiliência de Serviços Críticos", "Análise de Impacto no Negócio (BIA)"],
    "ID.GV-1": ["Política de Segurança de Informação", "Revisão Periódica de Políticas"],
    "ID.GV-2": ["Mapeamento de Requisitos Legais e Regulamentares", "Autoavaliação de Conformidade com Políticas"],
    "ID.AR-1": ["Gestão Centralizada de Vulnerabilidades", "Registo de Riscos (Risk Register)"],
    "ID.AR-2": ["Participação em Grupos de Confiança Setoriais", "Plataforma de Inteligência de Ameaças"],
    "ID.AR-3": ["Plataforma de Inteligência de Ameaças", "Registo de Riscos (Risk Register)"],
    "ID.AR-4": ["Metodologia de Avaliação de Risco", "Registo de Riscos (Risk Register)"],
    "ID.AR-5": ["Plano de Tratamento de Risco Priorizado", "Registo de Riscos (Risk Register)"],
    "ID.GR-1": ["Metodologia de Avaliação de Risco", "Registo de Riscos (Risk Register)"],
    "ID.GR-2": ["Registo de Tolerância e Aceitação de Risco", "Metodologia de Avaliação de Risco"],
    "ID.GR-3": ["Plano de Tratamento de Risco Priorizado", "Registo de Riscos (Risk Register)"],
    "ID.GL-1": ["Processo de Gestão de Risco da Cadeia Logística", "Questionários de Segurança para Fornecedores"],
    "ID.GL-2": ["Avaliação de Segurança da Cadeia de Fornecimento TIC", "Questionários de Segurança para Fornecedores"],
    "ID.GL-3": ["Cláusulas Contratuais de Segurança e Privacidade", "Processo de Gestão de Risco da Cadeia Logística"],
    "ID.GL-4": ["Revisão Periódica de Serviços de Fornecedores", "Questionários de Segurança para Fornecedores"],
    "ID.GL-5": ["Exercícios de Continuidade de Negócio", "Plano de Comunicação de Incidentes e Recuperação"],
    "PR.GA-1": ["Gestão Centralizada de Identidades (IdP/AD)", "Política de Autenticação e Gestão de Credenciais"],
    "PR.GA-2": ["Controlo de Acessos Físicos (Biometria/Cartão)", "Registo de Visitantes"],
    "PR.GA-3": ["Gestão Segura de Acessos Remotos", "Autenticação Multifator (MFA)"],
    "PR.GA-4": ["Princípio do Privilégio Mínimo (PoLP)", "Matriz de Segregação de Funções", "Gestão de Acessos Privilegiados (PAM)"],
    "PR.GA-5": ["Segmentação de Rede (VLANs / Microsegmentação)", "Firewall de Próxima Geração (NGFW)", "Mapa de Fluxos de Dados e Dependências de Rede"],
    "PR.GA-6": ["Gestão Centralizada de Identidades (IdP/AD)", "Cofre de Credenciais e Segredos"],
    "PR.GA-7": ["Autenticação Multifator (MFA)", "Política de Autenticação e Gestão de Credenciais"],
    "PR.FC-1": ["Formação de Acolhimento em Segurança (Onboarding)", "Programa Anual de Sensibilização (Awareness)"],
    "PR.FC-2": ["Gestão de Acessos Privilegiados (PAM)", "Atribuição de Responsabilidades de Segurança"],
    "PR.FC-3": ["Cláusulas Contratuais de Segurança e Privacidade", "Atribuição de Responsabilidades de Segurança"],
    "PR.FC-4": ["Declaração de Responsabilidades da Gestão", "Política de Segurança de Informação"],
    "PR.SD-1": ["Encriptação de Dados em Repouso", "Gestão do Ciclo de Vida de Chaves Criptográficas"],
    "PR.SD-2": ["Cifragem de Dados em Trânsito", "Gestão do Ciclo de Vida de Chaves Criptográficas"],
    "PR.SD-3": ["Procedimento de Devolução de Equipamentos", "Limpeza Segura de Dados (Wiping)"],
    "PR.SD-4": ["Monitorização de Capacidade e Alertas", "Gestão de Capacidade e Resiliência de Serviços Críticos"],
    "PR.SD-5": ["Proteção contra Perda de Dados (DLP)", "Filtragem Web e DNS"],
    "PR.SD-6": ["Verificação de Integridade de Software e Firmware", "Baselines de Configuração Segura"],
    "PR.SD-7": ["Segregação de Ambientes (Dev/Test/Prod)", "Workflow de Gestão de Alterações"],
    "PR.SD-8": ["Validação de Integridade de Hardware", "Registo de Manutenção e Intervenção Técnica"],
    "PR.PI-1": ["Baselines de Configuração Segura", "Deteção de Desvios de Configuração"],
    "PR.PI-2": ["Requisitos de Segurança no Desenvolvimento (Secure by Design)", "Revisão de Arquitetura Segura", "Análise de Código Fonte (SAST/DAST)"],
    "PR.PI-3": ["Workflow de Gestão de Alterações", "Processo de Aprovação de Software"],
    "PR.PI-4": ["Cópia de Segurança Diária (Backups)", "Testes Regulares de Restauro (Restore Tests)"],
    "PR.PI-5": ["Norma de Segurança para Salas e Escritórios", "Sensores Ambientais e Proteção Física"],
    "PR.PI-6": ["Limpeza Segura de Dados (Wiping)", "Workflow de Eliminação Segura de Informação"],
    "PR.PI-7": ["Autoavaliação de Conformidade com Políticas", "Avaliação da Eficácia de Tecnologias de Proteção"],
    "PR.PI-8": ["Avaliação da Eficácia de Tecnologias de Proteção", "Teste de Eficácia de Controlos de Deteção"],
    "PR.PI-9": ["Plano de Resposta a Incidentes (IRP)", "Plano de Recuperação Pós-Incidente"],
    "PR.PI-10": ["Exercícios de Continuidade de Negócio", "Testes de Redundância e Failover"],
    "PR.PI-11": ["Background Checks (Verificação de Antecedentes)", "Cláusulas de Segurança no Contrato de Trabalho", "Checklist de Saída e Mudança de Função"],
    "PR.PI-12": ["Gestão Centralizada de Vulnerabilidades", "Gestão de Patches (Patch Management)"],
    "PR.MA-1": ["Programa de Manutenção Controlada", "Registo de Manutenção e Intervenção Técnica"],
    "PR.MA-2": ["Controlo de Manutenção Remota", "Gestão de Acessos Privilegiados (PAM)"],
    "PR.TP-1": ["Monitorização de Eventos e Logs (SIEM)", "Política de Retenção e Integridade de Logs"],
    "PR.TP-2": ["Inventário e Custódia de Suportes Removíveis", "Bloqueio de Entradas USB (Device Control)", "Destruição Segura de Meios Físicos"],
    "PR.TP-3": ["Hardening e Minimização de Funcionalidades", "Baselines de Configuração Segura"],
    "PR.TP-4": ["Firewall de Próxima Geração (NGFW)", "Segmentação de Rede (VLANs / Microsegmentação)", "Catálogo de Serviços de Rede Seguros"],
    "PR.TP-5": ["Gestão de Capacidade e Resiliência de Serviços Críticos", "Testes de Redundância e Failover", "Exercícios de Continuidade de Negócio"],
    "DE.AE-1": ["Modelo de Referência de Operações de Rede", "Mapa de Fluxos de Dados e Dependências de Rede", "Monitorização de Eventos e Logs (SIEM)"],
    "DE.AE-2": ["Casos de Uso SOC e Alertas de Segurança", "Playbook de Triagem de Ameaças", "Monitorização de Eventos e Logs (SIEM)"],
    "DE.AE-3": ["Monitorização de Eventos e Logs (SIEM)", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.AE-4": ["Playbook de Triagem e Classificação de Eventos", "Definição de Limiares de Alerta de Segurança", "Ferramenta de Ticketing para Incidentes"],
    "DE.AE-5": ["Definição de Limiares de Alerta de Segurança", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.MC-1": ["Monitorização de Eventos e Logs (SIEM)", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.MC-2": ["Monitorização Física por CCTV e Alarmes", "Sensores Ambientais e Proteção Física"],
    "DE.MC-3": ["Monitorização de Eventos e Logs (SIEM)", "Revisão Periódica de Acessos"],
    "DE.MC-4": ["Proteção Antimalware / EDR", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.MC-5": ["Gestão de Dispositivos Móveis (MDM)", "Bloqueio de Entradas USB (Device Control)"],
    "DE.MC-6": ["Revisão Periódica de Serviços de Fornecedores", "Monitorização de Eventos e Logs (SIEM)"],
    "DE.MC-7": ["Monitorização de Eventos e Logs (SIEM)", "Gestão de Acessos Privilegiados (PAM)", "Revisão Periódica de Acessos"],
    "DE.MC-8": ["Gestão Centralizada de Vulnerabilidades", "Testes de Penetração (Pentesting)"],
    "DE.PD-1": ["Atribuição de Responsabilidades de Segurança", "Equipa de Resposta a Incidentes (CSIRT/SOC)"],
    "DE.PD-2": ["Mapeamento de Requisitos Legais e Regulamentares", "Autoavaliação de Conformidade com Políticas"],
    "DE.PD-3": ["Teste de Eficácia de Controlos de Deteção", "Casos de Uso SOC e Alertas de Segurança"],
    "DE.PD-4": ["Plano de Comunicação de Incidentes e Recuperação", "Canal de Reporte de Eventos de Segurança"],
    "DE.PD-5": ["Revisão Pós-Incidente e Lições Aprendidas", "Avaliação da Eficácia de Tecnologias de Proteção"],
    "RS.PR-1": ["Plano de Resposta a Incidentes (IRP)", "Plataforma de Resposta a Incidentes (SOAR/IR)"],
    "RS.CO-1": ["Equipa de Resposta a Incidentes (CSIRT/SOC)", "Plataforma de Resposta a Incidentes (SOAR/IR)"],
    "RS.CO-2": ["Canal de Reporte de Eventos de Segurança", "Ferramenta de Ticketing para Incidentes"],
    "RS.CO-3": ["Plano de Comunicação de Incidentes e Recuperação", "Procedimento de Transferência Segura de Informação"],
    "RS.CO-4": ["Plano de Comunicação de Incidentes e Recuperação", "Matriz de Contactos com Autoridades"],
    "RS.CO-5": ["Participação em Grupos de Confiança Setoriais", "Matriz de Contactos com Autoridades"],
    "RS.AN-1": ["Monitorização de Eventos e Logs (SIEM)", "Playbook de Triagem e Classificação de Eventos"],
    "RS.AN-2": ["Playbook de Triagem e Classificação de Eventos", "Registo de Riscos (Risk Register)"],
    "RS.AN-3": ["Capacidade de Análise Forense Digital", "Cadeia de Custódia de Evidências"],
    "RS.AN-4": ["Playbook de Triagem e Classificação de Eventos", "Ferramenta de Ticketing para Incidentes"],
    "RS.AN-5": ["Gestão Centralizada de Vulnerabilidades", "Plataforma de Inteligência de Ameaças", "Ferramenta de Ticketing para Incidentes"],
    "RS.MI-1": ["Plataforma de Resposta a Incidentes (SOAR/IR)", "Plano de Resposta a Incidentes (IRP)"],
    "RS.MI-2": ["Plataforma de Resposta a Incidentes (SOAR/IR)", "Gestão de Patches (Patch Management)"],
    "RS.MI-3": ["Gestão Centralizada de Vulnerabilidades", "Plano de Tratamento de Risco Priorizado", "Registo de Riscos (Risk Register)"],
    "RS.ME-1": ["Revisão Pós-Incidente e Lições Aprendidas", "Plano de Resposta a Incidentes (IRP)"],
    "RS.ME-2": ["Revisão Pós-Incidente e Lições Aprendidas", "Plano de Resposta a Incidentes (IRP)"],
    "RC.PR-1": ["Plano de Recuperação Pós-Incidente", "Exercícios de Continuidade de Negócio"],
    "RC.ME-1": ["Plano de Recuperação Pós-Incidente", "Revisão Pós-Incidente e Lições Aprendidas"],
    "RC.ME-2": ["Plano de Recuperação Pós-Incidente", "Avaliação da Eficácia de Tecnologias de Proteção", "Exercícios de Continuidade de Negócio"],
    "RC.CO-1": ["Plano de Comunicação de Incidentes e Recuperação"],
    "RC.CO-2": ["Plano de Comunicação de Incidentes e Recuperação"],
}


def owner_for(mechanism_type):
    if mechanism_type == "Fornecedor":
        return "Gestão de Fornecedores / CISO"
    if mechanism_type == "Pessoas":
        return "RH / CISO"
    if mechanism_type == "Técnico":
        return "Equipa de TI / Segurança"
    return "CISO / Responsável do Controlo"


def tag_name_for_code(code):
    return f"qnrcs-{code.lower()}"


class Command(BaseCommand):
    help = "Seeds QNRCS/CNCS mechanisms and links existing mechanisms to QNRCS controls."

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
        missing_controls = set()
        missing_mechanisms = set()

        qnrc_tag, _ = Tag.objects.get_or_create(name="qnrcs", defaults={"category": Tag.Category.REG})

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
            if not mechanism.tags.filter(id=qnrc_tag.id).exists():
                mechanism.tags.add(qnrc_tag)
                updated_tags += 1

        for code, mechanism_titles in CONTROL_MAP.items():
            control = Control.objects.filter(framework__name=QNRC_FRAMEWORK_NAME, code=code).first()
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

                for tag in (qnrc_tag, code_tag):
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
                            "Evidência mínima: política, procedimento, configuração, registo, relatório, "
                            "ticket, teste ou aprovação que demonstre a operacionalização do mecanismo."
                        ),
                    },
                )
                if link_created:
                    created_control_links += 1

        self.stdout.write(self.style.SUCCESS("QNRCS mechanism seed completed."))
        self.stdout.write(f"Mechanisms created      : {created_mechanisms}")
        self.stdout.write(f"Tags added              : {updated_tags}")
        self.stdout.write(f"Suggested links created : {created_suggestions}")
        self.stdout.write(f"Control links created   : {created_control_links}")

        if missing_controls:
            self.stdout.write(self.style.WARNING("Controls not found       : " + ", ".join(sorted(missing_controls))))
        if missing_mechanisms:
            self.stdout.write(self.style.WARNING("Mechanisms not found     : " + ", ".join(sorted(missing_mechanisms))))