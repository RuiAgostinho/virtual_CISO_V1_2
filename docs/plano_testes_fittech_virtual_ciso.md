# Plano de testes do Virtual CISO com base no caso FitTech Solutions

## 1. Objetivo

Este plano transforma o caso de estudo FitTech Solutions, desenvolvido no trabalho de Políticas e Análise de Risco na Segurança de Informação, num cenário de teste end-to-end para o Virtual CISO.

O objetivo é validar a aplicação como se fosse utilizada por um CISO numa organização real, cobrindo:

- dados da organização;
- inventário e classificação de ativos;
- software instalado;
- vulnerabilidades;
- gestão de risco;
- políticas;
- controlos internos;
- mecanismos;
- evidências;
- tarefas;
- conformidade;
- rastreabilidade;
- recomendações de IA/RAG;
- decisões e plano de ação.

## 2. Cenário organizacional

Organização: FitTech Solutions

Contexto resumido:

- empresa portuguesa fundada em 2020;
- atua no setor de equipamentos inteligentes de fitness;
- modelo B2B2C;
- vende equipamentos e serviços digitais a ginásios, centros de fitness e consumidores finais;
- opera loja online, aplicações móveis, plataforma de gestão de ginásios e programas de realidade virtual;
- combina cloud, infraestrutura on-premises e sistemas industriais/IoT.

Dados a introduzir no onboarding institucional:

- missão: capacitar entusiastas de fitness com soluções tecnológicas inovadoras;
- visão: tornar-se líder global em soluções integradas de fitness;
- valores: inovação, qualidade, foco no cliente e sustentabilidade;
- setores críticos: e-commerce, aplicações digitais, produção, logística, suporte a clientes e gestão de ginásios;
- enquadramento legal: RGPD, comércio eletrónico, segurança da informação, ISO/IEC 27001 e ISO/IEC 27005;
- dados críticos: dados pessoais de clientes, dados financeiros, inventário, dados industriais, dados de subscrição e histórico de compras.

Critério de aceitação:

- a página de dados da organização deve ficar preenchida;
- missão e objetivos devem ser editáveis;
- o contexto regulatório deve ficar registado;
- o assistente IA deve conseguir usar este contexto nas respostas.

## 3. Ativos a criar ou importar

### Ativos tecnológicos

- Shopify, plataforma de e-commerce;
- HubSpot CRM;
- SAP Business One, ERP;
- TradeGecko / QuickBooks Commerce, gestão de inventário;
- AutoCAD, design 3D;
- OutSystems, desenvolvimento aplicacional;
- plataforma móvel de treino;
- plataforma de realidade virtual;
- Azure, armazenamento e aplicações cloud;
- servidores on-premises de produção;
- sensores IoT e máquinas inteligentes;
- firewall/NGFW;
- IDS/IPS;
- SIEM;
- VPN corporativa;
- workstations administrativas;
- workstations de produção;
- sistema de pagamentos.

### Ativos informacionais

- dados pessoais de clientes;
- histórico de compras;
- preferências e subscrições;
- dados financeiros;
- dados de inventário;
- dados industriais/operacionais;
- desenhos e protótipos de produtos;
- logs de segurança.

### Ativos físicos e humanos

- lojas físicas;
- armazém;
- colaboradores;
- equipa de TI;
- CISO;
- DPO.

Critério de aceitação:

- os ativos devem aparecer no inventário;
- os ativos de software devem aparecer também em `/assets/software`;
- ativos críticos devem ter owner, unidade orgânica, tipo, ambiente e classificação.

## 4. Classificação de ativos

Testar o wizard de classificação com pelo menos estes ativos:

### Shopify

- confidencialidade: 4;
- integridade: 5;
- disponibilidade: 5;
- exposição: 5;
- valor de negócio: 5;
- dependência: 4.

Justificação: plataforma pública de vendas, integrada com pagamentos, CRM e inventário.

### HubSpot CRM

- confidencialidade: 5;
- integridade: 4;
- disponibilidade: 4;
- exposição: 3;
- valor de negócio: 5;
- dependência: 4.

Justificação: contém dados pessoais, histórico de clientes e informação comercial.

### SAP Business One

- confidencialidade: 4;
- integridade: 5;
- disponibilidade: 5;
- exposição: 2;
- valor de negócio: 5;
- dependência: 5.

Justificação: sistema central de ERP, inventário, finanças e recursos humanos.

### AutoCAD

- confidencialidade: 4;
- integridade: 4;
- disponibilidade: 3;
- exposição: 1;
- valor de negócio: 4;
- dependência: 3.

Justificação: suporta desenho e desenvolvimento de produtos.

Critério de aceitação:

- a classificação deve gerar criticidade coerente;
- a justificação deve ficar guardada;
- a data de revisão deve existir;
- ativos incompletos devem aparecer como tal.

## 5. Vulnerabilidades e priorização contextual

Cenário principal para Use Case 1:

Pergunta do CISO:

> Apareceram várias vulnerabilidades novas. Por onde começo?

Criar ou usar vulnerabilidades em dois ativos com CVSS semelhante:

### Vulnerabilidade A

- ativo: Shopify ou sistema de pagamentos;
- exposição: pública;
- criticidade do ativo: crítica;
- EPSS: elevado;
- KEV: sim, se possível;
- mitigação: ausente;
- mecanismos relevantes: MFA, WAF, patching, monitorização SIEM;
- evidência: inexistente ou incompleta.

Resultado esperado:

- deve aparecer no topo da priorização;
- a explicação deve referir exposição pública, criticidade, EPSS/KEV, ausência de mitigação e impacto no negócio.

### Vulnerabilidade B

- ativo: servidor de testes ou AutoCAD interno;
- exposição: interna;
- criticidade do ativo: média;
- EPSS: baixo;
- KEV: não;
- mitigação: existente;
- evidência: válida.

Resultado esperado:

- deve aparecer abaixo da vulnerabilidade A, mesmo com CVSS semelhante.

Critério de aceitação:

- a prioridade deve ser explicável;
- o breakdown deve mostrar fatores de decisão;
- o assistente IA deve conseguir resumir as vulnerabilidades prioritárias.

## 6. Políticas a criar

Criar ou importar estas políticas com base no documento:

- Política de Segurança da Informação;
- Política de Formação em Segurança da Informação;
- Política de Gestão de Palavras-Passe;
- Política de Acesso Lógico;
- Política de Backup;
- Política de Notificação de Incidentes;
- Política de Conformidade com o RGPD;
- Política de Recuperação de Desastres;
- Política de Classificação de Ativos;
- Política de Uso Aceitável;
- Política de BYOD;
- Política de Trabalho Remoto.

Critério de aceitação:

- cada política deve ter capítulos editáveis;
- cada política deve ter owner, revisão e estado;
- deve ser possível associar controlos internos;
- a política deve aparecer no histórico, no dossier e na rastreabilidade.

## 7. Controlos internos e mecanismos

Controlos internos recomendados:

- gestão de identidades e acessos;
- MFA para sistemas críticos;
- menor privilégio;
- revisão periódica de acessos;
- gestão de palavras-passe;
- backup e restauro;
- cifragem de dados;
- monitorização contínua;
- registo e resposta a incidentes;
- gestão de vulnerabilidades;
- hardening de sistemas;
- segmentação de rede;
- proteção de endpoints;
- WAF para e-commerce;
- controlo de BYOD;
- plano de recuperação de desastres;
- classificação da informação;
- formação e sensibilização.

Mecanismos associados:

- MFA;
- RBAC;
- PAM, se aplicável;
- gestor de palavras-passe;
- SIEM;
- EDR/XDR;
- WAF;
- backup automatizado;
- testes de restauro;
- VPN;
- MDM;
- firewall/NGFW;
- IDS/IPS;
- encriptação TLS;
- encriptação em repouso;
- processo de patching;
- revisão semestral de acessos.

Critério de aceitação:

- um controlo interno deve ligar a vários mecanismos;
- um mecanismo deve suportar vários controlos;
- tarefas de implementação devem existir para mecanismos críticos;
- o progresso das tarefas deve influenciar recomendação de estado operacional, com validação humana.

## 8. Evidências esperadas e evidências reais

Tipos de evidência esperada:

- exportação de configuração MFA;
- relatório de revisão de acessos;
- política aprovada;
- registo de formação;
- relatório SIEM;
- logs de eventos;
- ticket de aprovação;
- screenshot de configuração;
- relatório de backup;
- resultado de teste de restauro;
- relatório de vulnerabilidades;
- exportação de regras de firewall;
- comprovativo de encriptação;
- relatório de auditoria;
- ata de aprovação do CISO;
- registo de exceção ou aceitação de risco.

Testes:

- criar tipo de evidência esperada para um mecanismo;
- anexar evidência real;
- associar evidência a mecanismo;
- verificar validade;
- confirmar impacto no score;
- confirmar traceability.

Critério de aceitação:

- evidência esperada e evidência real devem estar visualmente separadas;
- evidência expirada não deve contar para score oficial;
- evidência em draft não deve contar como oficial;
- evidência aprovada deve contribuir para conformidade.

## 9. Compliance e mapping

Mapear controlos internos para:

- ISO/IEC 27001;
- ISO/IEC 27002;
- RGPD;
- DL 125/2025 / NIS2, quando aplicável;
- NIST CSF, se disponível.

Exemplos:

- controlo de acesso lógico -> ISO 27001/27002, NIS2 Art. 21;
- backup e recuperação -> ISO 27001/27002, NIS2 continuidade;
- monitorização SIEM -> ISO 27002 logging/monitoring;
- gestão de vulnerabilidades -> ISO 27002 technical vulnerabilities;
- classificação da informação -> ISO 27002 information classification;
- gestão de incidentes -> NIS2 e ISO 27035, se disponível.

Critério de aceitação:

- Mapping Review deve mostrar mappings pendentes, aprovados e rejeitados;
- apenas mappings aprovados devem contar como oficiais;
- a cobertura por framework deve ser calculada;
- o CISO deve conseguir justificar cada mapping.

## 10. IA/RAG

Perguntas de teste:

1. Quais são os ativos mais críticos da FitTech Solutions?
2. Que políticas faltam para suportar a certificação ISO/IEC 27001?
3. A política de backup está suficientemente suportada por mecanismos e evidências?
4. Que vulnerabilidades devo priorizar nesta semana?
5. A FitTech está preparada para incidentes que afetem o sistema de pagamentos?
6. Que lacunas existem na gestão de acessos?
7. Que evidências faltam para demonstrar a implementação de MFA?
8. Qual é o risco residual associado ao CRM?
9. Que controlos internos reduzem o risco de falha de integração entre ERP, CRM e e-commerce?
10. Que ações o CISO deve priorizar no próximo mês?

Critério de aceitação:

- a resposta deve usar primeiro dados internos;
- deve citar fontes internas quando existirem;
- deve indicar lacunas quando não houver evidência;
- deve distinguir recomendações de decisões formais;
- deve registar histórico de recomendações.

## 11. Decisões, exceções e plano de ação

Testar:

- aceitar uma recomendação IA;
- rejeitar uma recomendação com justificação;
- criar exceção temporária para MFA em sistema legado;
- definir compensating control com SIEM;
- criar ação para implementar WAF;
- criar ação para rever acessos;
- atribuir owner e prazo;
- ver no Mission Control.

Critério de aceitação:

- IA recomenda;
- CISO decide;
- sistema regista decisão;
- ação é criada;
- evidência pode ser associada;
- dossier de auditoria reflete o ciclo.

## 12. Dossier de auditoria

Gerar dossier para:

- Política de Segurança da Informação;
- domínio de acessos;
- domínio de backup/continuidade;
- sistema de pagamentos;
- Shopify/e-commerce.

O dossier deve incluir:

- política;
- controlos internos;
- mappings para frameworks;
- mecanismos;
- tarefas;
- evidências esperadas;
- evidências reais;
- score;
- gaps;
- recomendações IA;
- decisões;
- ações.

Critério de aceitação:

- o dossier deve ser exportável;
- deve ser compreensível para auditoria;
- não deve depender de informação fictícia hardcoded no frontend.

## 13. Métricas a recolher para dissertação

Durante os testes, registar:

- número de ativos criados/importados;
- número de ativos classificados;
- número de software inventariado;
- número de vulnerabilidades;
- tempo de resposta do LLM local;
- número de fontes RAG usadas;
- número de políticas;
- número de controlos internos;
- número de mecanismos;
- número de evidências reais;
- coverage por framework;
- score por política;
- score por framework;
- gaps identificados;
- gaps resolvidos;
- decisões formais registadas;
- ações criadas e concluídas.

## 14. Conclusão

O trabalho da FitTech Solutions é adequado para testar a aplicação porque contém um caso completo e coerente de organização, ativos, riscos, políticas, controlos e medidas de mitigação.

O cenário permite demonstrar os principais contributos do Virtual CISO:

- visão transversal da organização;
- classificação de ativos;
- priorização contextual de vulnerabilidades;
- governação baseada em controlos internos;
- evidência reutilizável;
- scoring de conformidade por propagação;
- rastreabilidade;
- recomendações IA;
- decisão humana auditável.

