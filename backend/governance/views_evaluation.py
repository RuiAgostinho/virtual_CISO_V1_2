from collections import Counter

from django.db.models import Avg, Count, Max, Min
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ciso_assistant.models import AssistantRecommendation, KnowledgeChunk, RagIngestionRun
from governance.models import (
    ComplianceGap,
    CompliancePropagationResult,
    Control,
    EvidenceLink,
    EvidenceItem,
    Framework,
    GovernanceAction,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceRiskLink,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
)
from governance.services.workbench_service import GovernanceWorkbenchService


def _round(value, digits=2):
    if value is None:
        return None
    return round(float(value), digits)


def _percent(part, total):
    if not total:
        return 0.0
    return round((part / total) * 100, 2)


def _duration_stats(queryset):
    stats = queryset.aggregate(
        avg=Avg("duration_seconds"),
        minimum=Min("duration_seconds"),
        maximum=Max("duration_seconds"),
    )
    return {
        "samples": queryset.count(),
        "average_seconds": _round(stats["avg"]),
        "min_seconds": _round(stats["minimum"]),
        "max_seconds": _round(stats["maximum"]),
    }


def _sources_metrics(recommendations):
    source_type_counts = Counter()
    total_sources = 0
    rag_sources = 0
    rag_rows = 0

    for recommendation in recommendations:
        sources = recommendation.sources_json or []
        total_sources += len(sources)
        if recommendation.used_rag:
            rag_rows += 1
            rag_sources += len(sources)
        for source in sources:
            if not isinstance(source, dict):
                continue
            source_type = source.get("source_type") or source.get("entity_type") or "unknown"
            source_type_counts[str(source_type)] += 1

    return {
        "total_sources_used": total_sources,
        "average_sources_per_interaction": _round(total_sources / recommendations.count()) if recommendations.count() else 0,
        "average_sources_per_rag_interaction": _round(rag_sources / rag_rows) if rag_rows else 0,
        "by_source_type": [
            {"source_type": source_type, "count": count}
            for source_type, count in source_type_counts.most_common()
        ],
    }


def _assistant_metrics():
    recommendations = AssistantRecommendation.objects.all()
    with_duration = recommendations.exclude(duration_seconds__isnull=True)
    total = recommendations.count()
    rag_count = recommendations.filter(used_rag=True).count()
    policy_advice_count = recommendations.filter(filters_json__context="policy_advice").count()
    converted_count = recommendations.filter(converted_decision__isnull=False).count()

    model_rows = []
    for row in (
        recommendations.values("model_used")
        .annotate(total=Count("id"), average_seconds=Avg("duration_seconds"), max_seconds=Max("duration_seconds"))
        .order_by("-total")
    ):
        model_rows.append(
            {
                "model": row["model_used"] or "unknown",
                "total": row["total"],
                "average_seconds": _round(row["average_seconds"]),
                "max_seconds": _round(row["max_seconds"]),
            }
        )

    slowest = [
        {
            "id": str(item.id),
            "question": item.question,
            "task_type": item.task_type,
            "model_used": item.model_used,
            "duration_seconds": item.duration_seconds,
            "sources_count": len(item.sources_json or []),
            "used_rag": item.used_rag,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in recommendations.exclude(duration_seconds__isnull=True).order_by("-duration_seconds")[:10]
    ]

    return {
        "total_interactions": total,
        "rag_interactions": rag_count,
        "rag_rate": _percent(rag_count, total),
        "policy_advice_interactions": policy_advice_count,
        "converted_to_decision": converted_count,
        "conversion_rate": _percent(converted_count, total),
        "timing": _duration_stats(with_duration),
        "models": model_rows,
        "sources": _sources_metrics(recommendations),
        "slowest_interactions": slowest,
        "measurement_note": (
            "duration_seconds mede o tempo total do endpoint IA, incluindo retrieval, prompt building e chamada ao LLM local."
        ),
    }


def _rag_metrics():
    chunks = KnowledgeChunk.objects.all()
    total_chunks = chunks.count()
    embedded_chunks = chunks.exclude(embedding__isnull=True).count()
    last_run = RagIngestionRun.objects.exclude(status=RagIngestionRun.Status.RUNNING).order_by("-started_at").first()
    current_run = RagIngestionRun.objects.filter(status=RagIngestionRun.Status.RUNNING).order_by("-started_at").first()

    return {
        "total_chunks": total_chunks,
        "embedded_chunks": embedded_chunks,
        "missing_embeddings": total_chunks - embedded_chunks,
        "embedding_coverage": _percent(embedded_chunks, total_chunks),
        "by_source_type": [
            {
                "source_type": row["source_type"],
                "count": row["count"],
            }
            for row in chunks.values("source_type").annotate(count=Count("id")).order_by("-count")
        ],
        "last_run": _run_payload(last_run),
        "current_run": _run_payload(current_run),
    }


def _run_payload(run):
    if not run:
        return None
    return {
        "id": str(run.id),
        "mode": run.mode,
        "status": run.status,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "duration_seconds": run.duration_seconds,
        "total_processed": run.total_processed,
        "chunks_created": run.chunks_created,
        "chunks_updated": run.chunks_updated,
        "chunks_removed": run.chunks_removed,
        "chunks_failed": run.chunks_failed,
        "counts_by_type": run.counts_by_type or {},
    }


def _latest_results(result_type):
    latest = {}
    for result in CompliancePropagationResult.objects.filter(
        result_type=result_type,
        calculation_mode=CompliancePropagationResult.CalculationMode.OFFICIAL,
    ).order_by("target_id", "-calculated_at"):
        latest.setdefault(result.target_id, result)
    return latest


def _framework_metrics(workbench):
    latest_results = _latest_results(CompliancePropagationResult.ResultType.FRAMEWORK)
    coverage_by_framework = {
        str(item["framework"]["id"]): item for item in workbench.get("framework_coverage", [])
    }
    rows = []
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

    for framework in Framework.objects.filter(is_active=True).order_by("code", "version"):
        result = latest_results.get(str(framework.id))
        details = result.details if result else {}
        total_controls = total_by_framework.get(framework.id, 0)
        mapped_controls = mapped_by_framework.get(framework.id, 0)
        coverage = coverage_by_framework.get(str(framework.id), {}).get("coverage")
        if coverage is None:
            coverage = _percent(mapped_controls, total_controls)
        rows.append(
            {
                "id": str(framework.id),
                "code": framework.code,
                "name": framework.name,
                "version": framework.version,
                "label": f"{framework.code} {framework.version}",
                "score": _round(result.score) if result else 0,
                "adjusted_score": _round(result.score) if result else 0,
                "status": result.status if result else CompliancePropagationResult.Status.NOT_ASSESSED,
                "coverage": _round(coverage),
                "total_controls": details.get("total_controls", total_controls),
                "assessed_controls": details.get("assessed_controls", mapped_controls),
                "gaps_count": len(result.gaps or []) if result else 0,
            }
        )

    assessed = [row for row in rows if row["status"] != "not_assessed"]
    return {
        "total_frameworks": len(rows),
        "average_score": _round(sum(float(row["score"]) for row in assessed) / len(assessed)) if assessed else 0,
        "average_coverage": _round(sum(float(row["coverage"]) for row in rows) / len(rows)) if rows else 0,
        "items": rows,
    }


def _policy_metrics():
    latest_results = _latest_results(CompliancePropagationResult.ResultType.POLICY)
    rows = []
    for policy in Policy.objects.all().order_by("code", "title"):
        result = latest_results.get(str(policy.id))
        rows.append(
            {
                "id": str(policy.id),
                "code": getattr(policy, "code", ""),
                "title": getattr(policy, "title", str(policy)),
                "status": getattr(policy, "status", ""),
                "score": _round(result.score) if result else 0,
                "adjusted_score": _round(result.score) if result else 0,
                "compliance_status": result.status if result else CompliancePropagationResult.Status.NOT_ASSESSED,
                "gaps_count": len(result.gaps or []) if result else 0,
            }
        )

    assessed = [row for row in rows if row["compliance_status"] != "not_assessed"]
    return {
        "total_policies": len(rows),
        "average_score": _round(sum(float(row["score"]) for row in assessed) / len(assessed)) if assessed else 0,
        "items": rows,
    }


def _mapping_counts():
    mapping_models = [
        InternalControlFrameworkMapping,
        InternalControlMechanism,
        PolicyInternalControl,
        GovernanceDocumentControl,
        EvidenceLink,
        GovernanceRiskLink,
    ]
    statuses = ["draft", "pending_review", "approved", "rejected", "deprecated"]
    return {
        status: sum(model.objects.filter(validation_status=status).count() for model in mapping_models)
        for status in statuses
    }


def _gap_metrics(workbench):
    current_gaps = workbench.get("gaps", [])
    by_severity = Counter()
    by_type = Counter()
    for gap in current_gaps:
        count = int(gap.get("count") or 0)
        by_severity[str(gap.get("severity") or "unknown")] += count
        by_type[str(gap.get("type") or "unknown")] += count
    actions_done = GovernanceAction.objects.filter(status=GovernanceAction.Status.DONE).count()
    gap_actions_done = GovernanceAction.objects.filter(
        status=GovernanceAction.Status.DONE,
        source_type__in=["workbench", "compliance_gap", "score", "ai_recommendation"],
    ).count()

    return {
        "current_total": sum(int(gap.get("count") or 0) for gap in current_gaps),
        "by_severity": [{"severity": key, "count": value} for key, value in by_severity.most_common()],
        "by_type": [{"type": key, "count": value} for key, value in by_type.most_common(12)],
        "resolved_legacy_compliance_gaps": ComplianceGap.objects.filter(status="IMPLEMENTED").count(),
        "completed_governance_actions": actions_done,
        "completed_gap_related_actions": gap_actions_done,
        "sample_open_gaps": current_gaps[:12],
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def evaluation_overview(request):
    workbench = GovernanceWorkbenchService.overview()
    totals = workbench.get("totals", {})
    return Response(
        {
            "generated_at": timezone.now().isoformat(),
            "assistant": _assistant_metrics(),
            "rag": _rag_metrics(),
            "frameworks": _framework_metrics(workbench),
            "policies": _policy_metrics(),
            "traceability": {
                "totals": {
                    "policies": totals.get("policies", Policy.objects.count()),
                    "governance_documents": totals.get("governance_documents", GovernanceDocument.objects.count()),
                    "internal_controls": totals.get("internal_controls", InternalControl.objects.filter(is_active=True).count()),
                    "mechanisms": totals.get("mechanisms", Mechanism.objects.count()),
                    "evidence_items": totals.get("evidence_items", EvidenceItem.objects.filter(is_active=True).count()),
                    "frameworks": totals.get("frameworks", Framework.objects.filter(is_active=True).count()),
                },
                "top_frameworks_by_coverage": sorted(
                    workbench.get("framework_coverage", []),
                    key=lambda item: item.get("coverage", 0),
                    reverse=True,
                )[:10],
            },
            "mappings": _mapping_counts(),
            "gaps": _gap_metrics(workbench),
        }
    )
