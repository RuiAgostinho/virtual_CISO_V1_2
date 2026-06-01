import logging
from typing import Any, Dict

from django.conf import settings

from ciso_assistant.services.governance_context_adapter import GovernanceContextAdapter
from ciso_assistant.services.llm_router import LLMRouter
from ciso_assistant.services.ollama_client import OllamaClient
from ciso_assistant.services.prompt_builder import PromptBuilder
from ciso_assistant.services.semantic_retrieval import SemanticRetrievalService
from ciso_assistant.services.source_normalizer import SourceNormalizer
from ciso_assistant.services.structured_service import StructuredQueryService

logger = logging.getLogger(__name__)


class QueryOrchestrator:
    """
    Main entry point for the Hybrid Virtual CISO reasoning framework.
    """

    @staticmethod
    def _insufficient_rag_response(task_type: str, confidence: float) -> Dict[str, Any]:
        return {
            "task_type": task_type,
            "confidence": confidence,
            "used_rag": True,
            "model_used": "rag_guardrail",
            "sources": [],
            "response": (
                "De acordo com os registos atuais da organizacao, nao possuo dados "
                "suficientes para responder com seguranca a essa pergunta."
            ),
        }

    @staticmethod
    def _build_vulnerability_prioritization_fallback(dtos: list) -> str:
        if not dtos:
            return "Nao existem vulnerabilidades novas/abertas priorizadas neste momento para os filtros atuais."

        lines = [
            "## Prioridade de vulnerabilidades",
            "",
            (
                "Ranking oficial deterministico da plataforma, com base em CVSS, EPSS, KEV, "
                "criticidade do ativo, exposicao, valor de negocio, mecanismos, evidencias "
                "e risco residual. O EPSS e o sinal preditivo externo ativo; o XGBoost+SHAP "
                "interno permanece preparado para ativacao governada quando houver historico suficiente."
            ),
            "",
            "### Top 10",
        ]

        for dto in dtos[:10]:
            reasons = dto.risk_reasons[:2] + dto.remediation_reasons[:1]
            governance = dto.governance_context or {}
            controls = governance.get("internal_control_items") or []
            mechanisms = governance.get("mechanism_items") or []
            evidences = governance.get("evidence_items") or []
            control_text = ", ".join(f"{item.get('code')} - {item.get('title')}" for item in controls[:2])
            mechanism_text = ", ".join(
                f"{item.get('title')} ({item.get('implementation_status')})" for item in mechanisms[:2]
            )
            evidence_text = ", ".join(f"{item.get('title')} ({item.get('status')})" for item in evidences[:2])
            lines.append(
                (
                    f"- #{dto.rank} {dto.cve_id} no ativo {dto.asset.name}: "
                    f"prioridade {dto.priority_score}/100, risco {dto.risk_score}/100, "
                    f"remediacao {dto.remediation_score}/100. "
                    f"Justificacao: {'; '.join(reasons)}. "
                    f"Controlos/mecanismos: {control_text or 'sem controlo interno aprovado'}; "
                    f"{mechanism_text or 'sem mecanismo aprovado'}. "
                    f"Evidencias: {evidence_text or 'sem evidencia valida'}. "
                    f"Acao: {dto.recommended_action}"
                )
            )

        lines.append(
            "\n### Recomendacao executiva\n"
            "Comeca pelo primeiro item do ranking e confirma owner, janela de correcao, "
            "mitigacao temporaria e evidencia de fecho. Se dois itens tiverem CVSS igual, "
            "a prioridade e explicada pelos fatores organizacionais: exposicao, criticidade, "
            "KEV/EPSS e estado das mitigacoes."
        )
        return "\n".join(lines)

    @staticmethod
    def _source_line(chunk: dict, index: int) -> str:
        title = chunk.get("title") or "Fonte"
        framework = chunk.get("framework") or ""
        control_code = chunk.get("control_code") or ""
        source_ref = chunk.get("source_ref") or chunk.get("id") or ""
        metadata = chunk.get("metadata") if isinstance(chunk.get("metadata"), dict) else {}
        citation = metadata.get("citation") or ""
        parts = [str(title)]
        if citation:
            parts.append(str(citation))
        if framework or control_code:
            parts.append(f"{framework} {control_code}".strip())
        if source_ref:
            parts.append(f"ref. {source_ref}")
        return f"[Fonte {index}] " + " - ".join(part for part in parts if part)

    @staticmethod
    def _short_source_text(chunk: dict, limit: int = 260) -> str:
        text = (
            chunk.get("content_excerpt")
            or chunk.get("chunk_text")
            or chunk.get("content")
            or chunk.get("description")
            or ""
        )
        text = " ".join(str(text).split())
        if len(text) <= limit:
            return text
        return text[: limit - 3].rstrip() + "..."

    @classmethod
    def _build_compliance_rag_fallback(
        cls,
        query: str,
        retrieved_chunks: list[dict],
        history: list | None = None,
    ) -> str:
        if not retrieved_chunks:
            return cls._insufficient_rag_response("control_mapping", 0.4)["response"]

        external_types = {"technical_regulation", "control", "framework_mapping", "compliance_gap"}
        internal_types = {
            "internal_control",
            "governance_document",
            "governance_section",
            "policy_internal_control",
            "internal_control_mechanism",
        }
        evidence_types = {"evidence_item", "evidence"}
        action_types = {"governance_action", "compliance_gap"}

        external = [chunk for chunk in retrieved_chunks if chunk.get("source_type") in external_types]
        external.sort(key=lambda chunk: 0 if chunk.get("source_type") == "technical_regulation" else 1)
        internal = [chunk for chunk in retrieved_chunks if chunk.get("source_type") in internal_types]
        evidence = [chunk for chunk in retrieved_chunks if chunk.get("source_type") in evidence_types]
        actions = [chunk for chunk in retrieved_chunks if chunk.get("source_type") in action_types]

        normalized_query = LLMRouter.normalize_text(query)
        note = ""
        if "nis2" in normalized_query and "artigo" in normalized_query and "21" in normalized_query:
            note = (
                "\n\nNota de leitura: interpretei a pergunta como Artigo 21.º da Diretiva NIS2 "
                "(medidas de gestao de riscos de ciberseguranca, incluindo cadeia de abastecimento), "
                "nao como o Artigo 21.º do DL 125/2025, que tem outro objeto."
            )

        lines = [
            "## Leitura de conformidade",
            "",
            "Resposta gerada a partir do contexto RAG recuperado. O LLM nao respondeu dentro do limite operacional, por isso a plataforma apresenta uma sintese deterministica e auditavel das fontes encontradas.",
            note.strip(),
            "",
            "### 1. O que diz o requisito",
        ]

        if external:
            for index, chunk in enumerate(external[:4], 1):
                lines.append(f"- {cls._source_line(chunk, index)}: {cls._short_source_text(chunk)}")
        else:
            lines.append("- Nao foi encontrada uma fonte normativa externa direta para esta pergunta.")

        lines.extend(["", "### 2. Controlos e mapeamentos da organizacao"])
        if internal:
            for index, chunk in enumerate(internal[:5], 1):
                lines.append(f"- {cls._source_line(chunk, index)}: {cls._short_source_text(chunk)}")
        else:
            lines.append("- Nao foram encontrados controlos internos aprovados diretamente ligados a esta pergunta.")

        lines.extend(["", "### 3. Evidencias existentes"])
        if evidence:
            for index, chunk in enumerate(evidence[:4], 1):
                lines.append(f"- {cls._source_line(chunk, index)}: {cls._short_source_text(chunk)}")
        else:
            lines.append(
                "- Nao foram encontradas evidencias reutilizaveis diretamente recuperadas para sustentar conformidade plena."
            )

        lines.extend(["", "### 4. Lacunas e proxima acao"])
        if actions:
            for index, chunk in enumerate(actions[:5], 1):
                lines.append(f"- {cls._source_line(chunk, index)}: {cls._short_source_text(chunk)}")
        else:
            lines.append("- Sem gap explicito recuperado, mas a ausencia de evidencia direta deve ser tratada como ponto de verificacao.")

        has_gap = any(chunk.get("source_type") == "compliance_gap" for chunk in retrieved_chunks)
        has_evidence = bool(evidence)
        asks_critical_gap = "lacuna" in normalized_query and any(
            term in normalized_query for term in ["critica", "critico", "mais"]
        )
        if has_gap or not has_evidence:
            conclusion = (
                "Conclusao: com os dados atuais, nao trataria isto como conformidade plenamente demonstrada. "
                "O proximo passo e validar o controlo interno de fornecedores/cadeia de abastecimento, associar mecanismos aprovados "
                "e anexar evidencia testavel antes de usar esta resposta como prova de auditoria."
            )
        else:
            conclusion = (
                "Conclusao: existem controlos e evidencia recuperados, mas a decisao formal deve validar se cobrem todo o ambito do requisito."
            )
        if asks_critical_gap:
            conclusion = (
                "Lacuna mais critica: ausencia de evidencia testavel diretamente ligada ao controlo de fornecedores/cadeia de abastecimento. "
                "Acao sugerida: criar ou validar evidencia de due diligence, requisitos contratuais de seguranca, avaliacao periodica de fornecedores "
                "e mapeamento aprovado para NIS2-04-01 antes de declarar conformidade. "
                + conclusion
            )
        lines.extend(["", conclusion])
        return "\n".join(line for line in lines if line is not None)

    @staticmethod
    def _looks_like_prioritization_followup(query: str, history: list | None) -> bool:
        if not history:
            return False
        normalized_query = LLMRouter.normalize_text(query)
        has_followup_terms = any(
            term in normalized_query
            for term in ["entre essas", "entre estes", "lacuna", "mais critica", "qual delas", "por onde"]
        )
        if not has_followup_terms:
            return False
        history_text = " ".join(str(item.get("content", "")) for item in history[-4:]).lower()
        return "vulnerab" in history_text or "cve-" in history_text or "prioridade" in history_text

    @staticmethod
    def _looks_like_compliance_followup(query: str, history: list | None) -> bool:
        if not history:
            return False
        normalized_query = LLMRouter.normalize_text(query)
        has_followup_terms = any(
            term in normalized_query
            for term in ["lacuna", "critica", "critico", "essas", "esses", "entre", "qual", "acao", "seguinte"]
        )
        if not has_followup_terms:
            return False
        history_text = LLMRouter.normalize_text(
            " ".join(str(item.get("content", "")) for item in history[-6:])
        )
        return any(term in history_text for term in ["nis2", "iso", "conformidade", "controlo", "cadeia de abastecimento"])

    @staticmethod
    def _prioritization_filters_from_query(query: str, filters: dict | None = None) -> dict:
        payload = dict(filters or {})
        normalized_query = LLMRouter.normalize_text(query)
        if "semana" in normalized_query or "7 dias" in normalized_query:
            payload.setdefault("detected_since_days", 7)
        if "kev" in normalized_query or "exploracao conhecida" in normalized_query:
            payload.setdefault("only_known_exploited", True)
        return payload

    @staticmethod
    def _retrieval_query(query: str, history: list | None, include_history: bool) -> str:
        if not include_history or not history:
            return query
        history_text = "\n".join(str(item.get("content", "")) for item in history[-4:])
        return f"{query}\n\nContexto anterior:\n{history_text}"

    @staticmethod
    def _augment_compliance_chunks(query: str, chunks: list[dict]) -> list[dict]:
        normalized_query = LLMRouter.normalize_text(query)
        wants_nis2_supply_chain = (
            "nis2" in normalized_query
            and ("cadeia" in normalized_query or "abastecimento" in normalized_query or "fornecedor" in normalized_query)
        )
        if not wants_nis2_supply_chain:
            return chunks

        from ciso_assistant.models import KnowledgeChunk

        existing = {(item.get("source_type"), str(item.get("source_ref"))) for item in chunks or []}
        normative_chunks = (
            KnowledgeChunk.objects.filter(
                source_type="technical_regulation",
                source_ref__startswith="NIS2_2022:article-21:",
            )
            .order_by("source_ref")[:20]
        )
        exact_chunks = (
            KnowledgeChunk.objects.filter(
                framework__icontains="NIS2",
                control_code__in=["NIS2-04-01", "NIS2-04-02", "NIS2-04-03"],
            )
            .order_by("control_code", "source_type")[:6]
        )

        def priority(obj):
            metadata = obj.metadata_json or {}
            label = str(metadata.get("paragraph_label") or "")
            text = f"{obj.title} {obj.chunk_text}".lower()
            if "cadeia de abastecimento" in text or "fornecedor" in text or "prestador" in text:
                return 0
            if label in {"1", "2"}:
                return 1
            return 2

        ordered_chunks = sorted(list(normative_chunks), key=priority)[:5] + list(exact_chunks)
        enriched = []
        for obj in ordered_chunks:
            key = (obj.source_type, str(obj.source_ref))
            if key in existing:
                continue
            metadata = obj.metadata_json or {}
            enriched.append(
                {
                    "id": str(obj.id),
                    "title": obj.title,
                    "chunk_text": obj.chunk_text,
                    "source_type": obj.source_type,
                    "source_ref": obj.source_ref,
                    "framework": obj.framework,
                    "control_code": obj.control_code,
                    "score": 0.99,
                    "metadata": metadata,
                    "url": metadata.get("url") or metadata.get("source_url"),
                }
            )
            existing.add(key)
        enriched.extend(list(chunks or []))
        return GovernanceContextAdapter.deduplicate(enriched)[:10]

    @staticmethod
    def _generation_options(task_type: str, base: dict | None = None) -> dict:
        options = dict(base or {})
        options.setdefault("temperature", 0.15)

        default_predict = getattr(settings, "OLLAMA_DEFAULT_NUM_PREDICT", 220)
        task_num_predict = {
            "general_qa": 140,
            "technical_implementation": 180,
            "structured_query": 120,
            "executive_advisory": 220,
            "risk_analysis": 220,
            "control_mapping": 220,
            "evidence_drafting": 240,
            "vulnerability_prioritization": 650,
        }
        options.setdefault("num_predict", task_num_predict.get(task_type, default_predict))
        return options

    @classmethod
    def process_query(cls, query: str, history: list = None, filters: dict = None) -> Dict[str, Any]:
        logger.info("[ORCHESTRATOR] Received query: %s", query)

        routing_decision = LLMRouter.detect_task_type(query)
        task_type = routing_decision["task_type"]
        confidence = routing_decision["confidence"]
        needs_rag = routing_decision["needs_rag"]
        model = routing_decision["model_used"]

        compliance_followup = cls._looks_like_compliance_followup(query, history)

        if compliance_followup:
            task_type = "control_mapping"
            confidence = max(confidence, 0.9)
            needs_rag = True
            model = LLMRouter.select_model(task_type)
        elif task_type != "vulnerability_prioritization" and cls._looks_like_prioritization_followup(query, history):
            task_type = "vulnerability_prioritization"
            confidence = max(confidence, 0.9)
            needs_rag = True
            model = LLMRouter.select_model(task_type)

        logger.info(
            "[ORCHESTRATOR] Router Decision -> Task: %s | RAG: %s | Model: %s",
            task_type,
            needs_rag,
            model,
        )

        if task_type == "structured_query":
            struct_result = StructuredQueryService.run_structured_query(query)
            if struct_result["type"] != "unknown":
                logger.info("[ORCHESTRATOR] Structured ORM bypass succeeded.")
                return {
                    "task_type": "structured_query",
                    "confidence": 1.0,
                    "used_rag": False,
                    "model_used": "django_orm",
                    "sources": SourceNormalizer.normalize_many(
                        [
                            {
                                "title": "Consulta estruturada Django ORM",
                                "source_type": "structured_query",
                                "source_ref": struct_result["type"],
                                "content": struct_result["raw_text"],
                                "score": 1.0,
                            }
                        ]
                    ),
                    "response": struct_result["raw_text"],
                }

            logger.warning("[ORCHESTRATOR] Structured query unknown. Falling back to semantic search.")
            needs_rag = True

        if task_type == "vulnerability_prioritization":
            from risk.services.prioritization import (
                VulnerabilityContextBuilder,
                VulnerabilityPrioritizationService,
            )

            prioritization_filters = cls._prioritization_filters_from_query(query, filters)
            dtos = VulnerabilityPrioritizationService.get_top_vulnerabilities(
                limit=10,
                filters=prioritization_filters,
            )
            pt_context = VulnerabilityContextBuilder.build_llm_context(dtos)
            normalized_sources = SourceNormalizer.normalize_many(
                VulnerabilityContextBuilder.build_sources(dtos)
            )

            system_prompt = (
                "Es um Virtual CISO experiente e focado em defesa.\n"
                "Abaixo tens scorecards deterministicos de risco, remediacao e prioridade final.\n"
                "Responde em Portugues de Portugal (PT-PT), com 4 blocos obrigatorios:\n"
                "1) Top 10 vulnerabilidades; 2) Justificacao de prioridade; "
                "3) controlos/mecanismos/evidencias em falta ou existentes; 4) acao recomendada.\n"
                "Cada afirmacao sobre dados da organizacao deve estar ancorada nos dados fornecidos. "
                "Lista apenas as vulnerabilidades fornecidas no contexto. Se houver menos de 10, escreve "
                "'Top disponivel' e nao preenchas posicoes em falta. "
                "Nao inventes ativos, vulnerabilidades, controlos, mecanismos ou evidencias. "
                "Nao expliques como conduzir ataques; foca-te na correcao, mitigacao e decisao CISO."
            )
            history_text = ""
            if history:
                history_text = "\n".join(
                    f"{msg.get('role', 'user')}: {msg.get('content', '')}"
                    for msg in history[-6:]
                )
            user_prompt = (
                f"Consulta atual: '{query}'\n\n"
                f"Foram fornecidas {len(dtos)} vulnerabilidades priorizadas. Nao acrescentes outras.\n\n"
                f"Historico relevante:\n{history_text or 'Sem historico.'}\n\n"
                f"{pt_context}"
            )

            logger.info("[ORCHESTRATOR] Invoking LLM for vulnerability prioritization.")
            deterministic_summary = cls._build_vulnerability_prioritization_fallback(dtos)
            llm_response = OllamaClient.call(
                model="llama3.1:8b",
                prompt=user_prompt,
                system=system_prompt,
                options=cls._generation_options("vulnerability_prioritization"),
                timeout_seconds=getattr(
                    settings,
                    "OLLAMA_VULNERABILITY_PRIORITIZATION_TIMEOUT_SECONDS",
                    getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 180),
                ),
            )

            if OllamaClient.is_service_error(llm_response):
                logger.warning(
                    "[ORCHESTRATOR] LLM unavailable for vulnerability prioritization. Using deterministic fallback."
                )
                llm_response = deterministic_summary
            else:
                llm_response = f"{deterministic_summary}\n\n## Analise IA complementar\n{llm_response}"

            return {
                "task_type": task_type,
                "confidence": 1.0,
                "used_rag": True,
                "model_used": "llama3.1:8b",
                "sources": normalized_sources,
                "response": llm_response,
            }

        retrieved_chunks = []
        retrieval_query = cls._retrieval_query(query, history, compliance_followup)
        if needs_rag:
            governance_chunks = GovernanceContextAdapter.retrieve_internal_first(
                query=retrieval_query,
                top_k=5,
                filters=filters,
            )
            semantic_chunks = SemanticRetrievalService.semantic_search(
                query=retrieval_query,
                top_k=5,
                filters=filters,
            )
            retrieved_chunks = GovernanceContextAdapter.merge_contexts(
                governance_chunks,
                semantic_chunks,
                top_k=8,
            )
            retrieved_chunks = cls._augment_compliance_chunks(retrieval_query, retrieved_chunks)
            logger.info("[ORCHESTRATOR] Retrieved %s chunk(s) for RAG.", len(retrieved_chunks))
            if not retrieved_chunks:
                return cls._insufficient_rag_response(task_type=task_type, confidence=confidence)

        system_prompt = PromptBuilder.build_system_prompt(
            task_type=task_type,
            needs_rag=needs_rag,
            retrieved_chunks=retrieved_chunks,
        )

        user_prompt = query
        if history:
            history_text = "\n".join(
                [
                    f"{msg.get('role', 'user').capitalize()}: {msg.get('content', '')}"
                    for msg in history
                ]
            )
            user_prompt = (
                f"### CONVERSATION HISTORY:\n{history_text}\n\n"
                f"### CURRENT QUERY OVER CONTEXT:\n{query}"
            )

        logger.info("[ORCHESTRATOR] Invoking LLM (%s) text generation step...", model)
        response_text = OllamaClient.call(
            model=model,
            prompt=user_prompt,
            system=system_prompt,
            options=cls._generation_options(task_type),
            timeout_seconds=getattr(
                settings,
                "OLLAMA_ASSISTANT_TIMEOUT_SECONDS",
                getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 180),
            ),
        )
        if OllamaClient.is_service_error(response_text) and needs_rag:
            logger.warning("[ORCHESTRATOR] LLM unavailable for RAG Q&A. Using deterministic compliance fallback.")
            response_text = cls._build_compliance_rag_fallback(
                query=retrieval_query,
                retrieved_chunks=retrieved_chunks,
                history=history,
            )
        logger.info("[ORCHESTRATOR] Generation complete.")

        return {
            "task_type": task_type,
            "confidence": confidence,
            "used_rag": needs_rag,
            "model_used": model,
            "sources": SourceNormalizer.normalize_many(retrieved_chunks),
            "response": response_text,
        }
