from django.core.management.base import BaseCommand

from governance.models import Evidence, EvidenceItem


class Command(BaseCommand):
    help = "Cria EvidenceItem a partir de Evidence antiga ligada a ControlAssessment."

    TYPE_MAP = {
        Evidence.EvidenceType.POLICY: EvidenceItem.EvidenceType.APPROVAL_RECORD,
        Evidence.EvidenceType.PROCEDURE: EvidenceItem.EvidenceType.REPORT,
        Evidence.EvidenceType.LOG: EvidenceItem.EvidenceType.LOG,
        Evidence.EvidenceType.SCREENSHOT: EvidenceItem.EvidenceType.SCREENSHOT,
        Evidence.EvidenceType.TICKET: EvidenceItem.EvidenceType.TICKET,
        Evidence.EvidenceType.CONFIG: EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
    }

    def handle(self, *args, **options):
        stats = {"total": 0, "created": 0, "existing": 0, "errors": []}
        evidences = Evidence.objects.select_related("assessment", "assessment__control").order_by("title")

        for evidence in evidences:
            stats["total"] += 1
            try:
                _item, created = EvidenceItem.objects.get_or_create(
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
                if created:
                    stats["created"] += 1
                else:
                    stats["existing"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(f"{evidence.title}: {exc}")

        self.stdout.write(self.style.SUCCESS("Bootstrap de EvidenceItem concluído."))
        self.stdout.write(f"Evidence analisadas: {stats['total']}")
        self.stdout.write(f"EvidenceItem criados: {stats['created']}")
        self.stdout.write(f"EvidenceItem já existentes: {stats['existing']}")
        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")
