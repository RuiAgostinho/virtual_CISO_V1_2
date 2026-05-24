from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import Control, InternalControl, InternalControlFrameworkMapping


class Command(BaseCommand):
    help = "Cria InternalControl 1:1 a partir dos Control existentes e respetivos mappings."

    MIGRATION_RATIONALE = "Migração inicial 1:1 a partir do modelo Control existente."

    def handle(self, *args, **options):
        stats = {
            "total_controls": 0,
            "internal_created": 0,
            "internal_existing": 0,
            "mappings_created": 0,
            "mappings_existing": 0,
            "internal_renamed": 0,
            "conflicts": [],
            "errors": [],
        }

        controls = Control.objects.select_related("framework", "section").order_by(
            "framework__code",
            "code",
        )

        for control in controls:
            stats["total_controls"] += 1
            try:
                with transaction.atomic():
                    internal_control, created, conflict = self._get_or_create_internal_control(control)
                    if created:
                        stats["internal_created"] += 1
                    else:
                        stats["internal_existing"] += 1
                    if conflict:
                        if "renomeado" in conflict:
                            stats["internal_renamed"] += 1
                        stats["conflicts"].append(conflict)

                    _mapping, mapping_created = InternalControlFrameworkMapping.objects.get_or_create(
                        internal_control=internal_control,
                        framework_control=control,
                        defaults={
                            "relationship_type": InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
                            "coverage_percentage": 100,
                            "rationale": self.MIGRATION_RATIONALE,
                            "mapping_source": InternalControlFrameworkMapping.MappingSource.MIGRATED,
                            "validation_status": InternalControlFrameworkMapping.ValidationStatus.APPROVED,
                            "confidence_score": 100,
                        },
                    )
                    if mapping_created:
                        stats["mappings_created"] += 1
                    else:
                        stats["mappings_existing"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(f"{control.framework.code}:{control.code} - {exc}")

        self._print_summary(stats)

    def _get_or_create_internal_control(self, control):
        existing = InternalControl.objects.filter(legacy_control=control).order_by("created_at").first()
        if existing:
            code, conflict = self._unique_internal_code(control, exclude_pk=existing.pk)
            if existing.code != code:
                previous_code = existing.code
                existing.code = code
                existing.save(update_fields=["code", "updated_at"])
                return existing, False, f"{previous_code} renomeado para {code}."
            return existing, False, conflict

        code, conflict = self._unique_internal_code(control)
        status = (
            InternalControl.Status.ACTIVE
            if control.status == Control.Status.ACTIVE
            else InternalControl.Status.DEPRECATED
        )

        internal_control = InternalControl.objects.create(
            code=code,
            title=control.title,
            description=control.description or "",
            control_domain=self._control_domain(control),
            criticality=InternalControl.Criticality.MEDIUM,
            status=status,
            source=InternalControl.Source.MIGRATED,
            legacy_control=control,
            is_active=(status == InternalControl.Status.ACTIVE),
        )
        return internal_control, True, conflict

    def _control_domain(self, control):
        if not control.section:
            return ""
        if control.section.code and control.section.name:
            return self._fit_field("control_domain", f"{control.section.code} - {control.section.name}")
        return self._fit_field("control_domain", control.section.name or control.section.code or "")

    def _unique_internal_code(self, control, exclude_pk=None):
        base_code = self._clean_code(control.code)
        framework_code = self._clean_code(control.framework.code)
        prefixed_code = self._fit_code(f"IC-{framework_code}-{base_code}")
        if self._code_is_available(prefixed_code, exclude_pk=exclude_pk):
            return prefixed_code, None

        suffix = 2
        while True:
            candidate = self._fit_code(f"IC-{framework_code}-{base_code}", suffix=f"-{suffix}")
            if self._code_is_available(candidate, exclude_pk=exclude_pk):
                return candidate, f"{prefixed_code} já existia; usado {candidate}."
            suffix += 1

    def _code_is_available(self, code, exclude_pk=None):
        qs = InternalControl.objects.filter(code=code)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        return not qs.exists()

    def _clean_code(self, code):
        clean = str(code or "").strip()
        return clean or "CONTROL"

    def _fit_code(self, code, suffix=""):
        max_length = InternalControl._meta.get_field("code").max_length
        return f"{code[: max_length - len(suffix)]}{suffix}"

    def _fit_field(self, field_name, value):
        max_length = InternalControl._meta.get_field(field_name).max_length
        text = str(value or "").strip()
        if not max_length:
            return text
        return text[:max_length]

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Bootstrap de InternalControl concluído."))
        self.stdout.write(f"Control analisados: {stats['total_controls']}")
        self.stdout.write(f"InternalControl criados: {stats['internal_created']}")
        self.stdout.write(f"InternalControl já existentes: {stats['internal_existing']}")
        self.stdout.write(f"InternalControl renomeados: {stats['internal_renamed']}")
        self.stdout.write(f"Mappings criados: {stats['mappings_created']}")
        self.stdout.write(f"Mappings já existentes: {stats['mappings_existing']}")

        if stats["conflicts"]:
            self.stdout.write(self.style.WARNING("Conflitos de código resolvidos:"))
            for conflict in stats["conflicts"]:
                self.stdout.write(f"- {conflict}")
        else:
            self.stdout.write("Conflitos de código resolvidos: 0")

        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")
