"""
Embedding generation for the RAG component — Cap. 4.9.3 of the dissertation.

`EmbeddingService` calls the local Ollama runtime's `/api/embeddings` endpoint
with the configured embedding model (settings.OLLAMA_EMBED_MODEL) to produce
dense semantic vectors for both knowledge ingestion and query-time retrieval.

It returns ``None`` on any failure so the callers degrade gracefully:
  - SemanticRetrievalService.semantic_search() returns no chunks;
  - KnowledgeIngestionService.embed() skips the chunk.
This is deliberate — a failed embedding must never be silently replaced by a
meaningless vector, which would pollute the pgvector similarity space.
"""

import logging

import requests
from django.conf import settings

from ciso_assistant.services.ollama_client import ollama_base_url

logger = logging.getLogger(__name__)


def _embeddings_url() -> str:
    """Derive the Ollama /api/embeddings URL from the configured OLLAMA_URL."""
    base = ollama_base_url()
    if not base:
        return ""
    return f"{base}/api/embeddings"


class EmbeddingService:
    """Ollama-backed embedding service for the hybrid RAG pipeline."""

    # Must match the dimension of KnowledgeChunk.embedding (pgvector VectorField).
    DIMENSIONS = 4096

    @classmethod
    def get_embedding(cls, text: str):
        """Return the embedding vector for ``text`` or None when unavailable."""
        text = (text or "").strip()
        if not text:
            return None

        url = _embeddings_url()
        if not url:
            logger.warning("[EMBEDDING] OLLAMA_URL not configured; cannot embed.")
            return None

        model = getattr(settings, "OLLAMA_EMBED_MODEL", "llama3.1:8b")
        timeout_seconds = getattr(
            settings,
            "OLLAMA_EMBED_TIMEOUT_SECONDS",
            getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 180),
        )
        try:
            response = requests.post(
                url,
                json={"model": model, "prompt": text},
                timeout=timeout_seconds,
            )
            response.raise_for_status()
            embedding = response.json().get("embedding")
        except Exception as exc:
            logger.warning("[EMBEDDING] Ollama embedding call failed: %s", exc)
            return None

        if not embedding or not isinstance(embedding, list):
            logger.warning("[EMBEDDING] Ollama returned an empty embedding.")
            return None

        if len(embedding) != cls.DIMENSIONS:
            logger.error(
                "[EMBEDDING] Dimension mismatch: model '%s' returned %s, expected %s. "
                "Check OLLAMA_EMBED_MODEL.",
                model,
                len(embedding),
                cls.DIMENSIONS,
            )
            return None

        return embedding
