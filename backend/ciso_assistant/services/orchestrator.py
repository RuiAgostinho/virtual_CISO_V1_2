import logging
from typing import Any, Dict

from django.conf import settings

from ciso_assistant.services.llm_router import LLMRouter
from ciso_assistant.services.ollama_client import OllamaClient
from ciso_assistant.services.prompt_builder import PromptBuilder
from ciso_assistant.services.governance_context_adapter import GovernanceContextAdapter
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
                "De acordo com os registos atuais da organização, não possuo dados "
                "suficientes para responder com segurança a essa pergunta."
            ),
        }

    @staticmethod
    def _build_vulnerability_prioritization_fallback(dtos: list) -> str:
        if not dtos:
            return "Não existem vulnerabilidades priorizadas neste momento."

        lines = [
            "Plano de ação prioritário com base no ranking determinístico da plataforma:",
        ]

        for dto in dtos[:5]:
            reasons = dto.risk_reasons[:2] + dto.remediation_reasons[:1]
            lines.append(
                (
                    f"- #{dto.rank} {dto.cve_id} no ativo {dto.asset.name}: "
                    f"prioridade {dto.priority_score}/100, risco {dto.risk_score}/100 "
                    f"e remediação {dto.remediation_score}/100. "
                    f"Justificação: {'; '.join(reasons)}."
                )
            )

        lines.append(
            "Recomendação: atuar primeiro sobre os itens de topo, validando patching, "
            "mitigações disponíveis e impacto no negócio."
        )
        return "\n".join(lines)

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
            "vulnerability_prioritization": 260,
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

            dtos = VulnerabilityPrioritizationService.get_top_vulnerabilities(limit=5)
            pt_context = VulnerabilityContextBuilder.build_llm_context(dtos)

            system_prompt = (
                "És um Virtual CISO experiente e focado em defesa.\n"
                "Abaixo tens scorecards matemáticos de risco, remediação e prioridade final.\n"
                "Em Português de Portugal (PT-PT), justifica o plano de ação para IT e gestão, "
                "usando a linguagem executiva fornecida nos dados.\n"
                "Não expliques como conduzir ataques. Foca-te na resolução e mitigação."
            )
            user_prompt = f"Consulta atual: '{query}'\n\n{pt_context}"

            logger.info("[ORCHESTRATOR] Invoking LLM for vulnerability prioritization.")
            llm_response = OllamaClient.call(
                model="llama3.1:8b",
                prompt=user_prompt,
                system=system_prompt,
                options=cls._generation_options("vulnerability_prioritization"),
                timeout_seconds=180,
            )

            if OllamaClient.is_service_error(llm_response):
                logger.warning(
                    "[ORCHESTRATOR] LLM unavailable for vulnerability prioritization. Using deterministic fallback."
                )
                llm_response = cls._build_vulnerability_prioritization_fallback(dtos)

            ui_sources = [
                {
                    "title": f"Rank #{dto.rank}: {dto.cve_id} ({dto.title})",
                    "source_type": "vulnerability_prioritization",
                    "source_ref": f"asset:{dto.asset.id}; vulnerability:{dto.vulnerability_id}",
                    "content": (
                        f"Prioridade: {dto.priority_score}/100 | "
                        f"Risco: {dto.risk_score}/100 | "
                        f"Remediação: {dto.remediation_score}/100 | "
                        f"{dto.priority_summary} | "
                        f"{', '.join(dto.risk_reasons + dto.remediation_reasons)}"
                    ),
                    "score": dto.priority_score,
                }
                for dto in dtos
            ]

            return {
                "task_type": task_type,
                "confidence": 1.0,
                "used_rag": False,
                "model_used": "llama3.1:8b",
                "sources": SourceNormalizer.normalize_many(ui_sources),
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
