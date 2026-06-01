import sys

from django.core.management.base import BaseCommand

from risk.models.vulnerability import AssetVulnerability
from risk.services.prioritization import VulnerabilityScoringEngine


def _ensure_utf8_stdout():
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass


class Command(BaseCommand):
    help = "Recalcula ocorrencias existentes para preencher o feature store de priorizacao."

    DEFAULT_STATUSES = ["Open", "In remediation", "Mitigated", "Resolved", "Accepted risk", "False positive"]

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=1000, help="Numero maximo de ocorrencias a processar.")
        parser.add_argument(
            "--status",
            action="append",
            dest="statuses",
            help="Estado a incluir. Pode ser usado varias vezes. Por omissao inclui estados abertos e terminais.",
        )
        parser.add_argument("--mode", default="explainable_weighted", help="Modo de scoring a registar.")

    def handle(self, *args, **options):
        _ensure_utf8_stdout()
        limit = max(1, int(options.get("limit") or 1000))
        statuses = options.get("statuses") or self.DEFAULT_STATUSES
        mode = options.get("mode") or "explainable_weighted"

        qs = (
            AssetVulnerability.objects.filter(status__in=statuses)
            .select_related("asset", "vulnerability")
            .order_by("-last_seen")[:limit]
        )

        processed = 0
        failed = 0
        for occurrence in qs:
            try:
                VulnerabilityScoringEngine.calculate_scores(occurrence, mode=mode)
                processed += 1
            except Exception as exc:
                failed += 1
                self.stderr.write(
                    self.style.WARNING(f"Falhou {occurrence.id}: {exc}")
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Feature store atualizado: {processed} ocorrencia(s) processada(s), {failed} falha(s)."
            )
        )
