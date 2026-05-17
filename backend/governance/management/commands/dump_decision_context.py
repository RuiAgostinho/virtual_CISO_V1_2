"""
Print the payload that GET /api/governance/decision-context/<id>/ would return.

Examples:
    .venv\\Scripts\\python.exe manage.py dump_decision_context
    .venv\\Scripts\\python.exe manage.py dump_decision_context --id <UUID>
    .venv\\Scripts\\python.exe manage.py dump_decision_context --status Open
"""

import json
import sys

from django.core.management.base import BaseCommand, CommandError

from governance.services.decision_context_builder import DecisionContextBuilder
from risk.models.vulnerability import AssetVulnerability


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
    help = "Dump the Decision-screen context payload for one AssetVulnerability."

    def add_arguments(self, parser):
        parser.add_argument("--id", type=str, default=None, help="AssetVulnerability UUID.")
        parser.add_argument("--status", type=str, default="Open", help="Status when picking the first match (default: Open).")
        parser.add_argument("--pretty", action="store_true", default=True, help="Indent JSON (default).")
        parser.add_argument("--compact", action="store_true", help="Single-line JSON output.")

    def handle(self, *args, **options):
        _ensure_utf8_stdout()
        occ_id = options.get("id")
        status = options.get("status") or "Open"
        compact = options.get("compact")

        if occ_id:
            occurrence = AssetVulnerability.objects.filter(id=occ_id).select_related("asset", "vulnerability").first()
            if not occurrence:
                raise CommandError(f"No AssetVulnerability found with id {occ_id}")
        else:
            occurrence = (
                AssetVulnerability.objects.filter(status__iexact=status)
                .select_related("asset", "vulnerability")
                .first()
            )
            if not occurrence:
                raise CommandError(f"No AssetVulnerability with status '{status}'.")

        payload = DecisionContextBuilder.build(occurrence)

        if compact:
            self.stdout.write(json.dumps(payload, ensure_ascii=False, default=str))
        else:
            self.stdout.write(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
