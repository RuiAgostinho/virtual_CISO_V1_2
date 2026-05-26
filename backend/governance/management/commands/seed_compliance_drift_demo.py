from django.core.management.base import BaseCommand

from governance.services.security_posture_drift import SecurityPostureDriftService


class Command(BaseCommand):
    help = "Cria um cenario controlado de regressao para demonstrar o Use Case 3."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Aplica a alteracao. Sem esta flag o comando apenas mostra o que faria.",
        )

    def handle(self, *args, **options):
        if not options["apply"]:
            self.stdout.write("Dry-run. Usa --apply para criar snapshot anterior e degradar o estado atual.")
            return

        result = SecurityPostureDriftService.create_demo_regression()
        if not result.get("created"):
            self.stdout.write(self.style.WARNING(result.get("message", "Nao foi possivel criar cenario demo.")))
            return

        self.stdout.write(self.style.SUCCESS(result["message"]))
        self.stdout.write(
            f"Controlo: {result['framework']['code']}:{result['control_code']} - {result['control_title']}"
        )
