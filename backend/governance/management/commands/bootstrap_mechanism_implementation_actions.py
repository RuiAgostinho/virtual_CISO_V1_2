from django.core.management.base import BaseCommand

from governance.models import GovernanceAction, Mechanism
from governance.services.mechanism_implementation_planner import MechanismImplementationPlanner


class Command(BaseCommand):
    help = "Cria tarefas operacionais de implementacao para mecanismos sem plano ativo."

    def add_arguments(self, parser):
        parser.add_argument("--mechanism-id", dest="mechanism_id", default=None)
        parser.add_argument("--owner", dest="owner", default="")
        parser.add_argument("--force", action="store_true", help="Atualiza/cria mesmo quando ja existe plano ativo.")

    def handle(self, *args, **options):
        mechanism_id = options.get("mechanism_id")
        owner = options.get("owner") or ""
        force = bool(options.get("force"))

        mechanisms = Mechanism.objects.all().order_by("title")
        if mechanism_id:
            mechanisms = mechanisms.filter(id=mechanism_id)

        analysed = 0
        mechanisms_skipped = 0
        created = 0
        updated = 0
        action_skipped = 0

        for mechanism in mechanisms:
            analysed += 1
            has_active_plan = (
                GovernanceAction.objects
                .filter(target_type="mechanism", target_id=str(mechanism.id))
                .exclude(status__in=[GovernanceAction.Status.DONE, GovernanceAction.Status.CANCELLED])
                .exists()
            )
            if has_active_plan and not force:
                mechanisms_skipped += 1
                continue

            result = MechanismImplementationPlanner.create_template_actions(
                mechanism,
                owner=owner,
                user=None,
            )
            created += result["created"]
            updated += result["updated"]
            action_skipped += result["skipped"]

        self.stdout.write(self.style.SUCCESS("Bootstrap de tarefas de mecanismos concluido."))
        self.stdout.write(f"Mecanismos analisados: {analysed}")
        self.stdout.write(f"Mecanismos ignorados com plano ativo: {mechanisms_skipped}")
        self.stdout.write(f"Tarefas criadas: {created}")
        self.stdout.write(f"Tarefas atualizadas: {updated}")
        self.stdout.write(f"Tarefas ignoradas: {action_skipped}")
