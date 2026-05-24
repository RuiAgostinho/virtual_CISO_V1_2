import time

from django.conf import settings
from django.db import models
from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from governance.models.decision import DecisionRecord
from governance.models import GovernanceAction, InternalControlFrameworkMapping, InternalControlMechanism

from .models import AssistantRecommendation, KnowledgeChunk, RagIngestionRun
from .permissions import IsAdminOrSuperUser
from .serializers import (
    AssistantRecommendationSerializer,
    ChatRequestSerializer,
    ChatResponseSerializer,
    ConvertRecommendationSerializer,
    PolicyAdviceRequestSerializer,
)
from .services.chat.chat_service import ChatService
from .services.governance_context_adapter import GovernanceContextAdapter
from .services.ollama_client import OllamaClient
from .services.orchestrator import QueryOrchestrator
from .services.policy_advice_service import PolicyAdviceService
from .services.prompt_builder import PromptBuilder
from .services.rag_ingestion_runner import (
    GOVERNANCE_MISSING_SOURCE_TYPES,
    RagIngestionAlreadyRunning,
    RagIngestionRunner,
)
from .services.semantic_retrieval import SemanticRetrievalService
from .services.source_normalizer import SourceNormalizer


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

        started = time.monotonic()
        result = ChatService.ask_ciso(user_query, history=history, filters=filters)
        duration_seconds = round(time.monotonic() - started, 2)
        result["duration_seconds"] = duration_seconds

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
            duration_seconds=duration_seconds,
            sources_json=resp_serializer.validated_data.get("sources", []),
            history_json=history,
            filters_json=filters if isinstance(filters, dict) else {},
            created_by=user,
            created_by_label=user.get_username() if user else "",
        )

        return Response(resp_serializer.data, status=status.HTTP_200_OK)


class PolicyAdviceView(APIView):
    """
    Endpoint de aconselhamento CISO para uma politica em edicao.

    Recebe o rascunho atual da politica no frontend e transforma-o numa
    consulta contextual para o pipeline existente do assistente, sem alterar o
    LLMRouter nem os prompts globais.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _compact_chunks(chunks: list[dict]) -> list[dict]:
        top_k = getattr(settings, "OLLAMA_POLICY_ADVICE_CONTEXT_TOP_K", 4)
        max_chars = getattr(settings, "OLLAMA_POLICY_ADVICE_CONTEXT_MAX_CHARS", 700)
        compacted = []
        for chunk in (chunks or [])[:top_k]:
            item = dict(chunk)
            text = item.get("chunk_text") or ""
            if len(text) > max_chars:
                item["chunk_text"] = f"{text[:max_chars].rstrip()}\n[contexto truncado]"
            compacted.append(item)
        return compacted

    def post(self, request):
        serializer = PolicyAdviceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        policy_id = serializer.validated_data.get("policy_id")
        advice_mode = serializer.validated_data.get("advice_mode", "full_review")
        snapshot = serializer.validated_data["policy_snapshot"]

        user_query = PolicyAdviceService.build_query(
            policy_id=str(policy_id) if policy_id else None,
            snapshot=snapshot,
            advice_mode=advice_mode,
        )
        filters = {
            "context": "policy_advice",
            "policy_id": str(policy_id) if policy_id else None,
            "advice_mode": advice_mode,
        }

        started = time.monotonic()

        governance_chunks = GovernanceContextAdapter.retrieve_internal_first(
            query=user_query,
            top_k=getattr(settings, "OLLAMA_POLICY_ADVICE_CONTEXT_TOP_K", 4),
            filters=filters,
        )
        semantic_chunks = SemanticRetrievalService.semantic_search(
            query=user_query,
            top_k=3,
            filters=filters,
        )
        retrieved_chunks = self._compact_chunks(
            GovernanceContextAdapter.merge_contexts(
                governance_chunks,
                semantic_chunks,
                top_k=getattr(settings, "OLLAMA_POLICY_ADVICE_CONTEXT_TOP_K", 4),
            )
        )
        system_prompt = PromptBuilder.build_system_prompt(
            task_type="executive_advisory",
            needs_rag=bool(retrieved_chunks),
            retrieved_chunks=retrieved_chunks,
        )
        policy_advice_model = getattr(
            settings,
            "OLLAMA_POLICY_ADVICE_MODEL",
            getattr(settings, "OLLAMA_MODEL", "llama3.2:3b"),
        )
        num_predict = getattr(settings, "OLLAMA_POLICY_ADVICE_NUM_PREDICT", 180)
        if advice_mode == "wording":
            num_predict = getattr(settings, "OLLAMA_POLICY_ADVICE_WORDING_NUM_PREDICT", 360)
        elif advice_mode == "draft_text":
            num_predict = getattr(settings, "OLLAMA_POLICY_ADVICE_DRAFT_NUM_PREDICT", 650)

        generation_options = QueryOrchestrator._generation_options(
            "executive_advisory",
            {"num_predict": num_predict},
        )
        response_text = OllamaClient.call(
            model=policy_advice_model,
            prompt=user_query,
            system=system_prompt,
            options=generation_options,
            timeout_seconds=getattr(settings, "OLLAMA_POLICY_ADVICE_TIMEOUT_SECONDS", 360),
        )
        duration_seconds = round(time.monotonic() - started, 2)

        result = {
            "task_type": "executive_advisory",
            "confidence": 1.0,
            "used_rag": bool(retrieved_chunks),
            "model_used": policy_advice_model,
            "sources": SourceNormalizer.normalize_many(retrieved_chunks),
            "response": response_text,
            "duration_seconds": duration_seconds,
        }

        resp_serializer = ChatResponseSerializer(data=result)
        resp_serializer.is_valid(raise_exception=True)

        user = request.user if request.user.is_authenticated else None
        AssistantRecommendation.objects.create(
            question=f"Aconselhamento IA para politica: {snapshot.get('code') or ''} {snapshot.get('title') or ''}".strip(),
            answer=resp_serializer.validated_data["response"],
            task_type=resp_serializer.validated_data.get("task_type", ""),
            model_used=resp_serializer.validated_data.get("model_used", ""),
            used_rag=resp_serializer.validated_data.get("used_rag", False),
            confidence=resp_serializer.validated_data.get("confidence"),
            duration_seconds=duration_seconds,
            sources_json=resp_serializer.validated_data.get("sources", []),
            history_json=[],
            filters_json=filters,
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

        task_type = (request.query_params.get("task_type") or "").strip()
        if task_type:
            qs = qs.filter(task_type=task_type)

        context = (request.query_params.get("context") or "").strip()
        if context:
            qs = qs.filter(filters_json__context=context)

        policy_id = (request.query_params.get("policy_id") or "").strip()
        if policy_id:
            qs = qs.filter(filters_json__policy_id=policy_id)

        advice_mode = (request.query_params.get("advice_mode") or "").strip()
        if advice_mode:
            qs = qs.filter(filters_json__advice_mode=advice_mode)

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
        responsible = serializer.validated_data.get("responsible") or (
            request.user.get_username() if request.user.is_authenticated else "system"
        )

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
                "filters": recommendation.filters_json or {},
            },
            decision=decision_code,
            justification=justification,
            responsible=responsible,
            due_date=serializer.validated_data.get("due_date"),
            risk_impact=serializer.validated_data.get("risk_impact", ""),
            compliance_impact=serializer.validated_data.get("compliance_impact", ""),
            evidence_reference=serializer.validated_data.get("evidence_reference", ""),
            action_reference=serializer.validated_data.get("action_reference", ""),
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
        "governance_missing": _governance_missing_stats(),
    }


def _governance_missing_stats():
    rows = []
    targets = [
        (
            "framework_mapping",
            "Mapeamentos interno-framework",
            InternalControlFrameworkMapping.objects.exclude(
                validation_status__in=[
                    InternalControlFrameworkMapping.ValidationStatus.REJECTED,
                    InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
                ]
            ),
        ),
        (
            "internal_control_mechanism",
            "Mecanismos por controlo interno",
            InternalControlMechanism.objects.exclude(
                validation_status__in=[
                    InternalControlMechanism.ValidationStatus.REJECTED,
                    InternalControlMechanism.ValidationStatus.DEPRECATED,
                ]
            ),
        ),
        (
            "governance_action",
            "Tarefas de governacao",
            GovernanceAction.objects.exclude(status=GovernanceAction.Status.CANCELLED),
        ),
    ]
    for source_type, label, queryset in targets:
        eligible = queryset.count()
        indexed = (
            KnowledgeChunk.objects.filter(source_type=source_type)
            .values("source_ref")
            .distinct()
            .count()
        )
        rows.append(
            {
                "source_type": source_type,
                "label": label,
                "eligible": eligible,
                "indexed": indexed,
                "missing": max(eligible - indexed, 0),
            }
        )
    return rows


class RagOverviewView(APIView):
    permission_classes = [IsAdminOrSuperUser]

    def get(self, request):
        RagIngestionRunner._release_stale_runs()
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
        preset = (request.data.get("preset") or "").strip().lower()
        mode = (request.data.get("mode") or "").strip().lower()
        source_types = None
        missing_only = False
        per_type_limit = None

        if preset:
            if preset != "governance_missing":
                return Response(
                    {"detail": "Preset de reindexacao desconhecido."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            mode = RagIngestionRun.Mode.INCREMENTAL
            source_types = GOVERNANCE_MISSING_SOURCE_TYPES
            missing_only = True
            try:
                per_type_limit = max(1, min(int(request.data.get("batch_size") or 50), 200))
            except (TypeError, ValueError):
                return Response(
                    {"detail": "O campo 'batch_size' deve ser um numero entre 1 e 200."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if mode not in (RagIngestionRun.Mode.INCREMENTAL, RagIngestionRun.Mode.FULL):
            return Response(
                {"detail": "O campo 'mode' deve ser 'incremental' ou 'full'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            run = RagIngestionRunner.start(
                mode=mode,
                user=request.user,
                source_types=source_types,
                missing_only=missing_only,
                per_type_limit=per_type_limit,
            )
        except RagIngestionAlreadyRunning as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(_serialize_run(run), status=status.HTTP_202_ACCEPTED)


class RagTerminateRunView(APIView):
    permission_classes = [IsAdminOrSuperUser]

    def post(self, request):
        run = (
            RagIngestionRun.objects.filter(status=RagIngestionRun.Status.RUNNING)
            .order_by("-started_at")
            .first()
        )
        if run is None:
            return Response(
                {"detail": "Nao existe nenhuma reindexacao RAG em execucao."},
                status=status.HTTP_404_NOT_FOUND,
            )

        run.status = RagIngestionRun.Status.FAILED
        run.finished_at = timezone.now()
        run.duration_seconds = round((run.finished_at - run.started_at).total_seconds(), 2)
        run.error_message = (
            "Execucao terminada manualmente pelo administrador a partir da interface RAG."
        )
        run.save(update_fields=["status", "finished_at", "duration_seconds", "error_message"])
        return Response(_serialize_run(run), status=status.HTTP_200_OK)
