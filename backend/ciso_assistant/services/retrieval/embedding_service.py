import hashlib
import math


class EmbeddingService:
    """
    Local fallback embedding service for development.

    This deterministic fallback keeps imports, diagnostics and tests running
    until the Ollama-backed embedding integration is enabled.
    """

    DIMENSIONS = 4096

    @classmethod
    def get_embedding(cls, text: str):
        seed = hashlib.sha256((text or "").encode("utf-8")).digest()
        values = []
        for idx in range(cls.DIMENSIONS):
            byte = seed[idx % len(seed)]
            values.append((byte / 255.0) * 2.0 - 1.0)

        norm = math.sqrt(sum(value * value for value in values)) or 1.0
        return [value / norm for value in values]
