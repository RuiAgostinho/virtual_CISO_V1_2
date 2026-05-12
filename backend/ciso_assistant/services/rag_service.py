import re

from ciso_assistant.services.semantic_retrieval import SemanticRetrievalService


class RAGService:
    """
    Backwards-compatible facade for the current semantic retrieval layer.
    """

    @classmethod
    def should_use_rag(cls, query: str, task_type: str) -> bool:
        if task_type == "structured_query":
            return False

        rag_keywords = r"ativo|asset|risco|vulnerabilidade|controlo|controlos|compliance|conformidade|gap|gaps|evidencia|wazuh|host|servidor|mecanismo"
        if re.search(rag_keywords, (query or "").lower()):
            return True

        return task_type in ["risk_analysis", "control_mapping", "evidence_drafting", "executive_advisory"]

    @classmethod
    def hybrid_retrieve(cls, query: str, filters: dict = None, top_k: int = 5) -> list:
        return SemanticRetrievalService.semantic_search(query=query, top_k=top_k, filters=filters)

    @classmethod
    def format_context(cls, chunks: list) -> str:
        if not chunks:
            return "Nenhum contexto relevante encontrado."

        output = []
        for chunk in chunks:
            ref = f"[{chunk.get('source_type', 'SOURCE').upper()}"
            if chunk.get("source_ref"):
                ref += f" | Ref: {chunk['source_ref']}"
            if chunk.get("framework"):
                ref += f" | Framework: {chunk['framework']}"
            if chunk.get("control_code"):
                ref += f" | Controlo: {chunk['control_code']}"
            ref += "]"
            output.append(f"{ref}\n{chunk.get('chunk_text') or chunk.get('content', '')}\n")

        return "\n".join(output)