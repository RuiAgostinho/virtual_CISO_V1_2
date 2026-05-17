"""
Smoke-test the MultidimensionalScoringEngine without the UI.

Examples:
    .venv\\Scripts\\python.exe manage.py score_occurrence
    .venv\\Scripts\\python.exe manage.py score_occurrence --limit 3
    .venv\\Scripts\\python.exe manage.py score_occurrence --id <UUID>
"""

import sys

from django.core.management.base import BaseCommand, CommandError

from risk.models.vulnerability import AssetVulnerability
from risk.services.multidimensional_scoring import MultidimensionalScoringEngine


def _ensure_utf8_stdout():
    """Windows PowerShell defaults to cp1252; force UTF-8 so Portuguese accents render."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass


class Command(BaseCommand):
    help = "Run the multidimensional priority score on one or more AssetVulnerability occurrences."

    def add_arguments(self, parser):
        parser.add_argument("--id", type=str, default=None, help="AssetVulnerability UUID to score.")
        parser.add_argument("--limit", type=int, default=5, help="When --id is not given, how many open occurrences to score.")
        parser.add_argument("--status", type=str, default="Open", help="Status filter when scanning (default: Open).")

    def handle(self, *args, **options):
        _ensure_utf8_stdout()
        occ_id = options.get("id")
        limit = options.get("limit") or 5
        status = options.get("status") or "Open"

        if occ_id:
            try:
                qs = AssetVulnerability.objects.filter(id=occ_id)
            except Exception as exc:
                raise CommandError(f"Invalid AssetVulnerability id: {exc}")
            if not qs.exists():
                raise CommandError(f"No AssetVulnerability found for id {occ_id}")
        else:
            qs = AssetVulnerability.objects.filter(status__iexact=status).select_related("asset", "vulnerability")[:limit]

        if not qs.exists():
            self.stdout.write(self.style.WARNING(f"No AssetVulnerability rows match status='{status}'."))
            return

        for av in qs:
            score = MultidimensionalScoringEngine.score_occurrence(av)
            self._print(av, score)

    def _print(self, av, score):
        sep = "=" * 78
        self.stdout.write(sep)
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"{av.vulnerability.cve_id}  on  {av.asset.name}   ({score.classification_label})"
            )
        )
        self.stdout.write(
            f"Score global: {score.global_score:6.2f} / 100   "
            f"Banda: {score.classification_band:8s}   Ação: {score.recommended_action}"
        )
        self.stdout.write(sep)
        self.stdout.write(
            f"{'Dimensão':30s} {'Normalizado':>12s} {'Peso':>7s} {'Contrib.':>10s}   Fonte"
        )
        for d in score.dimensions:
            self.stdout.write(
                f"{d.label:30s} {d.normalized_score:12.2f} {d.weight:7.2f} {d.contribution:10.2f}   {d.source}"
            )
            self.stdout.write(f"    > {d.explanation}")
        self.stdout.write("")
