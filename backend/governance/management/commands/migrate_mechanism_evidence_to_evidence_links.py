from django.core.management.base import BaseCommand

from governance.models import EvidenceItem, EvidenceLink, MechanismEvidence


class Command(BaseCommand):
    help = "Migra MechanismEvidence antigo para EvidenceItem e EvidenceLink."

    MIGRATION_RATIONALE = "Migração inicial a partir de MechanismEvidence existente."

    def handle(self, *args, **options):
        stats = {"total": 0, "items_created": 0, "items_existing": 0, "links_created": 0, "links_existing": 0, "errors": []}
        evidences = MechanismEvidence.objects.select_related(
            "control_mechanism",
            "control_mechanism__mechanism",
        ).order_by("title")

        for evidence in evidences:
            stats["total"] += 1
            try:
                item, item_created = self._get_or_create_item(evidence)
                if item_created:
                    stats["items_created"] += 1
                else:
                    stats["items_existing"] += 1

                _link, link_created = EvidenceLink.objects.get_or_create(
                    evidence_item=item,
                    target_type=EvidenceLink.TargetType.MECHANISM,
                    target_id=evidence.control_mechanism.mechanism_id,
                    link_type=EvidenceLink.LinkType.EVIDENCES,
                    defaults={
                        "rationale": self.MIGRATION_RATIONALE,
                        "mapping_source": EvidenceLink.MappingSource.MIGRATED,
                        "validation_status": EvidenceLink.ValidationStatus.APPROVED,
                        "confidence_score": 100,
                    },
                )
                if link_created:
                    stats["links_created"] += 1
                else:
                    stats["links_existing"] += 1
            except Exception as exc:  # pragma: no cover
                stats["errors"].append(f"{evidence.title}: {exc}")

        self._print_summary(stats)

    def _get_or_create_item(self, evidence):
        source = f"legacy_mechanism_evidence:{evidence.id}"
        existing = EvidenceItem.objects.filter(source=source).order_by("created_at").first()
        if existing:
            return existing, False
        return EvidenceItem.objects.create(
            title=evidence.title,
            description=evidence.description or "",
            evidence_type=EvidenceItem.EvidenceType.OTHER,
            source=source,
            external_reference=evidence.url or "",
            collected_at=evidence.provided_at,
            confidence_level=100,
            status=EvidenceItem.Status.VALID,
            is_active=True,
        ), True

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Migração MechanismEvidence -> EvidenceLink concluída."))
        self.stdout.write(f"MechanismEvidence analisadas: {stats['total']}")
        self.stdout.write(f"EvidenceItem criados: {stats['items_created']}")
        self.stdout.write(f"EvidenceItem já existentes: {stats['items_existing']}")
        self.stdout.write(f"EvidenceLink criados: {stats['links_created']}")
        self.stdout.write(f"EvidenceLink já existentes: {stats['links_existing']}")
        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")
