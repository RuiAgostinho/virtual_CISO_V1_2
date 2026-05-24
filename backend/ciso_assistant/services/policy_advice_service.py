from __future__ import annotations

from typing import Any

from governance.models import GovernanceDocument, Policy


class PolicyAdviceService:
    """Builds a policy-editing advisory prompt without changing the router."""

    SECTION_LIMIT = 10
    SECTION_CONTENT_LIMIT = 500

    @classmethod
    def build_query(cls, policy_id: str | None, snapshot: dict[str, Any], advice_mode: str = "full_review") -> str:
        policy = cls._get_policy(policy_id)
        document = cls._get_policy_document(policy_id) if policy_id else None
        sections = cls._sections_from_snapshot(snapshot)
        relation_context = cls._relation_context(policy) if policy else "Politica ainda sem relacoes persistidas."

        mode_label = {
            "full_review": "analise completa",
            "coverage": "cobertura de controlos internos",
            "auditability": "auditabilidade e evidencia",
            "wording": "redacao normativa",
            "draft_text": "exemplo de redacao pronto a adaptar",
        }.get(advice_mode, "analise completa")

        policy_header = cls._policy_header(policy, snapshot, document)
        section_text = cls._section_text(sections)
        format_block = cls._format_block(advice_mode)

        return (
            "Preciso de aconselhamento CISO para uma politica interna em edicao.\n"
            f"Modo de aconselhamento: {mode_label}.\n\n"
            "INSTRUCOES AO ASSISTENTE:\n"
            "- Responde em Portugues de Portugal.\n"
            "- Atua como consultor CISO e nao como chatbot generico.\n"
            "- Usa primeiro a camada interna da organizacao: politicas, controlos internos, mecanismos, evidencias, documentos e traceability.\n"
            "- Usa frameworks externas apenas em segunda linha, como camada de mapeamento e validacao.\n"
            "- Nao inventes controlos, evidencias ou estados se nao existirem nos dados recuperados.\n"
            "- Distingue claramente factos confirmados, lacunas e recomendacoes.\n"
            "- Produz recomendacoes defensaveis, auditaveis e acionaveis.\n\n"
            f"{cls._mode_specific_instruction(advice_mode)}\n\n"
            f"FORMATO PEDIDO:\n{format_block}\n\n"
            f"POLITICA EM EDICAO:\n{policy_header}\n\n"
            f"RELACOES PERSISTIDAS CONHECIDAS:\n{relation_context}\n\n"
            f"CORPO DOCUMENTAL ATUAL:\n{section_text}"
        )

    @classmethod
    def _mode_specific_instruction(cls, advice_mode: str) -> str:
        if advice_mode in {"wording", "draft_text"}:
            return (
                "INSTRUCAO CRITICA PARA REDACAO:\n"
                "- Nao fiques apenas por diagnostico.\n"
                "- Comeca por texto normativo pronto a copiar/adaptar para a politica.\n"
                "- Escreve em tom formal, claro e auditavel.\n"
                "- Usa verbos normativos como deve, devem, e responsavel por, sem inventar factos operacionais.\n"
                "- Se uma secao estiver vazia ou vaga, cria uma proposta completa para essa secao."
                "\n- Nao uses blocos de codigo nem fences markdown como ```plaintext."
                "\n- Entrega as secoes pedidas completas, mesmo que tenhas de ser mais sintetico."
            )
        return ""

    @classmethod
    def _format_block(cls, advice_mode: str) -> str:
        if advice_mode == "coverage":
            return "\n".join(
                [
                    "1. Controlos internos que parecem cobertos.",
                    "2. Controlos internos em falta ou pouco claros.",
                    "3. Mecanismos/evidencias que devem ser associados.",
                    "4. Frameworks externas potencialmente impactadas.",
                    "5. Proximas acoes para validacao no Mapping Review.",
                ]
            )
        if advice_mode == "auditability":
            return "\n".join(
                [
                    "1. Lacunas de auditabilidade.",
                    "2. Evidencias que seriam defensaveis.",
                    "3. Owners, responsabilidades e periodicidades em falta.",
                    "4. Riscos de conformidade se a politica for aprovada assim.",
                    "5. Proximas acoes para o CISO.",
                ]
            )
        if advice_mode == "wording":
            return "\n".join(
                [
                    "1. Texto pronto a colar para as secoes mais fracas.",
                    "2. Versao melhorada de uma secao critica.",
                    "3. Notas breves de redacao normativa.",
                    "4. Proximas acoes para revisao humana.",
                ]
            )
        if advice_mode == "draft_text":
            return "\n".join(
                [
                    "1. Texto pronto a colar - Descricao: 1 a 2 paragrafos completos.",
                    "2. Texto pronto a colar - Objetivo: 1 paragrafo completo.",
                    "3. Texto pronto a colar - Ambito: 1 a 2 paragrafos completos.",
                    "4. Texto pronto a colar - Responsabilidades: inclui CISO, direcao, owners e utilizadores.",
                    "5. Texto pronto a colar - Revisao, excecoes e incumprimento.",
                    "6. Notas de adaptacao antes de aprovar.",
                ]
            )
        return "\n".join(
            [
                "1. Leitura CISO da politica em edicao.",
                "2. Pontos fortes.",
                "3. Lacunas e riscos de auditabilidade.",
                "4. Controlos internos, mecanismos e evidencias a considerar.",
                "5. Impacto esperado em frameworks externas.",
                "6. Capitulos ou subcapitulos recomendados.",
                "7. Texto sugerido para melhorar uma secao critica.",
                "8. Proximas acoes para o CISO validar.",
            ]
        )

    @classmethod
    def _get_policy(cls, policy_id: str | None) -> Policy | None:
        if not policy_id:
            return None
        return (
            Policy.objects.prefetch_related(
                "internal_control_links__internal_control",
                "related_frameworks",
            )
            .filter(id=policy_id)
            .first()
        )

    @classmethod
    def _get_policy_document(cls, policy_id: str | None) -> GovernanceDocument | None:
        if not policy_id:
            return None
        return (
            GovernanceDocument.objects.prefetch_related("control_links__internal_control", "sections")
            .filter(legacy_policy_id=policy_id, document_type=GovernanceDocument.DocumentType.POLICY)
            .first()
        )

    @classmethod
    def _policy_header(cls, policy: Policy | None, snapshot: dict[str, Any], document: GovernanceDocument | None) -> str:
        def value(key: str, fallback: str = "") -> str:
            raw = snapshot.get(key)
            if raw not in (None, ""):
                return str(raw)
            if policy and hasattr(policy, key):
                return str(getattr(policy, key) or "")
            return fallback

        related_frameworks = []
        if policy:
            related_frameworks = [f"{framework.code} {framework.version}" for framework in policy.related_frameworks.all()]

        return "\n".join(
            [
                f"ID: {policy.id if policy else 'rascunho-nao-guardado'}",
                f"Codigo: {value('code') or 'Nao definido'}",
                f"Titulo: {value('title') or 'Nao definido'}",
                f"Versao: {value('version', '1.0') or '1.0'}",
                f"Owner: {value('owner') or 'Nao definido'}",
                f"Documento governance associado: {document.title if document else 'Nao encontrado'}",
                f"Frameworks legacy associadas: {', '.join(related_frameworks) if related_frameworks else 'Nao definido'}",
            ]
        )

    @classmethod
    def _sections_from_snapshot(cls, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        sections = snapshot.get("sections")
        if not isinstance(sections, list):
            return []
        normalized = []
        for section in sections[: cls.SECTION_LIMIT]:
            if not isinstance(section, dict):
                continue
            title = str(section.get("title") or "").strip()
            content = str(section.get("content") or "").strip()
            if not title and not content:
                continue
            normalized.append(
                {
                    "section_number": str(section.get("section_number") or "").strip(),
                    "title": title,
                    "content": content[: cls.SECTION_CONTENT_LIMIT],
                }
            )
        return normalized

    @classmethod
    def _section_text(cls, sections: list[dict[str, Any]]) -> str:
        if not sections:
            return "Sem capitulos/subcapitulos no rascunho enviado."
        lines = []
        for section in sections:
            heading = " ".join(
                value for value in [section.get("section_number"), section.get("title")] if value
            )
            lines.append(f"### {heading or 'Secao sem titulo'}\n{section.get('content') or 'Sem conteudo.'}")
        return "\n\n".join(lines)

    @classmethod
    def _relation_context(cls, policy: Policy | None) -> str:
        if not policy:
            return "Politica ainda sem relacoes persistidas."

        internal_links = []
        for link in policy.internal_control_links.select_related("internal_control").all()[:20]:
            control = link.internal_control
            internal_links.append(
                f"{control.code} - {control.title} ({link.applicability}, validacao={link.validation_status})"
            )

        return "\n".join(
            [
                "Controlos internos associados:",
                "; ".join(internal_links) if internal_links else "Sem controlos internos associados.",
            ]
        )
