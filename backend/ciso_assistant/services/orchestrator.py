import logging
from typing import Dict, Any

from ciso_assistant.services.llm_router import LLMRouter
from ciso_assistant.services.semantic_retrieval import SemanticRetrievalService
from ciso_assistant.services.prompt_builder import PromptBuilder
from ciso_assistant.services.ollama_client import OllamaClient
from ciso_assistant.services.structured_service import StructuredQueryService
from ciso_assistant.services.source_normalizer import SourceNormalizer

logger = logging.getLogger(__name__)

class QueryOrchestrator:
    """
    Main entry point for the Hybrid Virtual CISO Reasoning Framework.
    Connects:
    1. Intent Classification Router
    2. Structured Database Queries (ORM)
    3. Semantic RAG Fetching (pgvector)
    4. Dynamic Prompt Building
    5. Final LLM Generation
    """

    @classmethod
    def process_query(cls, query: str, history: list = None, filters: dict = None) -> Dict[str, Any]:
        """
        Executes the intelligent pipeline end-to-end.
        """
        logger.info(f"[ORCHESTRATOR] Received query: {query}")
        
        # 1. Intent Detection
        routing_decision = LLMRouter.detect_task_type(query)
        task_type = routing_decision["task_type"]
        confidence = routing_decision["confidence"]
        needs_rag = routing_decision["needs_rag"]
        model = routing_decision["model_used"]

        logger.info(f"[ORCHESTRATOR] Router Decision -> Task: {task_type} | RAG: {needs_rag} | Model: {model}")

        # 2. Structured Data Bypass (Fast-path execution)
        if task_type == "structured_query":
            # Direct hit to ORM for counts/averages, skipping LLM hallucinations
            struct_result = StructuredQueryService.run_structured_query(query)
            if struct_result["type"] != "unknown":
                logger.info("[ORCHESTRATOR] Structured SQL Bypass succeeded.")
                return {
                    "task_type": "structured_query",
                    "confidence": 1.0,
                    "used_rag": False,
                    "model_used": "django_orm",
                    "sources": SourceNormalizer.normalize_many([{
                        "title": "Consulta estruturada Django ORM",
                        "source_type": "structured_query",
                        "source_ref": struct_result["type"],
                        "content": struct_result["raw_text"],
                        "score": 1.0,
                    }]),
                    "response": struct_result["raw_text"]
                }
            else:
                # If structured parsing failed to find exact matches, fallback to general context search
                logger.warning("[ORCHESTRATOR] Structured SQL failed. Falling back to semantic search.")
                needs_rag = True

        # 3. Vulnerability Prioritization Bypass
        if task_type == "vulnerability_prioritization":
            from risk.services.prioritization import VulnerabilityPrioritizationService, VulnerabilityContextBuilder
            
            # 1. Obter Verdade Priorizada
            dtos = VulnerabilityPrioritizationService.get_top_vulnerabilities(limit=5)
            
            logger.info("=========== [DEBUG] TOP VULNERABILIDADES ===========")
            for d in dtos:
                logger.info(f"RANK #{d.rank}: {d.cve_id} (Prioridade: {d.priority_score}) - Resumo: {d.priority_summary}")
                
            pt_context = VulnerabilityContextBuilder.build_llm_context(dtos)
            logger.info(f"=========== [DEBUG] CONTEXTO ENVIADO ===========\n{pt_context}")
            
            # 2. Instruir o modelo Llama3 (Sem termos ofensivos para evitar guardrails do LLM)
            system_prompt = (
                "És um experiente Virtual CISO que defende a empresa.\n"
                "Abaixo terás 3 Scorecards matemáticos separados: Risco, Remediação e a Prioridade Final calculada pela plataforma.\n"
                "Em Português de Portugal (PT-PT), justifica o plano de ação e de defesa (remediação) para o IT, "
                "usando a linguagem Executiva fornecida nos Data Points.\n"
                "NÃO fales sobre como conduzir ataques. Foca-te na Resolução / Mitigação dos problemas apresentados."
            )
            user_prompt = f"Consulta atual: '{query}'\n\n{pt_context}"
            
            logger.info(f"=========== [DEBUG] SYSTEM PROMPT ===========\n{system_prompt}")
            logger.info("[ORCHESTRATOR] Invoking LLM for Vulnerability Prioritization...")
            llm_response = OllamaClient.call(
                model="llama3.1:8b", 
                prompt=user_prompt, 
                system=system_prompt,
                options={"temperature": 0.15}
            )
            logger.info(f"=========== [DEBUG] LLM RESPOSTA ===========\n{llm_response}")
            
            # Format UI sources to look like normal chunks so the Frontend parser doesn't choke object-Object
            ui_sources = []
            for d in dtos:
                ui_sources.append({
                    "title": f"Rank #{d.rank}: {d.cve_id} ({d.title})",
                    "source_type": "vulnerability_prioritization",
                    "source_ref": f"asset:{d.asset.id}; vulnerability:{d.vulnerability_id}",
                    "content": f"Prioridade: {d.priority_score}/100 | Risco: {d.risk_score}/100 | Remediacao: {d.remediation_score}/100 | {d.priority_summary} | {', '.join(d.risk_reasons + d.remediation_reasons)}",
                    "score": d.priority_score,
                })
            
            return {
                "task_type": task_type,
                "confidence": 1.0,
                "used_rag": False,
                "model_used": "llama3.1:8b",
                "sources": SourceNormalizer.normalize_many(ui_sources),
                "response": llm_response
            }

        # 3. Semantic Retrieval (pgvector)
        retrieved_chunks = []
        if needs_rag:
            retrieved_chunks = SemanticRetrievalService.semantic_search(
                query=query,
                top_k=5,
                filters=filters
            )

        # 4. Hybrid Context Prompt Assembly
        system_prompt = PromptBuilder.build_system_prompt(
            task_type=task_type,
            needs_rag=needs_rag,
            retrieved_chunks=retrieved_chunks
        )

        user_prompt = query
        if history:
            # Build conversation tail context
            history_text = "\n".join([f"{msg.get('role', 'user').capitalize()}: {msg.get('content', '')}" for msg in history])
            user_prompt = f"### CONVERSATION HISTORY:\n{history_text}\n\n### CURRENT QUERY OVER CONTEXT:\n{query}"

        # 5. Final LLM Inference
        logger.info(f"[ORCHESTRATOR] Invoking LLM ({model}) text generation step...")
        response_text = OllamaClient.call(
            model=model,
            prompt=user_prompt,
            system=system_prompt,
            options={"temperature": 0.15}  # Low temp for focused enterprise data
        )
        logger.info("[ORCHESTRATOR] Generation complete.")

        return {
            "task_type": task_type,
            "confidence": confidence,
            "used_rag": needs_rag,
            "model_used": model,
            "sources": SourceNormalizer.normalize_many(retrieved_chunks),
            "response": response_text
        }


