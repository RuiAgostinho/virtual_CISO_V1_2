from django.core.management.base import BaseCommand

from governance.models import EvidenceItem, EvidenceLink, GovernanceDocument, PolicyEvidence


class Command(BaseCommand):
    help = "Migra PolicyEvidence antigo para EvidenceItem e EvidenceLink."

    MIGRATION_RATIONALE = "Migração inicial a partir de PolicyEvidence existente."

    TYPE_MAP = {
        PolicyEvidence.EvidenceType.DOCUMENT: EvidenceItem.EvidenceType.REPORT,
        PolicyEvidence.EvidenceType.SCREENSHOT: EvidenceItem.EvidenceType.SCREENSHOT,
        PolicyEvidence.EvidenceType.CONFIGURATION: EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
        PolicyEvidence.EvidenceType.LOG: EvidenceItem.EvidenceType.LOG,
        PolicyEvidence.EvidenceType.REPORT: EvidenceItem.EvidenceType.REPORT,
        PolicyEvidence.EvidenceType.AUDIT_RECORD: EvidenceItem.EvidenceType.AUDIT_REPORT,
        PolicyEvidence.EvidenceType.LINK: EvidenceItem.EvidenceType.OTHER,
    }
    STATUS_MAP = {
        PolicyEvidence.Status.VALID: EvidenceItem.Status.VALID,
        PolicyEvidence.Status.EXPIRED: EvidenceItem.Status.EXPIRED,
        PolicyEvidence.Status.PENDING_REVIEW: EvidenceItem.Status.PENDING_REVIEW,
        PolicyEvidence.Status.REJECTED: EvidenceItem.Status.REJECTED,
    }

    def handle(self, *args, **options):
        stats = {
            "total": 0,
            "items_created": 0,
            "items_existing": 0,
            "policy_links_created": 0,
            "policy_links_existing": 0,
            "document_links_created": 0,
            "document_links_existing": 0,
            "errors": [],
        }
        evidences = PolicyEvidence.objects.select_related(
            "mechanism",
            "mechanism__policy_control",
            "mechanism__policy_control__policy",
        ).order_by("title")

        for evidence in evidences:
            stats["total"] += 1
            try:
                item, item_created = self._get_or_create_item(evidence)
                if item_created:
                    stats["items_created"] += 1
                else:
                    stats["items_existing"] += 1

                policy = evidence.mechanism.policy_control.policy
                _policy_link, policy_created = EvidenceLink.objects.get_or_create(
                    evidence_item=item,
                    target_type=EvidenceLink.TargetType.POLICY,
                    target_id=policy.id,
                    link_type=EvidenceLink.LinkType.EVIDENCES,
                    defaults=self._link_defaults(),
                )
                if policy_created:
                    stats["policy_links_created"] += 1
                else:
                    stats["policy_links_existing"] += 1

                document = GovernanceDocument.objects.filter(legacy_policy=policy).order_by("created_at").first()
                if document:
                    _document_link, document_created = EvidenceLink.objects.get_or_create(
                        evidence_item=item,
                        target_type=EvidenceLink.TargetType.GOVERNANCE_DOCUMENT,
                        target_id=document.id,
                        link_type=EvidenceLink.LinkType.EVIDENCES,
                        defaults=self._link_defaults(),
                    )
                    if document_created:
                        stats["document_links_created"] += 1
                    else:
                        stats["document_links_existing"] += 1
            except Exception as exc:  # pragma: no cover
                stats["errors"].append(f"{evidence.title}: {exc}")

        self._print_summary(stats)

    def _get_or_create_item(self, evidence):
        source = f"legacy_policy_evidence:{evidence.id}"
        existing = EvidenceItem.objects.filter(source=source).order_by("created_at").first()
        if existing:
            return existing, False
        return EvidenceItem.objects.create(
            title=evidence.title,
            description=evidence.description or "",
            evidence_type=self.TYPE_MAP.get(evidence.evidence_type, EvidenceItem.EvidenceType.OTHER),
            source=source,
            file=evidence.file if evidence.file else None,
            external_reference=evidence.url or "",
            collected_at=evidence.collected_at,
            valid_until=evidence.validity_date,
            confidence_level=100,
            status=self.STATUS_MAP.get(evidence.status, EvidenceItem.Status.PENDING_REVIEW),
            owner=evidence.collected_by or "",
            is_active=evidence.status != PolicyEvidence.Status.REJECTED,
        ), True

    def _link_defaults(self):
        return {
            "rationale": self.MIGRATION_RATIONALE,
            "mapping_source": EvidenceLink.MappingSource.MIGRATED,
            "validation_status": EvidenceLink.ValidationStatus.APPROVED,
            "confidence_score": 100,
        }

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Migração PolicyEvidence -> EvidenceLink concluída."))
        self.stdout.write(f"PolicyEvidence analisadas: {stats['total']}")
        self.stdout.write(f"EvidenceItem criados: {stats['items_created']}")
        self.stdout.write(f"EvidenceItem já existentes: {stats['items_existing']}")
        self.stdout.write(f"Policy EvidenceLink criados: {stats['policy_links_created']}")
        self.stdout.write(f"Policy EvidenceLink já existentes: {stats['policy_links_existing']}")
        self.stdout.write(f"GovernanceDocument EvidenceLink criados: {stats['document_links_created']}")
        self.stdout.write(f"GovernanceDocument EvidenceLink já existentes: {stats['document_links_existing']}")
        if stats["errors"]:
            self.stdout.write(self.style.ERROR("Erros:"))
            for error in stats["errors"]:
                self.stdout.write(f"- {error}")
        else:
            self.stdout.write("Erros: 0")
