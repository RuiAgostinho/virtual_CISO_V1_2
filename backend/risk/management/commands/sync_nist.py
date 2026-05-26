from django.core.management.base import BaseCommand

from risk.services.intel_service import IntelService


class Command(BaseCommand):
    help = "Enriquece CVEs existentes com dados NIST NVD 2.0."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50, help="Numero maximo de CVEs a consultar.")
        parser.add_argument("--cve", action="append", dest="cves", help="CVE especifica a atualizar. Pode repetir.")
        parser.add_argument("--url", default=None, help="URL alternativa da API NVD 2.0.")
        parser.add_argument(
            "--sleep",
            type=float,
            default=0.6,
            help="Pausa entre pedidos para respeitar rate limiting da API.",
        )

    def handle(self, *args, **options):
        result = IntelService.sync_nist(
            limit=options.get("limit"),
            cve_ids=options.get("cves"),
            url=options.get("url"),
            sleep_seconds=options.get("sleep"),
        )
        self.stdout.write(self.style.SUCCESS("NIST NVD atualizado."))
        for key, value in result.items():
            self.stdout.write(f"{key}: {value}")
