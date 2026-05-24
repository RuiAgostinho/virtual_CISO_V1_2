from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIClient

from governance.models import (
    Control,
    EvidenceItem,
    EvidenceLink,
    Framework,
    FrameworkSection,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceDocumentSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
    RunbookStep,
)
from risk.services.risk_engine import RiskEngineService


class TraceabilityApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="traceability-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.framework = Framework.objects.create(
            code=Framework.FrameworkCode.ISO27001,
            name="ISO Framework",
            version="2022",
        )
        self.section = FrameworkSection.objects.create(
            framework=self.framework,
            code="A.5",
            name="Organizational controls",
            level=1,
            sort_order=1,
        )
        self.control = Control.objects.create(
            framework=self.framework,
            section=self.section,
            code="A.5.1",
            title="Policies for information security",
            description="Policies control.",
        )
        self.second_control = Control.objects.create(
            framework=self.framework,
            section=self.section,
            code="A.5.2",
            title="Roles and responsibilities",
            description="Roles control.",
        )
        self.internal_control = InternalControl.objects.create(
            code="IC-TRACE-001",
            title="Internal trace control",
            control_domain="Governance",
            status=InternalControl.Status.ACTIVE,
        )
        self.pending_internal_control = InternalControl.objects.create(
            code="IC-TRACE-002",
            title="Pending internal trace control",
            control_domain="Governance",
            status=InternalControl.Status.ACTIVE,
        )
        self.rejected_internal_control = InternalControl.objects.create(
            code="IC-TRACE-003",
            title="Rejected internal trace control",
            control_domain="Governance",
            status=InternalControl.Status.ACTIVE,
        )
        self.policy = Policy.objects.create(
            code="POL-TRACE-001",
            title="Traceability policy",
            status=Policy.Status.ACTIVE,
        )
        self.mechanism = Mechanism.objects.create(
            title="MFA trace mechanism",
            mechanism_type=Mechanism.MechanismType.TECHNICAL,
        )
        self.pending_mechanism = Mechanism.objects.create(
            title="Pending trace mechanism",
            mechanism_type=Mechanism.MechanismType.TECHNICAL,
        )
        self.evidence = EvidenceItem.objects.create(
            title="MFA approval evidence",
            evidence_type=EvidenceItem.EvidenceType.APPROVAL_RECORD,
            confidence_level=Decimal("95.00"),
            status=EvidenceItem.Status.VALID,
        )
        self.expired_evidence = EvidenceItem.objects.create(
            title="Expired trace evidence",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            confidence_level=Decimal("50.00"),
            status=EvidenceItem.Status.VALID,
            valid_until=timezone.localdate() - timedelta(days=1),
        )
        self.document = GovernanceDocument.objects.create(
            title="Traceability governance policy",
            document_type=GovernanceDocument.DocumentType.POLICY,
            status=GovernanceDocument.Status.APPROVED,
            legacy_policy=self.policy,
        )
        self.child_document = GovernanceDocument.objects.create(
            title="Traceability child standard",
            document_type=GovernanceDocument.DocumentType.STANDARD,
            parent_document=self.document,
        )
        self.document_section = GovernanceDocumentSection.objects.create(
            document=self.document,
            section_number="1",
            title="Purpose",
            content="Traceability purpose.",
            order=1,
        )
        self.runbook = GovernanceDocument.objects.create(
            title="Traceability runbook",
            document_type=GovernanceDocument.DocumentType.RUNBOOK,
            status=GovernanceDocument.Status.APPROVED,
        )
        self.runbook_step = RunbookStep.objects.create(
            runbook=self.runbook,
            step_number=1,
            title="Collect evidence",
            description="Collect the expected evidence.",
            expected_output="Evidence collected.",
            evidence_required=True,
        )

        PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.pending_internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.PENDING_REVIEW,
            confidence_score=70,
        )
        PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.rejected_internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.REJECTED,
            confidence_score=10,
        )
        GovernanceDocumentControl.objects.create(
            document=self.document,
            internal_control=self.internal_control,
            purpose=GovernanceDocumentControl.Purpose.DEFINES,
            validation_status=GovernanceDocumentControl.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        GovernanceDocumentControl.objects.create(
            document=self.runbook,
            internal_control=self.internal_control,
            purpose=GovernanceDocumentControl.Purpose.OPERATIONALIZES,
            validation_status=GovernanceDocumentControl.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
            contribution_weight=100,
            confidence_score=100,
        )
        InternalControlMechanism.objects.create(
            internal_control=self.pending_internal_control,
            mechanism=self.pending_mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.PLANNED,
            validation_status=InternalControlMechanism.ValidationStatus.PENDING_REVIEW,
            contribution_weight=100,
            confidence_score=70,
        )
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.pending_internal_control,
            framework_control=self.second_control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.PARTIAL,
            coverage_percentage=50,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW,
            confidence_score=70,
        )
        EvidenceLink.objects.create(
            evidence_item=self.evidence,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=self.mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        EvidenceLink.objects.create(
            evidence_item=self.expired_evidence,
            target_type=EvidenceLink.TargetType.INTERNAL_CONTROL,
            target_id=self.internal_control.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.APPROVED,
            confidence_score=50,
        )

    def ids(self, items):
        return {item["id"] for item in items}

    def test_policy_traceability_returns_internal_controls(self):
        response = self.client.get(f"/api/governance/traceability/policy/{self.policy.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(str(self.internal_control.id), self.ids(response.data["relationships"]["internal_controls"]))

    def test_policy_traceability_returns_indirect_mechanisms(self):
        response = self.client.get(f"/api/governance/traceability/policy/{self.policy.id}/")

        self.assertIn(str(self.mechanism.id), self.ids(response.data["relationships"]["mechanisms"]))

    def test_policy_traceability_returns_impacted_frameworks(self):
        response = self.client.get(f"/api/governance/traceability/policy/{self.policy.id}/")

        self.assertIn(str(self.framework.id), self.ids(response.data["relationships"]["frameworks"]))

    def test_governance_document_traceability_returns_children_and_sections(self):
        response = self.client.get(f"/api/governance/traceability/governance-document/{self.document.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(str(self.child_document.id), self.ids(response.data["relationships"]["children"]))
        self.assertIn(str(self.document_section.id), self.ids(response.data["relationships"]["sections"]))

    def test_runbook_traceability_returns_runbook_steps(self):
        response = self.client.get(f"/api/governance/traceability/governance-document/{self.runbook.id}/")

        self.assertIn(str(self.runbook_step.id), self.ids(response.data["relationships"]["runbook_steps"]))

    def test_internal_control_traceability_returns_related_entities(self):
        response = self.client.get(f"/api/governance/traceability/internal-control/{self.internal_control.id}/")

        self.assertIn(str(self.policy.id), self.ids(response.data["relationships"]["policies"]))
        self.assertIn(str(self.document.id), self.ids(response.data["relationships"]["governance_documents"]))
        self.assertEqual(response.data["relationships"]["mechanisms"][0]["mechanism"]["id"], str(self.mechanism.id))
        self.assertIn(str(self.framework.id), self.ids(response.data["relationships"]["frameworks"]))

    def test_mechanism_traceability_returns_internal_controls_and_frameworks(self):
        response = self.client.get(f"/api/governance/traceability/mechanism/{self.mechanism.id}/")

        self.assertIn(str(self.internal_control.id), self.ids(response.data["relationships"]["internal_controls"]))
        self.assertIn(str(self.framework.id), self.ids(response.data["relationships"]["frameworks"]))
        self.assertEqual(
            response.data["relationships"]["implementation_status_by_internal_control"][0]["implementation_status"],
            InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
        )

    def test_evidence_traceability_returns_mechanisms_and_impacted_internal_controls(self):
        response = self.client.get(f"/api/governance/traceability/evidence-item/{self.evidence.id}/")

        self.assertIn(str(self.mechanism.id), self.ids(response.data["relationships"]["mechanisms"]))
        self.assertIn(str(self.internal_control.id), self.ids(response.data["relationships"]["internal_controls_indirect"]))

    def test_framework_traceability_returns_internal_controls_and_coverage(self):
        response = self.client.get(f"/api/governance/traceability/framework/{self.framework.id}/")

        self.assertIn(str(self.internal_control.id), self.ids(response.data["relationships"]["internal_controls"]))
        self.assertEqual(response.data["scores"]["official"]["coverage"], 50.0)

    def test_framework_control_traceability_returns_internal_controls(self):
        response = self.client.get(f"/api/governance/traceability/framework-control/{self.control.id}/")

        self.assertIn(str(self.internal_control.id), self.ids(response.data["relationships"]["internal_controls"]))

    def test_official_mode_excludes_pending_review(self):
        response = self.client.get(f"/api/governance/traceability/policy/{self.policy.id}/", {"mode": "official"})

        self.assertNotIn(str(self.pending_internal_control.id), self.ids(response.data["relationships"]["internal_controls"]))
        self.assertTrue(response.data["relationships"]["pending_review_mappings"]["policy_internal_controls"])

    def test_simulation_mode_includes_pending_review(self):
        response = self.client.get(f"/api/governance/traceability/policy/{self.policy.id}/", {"mode": "simulation"})

        self.assertIn(str(self.pending_internal_control.id), self.ids(response.data["relationships"]["internal_controls"]))

    def test_rejected_and_deprecated_do_not_appear_as_active(self):
        response = self.client.get(f"/api/governance/traceability/policy/{self.policy.id}/", {"mode": "simulation"})

        self.assertNotIn(str(self.rejected_internal_control.id), self.ids(response.data["relationships"]["internal_controls"]))

    def test_include_inactive_returns_rejected_or_deprecated_mappings_separately(self):
        response = self.client.get(
            f"/api/governance/traceability/policy/{self.policy.id}/",
            {"include_inactive": "true"},
        )

        self.assertIn("inactive_mappings", response.data)
        self.assertEqual(
            response.data["inactive_mappings"]["policy_internal_controls"][0]["validation_status"],
            PolicyInternalControl.ValidationStatus.REJECTED,
        )

    def test_include_scores_true_includes_scores(self):
        response = self.client.get(f"/api/governance/traceability/policy/{self.policy.id}/")

        self.assertIn("scores", response.data)
        self.assertEqual(response.data["scores"]["official"]["score"], 100.0)

    def test_include_scores_false_omits_scores(self):
        response = self.client.get(
            f"/api/governance/traceability/policy/{self.policy.id}/",
            {"include_scores": "false"},
        )

        self.assertNotIn("scores", response.data)

    def test_include_gaps_true_includes_gaps(self):
        response = self.client.get(
            f"/api/governance/traceability/internal-control/{self.internal_control.id}/",
            {"include_gaps": "true"},
        )

        self.assertIn("gaps", response.data)

    def test_include_evidence_false_omits_evidence(self):
        response = self.client.get(
            f"/api/governance/traceability/policy/{self.policy.id}/",
            {"include_evidence": "false"},
        )

        self.assertNotIn("evidence", response.data)

    def test_overview_returns_main_counts(self):
        response = self.client.get("/api/governance/traceability/overview/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["totals"]["policies"], 1)
        self.assertEqual(response.data["totals"]["governance_documents"], 3)
        self.assertEqual(response.data["totals"]["frameworks"], 1)
        self.assertGreaterEqual(response.data["totals"]["mappings_pending_review"], 1)

    def test_legacy_endpoints_remain_available(self):
        responses = [
            self.client.get("/api/governance/controls/"),
            self.client.get("/api/governance/policy-controls/"),
            self.client.get("/api/governance/gaps/"),
        ]

        self.assertTrue(all(response.status_code == 200 for response in responses))

    def test_rag_router_remains_resolvable(self):
        self.assertEqual(resolve("/api/assistant/rag/overview/").url_name, "rag-overview")

    def test_risk_engine_is_not_altered(self):
        self.assertTrue(hasattr(RiskEngineService, "calculate_risk"))
