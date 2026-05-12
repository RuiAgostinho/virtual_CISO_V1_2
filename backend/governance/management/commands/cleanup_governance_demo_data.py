from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import Control, Mechanism


class Command(BaseCommand):
    help = "Removes known demo/test governance data from the local database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be removed without deleting anything.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        duplicate_iso_controls = Control.objects.filter(
            framework__name="ISO/IEC 27002",
            code__in=["8.8", "8.9"],
        )
        test_controls = Control.objects.filter(code="A.5.2222", title__iexact="teste")
        test_mechanisms = Mechanism.objects.filter(title__iexact="fechadura manual")

        self.stdout.write("Governance cleanup candidates:")
        self.stdout.write(f"Duplicate ISO 27002 controls : {duplicate_iso_controls.count()}")
        self.stdout.write(f"Test controls                : {test_controls.count()}")
        self.stdout.write(f"Test mechanisms              : {test_mechanisms.count()}")

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run only. No records were deleted."))
            return

        removed_duplicate_controls, _ = duplicate_iso_controls.delete()
        removed_test_controls, _ = test_controls.delete()
        removed_test_mechanisms, _ = test_mechanisms.delete()

        self.stdout.write(self.style.SUCCESS("Governance cleanup completed."))
        self.stdout.write(f"Deleted duplicate control rows : {removed_duplicate_controls}")
        self.stdout.write(f"Deleted test control rows      : {removed_test_controls}")
        self.stdout.write(f"Deleted test mechanism rows    : {removed_test_mechanisms}")