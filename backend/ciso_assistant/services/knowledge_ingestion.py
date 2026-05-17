import logging

from ciso_assistant.models import KnowledgeChunk
from ciso_assistant.services.retrieval.embedding_service import EmbeddingService
from governance.models import ComplianceGap, Control, Policy, PolicyEvidence, Procedure, TechnicalRegulation
from governance.models.mechanism import Mechanism
from risk.models import Asset, Vulnerability

logger = logging.getLogger(__name__)


class KnowledgeIngestionService:
    """
    Reusable ingestion helpers for keeping RAG chunks aligned with platform data.
    """

    @staticmethod
    def label(value):
        return str(value) if value not in (None, "") else "Nao definido"

    @staticmethod
    def expected_dimensions():
        return getattr(KnowledgeChunk._meta.get_field("embedding"), "dimensions", None)

    @classmethod
    def embed(cls, text: str, title: str = ""):
        embedding = EmbeddingService.get_embedding(text)
        expected = cls.expected_dimensions()
        if not embedding:
            logger.warning("[RAG_INGESTION] Empty embedding for %s", title or "chunk")
            return None
        if expected and len(embedding) != expected:
            logger.error(
                "[RAG_INGESTION] Invalid embedding dimension for %s: received %s, expected %s",
                title or "chunk",
                len(embedding),
                expected,
            )
            return None
        return embedding

    @classmethod
    def save_chunk(
        cls,
        *,
        source_type,
        source_ref,
        title,
        text,
        embedding,
        framework=None,
        control_code=None,
        metadata=None,
    ):
        # title and source_ref map to CharField(max_length=255); some control
        # titles ("{code} - {title}") overflow that column, so clip both.
        return KnowledgeChunk.objects.update_or_create(
            source_type=source_type,
            source_ref=str(source_ref)[:255],
            defaults={
                "title": (title or "")[:255],
                "content": text,
                "chunk_text": text,
                "embedding": embedding,
                "framework": framework,
                "control_code": control_code,
                "metadata_json": metadata or {},
            },
        )

    @classmethod
    def build_policy_text(cls, policy: Policy) -> tuple[str, list[str]]:
        frameworks = [f"{fw.code} {fw.version}" for fw in policy.related_frameworks.all()]
        sections = []
        for section in policy.sections.all()[:8]:
            section_text = cls.label(section.content)
            sections.append(f"{section.title}: {section_text[:700]}")

        text = (
            f"Politica: {policy.code} - {policy.title}. "
            f"Estado: {policy.status}. "
            f"Versao: {policy.version}. "
            f"Responsavel: {cls.label(policy.owner)}. "
            f"Data de aprovacao: {cls.label(policy.approval_date)}. "
            f"Proxima revisao: {cls.label(policy.next_review_date)}. "
            f"Objetivo: {cls.label(policy.objective)}. "
            f"Ambito: {cls.label(policy.scope)}. "
            f"Descricao: {cls.label(policy.description)}. "
            f"Frameworks relacionadas: {', '.join(frameworks) if frameworks else 'Nao definido'}. "
            f"Secoes: {' | '.join(sections) if sections else 'Nao definido'}."
        )
        return text, frameworks

    @classmethod
    def build_technical_regulation_text(cls, regulation: TechnicalRegulation) -> tuple[str, list[str]]:
        controls = [f"{control.framework.code} {control.framework.version}:{control.code}" for control in regulation.controls.all()]
        text = (
            f"Regulamento tecnico: {regulation.code} - {regulation.title}. "
            f"Politica associada: {regulation.policy.code} - {regulation.policy.title}. "
            f"Estado: {regulation.status}. "
            f"Versao: {regulation.version}. "
            f"Responsavel tecnico: {cls.label(regulation.technical_owner)}. "
            f"Data de aprovacao: {cls.label(regulation.approved_at)}. "
            f"Proxima revisao: {cls.label(regulation.next_review_at)}. "
            f"Objetivo tecnico: {cls.label(regulation.technical_objective)}. "
            f"Sistemas abrangidos: {cls.label(regulation.covered_systems)}. "
            f"Requisitos tecnicos: {cls.label(regulation.technical_requirements)}. "
            f"Descricao: {cls.label(regulation.description)}. "
            f"Controlos associados: {', '.join(controls) if controls else 'Nao definido'}."
        )
        return text, controls

    @classmethod
    def build_procedure_text(cls, procedure: Procedure) -> tuple[str, list[str]]:
        controls = [f"{control.framework.code} {control.framework.version}:{control.code}" for control in procedure.controls.all()]
        policy_label = "Nao definido"
        if procedure.policy:
            policy_label = f"{procedure.policy.code} - {procedure.policy.title}"
        regulation_label = "Nao definido"
        if procedure.technical_regulation:
            regulation_label = f"{procedure.technical_regulation.code} - {procedure.technical_regulation.title}"

        text = (
            f"Procedimento: {procedure.code} - {procedure.title}. "
            f"Politica associada: {policy_label}. "
            f"Regulamento tecnico associado: {regulation_label}. "
            f"Estado: {procedure.status}. "
            f"Versao: {procedure.version}. "
            f"Responsavel: {cls.label(procedure.owner)}. "
            f"Periodicidade: {cls.label(procedure.periodicity)}. "
            f"Proxima revisao: {cls.label(procedure.next_review_at)}. "
            f"Descricao: {cls.label(procedure.description)}. "
            f"Passos: {cls.label(procedure.steps)}. "
            f"Evidencia esperada: {cls.label(procedure.expected_evidence)}. "
            f"Controlos associados: {', '.join(controls) if controls else 'Nao definido'}."
        )
        return text, controls

    @classmethod
    def build_policy_evidence_text(cls, evidence: PolicyEvidence) -> tuple[str, dict]:
        mechanism = evidence.mechanism
        policy_control = mechanism.policy_control
        policy = policy_control.policy
        control = policy_control.control
        control_ref = f"{control.framework.code} {control.framework.version}:{control.code}"

        text = (
            f"Evidencia: {evidence.title}. "
            f"Tipo: {evidence.evidence_type}. "
            f"Estado: {evidence.status}. "
            f"Politica: {policy.code} - {policy.title}. "
            f"Mecanismo: {mechanism.name}. "
            f"Estado do mecanismo: {mechanism.implementation_status}. "
            f"Controlo associado: {control_ref} - {control.title}. "
            f"Recolhida por: {cls.label(evidence.collected_by)}. "
            f"Data de recolha: {cls.label(evidence.collected_at)}. "
            f"Validade: {cls.label(evidence.validity_date)}. "
            f"Descricao: {cls.label(evidence.description)}. "
            f"URL: {cls.label(evidence.url)}."
        )
        metadata = {
            "policy_id": str(policy.id),
            "policy_code": policy.code,
            "mechanism_id": str(mechanism.id),
            "control_id": str(control.id),
            "control_ref": control_ref,
        }
        return text, metadata

    @classmethod
    def build_compliance_gap_text(cls, gap: ComplianceGap) -> tuple[str, dict]:
        framework = gap.framework
        control = gap.control
        framework_label = f"{framework.code} {framework.version}"
        status_labels = {
            "MISSING": "em falta",
            "PARTIAL": "parcial",
            "IMPLEMENTED": "implementado",
        }
        status_label = status_labels.get(gap.status, gap.status)

        text = (
            f"Gap de conformidade: {framework_label}:{control.code} - {control.title}. "
            f"Framework: {framework.name} {framework.version}. "
            f"Estado do gap: {gap.status} ({status_label}). "
            f"Score de confianca: {cls.label(gap.confidence_score)}. "
            f"Evidencias associadas: {gap.evidence_count}. "
            f"Ultima avaliacao: {cls.label(gap.last_evaluated)}. "
            f"Descricao do controlo: {cls.label(control.description)[:1000]}. "
            f"Orientacao de implementacao: {cls.label(control.implementation_guidance)[:1000]}. "
            f"Notas de avaliacao: {cls.label(gap.notes)}."
        )
        metadata = {
            "gap_id": str(gap.id),
            "framework_id": str(framework.id),
            "framework_code": framework.code,
            "framework_version": framework.version,
            "control_id": str(control.id),
            "control_code": control.code,
            "status": gap.status,
            "confidence_score": gap.confidence_score,
            "evidence_count": gap.evidence_count,
        }
        return text, metadata

    @classmethod
    def upsert_policy(cls, policy_or_id) -> bool:
        try:
            if isinstance(policy_or_id, Policy):
                policy = policy_or_id
            else:
                policy = Policy.objects.prefetch_related("sections", "related_frameworks").get(id=policy_or_id)

            text, frameworks = cls.build_policy_text(policy)
            embedding = cls.embed(text, policy.code)
            if not embedding:
                return False

            cls.save_chunk(
                source_type="policy",
                source_ref=str(policy.id),
                title=f"{policy.code} - {policy.title}",
                text=text,
                embedding=embedding,
                metadata={
                    "policy_id": str(policy.id),
                    "code": policy.code,
                    "status": policy.status,
                    "version": policy.version,
                    "frameworks": frameworks,
                },
            )
            logger.info("[RAG_INGESTION] Policy indexed: %s", policy.code)
            return True
        except Policy.DoesNotExist:
            logger.warning("[RAG_INGESTION] Policy not found for indexing: %s", policy_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index policy: %s", policy_or_id)
            return False

    @classmethod
    def delete_policy(cls, policy_id) -> int:
        deleted, _ = KnowledgeChunk.objects.filter(source_type="policy", source_ref=str(policy_id)).delete()
        return deleted

    @classmethod
    def upsert_technical_regulation(cls, regulation_or_id) -> bool:
        try:
            if isinstance(regulation_or_id, TechnicalRegulation):
                regulation = regulation_or_id
            else:
                regulation = TechnicalRegulation.objects.select_related("policy").prefetch_related("controls__framework").get(id=regulation_or_id)

            text, controls = cls.build_technical_regulation_text(regulation)
            embedding = cls.embed(text, regulation.code)
            if not embedding:
                return False

            cls.save_chunk(
                source_type="technical_regulation",
                source_ref=str(regulation.id),
                title=f"{regulation.code} - {regulation.title}",
                text=text,
                embedding=embedding,
                metadata={
                    "technical_regulation_id": str(regulation.id),
                    "code": regulation.code,
                    "status": regulation.status,
                    "version": regulation.version,
                    "policy_id": str(regulation.policy_id),
                    "controls": controls,
                },
            )
            logger.info("[RAG_INGESTION] Technical regulation indexed: %s", regulation.code)
            return True
        except TechnicalRegulation.DoesNotExist:
            logger.warning("[RAG_INGESTION] Technical regulation not found for indexing: %s", regulation_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index technical regulation: %s", regulation_or_id)
            return False

    @classmethod
    def delete_technical_regulation(cls, regulation_id) -> int:
        deleted, _ = KnowledgeChunk.objects.filter(source_type="technical_regulation", source_ref=str(regulation_id)).delete()
        return deleted

    @classmethod
    def upsert_procedure(cls, procedure_or_id) -> bool:
        try:
            if isinstance(procedure_or_id, Procedure):
                procedure = procedure_or_id
            else:
                procedure = Procedure.objects.select_related("policy", "technical_regulation").prefetch_related("controls__framework").get(id=procedure_or_id)

            text, controls = cls.build_procedure_text(procedure)
            embedding = cls.embed(text, procedure.code)
            if not embedding:
                return False

            cls.save_chunk(
                source_type="procedure",
                source_ref=str(procedure.id),
                title=f"{procedure.code} - {procedure.title}",
                text=text,
                embedding=embedding,
                metadata={
                    "procedure_id": str(procedure.id),
                    "code": procedure.code,
                    "status": procedure.status,
                    "version": procedure.version,
                    "policy_id": str(procedure.policy_id) if procedure.policy_id else None,
                    "technical_regulation_id": str(procedure.technical_regulation_id) if procedure.technical_regulation_id else None,
                    "controls": controls,
                },
            )
            logger.info("[RAG_INGESTION] Procedure indexed: %s", procedure.code)
            return True
        except Procedure.DoesNotExist:
            logger.warning("[RAG_INGESTION] Procedure not found for indexing: %s", procedure_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index procedure: %s", procedure_or_id)
            return False

    @classmethod
    def delete_procedure(cls, procedure_id) -> int:
        deleted, _ = KnowledgeChunk.objects.filter(source_type="procedure", source_ref=str(procedure_id)).delete()
        return deleted

    @classmethod
    def upsert_policy_evidence(cls, evidence_or_id) -> bool:
        try:
            if isinstance(evidence_or_id, PolicyEvidence):
                evidence = evidence_or_id
            else:
                evidence = (
                    PolicyEvidence.objects.select_related(
                        "mechanism",
                        "mechanism__policy_control",
                        "mechanism__policy_control__policy",
                        "mechanism__policy_control__control",
                        "mechanism__policy_control__control__framework",
                    )
                    .get(id=evidence_or_id)
                )

            text, related_metadata = cls.build_policy_evidence_text(evidence)
            embedding = cls.embed(text, evidence.title)
            if not embedding:
                return False

            cls.save_chunk(
                source_type="evidence",
                source_ref=str(evidence.id),
                title=evidence.title,
                text=text,
                embedding=embedding,
                framework=related_metadata["control_ref"].split(":")[0],
                control_code=related_metadata["control_ref"].split(":")[-1],
                metadata={
                    "evidence_id": str(evidence.id),
                    "evidence_type": evidence.evidence_type,
                    "status": evidence.status,
                    **related_metadata,
                },
            )
            logger.info("[RAG_INGESTION] Policy evidence indexed: %s", evidence.title)
            return True
        except PolicyEvidence.DoesNotExist:
            logger.warning("[RAG_INGESTION] Policy evidence not found for indexing: %s", evidence_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index policy evidence: %s", evidence_or_id)
            return False

    @classmethod
    def delete_policy_evidence(cls, evidence_id) -> int:
        deleted, _ = KnowledgeChunk.objects.filter(source_type="evidence", source_ref=str(evidence_id)).delete()
        return deleted

    @classmethod
    def upsert_compliance_gap(cls, gap_or_id) -> bool:
        try:
            if isinstance(gap_or_id, ComplianceGap):
                gap = gap_or_id
            else:
                gap = (
                    ComplianceGap.objects.select_related(
                        "framework",
                        "control",
                        "control__framework",
                    )
                    .get(id=gap_or_id)
                )

            text, metadata = cls.build_compliance_gap_text(gap)
            embedding = cls.embed(text, f"{gap.framework.code}:{gap.control.code}")
            if not embedding:
                return False

            cls.save_chunk(
                source_type="compliance_gap",
                source_ref=str(gap.id),
                title=f"{gap.framework.code} {gap.framework.version}:{gap.control.code} - {gap.control.title}",
                text=text,
                embedding=embedding,
                framework=f"{gap.framework.code} {gap.framework.version}",
                control_code=gap.control.code,
                metadata=metadata,
            )
            logger.info("[RAG_INGESTION] Compliance gap indexed: %s:%s", gap.framework.code, gap.control.code)
            return True
        except ComplianceGap.DoesNotExist:
            logger.warning("[RAG_INGESTION] Compliance gap not found for indexing: %s", gap_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index compliance gap: %s", gap_or_id)
            return False

    @classmethod
    def delete_compliance_gap(cls, gap_id) -> int:
        deleted, _ = KnowledgeChunk.objects.filter(source_type="compliance_gap", source_ref=str(gap_id)).delete()
        return deleted

    @classmethod
    def build_control_text(cls, control: Control) -> str:
        framework = f"{control.framework.code} {control.framework.version}"
        return (
            f"Controlo: {control.code} - {control.title}. "
            f"Framework: {framework}. "
            f"Descricao: {control.description}. "
            f"Orientacao de implementacao: {cls.label(control.implementation_guidance)}. "
            f"Obrigatorio: {'sim' if control.is_mandatory else 'nao'}."
        )

    @classmethod
    def upsert_control(cls, control_or_id) -> bool:
        try:
            if isinstance(control_or_id, Control):
                control = control_or_id
            else:
                control = Control.objects.select_related("framework").get(id=control_or_id)

            # Mirror the bulk command: only ACTIVE controls belong in the RAG
            # index. A control that became DEPRECATED has its chunk removed.
            if control.status != Control.Status.ACTIVE:
                removed = cls.delete_control(control.id)
                if removed:
                    logger.info("[RAG_INGESTION] Control %s not ACTIVE - chunk removed", control.code)
                return True

            framework = f"{control.framework.code} {control.framework.version}"
            text = cls.build_control_text(control)
            embedding = cls.embed(text, f"{framework}:{control.code}")
            if not embedding:
                logger.error(
                    "[RAG_INGESTION] Control %s NOT indexed - embedding failed; "
                    "RAG chunk is now stale relative to the database.",
                    control.code,
                )
                return False

            cls.save_chunk(
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
            logger.info("[RAG_INGESTION] Control indexed: %s:%s", framework, control.code)
            return True
        except Control.DoesNotExist:
            logger.warning("[RAG_INGESTION] Control not found for indexing: %s", control_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index control: %s", control_or_id)
            return False

    @classmethod
    def delete_control(cls, control_id) -> int:
        deleted, _ = KnowledgeChunk.objects.filter(source_type="control", source_ref=str(control_id)).delete()
        return deleted

    @classmethod
    def build_mechanism_text(cls, mechanism: Mechanism) -> tuple[str, list[str]]:
        linked_controls = []
        for relation in mechanism.suggested_controls.all()[:10]:
            control = relation.control
            linked_controls.append(f"{control.framework.code} {control.framework.version}:{control.code}")
        text = (
            f"Mecanismo: {mechanism.title}. "
            f"Tipo: {mechanism.mechanism_type}. "
            f"Descricao: {cls.label(mechanism.description)}. "
            f"Controlos/frameworks relacionados: "
            f"{', '.join(linked_controls) if linked_controls else 'Nao definido'}."
        )
        return text, linked_controls

    @classmethod
    def upsert_mechanism(cls, mechanism_or_id) -> bool:
        try:
            if isinstance(mechanism_or_id, Mechanism):
                mechanism = mechanism_or_id
            else:
                mechanism = Mechanism.objects.prefetch_related(
                    "suggested_controls__control__framework"
                ).get(id=mechanism_or_id)

            text, linked_controls = cls.build_mechanism_text(mechanism)
            embedding = cls.embed(text, mechanism.title)
            if not embedding:
                logger.error(
                    "[RAG_INGESTION] Mechanism '%s' NOT indexed - embedding failed; "
                    "RAG chunk is now stale relative to the database.",
                    mechanism.title,
                )
                return False

            cls.save_chunk(
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
            logger.info("[RAG_INGESTION] Mechanism indexed: %s", mechanism.title)
            return True
        except Mechanism.DoesNotExist:
            logger.warning("[RAG_INGESTION] Mechanism not found for indexing: %s", mechanism_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index mechanism: %s", mechanism_or_id)
            return False

    @classmethod
    def delete_mechanism(cls, mechanism_id) -> int:
        deleted, _ = KnowledgeChunk.objects.filter(source_type="mechanism", source_ref=str(mechanism_id)).delete()
        return deleted

    @classmethod
    def build_asset_text(cls, asset: Asset) -> str:
        return (
            f"Ativo: {asset.name}. "
            f"Tipo: {cls.label(asset.asset_type)}. "
            f"Categoria: {cls.label(asset.category)}. "
            f"Criticidade: {cls.label(asset.criticality)}. "
            f"Exposicao: {cls.label(asset.exposure)}. "
            f"IP Wazuh: {cls.label(asset.wazuh_ip)}. "
            f"Localizacao: {cls.label(asset.location)}. "
            f"Ambiente: {cls.label(asset.environment)}. "
            f"Servico suportado: {cls.label(asset.supported_service)}. "
            f"Processo de negocio: {cls.label(asset.business_process)}. "
            f"Descricao: {cls.label(asset.description)}. "
            f"Origem de descoberta: {cls.label(asset.source)}."
        )

    @classmethod
    def upsert_asset(cls, asset_or_id) -> bool:
        """
        Index an asset. Used only by the bulk command and the admin bulk
        runner: assets are imported in volume by scanners, so there is
        deliberately no synchronous post_save signal for them.
        """
        try:
            if isinstance(asset_or_id, Asset):
                asset = asset_or_id
            else:
                asset = Asset.objects.select_related(
                    "asset_type", "category", "location", "environment", "network_segment"
                ).get(id=asset_or_id)

            text = cls.build_asset_text(asset)
            embedding = cls.embed(text, asset.name)
            if not embedding:
                logger.error(
                    "[RAG_INGESTION] Asset '%s' NOT indexed - embedding failed; "
                    "RAG chunk is now stale relative to the database.",
                    asset.name,
                )
                return False

            cls.save_chunk(
                source_type="asset",
                source_ref=str(asset.id),
                title=asset.name,
                text=text,
                embedding=embedding,
                metadata={
                    "asset_id": str(asset.id),
                    "criticality": asset.criticality,
                    "type": cls.label(asset.asset_type),
                    "wazuh_ip": asset.wazuh_ip,
                },
            )
            logger.info("[RAG_INGESTION] Asset indexed: %s", asset.name)
            return True
        except Asset.DoesNotExist:
            logger.warning("[RAG_INGESTION] Asset not found for indexing: %s", asset_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index asset: %s", asset_or_id)
            return False

    @classmethod
    def build_vulnerability_text(cls, vuln: Vulnerability) -> str:
        return (
            f"Vulnerabilidade: {vuln.cve_id}. "
            f"Severidade: {vuln.severity}. "
            f"CVSS: {cls.label(vuln.cvss_score)}. "
            f"Exploitability CVSS: {cls.label(vuln.cvss_exploitability_score)}. "
            f"EPSS: {cls.label(vuln.epss_score)}. "
            f"Percentil EPSS: {cls.label(vuln.epss_percentile)}. "
            f"CISA KEV: {'sim' if vuln.is_in_kev else 'nao'}. "
            f"Descricao tecnica: {cls.label(vuln.description)}. "
            f"Mitigacao: {cls.label(vuln.mitigation)}."
        )

    @classmethod
    def upsert_vulnerability(cls, vuln_or_id) -> bool:
        """
        Index a vulnerability. Like assets, vulnerabilities are bulk-imported
        (scanners / NVD sync) and have no synchronous signal: only the bulk
        command and the admin runner call this.
        """
        try:
            if isinstance(vuln_or_id, Vulnerability):
                vuln = vuln_or_id
            else:
                vuln = Vulnerability.objects.get(id=vuln_or_id)

            text = cls.build_vulnerability_text(vuln)
            embedding = cls.embed(text, vuln.cve_id)
            if not embedding:
                logger.error(
                    "[RAG_INGESTION] Vulnerability %s NOT indexed - embedding failed; "
                    "RAG chunk is now stale relative to the database.",
                    vuln.cve_id,
                )
                return False

            cls.save_chunk(
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
            logger.info("[RAG_INGESTION] Vulnerability indexed: %s", vuln.cve_id)
            return True
        except Vulnerability.DoesNotExist:
            logger.warning("[RAG_INGESTION] Vulnerability not found for indexing: %s", vuln_or_id)
            return False
        except Exception:
            logger.exception("[RAG_INGESTION] Failed to index vulnerability: %s", vuln_or_id)
            return False