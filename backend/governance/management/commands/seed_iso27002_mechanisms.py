from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import Control, ControlMechanism, Mechanism, SuggestedMechanism, Tag


ISO_FRAMEWORK_NAME = "ISO/IEC 27002"


MECHANISM_LIBRARY = [
    {
        "codes": ["A.5.1"],
        "title": "Política de Segurança de Informação",
        "type": "Processo",
        "description": "Documento aprovado pela gestão que define objetivos, princípios, âmbito e responsabilidades de segurança da informação.",
    },
    {
        "codes": ["A.5.1"],
        "title": "Revisão Periódica de Políticas",
        "type": "Processo",
        "description": "Ciclo formal de revisão, aprovação e comunicação das políticas sempre que exista alteração relevante ou prazo definido.",
    },
    {
        "codes": ["A.5.2"],
        "title": "Atribuição de Responsabilidades de Segurança",
        "type": "Pessoas",
        "description": "Matriz de responsabilidades que clarifica quem aprova, executa, valida e reporta atividades de segurança da informação.",
    },
    {
        "codes": ["A.5.3"],
        "title": "Matriz de Segregação de Funções",
        "type": "Processo",
        "description": "Matriz que identifica conflitos de funções e impede que uma única pessoa concentre aprovação, execução e validação de atividades críticas.",
    },
    {
        "codes": ["A.5.4"],
        "title": "Declaração de Responsabilidades da Gestão",
        "type": "Processo",
        "description": "Registo de compromisso da gestão com responsabilidades de segurança, incluindo aprovação de recursos e acompanhamento periódico.",
    },
    {
        "codes": ["A.5.5"],
        "title": "Matriz de Contactos com Autoridades",
        "type": "Processo",
        "description": "Lista mantida de autoridades, canais oficiais, pontos de contacto e critérios para comunicação regulatória ou operacional.",
    },
    {
        "codes": ["A.5.6"],
        "title": "Participação em Grupos de Confiança Setoriais",
        "type": "Processo",
        "description": "Processo para acompanhar comunidades, CERTs, ISACs ou grupos profissionais que partilham alertas e boas práticas de segurança.",
    },
    {
        "codes": ["A.5.7"],
        "title": "Plataforma de Inteligência de Ameaças",
        "type": "Técnico",
        "description": "Integração de fontes de threat intelligence para recolher indicadores, tendências, TTPs e alertas acionáveis para a organização.",
    },
    {
        "codes": ["A.5.7"],
        "title": "Playbook de Triagem de Ameaças",
        "type": "Processo",
        "description": "Fluxo de análise que transforma informação de ameaças em ações de deteção, mitigação, bloqueio ou monitorização.",
    },
    {
        "codes": ["A.5.8"],
        "title": "Gate de Segurança em Projetos",
        "type": "Processo",
        "description": "Ponto obrigatório de validação de requisitos, riscos e controlos de segurança em projetos novos ou alterações relevantes.",
    },
    {
        "codes": ["A.5.9"],
        "title": "Inventário de Ativos de Informação",
        "type": "Processo",
        "description": "Registo atualizado de ativos de informação, proprietários, localização, criticidade e dependências relevantes.",
    },
    {
        "codes": ["A.5.9"],
        "title": "Ferramenta de Descoberta de Ativos (Asset Discovery)",
        "type": "Técnico",
        "description": "Solução automatizada para identificar hardware, software, serviços e exposições relevantes no ambiente tecnológico.",
    },
    {
        "codes": ["A.5.10"],
        "title": "Política de Uso Aceitável de Ativos",
        "type": "Processo",
        "description": "Regras claras para utilização aceitável de equipamentos, informação, serviços cloud, email, internet e recursos corporativos.",
    },
    {
        "codes": ["A.5.11"],
        "title": "Procedimento de Devolução de Equipamentos",
        "type": "Processo",
        "description": "Processo documentado para recolha, validação, limpeza e reatribuição de ativos quando existe saída ou mudança de função.",
    },
    {
        "codes": ["A.5.11", "B.6.5"],
        "title": "Revogação de Acessos Lógicos",
        "type": "Técnico",
        "description": "Desativação atempada de contas, tokens, chaves, sessões e permissões quando uma pessoa deixa a organização ou muda de função.",
    },
    {
        "codes": ["A.5.12"],
        "title": "Esquema de Classificação de Informação",
        "type": "Processo",
        "description": "Definição de níveis de classificação e regras de tratamento, partilha, armazenamento, retenção e eliminação.",
    },
    {
        "codes": ["A.5.13"],
        "title": "Etiquetagem de Informação e Metadados",
        "type": "Técnico",
        "description": "Aplicação de rótulos visuais e metadados em documentos, emails e repositórios para refletir a classificação atribuída.",
    },
    {
        "codes": ["A.5.14"],
        "title": "Portal Seguro de Transferência de Informação",
        "type": "Técnico",
        "description": "Canal controlado para envio e receção de informação sensível com autenticação, cifragem, expiração e registo de acessos.",
    },
    {
        "codes": ["A.5.14"],
        "title": "Procedimento de Transferência Segura de Informação",
        "type": "Processo",
        "description": "Regras para aprovar, classificar, proteger e registar transferências de informação entre áreas, entidades ou terceiros.",
    },
    {
        "codes": ["A.5.15", "D.8.3"],
        "title": "Norma de Controlo de Acesso",
        "type": "Processo",
        "description": "Norma que define modelos de autorização, perfis, regras de concessão, revisão e revogação de acessos.",
    },
    {
        "codes": ["A.5.16"],
        "title": "Gestão Centralizada de Identidades (IdP/AD)",
        "type": "Técnico",
        "description": "Diretório central para gerir identidades, grupos, ciclo de vida de contas e integração com sistemas corporativos.",
    },
    {
        "codes": ["A.5.17", "D.8.5"],
        "title": "Cofre de Credenciais e Segredos",
        "type": "Técnico",
        "description": "Solução para guardar, rodar e auditar palavras-passe, chaves, tokens, certificados e segredos aplicacionais.",
    },
    {
        "codes": ["A.5.17", "D.8.5"],
        "title": "Política de Autenticação e Gestão de Credenciais",
        "type": "Processo",
        "description": "Regras para criação, armazenamento, rotação, recuperação e revogação de informação de autenticação.",
    },
    {
        "codes": ["A.5.18"],
        "title": "Revisão Periódica de Acessos",
        "type": "Processo",
        "description": "Revisão regular de permissões, perfis e exceções de acesso por proprietários de informação e responsáveis funcionais.",
    },
    {
        "codes": ["A.5.19"],
        "title": "Questionários de Segurança para Fornecedores",
        "type": "Fornecedor",
        "description": "Avaliação estruturada de práticas de segurança de fornecedores antes da contratação e durante a relação contratual.",
    },
    {
        "codes": ["A.5.20"],
        "title": "Cláusulas Contratuais de Segurança e Privacidade",
        "type": "Fornecedor",
        "description": "Requisitos de segurança, confidencialidade, auditoria, notificação de incidentes e proteção de dados em contratos com terceiros.",
    },
    {
        "codes": ["A.5.21"],
        "title": "Avaliação de Segurança da Cadeia de Fornecimento TIC",
        "type": "Fornecedor",
        "description": "Avaliação de dependências tecnológicas, subcontratados, componentes críticos e riscos de fornecimento associados a serviços TIC.",
    },
    {
        "codes": ["A.5.22"],
        "title": "Revisão Periódica de Serviços de Fornecedores",
        "type": "Fornecedor",
        "description": "Revisão de SLAs, alterações, incidentes, evidências e desempenho de segurança de fornecedores relevantes.",
    },
    {
        "codes": ["A.5.23"],
        "title": "Gestão de Fornecedores de Cloud",
        "type": "Fornecedor",
        "description": "Avaliação, aprovação, monitorização e revisão de serviços cloud, incluindo responsabilidades partilhadas e requisitos contratuais.",
    },
    {
        "codes": ["A.5.23"],
        "title": "Guardrails de Segurança Cloud",
        "type": "Técnico",
        "description": "Configurações base para contas cloud, IAM, logging, cifragem, regiões permitidas, redes e exposição pública.",
    },
    {
        "codes": ["A.5.24"],
        "title": "Plano de Resposta a Incidentes (IRP)",
        "type": "Processo",
        "description": "Plano com papéis, fluxos, severidades, canais e ações de preparação para incidentes de segurança.",
    },
    {
        "codes": ["A.5.24", "A.5.25"],
        "title": "Ferramenta de Ticketing para Incidentes",
        "type": "Técnico",
        "description": "Sistema para registar, classificar, atribuir, acompanhar e auditar eventos e incidentes de segurança.",
    },
    {
        "codes": ["A.5.25"],
        "title": "Playbook de Triagem e Classificação de Eventos",
        "type": "Processo",
        "description": "Critérios e passos para distinguir eventos, alertas, incidentes e falsos positivos antes da decisão operacional.",
    },
    {
        "codes": ["A.5.26"],
        "title": "Equipa de Resposta a Incidentes (CSIRT/SOC)",
        "type": "Pessoas",
        "description": "Equipa interna ou externa responsável por análise, contenção, erradicação, recuperação e comunicação durante incidentes.",
    },
    {
        "codes": ["A.5.27"],
        "title": "Revisão Pós-Incidente e Lições Aprendidas",
        "type": "Processo",
        "description": "Sessão formal para identificar causa raiz, eficácia da resposta, melhorias de controlos e ações de seguimento.",
    },
    {
        "codes": ["A.5.28"],
        "title": "Cadeia de Custódia de Evidências",
        "type": "Processo",
        "description": "Procedimento para preservar, registar, transferir e validar evidências digitais ou físicas com rastreabilidade.",
    },
    {
        "codes": ["A.5.29"],
        "title": "Plano de Segurança em Modo Degradado",
        "type": "Processo",
        "description": "Orientações de segurança aplicáveis quando sistemas, instalações, equipas ou fornecedores críticos estão indisponíveis.",
    },
    {
        "codes": ["A.5.30"],
        "title": "Análise de Impacto no Negócio (BIA)",
        "type": "Processo",
        "description": "Avaliação de processos críticos, dependências, impactos, RTO, RPO e prioridades de recuperação.",
    },
    {
        "codes": ["A.5.30"],
        "title": "Exercícios de Continuidade de Negócio",
        "type": "Processo",
        "description": "Testes de mesa, simulações e exercícios técnicos para validar continuidade, recuperação e coordenação de crise.",
    },
    {
        "codes": ["A.5.31"],
        "title": "Mapeamento de Requisitos Legais e Regulamentares",
        "type": "Processo",
        "description": "Inventário de obrigações legais, regulatórias e contratuais aplicáveis, com impacto nos controlos e evidências exigidas.",
    },
    {
        "codes": ["A.5.32"],
        "title": "Registo de Licenças e Propriedade Intelectual",
        "type": "Processo",
        "description": "Registo de software, licenças, direitos de utilização, titulares e restrições de propriedade intelectual aplicáveis.",
    },
    {
        "codes": ["A.5.33"],
        "title": "Plano de Retenção e Proteção de Registos",
        "type": "Processo",
        "description": "Definição de prazos, responsáveis, formatos, proteção, arquivo e eliminação segura de registos relevantes.",
    },
    {
        "codes": ["A.5.34"],
        "title": "Avaliação de Impacto de Proteção de Dados (DPIA)",
        "type": "Processo",
        "description": "Avaliação de riscos de privacidade e proteção de dados pessoais em tratamentos, sistemas ou alterações relevantes.",
    },
    {
        "codes": ["A.5.35"],
        "title": "Auditorias Internas de Segurança",
        "type": "Processo",
        "description": "Auditorias planeadas para verificar conformidade, eficácia de controlos e maturidade de processos de segurança.",
    },
    {
        "codes": ["A.5.36"],
        "title": "Autoavaliação de Conformidade com Políticas",
        "type": "Processo",
        "description": "Questionários, evidências e validações periódicas para confirmar cumprimento de políticas, normas e procedimentos internos.",
    },
    {
        "codes": ["A.5.37"],
        "title": "Runbooks Operacionais Documentados",
        "type": "Processo",
        "description": "Procedimentos operacionais aprovados para tarefas recorrentes, administração de sistemas, exceções e escalamento.",
    },
    {
        "codes": ["B.6.1"],
        "title": "Background Checks (Verificação de Antecedentes)",
        "type": "Pessoas",
        "description": "Verificação proporcional à função, risco e legislação aplicável antes da contratação ou atribuição de funções sensíveis.",
    },
    {
        "codes": ["B.6.2"],
        "title": "Cláusulas de Segurança no Contrato de Trabalho",
        "type": "Pessoas",
        "description": "Inclusão de deveres de confidencialidade, uso aceitável, reporte de incidentes e cumprimento de políticas nos termos contratuais.",
    },
    {
        "codes": ["B.6.3"],
        "title": "Formação de Acolhimento em Segurança (Onboarding)",
        "type": "Pessoas",
        "description": "Sessão inicial obrigatória para transmitir políticas, canais de reporte, regras de acesso e higiene cibernética.",
    },
    {
        "codes": ["B.6.3"],
        "title": "Programa Anual de Sensibilização (Awareness)",
        "type": "Pessoas",
        "description": "Campanhas recorrentes, simulações, conteúdos curtos e avaliações para reforçar comportamentos seguros.",
    },
    {
        "codes": ["B.6.4"],
        "title": "Processo Disciplinar para Infrações de Segurança",
        "type": "Processo",
        "description": "Processo formal para tratar violações de políticas, negligência ou abuso de acessos de acordo com RH e legislação aplicável.",
    },
    {
        "codes": ["B.6.5"],
        "title": "Checklist de Saída e Mudança de Função",
        "type": "Processo",
        "description": "Lista de validações para devolução de ativos, transferência de conhecimento, revogação de acessos e atualização de responsabilidades.",
    },
    {
        "codes": ["B.6.6"],
        "title": "Acordos de Não Divulgação (NDA)",
        "type": "Processo",
        "description": "Acordos de confidencialidade aplicáveis a colaboradores, fornecedores e terceiros com acesso a informação sensível.",
    },
    {
        "codes": ["B.6.7"],
        "title": "Perfil de Segurança para Trabalho Remoto",
        "type": "Técnico",
        "description": "Configuração base para trabalho remoto com MFA, VPN/ZTNA, dispositivo gerido, cifragem e regras de acesso.",
    },
    {
        "codes": ["B.6.8"],
        "title": "Canal de Reporte de Eventos de Segurança",
        "type": "Processo",
        "description": "Canal simples e divulgado para reportar emails suspeitos, perda de ativos, eventos anómalos e potenciais incidentes.",
    },
    {
        "codes": ["C.7.1"],
        "title": "Delimitação de Perímetros de Segurança Física",
        "type": "Técnico",
        "description": "Definição física e lógica de zonas, barreiras, portas, receção, áreas restritas e níveis de acesso.",
    },
    {
        "codes": ["C.7.2"],
        "title": "Controlo de Acessos Físicos (Biometria/Cartão)",
        "type": "Técnico",
        "description": "Controlo eletrónico de entradas em áreas restritas com perfis autorizados, registos e revisão de permissões.",
    },
    {
        "codes": ["C.7.2"],
        "title": "Registo de Visitantes",
        "type": "Processo",
        "description": "Identificação, autorização, registo de entrada e saída, acompanhamento e regras de acesso para visitantes.",
    },
    {
        "codes": ["C.7.3"],
        "title": "Norma de Segurança para Salas e Escritórios",
        "type": "Processo",
        "description": "Requisitos mínimos para proteger gabinetes, salas técnicas, arquivos, receções e zonas com informação sensível.",
    },
    {
        "codes": ["C.7.4"],
        "title": "Monitorização Física por CCTV e Alarmes",
        "type": "Técnico",
        "description": "Monitorização de áreas críticas com câmaras, alarmes, retenção de registos e processo de análise de eventos físicos.",
    },
    {
        "codes": ["C.7.5"],
        "title": "Sensores Ambientais e Proteção Física",
        "type": "Técnico",
        "description": "Deteção e proteção contra incêndio, inundação, temperatura, humidade, energia instável e outros riscos ambientais.",
    },
    {
        "codes": ["C.7.6"],
        "title": "Autorização para Trabalho em Áreas Seguras",
        "type": "Processo",
        "description": "Processo de autorização, acompanhamento e registo para atividades realizadas em zonas restritas ou sensíveis.",
    },
    {
        "codes": ["C.7.7"],
        "title": "Política de Clean Desk / Clear Screen",
        "type": "Pessoas",
        "description": "Regras para proteger informação visível ou impressa e bloquear ecrãs quando postos de trabalho ficam sem supervisão.",
    },
    {
        "codes": ["C.7.8"],
        "title": "Checklist de Localização e Proteção de Equipamentos",
        "type": "Processo",
        "description": "Validação de localização, proteção física, ventilação, acesso, cablagem e exposição de equipamentos críticos.",
    },
    {
        "codes": ["C.7.9"],
        "title": "Autorização de Ativos Fora das Instalações",
        "type": "Processo",
        "description": "Registo e autorização para transporte, utilização e proteção de ativos fora das instalações da organização.",
    },
    {
        "codes": ["C.7.10"],
        "title": "Inventário e Custódia de Suportes Removíveis",
        "type": "Processo",
        "description": "Registo de suportes, proprietários, classificação, localização, cifragem, empréstimos e eliminação.",
    },
    {
        "codes": ["C.7.11"],
        "title": "Monitorização de Energia, UPS e Climatização",
        "type": "Técnico",
        "description": "Monitorização de energia, UPS, geradores e climatização para proteger sistemas contra falhas de suporte.",
    },
    {
        "codes": ["C.7.12"],
        "title": "Proteção de Cablagem e Redes",
        "type": "Técnico",
        "description": "Proteção de cabos de energia e telecomunicações contra interceção, dano, acesso não autorizado ou exposição indevida.",
    },
    {
        "codes": ["C.7.13"],
        "title": "Registo de Manutenção e Intervenção Técnica",
        "type": "Processo",
        "description": "Registo de manutenção, fornecedores, intervenções, peças substituídas e validações após intervenção em equipamentos.",
    },
    {
        "codes": ["C.7.14", "D.8.10"],
        "title": "Limpeza Segura de Dados (Wiping)",
        "type": "Técnico",
        "description": "Remoção segura de dados antes de reatribuição, reparação, devolução, venda, reciclagem ou abate de equipamentos.",
    },
    {
        "codes": ["D.8.1"],
        "title": "Gestão de Dispositivos Móveis (MDM)",
        "type": "Técnico",
        "description": "Gestão centralizada de endpoints com políticas de cifragem, bloqueio, inventário, atualização e eliminação remota.",
    },
    {
        "codes": ["D.8.1"],
        "title": "Bloqueio de Entradas USB (Device Control)",
        "type": "Técnico",
        "description": "Controlo técnico de dispositivos removíveis permitidos, bloqueados ou registados nos endpoints geridos.",
    },
    {
        "codes": ["D.8.2"],
        "title": "Gestão de Acessos Privilegiados (PAM)",
        "type": "Técnico",
        "description": "Solução ou processo para aprovar, controlar, auditar e revogar contas e sessões com privilégios elevados.",
    },
    {
        "codes": ["D.8.2", "D.8.3"],
        "title": "Princípio do Privilégio Mínimo (PoLP)",
        "type": "Processo",
        "description": "Atribuição de acessos estritamente necessários à função, com remoção de permissões excessivas ou temporárias.",
    },
    {
        "codes": ["D.8.3"],
        "title": "Matriz RBAC/ABAC de Acesso à Informação",
        "type": "Processo",
        "description": "Modelo de perfis e atributos que define quem pode aceder a que informação, em que contexto e com que permissões.",
    },
    {
        "codes": ["D.8.4"],
        "title": "Controlo de Acesso a Repositórios de Código-Fonte",
        "type": "Técnico",
        "description": "Perfis, revisões, proteção de branches, MFA e registos de acesso para repositórios de código-fonte.",
    },
    {
        "codes": ["D.8.5"],
        "title": "Autenticação Multifator (MFA)",
        "type": "Técnico",
        "description": "Obrigatoriedade de MFA para acessos remotos, administração, serviços cloud e sistemas com informação sensível.",
    },
    {
        "codes": ["D.8.6"],
        "title": "Monitorização de Capacidade e Alertas",
        "type": "Técnico",
        "description": "Métricas, tendências e alertas de capacidade para prevenir indisponibilidade por saturação de recursos.",
    },
    {
        "codes": ["D.8.7"],
        "title": "Proteção Antimalware / EDR",
        "type": "Técnico",
        "description": "Agentes de proteção endpoint com prevenção, deteção, isolamento, resposta e reporte centralizado.",
    },
    {
        "codes": ["D.8.8"],
        "title": "Gestão Centralizada de Vulnerabilidades",
        "type": "Técnico",
        "description": "Ciclo de identificação, avaliação, priorização, correção e verificação de vulnerabilidades técnicas.",
    },
    {
        "codes": ["D.8.8", "D.8.19"],
        "title": "Gestão de Patches (Patch Management)",
        "type": "Processo",
        "description": "Processo para testar, aprovar, aplicar e verificar atualizações de segurança em sistemas e software.",
    },
    {
        "codes": ["D.8.9"],
        "title": "Baselines de Configuração Segura",
        "type": "Técnico",
        "description": "Perfis de configuração seguros para sistemas, aplicações, redes e cloud, com validação contra desvios.",
    },
    {
        "codes": ["D.8.9"],
        "title": "Deteção de Desvios de Configuração",
        "type": "Técnico",
        "description": "Monitorização de alterações não autorizadas face a baselines aprovadas e inventário de configuração.",
    },
    {
        "codes": ["D.8.10"],
        "title": "Workflow de Eliminação Segura de Informação",
        "type": "Processo",
        "description": "Processo para aprovar, executar e evidenciar eliminação de informação conforme classificação, retenção e obrigação legal.",
    },
    {
        "codes": ["D.8.11"],
        "title": "Mascaramento e Tokenização de Dados",
        "type": "Técnico",
        "description": "Aplicação de mascaramento, pseudonimização ou tokenização para reduzir exposição de dados sensíveis.",
    },
    {
        "codes": ["D.8.12"],
        "title": "Proteção contra Perda de Dados (DLP)",
        "type": "Técnico",
        "description": "Monitorização e bloqueio de canais de exfiltração como email, web, armazenamento cloud, impressão ou USB.",
    },
    {
        "codes": ["D.8.13"],
        "title": "Cópia de Segurança Diária (Backups)",
        "type": "Técnico",
        "description": "Backups regulares, protegidos e recuperáveis, com cobertura adequada a sistemas e dados críticos.",
    },
    {
        "codes": ["D.8.13"],
        "title": "Testes Regulares de Restauro (Restore Tests)",
        "type": "Processo",
        "description": "Testes planeados para confirmar que cópias de segurança podem ser restauradas dentro dos objetivos definidos.",
    },
    {
        "codes": ["D.8.14"],
        "title": "Testes de Redundância e Failover",
        "type": "Técnico",
        "description": "Validação periódica de redundância, alta disponibilidade, replicação e alternância para recursos críticos.",
    },
    {
        "codes": ["D.8.15"],
        "title": "Monitorização de Eventos e Logs (SIEM)",
        "type": "Técnico",
        "description": "Centralização, normalização, retenção e correlação de logs para investigação, auditoria e deteção.",
    },
    {
        "codes": ["D.8.15"],
        "title": "Política de Retenção e Integridade de Logs",
        "type": "Processo",
        "description": "Regras de retenção, proteção contra alteração, acesso e eliminação de logs de segurança e operação.",
    },
    {
        "codes": ["D.8.16"],
        "title": "Casos de Uso SOC e Alertas de Segurança",
        "type": "Técnico",
        "description": "Conjunto de regras, alertas, dashboards e playbooks para monitorizar atividades anómalas ou maliciosas.",
    },
    {
        "codes": ["D.8.17"],
        "title": "Sincronização NTP Centralizada",
        "type": "Técnico",
        "description": "Configuração de fontes de tempo confiáveis para sistemas, logs, equipamentos de rede e plataformas de segurança.",
    },
    {
        "codes": ["D.8.18"],
        "title": "Lista Autorizada de Utilitários Privilegiados",
        "type": "Técnico",
        "description": "Inventário e controlo de ferramentas administrativas, com autorização, registo de uso e monitorização.",
    },
    {
        "codes": ["D.8.19"],
        "title": "Processo de Aprovação de Software",
        "type": "Processo",
        "description": "Fluxo de autorização, validação de origem, compatibilidade, licenciamento e risco antes da instalação de software.",
    },
    {
        "codes": ["D.8.20"],
        "title": "Firewall de Próxima Geração (NGFW)",
        "type": "Técnico",
        "description": "Controlo de tráfego com regras, inspeção, prevenção de intrusão e registos para fronteiras e zonas críticas.",
    },
    {
        "codes": ["D.8.20", "D.8.22"],
        "title": "Segmentação de Rede (VLANs / Microsegmentação)",
        "type": "Técnico",
        "description": "Separação de redes por função, criticidade e confiança para reduzir exposição e movimento lateral.",
    },
    {
        "codes": ["D.8.21"],
        "title": "Catálogo de Serviços de Rede Seguros",
        "type": "Processo",
        "description": "Registo de serviços de rede autorizados, proprietários, requisitos de segurança e parâmetros de monitorização.",
    },
    {
        "codes": ["D.8.23"],
        "title": "Filtragem Web e DNS",
        "type": "Técnico",
        "description": "Bloqueio e monitorização de domínios, categorias, conteúdos e destinos de risco na navegação corporativa.",
    },
    {
        "codes": ["D.8.24"],
        "title": "Encriptação de Dados em Repouso",
        "type": "Técnico",
        "description": "Cifragem de discos, volumes, bases de dados, backups e suportes com gestão adequada de chaves.",
    },
    {
        "codes": ["D.8.24"],
        "title": "Cifragem de Dados em Trânsito",
        "type": "Técnico",
        "description": "Proteção de comunicações com TLS, VPN ou protocolos seguros entre utilizadores, sistemas e terceiros.",
    },
    {
        "codes": ["D.8.25"],
        "title": "Gestão do Ciclo de Vida de Chaves Criptográficas",
        "type": "Processo",
        "description": "Processo para geração, armazenamento, rotação, revogação, backup e destruição de chaves e certificados.",
    },
    {
        "codes": ["D.8.26"],
        "title": "Requisitos de Segurança no Desenvolvimento (Secure by Design)",
        "type": "Processo",
        "description": "Inclusão de requisitos de segurança desde a análise funcional até aceitação e entrada em produção.",
    },
    {
        "codes": ["D.8.27"],
        "title": "Revisão de Arquitetura Segura",
        "type": "Processo",
        "description": "Avaliação de desenhos técnicos, fluxos, dependências, exposição, segmentação e padrões de segurança antes da implementação.",
    },
    {
        "codes": ["D.8.28"],
        "title": "Análise de Código Fonte (SAST/DAST)",
        "type": "Técnico",
        "description": "Análise estática e dinâmica de aplicações para identificar vulnerabilidades antes da publicação.",
    },
    {
        "codes": ["D.8.28"],
        "title": "Norma de Programação Segura",
        "type": "Processo",
        "description": "Regras de codificação segura, revisão de código, gestão de dependências e tratamento de erros.",
    },
    {
        "codes": ["D.8.29"],
        "title": "Plano de Testes de Segurança em Aceitação",
        "type": "Processo",
        "description": "Critérios de teste de segurança antes de entrada em produção, incluindo evidências, defeitos e aceitação de risco.",
    },
    {
        "codes": ["D.8.29"],
        "title": "Testes de Penetração (Pentesting)",
        "type": "Técnico",
        "description": "Avaliação técnica independente para identificar vulnerabilidades exploráveis em sistemas, redes ou aplicações.",
    },
    {
        "codes": ["D.8.30"],
        "title": "Cláusulas de Desenvolvimento Seguro com Terceiros",
        "type": "Fornecedor",
        "description": "Requisitos contratuais para desenvolvimento externo, incluindo revisão de código, testes, confidencialidade e entrega segura.",
    },
    {
        "codes": ["D.8.31"],
        "title": "Segregação de Ambientes (Dev/Test/Prod)",
        "type": "Técnico",
        "description": "Separação entre ambientes, dados, acessos e fluxos de promoção para reduzir risco operacional e exposição.",
    },
    {
        "codes": ["D.8.32"],
        "title": "Workflow de Gestão de Alterações",
        "type": "Processo",
        "description": "Processo para registar, avaliar, aprovar, testar, implementar e rever alterações com impacto em segurança.",
    },
    {
        "codes": ["D.8.33"],
        "title": "Anonimização de Dados de Teste",
        "type": "Técnico",
        "description": "Substituição, mascaramento ou geração sintética de dados para testes sem expor informação real sensível.",
    },
    {
        "codes": ["D.8.34"],
        "title": "Plano de Testes de Auditoria em Sistemas",
        "type": "Processo",
        "description": "Planeamento de testes de auditoria com janelas, acessos mínimos, autorização e medidas para evitar impacto nos sistemas.",
    },
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
    return f"iso27002-{code.lower()}"


class Command(BaseCommand):
    help = "Seeds practical ISO/IEC 27002:2022 mechanisms and links them to ISO 27002 controls."

    def add_arguments(self, parser):
        parser.add_argument(
            "--library-only",
            action="store_true",
            help="Create mechanisms and tags only, without creating ControlMechanism associations.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        library_only = options["library_only"]
        created_mechanisms = 0
        updated_tags = 0
        created_suggestions = 0
        created_control_links = 0
        missing_controls = set()

        iso_tag, _ = Tag.objects.get_or_create(name="iso27002", defaults={"category": Tag.Category.REG})

        for item in MECHANISM_LIBRARY:
            mechanism, created = Mechanism.objects.get_or_create(
                title=item["title"],
                defaults={
                    "description": item["description"],
                    "mechanism_type": item["type"],
                },
            )
            if created:
                created_mechanisms += 1

            if not mechanism.tags.filter(id=iso_tag.id).exists():
                mechanism.tags.add(iso_tag)
                updated_tags += 1

            for code in item["codes"]:
                code_tag, _ = Tag.objects.get_or_create(
                    name=tag_name_for_code(code),
                    defaults={"category": Tag.Category.REG},
                )
                if not mechanism.tags.filter(id=code_tag.id).exists():
                    mechanism.tags.add(code_tag)
                    updated_tags += 1

                control = Control.objects.filter(framework__name=ISO_FRAMEWORK_NAME, code=code).first()
                if not control:
                    missing_controls.add(code)
                    continue

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
                        "responsible": owner_for(item["type"]),
                        "acceptance_criteria": (
                            "Evidência mínima: política, procedimento, configuração exportada, "
                            "registo de execução, relatório ou aprovação aplicável ao mecanismo."
                        ),
                    },
                )
                if link_created:
                    created_control_links += 1

        self.stdout.write(self.style.SUCCESS("ISO 27002 mechanism seed completed."))
        self.stdout.write(f"Mechanisms created      : {created_mechanisms}")
        self.stdout.write(f"Tags added              : {updated_tags}")
        self.stdout.write(f"Suggested links created : {created_suggestions}")
        self.stdout.write(f"Control links created   : {created_control_links}")

        if missing_controls:
            self.stdout.write(
                self.style.WARNING(
                    "Controls not found       : " + ", ".join(sorted(missing_controls))
                )
            )