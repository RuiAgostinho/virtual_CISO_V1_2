from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import GovernanceDocument, GovernanceDocumentControl, PolicyInternalControl


class Command(BaseCommand):
    help = "Migra PolicyInternalControl para GovernanceDocumentControl."

    MIGRATION_RATIONALE = "Migração inicial a partir de PolicyInternalControl existente."

    def handle(self, *args, **options):
        stats = {
            "total_policy_internal_controls": 0,
            "created": 0,
            "existing": 0,
            "warnings": [],
            "errors": [],
        }

        links = PolicyInternalControl.objects.select_related(
            "policy",
            "internal_control",
        ).order_by("policy__code", "internal_control__code")

        for link in links:
            stats["total_policy_internal_controls"] += 1
            try:
                document = GovernanceDocument.objects.filter(legacy_policy=link.policy).order_by("created_at").first()
                if not document:
                    stats["warnings"].append(
                        f"{link.policy.code} -> {link.internal_control.code}: GovernanceDocument com legacy_policy não encontrado."
                    )
                    continue

                with transaction.atomic():
                    _document_control, created = GovernanceDocumentControl.objects.get_or_create(
                        document=document,
                        internal_control=link.internal_control,
                        purpose=GovernanceDocumentControl.Purpose.DEFINES,
                        defaults={
                            "rationale": self.MIGRATION_RATIONALE,
                            "mapping_source": GovernanceDocumentControl.MappingSource.MIGRATED,
                            "validation_status": GovernanceDocumentControl.ValidationStatus.APPROVED,
                            "confidence_score": 100,
                        },
                    )
                    if created:
                        stats["created"] += 1
                    else:
                        stats["existing"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(f"{link.policy.code} -> {link.internal_control.code}: {exc}")

        self._print_summary(stats)

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Migração GovernanceDocumentControl concluída."))
        self.stdout.write(f"PolicyInternalControl analisados: {stats['total_policy_internal_controls']}")
        self.stdout.write(f"Associações criadas: {stats['created']}")
        self.stdout.write(f"Associações já existentes: {stats['existing']}")

        if stats["warnings"]:
            self.stdout.write(self.style.WARNING("Warnings:"))
            for warning in stats["warnings"]:
                self.stdout.write(f"- {warning}")
        else:
            self.stdout.write("Warnings: 0")

        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")
