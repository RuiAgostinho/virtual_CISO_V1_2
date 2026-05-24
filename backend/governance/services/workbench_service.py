from datetime import timedelta

from django.apps import apps
from django.db.models import Count, Q
from django.utils import timezone

from governance.models import (
    Control,
    EvidenceItem,
    EvidenceLink,
    Framework,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceException,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
)


class GovernanceWorkbenchService:
    """Fast operational overview for the Governance Workbench.

    This service deliberately avoids the traceability and propagation engines:
    the workbench needs a compact operational snapshot, not deep per-entity
    traversal. All figures are calculated directly from persisted data.
    """

    ACTIVE_MAPPING_STATUSES = ("draft", "pending_review", "approved")
    INACTIVE_MAPPING_STATUSES = ("rejected", "deprecated")
    LIMIT = 12

    @classmethod
    def overview(cls):
        today = timezone.localdate()

        policy_control_policy_ids = (
            PolicyInternalControl.objects.exclude(
                validation_status__in=cls.INACTIVE_MAPPING_STATUSES
            )
            .values_list("policy_id", flat=True)
            .distinct()
        )
        policies_without_controls = Policy.objects.exclude(
            id__in=policy_control_policy_ids
        ).order_by("code", "title")
        policies_without_owner = Policy.objects.filter(
            Q(owner__isnull=True) | Q(owner="")
        ).order_by("code", "title")

        document_control_document_ids = (
            GovernanceDocumentControl.objects.exclude(
                validation_status__in=cls.INACTIVE_MAPPING_STATUSES
            )
            .values_list("document_id", flat=True)
            .distinct()
        )
        documents_without_controls = GovernanceDocument.objects.filter(
            is_active=True
        ).exclude(id__in=document_control_document_ids)
        overdue_documents = GovernanceDocument.objects.filter(
            is_active=True,
            review_date__lt=today,
        ).order_by("review_date", "title")

        mechanism_control_ids = (
            InternalControlMechanism.objects.exclude(
                validation_status__in=cls.INACTIVE_MAPPING_STATUSES
            )
            .values_list("internal_control_id", flat=True)
            .distinct()
        )
        controls_without_mechanisms = InternalControl.objects.filter(
            is_active=True
        ).exclude(id__in=mechanism_control_ids)

        approved_framework_control_ids = (
            InternalControlFrameworkMapping.objects.filter(
                validation_status="approved"
            )
            .values_list("internal_control_id", flat=True)
            .distinct()
        )
        controls_without_framework = InternalControl.objects.filter(
            is_active=True
        ).exclude(id__in=approved_framework_control_ids)

        mechanism_ids_with_valid_evidence = cls._mechanism_ids_with_valid_evidence(today)
        mechanisms_without_evidence = Mechanism.objects.exclude(
            id__in=mechanism_ids_with_valid_evidence
        ).order_by("title")

        expired_evidence = EvidenceItem.objects.filter(is_active=True).filter(
            Q(status="expired") | Q(valid_until__lt=today)
        ).order_by("valid_until", "title")

        active_exceptions = cls._active_exceptions(today)
        pending_exceptions = GovernanceException.objects.filter(
            approval_status=GovernanceException.ApprovalStatus.PENDING_REVIEW
        ).order_by("valid_until", "title")
        expired_exceptions = GovernanceException.objects.filter(
            Q(approval_status=GovernanceException.ApprovalStatus.EXPIRED)
            | Q(approval_status=GovernanceException.ApprovalStatus.APPROVED, valid_until__lt=today)
        ).order_by("valid_until", "title")
        expiring_exceptions = active_exceptions.filter(
            valid_until__isnull=False,
            valid_until__lte=today + timedelta(days=30),
        ).order_by("valid_until", "title")

        mapping_counts = cls._mapping_status_counts()
        framework_coverage = cls._framework_coverage()

        mappings_without_rationale = cls._mapping_count_without_rationale()
        low_confidence_mappings = cls._low_confidence_mapping_count()
        low_coverage_frameworks = [
            item for item in framework_coverage if item["total_controls"] > 0 and item["coverage"] < 60
        ]

        work_items = [
            cls._work_item(
                "pending_mappings",
                "validation",
                "high" if mapping_counts["pending_review"] else "info",
                "Mapeamentos pendentes de validacao",
                "Relacoes em pending_review ainda nao contam como oficiais.",
                mapping_counts["pending_review"],
                "/governance/mapping-review?status=pending_review",
                "Validar mappings",
            ),
            cls._work_item(
                "draft_mappings",
                "validation",
                "medium" if mapping_counts["draft"] else "info",
                "Mapeamentos em rascunho",
                "Mappings draft podem ser uteis para trabalho em curso, mas ainda nao contam como oficiais.",
                mapping_counts["draft"],
                "/governance/mapping-review?status=draft",
                "Rever rascunhos",
            ),
            cls._work_item(
                "missing_rationale",
                "validation",
                "medium" if mappings_without_rationale else "info",
                "Mappings sem rationale",
                "Relacoes sem justificacao sao mais dificeis de defender em auditoria.",
                mappings_without_rationale,
                "/governance/mapping-review",
                "Completar rationale",
            ),
            cls._work_item(
                "policies_without_owner",
                "documents",
                "medium" if policies_without_owner.exists() else "info",
                "Politicas sem owner",
                "Cada politica deve ter responsabilidade clara por aprovacao, revisao e manutencao.",
                policies_without_owner.count(),
                "/governance/policies",
                "Atribuir owners",
            ),
            cls._work_item(
                "policies_without_controls",
                "documents",
                "high" if policies_without_controls.exists() else "info",
                "Politicas sem controlos internos",
                "Uma politica sem controlos internos associados fica desligada da conformidade por propagacao.",
                policies_without_controls.count(),
                "/governance/policies",
                "Associar controlos",
            ),
            cls._work_item(
                "documents_without_controls",
                "documents",
                "medium" if documents_without_controls.exists() else "info",
                "Documentos sem controlos internos",
                "Documentos de governacao sem controlos associados ainda nao contribuem para rastreabilidade.",
                documents_without_controls.count(),
                "/governance/documents",
                "Associar controlos",
            ),
            cls._work_item(
                "overdue_documents",
                "documents",
                "high" if overdue_documents.exists() else "info",
                "Documentos com revisao vencida",
                "Documentos vencidos precisam de revisao para manter validade operacional.",
                overdue_documents.count(),
                "/governance/documents",
                "Rever documentos",
            ),
            cls._work_item(
                "controls_without_mechanisms",
                "controls",
                "high" if controls_without_mechanisms.exists() else "info",
                "Controlos internos sem mecanismos",
                "Um controlo interno sem mecanismos nao tem implementacao operacional associada.",
                controls_without_mechanisms.count(),
                "/governance/mapping-review?type=internal_control_mechanism",
                "Associar mecanismos",
            ),
            cls._work_item(
                "controls_without_framework",
                "controls",
                "medium" if controls_without_framework.exists() else "info",
                "Controlos sem framework oficial",
                "Controlos internos sem mapping aprovado nao propagam conformidade para frameworks externas.",
                controls_without_framework.count(),
                "/governance/mapping-review?type=internal_control_framework_mapping",
                "Mapear frameworks",
            ),
            cls._work_item(
                "mechanisms_without_evidence",
                "mechanisms",
                "high" if mechanisms_without_evidence.exists() else "info",
                "Mecanismos sem evidencia valida",
                "Mecanismos sem evidencia real valida e aprovada nao provam implementacao.",
                mechanisms_without_evidence.count(),
                "/governance/evidence",
                "Recolher evidencia",
            ),
            cls._work_item(
                "expired_evidence",
                "evidence",
                "high" if expired_evidence.exists() else "info",
                "Evidencias expiradas",
                "Evidencias expiradas nao devem contar para score oficial.",
                expired_evidence.count(),
                "/governance/evidence",
                "Atualizar evidencias",
            ),
            cls._work_item(
                "pending_exceptions",
                "exceptions",
                "high" if pending_exceptions.exists() else "info",
                "Excecoes por aprovar",
                "Excecoes e aceitacoes de risco em pending_review ainda nao formalizam decisao do CISO.",
                pending_exceptions.count(),
                "/governance/exceptions",
                "Aprovar excecoes",
            ),
            cls._work_item(
                "expired_exceptions",
                "exceptions",
                "high" if expired_exceptions.exists() else "info",
                "Excecoes expiradas",
                "Excecoes expiradas deixam de justificar desvios operacionais e devem ser renovadas ou encerradas.",
                expired_exceptions.count(),
                "/governance/exceptions",
                "Rever expiradas",
            ),
            cls._work_item(
                "expiring_exceptions",
                "exceptions",
                "medium" if expiring_exceptions.exists() else "info",
                "Excecoes a expirar",
                "Excecoes aprovadas que terminam nos proximos 30 dias precisam de revisao.",
                expiring_exceptions.count(),
                "/governance/exceptions",
                "Planear revisao",
            ),
            cls._work_item(
                "low_confidence_mappings",
                "scores",
                "medium" if low_confidence_mappings else "info",
                "Mappings com baixa confianca",
                "Mappings abaixo de 60% devem ser revistos antes de serem usados como base de decisao.",
                low_confidence_mappings,
                "/governance/mapping-review",
                "Rever confianca",
            ),
            cls._work_item(
                "low_coverage_frameworks",
                "scores",
                "medium" if low_coverage_frameworks else "info",
                "Frameworks com baixa cobertura",
                "Frameworks com menos de 60% dos controlos externos mapeados exigem trabalho de cobertura.",
                len(low_coverage_frameworks),
                "/governance/framework-mapping/wizard",
                "Aumentar coverage",
            ),
        ]

        return {
            "generated_at": timezone.now().isoformat(),
            "totals": {
                "policies": Policy.objects.count(),
                "governance_documents": GovernanceDocument.objects.count(),
                "internal_controls": InternalControl.objects.filter(is_active=True).count(),
                "mechanisms": Mechanism.objects.count(),
                "evidence_items": EvidenceItem.objects.filter(is_active=True).count(),
                "frameworks": Framework.objects.filter(is_active=True).count(),
                "mappings_approved": mapping_counts["approved"],
                "mappings_pending_review": mapping_counts["pending_review"],
                "mappings_draft": mapping_counts["draft"],
                "mappings_rejected": mapping_counts["rejected"],
                "mappings_deprecated": mapping_counts["deprecated"],
                "governance_exceptions_active": active_exceptions.count(),
                "governance_exceptions_pending": pending_exceptions.count(),
                "governance_exceptions_expired": expired_exceptions.count(),
                "governance_exceptions_expiring": expiring_exceptions.count(),
            },
            "metrics": {
                "total_attention": sum(item["count"] for item in work_items),
                "critical_categories": sum(1 for item in work_items if item["severity"] == "critical" and item["count"]),
                "high_categories": sum(1 for item in work_items if item["severity"] == "high" and item["count"]),
                "pending_review": mapping_counts["pending_review"],
                "controls_without_mechanisms": controls_without_mechanisms.count(),
                "expired_evidence": expired_evidence.count(),
                "active_exceptions": active_exceptions.count(),
                "expired_exceptions": expired_exceptions.count(),
            },
            "work_items": sorted(
                work_items,
                key=lambda item: (
                    {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}[item["severity"]],
                    -item["count"],
                    item["title"],
                ),
            ),
            "lists": {
                "policies_without_controls": cls._serialize_policies(policies_without_controls[: cls.LIMIT]),
                "controls_without_framework": cls._serialize_internal_controls(controls_without_framework[: cls.LIMIT]),
                "controls_without_mechanisms": cls._serialize_internal_controls(controls_without_mechanisms[: cls.LIMIT]),
                "mechanisms_without_evidence": cls._serialize_mechanisms(mechanisms_without_evidence[: cls.LIMIT]),
                "expired_evidence": cls._serialize_evidence(expired_evidence[: cls.LIMIT], today),
                "overdue_documents": cls._serialize_documents(overdue_documents[: cls.LIMIT]),
                "governance_exceptions": cls._serialize_exceptions(
                    list(pending_exceptions[: cls.LIMIT])
                    + list(expired_exceptions[: cls.LIMIT])
                    + list(expiring_exceptions[: cls.LIMIT])
                )[: cls.LIMIT],
            },
            "framework_coverage": framework_coverage,
            "gaps": cls._operational_gaps(
                policies_without_controls,
                controls_without_framework,
                controls_without_mechanisms,
                mechanisms_without_evidence,
                expired_evidence,
                pending_exceptions,
                expired_exceptions,
            ),
        }

    @classmethod
    def _mapping_models(cls):
        return (
            PolicyInternalControl,
            GovernanceDocumentControl,
            InternalControlFrameworkMapping,
            InternalControlMechanism,
            EvidenceLink,
        )

    @classmethod
    def _mapping_status_counts(cls):
        counts = {
            "approved": 0,
            "pending_review": 0,
            "draft": 0,
            "rejected": 0,
            "deprecated": 0,
        }
        for model in cls._mapping_models():
            for item in model.objects.values("validation_status").annotate(total=Count("id")):
                status = item["validation_status"]
                if status in counts:
                    counts[status] += item["total"]
        return counts

    @classmethod
    def _mapping_count_without_rationale(cls):
        total = 0
        for model in cls._mapping_models():
            total += (
                model.objects.exclude(validation_status__in=cls.INACTIVE_MAPPING_STATUSES)
                .filter(Q(rationale__isnull=True) | Q(rationale=""))
                .count()
            )
        return total

    @classmethod
    def _low_confidence_mapping_count(cls):
        total = 0
        for model in cls._mapping_models():
            total += (
                model.objects.exclude(validation_status__in=cls.INACTIVE_MAPPING_STATUSES)
                .filter(confidence_score__gt=0, confidence_score__lt=60)
                .count()
            )
        return total

    @classmethod
    def _mechanism_ids_with_valid_evidence(cls, today):
        return (
            EvidenceLink.objects.filter(
                target_type="mechanism",
                validation_status="approved",
                evidence_item__is_active=True,
                evidence_item__status="valid",
            )
            .filter(Q(evidence_item__valid_until__isnull=True) | Q(evidence_item__valid_until__gte=today))
            .values_list("target_id", flat=True)
            .distinct()
        )

    @staticmethod
    def _active_exceptions(today):
        return (
            GovernanceException.objects.filter(
                approval_status=GovernanceException.ApprovalStatus.APPROVED,
            )
            .filter(Q(valid_from__isnull=True) | Q(valid_from__lte=today))
            .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=today))
        )

    @classmethod
    def _framework_coverage(cls):
        total_by_framework = {
            item["framework_id"]: item["total"]
            for item in Control.objects.values("framework_id").annotate(total=Count("id"))
        }
        mapped_by_framework = {
            item["framework_control__framework_id"]: item["mapped"]
            for item in InternalControlFrameworkMapping.objects.filter(validation_status="approved")
            .values("framework_control__framework_id")
            .annotate(mapped=Count("framework_control_id", distinct=True))
        }

        coverage = []
        for framework in Framework.objects.filter(is_active=True).order_by("code", "version"):
            total = total_by_framework.get(framework.id, 0)
            mapped = mapped_by_framework.get(framework.id, 0)
            percent = round((mapped / total) * 100, 1) if total else 0
            coverage.append(
                {
                    "framework": cls._serialize_framework(framework),
                    "total_controls": total,
                    "mapped_controls": mapped,
                    "coverage": percent,
                }
            )
        return coverage

    @classmethod
    def _operational_gaps(
        cls,
        policies_without_controls,
        controls_without_framework,
        controls_without_mechanisms,
        mechanisms_without_evidence,
        expired_evidence,
        pending_exceptions,
        expired_exceptions,
    ):
        raw = [
            (
                "policy_without_internal_controls",
                "high",
                policies_without_controls.count(),
                "Politicas sem controlos internos associados.",
                "Associar controlos internos para permitir rastreabilidade e scoring por propagacao.",
            ),
            (
                "internal_control_without_framework_mapping",
                "medium",
                controls_without_framework.count(),
                "Controlos internos sem mapping aprovado para frameworks.",
                "Criar ou aprovar mapeamentos para frameworks externas.",
            ),
            (
                "internal_control_without_mechanisms",
                "high",
                controls_without_mechanisms.count(),
                "Controlos internos sem mecanismos de implementacao.",
                "Associar mecanismos reutilizaveis aos controlos internos.",
            ),
            (
                "mechanism_without_valid_evidence",
                "high",
                mechanisms_without_evidence.count(),
                "Mecanismos sem evidencia real valida e aprovada.",
                "Recolher evidencia ou aprovar EvidenceLinks existentes.",
            ),
            (
                "expired_evidence",
                "high",
                expired_evidence.count(),
                "Evidencias expiradas.",
                "Atualizar ou substituir evidencias expiradas.",
            ),
            (
                "pending_governance_exceptions",
                "high",
                pending_exceptions.count(),
                "Excecoes e aceitacoes de risco pendentes de aprovacao.",
                "Validar, rejeitar ou pedir correcao antes de usar como justificacao formal.",
            ),
            (
                "expired_governance_exceptions",
                "high",
                expired_exceptions.count(),
                "Excecoes ou aceitacoes de risco expiradas.",
                "Renovar, revogar ou converter em acao de mitigacao.",
            ),
        ]
        return [
            {
                "type": gap_type,
                "severity": severity,
                "count": count,
                "description": description,
                "recommendation": recommendation,
            }
            for gap_type, severity, count, description, recommendation in raw
            if count
        ]

    @staticmethod
    def _work_item(identifier, category, severity, title, description, count, href, action_label):
        return {
            "id": identifier,
            "category": category,
            "severity": severity,
            "title": title,
            "description": description,
            "count": count,
            "href": href,
            "action_label": action_label,
        }

    @staticmethod
    def _serialize_policy(policy):
        return {
            "id": str(policy.id),
            "code": policy.code,
            "title": policy.title,
            "owner": policy.owner or "",
            "status": policy.status,
            "review_date": policy.review_date.isoformat() if policy.review_date else None,
        }

    @classmethod
    def _serialize_policies(cls, policies):
        return [cls._serialize_policy(policy) for policy in policies]

    @staticmethod
    def _serialize_internal_control(control):
        return {
            "id": str(control.id),
            "code": control.code,
            "title": control.title,
            "control_domain": control.control_domain,
            "criticality": control.criticality,
            "status": control.status,
        }

    @classmethod
    def _serialize_internal_controls(cls, controls):
        return [cls._serialize_internal_control(control) for control in controls]

    @staticmethod
    def _serialize_mechanism(mechanism):
        return {
            "id": str(mechanism.id),
            "title": mechanism.title,
            "mechanism_type": mechanism.mechanism_type,
            "description": mechanism.description,
        }

    @classmethod
    def _serialize_mechanisms(cls, mechanisms):
        return [cls._serialize_mechanism(mechanism) for mechanism in mechanisms]

    @classmethod
    def _serialize_evidence(cls, evidence_items, today):
        return [cls._serialize_evidence_item(evidence, today) for evidence in evidence_items]

    @staticmethod
    def _serialize_evidence_item(evidence, today):
        expired = evidence.status == "expired" or bool(evidence.valid_until and evidence.valid_until < today)
        return {
            "id": str(evidence.id),
            "title": evidence.title,
            "evidence_type": evidence.evidence_type,
            "status": evidence.status,
            "valid_until": evidence.valid_until.isoformat() if evidence.valid_until else None,
            "expired": expired,
        }

    @staticmethod
    def _serialize_document(document):
        return {
            "id": str(document.id),
            "title": document.title,
            "document_type": document.document_type,
            "status": document.status,
            "owner": document.owner or "",
            "review_date": document.review_date.isoformat() if document.review_date else None,
        }

    @classmethod
    def _serialize_documents(cls, documents):
        return [cls._serialize_document(document) for document in documents]

    @classmethod
    def _serialize_exceptions(cls, exceptions):
        seen = set()
        serialized = []
        for exception in exceptions:
            if exception.id in seen:
                continue
            seen.add(exception.id)
            serialized.append(
                {
                    "id": str(exception.id),
                    "title": exception.title,
                    "exception_type": exception.exception_type,
                    "approval_status": exception.approval_status,
                    "target_type": exception.target_type,
                    "target_id": exception.target_id,
                    "target_label": cls._target_label(exception.target_type, exception.target_id),
                    "valid_until": exception.valid_until.isoformat() if exception.valid_until else None,
                    "owner": exception.owner,
                    "score_impact": float(exception.score_impact),
                }
            )
        return serialized

    @staticmethod
    def _target_label(target_type, target_id):
        model_refs = {
            GovernanceException.TargetType.POLICY: ("governance", "Policy"),
            GovernanceException.TargetType.INTERNAL_CONTROL: ("governance", "InternalControl"),
            GovernanceException.TargetType.FRAMEWORK_CONTROL: ("governance", "Control"),
            GovernanceException.TargetType.MECHANISM: ("governance", "Mechanism"),
            GovernanceException.TargetType.INTERNAL_CONTROL_MECHANISM: ("governance", "InternalControlMechanism"),
            GovernanceException.TargetType.GOVERNANCE_DOCUMENT: ("governance", "GovernanceDocument"),
            GovernanceException.TargetType.RISK: ("risk", "Risk"),
            GovernanceException.TargetType.ASSET: ("risk", "Asset"),
            GovernanceException.TargetType.VULNERABILITY: ("risk", "Vulnerability"),
        }
        model_ref = model_refs.get(target_type)
        if not model_ref:
            return target_id
        try:
            model = apps.get_model(*model_ref)
            target = model.objects.filter(id=target_id).first()
        except Exception:
            target = None
        if not target:
            return target_id
        code = getattr(target, "code", "")
        title = getattr(target, "title", "") or getattr(target, "name", "")
        if code and title:
            return f"{code} - {title}"
        return title or code or str(target)

    @staticmethod
    def _serialize_framework(framework):
        return {
            "id": str(framework.id),
            "code": framework.code,
            "name": framework.name,
            "version": framework.version,
        }
