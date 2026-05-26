from django.core.management.base import BaseCommand

from governance.models import ControlAssessmentSnapshot
from governance.services.security_posture_drift import SecurityPostureDriftService


class Command(BaseCommand):
    help = "Cria uma fotografia auditavel do estado atual das ControlAssessment."

    def add_arguments(self, parser):
        parser.add_argument("--label", default="", help="Nome/descrição do snapshot.")
        parser.add_argument(
            "--type",
            default=ControlAssessmentSnapshot.SnapshotType.AUDIT,
            choices=[choice[0] for choice in ControlAssessmentSnapshot.SnapshotType.choices],
            help="Tipo de snapshot.",
        )

    def handle(self, *args, **options):
        result = SecurityPostureDriftService.create_current_snapshot(
            label=options["label"],
            snapshot_type=options["type"],
        )
        self.stdout.write(self.style.SUCCESS("Snapshot de postura criado."))
        self.stdout.write(f"ControlAssessment capturadas: {result['created']}")
        self.stdout.write(f"captured_at: {result['captured_at']}")
        self.stdout.write(f"snapshot_type: {result['snapshot_type']}")
        if result["snapshot_label"]:
            self.stdout.write(f"snapshot_label: {result['snapshot_label']}")
