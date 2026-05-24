from django.core.management.base import BaseCommand
from django.db import transaction

from governance.models import GovernanceDocument, Policy, Procedure, TechnicalRegulation


class Command(BaseCommand):
    help = "Cria GovernanceDocument a partir de Policy, TechnicalRegulation e Procedure existentes."

    def handle(self, *args, **options):
        stats = {
            "policies_created": 0,
            "policies_existing": 0,
            "technical_regulations_created": 0,
            "technical_regulations_existing": 0,
            "procedures_created": 0,
            "procedures_existing": 0,
            "warnings": [],
            "errors": [],
        }

        for policy in Policy.objects.all().order_by("code"):
            try:
                with transaction.atomic():
                    _doc, created = self._get_or_create_policy_document(policy)
                    if created:
                        stats["policies_created"] += 1
                    else:
                        stats["policies_existing"] += 1
            except Exception as exc:  # pragma: no cover - defensive reporting for production data quirks
                stats["errors"].append(f"Policy {policy.code}: {exc}")

        for regulation in TechnicalRegulation.objects.select_related("policy").all().order_by("code"):
            try:
                with transaction.atomic():
                    _doc, created = self._get_or_create_regulation_document(regulation)
                    if created:
                        stats["technical_regulations_created"] += 1
                    else:
                        stats["technical_regulations_existing"] += 1
            except Exception as exc:  # pragma: no cover
                stats["errors"].append(f"TechnicalRegulation {regulation.code}: {exc}")

        for procedure in Procedure.objects.select_related("policy", "technical_regulation").all().order_by("code"):
            try:
                with transaction.atomic():
                    _doc, created = self._get_or_create_procedure_document(procedure)
                    if created:
                        stats["procedures_created"] += 1
                    else:
                        stats["procedures_existing"] += 1
            except Exception as exc:  # pragma: no cover
                stats["errors"].append(f"Procedure {procedure.code}: {exc}")

        self._print_summary(stats)

    def _get_or_create_policy_document(self, policy):
        existing = GovernanceDocument.objects.filter(legacy_policy=policy).order_by("created_at").first()
        if existing:
            return existing, False
        return GovernanceDocument.objects.create(
            title=policy.title,
            document_type=GovernanceDocument.DocumentType.POLICY,
            version=policy.version,
            status=self._policy_status(policy.status),
            owner=policy.owner or "",
            scope=policy.scope or "",
            purpose=policy.objective or "",
            content=policy.description or "",
            approval_date=policy.approval_date,
            review_date=policy.review_date or policy.next_review_date,
            legacy_policy=policy,
            is_active=policy.status != Policy.Status.OBSOLETE,
        ), True

    def _get_or_create_regulation_document(self, regulation):
        existing = GovernanceDocument.objects.filter(legacy_technical_regulation=regulation).order_by("created_at").first()
        if existing:
            return existing, False
        parent_document = None
        if regulation.policy_id:
            parent_document, _created = self._get_or_create_policy_document(regulation.policy)
        return GovernanceDocument.objects.create(
            title=regulation.title,
            document_type=GovernanceDocument.DocumentType.TECHNICAL_REGULATION,
            version=regulation.version,
            status=self._document_status(regulation.status),
            owner=regulation.technical_owner or "",
            parent_document=parent_document,
            scope=regulation.covered_systems or "",
            purpose=regulation.technical_objective or regulation.description or "",
            content=regulation.technical_requirements or regulation.description or "",
            approval_date=regulation.approved_at,
            review_date=regulation.next_review_at,
            legacy_technical_regulation=regulation,
            is_active=regulation.status != TechnicalRegulation.Status.OBSOLETE,
        ), True

    def _get_or_create_procedure_document(self, procedure):
        existing = GovernanceDocument.objects.filter(legacy_procedure=procedure).order_by("created_at").first()
        if existing:
            return existing, False
        parent_document = None
        if procedure.technical_regulation_id:
            parent_document, _created = self._get_or_create_regulation_document(procedure.technical_regulation)
        elif procedure.policy_id:
            parent_document, _created = self._get_or_create_policy_document(procedure.policy)
        return GovernanceDocument.objects.create(
            title=procedure.title,
            document_type=GovernanceDocument.DocumentType.PROCEDURE,
            version=procedure.version,
            status=self._document_status(procedure.status),
            owner=procedure.owner or "",
            parent_document=parent_document,
            scope=procedure.periodicity or "",
            purpose=procedure.description or "",
            content=procedure.steps or procedure.expected_evidence or procedure.description or "",
            review_date=procedure.next_review_at,
            legacy_procedure=procedure,
            is_active=procedure.status != Procedure.Status.OBSOLETE,
        ), True

    def _policy_status(self, status):
        mapping = {
            Policy.Status.DRAFT: GovernanceDocument.Status.DRAFT,
            Policy.Status.ACTIVE: GovernanceDocument.Status.PUBLISHED,
            Policy.Status.REVIEW: GovernanceDocument.Status.UNDER_REVIEW,
            Policy.Status.OBSOLETE: GovernanceDocument.Status.DEPRECATED,
        }
        return mapping.get(status, GovernanceDocument.Status.DRAFT)

    def _document_status(self, status):
        if status == "active":
            return GovernanceDocument.Status.PUBLISHED
        if status == "review":
            return GovernanceDocument.Status.UNDER_REVIEW
        if status == "obsolete":
            return GovernanceDocument.Status.DEPRECATED
        return GovernanceDocument.Status.DRAFT

    def _print_summary(self, stats):
        self.stdout.write(self.style.SUCCESS("Bootstrap de GovernanceDocument concluído."))
        self.stdout.write(f"Policy documents criados: {stats['policies_created']}")
        self.stdout.write(f"Policy documents já existentes: {stats['policies_existing']}")
        self.stdout.write(f"TechnicalRegulation documents criados: {stats['technical_regulations_created']}")
        self.stdout.write(f"TechnicalRegulation documents já existentes: {stats['technical_regulations_existing']}")
        self.stdout.write(f"Procedure documents criados: {stats['procedures_created']}")
        self.stdout.write(f"Procedure documents já existentes: {stats['procedures_existing']}")

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
