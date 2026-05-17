"""
AI recommendation for a decision context — Cap. 4.10 (RAG híbrido).

Combines two retrieval paths into one grounded prompt:
  - structured retrieval: the multidimensional score + compliance chain
    (produced by DecisionContextBuilder)
  - semantic retrieval: KnowledgeChunks via pgvector (SemanticRetrievalService)

then calls the local LLM (Ollama) to produce a PT-PT recommendation that cites
its sources by number.

Degrades gracefully: if Ollama is unreachable the result carries
available=False with a clear reason instead of raising.
"""

from __future__ import annotations

from typing import Any, Dict, List

from django.utils.timezone import now

from ciso_assistant.services.ollama_client import OllamaClient
from ciso_assistant.services.semantic_retrieval import SemanticRetrievalService
from governance.services.decision_context_builder import DecisionContextBuilder
from risk.models.vulnerability import AssetVulnerability


RECOMMENDATION_MODEL = "llama3.1:8b"

# Strings the OllamaClient returns when the LLM is unreachable / unconfigured.
_LLM_UNAVAILABLE_SENTINELS = (
    "Não foi possível contactar o serviço LLM",
    "O serviço LLM não está configurado",
)

# Trim limits so the cited source list stays readable and the prompt focused.
_MAX_SCORE_SOURCES = 3
_MAX_CHAIN_SOURCES = 4
_MAX_RAG_SOURCES = 4


class DecisionRecommendationService:
    """Public entrypoint: :meth:`generate`."""

    @classmethod
    def generate(cls, occurrence: AssetVulnerability) -> Dict[str, Any]:
        context = DecisionContextBuilder.build(occurrence)
        rag_chunks = cls._retrieve_rag(occurrence)
        sources = cls._collect_sources(context, rag_chunks)

        prompt = cls._build_prompt(context, sources)
        raw = OllamaClient.call(prompt, model=RECOMMENDATION_MODEL, temperature=0.2)

        available = bool(raw) and not any(s in raw for s in _LLM_UNAVAILABLE_SENTINELS)

        return {
            "available": available,
            "text": raw.strip() if available else "",
            "unavailable_reason": None if available else (raw or "Resposta vazia do serviço LLM."),
            "model_used": RECOMMENDATION_MODEL,
            "generated_at": now().isoformat(),
            "sources": sources,
        }

    # ------------------------------------------------------------------
    # retrieval
    # ------------------------------------------------------------------

    @staticmethod
    def _retrieve_rag(occurrence: AssetVulnerability) -> List[dict]:
        vuln = occurrence.vulnerability
        asset = occurrence.asset
        query = (
            f"Mitigação e controlos de segurança para {vuln.cve_id} "
            f"(severidade {vuln.severity}) no ativo {asset.name}"
        )
        try:
            return SemanticRetrievalService.semantic_search(query, top_k=_MAX_RAG_SOURCES) or []
        except Exception:
            # Embedding generation also depends on Ollama; fail soft.
            return []

    # ------------------------------------------------------------------
    # sources
    # ------------------------------------------------------------------

    @classmethod
    def _collect_sources(cls, context: Dict[str, Any], rag_chunks: List[dict]) -> List[Dict[str, Any]]:
        """Unified, sequentially-numbered source list (structured first, then RAG)."""
        sources: List[Dict[str, Any]] = []
        index = 1

        # Structured — top score dimensions by contribution.
        dims = sorted(
            context["score"]["dimensions"],
            key=lambda d: d["contribution"],
            reverse=True,
        )[:_MAX_SCORE_SOURCES]
        for dim in dims:
            sources.append(
                {
                    "index": index,
                    "kind": "structured",
                    "ref": dim["code"],
                    "label": dim["label"],
                    "detail": f"{dim['raw_value']} — contribui {dim['contribution']} pts para a prioridade",
                }
            )
            index += 1

        # Structured — compliance chain, prefer controls with findings/gaps.
        chain = sorted(
            context.get("compliance_chain", []),
            key=lambda e: len(e["findings"]) + len(e["compliance_gaps"]),
            reverse=True,
        )[:_MAX_CHAIN_SOURCES]
        for entry in chain:
            sources.append(
                {
                    "index": index,
                    "kind": "structured",
                    "ref": f"{entry['framework']['code']}:{entry['control']['code']}",
                    "label": entry["control"]["title"],
                    "detail": (
                        f"{len(entry['mechanisms'])} mecanismo(s), "
                        f"{len(entry['findings'])} finding(s), "
                        f"{len(entry['compliance_gaps'])} gap(s)"
                    ),
                }
            )
            index += 1

        # Semantic — retrieved knowledge chunks.
        for chunk in rag_chunks:
            sources.append(
                {
                    "index": index,
                    "kind": "rag",
                    "ref": str(chunk.get("source_ref") or chunk.get("id") or "—"),
                    "label": chunk.get("title") or "Excerto de conhecimento",
                    "detail": (
                        f"{chunk.get('source_type', 'documento')}"
                        + (f" · {chunk['framework']}" if chunk.get("framework") else "")
                        + (f" · distância {chunk['distance']}" if chunk.get("distance") is not None else "")
                    ),
                }
            )
            index += 1

        return sources

    # ------------------------------------------------------------------
    # prompt
    # ------------------------------------------------------------------

    @classmethod
    def _build_prompt(cls, context: Dict[str, Any], sources: List[Dict[str, Any]]) -> str:
        occ = context["occurrence"]
        asset = occ["asset"]
        vuln = occ["vulnerability"]
        score = context["score"]

        lines: List[str] = []
        lines.append(
            "És um Virtual CISO experiente. Analisa o contexto de decisão abaixo e produz "
            "uma recomendação fundamentada para apoiar a decisão do CISO. "
            "Responde em Português de Portugal (PT-PT)."
        )
        lines.append("")
        lines.append("## OCORRÊNCIA")
        lines.append(
            f"{vuln['cve_id']} no ativo {asset['name']} · severidade {vuln['severity']} · "
            f"estado atual {occ['status']}."
        )
        lines.append(
            f"CVSS {vuln['cvss_score']} · EPSS {vuln['epss_score']} · "
            f"CISA KEV: {'sim' if vuln['is_in_kev'] else 'não'}."
        )
        lines.append(
            f"Ativo: criticidade {asset['criticality']}, exposição {asset['exposure']}/5."
        )
        if vuln.get("description"):
            lines.append(f"Descrição da vulnerabilidade: {vuln['description']}")

        lines.append("")
        lines.append(
            f"## SCORE DE PRIORIDADE: {score['global_score']}/100 "
            f"({score['classification_label']}) — ação recomendada pelo modelo: {score['recommended_action']}"
        )

        lines.append("")
        lines.append("## FONTES NUMERADAS (cita-as no texto pelo número, ex.: [1])")
        for s in sources:
            tag = "ESTRUTURADO" if s["kind"] == "structured" else "RAG"
            lines.append(f"[{s['index']}] ({tag}) {s['label']} — {s['detail']}")
        if not sources:
            lines.append("(Sem fontes estruturadas ou documentais disponíveis.)")

        lines.append("")
        lines.append("## INSTRUÇÕES")
        lines.append(
            "1. Explica, em 1 parágrafo, porque é que a prioridade foi classificada como "
            f"'{score['classification_label']}', referindo os fatores dominantes."
        )
        lines.append(
            "2. Recomenda, em 1 parágrafo, ações concretas de mitigação e qual a tipologia "
            "de decisão mais adequada (aceitar / mitigar / diferir / transferir / converter em ação)."
        )
        lines.append("3. Cita as fontes relevantes pelo número correspondente, ex.: [1], [3].")
        lines.append("4. NÃO inventes ativos, controlos ou evidências fora das fontes listadas.")
        lines.append("5. Sê conciso: no máximo 2 parágrafos. Não uses listas nem títulos.")

        return "\n".join(lines)
