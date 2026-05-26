from django.core.management.base import BaseCommand

from risk.services.intel_service import IntelService


class Command(BaseCommand):
    help = "Atualiza EPSS para CVEs existentes a partir do feed FIRST/Empirical Security."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None, help="Numero maximo de CVEs a atualizar.")
        parser.add_argument("--cve", action="append", dest="cves", help="CVE especifica a atualizar. Pode repetir.")
        parser.add_argument("--url", default=None, help="URL alternativa para o feed EPSS CSV/CSV.GZ.")

    def handle(self, *args, **options):
        result = IntelService.sync_epss(
            limit=options.get("limit"),
            cve_ids=options.get("cves"),
            url=options.get("url"),
        )
        self.stdout.write(self.style.SUCCESS("EPSS atualizado."))
        for key, value in result.items():
            self.stdout.write(f"{key}: {value}")
