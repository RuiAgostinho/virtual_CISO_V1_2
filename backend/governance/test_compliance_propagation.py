from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIClient

from governance.models import (
    CompliancePropagationResult,
    Control,
    EvidenceItem,
    EvidenceLink,
    Framework,
    FrameworkSection,
    GovernanceDocument,
    GovernanceDocumentControl,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
)
from governance.services.compliance_propagation_engine import CompliancePropagationEngine
from risk.services.risk_engine import RiskEngineService


class CompliancePropagationTestDataMixin:
    def create_framework(self, code=Framework.FrameworkCode.ISO27001, version="2022"):
        return Framework.objects.create(
            code=code,
            name=f"{code} Framework",
            version=version,
        )

    def create_section(self, framework, code="A.5", name="Organizational controls"):
        return FrameworkSection.objects.create(
            framework=framework,
            code=code,
            name=name,
            level=1,
            sort_order=1,
        )

    def create_control(self, framework=None, section=None, code="A.5.1"):
        framework = framework or self.create_framework()
        section = section or self.create_section(framework)
        return Control.objects.create(
            framework=framework,
            section=section,
            code=code,
            title=f"Control {code}",
            description=f"Description for {code}",
        )

    def create_internal_control(self, code="IC-001"):
        return InternalControl.objects.create(
            code=code,
            title=f"Internal {code}",
            description="Internal control description",
            control_domain="Governance",
            status=InternalControl.Status.ACTIVE,
            source=InternalControl.Source.MANUAL,
        )

    def create_policy(self, code="POL-001"):
        return Policy.objects.create(
            code=code,
            title=f"Policy {code}",
            description="Policy description",
            status=Policy.Status.ACTIVE,
        )

    def create_mechanism(self, title="Reusable mechanism"):
        return Mechanism.objects.create(
            title=title,
            description="Reusable mechanism description",
            mechanism_type=Mechanism.MechanismType.TECHNICAL,
        )

    def create_governance_document(self, title="Governance document"):
        return GovernanceDocument.objects.create(
            title=title,
            document_type=GovernanceDocument.DocumentType.POLICY,
            version="1.0",
            status=GovernanceDocument.Status.DRAFT,
            owner="Security team",
        )

    def create_evidence_item(self, title="Evidence item"):
        return EvidenceItem.objects.create(
            title=title,
            description="Reusable evidence description",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            confidence_level=Decimal("80.00"),
            status=EvidenceItem.Status.VALID,
            is_active=True,
        )


class CompliancePropagationEngineTests(CompliancePropagationTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="propagation-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)

    def link_valid_evidence(self, mechanism, validation_status=EvidenceLink.ValidationStatus.APPROVED, title="Valid evidence"):
        evidence = self.create_evidence_item(title)
        EvidenceLink.objects.create(
            evidence_item=evidence,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=validation_status,
            confidence_score=100,
        )
        return evidence

    def create_scored_internal_control(self, code="IC-SCORED-001"):
        internal_control = self.create_internal_control(code=code)
        mechanism = self.create_mechanism(title=f"Mechanism {code}")
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=mechanism,
            contribution_weight=100,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        self.link_valid_evidence(mechanism, title=f"Evidence {code}")
        return internal_control

    def create_contextual_mechanism(self, implementation_status, code="IC-CTX-001", mandatory=False):
        internal_control = self.create_internal_control(code=code)
        mechanism = self.create_mechanism(title=f"Mechanism {code}")
        link = InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=mechanism,
            contribution_weight=100,
            mandatory=mandatory,
            implementation_status=implementation_status,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        return internal_control, mechanism, link

    def response_items(self, response):
        return response.data.get("results", response.data) if isinstance(response.data, dict) else response.data

    def test_mechanism_score_without_evidence_is_non_compliant(self):
        mechanism = self.create_mechanism("No evidence mechanism")

        result = CompliancePropagationEngine.calculate_mechanism(mechanism)

        self.assertEqual(result["score"], 0.0)
        self.assertEqual(result["status"], CompliancePropagationResult.Status.NON_COMPLIANT)

    def test_mechanism_score_with_valid_evidence_is_compliant(self):
        mechanism = self.create_mechanism("Evidence mechanism")
        self.link_valid_evidence(mechanism)

        response = self.client.get(f"/api/governance/compliance-propagation/mechanism/{mechanism.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["score"], 100.0)
        self.assertEqual(response.data["status"], CompliancePropagationResult.Status.COMPLIANT)

    def test_expired_evidence_does_not_count_in_official_mode(self):
        mechanism = self.create_mechanism("Expired evidence mechanism")
        evidence = EvidenceItem.objects.create(
            title="Expired propagation evidence",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            confidence_level=100,
            status=EvidenceItem.Status.VALID,
            valid_until=timezone.localdate() - timedelta(days=1),
        )
        EvidenceLink.objects.create(
            evidence_item=evidence,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.APPROVED,
        )

        result = CompliancePropagationEngine.calculate_mechanism(mechanism)

        self.assertEqual(result["score"], 0.0)
        self.assertTrue(any(gap["type"] == "expired_evidence" for gap in result["gaps"]))

    def test_pending_review_evidence_counts_only_in_simulation(self):
        mechanism = self.create_mechanism("Pending evidence mechanism")
        self.link_valid_evidence(
            mechanism,
            validation_status=EvidenceLink.ValidationStatus.PENDING_REVIEW,
            title="Pending evidence",
        )

        official = CompliancePropagationEngine.calculate_mechanism(mechanism, mode="official")
        simulation = CompliancePropagationEngine.calculate_mechanism(mechanism, mode="simulation")

        self.assertEqual(official["score"], 0.0)
        self.assertEqual(simulation["score"], 100.0)

    def test_internal_control_mechanism_accepts_implementation_status(self):
        _internal_control, _mechanism, link = self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.PLANNED,
            code="IC-STATUS-001",
        )

        link.refresh_from_db()

        self.assertEqual(link.implementation_status, InternalControlMechanism.ImplementationStatus.PLANNED)

    def test_internal_control_mechanism_filter_by_implementation_status(self):
        self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.PLANNED,
            code="IC-FILTER-001",
        )
        self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.IMPLEMENTED,
            code="IC-FILTER-002",
        )

        response = self.client.get(
            "/api/governance/internal-control-mechanisms/",
            {"implementation_status": InternalControlMechanism.ImplementationStatus.PLANNED},
        )

        self.assertEqual(response.status_code, 200)
        items = self.response_items(response)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["implementation_status"], InternalControlMechanism.ImplementationStatus.PLANNED)

    def test_operational_status_base_scores_without_evidence(self):
        expectations = [
            (InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED, 0.0),
            (InternalControlMechanism.ImplementationStatus.PLANNED, 20.0),
            (InternalControlMechanism.ImplementationStatus.PARTIALLY_IMPLEMENTED, 40.0),
            (InternalControlMechanism.ImplementationStatus.IMPLEMENTED, 70.0),
        ]

        for index, (implementation_status, expected_score) in enumerate(expectations):
            with self.subTest(implementation_status=implementation_status):
                internal_control, _mechanism, _link = self.create_contextual_mechanism(
                    implementation_status,
                    code=f"IC-BASE-{index}",
                )
                result = CompliancePropagationEngine.calculate_internal_control(internal_control)
                self.assertEqual(result["score"], expected_score)

    def test_implemented_evidenced_with_approved_evidence_scores_one_hundred(self):
        internal_control, mechanism, _link = self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            code="IC-EVIDENCED-001",
        )
        self.link_valid_evidence(mechanism, title="Approved evidence")

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertEqual(result["score"], 100.0)
        self.assertEqual(result["status"], CompliancePropagationResult.Status.COMPLIANT)

    def test_implemented_evidenced_without_valid_evidence_scores_seventy_and_creates_gap(self):
        internal_control, _mechanism, link = self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            code="IC-EVIDENCED-002",
        )

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertEqual(result["score"], 70.0)
        self.assertTrue(
            any(
                gap["type"] == "implemented_evidenced_without_valid_evidence"
                and gap["target_id"] == str(link.id)
                for gap in result["gaps"]
            )
        )

    def test_not_applicable_mechanism_is_excluded_from_internal_control_score(self):
        internal_control, _mechanism, _link = self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.NOT_APPLICABLE,
            code="IC-NOT-APPLICABLE-001",
        )

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertEqual(result["score"], 0.0)
        self.assertEqual(result["status"], CompliancePropagationResult.Status.NOT_APPLICABLE)

    def test_pending_review_evidence_counts_for_implemented_evidenced_only_in_simulation(self):
        internal_control, mechanism, _link = self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            code="IC-PENDING-EVIDENCE-001",
        )
        self.link_valid_evidence(
            mechanism,
            validation_status=EvidenceLink.ValidationStatus.PENDING_REVIEW,
            title="Pending implementation evidence",
        )

        official = CompliancePropagationEngine.calculate_internal_control(internal_control, mode="official")
        simulation = CompliancePropagationEngine.calculate_internal_control(internal_control, mode="simulation")

        self.assertEqual(official["score"], 70.0)
        self.assertEqual(simulation["score"], 100.0)

    def test_expired_evidence_does_not_count_for_implemented_evidenced(self):
        internal_control, mechanism, _link = self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            code="IC-EXPIRED-EVIDENCED-001",
        )
        evidence = EvidenceItem.objects.create(
            title="Expired contextual evidence",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            confidence_level=100,
            status=EvidenceItem.Status.VALID,
            valid_until=timezone.localdate() - timedelta(days=1),
        )
        EvidenceLink.objects.create(
            evidence_item=evidence,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.APPROVED,
        )

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertEqual(result["score"], 70.0)
        self.assertTrue(any(gap["type"] == "expired_evidence" for gap in result["gaps"]))

    def test_mandatory_not_implemented_mechanism_creates_specific_gap(self):
        internal_control, _mechanism, link = self.create_contextual_mechanism(
            InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED,
            code="IC-MANDATORY-GAP-001",
            mandatory=True,
        )

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertTrue(
            any(
                gap["type"] == "mechanism_not_implemented"
                and gap["target_id"] == str(link.id)
                for gap in result["gaps"]
            )
        )

    def test_internal_control_calculates_weighted_mechanism_average(self):
        internal_control = self.create_internal_control("IC-WEIGHTED-001")
        strong_mechanism = self.create_mechanism("Strong mechanism")
        weak_mechanism = self.create_mechanism("Weak mechanism")
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=strong_mechanism,
            contribution_weight=75,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=weak_mechanism,
            contribution_weight=25,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        self.link_valid_evidence(strong_mechanism, title="Weighted evidence")

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertEqual(result["score"], 75.0)
        self.assertEqual(result["status"], CompliancePropagationResult.Status.MOSTLY_COMPLIANT)

    def test_internal_control_ignores_rejected_and_deprecated_links(self):
        internal_control = self.create_internal_control("IC-IGNORE-001")
        approved_mechanism = self.create_mechanism("Approved no evidence")
        rejected_mechanism = self.create_mechanism("Rejected evidenced")
        deprecated_mechanism = self.create_mechanism("Deprecated evidenced")
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=approved_mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=rejected_mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.REJECTED,
        )
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=deprecated_mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.DEPRECATED,
        )
        self.link_valid_evidence(rejected_mechanism, title="Rejected ignored evidence")
        self.link_valid_evidence(deprecated_mechanism, title="Deprecated ignored evidence")

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertEqual(result["score"], 0.0)
        self.assertEqual(len(result["details"]["considered_mechanisms"]), 1)

    def test_mandatory_mechanism_at_zero_prevents_compliant_status(self):
        internal_control = self.create_internal_control("IC-MANDATORY-001")
        mandatory_mechanism = self.create_mechanism("Mandatory missing evidence")
        optional_mechanism = self.create_mechanism("Optional evidenced")
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=mandatory_mechanism,
            contribution_weight=10,
            mandatory=True,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        InternalControlMechanism.objects.create(
            internal_control=internal_control,
            mechanism=optional_mechanism,
            contribution_weight=90,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        self.link_valid_evidence(optional_mechanism, title="Optional evidence")

        result = CompliancePropagationEngine.calculate_internal_control(internal_control)

        self.assertEqual(result["score"], 90.0)
        self.assertEqual(result["status"], CompliancePropagationResult.Status.NON_COMPLIANT)

    def test_policy_score_uses_approved_policy_internal_controls(self):
        policy = self.create_policy("POL-PROP-001")
        internal_control = self.create_scored_internal_control("IC-POLICY-001")
        PolicyInternalControl.objects.create(
            policy=policy,
            internal_control=internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.APPROVED,
        )

        response = self.client.get(f"/api/governance/compliance-propagation/policy/{policy.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["score"], 100.0)

    def test_policy_pending_review_counts_only_in_simulation(self):
        policy = self.create_policy("POL-PENDING-001")
        internal_control = self.create_scored_internal_control("IC-POL-PENDING-001")
        PolicyInternalControl.objects.create(
            policy=policy,
            internal_control=internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.PENDING_REVIEW,
        )

        official = CompliancePropagationEngine.calculate_policy(policy, mode="official")
        simulation = CompliancePropagationEngine.calculate_policy(policy, mode="simulation")

        self.assertEqual(official["status"], CompliancePropagationResult.Status.NOT_ASSESSED)
        self.assertEqual(simulation["score"], 100.0)

    def test_governance_document_score_uses_document_controls(self):
        document = self.create_governance_document("Propagation policy document")
        internal_control = self.create_scored_internal_control("IC-DOC-001")
        GovernanceDocumentControl.objects.create(
            document=document,
            internal_control=internal_control,
            purpose=GovernanceDocumentControl.Purpose.DEFINES,
            validation_status=GovernanceDocumentControl.ValidationStatus.APPROVED,
        )

        response = self.client.get(f"/api/governance/compliance-propagation/governance-document/{document.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["score"], 100.0)

    def test_framework_control_score_uses_internal_control_mapping(self):
        internal_control = self.create_scored_internal_control("IC-FWCTRL-001")
        InternalControlFrameworkMapping.objects.create(
            internal_control=internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )

        response = self.client.get(f"/api/governance/compliance-propagation/framework-control/{self.control.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["score"], 100.0)

    def test_framework_score_returns_aggregate_and_coverage(self):
        second_control = self.create_control(self.framework, self.section, code="A.5.2")
        internal_control = self.create_scored_internal_control("IC-FRAMEWORK-001")
        InternalControlFrameworkMapping.objects.create(
            internal_control=internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )

        response = self.client.get(f"/api/governance/compliance-propagation/framework/{self.framework.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["score"], 100.0)
        self.assertEqual(response.data["coverage"], 50.0)
        self.assertTrue(any(item["control_id"] == str(second_control.id) for item in response.data["details"]["controls"]))

    def test_domain_score_aggregates_internal_controls_by_domain(self):
        self.create_scored_internal_control("IC-DOMAIN-001")
        missing_mechanism_control = self.create_internal_control("IC-DOMAIN-002")

        result = CompliancePropagationEngine.calculate_domain(missing_mechanism_control.control_domain)

        self.assertEqual(result["score"], 100.0)
        self.assertEqual(result["coverage"], 50.0)
        self.assertEqual(result["result_type"], CompliancePropagationResult.ResultType.DOMAIN)

    def test_gaps_detect_internal_control_without_mechanisms(self):
        internal_control = self.create_internal_control("IC-GAP-MECH-001")

        gaps = CompliancePropagationEngine.collect_gaps()

        self.assertTrue(
            any(
                gap["type"] == "internal_control_without_mechanisms"
                and gap["target_id"] == str(internal_control.id)
                for gap in gaps
            )
        )

    def test_gaps_detect_mechanism_without_evidence(self):
        mechanism = self.create_mechanism("Gap mechanism")

        response = self.client.get("/api/governance/compliance-propagation/gaps/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            any(
                gap["type"] == "mechanism_without_valid_evidence"
                and gap["target_id"] == str(mechanism.id)
                for gap in response.data["gaps"]
            )
        )

    def test_gaps_detect_expired_evidence(self):
        evidence = EvidenceItem.objects.create(
            title="Gap expired evidence",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            confidence_level=100,
            status=EvidenceItem.Status.VALID,
            valid_until=timezone.localdate() - timedelta(days=1),
        )

        gaps = CompliancePropagationEngine.collect_gaps()

        self.assertTrue(any(gap["type"] == "expired_evidence" and gap["target_id"] == str(evidence.id) for gap in gaps))

    def test_gaps_detect_framework_control_without_internal_control(self):
        gaps = CompliancePropagationEngine.collect_gaps()

        self.assertTrue(
            any(
                gap["type"] == "framework_control_without_internal_control"
                and gap["target_id"] == str(self.control.id)
                for gap in gaps
            )
        )

    def test_recalculate_persists_results(self):
        internal_control = self.create_scored_internal_control("IC-RECALC-001")
        InternalControlFrameworkMapping.objects.create(
            internal_control=internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )

        response = self.client.post(
            "/api/governance/compliance-propagation/recalculate/?include_details=false&include_gaps=false",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertGreater(CompliancePropagationResult.objects.count(), 0)
        self.assertTrue(
            CompliancePropagationResult.objects.filter(
                result_type=CompliancePropagationResult.ResultType.INTERNAL_CONTROL,
                target_id=str(internal_control.id),
            ).exists()
        )

    def test_preview_does_not_persist_results(self):
        internal_control = self.create_scored_internal_control("IC-PREVIEW-001")
        before_count = CompliancePropagationResult.objects.count()

        response = self.client.post(
            "/api/governance/compliance-propagation/preview/",
            {
                "target_type": "internal_control",
                "target_id": str(internal_control.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"]["score"], 100.0)
        self.assertEqual(CompliancePropagationResult.objects.count(), before_count)

    def test_legacy_endpoints_rag_router_and_risk_engine_remain_available(self):
        responses = [
            self.client.get("/api/governance/controls/"),
            self.client.get("/api/governance/policy-controls/"),
            self.client.get("/api/governance/gaps/"),
        ]

        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(resolve("/api/assistant/rag/overview/").url_name, "rag-overview")
        self.assertTrue(hasattr(RiskEngineService, "calculate_risk"))
