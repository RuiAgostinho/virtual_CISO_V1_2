"""
Seed demo GRC links so the Decision screen compliance chain populates.

The database already ships with frameworks, controls, control-mechanisms,
assessments and compliance gaps. What is missing is the Asset <-> Control
link (Asset.controls), without which the Decision screen region B stays empty
and the score's GRC dimensions fall back to neutral values.

This command:
  1. Picks controls that already have mechanisms AND an assessment (data-rich).
  2. Links them to every Asset (org-wide baseline — idempotent).
  3. Creates sample Evidence and Finding rows on those assessments so regions
     D and the evidence/findings score dimensions light up.

All created rows carry the SEED_MARKER in their title, so `--unlink` can
cleanly remove everything this command added.

Examples:
    .venv\\Scripts\\python.exe manage.py seed_grc_demo
    .venv\\Scripts\\python.exe manage.py seed_grc_demo --controls 6
    .venv\\Scripts\\python.exe manage.py seed_grc_demo --unlink
"""

import sys
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils.timezone import now

from governance.models.assessment import ControlAssessment, Evidence, Finding
from governance.models.control import Control
from risk.models.asset import Asset

# Marker kept only in non-visible fields (Finding.description, Evidence.uri) so
# demo data is cleanly removable without polluting the UI with bracket tags.
SEED_MARKER = "seed-grc-demo"
SEED_URI_TAG = "seed-grc-demo"


def _ensure_utf8_stdout():
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass


class Command(BaseCommand):
    help = "Link demo controls to assets + create sample evidence/findings for the Decision screen."

    def add_arguments(self, parser):
        parser.add_argument("--controls", type=int, default=8, help="How many controls to link (default 8).")
        parser.add_argument("--unlink", action="store_true", help="Remove everything this command created.")

    def handle(self, *args, **options):
        _ensure_utf8_stdout()
        if options["unlink"]:
            self._unlink()
            return
        self._seed(options["controls"])

    # ------------------------------------------------------------------
    # seed
    # ------------------------------------------------------------------

    @transaction.atomic
    def _seed(self, control_limit: int):
        assets = list(Asset.objects.all())
        if not assets:
            self.stdout.write(self.style.WARNING("Sem ativos na base de dados — nada a ligar."))
            return

        controls = self._pick_controls(control_limit)
        if not controls:
            self.stdout.write(self.style.WARNING("Não há controlos com mecanismos + avaliação para ligar."))
            return

        # 1. Link controls to every asset (M2M add is idempotent).
        for asset in assets:
            asset.controls.add(*controls)
        self.stdout.write(
            self.style.SUCCESS(
                f"Ligados {len(controls)} controlo(s) a {len(assets)} ativo(s)."
            )
        )
        for c in controls:
            self.stdout.write(f"  · {c.framework.code}:{c.code} — {c.title[:50]}")

        # 2. Sample evidence + findings on the controls' assessments.
        assessments = ControlAssessment.objects.filter(control__in=controls).select_related("control")
        evidence_created = 0
        findings_created = 0
        for idx, assessment in enumerate(assessments):
            evidence_created += self._ensure_evidence(assessment)
            # A finding on roughly every third assessment, with rotating severity.
            if idx % 3 == 0:
                findings_created += self._ensure_finding(assessment, idx)

        self.stdout.write(
            self.style.SUCCESS(
                f"Evidências criadas: {evidence_created} · Findings criados: {findings_created}"
            )
        )
        self.stdout.write(
            "Pronto. Abre o ecrã de Decisão de uma ocorrência destes ativos para ver a cadeia preenchida."
        )

    def _pick_controls(self, limit: int):
        """Controls with at least one mechanism and one assessment, spread across frameworks."""
        candidates = (
            Control.objects.filter(mechanisms__isnull=False, assessments__isnull=False)
            .select_related("framework")
            .distinct()
        )
        per_framework: dict = {}
        max_per_fw = max(1, limit // 2)
        chosen = []
        for control in candidates.order_by("framework__code", "code"):
            code = control.framework.code
            if per_framework.get(code, 0) >= max_per_fw:
                continue
            per_framework[code] = per_framework.get(code, 0) + 1
            chosen.append(control)
            if len(chosen) >= limit:
                break
        return chosen

    def _ensure_evidence(self, assessment: ControlAssessment) -> int:
        if Evidence.objects.filter(assessment=assessment, uri__contains=SEED_URI_TAG).exists():
            return 0
        code = assessment.control.code
        slug = code.lower()
        Evidence.objects.create(
            assessment=assessment,
            evidence_type=Evidence.EvidenceType.POLICY,
            title=f"Política aprovada — {code}",
            uri=f"https://intranet.local/{SEED_URI_TAG}/politicas/{slug}",
            collected_at=now() - timedelta(days=20),
        )
        Evidence.objects.create(
            assessment=assessment,
            evidence_type=Evidence.EvidenceType.CONFIG,
            title=f"Exportação de configuração — {code}",
            uri=f"https://intranet.local/{SEED_URI_TAG}/evidencias/{slug}-config.json",
            collected_at=now() - timedelta(days=5),
        )
        return 2

    def _ensure_finding(self, assessment: ControlAssessment, idx: int) -> int:
        if Finding.objects.filter(assessment=assessment, description__contains=SEED_MARKER).exists():
            return 0
        severities = [
            Finding.Severity.HIGH,
            Finding.Severity.MEDIUM,
            Finding.Severity.CRITICAL,
            Finding.Severity.LOW,
        ]
        severity = severities[(idx // 3) % len(severities)]
        code = assessment.control.code
        Finding.objects.create(
            assessment=assessment,
            severity=severity,
            title=f"Lacuna identificada em {code}",
            description=(
                "Evidência de operacionalização incompleta detetada durante a avaliação "
                f"do controlo {code}. Requer ação de melhoria. ({SEED_MARKER})"
            ),
            reference=code,
            opened_at=now() - timedelta(days=12),
            status=Finding.Status.OPEN,
        )
        return 1

    # ------------------------------------------------------------------
    # unlink
    # ------------------------------------------------------------------

    @transaction.atomic
    def _unlink(self):
        # Tolerate both the current markers and the legacy "[seed-grc-demo]"
        # title prefix used by earlier versions of this command.
        legacy_prefix = "[seed-grc-demo]"
        ev = Evidence.objects.filter(
            Q(uri__contains=SEED_URI_TAG) | Q(title__startswith=legacy_prefix)
        )
        fd = Finding.objects.filter(
            Q(description__contains=SEED_MARKER) | Q(title__startswith=legacy_prefix)
        )
        ev_count, fd_count = ev.count(), fd.count()
        ev.delete()
        fd.delete()

        # Remove the demo controls from every asset. We only remove the controls
        # this command would have picked, leaving any manually-linked controls.
        controls = self._pick_controls(50)
        unlinked = 0
        for asset in Asset.objects.all():
            existing = set(asset.controls.values_list("id", flat=True))
            to_remove = [c for c in controls if c.id in existing]
            if to_remove:
                asset.controls.remove(*to_remove)
                unlinked += len(to_remove)

        self.stdout.write(
            self.style.SUCCESS(
                f"Removido: {ev_count} evidência(s), {fd_count} finding(s), "
                f"{unlinked} ligação(ões) controlo-ativo."
            )
        )
