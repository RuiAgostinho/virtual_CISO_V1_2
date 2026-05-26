from django.core.management.base import BaseCommand

from risk.services.intel_service import IntelService


class Command(BaseCommand):
    help = "Atualiza flag CISA KEV para CVEs existentes."

    def add_arguments(self, parser):
        parser.add_argument("--url", default=None, help="URL alternativa para o feed JSON CISA KEV.")

    def handle(self, *args, **options):
        result = IntelService.sync_kev(url=options.get("url"))
        self.stdout.write(self.style.SUCCESS("CISA KEV atualizado."))
        for key, value in result.items():
            self.stdout.write(f"{key}: {value}")
