import json
import logging
import re
import unicodedata
from typing import Any, Dict

from .ollama_client import OllamaClient

logger = logging.getLogger(__name__)


class LLMRouter:
    """
    Hybrid intent router for the Virtual CISO assistant.
    """

    MODEL_MAP = {
        "technical_implementation": "qwen2.5:7b-instruct",
        "structured_query": "qwen2.5:7b-instruct",
        "executive_advisory": "llama3.1:8b",
        "risk_analysis": "llama3.1:8b",
        "vulnerability_prioritization": "llama3.1:8b",
        "evidence_drafting": "llama3.1:8b",
        "control_mapping": "qwen2.5:7b-instruct",
        "fast_classification": "mistral:7b",
        "general_qa": "qwen2.5:7b-instruct",
    }

    RAG_DECISION_MAP = {
        "risk_analysis": True,
        "vulnerability_prioritization": False,
        "control_mapping": True,
        "evidence_drafting": True,
        "executive_advisory": True,
        "technical_implementation": False,
        "structured_query": False,
        "fast_classification": False,
        "general_qa": False,
    }

    SCORING_RULES = {
        "risk_analysis": [
            r"\b(risco|vulnerabilidade|ameaca|impacto|cve|cvss|exploit|risk|vulnerability|threat|impact)\b",
            r"\b(ataque|mitigacao|mitigar|probabilidade|attack|mitigate|mitigation)\b",
        ],
        "vulnerability_prioritization": [
            r"\b(prioriza|priorizar|top|principais|urgente|corrigir primeiro|remediar|rank|ranking)\b",
            r"\b(vulnerabilidades|vulnerabilidade|cves|cve)\b",
        ],
        "control_mapping": [
            r"\b(controlo|controlos|controle|controles|iso|nist|nis2|qnrc|compliance|requisito|norma|framework|standard)\b",
            r"\b(gap|auditoria|audit|iso27001|iso27002|nistcsf|27001|27002|cis|mapeia|mapear|relaciona|mitiga|mitigam)\b",
        ],
        "executive_advisory": [
            r"\b(estrategia|ciso|governacao|politica|resumo|direcao|strategy|governance|policy|executive|board)\b",
            r"\b(recomendacao|budget|orcamento|roi|kpi|metricas globais|recommendation)\b",
        ],
        "technical_implementation": [
            r"\b(django|api|sql|serializer|backend|python|codigo|script|implementar|code|endpoint)\b",
            r"\b(orm|database|bash|linux|docker|configurar|deploy|server)\b",
        ],
        "evidence_drafting": [
            r"\b(evidencia|evidencias|comprovativo|log|report|relatorio|ticket|evidence|proof)\b",
            r"\b(escreve|redige|cria|gerar|gera|prepara|draft|write)\b",
        ],
        "fast_classification": [
            r"\b(classifica|categoriza|ordena|sort|classify|prioritize)\b",
        ],
    }

    STRUCTURED_AGGREGATION_PATTERNS = [
        r"\b(quantos|quantas|numero de|total de|percentagem|media|top \d+)\b",
        r"\b(how many|number of|total|percentage|average)\b",
    ]
    STRUCTURED_LIST_PATTERNS = [r"\b(quais|mostra|mostrar|lista|listar|show|list)\b"]
    STRUCTURED_DOMAIN_PATTERNS = [
        r"\b(ativo|ativos|ip|ips|vulnerabilidade|vulnerabilidades|falha|falhas|controlo|controlos|controle|controles|politica|politicas|sgsi|gap|gaps|desvio|desvios|conformidade|framework|frameworks)\b",
    ]
    STRUCTURED_POLICY_PATTERNS = [
        r"\b(politica|politicas|sgsi)\b",
        r"\b(ativa|ativas|ativo|ativos|rascunho|revisao|obsoleta|obsoletas|existe|existem|tenho|alguma|quais|quantas|total)\b",
    ]
    STRUCTURED_COMPLIANCE_PATTERNS = [
        r"\b(score|pontuacao|percentagem|gap|gaps|desvio|desvios|conformidade|pior|piores|fraco|fracos|baixo|baixos|estado)\b",
        r"\b(framework|frameworks|iso|iso27001|iso27002|nist|nistcsf|qnrc|27001|27002|csf|nis2|controlo|controlos|compliance|conformidade)\b",
    ]
    PRIORITIZATION_PATTERNS = [
        r"\b(prioriza|priorizar|urgente|urgentes|corrigir primeiro|corrigir em primeiro|remediar primeiro|prioridade|por onde comeco|por onde começo|comeco|começo)\b",
        r"\b(vulnerabilidade|vulnerabilidades|cve|cves)\b",
    ]
    GENERAL_QA_PATTERNS = [
        r"\b(o que e|o que faz|explica|define|conceito de)\b",
    ]
    GENERAL_QA_TOPICS = [
        r"\b(ciso|rag|rag hibrido|llm|ollama|pgvector|sgsi)\b",
    ]

    @classmethod
    def normalize_text(cls, text: str) -> str:
        if not text:
            return ""
        text = text.lower().strip()
        return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")

    @classmethod
    def detect_structured_query(cls, normalized_query: str) -> bool:
        if all(re.search(pattern, normalized_query) for pattern in cls.STRUCTURED_POLICY_PATTERNS):
            return True

        if all(re.search(pattern, normalized_query) for pattern in cls.STRUCTURED_COMPLIANCE_PATTERNS):
            return True

        if any(re.search(pattern, normalized_query) for pattern in cls.STRUCTURED_AGGREGATION_PATTERNS):
            return True
        has_list_intent = any(re.search(pattern, normalized_query) for pattern in cls.STRUCTURED_LIST_PATTERNS)
        has_known_domain = any(re.search(pattern, normalized_query) for pattern in cls.STRUCTURED_DOMAIN_PATTERNS)
        return has_list_intent and has_known_domain

    @classmethod
    def detect_vulnerability_prioritization(cls, normalized_query: str) -> bool:
        return all(re.search(pattern, normalized_query) for pattern in cls.PRIORITIZATION_PATTERNS)

    @classmethod
    def detect_general_concept_query(cls, normalized_query: str) -> bool:
        has_concept_intent = any(re.search(pattern, normalized_query) for pattern in cls.GENERAL_QA_PATTERNS)
        has_general_topic = any(re.search(pattern, normalized_query) for pattern in cls.GENERAL_QA_TOPICS)
        mentions_internal_context = any(
            token in normalized_query
            for token in ["meu ", "minha ", "na plataforma", "na organizacao", "dados", "ativos", "controlos", "vulnerabilidades"]
        )
        return has_concept_intent and has_general_topic and not mentions_internal_context

    @classmethod
    def score_rules(cls, normalized_query: str) -> Dict[str, float]:
        scores = {k: 0.0 for k in cls.MODEL_MAP.keys()}
        for task_type, patterns in cls.SCORING_RULES.items():
            hit_count = sum(1 for pattern in patterns if re.search(pattern, normalized_query))
            if hit_count > 0:
                scores[task_type] += hit_count * 0.4
        return scores

    @classmethod
    def classify_with_llm(cls, query: str) -> Dict[str, Any]:
        classifier_system = (
            "You are a Senior Cybersecurity Intent Router supporting English and Portuguese.\n"
            "Classify the exact user intent into ONE of the following types:\n"
            "- structured_query: Counting, lists, aggregations, metrics.\n"
            "- technical_implementation: Code, SQL, API, Python, logic implementation.\n"
            "- executive_advisory: Strategic advice, policy summaries, CISO vision.\n"
            "- risk_analysis: Vulnerability, threat level, asset criticality.\n"
            "- control_mapping: Linking requirements to NIST/ISO controls.\n"
            "- evidence_drafting: Creating audit logs or proof of security.\n"
            "- fast_classification: Sorting or prioritizing items.\n"
            "- general_qa: Basic general chat.\n\n"
            "Return EXACTLY this JSON format:\n"
            "{\n"
            "  \"task_type\": \"...\",\n"
            "  \"confidence\": 0.0 to 1.0,\n"
            "  \"reason\": \"...\"\n"
            "}"
        )
        result = OllamaClient.generate_json(
            model="mistral:7b",
            prompt=f'Classify this query: "{query}"',
            system=classifier_system,
            options={"temperature": 0.1},
        )
        if "error" in result:
            logger.error("[LLM_ROUTER] Classification failed: %s", result["error"])
            return {"task_type": "general_qa", "confidence": 0.0, "reason": "LLM classifier unavailable"}

        task_type = result.get("task_type", "general_qa")
        try:
            confidence = float(result.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        return {"task_type": task_type, "confidence": confidence, "reason": result.get("reason", "LLM classified")}

    @classmethod
    def select_model(cls, task_type: str) -> str:
        return cls.MODEL_MAP.get(task_type, "qwen2.5:7b-instruct")

    @classmethod
    def detect_task_type(cls, query: str) -> Dict[str, Any]:
        normalized = cls.normalize_text(query)
        scores = cls.score_rules(normalized)

        if cls.detect_vulnerability_prioritization(normalized):
            task_type = "vulnerability_prioritization"
            decision = {
                "task_type": task_type,
                "confidence": 1.0,
                "needs_rag": cls.RAG_DECISION_MAP[task_type],
                "reason": "Strict internal rule: vulnerability prioritization query.",
                "model_used": cls.select_model(task_type),
                "decision_source": "prioritization_rule",
            }
            cls._log_decision(query, normalized, scores, decision)
            return decision

        if cls.detect_general_concept_query(normalized):
            task_type = "general_qa"
            decision = {
                "task_type": task_type,
                "confidence": 1.0,
                "needs_rag": cls.RAG_DECISION_MAP[task_type],
                "reason": "Strict internal rule: conceptual general question.",
                "model_used": cls.select_model(task_type),
                "decision_source": "general_concept_rule",
            }
            cls._log_decision(query, normalized, scores, decision)
            return decision

        if cls.detect_structured_query(normalized):
            task_type = "structured_query"
            decision = {
                "task_type": task_type,
                "confidence": 1.0,
                "needs_rag": cls.RAG_DECISION_MAP[task_type],
                "reason": "Strict internal rule: structured data query.",
                "model_used": cls.select_model(task_type),
                "decision_source": "structured_rule",
            }
            cls._log_decision(query, normalized, scores, decision)
            return decision

        best_task, best_score = max(scores.items(), key=lambda item: item[1])
        if best_score >= 0.4:
            decision = {
                "task_type": best_task,
                "confidence": best_score,
                "needs_rag": cls.RAG_DECISION_MAP.get(best_task, False),
                "reason": f"Rule match ({best_score:.1f})",
                "model_used": cls.select_model(best_task),
                "decision_source": "rule_engine",
            }
            cls._log_decision(query, normalized, scores, decision)
            return decision

        llm_decision = cls.classify_with_llm(query)
        task_type = llm_decision["task_type"]
        confidence = llm_decision["confidence"]
        if task_type not in cls.MODEL_MAP or confidence < 0.45:
            task_type = "general_qa"

        decision = {
            "task_type": task_type,
            "confidence": confidence,
            "needs_rag": cls.RAG_DECISION_MAP.get(task_type, False),
            "reason": f"LLM match: {llm_decision['reason']}",
            "model_used": cls.select_model(task_type),
            "decision_source": "llm_classifier",
        }
        cls._log_decision(query, normalized, scores, decision)
        return decision

    @classmethod
    def _log_decision(cls, query: str, normalized: str, scores: Dict[str, float], decision: Dict[str, Any]):
        log_entry = {
            "query": query,
            "normalized": normalized,
            "scores": scores,
            "selected_task": decision["task_type"],
            "confidence": decision["confidence"],
            "source": decision["decision_source"],
            "model": decision["model_used"],
            "rag_enabled": decision["needs_rag"],
        }
        logger.info("ROUTER_DECISION: %s", json.dumps(log_entry, ensure_ascii=False))
