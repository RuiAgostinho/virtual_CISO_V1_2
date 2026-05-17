"""
Smoke-test the decision registrar.

Simulates the body of POST /api/governance/decision-context/<id>/register/.

Examples:
    .venv\\Scripts\\python.exe manage.py register_test_decision --code mitigate --justification "Aplicar patch KB-2025-9981 e ativar hardening"
    .venv\\Scripts\\python.exe manage.py register_test_decision --code accepted --justification "Risco aceite — sistema legado em retirement Q3" --id <UUID>
    .venv\\Scripts\\python.exe manage.py register_test_decision --code transferred --justification "Transferir para equipa de infra" --transfer-to "Equipa Infra"
"""

import json
import sys

from django.core.management.base import BaseCommand, CommandError

from governance.services.decision_registrar import (
    DecisionValidationError,
    register_decision,
)
from risk.models.vulnerability import AssetVulnerability


def _ensure_utf8_stdout():
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass


class Command(BaseCommand):
    help = "Smoke-test: register a decision through the registrar service (bypasses HTTP)."

    def add_arguments(self, parser):
        parser.add_argument("--id", type=str, default=None, help="AssetVulnerability UUID (default: first Open).")
        parser.add_argument("--code", type=str, required=True, help="Decision code: accepted | mitigate | deferred | transferred | converted_to_action.")
        parser.add_argument("--justification", type=str, required=True, help="Justification text (>=10 chars).")
        parser.add_argument("--title", type=str, default=None)
        parser.add_argument("--transfer-to", type=str, default=None)
        parser.add_argument("--due-date", type=str, default=None)
        parser.add_argument("--actor", type=str, default="cli-test", help="Actor label for audit trail.")

    def handle(self, *args, **options):
        _ensure_utf8_stdout()

        if options["id"]:
            occurrence = (
                AssetVulnerability.objects.filter(id=options["id"])
                .select_related("asset", "vulnerability")
                .first()
            )
            if not occurrence:
                raise CommandError(f"No AssetVulnerability with id {options['id']}")
        else:
            occurrence = (
                AssetVulnerability.objects.filter(status__iexact="Open")
                .select_related("asset", "vulnerability")
                .first()
            )
            if not occurrence:
                raise CommandError("No open AssetVulnerability available for the smoke test.")

        self.stdout.write(
            f"Target occurrence: {occurrence.vulnerability.cve_id} on {occurrence.asset.name} "
            f"(status={occurrence.status})"
        )

        try:
            result = register_decision(
                occurrence,
                decision_code=options["code"],
                justification=options["justification"],
                actor=options["actor"],
                title=options.get("title"),
                transfer_to=options.get("transfer_to"),
                due_date=options.get("due_date"),
            )
        except DecisionValidationError as exc:
            self.stdout.write(self.style.ERROR("Validação falhou:"))
            self.stdout.write(json.dumps(exc.errors, indent=2, ensure_ascii=False))
            raise CommandError("Aborted by validation error.")

        self.stdout.write(self.style.SUCCESS("Decisão registada com sucesso."))
        self.stdout.write(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
        occurrence.refresh_from_db()
        self.stdout.write(f"\nOcorrência depois do registo: status={occurrence.status}")
        history = occurrence.history.order_by("-timestamp")[:3]
        if history:
            self.stdout.write("Últimas entradas no histórico desta ocorrência:")
            for h in history:
                self.stdout.write(f"  - [{h.timestamp.isoformat()}] {h.action} (por {h.user})")
