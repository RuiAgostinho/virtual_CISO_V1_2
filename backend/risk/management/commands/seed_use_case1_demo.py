from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from governance.models import (
    Control,
    EvidenceItem,
    EvidenceLink,
    Framework,
    FrameworkSection,
    GovernanceRiskLink,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
)
from risk.models import Asset, AssetClassificationReview, AssetVulnerability, Risk, Vulnerability
from risk.models.discovery import AssetExposureSnapshot


class Command(BaseCommand):
    help = "Cria um cenario controlado para demonstrar o Use Case 1 de priorizacao contextual."

    def handle(self, *args, **options):
        with transaction.atomic():
            data = self._seed()

        self.stdout.write(self.style.SUCCESS("Cenario Use Case 1 criado/atualizado com sucesso."))
        self.stdout.write(f"Ativo critico exposto: {data['critical_asset'].name}")
        self.stdout.write(f"Ativo QA mitigado: {data['qa_asset'].name}")
        self.stdout.write(f"CVSS igual nas duas vulnerabilidades: {data['critical_vuln'].cvss_score}")
        self.stdout.write("Valida em: /risks/prioritization e pergunta ao assistente:")
        self.stdout.write('"Apareceram 137 vulnerabilidades novas esta semana. Por onde começo?"')

    def _seed(self):
        critical_asset = self._asset(
            name="DEMO UC1 - Portal de Munícipes",
            description=(
                "Ativo de demonstracao: servico publico de atendimento online, exposto a Internet "
                "e sem mitigacao governance validada para a vulnerabilidade de demonstracao."
            ),
            wazuh_ip="203.0.113.10",
            confidentiality=5,
            integrity=5,
            availability=5,
            exposure=5,
            business_value=5,
            dependency_score=5,
            owner="Direcao de Sistemas de Informacao",
        )
        qa_asset = self._asset(
            name="DEMO UC1 - Servidor QA Interno",
            description=(
                "Ativo de demonstracao: servidor de testes interno, isolado e com mecanismo/evidencia "
                "validada para demonstrar priorizacao abaixo de um ativo critico exposto."
            ),
            wazuh_ip="10.10.50.25",
            confidentiality=2,
            integrity=2,
            availability=2,
            exposure=2,
            business_value=1,
            dependency_score=1,
            owner="Equipa de Qualidade",
        )

        critical_vuln = self._vulnerability(
            cve_id="CVE-2026-UC1-0001",
            description="Vulnerabilidade demonstrativa em componente exposto do portal de munícipes.",
            epss_score=Decimal("0.7800"),
            is_in_kev=True,
            mitigation="",
        )
        qa_vuln = self._vulnerability(
            cve_id="CVE-2026-UC1-0002",
            description="Vulnerabilidade demonstrativa com CVSS igual em servidor QA interno.",
            epss_score=Decimal("0.0500"),
            is_in_kev=False,
            mitigation="WAF interno ativo, segmentacao de rede e patch em janela planeada.",
        )

        critical_occurrence = self._occurrence(critical_asset, critical_vuln, "Portal web exposto")
        qa_occurrence = self._occurrence(qa_asset, qa_vuln, "Servidor QA interno")

        self._risk(critical_asset, critical_vuln, 86, Risk.RiskLevel.CRITICAL)
        qa_risk = self._risk(qa_asset, qa_vuln, 45, Risk.RiskLevel.MEDIUM)

        internal_control = self._internal_control()
        mechanism_link = self._mechanism_link(internal_control)
        self._framework_mapping(internal_control)
        evidence = self._evidence(mechanism_link.mechanism)
        self._risk_link(qa_occurrence, internal_control, qa_risk)

        self._classification(critical_asset)
        self._classification(qa_asset)
        self._exposure(critical_asset, 5, ["443/tcp", "8443/tcp"], ["https", "api-publica"])
        self._exposure(qa_asset, 2, ["22/tcp"], ["ssh-interno"])

        return {
            "critical_asset": critical_asset,
            "qa_asset": qa_asset,
            "critical_vuln": critical_vuln,
            "qa_vuln": qa_vuln,
            "critical_occurrence": critical_occurrence,
            "qa_occurrence": qa_occurrence,
            "internal_control": internal_control,
            "mechanism_link": mechanism_link,
            "evidence": evidence,
        }

    def _asset(self, **kwargs):
        asset, _created = Asset.objects.update_or_create(
            name=kwargs["name"],
            defaults={
                "description": kwargs["description"],
                "wazuh_ip": kwargs["wazuh_ip"],
                "confidentiality": kwargs["confidentiality"],
                "integrity": kwargs["integrity"],
                "availability": kwargs["availability"],
                "exposure": kwargs["exposure"],
                "business_value": kwargs["business_value"],
                "dependency_score": kwargs["dependency_score"],
                "owner": kwargs["owner"],
                "source": "manual",
                "status": "Active",
            },
        )
        return asset

    def _vulnerability(self, cve_id, description, epss_score, is_in_kev, mitigation):
        vuln, _created = Vulnerability.objects.update_or_create(
            cve_id=cve_id,
            defaults={
                "severity": "High",
                "cvss_score": Decimal("8.0"),
                "description": description,
                "mitigation": mitigation,
                "source": "demo",
                "epss_score": epss_score,
                "epss_percentile": Decimal("0.9500") if epss_score > Decimal("0.5") else Decimal("0.2000"),
                "epss_last_updated": timezone.now(),
                "nvd_data": {"demo": True, "cvss": "8.0"},
                "nist_last_updated": timezone.now(),
                "is_in_kev": is_in_kev,
                "kev_last_updated": timezone.now(),
            },
        )
        return vuln

    def _occurrence(self, asset, vulnerability, software_version):
        occurrence = AssetVulnerability.objects.filter(
            asset=asset,
            vulnerability=vulnerability,
            software__isnull=True,
            software_version=software_version,
        ).first()
        if occurrence is None:
            occurrence = AssetVulnerability.objects.create(
                asset=asset,
                vulnerability=vulnerability,
                software_version=software_version,
                status="Open",
                source="demo",
            )
        else:
            occurrence.status = "Open"
            occurrence.source = "demo"
            occurrence.save(update_fields=["status", "source", "last_seen"])
        return occurrence

    def _risk(self, asset, vulnerability, score, level):
        risk, _created = Risk.objects.update_or_create(
            asset=asset,
            vulnerability=vulnerability,
            defaults={
                "risk_score": score,
                "risk_level": level,
                "likelihood": 4 if score >= 80 else 2,
                "impact": 5 if score >= 80 else 2,
                "status": Risk.RiskStatus.OPEN,
                "ai_explanation": "Risco criado para demonstracao controlada do Use Case 1.",
            },
        )
        return risk

    def _internal_control(self):
        control, _created = InternalControl.objects.update_or_create(
            code="IC-UC1-VULN-001",
            defaults={
                "title": "Gestao contextual de vulnerabilidades",
                "description": (
                    "Controlo interno agnostico de frameworks para priorizar e mitigar vulnerabilidades "
                    "com base em criticidade, exposicao, evidencia e risco residual."
                ),
                "control_domain": "Gestao de vulnerabilidades",
                "objective": "Reduzir risco de exploracao em ativos criticos.",
                "risk_statement": "Vulnerabilidades abertas em ativos criticos podem causar indisponibilidade e fuga de informacao.",
                "owner_role": "CISO",
                "criticality": InternalControl.Criticality.HIGH,
                "status": InternalControl.Status.ACTIVE,
                "source": InternalControl.Source.TEMPLATE,
                "is_active": True,
            },
        )
        return control

    def _mechanism_link(self, internal_control):
        mechanism, _created = Mechanism.objects.update_or_create(
            title="WAF, segmentacao e gestao de patches",
            defaults={
                "description": "Mecanismo combinado para reduzir exposicao e acelerar remediacao de vulnerabilidades.",
                "mechanism_type": Mechanism.MechanismType.TECHNICAL,
            },
        )
        link, _created = InternalControlMechanism.objects.update_or_create(
            internal_control=internal_control,
            mechanism=mechanism,
            defaults={
                "contribution_weight": 100,
                "mandatory": True,
                "implementation_status": InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
                "relationship_type": InternalControlMechanism.RelationshipType.PREVENTIVE,
                "rationale": "Mecanismo usado no ativo QA para demonstrar mitigacao e evidencia validada.",
                "mapping_source": InternalControlMechanism.MappingSource.TEMPLATE,
                "validation_status": InternalControlMechanism.ValidationStatus.APPROVED,
                "confidence_score": 100,
                "validated_at": timezone.now(),
            },
        )
        return link

    def _framework_mapping(self, internal_control):
        framework, _created = Framework.objects.update_or_create(
            code=Framework.FrameworkCode.ISO27001,
            version="2022",
            defaults={
                "name": "ISO/IEC 27001",
                "publisher": "ISO",
                "description": "Framework usado no cenario de demonstracao.",
                "is_active": True,
            },
        )
        section, _created = FrameworkSection.objects.update_or_create(
            framework=framework,
            code="A.8",
            defaults={"name": "Technology controls", "level": 1, "sort_order": 8},
        )
        external_control, _created = Control.objects.update_or_create(
            framework=framework,
            code="A.8.8",
            defaults={
                "section": section,
                "title": "Management of technical vulnerabilities",
                "description": "Information about technical vulnerabilities shall be obtained, evaluated and treated.",
                "implementation_guidance": "Usar processo de gestao de vulnerabilidades e evidencia de remediacao.",
                "is_mandatory": True,
                "status": Control.Status.ACTIVE,
            },
        )
        InternalControlFrameworkMapping.objects.update_or_create(
            internal_control=internal_control,
            framework_control=external_control,
            defaults={
                "relationship_type": InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
                "coverage_percentage": 100,
                "rationale": "Mapeamento de demonstracao entre controlo interno e ISO A.8.8.",
                "mapping_source": InternalControlFrameworkMapping.MappingSource.TEMPLATE,
                "validation_status": InternalControlFrameworkMapping.ValidationStatus.APPROVED,
                "confidence_score": 100,
                "validated_at": timezone.now(),
            },
        )

    def _evidence(self, mechanism):
        evidence, _created = EvidenceItem.objects.update_or_create(
            title="DEMO UC1 - Evidencia WAF e patching QA",
            defaults={
                "description": "Registo demonstrativo de WAF ativo, segmentacao interna e janela de patching aprovada.",
                "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
                "source": "demo",
                "external_reference": "DEMO-UC1-WAF-PATCH-QA",
                "collected_at": timezone.now(),
                "valid_until": timezone.localdate().replace(year=timezone.localdate().year + 1),
                "confidence_level": 95,
                "status": EvidenceItem.Status.VALID,
                "owner": "Equipa de Qualidade",
                "is_active": True,
            },
        )
        EvidenceLink.objects.update_or_create(
            evidence_item=evidence,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            defaults={
                "rationale": "Evidencia real validada do mecanismo no contexto QA.",
                "mapping_source": EvidenceLink.MappingSource.TEMPLATE,
                "validation_status": EvidenceLink.ValidationStatus.APPROVED,
                "confidence_score": 95,
                "validated_at": timezone.now(),
            },
        )
        return evidence

    def _risk_link(self, occurrence, internal_control, risk):
        GovernanceRiskLink.objects.update_or_create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=str(internal_control.id),
            target_type=GovernanceRiskLink.TargetType.ASSET_VULNERABILITY,
            target_id=str(occurrence.id),
            relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
            defaults={
                "effectiveness_percentage": 90,
                "residual_impact_percentage": 70,
                "rationale": "Controlo interno reduz o risco residual da vulnerabilidade no ativo QA.",
                "mapping_source": GovernanceRiskLink.MappingSource.TEMPLATE,
                "validation_status": GovernanceRiskLink.ValidationStatus.APPROVED,
                "confidence_score": 95,
                "validated_at": timezone.now(),
            },
        )
        GovernanceRiskLink.objects.update_or_create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=str(internal_control.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(risk.id),
            relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
            defaults={
                "effectiveness_percentage": 90,
                "residual_impact_percentage": 70,
                "rationale": "Ligacao adicional para o motor de risco residual.",
                "mapping_source": GovernanceRiskLink.MappingSource.TEMPLATE,
                "validation_status": GovernanceRiskLink.ValidationStatus.APPROVED,
                "confidence_score": 95,
                "validated_at": timezone.now(),
            },
        )

    def _classification(self, asset):
        AssetClassificationReview.objects.filter(asset=asset, is_current=True).update(is_current=False)
        review = AssetClassificationReview.from_asset(
            asset,
            status=AssetClassificationReview.Status.VALIDATED,
            rationale="Classificacao validada para demonstracao do Use Case 1.",
            is_current=True,
            reviewed_at=timezone.now(),
            next_review_at=timezone.localdate().replace(year=timezone.localdate().year + 1),
        )
        review.save()

    def _exposure(self, asset, score, ports, services):
        AssetExposureSnapshot.objects.create(
            asset=asset,
            source="demo",
            exposure_score=score,
            exposure_label="Internet publico" if score >= 5 else "Rede interna controlada",
            open_ports=ports,
            services=services,
            vulnerabilities_summary={"demo": True},
            raw_data={"use_case": "UC1"},
        )
