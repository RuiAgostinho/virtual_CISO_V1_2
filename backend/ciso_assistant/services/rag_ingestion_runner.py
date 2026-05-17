"""
Bulk RAG re-ingestion runner for the admin interface.

The HTTP request only needs to *start* a run; the actual ingestion (which can
take several minutes) happens in a background thread so the UI never blocks.

`_execute()` is deliberately a pure function of the run id: when a task broker
becomes available it can be turned into a Celery task with no change to the
calling code — only `_spawn()` would swap `threading.Thread` for `.delay()`.
"""

import logging
import threading
import time
from datetime import timedelta

from django.db import close_old_connections, transaction
from django.utils import timezone

from ciso_assistant.models import KnowledgeChunk, RagIngestionRun
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import ComplianceGap, Control, Policy, PolicyEvidence, Procedure, TechnicalRegulation
from governance.models.mechanism import Mechanism
from risk.models import Asset, Vulnerability

logger = logging.getLogger(__name__)

# A RUNNING row older than this is treated as abandoned (the process restarted
# mid-run), so a fresh run is allowed instead of locking the feature forever.
STALE_RUN_AFTER = timedelta(hours=2)

# Cap on per-item failure lines kept in RagIngestionRun.error_detail.
MAX_ERROR_LINES = 50


class RagIngestionAlreadyRunning(Exception):
    """Raised when a re-ingestion is requested while another is in progress."""


class RagIngestionRunner:
    """Starts and executes bulk RAG re-ingestion runs."""

    @classmethod
    def start(cls, *, mode, user=None):
        """
        Create a RagIngestionRun and launch it in a background thread.

        Raises RagIngestionAlreadyRunning if another run is still active.
        """
        if mode not in (RagIngestionRun.Mode.INCREMENTAL, RagIngestionRun.Mode.FULL):
            raise ValueError(f"Modo de reindexação inválido: {mode!r}")

        cls._release_stale_runs()
        if RagIngestionRun.objects.filter(status=RagIngestionRun.Status.RUNNING).exists():
            raise RagIngestionAlreadyRunning("Já existe uma reindexação RAG em curso.")

        label = ""
        triggered_by = None
        if user is not None and getattr(user, "is_authenticated", False):
            triggered_by = user
            label = user.get_full_name() or user.get_username() or getattr(user, "email", "") or ""

        run = RagIngestionRun.objects.create(
            mode=mode,
            status=RagIngestionRun.Status.RUNNING,
            triggered_by=triggered_by,
            triggered_by_label=label[:255],
        )

        # on_commit so the worker thread never queries the run row before the
        # request transaction that created it has committed (ATOMIC_REQUESTS).
        transaction.on_commit(lambda: cls._spawn(run.id))
        logger.info("[RAG_RUNNER] Queued %s run %s", mode, run.id)
        return run

    @classmethod
    def _spawn(cls, run_id):
        thread = threading.Thread(
            target=cls._execute, args=(run_id,), name=f"rag-ingest-{run_id}", daemon=True
        )
        thread.start()

    @staticmethod
    def _release_stale_runs():
        cutoff = timezone.now() - STALE_RUN_AFTER
        for run in RagIngestionRun.objects.filter(
            status=RagIngestionRun.Status.RUNNING, started_at__lt=cutoff
        ):
            run.status = RagIngestionRun.Status.FAILED
            run.error_message = "Execução abandonada (processo reiniciado antes de concluir)."
            run.finished_at = timezone.now()
            run.save(update_fields=["status", "error_message", "finished_at"])
            logger.warning("[RAG_RUNNER] Released stale run %s", run.id)

    # --- the unit of work: ready to become a Celery task ---------------------
    @classmethod
    def _execute(cls, run_id):
        close_old_connections()
        try:
            run = RagIngestionRun.objects.get(id=run_id)
        except RagIngestionRun.DoesNotExist:
            logger.error("[RAG_RUNNER] Run %s vanished before execution", run_id)
            return

        started = time.monotonic()
        errors: list[str] = []
        counts_by_type: dict = {}

        try:
            if run.mode == RagIngestionRun.Mode.FULL:
                removed, _ = KnowledgeChunk.objects.all().delete()
                run.chunks_removed = removed
                run.save(update_fields=["chunks_removed"])

            for source_type, queryset, upsert in cls._plan():
                processed = 0
                failed = 0
                for obj in queryset:
                    ok = False
                    try:
                        ok = bool(upsert(obj))
                    except Exception:
                        logger.exception("[RAG_RUNNER] %s upsert crashed", source_type)
                    processed += 1
                    if not ok:
                        failed += 1
                        if len(errors) < MAX_ERROR_LINES:
                            errors.append(f"{source_type}: falha ao indexar {cls._label(obj)}")

                counts_by_type[source_type] = {"processed": processed, "failed": failed}
                run.chunks_failed += failed
                run.total_processed += processed
                # Checkpoint after each type so the polling UI sees live progress.
                cls._refresh_counts(run, counts_by_type, errors)

            run.status = RagIngestionRun.Status.SUCCESS
        except Exception as exc:
            run.status = RagIngestionRun.Status.FAILED
            run.error_message = str(exc)[:2000]
            logger.exception("[RAG_RUNNER] Fatal error in run %s", run_id)
        finally:
            run.finished_at = timezone.now()
            run.duration_seconds = round(time.monotonic() - started, 2)
            try:
                cls._refresh_counts(run, counts_by_type, errors)
            except Exception:
                logger.exception("[RAG_RUNNER] Failed to persist final state for run %s", run_id)
            close_old_connections()

        logger.info(
            "[RAG_RUNNER] Run %s finished: status=%s created=%s updated=%s removed=%s failed=%s",
            run_id, run.status, run.chunks_created, run.chunks_updated,
            run.chunks_removed, run.chunks_failed,
        )

    @staticmethod
    def _refresh_counts(run, counts_by_type, errors):
        """
        Recompute created/updated from chunk timestamps and persist progress.

        created/updated are derived from KnowledgeChunk.created_at/updated_at
        relative to run.started_at instead of being tracked per upsert call:
        update_or_create already records those timestamps, so a single COUNT
        query is both simpler and correct even if the runner is interrupted.
        """
        touched = KnowledgeChunk.objects.filter(updated_at__gte=run.started_at)
        created = touched.filter(created_at__gte=run.started_at).count()
        run.chunks_created = created
        run.chunks_updated = max(touched.count() - created, 0)
        run.counts_by_type = counts_by_type
        run.error_detail = "\n".join(errors)
        run.save()

    @staticmethod
    def _plan():
        """(source_type, queryset, upsert_callable) for every indexed entity type."""
        svc = KnowledgeIngestionService
        return [
            (
                "asset",
                Asset.objects.filter(status="Active").select_related(
                    "asset_type", "category", "location", "environment", "network_segment"
                ).order_by("name"),
                svc.upsert_asset,
            ),
            (
                "vulnerability",
                Vulnerability.objects.filter(cvss_score__gte=4.0).order_by("-cvss_score", "cve_id"),
                svc.upsert_vulnerability,
            ),
            (
                "policy",
                Policy.objects.prefetch_related("sections", "related_frameworks").order_by("code"),
                svc.upsert_policy,
            ),
            (
                "technical_regulation",
                TechnicalRegulation.objects.select_related("policy").prefetch_related(
                    "controls__framework"
                ).order_by("code"),
                svc.upsert_technical_regulation,
            ),
            (
                "procedure",
                Procedure.objects.select_related("policy", "technical_regulation").prefetch_related(
                    "controls__framework"
                ).order_by("code"),
                svc.upsert_procedure,
            ),
            (
                "evidence",
                PolicyEvidence.objects.select_related(
                    "mechanism",
                    "mechanism__policy_control",
                    "mechanism__policy_control__policy",
                    "mechanism__policy_control__control",
                    "mechanism__policy_control__control__framework",
                ).order_by("title"),
                svc.upsert_policy_evidence,
            ),
            (
                "compliance_gap",
                ComplianceGap.objects.select_related(
                    "framework", "control", "control__framework"
                ).order_by("framework__code", "framework__version", "status", "control__code"),
                svc.upsert_compliance_gap,
            ),
            (
                "control",
                Control.objects.select_related("framework").filter(
                    status=Control.Status.ACTIVE
                ).order_by("framework__code", "code"),
                svc.upsert_control,
            ),
            (
                "mechanism",
                Mechanism.objects.prefetch_related(
                    "suggested_controls__control__framework"
                ).order_by("title"),
                svc.upsert_mechanism,
            ),
        ]

    @staticmethod
    def _label(obj):
        for attr in ("code", "cve_id", "title", "name"):
            value = getattr(obj, attr, None)
            if value:
                return str(value)
        return str(getattr(obj, "id", obj))
