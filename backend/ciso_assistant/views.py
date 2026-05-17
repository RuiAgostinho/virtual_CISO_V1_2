from django.db import models
from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from governance.models.decision import DecisionRecord

from .models import AssistantRecommendation, KnowledgeChunk, RagIngestionRun
from .permissions import IsAdminOrSuperUser
from .serializers import (
    AssistantRecommendationSerializer,
    ChatRequestSerializer,
    ChatResponseSerializer,
    ConvertRecommendationSerializer,
)
from .services.chat.chat_service import ChatService
from .services.rag_ingestion_runner import RagIngestionAlreadyRunning, RagIngestionRunner


class AskCISOView(APIView):
    """
    Endpoint para realizar perguntas ao Virtual CISO.

    Utiliza um sistema RAG híbrido integrado com o modelo local Ollama.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user_query = serializer.validated_data["query"]
        history = serializer.validated_data.get("history", [])
        filters = request.data.get("filters", {})

        result = ChatService.ask_ciso(user_query, history=history, filters=filters)

        resp_serializer = ChatResponseSerializer(data=result)
        resp_serializer.is_valid(raise_exception=True)

        user = request.user if request.user.is_authenticated else None
        AssistantRecommendation.objects.create(
            question=user_query,
            answer=resp_serializer.validated_data["response"],
            task_type=resp_serializer.validated_data.get("task_type", ""),
            model_used=resp_serializer.validated_data.get("model_used", ""),
            used_rag=resp_serializer.validated_data.get("used_rag", False),
            confidence=resp_serializer.validated_data.get("confidence"),
            sources_json=resp_serializer.validated_data.get("sources", []),
            history_json=history,
            filters_json=filters if isinstance(filters, dict) else {},
            created_by=user,
            created_by_label=user.get_username() if user else "",
        )

        return Response(resp_serializer.data, status=status.HTTP_200_OK)


class AssistantRecommendationHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = AssistantRecommendation.objects.select_related("created_by", "converted_decision").all()

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                models.Q(question__icontains=search)
                | models.Q(answer__icontains=search)
                | models.Q(task_type__icontains=search)
                | models.Q(model_used__icontains=search)
                | models.Q(created_by_label__icontains=search)
            )

        rag_only = (request.query_params.get("rag_only") or "").strip().lower()
        if rag_only in {"1", "true", "yes"}:
            qs = qs.filter(used_rag=True)

        converted = (request.query_params.get("converted") or "").strip().lower()
        if converted in {"1", "true", "yes"}:
            qs = qs.filter(converted_decision__isnull=False)
        elif converted in {"0", "false", "no"}:
            qs = qs.filter(converted_decision__isnull=True)

        total = qs.count()
        page_size = request.query_params.get("page_size")
        if page_size:
            try:
                qs = qs[: max(1, min(int(page_size), 500))]
            except ValueError:
                pass

        serializer = AssistantRecommendationSerializer(qs, many=True)
        return Response({"count": total, "results": serializer.data}, status=status.HTTP_200_OK)


class AssistantRecommendationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, recommendation_id):
        deleted, _ = AssistantRecommendation.objects.filter(id=recommendation_id).delete()
        if not deleted:
            return Response({"detail": "Recomendação não encontrada."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConvertAssistantRecommendationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, recommendation_id):
        recommendation = AssistantRecommendation.objects.filter(id=recommendation_id).first()
        if not recommendation:
            return Response({"detail": "Recomendação não encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ConvertRecommendationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision_code = serializer.validated_data["decision_code"]
        justification = serializer.validated_data["justification"]
        title = serializer.validated_data.get("title") or recommendation.question[:255]

        decision = DecisionRecord.objects.create(
            decision_type=DecisionRecord.DecisionType.ASSISTANT_RECOMMENDATION,
            target_type="assistant_recommendation",
            target_id=str(recommendation.id),
            title=title,
            recommendation=recommendation.answer,
            rationale=f"task_type={recommendation.task_type}; model={recommendation.model_used}; rag={recommendation.used_rag}",
            source_snapshot=recommendation.sources_json or [],
            score_snapshot={
                "task_type": recommendation.task_type,
                "model_used": recommendation.model_used,
                "used_rag": recommendation.used_rag,
                "confidence": recommendation.confidence,
            },
            decision=decision_code,
            justification=justification,
            decided_by=request.user.get_username() if request.user.is_authenticated else "system",
            decided_at=timezone.now(),
        )

        recommendation.converted_decision = decision
        recommendation.save(update_fields=["converted_decision", "updated_at"])

        return Response(
            {
                "decision_id": str(decision.id),
                "recommendation_id": str(recommendation.id),
                "decision": decision.decision,
                "decision_display": decision.get_decision_display(),
            },
            status=status.HTTP_201_CREATED,
        )


SOURCE_TYPE_LABELS = dict(KnowledgeChunk.SOURCE_CHOICES)


def _serialize_run(run):
    if run is None:
        return None
    return {
        "id": str(run.id),
        "mode": run.mode,
        "status": run.status,
        "triggered_by": run.triggered_by_label or None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "duration_seconds": run.duration_seconds,
        "chunks_created": run.chunks_created,
        "chunks_updated": run.chunks_updated,
        "chunks_removed": run.chunks_removed,
        "chunks_failed": run.chunks_failed,
        "total_processed": run.total_processed,
        "counts_by_type": run.counts_by_type or {},
        "error_message": run.error_message or "",
        "error_detail": run.error_detail or "",
    }


def _rag_stats():
    qs = KnowledgeChunk.objects.all()
    total = qs.count()
    by_type = [
        {
            "source_type": row["source_type"],
            "label": SOURCE_TYPE_LABELS.get(row["source_type"], row["source_type"]),
            "count": row["count"],
        }
        for row in qs.values("source_type").annotate(count=Count("id")).order_by("-count")
    ]
    embedded = qs.exclude(embedding__isnull=True).count()
    return {
        "total_chunks": total,
        "embedded_chunks": embedded,
        "missing_embedding": total - embedded,
        "by_type": by_type,
    }


class RagOverviewView(APIView):
    permission_classes = [IsAdminOrSuperUser]

    def get(self, request):
        current = (
            RagIngestionRun.objects.filter(status=RagIngestionRun.Status.RUNNING)
            .order_by("-started_at")
            .first()
        )
        last = (
            RagIngestionRun.objects.exclude(status=RagIngestionRun.Status.RUNNING)
            .order_by("-started_at")
            .first()
        )
        recent = list(RagIngestionRun.objects.all()[:10])
        return Response(
            {
                "stats": _rag_stats(),
                "current_run": _serialize_run(current),
                "last_run": _serialize_run(last),
                "recent_runs": [_serialize_run(run) for run in recent],
            }
        )


class RagReindexView(APIView):
    permission_classes = [IsAdminOrSuperUser]

    def post(self, request):
        mode = (request.data.get("mode") or "").strip().lower()
        if mode not in (RagIngestionRun.Mode.INCREMENTAL, RagIngestionRun.Mode.FULL):
            return Response(
                {"detail": "O campo 'mode' deve ser 'incremental' ou 'full'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            run = RagIngestionRunner.start(mode=mode, user=request.user)
        except RagIngestionAlreadyRunning as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(_serialize_run(run), status=status.HTTP_202_ACCEPTED)
