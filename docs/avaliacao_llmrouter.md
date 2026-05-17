# Avaliação do LLMRouter

## Enquadramento

De acordo com a estrutura já definida no relatório, a descrição do `LLMRouter` deve permanecer no capítulo de conceção e arquitetura, enquanto a sua validação deve transitar para o capítulo de demonstração e avaliação do artefacto. Esta separação é metodologicamente adequada no contexto de Design Science Research, porque distingue:

- a decisão arquitetural: existência de um mecanismo de routing híbrido com regras, deteção de consultas estruturadas e fallback para classificação por LLM;
- a avaliação do artefacto: capacidade efetiva desse mecanismo para classificar corretamente perguntas representativas do domínio.

Assim, o capítulo 4 pode descrever o fluxo `pergunta -> LLMRouter -> ORM / RAG / priorização / LLM`, enquanto o capítulo 5 deve apresentar os resultados dos testes ao router.

## Objetivo da avaliação

O objetivo desta avaliação é verificar se o `LLMRouter` encaminha corretamente perguntas em linguagem natural para o tipo de processamento mais adequado, reduzindo respostas incorretas, latência desnecessária e alucinação do modelo.

Em concreto, pretende-se avaliar:

1. correção da classificação `task_type`;
2. correção da decisão `needs_rag`;
3. origem da decisão (`structured_rule`, `rule_engine`, `llm_classifier`);
4. robustez perante formulações linguísticas distintas em PT-PT.

## Dimensões avaliadas

As classes atualmente suportadas pelo router são:

- `structured_query`
- `vulnerability_prioritization`
- `control_mapping`
- `evidence_drafting`
- `executive_advisory`
- `risk_analysis`
- `technical_implementation`
- `fast_classification`
- `general_qa`

Para cada pergunta de teste, devem ser definidos pelo menos dois rótulos de referência:

- `expected_task_type`
- `expected_needs_rag`

Opcionalmente, pode ainda ser registada uma nota interpretativa para justificar o rótulo esperado.

## Dataset de avaliação

Foi criado um dataset inicial em [`D:\virtual_ciso\virtual_CISO_V1_2\docs\llmrouter_test_queries.json`](D:\virtual_ciso\virtual_CISO_V1_2\docs\llmrouter_test_queries.json:1), com perguntas representativas dos principais fluxos da plataforma:

- inventário de ativos;
- consultas de conformidade;
- priorização de vulnerabilidades;
- mapeamento de controlos;
- drafting de evidência;
- aconselhamento executivo;
- análise de risco;
- implementação técnica;
- perguntas gerais.

Este dataset deve ser entendido como um conjunto de avaliação de prova de conceito, não como benchmark universal. O seu valor metodológico está em permitir verificar o comportamento do router no contexto específico do Virtual CISO.

## Procedimento experimental

Foi criado um comando de avaliação em [`D:\virtual_ciso\virtual_CISO_V1_2\backend\ciso_assistant\management\commands\evaluate_llm_router.py`](D:\virtual_ciso\virtual_CISO_V1_2\backend\ciso_assistant\management\commands\evaluate_llm_router.py:1).

Execução base:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\backend
.venv\Scripts\python.exe manage.py evaluate_llm_router
```

Execução com detalhe completo:

```powershell
cd D:\virtual_ciso\virtual_CISO_V1_2\backend
.venv\Scripts\python.exe manage.py evaluate_llm_router --show-all
```

O comando calcula:

- acurácia de `task_type`;
- acurácia de `needs_rag`;
- acurácia exata (`task_type` + `needs_rag`);
- distribuição por fonte de decisão;
- acurácia por classe;
- matriz esperada -> prevista;
- detalhe das classificações incorretas.

## Métricas recomendadas para o capítulo 5

No capítulo de avaliação, recomenda-se apresentar pelo menos:

1. número total de perguntas avaliadas;
2. acurácia global do `task_type`;
3. acurácia global do `needs_rag`;
4. acurácia por classe;
5. exemplos de acerto e erro;
6. análise qualitativa dos erros.

Uma tabela simples pode assumir a seguinte forma:

| Query | Classe esperada | Classe prevista | RAG esperado | RAG previsto | Resultado |
|---|---|---|---|---|---|
| Quantos ativos eu tenho? | structured_query | structured_query | Não | Não | Correto |
| Que controlos ISO mitigam acessos privilegiados? | control_mapping | control_mapping | Sim | Sim | Correto |
| ... | ... | ... | ... | ... | ... |

## Texto sugerido para o capítulo de avaliação

Pode ser usado, adaptado e refinado, o seguinte texto:

> Para avaliar o mecanismo de model routing do Virtual CISO, foi construído um conjunto rotulado de perguntas representativas dos principais fluxos funcionais da plataforma, incluindo consultas estruturadas sobre inventário e conformidade, perguntas de análise de risco, priorização de vulnerabilidades, mapeamento de controlos, geração de evidência, aconselhamento executivo e questões técnicas. Cada pergunta foi associada a um `task_type` esperado e à decisão esperada de ativação ou não do RAG.
>
> A avaliação foi executada através de um comando dedicado (`evaluate_llm_router`), que aplica o `LLMRouter` a cada pergunta e compara o resultado produzido com os rótulos de referência. Foram recolhidas métricas de acurácia global, acurácia por classe, acurácia da decisão `needs_rag` e distribuição das fontes de decisão (`structured_rule`, `rule_engine`, `llm_classifier`).
>
> Esta avaliação permitiu verificar se o mecanismo de routing consegue encaminhar corretamente perguntas para consultas determinísticas por ORM, recuperação semântica por RAG, fluxo de priorização de vulnerabilidades ou geração direta por LLM. Para além da medição quantitativa, os casos de erro foram analisados qualitativamente, permitindo identificar ambiguidades linguísticas, sobreposição entre classes e oportunidades de refinamento nas regras e prompts de classificação.

## Interpretação metodológica

Este tipo de avaliação não pretende demonstrar desempenho universal de classificação, mas sim validar a adequação do router ao domínio e ao artefacto desenvolvido. No contexto desta dissertação, o foco está em verificar se o Virtual CISO encaminha corretamente perguntas reais do seu contexto operacional, reforçando:

- a coerência arquitetural da componente de IA;
- a redução de alucinação em perguntas estruturadas;
- a rastreabilidade do processo de decisão;
- a adequação da combinação entre regras, ORM, RAG e LLM.

## Próximo refinamento recomendado

Depois da avaliação inicial, recomenda-se ampliar o dataset com:

- perguntas ambíguas;
- sinónimos e variações em PT-PT;
- perguntas híbridas com mais de uma intenção;
- exemplos extraídos de uso real da interface;
- casos adversariais em que a classe correta seja difícil de decidir.

Isto permitirá transformar a avaliação de prova de conceito numa avaliação mais sólida e academicamente convincente.
