# Matriz Capitulo 4 vs Aplicacao Virtual CISO

## Objetivo

Esta matriz cruza as capacidades descritas no Capitulo 4 com a implementacao atual da aplicacao Virtual CISO. O objetivo e identificar o que ja esta implementado, o que esta parcialmente implementado, o que esta apenas descrito de forma conceptual e que desenvolvimentos devem ser priorizados para alinhar a dissertação com o artefacto real.

Legenda:

- Implementado: existe modelo, API/servico e/ou interface suficientemente alinhados com o texto.
- Parcial: existe base tecnica, mas falta completar fluxo, interface, persistencia, rastreabilidade ou coerencia.
- Nao implementado: a capacidade esta descrita no capitulo, mas nao existe ainda como funcionalidade verificavel.
- Incongruente: existe diferenca relevante entre a promessa textual e o comportamento/codigo atual.

## Matriz de rastreabilidade

| Tema do Capitulo 4 | Estado | Implementacao atual | Incongruencia / lacuna | Acao recomendada |
|---|---|---|---|---|
| Arquitetura web modular em camadas | Implementado | Backend Django REST em `backend/core`, apps `risk`, `governance`, `company`, `integrations`, `ciso_assistant`; frontend React/Vite em `frontend/src`. | O texto deve nomear a stack real em vez de descrever apenas camadas abstratas. | Reescrever a secção de arquitetura com Django REST, React, PostgreSQL, pgvector, Ollama, Wazuh, Nmap, EPSS e NIST/NVD. |
| Separacao entre frontend, API, dominio, integracao, analise e IA | Implementado | Rotas em `backend/core/urls.py`; paginas em `frontend/src/App.tsx`; servicos em `risk/services`, `governance/services` e `ciso_assistant/services`. | Falta diagrama concreto no relatorio. | Criar figura de arquitetura logica/fisica. |
| Autenticacao e controlo de acesso | Parcial | `authapi` com autenticacao JWT por cookie; DRF exige utilizador autenticado por defeito. | O capitulo fala pouco de seguranca da propria plataforma; nao ha ainda modelo avancado de roles/permissoes. | Descrever como autenticacao baseline; se necessario, desenvolver perfis/roles para CISO, auditor e tecnico. |
| Perfil organizacional e contexto NIS2 | Implementado | `CompanyProfile`, `RegulatoryContext`, `Stakeholder`; frontend em governance organization/regulatory/stakeholders. | Deve ser explicitado que o enquadramento NIS2 e registado no perfil organizacional. | Incluir no Capitulo 4 como entrada de contexto para risco e conformidade. |
| Inventario de ativos | Implementado | Modelo `Asset`, categorias, tipos, localizacoes, ambientes, infraestruturas, historico; paginas de inventario e detalhe. | Ha campos de inventario maduros, mas o capitulo ainda fala genericamente de ativos. | Reescrever modelo de dados com os campos reais: CIA, exposicao, valor de negocio, dependencias, owners e origem. |
| Calculo automatico da criticidade dos ativos | Implementado | `Asset.save()` calcula criticidade com `RiskConfiguration`: CIA, exposicao, valor e dependencia. | O texto deve distinguir criticidade de ativo de score de risco. | Explicar formula de criticidade como etapa anterior ao calculo de risco. |
| Descoberta ativa com Nmap | Implementado/Parcial | `NmapDiscoveryService` executa scans por SSH, interpreta XML, cria ativos e enriquece host unico. | Criacao em `match_and_create_assets` parece usar `asset_type="Infrastructure"` apesar de `asset_type` ser FK no modelo atual; pode causar erro dependendo do serializer/model state. | Testar fluxo Nmap; corrigir criacao de ativo para usar `category`/`asset_type` FK ou campos corretos. |
| Integracao Wazuh | Implementado/Parcial | `WazuhService` recolhe agentes, hardware, pacotes, vulnerabilidades e alertas; comandos de sync existem. | A robustez depende de configuracao externa; o capitulo deve indicar prova de conceito. | Validar comandos `sync_wazuh_assets` e `sync_wazuh_vulns`; documentar como fonte tecnica da demonstracao. |
| Inventario de software | Implementado | Modelo `Software`, ligacao a ativos, paginas de inventario e detalhe. | O capitulo ainda nao da destaque suficiente ao software como ponte entre ativos e vulnerabilidades. | Acrescentar software ao modelo conceptual e ao fluxo de vulnerabilidades. |
| Vulnerabilidades por CVE | Implementado | `Vulnerability` e `AssetVulnerability`; inclui CVSS, EPSS, NVD, KEV, estado e historico. | A entidade `Vulnerability` nao tem campo `title`, mas o frontend/API usam `vulnerability_title` ou fallback. | Alinhar serializers/frontend ou adicionar campo `title`; evitar apresentar "Vulnerability Descriptor Missing". |
| Enriquecimento EPSS | Implementado/Parcial | Campos `epss_score`, `epss_percentile`, `epss_last_updated`; comando `sync_epss`; endpoint `refresh_intel`. | Falta confirmar se o comando atual atualiza todos os registos de forma demonstravel. | Testar sync EPSS com dados reais; incluir resultado no Capitulo 5. |
| Enriquecimento NIST/NVD | Implementado/Parcial | Campos `nvd_data`, `nist_last_updated`; comando `sync_nist`; endpoint `refresh_nvd`. | Falta confirmar consistencia do parser e populacao de `mitigation`. | Testar comando NIST; se necessario, melhorar mapeamento NVD para descricao, CVSS e referencias. |
| Indicador CISA KEV | Parcial | Campo `is_in_kev` usado no motor de priorizacao. | Nao foi evidente fonte/sync especifica de KEV. | Implementar ou documentar fonte KEV; integrar no comando de threat intelligence. |
| Motor de risco ISO 27005 / scoring contextual | Implementado | `RiskEngineService` calcula score 0-100 com CVSS, EPSS, criticidade, exposicao, valor e dependencia; guarda `RiskFactor`. | Comentario diz "simula XGBoost"; nao existe modelo ML real. Isto e incongruente se o relatorio afirmar ML preditivo treinado. | No texto, chamar "modelo ponderado inspirado em priorizacao preditiva"; ou implementar ML real se for objetivo. |
| Fatores explicativos do risco | Implementado | `RiskFactor` guarda nome, valor, peso e contribuicao; `ai_explanation` guarda explicacao textual. | Falta interface forte para mostrar breakdown no dashboard/priorizacao. | Melhorar `RiskDetail`/priorizacao para mostrar pesos, contribuicoes e justificacao. |
| Tratamento de riscos | Implementado/Parcial | `RiskTreatment` com tipo, acao, responsavel, prazo e estado. | Falta fluxo claro na UI para criar/acompanhar tratamentos a partir das recomendacoes. | Criar acoes de tratamento diretamente a partir de risco/prioridade. |
| Priorizacao multidimensional de vulnerabilidades | Parcial/Incongruente | Servico `VulnerabilityPrioritizationService` calcula `risk_score`, `remediation_score` e `priority_score`. | A pagina `RiskPrioritization.tsx` lista `Risk` ordenado por `risk_score`, nao usa o servico de priorizacao multidimensional. | Criar endpoint para priorizacao de `AssetVulnerability` e adaptar frontend para usar `priority_score`, breakdown e razoes. |
| Priorizacao com remediacao e idade | Parcial | Implementado no servico `prioritization.py`. | Nao esta exposto diretamente na API de risco nem refletido na interface principal. | Expor endpoint `/api/risk/vulnerabilities/prioritized/` ou equivalente. |
| Governance por frameworks | Implementado | `Framework`, `FrameworkLevel`, `FrameworkSection`, `Control`, `ControlMapping`. | O capitulo deve nomear ISO27001, NISTCSF e QNRC conforme enum real. | Reescrever secção de governance com entidades reais. |
| Controlos e mecanismos de implementacao | Implementado | `Mechanism`, `SuggestedMechanism`, `ControlMechanism`, `MechanismEvidence`. | Existe tambem outro modelo `ImplementationMechanism` ligado a politicas, criando alguma duplicacao conceptual. | Clarificar no modelo: mecanismos globais de controlo vs mecanismos especificos de politica. Eventualmente harmonizar. |
| Evidencia de mecanismos | Implementado | `MechanismEvidence` e `PolicyEvidence`. | Ha duas cadeias de evidencia; o texto deve explicar ou a aplicacao deve unificar melhor. | Definir uma cadeia principal para demonstracao: controlo -> mecanismo -> evidencia -> gap. |
| Avaliacao de controlos, findings e acoes de melhoria | Implementado/Parcial | `ControlAssessment`, `Evidence`, `Finding`, `ImprovementAction`. | Pouco exposto nas APIs/paginas lidas; `ComplianceGapEngine` usa `Evidence` e `Finding`, mas o frontend principal trabalha mais com `ComplianceGap`. | Expor/validar CRUD de assessments, findings e actions; ligar ao detalhe de controlos. |
| Compliance Gap Engine | Implementado | `ComplianceGapEngine` classifica controlos como `MISSING`, `PARTIAL`, `IMPLEMENTED`; pagina `ComplianceGaps.tsx` mostra score e gaps. | Botao "Recalcular Motor" no frontend chama apenas `fetchData`, nao dispara `POST /analyze/`. | Corrigir botao para executar analise antes de recarregar dados. |
| Conformidade continua e evidenciavel | Parcial | Existe motor de gaps, evidencia, findings e politicas. | Falta ciclo operacional completo: recolher evidencia, avaliar controlo, abrir finding, criar acao, validar fecho. | Implementar fluxo end-to-end no detalhe de controlo/framework. |
| Politicas de seguranca | Implementado | `Policy`, `PolicySection`, `PolicyControl`, `ImplementationMechanism`, `PolicyEvidence`, `PolicyAssessment`; paginas de politicas. | O capitulo fala em governance, mas pode explicitar politicas como camada de operacionalizacao dos controlos. | Acrescentar subsecção de gestao documental e politicas. |
| Regulamentos tecnicos e procedimentos | Implementado/Parcial | Modelos referidos em API: `TechnicalRegulation`, `Procedure`; paginas existem. | Nao foram inspecionados os modelos neste levantamento; verificar maturidade. | Rever modelos e UI antes de descrever como plenamente implementado. |
| Assistente IA com RAG hibrido | Implementado/Parcial | `QueryOrchestrator`, `LLMRouter`, `SemanticRetrievalService`, `StructuredQueryService`, `PromptBuilder`, `OllamaClient`; `KnowledgeChunk` com pgvector. | `AskCISOView` chama `ChatService`, que deve ser confirmado como ponte para o orquestrador. | Verificar `ChatService`; garantir que a rota usada pelo frontend utiliza o orquestrador hibrido. |
| Pesquisa semantica com pgvector | Implementado/Parcial | `KnowledgeChunk.embedding` com `VectorField(dimensions=3072)`. | Ollama embedding model configurado como `llama3.1:8b`; pode nao produzir 3072 dimensoes. | Confirmar dimensao real dos embeddings e ajustar `VectorField` ou modelo de embedding. |
| Consultas estruturadas para evitar alucinacao | Implementado/Parcial | `StructuredQueryService` usado pelo orquestrador. | Necessario testar cobertura de perguntas esperadas no Capitulo 5. | Criar conjunto de perguntas de demonstracao e ajustar intents/parsing. |
| Respostas com fontes | Parcial | API devolve `sources`; frontend mostra "Context Domains Used". | Frontend converte fontes para strings `s.source`, mas fontes do orquestrador usam chaves como `title`, `source_ref`, `content`. Pode mostrar fontes vazias/incorretas. | Normalizar formato de `sources` no backend ou frontend. Mostrar titulo, referencia e excerto. |
| Validacao humana das recomendacoes | Parcial/Nao implementado | Existem estados em vulnerabilidades, riscos e tratamentos; ativos descobertos podem ser promovidos. | Nao ha entidade clara de "Recommendation" com aceitar/rejeitar/justificar. | Implementar modelo `RecommendationDecision` ou `DecisionLog` para validacao do CISO. |
| Rastreabilidade de decisoes | Parcial | `AssetHistory`, `VulnerabilityHistory`, timestamps, evidence/finding/action. | Falta trilho transversal para recomendacoes de IA, calculos de score e decisoes humanas. | Criar audit log transversal para: recomendacao, fonte, score, decisao, utilizador, data, justificacao. |
| Auditabilidade | Parcial | Historicos existem em alguns dominios; evidencia tem hash/URI em `Evidence`; sync status existe. | Falta uma visao unica de eventos auditaveis. | Implementar pagina/API de audit trail ou consolidar eventos existentes. |
| Explicabilidade de IA | Parcial | Baixa temperatura, RAG, structured bypass, fatores de risco, fontes. | Nao ha explicacao sistematica para cada recomendacao nem armazenamento da versao do prompt/modelo. | Persistir recomendacoes com prompt/modelo/fontes/scores; expor no frontend. |
| Dashboard executivo | Implementado/Parcial | `RiskDashboard`, `GovernanceDashboard`, `ComplianceGaps`, `MissionControl` existem. | Algumas mensagens no frontend sao hardcoded: "XGBoost", "-40%", "2 Sem.", "EPSS > 0.8". | Substituir textos hardcoded por dados reais ou marcadores claramente demonstrativos. |
| Interface orientada a drill-down | Implementado/Parcial | Rotas para detalhe de ativo, software, risco, politica; drawers de vulnerabilidades. | Nem todos os indicadores do dashboard permitem navegar para a evidencia/fatores subjacentes. | Melhorar links de drill-down para riscos, gaps, controlos, evidencias e fontes RAG. |
| Integracoes configuraveis | Implementado | `IntegrationConfig`, `IntegrationSyncStatus`; paginas Wazuh, EPSS, NIST, Nmap. | Credenciais e endpoints aparecem como configuracao, mas convem rever seguranca de armazenamento. | Para dissertação, explicar como configuracao de PoC; para produto, cifrar segredos. |
| Segurança operacional da propria plataforma | Parcial | JWT cookie, CORS restrito ao Vite; configuração sensível movida para `.env` com exemplos versionados. | Para ambiente real continua a exigir hardening: `DEBUG=False`, hosts restritos, HTTPS, rotação dos segredos recuperados e revisão de permissões. | Validar configuração de produção e rodar credenciais que tenham aparecido na recuperação inicial. |

## Prioridades de desenvolvimento recomendadas

### Prioridade 1: alinhar a priorizacao real com o capitulo

Problema: o capitulo descreve uma priorizacao multidimensional muito boa, e o backend ja tem um servico para isso, mas a pagina principal de priorizacao ainda usa apenas riscos ordenados por `risk_score`.

Acao:

1. Criar endpoint dedicado para `VulnerabilityPrioritizationService`.
2. Atualizar `frontend/src/pages/risk/RiskPrioritization.tsx` para consumir esse endpoint.
3. Mostrar `priority_score`, `risk_score`, `remediation_score`, razoes de risco e razoes de remediacao.
4. Remover frases hardcoded de impacto/tempo ou substitui-las por dados calculados.

Impacto academico: torna demonstravel a contribuicao da RQ2 e o mecanismo de apoio a decisao.

### Prioridade 2: implementar validacao humana e audit trail das recomendacoes

Problema: o capitulo fala de validacao humana, rastreabilidade e auditabilidade como requisitos centrais, mas a aplicacao ainda nao tem uma entidade transversal para decisoes sobre recomendacoes.

Acao:

1. Criar modelo para recomendacoes/decisoes, por exemplo `DecisionRecord`.
2. Guardar tipo de recomendacao, objeto alvo, score, fontes, racional, decisao humana, utilizador, data e justificacao.
3. Permitir aceitar, rejeitar ou converter recomendacao em tratamento/acao de melhoria.
4. Criar vista de historico/auditoria.

Impacto academico: alinha diretamente com explicabilidade, rastreabilidade e auditabilidade do Capitulo 4.

### Prioridade 3: corrigir o fluxo de Compliance Gap Engine na interface

Problema: existe endpoint `POST /api/governance/gaps/analyze/`, mas a pagina de gaps apenas recarrega dados.

Acao:

1. Adicionar chamada ao endpoint `analyze`.
2. Recarregar summary e lista apos analise.
3. Mostrar data da ultima avaliacao e notas por controlo.

Impacto academico: torna a conformidade continua demonstravel.

### Prioridade 4: normalizar fontes do assistente IA

Problema: o backend pode devolver fontes em formatos diferentes e o frontend espera chaves que podem nao existir.

Acao:

1. Definir contrato unico de fonte: `title`, `source_type`, `source_ref`, `content_excerpt`, `score`.
2. Adaptar `ChatResponseSerializer`/servicos para cumprir esse contrato.
3. Mostrar fontes no frontend de forma legivel.

Impacto academico: reforca RAG explicavel e reduz risco de respostas opacas.

### Prioridade 5: remover incongruencias de linguagem "ML/XGBoost"

Problema: a aplicacao usa scoring deterministico ponderado, nao um modelo XGBoost treinado.

Acao:

1. Alterar textos do frontend que afirmam "XGBoost" ou "modelo preditivo" sem base implementada.
2. No relatorio, usar "modelo ponderado de scoring contextual" ou "logica preditiva baseada em fatores".
3. Se quiseres mesmo ML, definir dataset, treino, features, avaliacao e inferencia.

Impacto academico: evita fragilidade na defesa da dissertação.

## Plano de execucao sugerido

1. Primeiro, corrigir priorizacao e compliance gaps, porque sao visiveis e demonstraveis.
2. Depois, criar audit trail/validacao humana, porque e o maior salto entre arquitetura conceptual e artefacto cientifico.
3. A seguir, normalizar fontes do assistente IA e preparar perguntas de demonstracao.
4. Por fim, reescrever o Capitulo 4 com base no que ficou implementado e preparar o Capitulo 5 com cenarios de avaliacao.

## Estado das intervencoes

### Intervencao 1 - Priorizacao multidimensional

Estado: implementado parcialmente na aplicacao.

Alteracoes realizadas:

1. Criado endpoint `GET /api/risk/vulnerability-occurrences/prioritized/`, exposto em `AssetVulnerabilityViewSet`, para devolver os resultados do `VulnerabilityPrioritizationService`.
2. Criado tipo `PrioritizedVulnerability` e metodo `listPrioritizedVulnerabilities` no cliente `frontend/src/lib/riskApi.ts`.
3. Reescrita a pagina `frontend/src/pages/risk/RiskPrioritization.tsx` para usar `priority_score`, `risk_score`, `remediation_score`, razoes de risco e razoes de remediacao, em vez de listar apenas `Risk` por `risk_score`.

Notas de verificacao:

1. O build global do frontend ainda falha por erros TypeScript pre-existentes noutras areas da aplicacao, sobretudo tipos incompletos em `riskApi`, imports nao usados e metodos referenciados mas nao exportados.
2. O backend nao arrancou em `manage.py check` porque o ambiente virtual nao tem o pacote `pgvector` disponivel, embora ele esteja listado em `backend/requirements.txt`.
3. A funcionalidade precisa de teste funcional com backend ativo e dados reais de `AssetVulnerability`.

### Intervencao 2 - Compliance Gap Engine na interface

Estado: implementado na interface.

Alteracoes realizadas:

1. Adicionados tipos e metodos no cliente `frontend/src/lib/governanceApi.ts` para `getComplianceSummary`, `listComplianceGaps` e `analyzeComplianceGaps`.
2. Reescrita a pagina `frontend/src/pages/ComplianceGaps.tsx` para chamar efetivamente `POST /api/governance/gaps/analyze/` quando o utilizador seleciona "Recalcular Motor".
3. Adicionado estado visual de analise em curso, mensagem de conclusao e botao para executar a primeira analise quando ainda nao existem dados.
4. Acrescentada a data da ultima avaliacao e as notas do motor na tabela de gaps.

Notas de verificacao:

1. O build filtrado nao reportou erros novos em `ComplianceGaps`, `governanceApi`, `RiskPrioritization` ou `riskApi`.
2. O build global continua a falhar por erros pre-existentes, em particular exports/tipos em falta no `riskApi` consumidos por outras paginas (`AssetCategory`, `AssetType`, `AssetLocation`, `NetworkRange`, entre outros).
3. A funcionalidade precisa de teste funcional com backend ativo e dados de frameworks/controlos/evidencias.

### Intervencao 3 - Normalizacao de fontes do Assistente IA

Estado: implementado na API e interface.

Alteracoes realizadas:

1. Criado `backend/ciso_assistant/services/source_normalizer.py` para normalizar fontes heterogeneas num contrato unico: `title`, `source_type`, `source_ref`, `content_excerpt`, `score`, `framework` e `control_code`.
2. Atualizado `QueryOrchestrator` para normalizar fontes em tres caminhos: consultas estruturadas por ORM, priorizacao de vulnerabilidades e RAG semantico.
3. Atualizado `frontend/src/lib/chatApi.ts` com os tipos `ChatSource` e `ChatResponse`.
4. Reescrita a pagina `frontend/src/pages/Assistant.tsx` para apresentar fontes como cartoes rastreaveis com tipo, referencia, excerto e score.
5. Atualizado `frontend/src/components/chat/ChatWidget.tsx` para usar `chatApi.ask`, timestamps e o novo contrato de mensagens.

Notas de verificacao:

1. O build filtrado nao reportou erros novos em `Assistant`, `chatApi` ou `ChatWidget`.
2. O build global continua a falhar por erros pre-existentes noutras areas.
3. O backend ainda nao pode ser validado com `manage.py check` enquanto o pacote `pgvector` nao estiver instalado no ambiente virtual.

### Intervencao 4 - Validacao humana e audit trail inicial

Estado: implementado como versao minima.

Alteracoes realizadas:

1. Criado modelo `DecisionRecord` em `backend/governance/models/decision.py` para registar decisoes humanas sobre recomendacoes, vulnerabilidades, riscos ou gaps.
2. Criada migration `backend/governance/migrations/0018_decisionrecord.py`.
3. Exposto o modelo na API atraves de `DecisionRecordSerializer` e `DecisionRecordViewSet`, com filtros por `decision_type`, `decision`, `target_type` e `target_id`.
4. Registado endpoint `/api/governance/decision-records/`.
5. Adicionados tipos e metodos em `frontend/src/lib/governanceApi.ts`.
6. Integrada validacao humana na pagina `frontend/src/pages/risk/RiskPrioritization.tsx`, permitindo aceitar, diferir ou rejeitar recomendacoes com justificacao.

Notas de verificacao:

1. Os ficheiros Python alterados compilam com `py_compile`.
2. O build filtrado nao reportou erros novos em `RiskPrioritization`, `governanceApi` ou `DecisionRecord`.
3. A migration ainda precisa de ser aplicada num ambiente backend funcional.
4. Esta versao inicial regista a decisao, scores e fonte da recomendacao; ainda nao cria automaticamente um plano de tratamento ou acao de melhoria.
