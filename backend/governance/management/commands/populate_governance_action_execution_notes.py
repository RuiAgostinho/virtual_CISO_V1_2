from django.core.management.base import BaseCommand

from governance.models import GovernanceAction, Mechanism
from governance.services.action_plan_service import GovernanceActionPlanService
from governance.services.mechanism_implementation_planner import MechanismImplementationPlanner


class Command(BaseCommand):
    help = "Preenche notas de execucao em tarefas de governacao existentes."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Substitui notas existentes.")
        parser.add_argument("--dry-run", action="store_true", help="Mostra resumo sem gravar alteracoes.")
        parser.add_argument("--target-type", dest="target_type", default="", help="Filtra por target_type.")

    def handle(self, *args, **options):
        force = bool(options.get("force"))
        dry_run = bool(options.get("dry_run"))
        target_type = options.get("target_type") or ""

        queryset = GovernanceAction.objects.all().order_by("created_at")
        if target_type:
            queryset = queryset.filter(target_type=target_type)
        if not force:
            queryset = queryset.filter(notes="")

        analysed = 0
        updated = 0
        skipped = 0
        missing_target = 0

        for action in queryset.iterator():
            analysed += 1
            notes = ""

            if action.target_type == "mechanism" and action.target_id:
                try:
                    mechanism = Mechanism.objects.filter(id=action.target_id).first()
                except Exception:
                    mechanism = None
                if mechanism:
                    notes = MechanismImplementationPlanner.execution_notes_for_action(mechanism, action)
                else:
                    missing_target += 1

            if not notes:
                notes = GovernanceActionPlanService.execution_notes_for_action(action)

            if not notes:
                skipped += 1
                continue

            if not dry_run:
                action.notes = notes
                action.save(update_fields=["notes", "updated_at"])
            updated += 1

        self.stdout.write(self.style.SUCCESS("Preenchimento de notas de execucao concluido."))
        self.stdout.write(f"Tarefas analisadas: {analysed}")
        self.stdout.write(f"Tarefas atualizadas: {updated}")
        self.stdout.write(f"Tarefas ignoradas: {skipped}")
        self.stdout.write(f"Alvos nao encontrados: {missing_target}")
        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run ativo: nenhuma alteracao foi gravada."))
