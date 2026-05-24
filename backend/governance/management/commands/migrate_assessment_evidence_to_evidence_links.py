from django.core.management.base import BaseCommand

from governance.models import (
    Evidence,
    EvidenceItem,
    EvidenceLink,
    InternalControl,
    InternalControlFrameworkMapping,
)


class Command(BaseCommand):
    help = "Migra Evidence antiga de ControlAssessment para EvidenceLink."

    MIGRATION_RATIONALE = "Migração inicial a partir de Evidence existente."

    TYPE_MAP = {
        Evidence.EvidenceType.POLICY: EvidenceItem.EvidenceType.APPROVAL_RECORD,
        Evidence.EvidenceType.PROCEDURE: EvidenceItem.EvidenceType.REPORT,
        Evidence.EvidenceType.LOG: EvidenceItem.EvidenceType.LOG,
        Evidence.EvidenceType.SCREENSHOT: EvidenceItem.EvidenceType.SCREENSHOT,
        Evidence.EvidenceType.TICKET: EvidenceItem.EvidenceType.TICKET,
        Evidence.EvidenceType.CONFIG: EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
    }

    def handle(self, *args, **options):
        stats = {
            "total": 0,
            "items_created": 0,
            "items_existing": 0,
            "framework_links_created": 0,
            "framework_links_existing": 0,
            "internal_links_created": 0,
            "internal_links_existing": 0,
            "warnings": [],
            "errors": [],
        }
        evidences = Evidence.objects.select_related("assessment", "assessment__control").order_by("title")

        for evidence in evidences:
            stats["total"] += 1
            try:
                item, item_created = self._get_or_create_item(evidence)
                if item_created:
                    stats["items_created"] += 1
                else:
                    stats["items_existing"] += 1

                control = evidence.assessment.control
                _framework_link, framework_created = EvidenceLink.objects.get_or_create(
                    evidence_item=item,
                    target_type=EvidenceLink.TargetType.FRAMEWORK_CONTROL,
                    target_id=control.id,
                    link_type=EvidenceLink.LinkType.EVIDENCES,
                    defaults=self._link_defaults(),
                )
                if framework_created:
                    stats["framework_links_created"] += 1
                else:
                    stats["framework_links_existing"] += 1

                internal_control = self._find_internal_control(control)
                if not internal_control:
                    stats["warnings"].append(
                        f"{control.framework.code}:{control.code} - InternalControl não encontrado."
                    )
                    continue

                _internal_link, internal_created = EvidenceLink.objects.get_or_create(
                    evidence_item=item,
                    target_type=EvidenceLink.TargetType.INTERNAL_CONTROL,
                    target_id=internal_control.id,
                    link_type=EvidenceLink.LinkType.EVIDENCES,
                    defaults=self._link_defaults(),
                )
                if internal_created:
                    stats["internal_links_created"] += 1
                else:
                    stats["internal_links_existing"] += 1
            except Exception as exc:  # pragma: no cover
                stats["errors"].append(f"{evidence.title}: {exc}")

        self._print_summary(stats)

    def _get_or_create_item(self, evidence):
        item, created = EvidenceItem.objects.get_or_create(
            legacy_evidence=evidence,
            defaults={
                "title": evidence.title,
                "description": evidence.hash_sha256 or "",
                "evidence_type": self.TYPE_MAP.get(evidence.evidence_type, EvidenceItem.EvidenceType.OTHER),
                "source": "legacy_assessment_evidence",
                "external_reference": evidence.uri or "",
                "collected_at": evidence.collected_at,
                "confidence_level": 100,
                "status": EvidenceItem.Status.VALID,
                "is_active": True,
            },
        )
        return item, created

    def _find_internal_control(self, control):
        internal_control = InternalControl.objects.filter(legacy_control=control).order_by("created_at").first()
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

    def _link_defaults(self):
        return {
            "rationale": self.MIGRATION_RATIONALE,
            "mapping_source": EvidenceLink.MappingSource.MIGRATED,
            "validation_status": EvidenceLink.ValidationStatus.APPROVED,
            "confidence_score": 100,
        }

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Migração Assessment Evidence -> EvidenceLink concluída."))
        self.stdout.write(f"Evidence analisadas: {stats['total']}")
        self.stdout.write(f"EvidenceItem criados: {stats['items_created']}")
        self.stdout.write(f"EvidenceItem já existentes: {stats['items_existing']}")
        self.stdout.write(f"FrameworkControl EvidenceLink criados: {stats['framework_links_created']}")
        self.stdout.write(f"FrameworkControl EvidenceLink já existentes: {stats['framework_links_existing']}")
        self.stdout.write(f"InternalControl EvidenceLink criados: {stats['internal_links_created']}")
        self.stdout.write(f"InternalControl EvidenceLink já existentes: {stats['internal_links_existing']}")
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
