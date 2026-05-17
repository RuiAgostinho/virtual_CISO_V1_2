class SourceNormalizer:
    """
    Converts heterogeneous source payloads into a stable UI/audit contract.
    """

    @staticmethod
    def _excerpt(value, limit=280):
        text = str(value or "").strip()
        if len(text) <= limit:
            return text
        return text[: limit - 3].rstrip() + "..."

    @staticmethod
    def _distance_to_relevance(distance):
        try:
            distance = float(distance)
        except (TypeError, ValueError):
            return None
        return round(1 / (1 + max(distance, 0.0)), 4)

    @classmethod
    def normalize(cls, source: dict) -> dict:
        if not isinstance(source, dict):
            return {
                "title": "Fonte",
                "source_type": "unknown",
                "source_ref": "",
                "content_excerpt": cls._excerpt(source),
                "score": None,
            }

        source_type = (
            source.get("source_type")
            or source.get("type")
            or source.get("source")
            or "internal"
        )
        title = (
            source.get("title")
            or source.get("name")
            or source.get("control_code")
            or source.get("source_ref")
            or "Fonte interna"
        )
        source_ref = (
            source.get("source_ref")
            or source.get("id")
            or source.get("framework")
            or source.get("asset")
            or ""
        )
        content = (
            source.get("content_excerpt")
            or source.get("content")
            or source.get("chunk_text")
            or source.get("raw_text")
            or source.get("description")
            or ""
        )
        score = source.get("score")
        if score is None and "distance" in source:
            score = cls._distance_to_relevance(source.get("distance"))
        if score is None and "confidence" in source:
            score = source.get("confidence")

        normalized = {
            "title": str(title),
            "source_type": str(source_type),
            "source_ref": str(source_ref),
            "content_excerpt": cls._excerpt(content),
            "score": score,
        }

        for optional_key in ["framework", "control_code"]:
            if source.get(optional_key):
                normalized[optional_key] = source[optional_key]

        return normalized

    @classmethod
    def normalize_many(cls, sources: list | None) -> list:
        return [cls.normalize(source) for source in (sources or [])]
