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
import uuid
from datetime import timedelta

from django.db import close_old_connections, transaction
from django.utils import timezone

from ciso_assistant.models import KnowledgeChunk, RagIngestionRun
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import (
    ComplianceGap,
    Control,
    EvidenceItem,
    GovernanceAction,
    GovernanceDocument,
    GovernanceDocumentSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Policy,
    PolicyEvidence,
    Procedure,
    TechnicalRegulation,
)
from governance.models.mechanism import Mechanism
from risk.models import Asset, Vulnerability

logger = logging.getLogger(__name__)

# A RUNNING row older than this is treated as abandoned (the process restarted
# mid-run), so a fresh run is allowed instead of locking the feature forever.
STALE_RUN_AFTER = timedelta(hours=2)

# Cap on per-item failure lines kept in RagIngestionRun.error_detail.
MAX_ERROR_LINES = 50

GOVERNANCE_MISSING_SOURCE_TYPES = ("framework_mapping", "internal_control_mechanism", "governance_action")


class RagIngestionAlreadyRunning(Exception):
    """Raised when a re-ingestion is requested while another is in progress."""


class RagIngestionTerminated(Exception):
    """Raised when an administrator manually terminates a running ingestion."""


class RagIngestionRunner:
    """Starts and executes bulk RAG re-ingestion runs."""

    @classmethod
    def start(cls, *, mode, user=None, source_types=None, missing_only=False, per_type_limit=None):
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
        source_types = tuple(source_types or ())
        transaction.on_commit(
            lambda: cls._spawn(
                run.id,
                source_types=source_types,
                missing_only=bool(missing_only),
                per_type_limit=per_type_limit,
            )
        )
        logger.info(
            "[RAG_RUNNER] Queued %s run %s source_types=%s missing_only=%s limit=%s",
            mode,
            run.id,
            source_types or "all",
            missing_only,
            per_type_limit,
        )
        return run

    @classmethod
    def _spawn(cls, run_id, *, source_types=None, missing_only=False, per_type_limit=None):
        thread = threading.Thread(
            target=cls._execute,
            args=(run_id,),
            kwargs={
                "source_types": source_types,
                "missing_only": missing_only,
                "per_type_limit": per_type_limit,
            },
            name=f"rag-ingest-{run_id}",
            daemon=True,
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
    def _execute(cls, run_id, *, source_types=None, missing_only=False, per_type_limit=None):
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

            for source_type, queryset, upsert in cls._plan(
                source_types=source_types,
                missing_only=missing_only,
                per_type_limit=per_type_limit,
            ):
                processed = 0
                failed = 0
                for obj in queryset:
                    if cls._termination_requested(run.id):
                        raise RagIngestionTerminated("Execucao terminada manualmente pelo administrador.")
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
        except RagIngestionTerminated as exc:
            run.status = RagIngestionRun.Status.FAILED
            run.error_message = str(exc)[:2000]
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
        stored_status = (
            RagIngestionRun.objects.filter(id=run.id)
            .values_list("status", flat=True)
            .first()
        )
        if run.status == RagIngestionRun.Status.RUNNING and stored_status != RagIngestionRun.Status.RUNNING:
            raise RagIngestionTerminated("Execucao terminada manualmente pelo administrador.")

        touched = KnowledgeChunk.objects.filter(updated_at__gte=run.started_at)
        created = touched.filter(created_at__gte=run.started_at).count()
        run.chunks_created = created
        run.chunks_updated = max(touched.count() - created, 0)
        run.counts_by_type = counts_by_type
        run.error_detail = "\n".join(errors)
        run.save()

    @staticmethod
    def _termination_requested(run_id):
        return not RagIngestionRun.objects.filter(
            id=run_id,
            status=RagIngestionRun.Status.RUNNING,
        ).exists()

    @staticmethod
    def _plan(source_types=None, missing_only=False, per_type_limit=None):
        """(source_type, queryset, upsert_callable) for every indexed entity type."""
        svc = KnowledgeIngestionService
        plan = [
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
            (
                "internal_control",
                InternalControl.objects.filter(is_active=True)
                .prefetch_related(
                    "framework_mappings__framework_control__framework",
                    "policy_links__policy",
                    "document_links__document",
                    "mechanism_links__mechanism",
                )
                .order_by("code"),
                svc.upsert_internal_control,
            ),
            (
                "governance_document",
                GovernanceDocument.objects.filter(is_active=True)
                .select_related("parent_document")
                .prefetch_related("sections", "runbook_steps", "control_links__internal_control")
                .order_by("document_type", "title"),
                svc.upsert_governance_document,
            ),
            (
                "governance_section",
                GovernanceDocumentSection.objects.select_related("document", "parent_section")
                .filter(document__is_active=True)
                .order_by("document__title", "order", "section_number"),
                svc.upsert_governance_section,
            ),
            (
                "evidence_item",
                EvidenceItem.objects.filter(is_active=True).prefetch_related("links").order_by("title"),
                svc.upsert_evidence_item,
            ),
            (
                "framework_mapping",
                InternalControlFrameworkMapping.objects.select_related(
                    "internal_control",
                    "framework_control",
                    "framework_control__framework",
                )
                .exclude(
                    validation_status__in=[
                        InternalControlFrameworkMapping.ValidationStatus.REJECTED,
                        InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
                    ]
                )
                .order_by("internal_control__code", "framework_control__framework__code", "framework_control__code"),
                svc.upsert_framework_mapping,
            ),
            (
                "internal_control_mechanism",
                InternalControlMechanism.objects.select_related("internal_control", "mechanism")
                .exclude(
                    validation_status__in=[
                        InternalControlMechanism.ValidationStatus.REJECTED,
                        InternalControlMechanism.ValidationStatus.DEPRECATED,
                    ]
                )
                .order_by("internal_control__code", "mechanism__title"),
                svc.upsert_internal_control_mechanism,
            ),
            (
                "governance_action",
                GovernanceAction.objects.select_related("linked_decision", "linked_exception")
                .exclude(status=GovernanceAction.Status.CANCELLED)
                .order_by("status", "due_date", "-created_at"),
                svc.upsert_governance_action,
            ),
        ]

        source_filter = set(source_types or [])
        if source_filter:
            plan = [item for item in plan if item[0] in source_filter]

        if missing_only:
            plan = [
                (source_type, RagIngestionRunner._apply_missing_only(queryset, source_type), upsert)
                for source_type, queryset, upsert in plan
            ]

        if per_type_limit is not None:
            limit = max(1, int(per_type_limit))
            plan = [(source_type, queryset[:limit], upsert) for source_type, queryset, upsert in plan]

        return plan

    @staticmethod
    def _apply_missing_only(queryset, source_type):
        existing_refs = list(
            KnowledgeChunk.objects.filter(source_type=source_type).values_list("source_ref", flat=True)
        )
        if not existing_refs:
            return queryset

        pk_field = queryset.model._meta.pk
        if pk_field.get_internal_type() == "UUIDField":
            valid_refs = []
            for source_ref in existing_refs:
                try:
                    valid_refs.append(uuid.UUID(str(source_ref)))
                except (TypeError, ValueError):
                    continue
            existing_refs = valid_refs

        if not existing_refs:
            return queryset

        return queryset.exclude(id__in=existing_refs)

    @staticmethod
    def _label(obj):
        for attr in ("code", "cve_id", "title", "name"):
            value = getattr(obj, attr, None)
            if value:
                return str(value)
        return str(getattr(obj, "id", obj))
