from django.db.models import Count, Q
from django.utils import timezone

from ciso_assistant.models import KnowledgeChunk
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


class GovernanceHealthService:
    """Read-only quality snapshot for governance data.

    This service does not create, update, or delete data. It highlights the
    minimum set of gaps that make governance less defensible in audit: missing
    links, overdue execution, missing real evidence, and stale RAG coverage.
    """

    INACTIVE_MAPPING_STATUSES = ("rejected", "deprecated")
    ACTION_OPEN_STATUSES = (
        GovernanceAction.Status.OPEN,
        GovernanceAction.Status.IN_PROGRESS,
        GovernanceAction.Status.BLOCKED,
        GovernanceAction.Status.DEFERRED,
    )
    LIMIT = 15

    @classmethod
    def overview(cls):
        today = timezone.localdate()

        policies_without_controls = cls._policies_without_controls()
        mechanisms_without_evidence = cls._mechanisms_without_valid_evidence(today)
        overdue_tasks = cls._overdue_tasks(today)
        expired_evidence = cls._expired_evidence(today)
        pending_mappings = cls._pending_mappings()
        rag_health = cls._rag_health()

        metrics = {
            "policies_without_controls": policies_without_controls.count(),
            "mechanisms_without_valid_evidence": mechanisms_without_evidence.count(),
            "overdue_tasks": overdue_tasks.count(),
            "expired_evidence": expired_evidence.count(),
            "pending_mappings": sum(item["pending_review"] for item in pending_mappings),
            "draft_mappings": sum(item["draft"] for item in pending_mappings),
            "rag_missing_chunks": sum(item["missing_count"] for item in rag_health),
            "rag_chunks_without_embedding": sum(item["chunks_without_embedding"] for item in rag_health),
        }
        metrics["total_attention"] = sum(
            [
                metrics["policies_without_controls"],
                metrics["mechanisms_without_valid_evidence"],
                metrics["overdue_tasks"],
                metrics["expired_evidence"],
                metrics["pending_mappings"],
                metrics["rag_missing_chunks"],
                metrics["rag_chunks_without_embedding"],
            ]
        )

        return {
            "generated_at": timezone.now().isoformat(),
            "metrics": metrics,
            "sections": cls._sections(metrics),
            "lists": {
                "policies_without_controls": [
                    cls._policy_payload(policy)
                    for policy in policies_without_controls[: cls.LIMIT]
                ],
                "mechanisms_without_valid_evidence": [
                    cls._mechanism_payload(mechanism)
                    for mechanism in mechanisms_without_evidence[: cls.LIMIT]
                ],
                "overdue_tasks": [
                    cls._task_payload(action)
                    for action in overdue_tasks[: cls.LIMIT]
                ],
                "expired_evidence": [
                    cls._evidence_payload(evidence, today)
                    for evidence in expired_evidence[: cls.LIMIT]
                ],
            },
            "pending_mappings": pending_mappings,
            "rag_health": rag_health,
            "recommendations": cls._recommendations(metrics),
        }

    @classmethod
    def _policies_without_controls(cls):
        linked_policy_ids = (
            PolicyInternalControl.objects.exclude(
                validation_status__in=cls.INACTIVE_MAPPING_STATUSES
            )
            .values_list("policy_id", flat=True)
            .distinct()
        )
        return Policy.objects.exclude(id__in=linked_policy_ids).order_by("code", "title")

    @classmethod
    def _mechanisms_without_valid_evidence(cls, today):
        mechanism_ids_with_valid_evidence = (
            EvidenceLink.objects.filter(
                target_type=EvidenceLink.TargetType.MECHANISM,
                validation_status=EvidenceLink.ValidationStatus.APPROVED,
                evidence_item__is_active=True,
                evidence_item__status=EvidenceItem.Status.VALID,
            )
            .filter(Q(evidence_item__valid_until__isnull=True) | Q(evidence_item__valid_until__gte=today))
            .values_list("target_id", flat=True)
            .distinct()
        )
        return (
            Mechanism.objects.exclude(id__in=mechanism_ids_with_valid_evidence)
            .annotate(
                expected_evidence_count=Count(
                    "evidence_requirements",
                    filter=Q(evidence_requirements__is_active=True),
                    distinct=True,
                )
            )
            .order_by("title")
        )

    @classmethod
    def _overdue_tasks(cls, today):
        return (
            GovernanceAction.objects.filter(
                status__in=cls.ACTION_OPEN_STATUSES,
                due_date__lt=today,
            )
            .order_by("due_date", "priority", "title")
        )

    @classmethod
    def _expired_evidence(cls, today):
        return (
            EvidenceItem.objects.filter(is_active=True)
            .filter(Q(status=EvidenceItem.Status.EXPIRED) | Q(valid_until__lt=today))
            .order_by("valid_until", "title")
        )

    @classmethod
    def _pending_mappings(cls):
        mapping_models = [
            {
                "key": "policy_internal_control",
                "label": "Politica -> controlo interno",
                "model": PolicyInternalControl,
                "href": "/governance/mapping-review?type=policy_internal_control",
            },
            {
                "key": "governance_document_control",
                "label": "Documento -> controlo interno",
                "model": GovernanceDocumentControl,
                "href": "/governance/mapping-review?type=governance_document_control",
            },
            {
                "key": "internal_control_framework_mapping",
                "label": "Controlo interno -> framework",
                "model": InternalControlFrameworkMapping,
                "href": "/governance/mapping-review?type=internal_control_framework_mapping",
            },
            {
                "key": "internal_control_mechanism",
                "label": "Controlo interno -> mecanismo",
                "model": InternalControlMechanism,
                "href": "/governance/mapping-review?type=internal_control_mechanism",
            },
            {
                "key": "evidence_link",
                "label": "Evidencia -> entidade",
                "model": EvidenceLink,
                "href": "/governance/mapping-review?type=evidence_link",
            },
        ]
        rows = []
        for item in mapping_models:
            model = item["model"]
            rows.append(
                {
                    "key": item["key"],
                    "label": item["label"],
                    "pending_review": model.objects.filter(validation_status="pending_review").count(),
                    "draft": model.objects.filter(validation_status="draft").count(),
                    "approved": model.objects.filter(validation_status="approved").count(),
                    "rejected": model.objects.filter(validation_status="rejected").count(),
                    "deprecated": model.objects.filter(validation_status="deprecated").count(),
                    "href": item["href"],
                }
            )
        return rows

    @classmethod
    def _rag_health(cls):
        source_specs = [
            ("policy", "Politicas", Policy.objects.all(), "/governance/policies"),
            (
                "internal_control",
                "Controlos internos",
                InternalControl.objects.filter(is_active=True),
                "/admin/rag",
            ),
            (
                "governance_document",
                "Documentos de governacao",
                GovernanceDocument.objects.filter(is_active=True),
                "/governance/documents",
            ),
            (
                "governance_section",
                "Secoes documentais",
                GovernanceDocumentSection.objects.all(),
                "/governance/documents",
            ),
            ("mechanism", "Mecanismos", Mechanism.objects.all(), "/governance/mechanisms"),
            (
                "evidence_item",
                "Evidencias reutilizaveis",
                EvidenceItem.objects.filter(is_active=True),
                "/governance/evidence",
            ),
            (
                "framework_mapping",
                "Mappings controlo-framework",
                InternalControlFrameworkMapping.objects.all(),
                "/governance/mapping-review?type=internal_control_framework_mapping",
            ),
            (
                "internal_control_mechanism",
                "Mappings controlo-mecanismo",
                InternalControlMechanism.objects.all(),
                "/governance/mapping-review?type=internal_control_mechanism",
            ),
            (
                "governance_action",
                "Tarefas de governacao",
                GovernanceAction.objects.all(),
                "/governance/tasks",
            ),
        ]

        rows = []
        for source_type, label, queryset, href in source_specs:
            expected_ids = [str(item_id) for item_id in queryset.values_list("id", flat=True)]
            existing_refs = set(
                KnowledgeChunk.objects.filter(source_type=source_type).values_list("source_ref", flat=True)
            )
            missing_ids = [item_id for item_id in expected_ids if item_id not in existing_refs]
            chunks_without_embedding = KnowledgeChunk.objects.filter(
                source_type=source_type,
                embedding__isnull=True,
            ).count()
            rows.append(
                {
                    "source_type": source_type,
                    "label": label,
                    "expected_count": len(expected_ids),
                    "chunk_count": KnowledgeChunk.objects.filter(source_type=source_type).count(),
                    "missing_count": len(missing_ids),
                    "chunks_without_embedding": chunks_without_embedding,
                    "missing_examples": missing_ids[:5],
                    "href": href,
                }
            )
        return rows

    @classmethod
    def _sections(cls, metrics):
        return [
            cls._section(
                "policies_without_controls",
                "Politicas sem controlos internos",
                "Sem esta ligacao a politica fica desligada do scoring e da rastreabilidade.",
                metrics["policies_without_controls"],
                "/governance/policies",
                "Associar controlos",
                "high",
            ),
            cls._section(
                "mechanisms_without_valid_evidence",
                "Mecanismos sem evidencia real valida",
                "Tipos de evidencia esperada ajudam, mas a conformidade oficial precisa de evidencia recolhida e aprovada.",
                metrics["mechanisms_without_valid_evidence"],
                "/governance/evidence",
                "Recolher evidencias",
                "high",
            ),
            cls._section(
                "overdue_tasks",
                "Tarefas vencidas",
                "Tarefas em atraso reduzem a capacidade de demonstrar melhoria continua.",
                metrics["overdue_tasks"],
                "/governance/tasks",
                "Rever tarefas",
                "high",
            ),
            cls._section(
                "pending_mappings",
                "Mappings pendentes",
                "Mappings em pending_review ainda nao contam como oficiais.",
                metrics["pending_mappings"],
                "/governance/mapping-review?status=pending_review",
                "Validar mappings",
                "medium",
            ),
            cls._section(
                "expired_evidence",
                "Evidencias expiradas",
                "Evidencias expiradas nao devem suportar score oficial.",
                metrics["expired_evidence"],
                "/governance/evidence",
                "Atualizar evidencias",
                "high",
            ),
            cls._section(
                "rag_missing_chunks",
                "Chunks RAG em falta",
                "Entidades sem chunk ficam menos visiveis para o assistente IA.",
                metrics["rag_missing_chunks"],
                "/admin/rag",
                "Reindexar RAG",
                "medium",
            ),
        ]

    @staticmethod
    def _section(identifier, title, description, count, href, action_label, severity):
        return {
            "id": identifier,
            "title": title,
            "description": description,
            "count": count,
            "href": href,
            "action_label": action_label,
            "severity": severity,
        }

    @staticmethod
    def _policy_payload(policy):
        return {
            "id": str(policy.id),
            "code": policy.code,
            "title": policy.title,
            "owner": policy.owner,
            "status": policy.status,
            "href": f"/governance/policies/{policy.id}",
        }

    @staticmethod
    def _mechanism_payload(mechanism):
        return {
            "id": str(mechanism.id),
            "title": mechanism.title,
            "mechanism_type": mechanism.mechanism_type,
            "expected_evidence_count": getattr(mechanism, "expected_evidence_count", 0),
            "href": f"/governance/mechanisms/{mechanism.id}",
        }

    @staticmethod
    def _task_payload(action):
        return {
            "id": str(action.id),
            "title": action.title,
            "priority": action.priority,
            "status": action.status,
            "owner": action.owner,
            "due_date": action.due_date.isoformat() if action.due_date else None,
            "target_type": action.target_type,
            "target_id": action.target_id,
            "href": f"/governance/tasks/{action.id}",
        }

    @staticmethod
    def _evidence_payload(evidence, today):
        return {
            "id": str(evidence.id),
            "title": evidence.title,
            "evidence_type": evidence.evidence_type,
            "status": evidence.status,
            "owner": evidence.owner,
            "valid_until": evidence.valid_until.isoformat() if evidence.valid_until else None,
            "expired": evidence.status == EvidenceItem.Status.EXPIRED
            or bool(evidence.valid_until and evidence.valid_until < today),
            "href": f"/governance/evidence/{evidence.id}",
        }

    @staticmethod
    def _recommendations(metrics):
        recommendations = []
        if metrics["policies_without_controls"]:
            recommendations.append(
                "Associar controlos internos as politicas sem cobertura para ativar rastreabilidade e scoring."
            )
        if metrics["mechanisms_without_valid_evidence"]:
            recommendations.append(
                "Converter evidencia esperada em evidencia real recolhida, validada e ligada ao mecanismo."
            )
        if metrics["overdue_tasks"]:
            recommendations.append(
                "Rever tarefas vencidas, atualizar prazos e registar bloqueios ou decisoes formais."
            )
        if metrics["rag_missing_chunks"] or metrics["rag_chunks_without_embedding"]:
            recommendations.append(
                "Executar reindexacao RAG depois de atualizar controlos, mecanismos, evidencias e tarefas."
            )
        if not recommendations:
            recommendations.append("Nao foram detetadas lacunas criticas nesta fotografia de dados.")
        return recommendations
