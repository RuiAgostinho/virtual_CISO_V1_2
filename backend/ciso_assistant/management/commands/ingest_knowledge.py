from django.core.management.base import BaseCommand

from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from governance.models import ComplianceGap, Control, Policy, PolicyEvidence, Procedure, TechnicalRegulation
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
        parser.add_argument("--clear", action="store_true", help="Remove chunks existentes antes da ingestao.")

    def handle(self, *args, **options):
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

        self.stdout.write(self.style.SUCCESS(
            "A ingestao terminou! "
            f"[ {asset_count} ativos ] | [ {vuln_count} vulnerabilidades ] | [ {policy_count} politicas ] | "
            f"[ {regulation_count} regulamentos tecnicos ] | [ {procedure_count} procedimentos ] | [ {evidence_count} evidencias ] | "
            f"[ {compliance_gap_count} compliance gaps ] | "
            f"[ {control_count} controlos ] | [ {mechanism_count} mecanismos ]"
        ))

    def _ingest_assets(self, limit):
        assets = Asset.objects.filter(status="Active").select_related(
            "asset_type", "category", "location", "environment", "network_segment"
        ).order_by("name")
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