from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import GovernanceDocument, GovernanceDocumentSection, PolicySection


class Command(BaseCommand):
    help = "Migra PolicySection para GovernanceDocumentSection preservando hierarquia."

    def handle(self, *args, **options):
        stats = {
            "total_policy_sections": 0,
            "created": 0,
            "existing": 0,
            "warnings": [],
            "errors": [],
        }
        migrated_sections = {}

        sections = PolicySection.objects.select_related("policy", "parent").order_by("policy__code", "order", "title")

        for section in sections:
            stats["total_policy_sections"] += 1
            try:
                with transaction.atomic():
                    result = self._migrate_section(section, migrated_sections, stats)
                    if result == "created":
                        stats["created"] += 1
                    elif result == "existing":
                        stats["existing"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(f"{section.policy.code} - {section.title}: {exc}")

        self._print_summary(stats)

    def _migrate_section(self, section, migrated_sections, stats):
        if section.id in migrated_sections:
            return migrated_sections[section.id][1]

        document = GovernanceDocument.objects.filter(legacy_policy=section.policy).order_by("created_at").first()
        if not document:
            stats["warnings"].append(
                f"{section.policy.code} - {section.title}: GovernanceDocument com legacy_policy não encontrado."
            )
            return None

        parent_section = None
        if section.parent_id:
            self._migrate_section(section.parent, migrated_sections, stats)
            parent_section = migrated_sections.get(section.parent_id, (None, None))[0]

        governance_section, created = GovernanceDocumentSection.objects.get_or_create(
            document=document,
            title=section.title,
            order=section.order,
            parent_section=parent_section,
            defaults={
                "section_number": str(section.order),
                "content": section.content or "",
            },
        )
        result = "created" if created else "existing"
        migrated_sections[section.id] = (governance_section, result)
        return result

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Migração GovernanceDocumentSection concluída."))
        self.stdout.write(f"PolicySection analisadas: {stats['total_policy_sections']}")
        self.stdout.write(f"Secções criadas: {stats['created']}")
        self.stdout.write(f"Secções já existentes: {stats['existing']}")

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
