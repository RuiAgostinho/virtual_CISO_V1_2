import uuid

from django.core.management.base import BaseCommand

from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import (
    ComplianceGap,
    Control,
    EvidenceItem,
    GovernanceAction,
    GovernanceDocument,
    GovernanceDocumentSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Policy,
    PolicyEvidence,
    Procedure,
    TechnicalRegulation,
)
from governance.models.mechanism import Mechanism
from risk.models import Asset, Vulnerability


class Command(BaseCommand):
    help = "Gera embeddings via Ollama para alimentar o RAG do Virtual CISO."

    def add_arguments(self, parser):
        parser.add_argument("--asset-limit", type=int, default=None)
        parser.add_argument("--vulnerability-limit", type=int, default=None)
        parser.add_argument("--policy-limit", type=int, default=None)
        parser.add_argument("--technical-regulation-limit", type=int, default=None)
        parser.add_argument("--procedure-limit", type=int, default=None)
        parser.add_argument("--evidence-limit", type=int, default=None)
        parser.add_argument("--compliance-gap-limit", type=int, default=None)
        parser.add_argument("--control-limit", type=int, default=None)
        parser.add_argument("--mechanism-limit", type=int, default=None)
        parser.add_argument("--internal-control-limit", type=int, default=None)
        parser.add_argument("--governance-document-limit", type=int, default=None)
        parser.add_argument("--governance-section-limit", type=int, default=None)
        parser.add_argument("--evidence-item-limit", type=int, default=None)
        parser.add_argument("--framework-mapping-limit", type=int, default=None)
        parser.add_argument("--internal-control-mechanism-limit", type=int, default=None)
        parser.add_argument("--governance-action-limit", type=int, default=None)
        parser.add_argument("--clear", action="store_true", help="Remove chunks existentes antes da ingestao.")
        parser.add_argument(
            "--missing-only",
            action="store_true",
            help="Indexa apenas objetos que ainda nao tenham KnowledgeChunk para o respetivo tipo.",
        )

    def handle(self, *args, **options):
        self.missing_only = bool(options["missing_only"])

        if options["clear"]:
            deleted, _ = KnowledgeChunk.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Removidos {deleted} chunks existentes."))

        self.stdout.write(self.style.NOTICE("A iniciar ingestao semantica do Virtual CISO..."))

        asset_count = self._ingest_assets(options["asset_limit"])
        vuln_count = self._ingest_vulnerabilities(options["vulnerability_limit"])
        policy_count = self._ingest_policies(options["policy_limit"])
        regulation_count = self._ingest_technical_regulations(options["technical_regulation_limit"])
        procedure_count = self._ingest_procedures(options["procedure_limit"])
        evidence_count = self._ingest_policy_evidence(options["evidence_limit"])
        compliance_gap_count = self._ingest_compliance_gaps(options["compliance_gap_limit"])
        control_count = self._ingest_controls(options["control_limit"])
        mechanism_count = self._ingest_mechanisms(options["mechanism_limit"])
        internal_control_count = self._ingest_internal_controls(options["internal_control_limit"])
        governance_document_count = self._ingest_governance_documents(options["governance_document_limit"])
        governance_section_count = self._ingest_governance_sections(options["governance_section_limit"])
        evidence_item_count = self._ingest_evidence_items(options["evidence_item_limit"])
        framework_mapping_count = self._ingest_framework_mappings(options["framework_mapping_limit"])
        internal_control_mechanism_count = self._ingest_internal_control_mechanisms(
            options["internal_control_mechanism_limit"]
        )
        governance_action_count = self._ingest_governance_actions(options["governance_action_limit"])

        self.stdout.write(self.style.SUCCESS(
            "A ingestao terminou! "
            f"[ {asset_count} ativos ] | [ {vuln_count} vulnerabilidades ] | [ {policy_count} politicas ] | "
            f"[ {regulation_count} regulamentos tecnicos ] | [ {procedure_count} procedimentos ] | [ {evidence_count} evidencias ] | "
            f"[ {compliance_gap_count} compliance gaps ] | "
            f"[ {control_count} controlos ] | [ {mechanism_count} mecanismos ] | "
            f"[ {internal_control_count} controlos internos ] | [ {governance_document_count} documentos governance ] | "
            f"[ {governance_section_count} seccoes governance ] | [ {evidence_item_count} evidencias reutilizaveis ] | "
            f"[ {framework_mapping_count} mapeamentos framework ] | "
            f"[ {internal_control_mechanism_count} mecanismos por controlo interno ] | "
            f"[ {governance_action_count} tarefas de governacao ]"
        ))

    def _apply_missing_only(self, queryset, source_type):
        if not getattr(self, "missing_only", False):
            return queryset

        existing_refs = list(
            KnowledgeChunk.objects.filter(source_type=source_type).values_list("source_ref", flat=True)
        )
        if not existing_refs:
            return queryset

        pk_field = queryset.model._meta.pk
        if pk_field.get_internal_type() == "UUIDField":
            valid_refs = []
            for source_ref in existing_refs:
                try:
                    valid_refs.append(uuid.UUID(str(source_ref)))
                except (TypeError, ValueError):
                    continue
            existing_refs = valid_refs

        if not existing_refs:
            return queryset

        return queryset.exclude(id__in=existing_refs)

    def _ingest_assets(self, limit):
        assets = Asset.objects.filter(status="Active").select_related(
            "asset_type", "category", "location", "environment", "network_segment"
        ).order_by("name")
        assets = self._apply_missing_only(assets, "asset")
        if limit is not None:
            assets = assets[:limit]

        count = 0
        for asset in assets:
            if KnowledgeIngestionService.upsert_asset(asset):
                count += 1
                self.stdout.write(f"Injetado ativo: {asset.name}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar ativo: {asset.name}"))
        return count

    def _ingest_policies(self, limit):
        policies = Policy.objects.prefetch_related("sections", "related_frameworks").order_by("code")
        policies = self._apply_missing_only(policies, "policy")
        if limit is not None:
            policies = policies[:limit]

        count = 0
        for policy in policies:
            if KnowledgeIngestionService.upsert_policy(policy.id):
                count += 1
                self.stdout.write(f"Injetada politica: {policy.code} - {policy.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar politica: {policy.code} - {policy.title}"))
        return count

    def _ingest_technical_regulations(self, limit):
        regulations = TechnicalRegulation.objects.select_related("policy").prefetch_related("controls__framework").order_by("code")
        regulations = self._apply_missing_only(regulations, "technical_regulation")
        if limit is not None:
            regulations = regulations[:limit]

        count = 0
        for regulation in regulations:
            if KnowledgeIngestionService.upsert_technical_regulation(regulation.id):
                count += 1
                self.stdout.write(f"Injetado regulamento tecnico: {regulation.code} - {regulation.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar regulamento tecnico: {regulation.code} - {regulation.title}"))
        return count

    def _ingest_procedures(self, limit):
        procedures = Procedure.objects.select_related("policy", "technical_regulation").prefetch_related("controls__framework").order_by("code")
        procedures = self._apply_missing_only(procedures, "procedure")
        if limit is not None:
            procedures = procedures[:limit]

        count = 0
        for procedure in procedures:
            if KnowledgeIngestionService.upsert_procedure(procedure.id):
                count += 1
                self.stdout.write(f"Injetado procedimento: {procedure.code} - {procedure.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar procedimento: {procedure.code} - {procedure.title}"))
        return count

    def _ingest_policy_evidence(self, limit):
        evidences = PolicyEvidence.objects.select_related(
            "mechanism",
            "mechanism__policy_control",
            "mechanism__policy_control__policy",
            "mechanism__policy_control__control",
            "mechanism__policy_control__control__framework",
        ).order_by("title")
        evidences = self._apply_missing_only(evidences, "evidence")
        if limit is not None:
            evidences = evidences[:limit]

        count = 0
        for evidence in evidences:
            if KnowledgeIngestionService.upsert_policy_evidence(evidence.id):
                count += 1
                self.stdout.write(f"Injetada evidencia: {evidence.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar evidencia: {evidence.title}"))
        return count

    def _ingest_compliance_gaps(self, limit):
        gaps = (
            ComplianceGap.objects.select_related(
                "framework",
                "control",
                "control__framework",
            )
            .order_by("framework__code", "framework__version", "status", "control__code")
        )
        gaps = self._apply_missing_only(gaps, "compliance_gap")
        if limit is not None:
            gaps = gaps[:limit]

        count = 0
        for gap in gaps:
            if KnowledgeIngestionService.upsert_compliance_gap(gap.id):
                count += 1
                self.stdout.write(f"Injetado compliance gap: {gap.framework.code}:{gap.control.code} ({gap.status})")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar compliance gap: {gap.framework.code}:{gap.control.code}"))
        return count

    def _ingest_vulnerabilities(self, limit):
        vulns = Vulnerability.objects.filter(cvss_score__gte=4.0).order_by("-cvss_score", "cve_id")
        vulns = self._apply_missing_only(vulns, "vulnerability")
        if limit is not None:
            vulns = vulns[:limit]

        count = 0
        for vuln in vulns:
            if KnowledgeIngestionService.upsert_vulnerability(vuln):
                count += 1
                self.stdout.write(f"Injetada vulnerabilidade: {vuln.cve_id}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar vulnerabilidade: {vuln.cve_id}"))
        return count

    def _ingest_controls(self, limit):
        controls = Control.objects.select_related("framework").filter(status=Control.Status.ACTIVE).order_by(
            "framework__code", "code"
        )
        controls = self._apply_missing_only(controls, "control")
        if limit is not None:
            controls = controls[:limit]

        count = 0
        for control in controls:
            if KnowledgeIngestionService.upsert_control(control):
                count += 1
                self.stdout.write(
                    f"Injetado controlo: {control.framework.code} {control.framework.version}:{control.code}"
                )
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar controlo: {control.code}"))
        return count

    def _ingest_mechanisms(self, limit):
        mechanisms = Mechanism.objects.prefetch_related("suggested_controls__control__framework").order_by("title")
        mechanisms = self._apply_missing_only(mechanisms, "mechanism")
        if limit is not None:
            mechanisms = mechanisms[:limit]

        count = 0
        for mechanism in mechanisms:
            if KnowledgeIngestionService.upsert_mechanism(mechanism):
                count += 1
                self.stdout.write(f"Injetado mecanismo: {mechanism.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar mecanismo: {mechanism.title}"))
        return count

    def _ingest_internal_controls(self, limit):
        controls = (
            InternalControl.objects.filter(is_active=True)
            .prefetch_related(
                "framework_mappings__framework_control__framework",
                "policy_links__policy",
                "document_links__document",
                "mechanism_links__mechanism",
            )
            .order_by("code")
        )
        controls = self._apply_missing_only(controls, "internal_control")
        if limit is not None:
            controls = controls[:limit]

        count = 0
        for control in controls:
            if KnowledgeIngestionService.upsert_internal_control(control):
                count += 1
                self.stdout.write(f"Injetado controlo interno: {control.code} - {control.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar controlo interno: {control.code}"))
        return count

    def _ingest_governance_documents(self, limit):
        documents = (
            GovernanceDocument.objects.filter(is_active=True)
            .select_related("parent_document")
            .prefetch_related("sections", "runbook_steps", "control_links__internal_control")
            .order_by("document_type", "title")
        )
        documents = self._apply_missing_only(documents, "governance_document")
        if limit is not None:
            documents = documents[:limit]

        count = 0
        for document in documents:
            if KnowledgeIngestionService.upsert_governance_document(document):
                count += 1
                self.stdout.write(f"Injetado documento governance: {document.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar documento governance: {document.title}"))
        return count

    def _ingest_governance_sections(self, limit):
        sections = (
            GovernanceDocumentSection.objects.select_related("document", "parent_section")
            .filter(document__is_active=True)
            .order_by("document__title", "order", "section_number")
        )
        sections = self._apply_missing_only(sections, "governance_section")
        if limit is not None:
            sections = sections[:limit]

        count = 0
        for section in sections:
            if KnowledgeIngestionService.upsert_governance_section(section):
                count += 1
                self.stdout.write(f"Injetada seccao governance: {section.document.title} - {section.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar seccao governance: {section.title}"))
        return count

    def _ingest_evidence_items(self, limit):
        evidence_items = EvidenceItem.objects.filter(is_active=True).prefetch_related("links").order_by("title")
        evidence_items = self._apply_missing_only(evidence_items, "evidence_item")
        if limit is not None:
            evidence_items = evidence_items[:limit]

        count = 0
        for evidence in evidence_items:
            if KnowledgeIngestionService.upsert_evidence_item(evidence):
                count += 1
                self.stdout.write(f"Injetada evidencia reutilizavel: {evidence.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar evidencia reutilizavel: {evidence.title}"))
        return count

    def _ingest_framework_mappings(self, limit):
        mappings = (
            InternalControlFrameworkMapping.objects.select_related(
                "internal_control",
                "framework_control",
                "framework_control__framework",
            )
            .exclude(validation_status__in=[
                InternalControlFrameworkMapping.ValidationStatus.REJECTED,
                InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
            ])
            .order_by("internal_control__code", "framework_control__framework__code", "framework_control__code")
        )
        mappings = self._apply_missing_only(mappings, "framework_mapping")
        if limit is not None:
            mappings = mappings[:limit]

        count = 0
        for mapping in mappings:
            if KnowledgeIngestionService.upsert_framework_mapping(mapping):
                count += 1
                self.stdout.write(f"Injetado mapeamento framework: {mapping}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar mapeamento framework: {mapping.id}"))
        return count

    def _ingest_internal_control_mechanisms(self, limit):
        links = (
            InternalControlMechanism.objects.select_related("internal_control", "mechanism")
            .exclude(validation_status__in=[
                InternalControlMechanism.ValidationStatus.REJECTED,
                InternalControlMechanism.ValidationStatus.DEPRECATED,
            ])
            .order_by("internal_control__code", "mechanism__title")
        )
        links = self._apply_missing_only(links, "internal_control_mechanism")
        if limit is not None:
            links = links[:limit]

        count = 0
        for link in links:
            if KnowledgeIngestionService.upsert_internal_control_mechanism(link):
                count += 1
                self.stdout.write(f"Injetado mecanismo por controlo interno: {link}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar mecanismo por controlo interno: {link.id}"))
        return count

    def _ingest_governance_actions(self, limit):
        actions = (
            GovernanceAction.objects.select_related("linked_decision", "linked_exception")
            .exclude(status=GovernanceAction.Status.CANCELLED)
            .order_by("status", "due_date", "-created_at")
        )
        actions = self._apply_missing_only(actions, "governance_action")
        if limit is not None:
            actions = actions[:limit]

        count = 0
        for action in actions:
            if KnowledgeIngestionService.upsert_governance_action(action):
                count += 1
                self.stdout.write(f"Injetada tarefa de governacao: {action.title}")
            else:
                self.stdout.write(self.style.WARNING(f"Falha ao indexar tarefa de governacao: {action.id}"))
        return count
