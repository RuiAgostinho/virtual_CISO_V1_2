from django.core.management.base import BaseCommand
from django.db.models import Q

from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import Control, EvidenceItem, InternalControl


class Command(BaseCommand):
    help = "Reindexa no RAG os dados de governance localizados para PT-PT."

    def add_arguments(self, parser):
        parser.add_argument("--controls", action="store_true", help="Reindexa controlos externos localizados.")
        parser.add_argument("--internal-controls", action="store_true", help="Reindexa controlos internos.")
        parser.add_argument("--evidence-items", action="store_true", help="Reindexa evidencias reutilizaveis.")
        parser.add_argument("--framework-code", default=None, help="Filtra controlos externos por codigo de framework.")
        parser.add_argument("--framework-version", default=None, help="Filtra controlos externos por versao de framework.")
        parser.add_argument("--control-limit", type=int, default=None)
        parser.add_argument("--internal-control-limit", type=int, default=None)
        parser.add_argument("--evidence-item-limit", type=int, default=None)

    def handle(self, *args, **options):
        selected = any(options[name] for name in ("controls", "internal_controls", "evidence_items"))
        run_controls = options["controls"] or not selected
        run_internal_controls = options["internal_controls"] or not selected
        run_evidence_items = options["evidence_items"] or not selected

        control_count = self._reindex_controls(
            options["control_limit"],
            options["framework_code"],
            options["framework_version"],
        ) if run_controls else 0
        internal_count = (
            self._reindex_internal_controls(options["internal_control_limit"])
            if run_internal_controls
            else 0
        )
        evidence_count = (
            self._reindex_evidence_items(options["evidence_item_limit"])
            if run_evidence_items
            else 0
        )

        self.stdout.write(self.style.SUCCESS("Reindexacao localizada concluida."))
        self.stdout.write(f"Controlos externos reindexados: {control_count}")
        self.stdout.write(f"Controlos internos reindexados: {internal_count}")
        self.stdout.write(f"Evidencias reutilizaveis reindexadas: {evidence_count}")

    def _reindex_controls(self, limit, framework_code=None, framework_version=None):
        controls = (
            Control.objects.select_related("framework")
            .filter(status=Control.Status.ACTIVE)
            .filter(
                Q(framework__code="DL125", framework__version="2025")
                | Q(framework__code="NIS2", framework__version="2022")
                | Q(framework__code="NISTCSF", framework__version="2.0")
            )
            .order_by("framework__code", "framework__version", "code")
        )
        if framework_code:
            controls = controls.filter(framework__code=framework_code)
        if framework_version:
            controls = controls.filter(framework__version=framework_version)
        if limit is not None:
            controls = controls[:limit]

        count = 0
        for control in controls:
            if KnowledgeIngestionService.upsert_control(control):
                count += 1
                self.stdout.write(
                    f"Reindexado controlo externo: {control.framework.code} {control.framework.version}:{control.code}"
                )
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao reindexar controlo externo: {control.code}"))
        return count

    def _reindex_internal_controls(self, limit):
        controls = (
            InternalControl.objects.filter(is_active=True)
            .prefetch_related(
                "framework_mappings__framework_control__framework",
                "policy_links__policy",
                "document_links__document",
                "mechanism_links__mechanism",
            )
            .order_by("code")
        )
        if limit is not None:
            controls = controls[:limit]

        count = 0
        for control in controls:
            if KnowledgeIngestionService.upsert_internal_control(control):
                count += 1
                self.stdout.write(f"Reindexado controlo interno: {control.code} - {control.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao reindexar controlo interno: {control.code}"))
        return count

    def _reindex_evidence_items(self, limit):
        evidence_items = EvidenceItem.objects.filter(is_active=True).prefetch_related("links").order_by("title")
        if limit is not None:
            evidence_items = evidence_items[:limit]

        count = 0
        for evidence in evidence_items:
            if KnowledgeIngestionService.upsert_evidence_item(evidence):
                count += 1
                self.stdout.write(f"Reindexada evidencia reutilizavel: {evidence.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao reindexar evidencia reutilizavel: {evidence.title}"))
        return count
