# Capítulo 5 - Demonstração e Avaliação do Virtual CISO

## 5.1. Enquadramento da avaliação

Após a conceção e desenvolvimento do artefacto, importa demonstrar e avaliar a sua capacidade para responder ao problema identificado na dissertação. No contexto da metodologia de Design Science Research, a avaliação não se limita à verificação técnica de componentes isoladas, mas procura analisar em que medida o artefacto desenvolvido cumpre os objetivos definidos, suporta os fluxos pretendidos e produz resultados úteis, rastreáveis e coerentes para o domínio de Governação, Risco e Conformidade em cibersegurança.

Neste trabalho, a avaliação do Virtual CISO foi conduzida em contexto de prova de conceito, incidindo sobre a plataforma como um todo e não apenas sobre a componente de Inteligência Artificial. Assim, a análise considera tanto os módulos funcionais de inventário, risco, conformidade, governação e apoio à decisão, como a camada de IA generativa e RAG híbrido que complementa esses módulos. Esta opção é coerente com a natureza do artefacto: o valor do sistema não decorre apenas do uso de modelos de linguagem, mas sobretudo da integração entre dados estruturados, mecanismos analíticos, regras determinísticas, recuperação semântica e interface orientada à decisão.

Deste modo, o presente capítulo avalia o Virtual CISO segundo quatro perspetivas complementares:

- capacidade de integrar informação dispersa de diferentes dimensões de GRC;
- capacidade de produzir resultados acionáveis para risco, conformidade e priorização;
- capacidade de justificar e rastrear recomendações e respostas;
- capacidade de suportar interação em linguagem natural através de uma componente de IA híbrida.

## 5.2. Estratégia de demonstração e avaliação

A demonstração do artefacto foi realizada através de cenários representativos de utilização, construídos de forma a refletir necessidades reais de apoio ao CISO. Estes cenários incidem sobre fluxos que articulam entidades técnicas, organizacionais e normativas, permitindo observar o comportamento integrado da plataforma em tarefas como:

- consulta e gestão do inventário de ativos;
- análise de vulnerabilidades e risco associado;
- priorização de intervenções com base em múltiplas dimensões;
- avaliação de conformidade por framework;
- associação entre controlos, mecanismos, evidência e findings;
- formulação de perguntas em linguagem natural ao assistente Virtual CISO.

Do ponto de vista metodológico, a avaliação combinou observação funcional, validação técnica e testes dirigidos a componentes críticas. Em vez de adotar exclusivamente métricas clássicas de desempenho algorítmico, optou-se por uma abordagem alinhada com a natureza do artefacto, privilegiando critérios como coerência funcional, rastreabilidade, utilidade prática e adequação ao domínio.

## 5.3. Critérios de avaliação do artefacto

Para avaliar o Virtual CISO de forma consistente com os objetivos da dissertação, foram considerados os seguintes critérios:

### 5.3.1. Integração entre dimensões de GRC

O primeiro critério diz respeito à capacidade do sistema para articular informação proveniente de diferentes dimensões que, em muitas abordagens tradicionais, surgem fragmentadas. Em concreto, procurou-se avaliar se o artefacto consegue relacionar:

- ativos e software;
- vulnerabilidades e exposição;
- risco técnico e criticidade organizacional;
- controlos e mecanismos de implementação;
- evidência e findings;
- conformidade normativa e ações de melhoria.

Este critério é particularmente relevante porque uma das lacunas identificadas na revisão sistemática foi precisamente a fragmentação persistente entre governação, risco e conformidade. A avaliação do artefacto deve, por isso, demonstrar que o Virtual CISO consegue ultrapassar esta fragmentação através de um modelo de dados integrado e de fluxos operacionais coerentes.

### 5.3.2. Apoio à decisão e priorização

O segundo critério incide sobre a capacidade do sistema para transformar dados e relações em resultados acionáveis. Não basta armazenar informação: é necessário apoiar a definição de prioridades, identificar intervenções mais urgentes e disponibilizar justificações compreensíveis para as recomendações produzidas.

Neste âmbito, foram observados:

- a priorização de vulnerabilidades;
- a interpretação do risco em contexto de ativos críticos;
- a identificação de lacunas de conformidade mais relevantes;
- a geração de recomendações orientadas à ação.

### 5.3.3. Explicabilidade, rastreabilidade e auditabilidade

O terceiro critério analisa se os resultados produzidos pelo Virtual CISO podem ser compreendidos, justificados e rastreados. Esta dimensão assume particular importância num sistema orientado a GRC, uma vez que a utilidade do artefacto depende não apenas da produção de respostas ou scores, mas da capacidade de demonstrar:

- que dados influenciaram a avaliação;
- que controlos, mecanismos ou evidência foram considerados;
- que fontes documentais suportaram a resposta;
- que relações existem entre o problema identificado e a recomendação produzida.

### 5.3.4. Interação em linguagem natural e camada de IA

O quarto critério refere-se à componente de IA generativa e RAG híbrido. Neste caso, a avaliação não procura demonstrar apenas que o sistema “responde”, mas sim que encaminha corretamente perguntas, ativa o mecanismo adequado para cada caso e produz respostas alinhadas com o contexto disponível.

Assim, a camada de IA foi avaliada em função de:

- adequação do encaminhamento das perguntas;
- capacidade de distinguir consultas estruturadas de perguntas abertas;
- utilização apropriada de RAG;
- presença de fontes e contexto recuperado;
- redução de respostas genéricas ou não fundamentadas.

## 5.4. Demonstração funcional da plataforma

### 5.4.1. Inventário de ativos e base operacional

A avaliação demonstrou que a plataforma já suporta uma base operacional coerente de inventário, permitindo gerir ativos, categorias, tipos, localizações, ambientes e infraestruturas. Esta capacidade é relevante porque o inventário constitui o ponto de partida para a correlação entre exposição técnica, criticidade organizacional e risco.

Ao nível do artefacto, esta componente evidencia que o Virtual CISO não opera sobre abstrações genéricas, mas sobre entidades concretas que permitem contextualizar vulnerabilidades, software, rede, controlos e decisões.

### 5.4.2. Risco, vulnerabilidades e priorização

A plataforma demonstrou igualmente capacidade para integrar vulnerabilidades, métricas técnicas e informação contextual, suportando a priorização de intervenções. Em vez de depender exclusivamente da severidade técnica, a arquitetura implementada permite relacionar fatores como criticidade dos ativos, exposição, relevância normativa, mecanismos existentes e evidência disponível.

Esta componente reforça a contribuição do artefacto para a identificação e tratamento de risco, uma vez que aproxima a análise técnica de uma perspetiva orientada à decisão.

### 5.4.3. Governação, conformidade e evidência

A demonstração funcional mostrou também que o Virtual CISO já materializa uma lógica de conformidade contínua, associando frameworks, controlos, mecanismos, políticas, evidência e lacunas. Esta capacidade é especialmente importante porque permite avaliar conformidade de forma mais próxima da realidade operacional, em vez de se limitar a checklists estáticas.

Ao relacionar requisitos normativos com mecanismos de implementação e evidência, o artefacto aproxima-se de um modelo auditável e rastreável de apoio à conformidade.

## 5.5. Avaliação da componente de IA híbrida

### 5.5.1. Papel da componente de IA no artefacto

Embora a componente de IA seja um elemento relevante do Virtual CISO, a sua avaliação deve ser interpretada como parte de um sistema de apoio à decisão mais amplo. O assistente não substitui os motores determinísticos, nem funciona isoladamente do modelo de dados. Pelo contrário, atua como camada de interpretação, comunicação e síntese sobre informação previamente estruturada e recuperada.

Desta forma, a avaliação da IA incidiu sobre a sua integração com:

- consultas estruturadas por ORM;
- recuperação semântica de conhecimento em pgvector;
- priorização determinística de vulnerabilidades;
- construção de respostas fundamentadas com fontes.

### 5.5.2. Avaliação do LLMRouter

Uma das componentes críticas desta camada é o `LLMRouter`, responsável por classificar a intenção da pergunta e encaminhá-la para o mecanismo mais adequado. No contexto do Virtual CISO, esta decisão é particularmente importante porque influencia:

- se a pergunta deve ser respondida por consulta estruturada;
- se exige recuperação semântica via RAG;
- se deve ativar o fluxo específico de priorização;
- se pode ser tratada como pergunta geral ou técnica.

Para avaliar esta componente, foi construído um conjunto rotulado de perguntas representativas dos principais fluxos funcionais da plataforma. O dataset foi registado em [docs/llmrouter_test_queries.json](D:\virtual_ciso\virtual_CISO_V1_2\docs\llmrouter_test_queries.json:1) e a execução da avaliação foi automatizada através do comando [evaluate_llm_router.py](D:\virtual_ciso\virtual_CISO_V1_2\backend\ciso_assistant\management\commands\evaluate_llm_router.py:1).

As perguntas foram classificadas segundo dois rótulos principais:

- `expected_task_type`
- `expected_needs_rag`

O objetivo foi verificar não apenas a classe prevista, mas também a correção da decisão de ativação do RAG.

### 5.5.3. Resultados obtidos

Na configuração atual do artefacto, a avaliação inicial do `LLMRouter` produziu os seguintes resultados:

- acurácia de `task_type`: 90,48%;
- acurácia de `needs_rag`: 95,24%;
- acurácia exata (`task_type` + `needs_rag`): 90,48%.

Adicionalmente, observou-se a seguinte distribuição por fonte de decisão:

- `structured_rule`: 6 casos;
- `rule_engine`: 14 casos;
- `llm_classifier`: 1 caso.

Estes resultados sugerem que o comportamento do router é predominantemente suportado por regras e padrões definidos internamente, recorrendo ao classificador LLM apenas em casos de menor cobertura pelas regras explícitas. Esta característica é coerente com a necessidade de previsibilidade e rastreabilidade num sistema orientado a GRC.

### 5.5.4. Análise dos erros

Apesar do desempenho global positivo, a avaliação identificou dois casos relevantes de classificação incorreta.

No primeiro caso, a pergunta "Quais são as vulnerabilidades que devo corrigir primeiro?" foi classificada como `structured_query`, quando o comportamento esperado seria `vulnerability_prioritization`. Este resultado sugere uma sobreposição entre padrões de listagem estruturada e padrões de priorização, indicando a necessidade de refinar a precedência entre regras.

No segundo caso, a pergunta "O que faz um CISO?" foi classificada como `executive_advisory` com `needs_rag=True`, quando o esperado seria `general_qa` sem necessidade de contexto interno. Este erro mostra que a presença do termo "CISO" pode enviesar o router para a classe executiva, mesmo em perguntas conceptuais e genéricas.

Estes resultados são metodologicamente relevantes por duas razões. Em primeiro lugar, demonstram que o mecanismo de avaliação é capaz de identificar fragilidades reais do router. Em segundo lugar, mostram que a avaliação do artefacto não se limita a confirmar comportamentos esperados, servindo também para apoiar refinamento iterativo do sistema.

### 5.5.5. Interpretação dos resultados

No contexto desta dissertação, os resultados obtidos permitem sustentar que a arquitetura de routing adotada é funcional e adequada como prova de conceito, mas ainda suscetível de refinamento. A acurácia observada sugere que o mecanismo já é suficientemente robusto para suportar os principais fluxos do Virtual CISO, sobretudo em consultas estruturadas, mapeamento de controlos, drafting de evidência, análise de risco e questões técnicas.

Contudo, os erros identificados mostram que perguntas ambíguas ou formulações linguisticamente próximas de diferentes classes continuam a constituir um desafio. Esta limitação é expectável num sistema híbrido deste tipo e pode ser tratada através do alargamento do dataset, ajuste das regras e eventual melhoria da política de fallback para classificação por LLM.

## 5.6. Discussão global da avaliação

Os resultados observados permitem concluir que o Virtual CISO já demonstra viabilidade como artefacto de apoio à decisão, na medida em que integra múltiplas dimensões de GRC, disponibiliza fluxos funcionais coerentes e incorpora mecanismos de apoio à interpretação, rastreabilidade e recomendação.

Do ponto de vista funcional, a plataforma evidencia capacidade para representar e correlacionar ativos, vulnerabilidades, risco, controlos, mecanismos, evidência e conformidade. Do ponto de vista analítico, demonstra potencial para priorizar intervenções e apoiar decisões contextualizadas. Do ponto de vista da IA, mostra que uma abordagem híbrida, combinando regras, ORM, RAG e LLM, é mais adequada do que uma abordagem puramente generativa para o domínio em análise.

Importa, no entanto, reconhecer que esta avaliação decorre em contexto de prova de conceito. Assim, os resultados obtidos devem ser interpretados como evidência de viabilidade funcional e arquitetural, e não como validação definitiva em ambiente produtivo. Uma avaliação futura em contexto organizacional real permitiria aprofundar aspetos como robustez operacional, impacto na tomada de decisão e qualidade percebida pelos utilizadores.

## 5.7. Limitações da avaliação

A avaliação realizada apresenta algumas limitações que importa explicitar.

Em primeiro lugar, o número de queries usadas na avaliação do `LLMRouter` é ainda reduzido, o que limita a generalização estatística dos resultados. Em segundo lugar, a avaliação incidiu sobretudo sobre cenários representativos construídos para prova de conceito, não correspondendo a um estudo longitudinal em ambiente real.

Em terceiro lugar, a qualidade das respostas do assistente depende da qualidade e cobertura dos dados existentes no sistema, bem como do estado da base vetorial de conhecimento. Por essa razão, o desempenho da componente de IA deve ser entendido como dependente da maturidade global do artefacto e não apenas do modelo de linguagem utilizado.

## 5.8. Síntese do capítulo

O presente capítulo demonstrou e avaliou o Virtual CISO enquanto artefacto de apoio à decisão para CISOs, adotando uma perspetiva abrangente que incluiu módulos funcionais, mecanismos de integração, capacidade de priorização, rastreabilidade e componente de IA híbrida. Os resultados obtidos indicam que a plataforma já materializa, em contexto de prova de conceito, uma resposta consistente às lacunas identificadas na revisão sistemática, nomeadamente a fragmentação entre GRC, a dificuldade de correlacionar risco com conformidade e a necessidade de maior explicabilidade em sistemas baseados em IA.

No caso específico da componente de IA, a avaliação do `LLMRouter` mostrou resultados encorajadores, com elevada acurácia global e identificação clara de pontos de melhoria. Esta análise reforça a ideia de que a avaliação do Virtual CISO deve ser entendida como avaliação de um artefacto integrado, no qual a IA desempenha um papel relevante, mas sempre articulado com dados estruturados, lógica determinística e validação humana.
