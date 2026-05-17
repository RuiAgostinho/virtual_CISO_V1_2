from rest_framework.views import APIView

from rest_framework.response import Response

from rest_framework import status

from .serializers import ChatRequestSerializer, ChatResponseSerializer

from .services.chat.chat_service import ChatService

from django.db.models import Count

from .models import KnowledgeChunk, RagIngestionRun
from .permissions import IsAdminOrSuperUser
from .services.rag_ingestion_runner import RagIngestionAlreadyRunning, RagIngestionRunner



class AskCISOView(APIView):

    """

    Endpoint para realizar perguntas ao Virtual CISO.

    Utiliza um sistema RAG híbrido integrado com o modelo local Ollama.

    """

    

    def post(self, request):

        serializer = ChatRequestSerializer(data=request.data)

        if not serializer.is_valid():

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            

        user_query = serializer.validated_data['query']

        history = serializer.validated_data.get('history', [])

        filters = request.data.get('filters', {}) # Optional filters from frontend

        

        # Chama o serviço híbrido

        result = ChatService.ask_ciso(user_query, history=history, filters=filters)

        

        resp_serializer = ChatResponseSerializer(data=result)

        resp_serializer.is_valid(raise_exception=True)

        

        return Response(resp_serializer.data, status=status.HTTP_200_OK)


SOURCE_TYPE_LABELS = dict(KnowledgeChunk.SOURCE_CHOICES)


def _serialize_run(run):
    """Serialize a RagIngestionRun for the admin RAG endpoints."""
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
    """Current KnowledgeChunk distribution for the RAG admin dashboard."""
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
    """Stats and run history for the RAG knowledge-base admin page."""

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
        return Response({
            "stats": _rag_stats(),
            "current_run": _serialize_run(current),
            "last_run": _serialize_run(last),
            "recent_runs": [_serialize_run(run) for run in recent],
        })


class RagReindexView(APIView):
    """Triggers a bulk RAG re-ingestion (incremental or full)."""

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



