from django.core.management.base import BaseCommand

from governance.services.control_mapping_engine import ControlMappingEngine


class Command(BaseCommand):
    help = "Builds cross-framework ControlMapping records from shared mechanisms."

    def add_arguments(self, parser):
        parser.add_argument(
            "--min-shared-mechanisms",
            type=int,
            default=1,
            help="Minimum number of shared mechanisms required to infer a control mapping.",
        )

    def handle(self, *args, **options):
        results = ControlMappingEngine.build_mappings(
            min_shared_mechanisms=options["min_shared_mechanisms"]
        )
        overview = ControlMappingEngine.overview()

        self.stdout.write(self.style.SUCCESS("Control mapping rebuilt."))
        self.stdout.write(f"Deleted automatic mappings : {results['deleted_auto_mappings']}")
        self.stdout.write(f"Candidate mappings        : {results['candidate_mappings']}")
        self.stdout.write(f"Created mappings          : {results['created_mappings']}")
        self.stdout.write(f"Skipped existing mappings : {results['skipped_existing_mappings']}")
        self.stdout.write("")
        self.stdout.write("Framework scores:")
        for item in overview["framework_scores"]:
            self.stdout.write(
                f"- {item['framework_name']}: {item['score']}% "
                f"({item['implemented']} implemented, {item['partial']} partial, "
                f"{item['missing']} missing; mapping coverage {item['mapping_coverage']}%)"
            )