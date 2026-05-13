# Capitulo 4 aplicado ao Virtual CISO

## Diagnostico inicial

O capitulo 4 do relatorio ja apresenta uma arquitetura conceptual adequada, mas ainda usa formulacoes demasiado genericas em varias passagens. A aplicacao existente permite tornar o texto mais concreto, porque o artefacto ja esta materializado numa arquitetura Django REST + React, com modulos funcionais para inventario de ativos, risco, vulnerabilidades, governance, conformidade, integracoes e assistente baseado em IA.

O objetivo da revisao deve ser substituir frases como "o sistema integra multiplas fontes de informacao" por descricoes verificaveis, por exemplo: "a plataforma integra dados de ativos e software a partir de Wazuh e Nmap, enriquece vulnerabilidades com CVSS, EPSS, NVD e CISA KEV, relaciona esses dados com controlos ISO 27001, NIST CSF e QNRC, e disponibiliza resultados atraves de dashboards e de um assistente RAG".

## Arquitetura concreta da aplicacao

O Virtual CISO encontra-se implementado como uma aplicacao web modular, composta por uma API backend em Django REST Framework e uma interface frontend em React. A persistencia principal assenta numa base de dados PostgreSQL, complementada pela extensao pgvector para armazenamento e pesquisa semantica de conhecimento documental. A componente de IA utiliza Ollama como servico local de inferencia, permitindo executar modelos de linguagem em ambiente controlado.

A arquitetura pode ser descrita em cinco camadas:

1. Camada de apresentacao: frontend React/Vite, com rotas para inventario de ativos, vulnerabilidades, riscos, priorizacao, frameworks, controlos, gaps de conformidade, governance, politicas, integracoes e assistente CISO.
2. Camada de API: endpoints Django REST organizados por dominio funcional em `authapi`, `company`, `risk`, `governance`, `integrations`, `chat` e `ciso_assistant`.
3. Camada de dominio: modelos Django que representam organizacao, ativos, software, vulnerabilidades, riscos, frameworks, controlos, mecanismos, evidencias, politicas, stakeholders e contexto regulatorio.
4. Camada de integracao e analise: servicos para Wazuh, Nmap, EPSS, NIST/NVD, motor de risco, motor de priorizacao e motor de avaliacao de gaps de conformidade.
5. Camada de IA e apoio a decisao: orquestrador hibrido que combina consultas estruturadas via ORM, pesquisa semantica com pgvector, construcao dinamica de prompts e geracao de resposta por LLM local.

## Mapeamento dos modulos reais

| Dominio | Implementacao | Papel no artefacto |
|---|---|---|
| Autenticacao | `authapi` | Autenticacao por JWT em cookie e protecao dos endpoints da API. |
| Perfil organizacional | `company` | Dados da entidade avaliada, incluindo setor, servicos criticos, objetivos, dimensao e enquadramento NIS2. |
| Inventario e risco | `risk` | Ativos, software, vulnerabilidades, ocorrencias em ativos, configuracao de risco, scores, tratamentos e historico. |
| Governance e conformidade | `governance` | Frameworks, secoes, controlos, mappings, mecanismos, evidencias, gaps, politicas, stakeholders e contexto regulatorio. |
| Integracoes | `integrations` | Configuracao e estado de sincronizacao de Wazuh, EPSS, NIST/NVD e Nmap. |
| Assistente IA | `ciso_assistant` | Base de conhecimento vetorial, pesquisa semantica, routing de intencao, consultas estruturadas e resposta por LLM. |
| Interface | `frontend/src/pages` | Dashboards e ecras operacionais para o CISO consultar, validar e agir sobre os dados. |

## Modelo de dados aplicado

O modelo de dados do Virtual CISO articula quatro nucleos principais.

O primeiro nucleo representa o contexto organizacional. A entidade `CompanyProfile` guarda informacao sobre a organizacao, incluindo setor, missao, objetivos estrategicos, objetivos de seguranca, numero de colaboradores, receita anual, classificacao setorial NIS2 e indicacao de prestador critico. Este contexto e complementado por `RegulatoryContext` e `Stakeholder`, que permitem enquadrar obrigaÃ§Ãµes regulatÃ³rias, autoridades competentes e partes interessadas relevantes.

O segundo nucleo representa os ativos e a exposicao tecnica. A entidade `Asset` inclui identificacao, proprietarios, unidade organica, criticidade, confidencialidade, integridade, disponibilidade, exposicao, valor de negocio, dependencias, localizacao, ambiente, segmento de rede, origem do dado e metadados recolhidos por Wazuh. A criticidade do ativo e calculada de forma ponderada com base em CIA, exposicao, valor de negocio e dependencias. O modelo inclui ainda software, ranges de rede, historico de ativos e relacoes de dependencia entre ativos.

O terceiro nucleo representa vulnerabilidades e risco. A entidade `Vulnerability` armazena CVE, severidade, CVSS, exploitability score, descricao, mitigacao, EPSS, percentil EPSS, dados NVD e indicador CISA KEV. A entidade `AssetVulnerability` liga vulnerabilidades a ativos concretos, preservando estado, primeira deteccao, ultima observacao, software afetado e origem. A entidade `Risk` consolida score, nivel, probabilidade, impacto, estado e explicacao gerada, sendo complementada por `RiskFactor`, `RiskAssessment` e `RiskTreatment`.

O quarto nucleo representa governance, controlos e conformidade. O modelo inclui `Framework`, `FrameworkLevel`, `FrameworkSection`, `Control`, `ControlMapping`, `Mechanism`, `ControlMechanism`, `MechanismEvidence`, `ComplianceGap`, `Policy`, `PolicyControl`, `ImplementationMechanism`, `PolicyEvidence` e `PolicyAssessment`. Esta estrutura permite distinguir entre requisito normativo, controlo, mecanismo de implementacao, evidencia e estado de conformidade.

## Fluxos funcionais a descrever no capitulo

### Fluxo 1: Inventario e descoberta

O sistema recolhe informacao de ativos por insercao manual, sincronizacao com Wazuh e descoberta ativa via Nmap. O servico `WazuhService` consulta agentes, hardware, pacotes instalados, vulnerabilidades e alertas recentes. O servico `NmapDiscoveryService` executa scans remotos por SSH, interpreta XML do Nmap, identifica hosts, sistemas operativos, servicos expostos, software detetado e CVEs reportadas por scripts de vulnerabilidade. Estes dados alimentam o inventario e permitem distinguir ativos conhecidos, ativos descobertos e ativos que exigem enriquecimento ou validacao.

### Fluxo 2: Enriquecimento de vulnerabilidades

As vulnerabilidades sao representadas por CVE e enriquecidas com severidade, CVSS, EPSS, dados NVD e indicador KEV. Esta combinacao permite ultrapassar uma leitura puramente tecnica da severidade, porque o score passa a considerar probabilidade de exploracao, exposicao do ativo, criticidade de negocio e existencia de exploit conhecido.

### Fluxo 3: Calculo de risco

O `RiskEngineService` calcula o risco combinando CVSS, EPSS, criticidade do ativo, exposicao, valor de negocio e dependencia. O resultado e convertido num score de 0 a 100 e num nivel qualitativo. O sistema guarda tambem fatores explicativos em `RiskFactor`, permitindo ao utilizador perceber que variaveis contribuiram para a classificacao apresentada.

### Fluxo 4: Priorizacao de vulnerabilidades

O `VulnerabilityPrioritizationService` calcula tres dimensoes: score de risco, score de remediacao e score final de prioridade. O score de risco considera CVSS, EPSS, criticidade do ativo, exposicao e indicador KEV. O score de remediacao considera acionabilidade da mitigacao e idade da vulnerabilidade. O score final combina risco e capacidade de tratamento, produzindo uma ordenacao orientada a decisao e nao apenas uma lista tecnica de CVEs.

### Fluxo 5: Conformidade e gaps

O `ComplianceGapEngine` avalia controlos por framework e classifica gaps como `MISSING`, `PARTIAL` ou `IMPLEMENTED`, usando evidencia e findings associados. Esta abordagem permite apresentar conformidade como um processo continuo, suportado por evidencia, em vez de uma checklist estatica.

### Fluxo 6: Assistente IA hibrido

O `QueryOrchestrator` e o ponto central da componente de IA. O fluxo inicia-se com classificacao da intencao da pergunta pelo `LLMRouter`. Se a questao for estruturada, o sistema tenta responder por ORM atraves do `StructuredQueryService`, evitando alucinacao do LLM. Se a pergunta exigir contexto documental, o `SemanticRetrievalService` recupera chunks relevantes em pgvector. Para perguntas sobre priorizacao de vulnerabilidades, o sistema usa diretamente o motor deterministico de priorizacao e apenas depois pede ao LLM uma explicacao executiva em PT-PT. A resposta final e construida pelo `PromptBuilder` e gerada via `OllamaClient`.

## Ajustes recomendados ao texto atual do capitulo 4

1. Alterar o titulo do capitulo para "Concecao, Arquitetura e Desenvolvimento do Virtual CISO".
2. Substituir descricoes genericas de camadas por uma arquitetura concreta com frontend React, backend Django REST, PostgreSQL, pgvector, Ollama e integracoes Wazuh/Nmap/EPSS/NIST.
3. Incluir uma tabela de mapeamento entre modulos da aplicacao e responsabilidades arquiteturais.
4. Reescrever o modelo de dados com nomes reais das entidades implementadas.
5. Explicar que o risco e a priorizacao ja nao sao apenas conceptuais: existem servicos concretos (`RiskEngineService` e `VulnerabilityPrioritizationService`) com pesos e fatores.
6. Clarificar que a componente de IA e hibrida: combina regras/ORM, scoring deterministico, RAG semantico e LLM local.
7. Acrescentar uma figura de arquitetura com os modulos reais e outra figura de fluxo do assistente IA.
8. Remover o bloco antigo de template que ainda aparece depois da "Sintese do Capitulo".

## Texto curto sugerido para abrir o capitulo 4

O presente capitulo descreve a concecao, arquitetura e desenvolvimento do artefacto Virtual CISO, deixando de o apresentar apenas como uma proposta conceptual e passando a caracterizar a sua implementacao concreta. A aplicacao foi desenvolvida como uma plataforma web modular, composta por um backend em Django REST Framework, uma interface frontend em React e uma base de dados PostgreSQL com suporte pgvector para pesquisa semantica de conhecimento. A arquitetura integra ainda servicos de recolha e enriquecimento de dados provenientes de Wazuh, Nmap, EPSS e NIST/NVD, bem como uma componente de Inteligencia Artificial baseada em modelos locais executados via Ollama.

Enquanto artefacto de apoio a decisao para CISOs, o Virtual CISO articula informacao organizacional, inventario de ativos, vulnerabilidades, scores de risco, frameworks normativas, controlos, mecanismos de implementacao, evidencia e gaps de conformidade. Esta articulacao permite que a plataforma nao se limite a apresentar indicadores tecnicos isolados, mas produza uma visao integrada da postura de ciberseguranca da organizacao, suportando priorizacao, explicabilidade, rastreabilidade e validacao humana.

## Figuras recomendadas

1. Arquitetura fisica e logica do Virtual CISO: browser React, API Django, PostgreSQL/pgvector, Ollama, Wazuh, Nmap, EPSS e NIST/NVD.
2. Modelo de dominio: CompanyProfile, Asset, Vulnerability, AssetVulnerability, Risk, Framework, Control, Mechanism, Evidence, ComplianceGap e KnowledgeChunk.
3. Fluxo de priorizacao: vulnerabilidade + ativo + CVSS/EPSS/KEV + contexto de negocio -> risk score -> remediation score -> priority score -> recomendacao.
4. Fluxo do assistente IA: pergunta -> router -> ORM ou RAG ou motor de priorizacao -> prompt -> Ollama -> resposta com fontes.



