from collections import defaultdict
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from governance.models import (
    EvidenceItem,
    EvidenceLink,
    InternalControlMechanism,
    Mechanism,
    MechanismEvidenceRequirement,
)


class MechanismEvidenceOverviewService:
    """Read-only evidence overview grouped by reusable mechanism.

    The purpose is to distinguish expected evidence requirements from actual
    collected evidence. Expected evidence comes from MechanismEvidenceRequirement;
    actual evidence comes from EvidenceItem through EvidenceLink to mechanism.
    """

    REAL_EVIDENCE_LINK_TYPES = {
        EvidenceLink.LinkType.EVIDENCES,
        EvidenceLink.LinkType.SUPPORTS,
        EvidenceLink.LinkType.VALIDATES,
        EvidenceLink.LinkType.DEMONSTRATES,
        EvidenceLink.LinkType.PRODUCED_BY,
    }
    EXPECTED_LINK_TYPES = {EvidenceLink.LinkType.REQUIRED_BY}
    INACTIVE_STATUSES = {
        EvidenceLink.ValidationStatus.REJECTED,
        EvidenceLink.ValidationStatus.DEPRECATED,
    }
    ACTIVE_MAPPING_STATUSES = {
        InternalControlMechanism.ValidationStatus.DRAFT,
        InternalControlMechanism.ValidationStatus.PENDING_REVIEW,
        InternalControlMechanism.ValidationStatus.APPROVED,
    }
    IMPLEMENTATION_SCORE_MAP = {
        InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED: Decimal("0"),
        InternalControlMechanism.ImplementationStatus.PLANNED: Decimal("20"),
        InternalControlMechanism.ImplementationStatus.PARTIALLY_IMPLEMENTED: Decimal("40"),
        InternalControlMechanism.ImplementationStatus.IMPLEMENTED: Decimal("70"),
        InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED: Decimal("100"),
    }
    DEFAULT_LIMIT = 200
    MAX_LIMIT = 500

    @classmethod
    def overview(cls, params=None):
        params = params or {}
        today = timezone.localdate()
        mechanisms = cls._mechanisms(params)
        mechanism_ids = [mechanism.id for mechanism in mechanisms]

        links_by_mechanism = cls._links_by_mechanism(mechanism_ids)
        contexts_by_mechanism = cls._contexts_by_mechanism(mechanism_ids)
        requirements_by_mechanism = cls._requirements_by_mechanism(mechanisms, contexts_by_mechanism)

        rows = []
        for mechanism in mechanisms:
            links = links_by_mechanism.get(mechanism.id, [])
            actual_links = [
                link
                for link in links
                if link.link_type in cls.REAL_EVIDENCE_LINK_TYPES
                and link.validation_status not in cls.INACTIVE_STATUSES
            ]
            expected_links = [
                link
                for link in links
                if link.link_type in cls.EXPECTED_LINK_TYPES
                and link.validation_status not in cls.INACTIVE_STATUSES
            ]
            valid_actual_links = [
                link
                for link in actual_links
                if link.validation_status == EvidenceLink.ValidationStatus.APPROVED
                and link.evidence_item.is_score_eligible
            ]
            expired_links = [
                link
                for link in actual_links
                if link.evidence_item.status == EvidenceItem.Status.EXPIRED or link.evidence_item.is_expired
            ]
            pending_links = [
                link
                for link in actual_links
                if link.validation_status == EvidenceLink.ValidationStatus.PENDING_REVIEW
            ]
            draft_links = [
                link
                for link in actual_links
                if link.validation_status == EvidenceLink.ValidationStatus.DRAFT
            ]
            simulation_valid_links = [
                link
                for link in actual_links
                if link.validation_status
                in {
                    EvidenceLink.ValidationStatus.APPROVED,
                    EvidenceLink.ValidationStatus.PENDING_REVIEW,
                }
                and link.evidence_item.is_score_eligible
            ]
            contexts = contexts_by_mechanism.get(mechanism.id, [])
            requirements = requirements_by_mechanism.get(mechanism.id, [])

            official_scores = [
                cls._score_for_context(mechanism, context, has_valid_evidence=bool(valid_actual_links))
                for context in contexts
            ]
            simulation_scores = [
                cls._score_for_context(mechanism, context, has_valid_evidence=bool(simulation_valid_links))
                for context in contexts
            ]
            if not contexts:
                official_scores = [cls._score_for_context(mechanism, None, has_valid_evidence=bool(valid_actual_links))]
                simulation_scores = [cls._score_for_context(mechanism, None, has_valid_evidence=bool(simulation_valid_links))]

            rows.append(
                {
                    "mechanism": cls._mechanism_payload(mechanism),
                    "contexts": [cls._context_payload(context) for context in contexts[:8]],
                    "context_count": len(contexts),
                    "expected_evidence": [cls._requirement_payload(item) for item in requirements[:8]],
                    "expected_evidence_count": len(requirements),
                    "expected_links": [cls._link_payload(link, today) for link in expected_links[:6]],
                    "actual_evidence": [cls._link_payload(link, today) for link in actual_links[:8]],
                    "actual_evidence_count": len(actual_links),
                    "valid_actual_evidence_count": len(valid_actual_links),
                    "expired_evidence_count": len(expired_links),
                    "pending_review_count": len(pending_links),
                    "draft_count": len(draft_links),
                    "validation_counts": cls._validation_counts(actual_links),
                    "official_score": cls._average_score(official_scores),
                    "simulation_score": cls._average_score(simulation_scores),
                    "score_contexts": official_scores[:8],
                    "gaps": cls._row_gaps(
                        mechanism,
                        requirements,
                        actual_links,
                        valid_actual_links,
                        expired_links,
                        official_scores,
                    ),
                }
            )

        filtered_rows = cls._apply_row_filters(rows, params)
        return {
            "generated_at": timezone.now().isoformat(),
            "metrics": cls._metrics(filtered_rows),
            "results": filtered_rows,
        }

    @classmethod
    def _mechanisms(cls, params):
        queryset = Mechanism.objects.all().order_by("title")
        search = str(params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(mechanism_type__icontains=search)
            )
        mechanism_type = str(params.get("mechanism_type") or "").strip()
        if mechanism_type:
            queryset = queryset.filter(mechanism_type=mechanism_type)
        try:
            limit = int(params.get("page_size") or cls.DEFAULT_LIMIT)
        except (TypeError, ValueError):
            limit = cls.DEFAULT_LIMIT
        limit = max(1, min(limit, cls.MAX_LIMIT))
        return list(queryset[:limit])

    @classmethod
    def _links_by_mechanism(cls, mechanism_ids):
        links = (
            EvidenceLink.objects.select_related("evidence_item")
            .filter(target_type=EvidenceLink.TargetType.MECHANISM, target_id__in=mechanism_ids)
            .order_by("evidence_item__title")
        )
        grouped = defaultdict(list)
        for link in links:
            grouped[link.target_id].append(link)
        return grouped

    @classmethod
    def _contexts_by_mechanism(cls, mechanism_ids):
        contexts = (
            InternalControlMechanism.objects.select_related("internal_control", "mechanism")
            .filter(mechanism_id__in=mechanism_ids, validation_status__in=cls.ACTIVE_MAPPING_STATUSES)
            .order_by("internal_control__code")
        )
        grouped = defaultdict(list)
        for context in contexts:
            grouped[context.mechanism_id].append(context)
        return grouped

    @classmethod
    def _requirements_by_mechanism(cls, mechanisms, contexts_by_mechanism):
        exact_requirements = (
            MechanismEvidenceRequirement.objects.select_related("mechanism")
            .filter(is_active=True, mechanism__in=mechanisms)
            .order_by("priority", "title")
        )
        templates = list(
            MechanismEvidenceRequirement.objects.select_related("mechanism")
            .filter(is_active=True, mechanism__isnull=True)
            .order_by("priority", "title")
        )
        grouped = defaultdict(list)
        seen_by_mechanism = defaultdict(set)

        for requirement in exact_requirements:
            grouped[requirement.mechanism_id].append(requirement)
            seen_by_mechanism[requirement.mechanism_id].add(requirement.id)

        for mechanism in mechanisms:
            contexts = contexts_by_mechanism.get(mechanism.id, [])
            domains = {
                str(context.internal_control.control_domain or "").strip()
                for context in contexts
                if context.internal_control_id
            }
            if not domains:
                domains = {""}
            for template in templates:
                if template.id in seen_by_mechanism[mechanism.id]:
                    continue
                if any(template.matches_mechanism(mechanism, domain) for domain in domains):
                    grouped[mechanism.id].append(template)
                    seen_by_mechanism[mechanism.id].add(template.id)
        return grouped

    @classmethod
    def _score_for_context(cls, mechanism, context, has_valid_evidence):
        state = getattr(context, "implementation_status", "") if context else ""
        gaps = []

        if state == InternalControlMechanism.ImplementationStatus.NOT_APPLICABLE:
            score = Decimal("0")
            status = "not_applicable"
        elif state == InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED:
            if has_valid_evidence:
                score = Decimal("100")
            else:
                score = Decimal("70")
                gaps.append(
                    {
                        "type": "implemented_evidenced_without_valid_evidence",
                        "severity": "high",
                        "description": f"Mecanismo '{mechanism.title}' marcado como evidenciado sem evidencia valida aprovada.",
                        "recommendation": "Associar evidencia real valida e aprovada ou baixar o estado operacional.",
                    }
                )
            status = cls._status_from_score(score)
        elif context:
            score = cls.IMPLEMENTATION_SCORE_MAP.get(state, Decimal("0"))
            status = cls._status_from_score(score)
        else:
            score = Decimal("100") if has_valid_evidence else Decimal("0")
            status = cls._status_from_score(score)

        if (
            context
            and context.mandatory
            and state == InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED
        ):
            gaps.append(
                {
                    "type": "mechanism_not_implemented",
                    "severity": "high",
                    "description": f"Mecanismo obrigatorio '{mechanism.title}' ainda nao implementado.",
                    "recommendation": "Planear ou implementar o mecanismo obrigatorio.",
                }
            )
        if not has_valid_evidence and status != "not_applicable":
            gaps.append(
                {
                    "type": "mechanism_without_valid_evidence",
                    "severity": "medium",
                    "description": f"Mecanismo '{mechanism.title}' sem evidencia real valida para score oficial.",
                    "recommendation": "Associar pelo menos uma EvidenceItem valida com EvidenceLink aprovado.",
                }
            )
        recommendations = [gap["recommendation"] for gap in gaps]
        payload = {
            "score": float(score),
            "status": status,
            "gaps": gaps,
            "recommendations": recommendations,
        }
        if context:
            payload.update(
                {
                    "context_id": str(context.id),
                    "internal_control_id": str(context.internal_control_id),
                    "internal_control_code": context.internal_control.code,
                    "internal_control_title": context.internal_control.title,
                    "implementation_status": context.implementation_status,
                    "mandatory": context.mandatory,
                    "validation_status": context.validation_status,
                }
            )
        return payload

    @staticmethod
    def _status_from_score(score):
        if score >= Decimal("90"):
            return "compliant"
        if score >= Decimal("70"):
            return "mostly_compliant"
        if score >= Decimal("40"):
            return "partially_compliant"
        return "non_compliant"

    @staticmethod
    def _average_score(score_payloads):
        values = [Decimal(str(item["score"])) for item in score_payloads if item.get("score") is not None]
        if not values:
            return 0
        return float((sum(values, Decimal("0")) / Decimal(len(values))).quantize(Decimal("0.01")))

    @classmethod
    def _row_gaps(cls, mechanism, requirements, actual_links, valid_actual_links, expired_links, score_payloads):
        gaps = []
        if not requirements:
            gaps.append(
                {
                    "type": "missing_expected_evidence",
                    "severity": "medium",
                    "description": "O mecanismo nao tem tipos de evidencia esperada definidos.",
                    "recommendation": "Definir pelo menos um tipo de evidencia esperada para orientar a recolha.",
                }
            )
        if not actual_links:
            gaps.append(
                {
                    "type": "missing_real_evidence",
                    "severity": "high",
                    "description": "O mecanismo nao tem evidencia real recolhida.",
                    "recommendation": "Recolher ou associar uma EvidenceItem ao mecanismo.",
                }
            )
        elif not valid_actual_links:
            gaps.append(
                {
                    "type": "missing_valid_approved_evidence",
                    "severity": "high",
                    "description": "Existem evidencias ligadas, mas nenhuma e valida, aprovada e elegivel para score oficial.",
                    "recommendation": "Validar EvidenceLinks e garantir que a EvidenceItem esta valida e dentro do prazo.",
                }
            )
        if expired_links:
            gaps.append(
                {
                    "type": "expired_evidence",
                    "severity": "medium",
                    "description": f"{len(expired_links)} evidencia(s) associada(s) estao expiradas.",
                    "recommendation": "Atualizar a evidencia antes de a usar em auditoria.",
                }
            )
        for score in score_payloads:
            for gap in score.get("gaps", [])[:2]:
                gaps.append(gap)
        return gaps[:6]

    @staticmethod
    def _validation_counts(links):
        counts = {
            EvidenceLink.ValidationStatus.DRAFT: 0,
            EvidenceLink.ValidationStatus.PENDING_REVIEW: 0,
            EvidenceLink.ValidationStatus.APPROVED: 0,
            EvidenceLink.ValidationStatus.REJECTED: 0,
            EvidenceLink.ValidationStatus.DEPRECATED: 0,
        }
        for link in links:
            if link.validation_status in counts:
                counts[link.validation_status] += 1
        return counts

    @classmethod
    def _apply_row_filters(cls, rows, params):
        status = str(params.get("evidence_status") or "").strip()
        if status == "missing_real":
            rows = [row for row in rows if row["actual_evidence_count"] == 0]
        elif status == "missing_valid":
            rows = [row for row in rows if row["valid_actual_evidence_count"] == 0]
        elif status == "expired":
            rows = [row for row in rows if row["expired_evidence_count"] > 0]
        elif status == "pending_review":
            rows = [row for row in rows if row["pending_review_count"] > 0]
        elif status == "ready":
            rows = [row for row in rows if row["valid_actual_evidence_count"] > 0]
        return rows

    @classmethod
    def _metrics(cls, rows):
        scores = [Decimal(str(row["official_score"])) for row in rows if row.get("official_score") is not None]
        return {
            "mechanisms": len(rows),
            "expected_evidence": sum(row["expected_evidence_count"] for row in rows),
            "actual_evidence": sum(row["actual_evidence_count"] for row in rows),
            "valid_actual_evidence": sum(row["valid_actual_evidence_count"] for row in rows),
            "mechanisms_without_expected_evidence": sum(1 for row in rows if row["expected_evidence_count"] == 0),
            "mechanisms_without_real_evidence": sum(1 for row in rows if row["actual_evidence_count"] == 0),
            "mechanisms_without_valid_evidence": sum(1 for row in rows if row["valid_actual_evidence_count"] == 0),
            "expired_evidence": sum(row["expired_evidence_count"] for row in rows),
            "pending_review": sum(row["pending_review_count"] for row in rows),
            "average_official_score": float((sum(scores, Decimal("0")) / Decimal(len(scores))).quantize(Decimal("0.01"))) if scores else 0,
        }

    @staticmethod
    def _mechanism_payload(mechanism):
        return {
            "id": str(mechanism.id),
            "title": mechanism.title,
            "description": mechanism.description,
            "mechanism_type": mechanism.mechanism_type,
            "href": f"/governance/mechanisms/{mechanism.id}",
        }

    @staticmethod
    def _context_payload(context):
        return {
            "id": str(context.id),
            "internal_control_id": str(context.internal_control_id),
            "internal_control_code": context.internal_control.code,
            "internal_control_title": context.internal_control.title,
            "relationship_type": context.relationship_type,
            "mandatory": context.mandatory,
            "implementation_status": context.implementation_status,
            "validation_status": context.validation_status,
            "contribution_weight": float(context.contribution_weight),
        }

    @staticmethod
    def _requirement_payload(requirement):
        return {
            "id": str(requirement.id),
            "title": requirement.title,
            "description": requirement.description,
            "evidence_type": requirement.evidence_type,
            "priority": requirement.priority,
            "source": requirement.source,
            "mechanism": str(requirement.mechanism_id) if requirement.mechanism_id else None,
            "mechanism_title": requirement.mechanism.title if requirement.mechanism_id else "",
            "rationale": requirement.rationale,
        }

    @staticmethod
    def _link_payload(link, today):
        evidence = link.evidence_item
        expired = evidence.status == EvidenceItem.Status.EXPIRED or bool(evidence.valid_until and evidence.valid_until < today)
        return {
            "id": str(link.id),
            "evidence_item_id": str(evidence.id),
            "title": evidence.title,
            "description": evidence.description,
            "evidence_type": evidence.evidence_type,
            "evidence_status": evidence.status,
            "validation_status": link.validation_status,
            "link_type": link.link_type,
            "mapping_source": link.mapping_source,
            "valid_until": evidence.valid_until.isoformat() if evidence.valid_until else None,
            "expired": expired,
            "confidence_level": float(evidence.confidence_level),
            "is_score_eligible": evidence.is_score_eligible,
            "source": evidence.source,
            "external_reference": evidence.external_reference,
            "rationale": link.rationale,
            "href": f"/governance/evidence/{evidence.id}",
        }
