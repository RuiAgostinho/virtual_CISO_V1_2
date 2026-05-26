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
                return ["evidence_item", "evidence"]

        if any(term in normalized for term in ["politica", "politicas", "sgsi"]):
            return ["governance_document", "governance_section", "policy"]

        if any(term in normalized for term in ["procedimento", "procedimentos", "processo operacional"]):
            return ["governance_document", "governance_section", "procedure"]

        if any(
            term in normalized
            for term in [
                "artigo",
                "decreto",
                "decreto-lei",
                "dl 125",
                "dl125",
                "lei",
                "nis2",
                "regulamento",
                "regulamentos",
                "norma tecnica",
                "requisito tecnico",
                "diretiva",
                "directiva",
            ]
        ):
            return [
                "technical_regulation",
                "governance_document",
                "governance_section",
                "internal_control",
                "framework_mapping",
                "internal_control_mechanism",
                "evidence_item",
                "control",
            ]

        if any(
            term in normalized
            for term in [
                "acao",
                "acoes",
                "atrasada",
                "atrasadas",
                "executar",
                "implementar",
                "plano de acao",
                "plano",
                "prazo",
                "prazos",
                "responsavel",
                "tarefa",
                "tarefas",
            ]
        ):
            return ["governance_action", "internal_control_mechanism", "mechanism", "evidence_item"]

        if any(term in normalized for term in ["gap", "gaps", "desvio", "desvios", "conformidade", "score", "pontuacao"]):
            return [
                "technical_regulation",
                "internal_control",
                "framework_mapping",
                "internal_control_mechanism",
                "governance_action",
                "evidence_item",
                "compliance_gap",
            ]

        if any(term in normalized for term in ["controlo", "controlos", "controle", "controles", "framework", "iso", "nist", "qnrc", "nis2"]):
            return ["internal_control", "framework_mapping", "internal_control_mechanism", "control", "mechanism", "technical_regulation"]

        if any(term in normalized for term in ["mecanismo", "mecanismos", "mechanism", "mechanisms"]):
            return ["internal_control_mechanism", "mechanism", "evidence_item"]

        return []

    @classmethod
    def lexical_bonus(cls, query: str, chunk: KnowledgeChunk) -> float:
        normalized_query = cls.normalize_text(query)
        tokens = {token for token in re.findall(r"[a-z0-9]+", normalized_query) if len(token) >= 3}
        if "artigo" in normalized_query:
            tokens.update(token for token in re.findall(r"\d+", normalized_query) if len(token) >= 1)
        if not tokens:
            return 0.0

        title_text = cls.normalize_text(chunk.title)
        haystack = cls.normalize_text(f"{chunk.title} {chunk.chunk_text} {chunk.source_ref}")
        bonus = 0.0
        for token in tokens:
            if token in haystack:
                bonus += 2.5

        for phrase, weight in {
            "cadeia de abastecimento": 55.0,
            "seguranca da cadeia de abastecimento": 65.0,
            "gestao de riscos": 18.0,
            "sistema de gestao de riscos": 24.0,
            "risco residual": 20.0,
        }.items():
            if phrase in normalized_query and phrase in haystack:
                bonus += weight
            if phrase in normalized_query and phrase in title_text:
                bonus += weight

        metadata = chunk.metadata_json or {}
        if chunk.source_type == "technical_regulation":
            if any(term in normalized_query for term in ["artigo", "decreto", "dl 125", "dl125", "nis2", "diretiva", "directiva"]):
                bonus += 4.0
            article_number = str(metadata.get("article_number") or "")
            if article_number and any(token in cls.normalize_text(article_number) for token in tokens):
                bonus += 22.0
            article_title = cls.normalize_text(str(metadata.get("article_title") or ""))
            if article_title and article_title in normalized_query:
                bonus += 45.0
            if metadata.get("normative_document") == "DL125_2025" and any(term in normalized_query for term in ["dl 125", "dl125", "decreto"]):
                bonus += 6.0
        return min(bonus, 140.0)


    @classmethod
    def lexical_filter_tokens(cls, query: str) -> list[str]:
        normalized_query = cls.normalize_text(query)
        tokens = [token for token in re.findall(r"[a-z0-9]+", normalized_query) if len(token) >= 4]
        if "artigo" in normalized_query:
            tokens.extend(token for token in re.findall(r"\d+", normalized_query) if token)
        priority_tokens = [
            token
            for token in tokens
            if token
            in {
                "artigo",
                "abastecimento",
                "cadeia",
                "fornecedor",
                "fornecedores",
                "prestador",
                "prestadores",
                "nis2",
                "dl125",
                "diretiva",
                "directiva",
                "conformidade",
                "risco",
                "riscos",
            }
        ]
        ordered = priority_tokens + tokens
        seen = set()
        unique = []
        for token in ordered:
            if token not in seen:
                unique.append(token)
                seen.add(token)
        return unique[:8]


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
            queryset = KnowledgeChunk.objects.exclude(embedding__isnull=True)

            if filters:
                if "framework" in filters:
                    queryset = queryset.filter(framework=filters["framework"])
                if "source_type" in filters:
                    source_type = filters["source_type"]
                    if isinstance(source_type, (list, tuple, set)):
                        queryset = queryset.filter(source_type__in=list(source_type))
                    else:
                        queryset = queryset.filter(source_type=source_type)
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
                if "internal_control_id" in filters:
                    internal_control_id = str(filters["internal_control_id"])
                    queryset = queryset.filter(
                        Q(source_type="internal_control", source_ref=internal_control_id)
                        | Q(metadata_json__internal_control_id=internal_control_id)
                    )
                if "governance_document_id" in filters:
                    document_id = str(filters["governance_document_id"])
                    queryset = queryset.filter(
                        Q(source_type="governance_document", source_ref=document_id)
                        | Q(metadata_json__governance_document_id=document_id)
                    )
                if "evidence_item_id" in filters:
                    evidence_id = str(filters["evidence_item_id"])
                    queryset = queryset.filter(
                        Q(source_type="evidence_item", source_ref=evidence_id)
                        | Q(metadata_json__evidence_item_id=evidence_id)
                    )
                if "governance_action_id" in filters:
                    action_id = str(filters["governance_action_id"])
                    queryset = queryset.filter(
                        Q(source_type="governance_action", source_ref=action_id)
                        | Q(metadata_json__governance_action_id=action_id)
                    )
                if "document_type" in filters:
                    queryset = queryset.filter(metadata_json__document_type=filters["document_type"])
            elif inferred_source_types := cls.infer_source_types(query):
                queryset = queryset.filter(source_type__in=inferred_source_types)

            # 3. Vector Search Using pgvector (L2 Distance / Cosine Similarity adaptation)
            # L2Distance expects a vector field and the query array.
            # lower distance = higher similarity
            candidate_limit = max(top_k * 4, top_k)
            results = list(queryset.annotate(
                distance=L2Distance('embedding', query_vector)
            ).order_by('distance')[:candidate_limit])

            exact_phrase_q = Q()
            normalized_query = cls.normalize_text(query)
            for phrase in ["cadeia de abastecimento", "seguranca da cadeia de abastecimento", "risco residual"]:
                if phrase in normalized_query:
                    exact_phrase_q |= Q(title__icontains=phrase) | Q(chunk_text__icontains=phrase)
            if exact_phrase_q:
                exact_phrase_results = list(
                    queryset.filter(exact_phrase_q)
                    .annotate(distance=L2Distance("embedding", query_vector))
                    .order_by("distance")[: max(candidate_limit * 2, 80)]
                )
                seen_ids = {obj.id for obj in results}
                results.extend(obj for obj in exact_phrase_results if obj.id not in seen_ids)

            lexical_q = Q()
            for token in cls.lexical_filter_tokens(query):
                lexical_q |= Q(title__icontains=token) | Q(chunk_text__icontains=token) | Q(source_ref__icontains=token)
            if lexical_q:
                lexical_results = list(
                    queryset.filter(lexical_q)
                    .annotate(distance=L2Distance("embedding", query_vector))
                    .order_by("distance")[: max(candidate_limit * 5, 120)]
                )
                seen_ids = {obj.id for obj in results}
                results.extend(obj for obj in lexical_results if obj.id not in seen_ids)

            ranked_results = sorted(
                results,
                key=lambda obj: (float(obj.distance or 0.0) - cls.lexical_bonus(query, obj)),
            )[:top_k]

            # 4. Serialize Chunks securely
            retrieved_chunks = []
            for obj in ranked_results:
                metadata = obj.metadata_json or {}
                retrieved_chunks.append({
                    "id": str(obj.id),
                    "title": obj.title,
                    "chunk_text": obj.chunk_text,
                    "source_type": obj.source_type,
                    "source_ref": obj.source_ref,
                    "framework": obj.framework,
                    "control_code": obj.control_code,
                    "distance": round(obj.distance, 4) if getattr(obj, 'distance', None) is not None else 0.0,
                    "metadata": metadata,
                    "url": metadata.get("url") or metadata.get("source_url"),
                })
            
            logger.info(f"[SEMANTIC_RETRIEVAL] Successfully retrieved {len(retrieved_chunks)} chunks.")
            return retrieved_chunks

        except Exception as e:
            logger.error(f"[SEMANTIC_RETRIEVAL] Fatal error during pgvector search: {str(e)}")
            # Fail silently to avoid crashing inference cascade - empty chunks simply mean fallback LLM reasoning.
            return []


