from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import (
    InternalControl,
    InternalControlFrameworkMapping,
    PolicyControl,
    PolicyInternalControl,
)


class Command(BaseCommand):
    help = "Migra PolicyControl antigo para PolicyInternalControl sem remover a camada antiga."

    MIGRATION_RATIONALE = "Migração inicial a partir de PolicyControl existente."

    def handle(self, *args, **options):
        stats = {
            "total_policy_controls": 0,
            "created": 0,
            "existing": 0,
            "warnings": [],
            "errors": [],
        }

        policy_controls = PolicyControl.objects.select_related(
            "policy",
            "control",
            "control__framework",
        ).order_by("policy__code", "control__framework__code", "control__code")

        for policy_control in policy_controls:
            stats["total_policy_controls"] += 1
            try:
                internal_control = self._find_internal_control(policy_control.control)
                if not internal_control:
                    stats["warnings"].append(
                        f"{policy_control.policy.code} -> "
                        f"{policy_control.control.framework.code}:{policy_control.control.code}: "
                        "InternalControl não encontrado."
                    )
                    continue

                with transaction.atomic():
                    _link, created = PolicyInternalControl.objects.get_or_create(
                        policy=policy_control.policy,
                        internal_control=internal_control,
                        defaults={
                            "applicability": policy_control.applicability,
                            "rationale": self._migration_rationale(policy_control),
                            "mapping_source": PolicyInternalControl.MappingSource.MIGRATED,
                            "validation_status": PolicyInternalControl.ValidationStatus.APPROVED,
                            "confidence_score": 100,
                        },
                    )
                    if created:
                        stats["created"] += 1
                    else:
                        stats["existing"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(
                    f"{policy_control.policy.code} -> {policy_control.control.code}: {exc}"
                )

        self._print_summary(stats)

    def _find_internal_control(self, control):
        internal_control = (
            InternalControl.objects
            .filter(legacy_control=control)
            .order_by("created_at")
            .first()
        )
        if internal_control:
            return internal_control

        mapping = (
            InternalControlFrameworkMapping.objects
            .select_related("internal_control")
            .exclude(
                validation_status__in=[
                    InternalControlFrameworkMapping.ValidationStatus.REJECTED,
                    InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
                ]
            )
            .filter(framework_control=control)
            .order_by("-confidence_score", "created_at")
            .first()
        )
        return mapping.internal_control if mapping else None

    def _migration_rationale(self, policy_control):
        original_rationale = (policy_control.rationale or "").strip()
        if not original_rationale:
            return self.MIGRATION_RATIONALE
        return f"{self.MIGRATION_RATIONALE}\n\nRationale original: {original_rationale}"

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Migração PolicyInternalControl concluída."))
        self.stdout.write(f"PolicyControl analisados: {stats['total_policy_controls']}")
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
