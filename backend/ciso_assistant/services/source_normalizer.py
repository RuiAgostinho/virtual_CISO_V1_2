class SourceNormalizer:
    """
    Converts heterogeneous source payloads into a stable UI/audit contract.
    """

    SOURCE_METADATA = {
        "structured_query": {
            "source_label": "Consulta estruturada",
            "governance_layer": "system",
            "entity_type": "structured_query",
        },
        "vulnerability_prioritization": {
            "source_label": "Priorizacao de vulnerabilidades",
            "governance_layer": "risk",
            "entity_type": "vulnerability_prioritization",
        },
        "internal_control": {
            "source_label": "Controlo interno",
            "governance_layer": "internal_governance",
            "entity_type": "internal_control",
        },
        "policy_internal_control": {
            "source_label": "Politica interna e controlo interno",
            "governance_layer": "internal_governance",
            "entity_type": "policy_internal_control",
        },
        "governance_document": {
            "source_label": "Documento de governacao",
            "governance_layer": "internal_governance",
            "entity_type": "governance_document",
        },
        "governance_section": {
            "source_label": "Seccao de documento",
            "governance_layer": "internal_governance",
            "entity_type": "governance_section",
        },
        "internal_control_mechanism": {
            "source_label": "Mecanismo de controlo interno",
            "governance_layer": "internal_governance",
            "entity_type": "internal_control_mechanism",
        },
        "governance_action": {
            "source_label": "Tarefa de governacao",
            "governance_layer": "internal_governance",
            "entity_type": "governance_action",
        },
        "evidence_item": {
            "source_label": "Evidencia reutilizavel",
            "governance_layer": "internal_governance",
            "entity_type": "evidence_item",
        },
        "framework_mapping": {
            "source_label": "Mapeamento interno-framework",
            "governance_layer": "mapping_bridge",
            "entity_type": "framework_mapping",
        },
        "control": {
            "source_label": "Controlo externo/framework",
            "governance_layer": "external_framework",
            "entity_type": "framework_control",
        },
        "policy": {
            "source_label": "Politica interna legacy",
            "governance_layer": "legacy_compatibility",
            "entity_type": "policy",
        },
        "mechanism": {
            "source_label": "Mecanismo legacy",
            "governance_layer": "legacy_compatibility",
            "entity_type": "mechanism",
        },
        "evidence": {
            "source_label": "Evidencia legacy",
            "governance_layer": "legacy_compatibility",
            "entity_type": "evidence",
        },
        "technical_regulation": {
            "source_label": "Fonte normativa",
            "governance_layer": "external_regulatory",
            "entity_type": "technical_regulation",
        },
        "procedure": {
            "source_label": "Procedimento legacy",
            "governance_layer": "legacy_compatibility",
            "entity_type": "procedure",
        },
        "compliance_gap": {
            "source_label": "Gap de conformidade legacy",
            "governance_layer": "legacy_compatibility",
            "entity_type": "compliance_gap",
        },
        "asset": {
            "source_label": "Ativo",
            "governance_layer": "risk",
            "entity_type": "asset",
        },
        "vulnerability": {
            "source_label": "Vulnerabilidade",
            "governance_layer": "risk",
            "entity_type": "vulnerability",
        },
        "general": {
            "source_label": "Conhecimento geral",
            "governance_layer": "knowledge",
            "entity_type": "general",
        },
        "internal": {
            "source_label": "Fonte interna",
            "governance_layer": "internal_governance",
            "entity_type": "internal",
        },
        "unknown": {
            "source_label": "Fonte desconhecida",
            "governance_layer": "unknown",
            "entity_type": "unknown",
        },
    }

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
    def source_metadata(cls, source_type: str | None) -> dict:
        key = str(source_type or "unknown")
        metadata = cls.SOURCE_METADATA.get(
            key,
            {
                "source_label": key.replace("_", " ").title(),
                "governance_layer": "knowledge",
                "entity_type": key,
            },
        )
        enriched = dict(metadata)
        enriched["is_internal_governance"] = enriched["governance_layer"] == "internal_governance"
        enriched["is_external_framework"] = enriched["governance_layer"] == "external_framework"
        return enriched

    @classmethod
    def normalize(cls, source: dict) -> dict:
        if not isinstance(source, dict):
            source_metadata = cls.source_metadata("unknown")
            return {
                "title": "Fonte",
                "source_type": "unknown",
                **source_metadata,
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

        source_metadata = cls.source_metadata(source_type)
        normalized = {
            "title": str(title),
            "source_type": str(source_type),
            **source_metadata,
            "source_ref": str(source_ref),
            "content_excerpt": cls._excerpt(content),
            "score": score,
        }

        metadata = source.get("metadata") if isinstance(source.get("metadata"), dict) else {}
        metadata_url = metadata.get("url") or metadata.get("source_url")
        if metadata_url and not source.get("url"):
            normalized["url"] = metadata_url

        for optional_key in ["framework", "control_code", "url", "metadata"]:
            if source.get(optional_key):
                normalized[optional_key] = source[optional_key]

        return normalized

    @classmethod
    def normalize_many(cls, sources: list | None) -> list:
        return [cls.normalize(source) for source in (sources or [])]
