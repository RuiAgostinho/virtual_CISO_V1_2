from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import (
    ControlMechanism,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
)


class Command(BaseCommand):
    help = "Migra ControlMechanism antigo para InternalControlMechanism sem remover a camada antiga."

    MIGRATION_RATIONALE = "Migração inicial a partir de ControlMechanism existente."

    def handle(self, *args, **options):
        stats = {
            "total_control_mechanisms": 0,
            "created": 0,
            "existing": 0,
            "implementation_status_mapped": {},
            "warnings": [],
            "errors": [],
        }

        control_mechanisms = ControlMechanism.objects.select_related(
            "control",
            "control__framework",
            "mechanism",
        ).order_by("control__framework__code", "control__code", "mechanism__title")

        for control_mechanism in control_mechanisms:
            stats["total_control_mechanisms"] += 1
            try:
                internal_control = self._find_internal_control(control_mechanism.control)
                if not internal_control:
                    stats["warnings"].append(
                        f"{control_mechanism.control.framework.code}:{control_mechanism.control.code} -> "
                        f"{control_mechanism.mechanism.title}: InternalControl não encontrado."
                    )
                    continue

                with transaction.atomic():
                    implementation_status = self._map_implementation_status(control_mechanism.status)
                    _link, created = InternalControlMechanism.objects.get_or_create(
                        internal_control=internal_control,
                        mechanism=control_mechanism.mechanism,
                        defaults={
                            "contribution_weight": 100,
                            "mandatory": False,
                            "implementation_status": implementation_status,
                            "relationship_type": InternalControlMechanism.RelationshipType.SUPPORTING,
                            "rationale": self._migration_rationale(control_mechanism),
                            "mapping_source": InternalControlMechanism.MappingSource.MIGRATED,
                            "validation_status": InternalControlMechanism.ValidationStatus.APPROVED,
                            "confidence_score": 100,
                        },
                    )
                    if created:
                        stats["created"] += 1
                        stats["implementation_status_mapped"][implementation_status] = (
                            stats["implementation_status_mapped"].get(implementation_status, 0) + 1
                        )
                    else:
                        stats["existing"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(
                    f"{control_mechanism.control.code} -> {control_mechanism.mechanism.title}: {exc}"
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

    def _migration_rationale(self, control_mechanism):
        details = [self.MIGRATION_RATIONALE]
        if control_mechanism.status:
            details.append(f"Estado original: {control_mechanism.status}")
        if control_mechanism.responsible:
            details.append(f"Responsável original: {control_mechanism.responsible}")
        if control_mechanism.deadline:
            details.append(f"Prazo original: {control_mechanism.deadline}")
        if control_mechanism.acceptance_criteria:
            details.append(f"Critérios originais: {control_mechanism.acceptance_criteria}")
        return "\n".join(details)

    def _map_implementation_status(self, legacy_status):
        normalized_status = self._normalize_status(legacy_status)
        if not normalized_status:
            return InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED
        if "implementado" in normalized_status and "em_" not in normalized_status:
            return InternalControlMechanism.ImplementationStatus.IMPLEMENTED
        if "em_" in normalized_status and "implement" in normalized_status:
            return InternalControlMechanism.ImplementationStatus.PARTIALLY_IMPLEMENTED
        if "progress" in normalized_status or "partial" in normalized_status:
            return InternalControlMechanism.ImplementationStatus.PARTIALLY_IMPLEMENTED
        if "planned" in normalized_status or "plane" in normalized_status:
            return InternalControlMechanism.ImplementationStatus.PLANNED
        return InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED

    def _normalize_status(self, value):
        return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Migração InternalControlMechanism concluída."))
        self.stdout.write(f"ControlMechanism analisados: {stats['total_control_mechanisms']}")
        self.stdout.write(f"Associações criadas: {stats['created']}")
        self.stdout.write(f"Associações já existentes: {stats['existing']}")

        self.stdout.write(
            "Estado operacional: estados antigos foram mapeados para implementation_status; "
            "quando nao ha equivalencia segura, fica not_implemented."
        )
        if stats["implementation_status_mapped"]:
            self.stdout.write("implementation_status criados:")
            for status, count in sorted(stats["implementation_status_mapped"].items()):
                self.stdout.write(f"- {status}: {count}")

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
