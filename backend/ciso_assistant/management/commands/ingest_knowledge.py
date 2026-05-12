from django.core.management.base import BaseCommand

from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.knowledge_ingestion import KnowledgeIngestionService
from ciso_assistant.services.retrieval.embedding_service import EmbeddingService
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

    @staticmethod
    def _label(value):
        return str(value) if value not in (None, "") else "Nao definido"

    @staticmethod
    def _expected_dimensions():
        return getattr(KnowledgeChunk._meta.get_field("embedding"), "dimensions", None)

    def _embed(self, text, title):
        embedding = EmbeddingService.get_embedding(text)
        expected = self._expected_dimensions()
        if not embedding:
            self.stdout.write(self.style.WARNING(f"Falha ao gerar embedding: {title}"))
            return None
        if expected and len(embedding) != expected:
            self.stdout.write(self.style.ERROR(
                f"Dimensao invalida em {title}: recebido {len(embedding)}, esperado {expected}."
            ))
            return None
        return embedding

    def _save_chunk(self, *, source_type, source_ref, title, text, embedding, framework=None, control_code=None, metadata=None):
        KnowledgeChunk.objects.update_or_create(
            source_type=source_type,
            source_ref=str(source_ref),
            defaults={
                "title": title,
                "content": text,
                "chunk_text": text,
                "embedding": embedding,
                "framework": framework,
                "control_code": control_code,
                "metadata_json": metadata or {},
            },
        )

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
            text = (
                f"Ativo: {asset.name}. "
                f"Tipo: {self._label(asset.asset_type)}. "
                f"Categoria: {self._label(asset.category)}. "
                f"Criticidade: {self._label(asset.criticality)}. "
                f"Exposicao: {self._label(asset.exposure)}. "
                f"IP Wazuh: {self._label(asset.wazuh_ip)}. "
                f"Localizacao: {self._label(asset.location)}. "
                f"Ambiente: {self._label(asset.environment)}. "
                f"Servico suportado: {self._label(asset.supported_service)}. "
                f"Processo de negocio: {self._label(asset.business_process)}. "
                f"Descricao: {self._label(asset.description)}. "
                f"Origem de descoberta: {self._label(asset.source)}."
            )
            embedding = self._embed(text, asset.name)
            if not embedding:
                continue

            self._save_chunk(
                source_type="asset",
                source_ref=str(asset.id),
                title=asset.name,
                text=text,
                embedding=embedding,
                metadata={
                    "asset_id": str(asset.id),
                    "criticality": asset.criticality,
                    "type": self._label(asset.asset_type),
                    "wazuh_ip": asset.wazuh_ip,
                },
            )
            count += 1
            self.stdout.write(f"Injetado ativo: {asset.name}")
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
            text = (
                f"Vulnerabilidade: {vuln.cve_id}. "
                f"Severidade: {vuln.severity}. "
                f"CVSS: {self._label(vuln.cvss_score)}. "
                f"Exploitability CVSS: {self._label(vuln.cvss_exploitability_score)}. "
                f"EPSS: {self._label(vuln.epss_score)}. "
                f"Percentil EPSS: {self._label(vuln.epss_percentile)}. "
                f"CISA KEV: {'sim' if vuln.is_in_kev else 'nao'}. "
                f"Descricao tecnica: {self._label(vuln.description)}. "
                f"Mitigacao: {self._label(vuln.mitigation)}."
            )
            embedding = self._embed(text, vuln.cve_id)
            if not embedding:
                continue

            self._save_chunk(
                source_type="vulnerability",
                source_ref=vuln.cve_id,
                title=vuln.cve_id,
                text=text,
                embedding=embedding,
                metadata={
                    "vulnerability_id": str(vuln.id),
                    "cvss": float(vuln.cvss_score) if vuln.cvss_score else 0.0,
                    "severity": vuln.severity,
                    "epss": float(vuln.epss_score) if vuln.epss_score else 0.0,
                },
            )
            count += 1
            self.stdout.write(f"Injetada vulnerabilidade: {vuln.cve_id}")
        return count

    def _ingest_controls(self, limit):
        controls = Control.objects.select_related("framework").filter(status=Control.Status.ACTIVE).order_by(
            "framework__code", "code"
        )
        if limit is not None:
            controls = controls[:limit]

        count = 0
        for control in controls:
            framework = f"{control.framework.code} {control.framework.version}"
            text = (
                f"Controlo: {control.code} - {control.title}. "
                f"Framework: {framework}. "
                f"Descricao: {control.description}. "
                f"Orientacao de implementacao: {self._label(control.implementation_guidance)}. "
                f"Obrigatorio: {'sim' if control.is_mandatory else 'nao'}."
            )
            embedding = self._embed(text, f"{framework}:{control.code}")
            if not embedding:
                continue

            self._save_chunk(
                source_type="control",
                source_ref=str(control.id),
                title=f"{control.code} - {control.title}",
                text=text,
                embedding=embedding,
                framework=framework,
                control_code=control.code,
                metadata={
                    "control_id": str(control.id),
                    "framework_code": control.framework.code,
                    "framework_version": control.framework.version,
                },
            )
            count += 1
            self.stdout.write(f"Injetado controlo: {framework}:{control.code}")
        return count

    def _ingest_mechanisms(self, limit):
        mechanisms = Mechanism.objects.prefetch_related("suggested_controls__control__framework").order_by("title")
        if limit is not None:
            mechanisms = mechanisms[:limit]

        count = 0
        for mechanism in mechanisms:
            linked_controls = []
            for relation in mechanism.suggested_controls.all()[:10]:
                control = relation.control
                linked_controls.append(f"{control.framework.code} {control.framework.version}:{control.code}")

            text = (
                f"Mecanismo: {mechanism.title}. "
                f"Tipo: {mechanism.mechanism_type}. "
                f"Descricao: {self._label(mechanism.description)}. "
                f"Controlos/frameworks relacionados: {', '.join(linked_controls) if linked_controls else 'Nao definido'}."
            )
            embedding = self._embed(text, mechanism.title)
            if not embedding:
                continue

            self._save_chunk(
                source_type="mechanism",
                source_ref=str(mechanism.id),
                title=mechanism.title,
                text=text,
                embedding=embedding,
                metadata={
                    "mechanism_id": str(mechanism.id),
                    "mechanism_type": mechanism.mechanism_type,
                    "linked_controls": linked_controls,
                },
            )
            count += 1
            self.stdout.write(f"Injetado mecanismo: {mechanism.title}")
        return count