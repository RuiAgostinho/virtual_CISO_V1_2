from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from governance.models import (
    DecisionRecord,
    EvidenceItem,
    EvidenceLink,
    GovernanceRiskLink,
    InternalControl,
    InternalControlMechanism,
    Mechanism,
)
from governance.services.residual_risk_service import GovernanceResidualRiskService
from risk.models import (
    Asset,
    AssetClassificationReview,
    AssetExposureSnapshot,
    AssetVulnerability,
    PriorityFeatureSnapshot,
    PriorityModelConfig,
    Software,
    Vulnerability,
)
from risk.models import Risk
from risk.services.intel_service import IntelService
from risk.services.prioritization import VulnerabilityPrioritizationService


class AssetClassificationApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="ciso", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _payload(self, **overrides):
        payload = {
            "confidentiality": 5,
            "integrity": 4,
            "availability": 4,
            "exposure": 3,
            "business_value": 5,
            "dependency_score": 4,
            "owner": "CISO",
            "rationale": "Ativo crítico para serviço essencial com exposição controlada.",
            "next_review_at": "2026-12-31",
            "classification_status": "validated",
        }
        payload.update(overrides)
        return payload

    def test_classify_asset_creates_current_review_and_updates_asset(self):
        asset = Asset.objects.create(name="Portal de cidadãos")

        response = self.client.post(f"/api/risk/assets/{asset.id}/classify/", self._payload(), format="json")

        self.assertEqual(response.status_code, 200)
        asset.refresh_from_db()
        self.assertEqual(asset.confidentiality, 5)
        self.assertEqual(asset.business_value, 5)
        review = AssetClassificationReview.objects.get(asset=asset, is_current=True)
        self.assertEqual(review.status, AssetClassificationReview.Status.VALIDATED)
        self.assertEqual(review.reviewed_by, self.user)

        detail_response = self.client.get(f"/api/risk/assets/{asset.id}/")

        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data["classification_status"], AssetClassificationReview.Status.VALIDATED)
        self.assertEqual(str(detail_response.data["classification_review_due"]), "2026-12-31")
        self.assertEqual(detail_response.data["current_classification_review"]["status"], AssetClassificationReview.Status.VALIDATED)

    def test_classifying_asset_recalculates_existing_risks(self):
        asset = Asset.objects.create(
            name="DEMO UC1 - Portal de Municipes",
            confidentiality=5,
            integrity=5,
            availability=5,
            exposure=5,
            business_value=5,
            dependency_score=5,
        )
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-UC1-0001",
            severity="High",
            cvss_score="8.0",
            epss_score="0.7800",
        )
        risk = Risk.objects.create(
            asset=asset,
            vulnerability=vulnerability,
            risk_score=90,
            risk_level=Risk.RiskLevel.CRITICAL,
            likelihood=3.9,
            impact=5,
            ai_explanation="Risco antigo com elevada criticidade do ativo.",
        )

        response = self.client.post(
            f"/api/risk/assets/{asset.id}/classify/",
            self._payload(
                confidentiality=1,
                integrity=1,
                availability=1,
                exposure=1,
                business_value=1,
                dependency_score=1,
                rationale="Reclassificacao validada com impacto baixo no negocio.",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        asset.refresh_from_db()
        risk.refresh_from_db()
        self.assertEqual(asset.criticality, "Low")
        self.assertLess(risk.risk_score, 60)
        self.assertEqual(risk.risk_level, Risk.RiskLevel.MEDIUM)
        self.assertLess(risk.impact, 3)
        self.assertNotIn("elevada criticidade do ativo", risk.ai_explanation)
        self.assertEqual(risk.factors.get(name="Criticidade do Ativo").value, "Low")

    def test_validated_classification_requires_rationale(self):
        asset = Asset.objects.create(name="Servidor legado")

        response = self.client.post(
            f"/api/risk/assets/{asset.id}/classify/",
            self._payload(rationale=""),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Justificação", response.data["detail"])

    def test_bulk_classify_assets_creates_reviews_for_selected_assets(self):
        first = Asset.objects.create(name="CRM")
        second = Asset.objects.create(name="ERP")
        payload = self._payload(
            asset_ids=[str(first.id), str(second.id)],
            classification_status="incomplete",
            rationale="Classificação preliminar para revisão posterior.",
            next_review_at="",
        )

        response = self.client.post("/api/risk/assets/bulk_classify/", payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["processed"], 2)
        self.assertEqual(response.data["created"], 2)
        self.assertEqual(
            AssetClassificationReview.objects.filter(
                asset__in=[first, second],
                is_current=True,
                status=AssetClassificationReview.Status.INCOMPLETE,
            ).count(),
            2,
        )

    def test_asset_detail_serializes_vulnerability_software(self):
        asset = Asset.objects.create(name="PC Rui")
        software = Software.objects.create(id=999001, name="Chromium", version="136.0", vendor="Google")
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-1234",
            severity="High",
            cvss_score="8.5",
        )
        AssetVulnerability.objects.create(
            asset=asset,
            vulnerability=vulnerability,
            software=software,
            software_version="136.0",
            status="Open",
        )

        response = self.client.get(f"/api/risk/assets/{asset.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["vulnerability_occurrences"][0]["software_name"], "Chromium")


class VulnerabilityIntelApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="risk-ciso", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_intel_quality_counts_present_and_missing_fields(self):
        Vulnerability.objects.create(
            cve_id="CVE-2026-0001",
            severity="High",
            cvss_score="8.0",
            epss_score="0.3000",
            nvd_data={"nvd": {"id": "CVE-2026-0001"}},
            kev_last_updated=timezone.now(),
            mitigation="Aplicar patch do fabricante.",
        )
        Vulnerability.objects.create(cve_id="CVE-2026-0002", severity="Medium")

        response = self.client.get("/api/risk/vulnerabilities/intel_quality/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(response.data["cvss_present"], 1)
        self.assertEqual(response.data["epss_present"], 1)
        self.assertEqual(response.data["missing_enrichment"], 1)

    def test_vulnerability_serializer_exposes_quality_flags(self):
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-0003",
            severity="Critical",
            cvss_score="9.8",
        )

        response = self.client.get(f"/api/risk/vulnerabilities/{vulnerability.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["has_cvss"])
        self.assertFalse(response.data["has_epss"])
        self.assertFalse(response.data["is_fully_enriched"])

    def test_vulnerability_filters_missing_enrichment(self):
        Vulnerability.objects.create(
            cve_id="CVE-2026-0004",
            severity="High",
            cvss_score="7.5",
            epss_score="0.2000",
            nvd_data={"nvd": {"id": "CVE-2026-0004"}},
            kev_last_updated=timezone.now(),
            mitigation="Atualizar componente.",
        )
        missing = Vulnerability.objects.create(cve_id="CVE-2026-0005", severity="Low")

        response = self.client.get("/api/risk/vulnerabilities/?missing_enrichment=true")

        self.assertEqual(response.status_code, 200)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], str(missing.id))

    def test_apply_kev_entries_marks_existing_cves_and_records_mitigation(self):
        kev = Vulnerability.objects.create(cve_id="CVE-2026-0006", severity="High")
        other = Vulnerability.objects.create(cve_id="CVE-2026-0007", severity="Medium")

        result = IntelService.apply_kev_entries(
            [
                {
                    "cveID": "CVE-2026-0006",
                    "requiredAction": "Aplicar atualização de segurança indicada pela CISA.",
                }
            ]
        )

        kev.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(result["matched"], 1)
        self.assertTrue(kev.is_in_kev)
        self.assertFalse(other.is_in_kev)
        self.assertIsNotNone(kev.kev_last_updated)
        self.assertIn("CISA", kev.mitigation)


class WazuhSyncCommandTests(TestCase):
    @patch("risk.management.commands.sync_wazuh_assets.WazuhService")
    def test_wazuh_asset_sync_creates_onboarding_asset(self, service_cls):
        service = service_cls.return_value
        service.get_agents.return_value = [
            {
                "id": "001",
                "name": "srv-core-01",
                "ip": "10.0.0.10",
                "os": {"name": "Ubuntu", "version": "22.04"},
                "node_name": "wazuh-node",
            }
        ]
        service.get_agent_hardware.return_value = {"cpu": {"cores": 4}}
        service.get_agent_packages.return_value = []

        call_command("sync_wazuh_assets", verbosity=0)

        asset = Asset.objects.get(wazuh_agent_id="001")
        self.assertEqual(asset.name, "srv-core-01")
        self.assertEqual(asset.source, "wazuh")
        self.assertEqual(asset.status, "New")
        self.assertEqual(asset.wazuh_ip, "10.0.0.10")

    @patch("risk.management.commands.sync_wazuh_vulns.WazuhService")
    def test_wazuh_vulnerability_sync_links_cve_to_asset(self, service_cls):
        asset = Asset.objects.create(name="srv-core-01", source="wazuh", status="New", wazuh_agent_id="001")
        service = service_cls.return_value
        service.get_vulnerabilities.return_value = [
            {
                "agent": {"id": "001"},
                "vulnerability": {
                    "id": "CVE-2026-9999",
                    "severity": "High",
                    "score": {"base": "8.8"},
                    "description": "OpenSSL vulnerable package.",
                    "package": {"name": "openssl", "version": "1.1.1"},
                },
            }
        ]

        call_command("sync_wazuh_vulns", verbosity=0)

        vulnerability = Vulnerability.objects.get(cve_id="CVE-2026-9999")
        occurrence = AssetVulnerability.objects.get(asset=asset, vulnerability=vulnerability)
        self.assertEqual(occurrence.status, "Open")
        self.assertEqual(occurrence.software.name, "openssl")
        self.assertEqual(asset.vulnerability_occurrences.count(), 1)


class VulnerabilityPrioritizationApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="priority-ciso", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_prioritized_endpoint_returns_explainable_factors(self):
        asset = Asset.objects.create(
            name="Portal publico",
            confidentiality=5,
            integrity=5,
            availability=5,
            exposure=5,
            business_value=5,
            dependency_score=4,
        )
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-1000",
            severity="Critical",
            cvss_score="9.8",
            epss_score="0.7000",
            is_in_kev=True,
            kev_last_updated=timezone.now(),
            mitigation="Aplicar patch do fornecedor.",
        )
        AssetVulnerability.objects.create(asset=asset, vulnerability=vulnerability)

        response = self.client.get("/api/risk/vulnerability-occurrences/prioritized/?limit=10")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        item = response.data[0]
        self.assertEqual(item["model_mode"], "explainable_weighted")
        self.assertTrue(item["contribution_breakdown"])
        self.assertTrue(item["recommended_action"])
        self.assertIn("has_epss", item["data_quality"])
        snapshot = PriorityFeatureSnapshot.objects.get()
        self.assertEqual(snapshot.estimator_key, "weighted_v1")
        self.assertIn("epss", snapshot.feature_vector)
        self.assertEqual(snapshot.outcome_label, "open")

    def test_prioritized_endpoint_marks_xgboost_as_experimental(self):
        asset = Asset.objects.create(name="Servidor QA")
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-1001",
            severity="High",
            cvss_score="8.0",
            epss_score="0.1000",
        )
        AssetVulnerability.objects.create(asset=asset, vulnerability=vulnerability)

        response = self.client.get(
            "/api/risk/vulnerability-occurrences/prioritized/?mode=xgboost_experimental"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["model_mode"], "xgboost_experimental")
        self.assertFalse(response.data[0]["experimental_model"]["enabled"])
        self.assertEqual(response.data[0]["experimental_model"]["current_ml_signal"], "EPSS")

    def test_prioritized_endpoint_accepts_xgboost_shap_but_falls_back_until_ready(self):
        asset = Asset.objects.create(name="Servidor aplicacional")
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-1002",
            severity="High",
            cvss_score="8.0",
            epss_score="0.1000",
        )
        AssetVulnerability.objects.create(asset=asset, vulnerability=vulnerability)

        response = self.client.get("/api/risk/vulnerability-occurrences/prioritized/?mode=xgboost_shap")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["model_mode"], "explainable_weighted")
        self.assertFalse(response.data[0]["experimental_model"]["enabled"])
        self.assertIn("readiness", response.data[0]["experimental_model"])

    def test_priority_model_config_reports_xgboost_readiness_gate(self):
        response = self.client.get("/api/risk/priority-model-config/current/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mode"], PriorityModelConfig.Mode.EXPLAINABLE_WEIGHTED)
        self.assertFalse(response.data["readiness"]["ready"])
        self.assertEqual(response.data["readiness"]["current_ml_signal"], "EPSS")
        self.assertIn("xgboost_shap", [item["value"] for item in response.data["supported_modes"]])

    def test_priority_model_config_blocks_xgboost_activation_without_history(self):
        config = PriorityModelConfig.get_config()

        response = self.client.patch(
            f"/api/risk/priority-model-config/{config.id}/",
            {"mode": PriorityModelConfig.Mode.XGBOOST_SHAP},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("mode", response.data)

    def test_priority_model_mode_change_creates_decision_record(self):
        config = PriorityModelConfig.get_config()
        PriorityModelConfig.objects.filter(pk=config.pk).update(
            mode=PriorityModelConfig.Mode.XGBOOST_SHAP,
            active_model_version="xgb-test",
            artifact_path="/tmp/xgb-test.joblib",
            holdout_auc="0.800",
            holdout_brier="0.120",
        )

        response = self.client.patch(
            f"/api/risk/priority-model-config/{config.id}/",
            {"mode": PriorityModelConfig.Mode.EXPLAINABLE_WEIGHTED},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        decision = DecisionRecord.objects.get(target_type="priority_model_config", target_id=str(config.id))
        self.assertEqual(decision.decision_type, DecisionRecord.DecisionType.RISK)
        self.assertEqual(decision.decision, DecisionRecord.Decision.ACCEPTED)
        self.assertIn("Desativação", decision.title)
        self.assertEqual(decision.score_snapshot["previous_mode"], PriorityModelConfig.Mode.XGBOOST_SHAP)
        self.assertEqual(decision.score_snapshot["current_mode"], PriorityModelConfig.Mode.EXPLAINABLE_WEIGHTED)

    def test_model_explanation_endpoint_returns_auditable_payload(self):
        asset = Asset.objects.create(name="Portal auditavel")
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-1003",
            severity="Critical",
            cvss_score="9.0",
            epss_score="0.4000",
        )
        occurrence = AssetVulnerability.objects.create(asset=asset, vulnerability=vulnerability)

        response = self.client.get(
            f"/api/risk/vulnerability-occurrences/{occurrence.id}/model-explanation/?mode=xgboost_shap"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["audit"]["target_id"], str(occurrence.id))
        self.assertEqual(response.data["model"]["requested_mode"], "xgboost_shap")
        self.assertEqual(response.data["model"]["served_mode"], "explainable_weighted")
        self.assertTrue(response.data["contribution_breakdown"])

    def test_use_case1_demo_seed_prioritizes_critical_exposed_asset_over_qa(self):
        call_command("seed_use_case1_demo", verbosity=0)

        items = VulnerabilityPrioritizationService.get_top_vulnerabilities(
            limit=10,
            filters={"detected_since_days": 7},
        )

        demo_items = [item for item in items if item.cve_id.startswith("CVE-2026-UC1")]
        self.assertGreaterEqual(len(demo_items), 2)
        critical = next(item for item in demo_items if item.cve_id == "CVE-2026-UC1-0001")
        qa = next(item for item in demo_items if item.cve_id == "CVE-2026-UC1-0002")
        self.assertGreater(critical.priority_score, qa.priority_score)
        self.assertTrue(critical.comparison_group["enabled"])
        self.assertEqual(critical.comparison_group["cvss_score"], 8.0)
        self.assertTrue(qa.governance_context["valid_evidence"] >= 1)


class GovernanceRiskIntegrationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="governance-risk-ciso", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _risk_with_governance_link(self):
        asset = Asset.objects.create(
            name="Portal publico",
            confidentiality=5,
            integrity=5,
            availability=5,
            exposure=5,
            business_value=5,
            dependency_score=4,
        )
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-2000",
            severity="Critical",
            cvss_score="9.8",
            epss_score="0.7000",
            is_in_kev=True,
        )
        occurrence = AssetVulnerability.objects.create(asset=asset, vulnerability=vulnerability)
        risk = Risk.objects.create(
            asset=asset,
            vulnerability=vulnerability,
            risk_score=80,
            risk_level=Risk.RiskLevel.CRITICAL,
            status=Risk.RiskStatus.OPEN,
        )
        control = InternalControl.objects.create(
            code="IC-RISK-TEST",
            title="Controlo interno de teste",
            control_domain="Gestao de vulnerabilidades",
            status=InternalControl.Status.ACTIVE,
        )
        mechanism = Mechanism.objects.create(title="Patch management", description="Aplicacao controlada de patches.")
        icm = InternalControlMechanism.objects.create(
            internal_control=control,
            mechanism=mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        GovernanceRiskLink.objects.create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL_MECHANISM,
            source_id=str(icm.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(risk.id),
            relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
            residual_impact_percentage=50,
            effectiveness_percentage=100,
            validation_status=GovernanceRiskLink.ValidationStatus.APPROVED,
            rationale="Mecanismo reduz risco residual quando estiver evidenciado.",
        )
        return asset, vulnerability, occurrence, risk, mechanism

    def test_residual_risk_uses_compliance_and_real_evidence(self):
        _asset, _vulnerability, _occurrence, risk, mechanism = self._risk_with_governance_link()

        without_evidence = GovernanceResidualRiskService.risk_impact(risk.id)
        self.assertEqual(without_evidence["governance_reduction_percentage"], 35.0)

        evidence = EvidenceItem.objects.create(
            title="Relatorio de patch aplicado",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            status=EvidenceItem.Status.VALID,
            confidence_level=100,
        )
        EvidenceLink.objects.create(
            evidence_item=evidence,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.APPROVED,
            confidence_score=100,
        )

        with_evidence = GovernanceResidualRiskService.risk_impact(risk.id)
        self.assertEqual(with_evidence["governance_reduction_percentage"], 50.0)

    def test_ciso_panel_returns_database_metrics(self):
        self._risk_with_governance_link()

        response = self.client.get("/api/risk/risks/ciso-panel/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["metrics"]["critical_exposed_assets"], 1)
        self.assertEqual(response.data["metrics"]["critical_vulnerabilities_on_critical_assets"], 1)
        self.assertEqual(response.data["metrics"]["kev_open"], 1)
        self.assertIn("top_prioritized_vulnerabilities", response.data["lists"])


class AttackVectorRiskApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="vector-ciso", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _critical_exposed_ransomware_fixture(self):
        asset = Asset.objects.create(
            name="Portal municipal exposto",
            description="Servico critico de atendimento online.",
            confidentiality=5,
            integrity=5,
            availability=5,
            exposure=5,
            business_value=5,
            dependency_score=5,
            owner="CISO",
            wazuh_ip="203.0.113.10",
        )
        AssetExposureSnapshot.objects.create(
            asset=asset,
            exposure_score=5,
            exposure_label="Internet publico",
            open_ports=[443, 445, 3389],
            services=["https", "smb", "rdp"],
        )
        vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2026-4242",
            severity="High",
            cvss_score="8.0",
            epss_score="0.8000",
            is_in_kev=True,
            description="Remote code execution often used in ransomware intrusion chains.",
        )
        AssetVulnerability.objects.create(asset=asset, vulnerability=vulnerability, status="Open")
        return asset, vulnerability

    def test_attack_vector_catalog_exposes_supported_vectors(self):
        response = self.client.get("/api/risk/attack-vectors/catalog/")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data["vectors"]}
        self.assertIn("ransomware", ids)
        self.assertIn("phishing_credentials", ids)
        self.assertIn("critical_vulnerability_exploitation", ids)

    def test_attack_vector_overview_returns_explainable_matrix(self):
        self._critical_exposed_ransomware_fixture()

        response = self.client.get("/api/risk/attack-vectors/overview/?horizon_days=30")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["horizon_days"], 30)
        self.assertIn("methodology", response.data)
        self.assertIn("formula_pt", response.data["methodology"])
        self.assertIn("probability", response.data["methodology"]["dimension_explanations"])
        self.assertGreaterEqual(len(response.data["vectors"]), 10)
        ransomware = next(item for item in response.data["vectors"] if item["id"] == "ransomware")
        self.assertGreater(ransomware["score"], 50)
        self.assertGreater(ransomware["dimensions"]["mitigation_gap"], 80)
        self.assertEqual(ransomware["counts"]["kev_occurrences"], 1)
        self.assertIn("rationale", ransomware)
        self.assertIn("next_action", ransomware)
        self.assertIn("predictive_model", ransomware)
        self.assertEqual(ransomware["predictive_model"]["official_score_source"], "attack_vector_risk_v1")
        self.assertFalse(ransomware["predictive_model"]["enabled"])
        self.assertIn("cvss", ransomware["predictive_model"]["feature_vector"])
        self.assertIn("readiness", ransomware["predictive_model"])

    def test_attack_vector_detail_reports_assets_and_vulnerabilities(self):
        asset, vulnerability = self._critical_exposed_ransomware_fixture()

        response = self.client.get("/api/risk/attack-vectors/ransomware/?horizon_days=90")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], "ransomware")
        self.assertEqual(response.data["horizon_days"], 90)
        self.assertEqual(response.data["top_assets"][0]["id"], str(asset.id))
        self.assertEqual(response.data["top_vulnerabilities"][0]["id"], str(vulnerability.id))
        self.assertEqual(response.data["formula_factors"][0]["code"], "probability")
        self.assertEqual(response.data["predictive_model"]["served_mode"], PriorityModelConfig.Mode.EXPLAINABLE_WEIGHTED)
        self.assertIn("Shadow mode", response.data["predictive_model"]["reason"])
        self.assertTrue(response.data["predictive_model"]["contribution_breakdown"])

    def test_attack_vector_detail_returns_404_for_unknown_vector(self):
        response = self.client.get("/api/risk/attack-vectors/unknown-vector/")

        self.assertEqual(response.status_code, 404)
