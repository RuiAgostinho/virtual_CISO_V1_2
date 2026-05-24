import logging
import re
import unicodedata
from decimal import Decimal

from django.db.models import Prefetch

from governance.models import (
    EvidenceItem,
    EvidenceLink,
    GovernanceAction,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceDocumentSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
)
from governance.services.compliance_propagation_engine import CompliancePropagationEngine

logger = logging.getLogger(__name__)


class GovernanceContextAdapter:
    """
    Read-only internal-first adapter for the RAG pipeline.

    It exposes the new governance architecture as chunk-like dictionaries so the
    existing orchestrator, prompt builder, and source normalizer can consume it
    without changing the LLM router or the vector index.
    """

    MAX_SCAN = 250

    SOURCE_PRIORITY = {
        "internal_control": 100,
        "governance_document": 80,
        "policy_internal_control": 70,
        "internal_control_mechanism": 60,
        "governance_action": 85,
        "evidence_item": 50,
    }

    ACTION_TRIGGERS = {
        "acao",
        "acoes",
        "atrasada",
        "atrasadas",
        "executar",
        "implementar",
        "plano",
        "prazo",
        "prazos",
        "responsavel",
        "tarefa",
        "tarefas",
    }

    GOVERNANCE_TRIGGERS = {
        "acao",
        "acoes",
        "access",
        "acesso",
        "acessos",
        "atrasada",
        "atrasadas",
        "auditoria",
        "compliance",
        "conformidade",
        "control",
        "controls",
        "controlo",
        "controlos",
        "controle",
        "controles",
        "documento",
        "documentos",
        "evidence",
        "evidencia",
        "evidencias",
        "framework",
        "frameworks",
        "governacao",
        "governance",
        "implementar",
        "iso",
        "iso27001",
        "iso27002",
        "mapeamento",
        "mapping",
        "mechanism",
        "mechanisms",
        "mecanismo",
        "mecanismos",
        "nis2",
        "nist",
        "plano",
        "politica",
        "politicas",
        "policy",
        "prazo",
        "prazos",
        "procedimento",
        "qnrc",
        "regulamento",
        "responsavel",
        "runbook",
        "sgsi",
        "tarefa",
        "tarefas",
    }

    STOPWORDS = {
        "a",
        "ao",
        "aos",
        "as",
        "com",
        "como",
        "da",
        "das",
        "de",
        "do",
        "dos",
        "e",
        "em",
        "eu",
        "me",
        "meu",
        "minha",
        "na",
        "nas",
        "no",
        "nos",
        "o",
        "os",
        "para",
        "por",
        "que",
        "qual",
        "quais",
        "se",
        "the",
        "to",
        "with",
    }

    GENERIC_TERMS = {
        "compliance",
        "conformidade",
        "control",
        "controls",
        "controlo",
        "controlos",
        "framework",
        "frameworks",
        "governacao",
        "governance",
        "interno",
        "internos",
        "mapeamento",
        "mapping",
        "politica",
        "politicas",
        "policy",
    }

    @classmethod
    def retrieve_internal_first(cls, query: str, top_k: int = 5, filters: dict | None = None) -> list[dict]:
        if not cls.should_run(query, filters):
            return []

        terms = cls.key_terms(query)
        chunks: list[dict] = []

        internal_controls = cls.find_internal_controls(query, terms, limit=top_k)
        chunks.extend(cls.internal_control_chunks(internal_controls))

        if cls.is_action_query(query):
            remaining = max(top_k - len(chunks), 0)
            if remaining:
                chunks.extend(cls.governance_action_chunks(cls.find_governance_actions(query, terms, remaining)))

        remaining = max(top_k - len(chunks), 0)
        if remaining:
            chunks.extend(cls.governance_document_chunks(cls.find_governance_documents(query, terms, remaining)))

        remaining = max(top_k - len(chunks), 0)
        if remaining:
            chunks.extend(cls.policy_chunks(cls.find_policies(query, terms, remaining)))

        remaining = max(top_k - len(chunks), 0)
        if remaining:
            chunks.extend(cls.mechanism_chunks(cls.find_mechanisms(query, terms, remaining)))

        remaining = max(top_k - len(chunks), 0)
        if remaining and not cls.is_action_query(query):
            chunks.extend(cls.governance_action_chunks(cls.find_governance_actions(query, terms, remaining)))

        remaining = max(top_k - len(chunks), 0)
        if remaining:
            chunks.extend(cls.evidence_item_chunks(cls.find_evidence_items(query, terms, remaining)))

        return cls.deduplicate(chunks)[:top_k]

    @classmethod
    def merge_contexts(cls, internal_chunks: list[dict], semantic_chunks: list[dict], top_k: int = 8) -> list[dict]:
        ordered = sorted(
            internal_chunks or [],
            key=lambda item: item.get("priority", cls.SOURCE_PRIORITY.get(item.get("source_type"), 0)),
            reverse=True,
        )
        ordered.extend(semantic_chunks or [])
        return cls.deduplicate(ordered)[:top_k]

    @classmethod
    def should_run(cls, query: str, filters: dict | None = None) -> bool:
        if not query or not query.strip():
            return False

        if filters:
            source_type = filters.get("source_type")
            if source_type in {"asset", "vulnerability"}:
                return False

        normalized = cls.normalize(query)
        tokens = set(cls.tokens(normalized))
        return bool(tokens & cls.GOVERNANCE_TRIGGERS)

    @classmethod
    def is_action_query(cls, query: str) -> bool:
        return bool(set(cls.tokens(cls.normalize(query))) & cls.ACTION_TRIGGERS)

    @classmethod
    def find_internal_controls(cls, query: str, terms: set[str], limit: int) -> list[InternalControl]:
        queryset = (
            InternalControl.objects.filter(is_active=True)
            .prefetch_related(
                Prefetch(
                    "framework_mappings",
                    queryset=InternalControlFrameworkMapping.objects.select_related(
                        "framework_control",
                        "framework_control__framework",
                        "framework_control__section",
                    ),
                ),
                Prefetch(
                    "policy_links",
                    queryset=PolicyInternalControl.objects.select_related("policy"),
                ),
                Prefetch(
                    "document_links",
                    queryset=GovernanceDocumentControl.objects.select_related("document"),
                ),
                Prefetch(
                    "mechanism_links",
                    queryset=InternalControlMechanism.objects.select_related("mechanism"),
                ),
            )
            .order_by("code")
        )
        return cls.rank(
            query,
            list(queryset[: cls.MAX_SCAN]),
            [
                "code",
                "title",
                "description",
                "control_domain",
                "objective",
                "risk_statement",
                "owner_role",
            ],
            terms,
            limit,
        )

    @classmethod
    def find_governance_documents(cls, query: str, terms: set[str], limit: int) -> list[GovernanceDocument]:
        queryset = (
            GovernanceDocument.objects.filter(is_active=True)
            .select_related("parent_document", "legacy_policy")
            .prefetch_related("sections")
            .order_by("document_type", "title")
        )
        return cls.rank(
            query,
            list(queryset[: cls.MAX_SCAN]),
            ["title", "document_type", "version", "status", "owner", "scope", "purpose", "content"],
            terms,
            limit,
        )

    @classmethod
    def find_policies(cls, query: str, terms: set[str], limit: int) -> list[Policy]:
        queryset = Policy.objects.prefetch_related("internal_control_links__internal_control").order_by("code")
        return cls.rank(
            query,
            list(queryset[: cls.MAX_SCAN]),
            ["code", "title", "description", "objective", "scope", "owner", "status"],
            terms,
            limit,
        )

    @classmethod
    def find_mechanisms(cls, query: str, terms: set[str], limit: int) -> list[Mechanism]:
        queryset = Mechanism.objects.prefetch_related("internal_control_links__internal_control").order_by("title")
        return cls.rank(query, list(queryset[: cls.MAX_SCAN]), ["title", "description", "mechanism_type"], terms, limit)

    @classmethod
    def find_evidence_items(cls, query: str, terms: set[str], limit: int) -> list[EvidenceItem]:
        queryset = EvidenceItem.objects.filter(is_active=True).prefetch_related("links").order_by("title")
        return cls.rank(
            query,
            list(queryset[: cls.MAX_SCAN]),
            ["title", "description", "evidence_type", "source", "external_reference", "owner", "status"],
            terms,
            limit,
        )

    @classmethod
    def find_governance_actions(cls, query: str, terms: set[str], limit: int) -> list[GovernanceAction]:
        queryset = (
            GovernanceAction.objects.select_related("linked_decision", "linked_exception")
            .exclude(status=GovernanceAction.Status.CANCELLED)
            .order_by("status", "due_date", "-created_at")
        )
        return cls.rank(
            query,
            list(queryset[: cls.MAX_SCAN]),
            [
                "action_type",
                "title",
                "description",
                "recommendation",
                "target_type",
                "source_type",
                "owner",
                "priority",
                "status",
                "required_roles",
                "required_materials",
                "expected_evidence",
                "ai_rationale",
                "dependency_notes",
                "notes",
            ],
            terms,
            limit,
        )

    @classmethod
    def internal_control_chunks(cls, controls: list[InternalControl]) -> list[dict]:
        chunks = []
        for control in controls:
            framework_mappings = [
                mapping
                for mapping in control.framework_mappings.all()
                if mapping.validation_status == InternalControlFrameworkMapping.ValidationStatus.APPROVED
            ]
            policy_links = [
                link
                for link in control.policy_links.all()
                if link.validation_status == PolicyInternalControl.ValidationStatus.APPROVED
            ]
            document_links = [
                link
                for link in control.document_links.all()
                if link.validation_status == link.ValidationStatus.APPROVED
            ]
            mechanism_links = [
                link
                for link in control.mechanism_links.all()
                if link.validation_status == InternalControlMechanism.ValidationStatus.APPROVED
            ]

            score_text = cls.score_text("internal_control", control)
            chunk_text = (
                f"Controlo interno: {control.code} - {control.title}. "
                f"Dominio: {cls.label(control.control_domain)}. "
                f"Criticalidade: {control.criticality}. Estado: {control.status}. "
                f"Objetivo: {cls.label(control.objective)}. "
                f"Risco tratado: {cls.label(control.risk_statement)}. "
                f"Descricao: {cls.label(control.description)}. "
                f"Politicas internas associadas: {cls.policy_link_text(policy_links)}. "
                f"Documentos de governacao associados: {cls.document_link_text(document_links)}. "
                f"Mecanismos associados: {cls.mechanism_link_text(mechanism_links)}. "
                f"Framework controls impactados por mapeamentos aprovados: {cls.framework_mapping_text(framework_mappings)}. "
                f"{score_text}"
            )
            chunks.append(
                {
                    "title": f"{control.code} - {control.title}",
                    "chunk_text": chunk_text,
                    "source_type": "internal_control",
                    "source_ref": str(control.id),
                    "control_code": control.code,
                    "score": 1.0,
                    "priority": cls.SOURCE_PRIORITY["internal_control"],
                    "metadata": {
                        "internal_control_id": str(control.id),
                        "internal_control_code": control.code,
                        "control_domain": control.control_domain,
                        "criticality": control.criticality,
                        "status": control.status,
                    },
                }
            )
        return chunks

    @classmethod
    def governance_document_chunks(cls, documents: list[GovernanceDocument]) -> list[dict]:
        chunks = []
        for document in documents:
            sections = cls.section_text(document.sections.all()[:6])
            related_controls = [
                link
                for link in document.control_links.select_related("internal_control").all()[:10]
                if link.validation_status == link.ValidationStatus.APPROVED
            ]
            chunk_text = (
                f"Documento de governacao: {document.title}. "
                f"Tipo: {document.document_type}. Versao: {document.version}. Estado: {document.status}. "
                f"Owner: {cls.label(document.owner)}. "
                f"Documento pai: {cls.label(getattr(document.parent_document, 'title', ''))}. "
                f"Ambito: {cls.label(document.scope)}. Proposito: {cls.label(document.purpose)}. "
                f"Conteudo: {cls.short(document.content, 900)}. "
                f"Secoes: {sections}. "
                f"Controlos internos associados: {cls.internal_control_text([link.internal_control for link in related_controls])}."
            )
            chunks.append(
                {
                    "title": document.title,
                    "chunk_text": chunk_text,
                    "source_type": "governance_document",
                    "source_ref": str(document.id),
                    "score": 0.95,
                    "priority": cls.SOURCE_PRIORITY["governance_document"],
                    "metadata": {
                        "governance_document_id": str(document.id),
                        "document_type": document.document_type,
                        "status": document.status,
                    },
                }
            )
        return chunks

    @classmethod
    def policy_chunks(cls, policies: list[Policy]) -> list[dict]:
        chunks = []
        for policy in policies:
            links = [
                link
                for link in policy.internal_control_links.select_related("internal_control").all()[:10]
                if link.validation_status == PolicyInternalControl.ValidationStatus.APPROVED
            ]
            score_text = cls.score_text("policy", policy)
            chunk_text = (
                f"Politica interna: {policy.code} - {policy.title}. "
                f"Estado: {policy.status}. Versao: {policy.version}. Owner: {cls.label(policy.owner)}. "
                f"Objetivo: {cls.label(policy.objective)}. Ambito: {cls.label(policy.scope)}. "
                f"Descricao: {cls.label(policy.description)}. "
                f"Controlos internos associados: {cls.internal_control_text([link.internal_control for link in links])}. "
                f"{score_text}"
            )
            chunks.append(
                {
                    "title": f"{policy.code} - {policy.title}",
                    "chunk_text": chunk_text,
                    "source_type": "policy_internal_control",
                    "source_ref": str(policy.id),
                    "score": 0.9,
                    "priority": cls.SOURCE_PRIORITY["policy_internal_control"],
                    "metadata": {"policy_id": str(policy.id), "policy_code": policy.code, "status": policy.status},
                }
            )
        return chunks

    @classmethod
    def mechanism_chunks(cls, mechanisms: list[Mechanism]) -> list[dict]:
        chunks = []
        for mechanism in mechanisms:
            links = [
                link
                for link in mechanism.internal_control_links.select_related("internal_control").all()[:10]
                if link.validation_status == InternalControlMechanism.ValidationStatus.APPROVED
            ]
            chunk_text = (
                f"Mecanismo reutilizavel: {mechanism.title}. "
                f"Tipo: {mechanism.mechanism_type}. Descricao: {cls.label(mechanism.description)}. "
                f"Controlos internos suportados: {cls.internal_control_text([link.internal_control for link in links])}. "
                f"Estado por controlo: {cls.mechanism_link_text(links)}."
            )
            chunks.append(
                {
                    "title": mechanism.title,
                    "chunk_text": chunk_text,
                    "source_type": "internal_control_mechanism",
                    "source_ref": str(mechanism.id),
                    "score": 0.85,
                    "priority": cls.SOURCE_PRIORITY["internal_control_mechanism"],
                    "metadata": {"mechanism_id": str(mechanism.id), "mechanism_type": mechanism.mechanism_type},
                }
            )
        return chunks

    @classmethod
    def evidence_item_chunks(cls, evidence_items: list[EvidenceItem]) -> list[dict]:
        chunks = []
        for evidence in evidence_items:
            links = [
                link
                for link in evidence.links.all()[:12]
                if link.validation_status == EvidenceLink.ValidationStatus.APPROVED
            ]
            chunk_text = (
                f"Evidencia reutilizavel: {evidence.title}. "
                f"Tipo: {evidence.evidence_type}. Estado: {evidence.status}. "
                f"Valida ate: {cls.label(evidence.valid_until)}. "
                f"Confianca: {cls.decimal_text(evidence.confidence_level)}. "
                f"Descricao: {cls.label(evidence.description)}. "
                f"Fonte: {cls.label(evidence.source or evidence.external_reference)}. "
                f"Ligacoes aprovadas: {cls.evidence_link_text(links)}."
            )
            chunks.append(
                {
                    "title": evidence.title,
                    "chunk_text": chunk_text,
                    "source_type": "evidence_item",
                    "source_ref": str(evidence.id),
                    "score": 0.8,
                    "priority": cls.SOURCE_PRIORITY["evidence_item"],
                    "metadata": {
                        "evidence_item_id": str(evidence.id),
                        "evidence_type": evidence.evidence_type,
                        "status": evidence.status,
                    },
                }
            )
        return chunks

    @classmethod
    def governance_action_chunks(cls, actions: list[GovernanceAction]) -> list[dict]:
        chunks = []
        for action in actions:
            target_label = cls.action_target_label(action)
            chunk_text = (
                f"Tarefa de governacao: {action.title}. "
                f"Tipo: {action.action_type}. Prioridade: {action.priority}. Estado: {action.status}. "
                f"Owner: {cls.label(action.owner)}. Prazo: {cls.label(action.due_date)}. "
                f"Atrasada: {'sim' if action.is_overdue else 'nao'}. "
                f"Alvo: {target_label}. Fonte: {action.source_type}. "
                f"Descricao: {cls.label(action.description)}. "
                f"Recomendacao: {cls.label(action.recommendation)}. "
                f"Como executar: {cls.label(action.notes)}. "
                f"Recursos humanos: {cls.label(action.required_roles)}. "
                f"Recursos materiais: {cls.label(action.required_materials)}. "
                f"Dependencias: {cls.label(action.dependency_notes)}. "
                f"Evidencia obrigatoria: {'sim' if action.evidence_required else 'nao'}. "
                f"Evidencia esperada: {cls.label(action.expected_evidence)}. "
                f"Impacto no score: {cls.decimal_text(action.score_impact)}."
            )
            chunks.append(
                {
                    "title": action.title,
                    "chunk_text": chunk_text,
                    "source_type": "governance_action",
                    "source_ref": str(action.id),
                    "score": 0.82,
                    "priority": cls.SOURCE_PRIORITY["governance_action"],
                    "metadata": {
                        "governance_action_id": str(action.id),
                        "action_type": action.action_type,
                        "priority": action.priority,
                        "status": action.status,
                        "target_type": action.target_type,
                        "target_id": str(action.target_id or ""),
                        "owner": action.owner,
                        "due_date": action.due_date.isoformat() if action.due_date else None,
                        "is_overdue": action.is_overdue,
                    },
                }
            )
        return chunks

    @classmethod
    def score_text(cls, target_type: str, obj) -> str:
        try:
            if target_type == "internal_control":
                result = CompliancePropagationEngine.calculate_internal_control(
                    obj, mode="official", include_details=False, include_gaps=True
                )
            elif target_type == "policy":
                result = CompliancePropagationEngine.calculate_policy(
                    obj, mode="official", include_details=False, include_gaps=True
                )
            else:
                return ""
        except Exception:
            logger.exception("[GOVERNANCE_CONTEXT_ADAPTER] Failed to calculate %s score", target_type)
            return ""

        gap_types = [gap.get("type") for gap in result.get("gaps", [])[:4] if gap.get("type")]
        gap_text = ", ".join(gap_types) if gap_types else "sem gaps principais no calculo oficial"
        return f"Score oficial por propagacao: {result.get('score')}% ({result.get('status')}); gaps: {gap_text}."

    @classmethod
    def rank(cls, query: str, objects: list, fields: list[str], terms: set[str], limit: int) -> list:
        if limit <= 0:
            return []

        scored = []
        normalized_query = cls.normalize(query)
        rank_terms = terms or cls.key_terms(query, include_generic=True)

        for obj in objects:
            haystack = cls.normalize(" ".join(str(getattr(obj, field, "") or "") for field in fields))
            score = 0
            for term in rank_terms:
                if term and term in haystack:
                    score += 5 if len(term) >= 5 else 2
            code = cls.normalize(str(getattr(obj, "code", "") or ""))
            if code and code in normalized_query:
                score += 20
            title = cls.normalize(str(getattr(obj, "title", "") or getattr(obj, "name", "") or ""))
            if title and title in normalized_query:
                score += 15
            if score:
                scored.append((score, obj))

        if not scored and cls.should_run(query):
            scored = [(1, obj) for obj in objects[:limit]]

        scored.sort(key=lambda item: (-item[0], str(item[1])))
        return [obj for _, obj in scored[:limit]]

    @classmethod
    def key_terms(cls, query: str, include_generic: bool = False) -> set[str]:
        normalized = cls.normalize(query)
        terms = set()
        for token in cls.tokens(normalized):
            if len(token) < 3 or token in cls.STOPWORDS:
                continue
            if not include_generic and token in cls.GENERIC_TERMS:
                continue
            terms.add(token)
        return terms

    @staticmethod
    def normalize(text: str) -> str:
        text = (text or "").lower().strip()
        return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")

    @staticmethod
    def tokens(text: str) -> list[str]:
        return re.findall(r"[a-z0-9]+", text or "")

    @classmethod
    def deduplicate(cls, chunks: list[dict]) -> list[dict]:
        seen = set()
        unique = []
        for chunk in chunks:
            key = (chunk.get("source_type"), str(chunk.get("source_ref")))
            if key in seen:
                continue
            seen.add(key)
            unique.append(chunk)
        return unique

    @staticmethod
    def label(value) -> str:
        if value in (None, ""):
            return "Nao definido"
        return str(value)

    @classmethod
    def short(cls, value, limit: int = 600) -> str:
        text = cls.label(value)
        if len(text) <= limit:
            return text
        return text[: limit - 3].rstrip() + "..."

    @staticmethod
    def decimal_text(value) -> str:
        if value is None:
            return "Nao definido"
        if isinstance(value, Decimal):
            return str(value.normalize())
        return str(value)

    @classmethod
    def policy_link_text(cls, links) -> str:
        values = [
            f"{link.policy.code} - {link.policy.title} ({link.applicability}, {link.validation_status})"
            for link in links
        ]
        return "; ".join(values) if values else "Nao definido"

    @classmethod
    def document_link_text(cls, links) -> str:
        values = [
            f"{link.document.title} ({link.document.document_type}, {link.purpose}, {link.validation_status})"
            for link in links
        ]
        return "; ".join(values) if values else "Nao definido"

    @classmethod
    def mechanism_link_text(cls, links) -> str:
        values = [
            (
                f"{link.mechanism.title} ({link.relationship_type}, estado={link.implementation_status}, "
                f"peso={cls.decimal_text(link.contribution_weight)}, obrigatorio={'sim' if link.mandatory else 'nao'}, "
                f"{link.validation_status})"
            )
            for link in links
        ]
        return "; ".join(values) if values else "Nao definido"

    @staticmethod
    def framework_mapping_text(mappings) -> str:
        values = []
        for mapping in mappings:
            control = mapping.framework_control
            framework = control.framework
            values.append(
                (
                    f"{framework.code} {framework.version}:{control.code} - {control.title} "
                    f"({mapping.relationship_type}, cobertura={mapping.coverage_percentage}%, "
                    f"validacao={mapping.validation_status})"
                )
            )
        return "; ".join(values) if values else "Nao definido"

    @staticmethod
    def internal_control_text(controls) -> str:
        values = [f"{control.code} - {control.title}" for control in controls]
        return "; ".join(values) if values else "Nao definido"

    @staticmethod
    def section_text(sections: list[GovernanceDocumentSection]) -> str:
        values = [
            f"{section.section_number or section.order} {section.title}: {(section.content or '')[:300]}"
            for section in sections
        ]
        return " | ".join(values) if values else "Nao definido"

    @staticmethod
    def evidence_link_text(links) -> str:
        values = [
            f"{link.target_type}:{link.target_id} ({link.link_type}, {link.validation_status})"
            for link in links
        ]
        return "; ".join(values) if values else "Nao definido"

    @classmethod
    def action_target_label(cls, action: GovernanceAction) -> str:
        if not action.target_type or not action.target_id:
            return "Nao definido"
        return f"{action.target_type}:{action.target_id}"
