import logging
import re
import unicodedata
from django.db.models import Q
from pgvector.django import L2Distance
from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.retrieval.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

class SemanticRetrievalService:
    """
    Semantic Retrieval Layer using PostgreSQL + pgvector.
    Extracts explicit structured elements with cosine distance search.
    """

    @staticmethod
    def normalize_text(text: str) -> str:
        text = (text or "").lower().strip()
        return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")

    @classmethod
    def infer_source_types(cls, query: str) -> list[str]:
        normalized = cls.normalize_text(query)

        if any(term in normalized for term in ["evidencia", "evidencias", "comprovativo", "prova", "provas"]):
            if any(term in normalized for term in ["tenho", "existem", "quais", "lista", "mostra", "registadas"]):
                return ["evidence"]

        if any(term in normalized for term in ["politica", "politicas", "sgsi"]):
            return ["policy"]

        if any(term in normalized for term in ["procedimento", "procedimentos", "processo operacional"]):
            return ["procedure"]

        if any(term in normalized for term in ["regulamento", "regulamentos", "norma tecnica", "requisito tecnico"]):
            return ["technical_regulation"]

        if any(term in normalized for term in ["gap", "gaps", "desvio", "desvios", "conformidade", "score", "pontuacao"]):
            return ["compliance_gap"]

        return []

    @classmethod
    def lexical_bonus(cls, query: str, chunk: KnowledgeChunk) -> float:
        normalized_query = cls.normalize_text(query)
        tokens = {token for token in re.findall(r"[a-z0-9]+", normalized_query) if len(token) >= 3}
        if not tokens:
            return 0.0

        haystack = cls.normalize_text(f"{chunk.title} {chunk.chunk_text} {chunk.source_ref}")
        bonus = 0.0
        for token in tokens:
            if token in haystack:
                bonus += 2.5
        return min(bonus, 15.0)


    @classmethod
    def semantic_search(cls, query: str, top_k: int = 5, filters: dict = None) -> list:
        """
        Executes semantic hybrid retrieval mapping structured filters over vector distances.
        """
        if not query or not query.strip():
            logger.warning("[SEMANTIC_RETRIEVAL] Empty query provided. Returning no chunks.")
            return []

        try:
            # 1. Generate query embedding
            query_vector = EmbeddingService.get_embedding(query)
            if not query_vector:
                logger.error("[SEMANTIC_RETRIEVAL] Failed to generate embedding for query.")
                return []

            # 2. Build Base Queryset (Apply Metadata Filters)
            queryset = KnowledgeChunk.objects.all()

            if filters:
                if "framework" in filters:
                    queryset = queryset.filter(framework=filters["framework"])
                if "source_type" in filters:
                    queryset = queryset.filter(source_type=filters["source_type"])
                if "control_code" in filters:
                    queryset = queryset.filter(control_code=filters["control_code"])
                if "asset_id" in filters:
                    asset_id = str(filters["asset_id"])
                    queryset = queryset.filter(
                        Q(source_type="asset", source_ref=asset_id) | Q(metadata_json__asset_id=asset_id)
                    )
                if "control_id" in filters:
                    control_id = str(filters["control_id"])
                    queryset = queryset.filter(
                        Q(source_type="control", source_ref=control_id) | Q(metadata_json__control_id=control_id)
                    )
                if "document_type" in filters:
                    queryset = queryset.filter(metadata_json__document_type=filters["document_type"])
            elif inferred_source_types := cls.infer_source_types(query):
                queryset = queryset.filter(source_type__in=inferred_source_types)

            # 3. Vector Search Using pgvector (L2 Distance / Cosine Similarity adaptation)
            # L2Distance expects a vector field and the query array.
            # lower distance = higher similarity
            candidate_limit = max(top_k * 4, top_k)
            results = queryset.annotate(
                distance=L2Distance('embedding', query_vector)
            ).order_by('distance')[:candidate_limit]

            ranked_results = sorted(
                results,
                key=lambda obj: (float(obj.distance or 0.0) - cls.lexical_bonus(query, obj)),
            )[:top_k]

            # 4. Serialize Chunks securely
            retrieved_chunks = []
            for obj in ranked_results:
                retrieved_chunks.append({
                    "id": str(obj.id),
                    "title": obj.title,
                    "chunk_text": obj.chunk_text,
                    "source_type": obj.source_type,
                    "source_ref": obj.source_ref,
                    "framework": obj.framework,
                    "control_code": obj.control_code,
                    "distance": round(obj.distance, 4) if getattr(obj, 'distance', None) is not None else 0.0,
                    "metadata": obj.metadata_json
                })
            
            logger.info(f"[SEMANTIC_RETRIEVAL] Successfully retrieved {len(retrieved_chunks)} chunks.")
            return retrieved_chunks

        except Exception as e:
            logger.error(f"[SEMANTIC_RETRIEVAL] Fatal error during pgvector search: {str(e)}")
            # Fail silently to avoid crashing inference cascade - empty chunks simply mean fallback LLM reasoning.
            return []


