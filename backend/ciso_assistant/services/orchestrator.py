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
                "Ranking deterministico da plataforma, com base em CVSS, EPSS, KEV, "
                "criticidade do ativo, exposicao, valor de negocio, mecanismos, evidencias "
                "e risco residual."
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
    def _prioritization_filters_from_query(query: str, filters: dict | None = None) -> dict:
        payload = dict(filters or {})
        normalized_query = LLMRouter.normalize_text(query)
        if "semana" in normalized_query or "7 dias" in normalized_query:
            payload.setdefault("detected_since_days", 7)
        if "kev" in normalized_query or "exploracao conhecida" in normalized_query:
            payload.setdefault("only_known_exploited", True)
        return payload

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

        if task_type != "vulnerability_prioritization" and cls._looks_like_prioritization_followup(query, history):
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
                timeout_seconds=240,
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
        if needs_rag:
            governance_chunks = GovernanceContextAdapter.retrieve_internal_first(
                query=query,
                top_k=5,
                filters=filters,
            )
            semantic_chunks = SemanticRetrievalService.semantic_search(
                query=query,
                top_k=5,
                filters=filters,
            )
            retrieved_chunks = GovernanceContextAdapter.merge_contexts(
                governance_chunks,
                semantic_chunks,
                top_k=8,
            )
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
