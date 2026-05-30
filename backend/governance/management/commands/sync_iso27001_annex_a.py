import os
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from governance.models import (
    Control,
    Framework,
    FrameworkLevel,
    FrameworkSection,
    InternalControlFrameworkMapping,
)


class Command(BaseCommand):
    help = "Cria/atualiza os controlos ISO/IEC 27001:2022 Annex A a partir do catalogo ISO/IEC 27002:2022."

    THEMES = {
        "A.5": "Organizational controls",
        "A.6": "People controls",
        "A.7": "Physical controls",
        "A.8": "Technological controls",
    }
    RATIONALE = (
        "Mapeamento criado a partir da correspondencia ISO/IEC 27001:2022 Annex A "
        "com o catalogo ISO/IEC 27002:2022 ja normalizado na plataforma."
    )

    def add_arguments(self, parser):
        parser.add_argument("--source-version", default="2022")
        parser.add_argument("--target-version", default="2022")
        parser.add_argument(
            "--pending-review",
            action="store_true",
            help="Cria os mappings como pending_review em vez de approved.",
        )
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        os.environ.setdefault("VIRTUAL_CISO_DISABLE_RAG_SIGNALS", "1")
        source = Framework.objects.filter(
            code=Framework.FrameworkCode.ISO27002,
            version=options["source_version"],
        ).first()
        if not source:
            raise CommandError("ISO/IEC 27002:2022 nao existe na BD.")

        stats = {
            "framework_created": 0,
            "levels_created": 0,
            "sections_created": 0,
            "sections_updated": 0,
            "controls_created": 0,
            "controls_updated": 0,
            "mappings_created": 0,
            "mappings_existing": 0,
            "skipped": 0,
        }

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry-run ativo: nenhuma alteracao sera gravada."))

        validation_status = (
            InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW
            if options["pending_review"]
            else InternalControlFrameworkMapping.ValidationStatus.APPROVED
        )

        with transaction.atomic():
            target, created = Framework.objects.update_or_create(
                code=Framework.FrameworkCode.ISO27001,
                version=options["target_version"],
                defaults={
                    "name": "ISO/IEC 27001",
                    "publisher": "ISO/IEC",
                    "description": "Information security management systems - Requirements, Annex A controls.",
                    "is_active": True,
                },
            )
            stats["framework_created"] = int(created)
            level = self._ensure_level(target, stats)
            sections = self._ensure_sections(target, level, stats)

            for source_control in Control.objects.filter(framework=source).select_related("section").order_by("code"):
                target_code = self._annex_a_code(source_control.code)
                if not target_code:
                    stats["skipped"] += 1
                    continue
                target_control, control_created = Control.objects.update_or_create(
                    framework=target,
                    code=target_code,
                    defaults={
                        "section": sections[target_code.rsplit(".", 1)[0]],
                        "title": source_control.title,
                        "description": source_control.description,
                        "implementation_guidance": source_control.implementation_guidance,
                        "is_mandatory": source_control.is_mandatory,
                        "applicability_scope": source_control.applicability_scope,
                        "status": source_control.status,
                    },
                )
                stats["controls_created" if control_created else "controls_updated"] += 1

                for source_mapping in InternalControlFrameworkMapping.objects.filter(
                    framework_control=source_control,
                    validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
                ).select_related("internal_control"):
                    _mapping, mapping_created = InternalControlFrameworkMapping.objects.get_or_create(
                        internal_control=source_mapping.internal_control,
                        framework_control=target_control,
                        defaults={
                            "relationship_type": source_mapping.relationship_type,
                            "coverage_percentage": Decimal("100.00"),
                            "rationale": self.RATIONALE,
                            "mapping_source": InternalControlFrameworkMapping.MappingSource.RULE_BASED,
                            "validation_status": validation_status,
                            "confidence_score": Decimal("90.00"),
                        },
                    )
                    stats["mappings_created" if mapping_created else "mappings_existing"] += 1

            if options["dry_run"]:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS("ISO/IEC 27001 Annex A sincronizado."))
        for key, value in stats.items():
            self.stdout.write(f"{key}: {value}")
        self.stdout.write(f"validation_status: {validation_status}")

    def _ensure_level(self, framework, stats):
        level, created = FrameworkLevel.objects.get_or_create(
            framework=framework,
            level=1,
            defaults={"name": "Annex A theme", "description": "ISO/IEC 27001:2022 Annex A control theme."},
        )
        if created:
            stats["levels_created"] += 1
        return level

    def _ensure_sections(self, framework, level, stats):
        sections = {}
        for order, (code, name) in enumerate(self.THEMES.items(), start=1):
            section, created = FrameworkSection.objects.update_or_create(
                framework=framework,
                code=code,
                defaults={
                    "name": name,
                    "parent": None,
                    "level": 1,
                    "level_ref": level,
                    "sort_order": order,
                },
            )
            stats["sections_created" if created else "sections_updated"] += 1
            sections[code] = section
        return sections

    def _annex_a_code(self, code):
        code = str(code or "").strip()
        if code.startswith("A.5."):
            return code
        if code.startswith("B.6."):
            return f"A.6.{code.split('.', 2)[2]}"
        if code.startswith("C.7."):
            return f"A.7.{code.split('.', 2)[2]}"
        if code.startswith("D.8."):
            return f"A.8.{code.split('.', 2)[2]}"
        return None
