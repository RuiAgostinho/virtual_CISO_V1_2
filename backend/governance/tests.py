import hashlib
import tempfile
from decimal import Decimal
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIClient

from governance.models import (
    Control,
    ControlAssessment,
    Evidence,
    EvidenceItem,
    EvidenceLink,
    Framework,
    FrameworkProfile,
    FrameworkSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    MechanismEvidenceRequirement,
    Policy,
    PolicyControl,
    PolicySection,
    PolicyInternalControl,
    ImplementationMechanism,
    MechanismEvidence,
    PolicyEvidence,
    ControlMechanism,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceDocumentSection,
    GovernanceAction,
    GovernanceRiskLink,
    RunbookStep,
    CompliancePropagationResult,
)
from governance.services.compliance_propagation_engine import CompliancePropagationEngine
from governance.services.action_plan_service import GovernanceActionPlanService
from company.models import CompanyProfile
from risk.services.risk_engine import RiskEngineService
from risk.models import Asset, Risk, Vulnerability


class GovernanceTestDataMixin:
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

    def create_assessment(self, control):
        profile, _created = FrameworkProfile.objects.get_or_create(
            framework=control.framework,
            name=FrameworkProfile.ProfileType.BASELINE,
            defaults={"maturity_model": "Virtual CISO", "max_level": 5},
        )
        return ControlAssessment.objects.create(
            profile=profile,
            control=control,
            implementation_status=ControlAssessment.ImplementationStatus.PARTIAL,
            maturity_level=1,
            effectiveness=Decimal("0.50"),
            risk_inherent=Decimal("0.50"),
            risk_residual=Decimal("0.25"),
        )

    def create_governance_document(self, title="Governance document", document_type=GovernanceDocument.DocumentType.POLICY):
        return GovernanceDocument.objects.create(
            title=title,
            document_type=document_type,
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


class InternalControlApiTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="governance-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)

    def test_create_internal_control_manually(self):
        response = self.client.post(
            "/api/governance/internal-controls/",
            {
                "code": "IC-MANUAL-001",
                "title": "Manual internal control",
                "description": "Created through the internal control API.",
                "control_domain": "Governance",
                "criticality": InternalControl.Criticality.HIGH,
                "status": InternalControl.Status.DRAFT,
                "source": InternalControl.Source.MANUAL,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(InternalControl.objects.filter(code="IC-MANUAL-001").exists())

    def test_create_internal_control_framework_mapping_manually(self):
        internal_control = self.create_internal_control()

        response = self.client.post(
            "/api/governance/internal-control-framework-mappings/",
            {
                "internal_control": str(internal_control.id),
                "framework_control": str(self.control.id),
                "relationship_type": InternalControlFrameworkMapping.RelationshipType.PARTIAL,
                "coverage_percentage": "75.00",
                "confidence_score": "80.00",
                "rationale": "Manual mapping under review.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        mapping = InternalControlFrameworkMapping.objects.get()
        self.assertEqual(mapping.mapping_source, InternalControlFrameworkMapping.MappingSource.MANUAL)
        self.assertEqual(mapping.validation_status, InternalControlFrameworkMapping.ValidationStatus.DRAFT)
        self.assertEqual(mapping.created_by, self.user)

    def test_duplicate_internal_control_framework_mapping_is_blocked(self):
        internal_control = self.create_internal_control()
        InternalControlFrameworkMapping.objects.create(
            internal_control=internal_control,
            framework_control=self.control,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                InternalControlFrameworkMapping.objects.create(
                    internal_control=internal_control,
                    framework_control=self.control,
                )

    def test_coverage_percentage_must_be_between_zero_and_one_hundred(self):
        internal_control = self.create_internal_control()

        response = self.client.post(
            "/api/governance/internal-control-framework-mappings/",
            {
                "internal_control": str(internal_control.id),
                "framework_control": str(self.control.id),
                "relationship_type": InternalControlFrameworkMapping.RelationshipType.PARTIAL,
                "coverage_percentage": "101.00",
                "confidence_score": "80.00",
                "rationale": "Invalid coverage.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("coverage_percentage", response.data)

    def test_confidence_score_must_be_between_zero_and_one_hundred(self):
        internal_control = self.create_internal_control()

        response = self.client.post(
            "/api/governance/internal-control-framework-mappings/",
            {
                "internal_control": str(internal_control.id),
                "framework_control": str(self.control.id),
                "relationship_type": InternalControlFrameworkMapping.RelationshipType.PARTIAL,
                "coverage_percentage": "80.00",
                "confidence_score": "-1.00",
                "rationale": "Invalid confidence.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("confidence_score", response.data)

    def test_approve_mapping_sets_validator_and_timestamp(self):
        internal_control = self.create_internal_control()
        mapping = InternalControlFrameworkMapping.objects.create(
            internal_control=internal_control,
            framework_control=self.control,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.DRAFT,
        )

        response = self.client.post(
            f"/api/governance/internal-control-framework-mappings/{mapping.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        mapping.refresh_from_db()
        self.assertEqual(mapping.validation_status, InternalControlFrameworkMapping.ValidationStatus.APPROVED)
        self.assertEqual(mapping.validated_by, self.user)
        self.assertIsNotNone(mapping.validated_at)

    def test_reject_mapping(self):
        internal_control = self.create_internal_control()
        mapping = InternalControlFrameworkMapping.objects.create(
            internal_control=internal_control,
            framework_control=self.control,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW,
        )

        response = self.client.post(
            f"/api/governance/internal-control-framework-mappings/{mapping.id}/reject/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        mapping.refresh_from_db()
        self.assertEqual(mapping.validation_status, InternalControlFrameworkMapping.ValidationStatus.REJECTED)

    def test_old_governance_endpoints_remain_available(self):
        controls_response = self.client.get("/api/governance/controls/")
        mappings_response = self.client.get("/api/governance/control-mappings/")

        self.assertEqual(controls_response.status_code, 200)
        self.assertEqual(mappings_response.status_code, 200)

    def test_rag_router_url_remains_resolvable(self):
        match = resolve("/api/assistant/rag/overview/")
        self.assertEqual(match.url_name, "rag-overview")


class BootstrapInternalControlsCommandTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.iso_framework = self.create_framework(Framework.FrameworkCode.ISO27001, "2022")
        self.iso_section = self.create_section(self.iso_framework, "A.5", "Organizational controls")
        self.iso_control = self.create_control(self.iso_framework, self.iso_section, "A.5.1")

        self.nist_framework = self.create_framework(Framework.FrameworkCode.NISTCSF, "2.0")
        self.nist_section = self.create_section(self.nist_framework, "GV", "Govern")
        self.nist_control = self.create_control(self.nist_framework, self.nist_section, "A.5.1")

    def test_bootstrap_internal_controls_creates_controls_and_mappings(self):
        output = StringIO()
        call_command("bootstrap_internal_controls", stdout=output)

        self.assertEqual(InternalControl.objects.count(), 2)
        self.assertEqual(InternalControlFrameworkMapping.objects.count(), 2)

        internal_control = InternalControl.objects.get(legacy_control=self.iso_control)
        self.assertEqual(internal_control.source, InternalControl.Source.MIGRATED)
        self.assertEqual(internal_control.status, InternalControl.Status.ACTIVE)
        self.assertEqual(internal_control.control_domain, "A.5 - Organizational controls")

        mapping = InternalControlFrameworkMapping.objects.get(framework_control=self.iso_control)
        self.assertEqual(mapping.mapping_source, InternalControlFrameworkMapping.MappingSource.MIGRATED)
        self.assertEqual(mapping.validation_status, InternalControlFrameworkMapping.ValidationStatus.APPROVED)
        self.assertEqual(mapping.relationship_type, InternalControlFrameworkMapping.RelationshipType.EQUIVALENT)
        self.assertEqual(mapping.coverage_percentage, Decimal("100.00"))
        self.assertEqual(mapping.confidence_score, Decimal("100.00"))
        self.assertEqual(
            mapping.rationale,
            "Migração inicial 1:1 a partir do modelo Control existente.",
        )
        self.assertIn("Bootstrap de InternalControl concluído.", output.getvalue())

    def test_bootstrap_internal_controls_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("bootstrap_internal_controls", stdout=first_output)
        call_command("bootstrap_internal_controls", stdout=second_output)

        self.assertEqual(InternalControl.objects.count(), 2)
        self.assertEqual(InternalControlFrameworkMapping.objects.count(), 2)
        self.assertIn("InternalControl já existentes: 2", second_output.getvalue())
        self.assertIn("Mappings já existentes: 2", second_output.getvalue())


class NormalizeInternalControlCatalogCommandTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.iso_framework = self.create_framework("ISO27002", "2022")
        self.iso_section = self.create_section(self.iso_framework, "A.5", "Organizational controls")
        self.iso_control = self.create_control(self.iso_framework, self.iso_section, "A.5.15")
        self.iso_control.title = "Controlo de acesso"
        self.iso_control.save(update_fields=["title", "updated_at"])

        self.nist_framework = self.create_framework(Framework.FrameworkCode.NISTCSF, "2.0")
        self.nist_section = self.create_section(self.nist_framework, "PR.AA", "Identity management")
        self.nist_control = self.create_control(self.nist_framework, self.nist_section, "PR.AA-01")
        self.nist_control.title = "Identities and credentials are managed"
        self.nist_control.save(update_fields=["title", "updated_at"])

    def test_normalize_internal_control_catalog_creates_canonical_mappings(self):
        call_command("bootstrap_internal_controls", stdout=StringIO())
        legacy_internal_control = InternalControl.objects.get(legacy_control=self.iso_control)
        policy = self.create_policy()
        mechanism = self.create_mechanism("MFA")
        PolicyInternalControl.objects.create(
            policy=policy,
            internal_control=legacy_internal_control,
            mapping_source=PolicyInternalControl.MappingSource.MIGRATED,
            validation_status=PolicyInternalControl.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        InternalControlMechanism.objects.create(
            internal_control=legacy_internal_control,
            mechanism=mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED,
            mapping_source=InternalControlMechanism.MappingSource.MIGRATED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
            confidence_score=100,
        )

        output = StringIO()
        call_command(
            "normalize_internal_control_catalog",
            "--approve",
            "--deprecate-legacy",
            stdout=output,
        )

        canonical = InternalControl.objects.get(code="IC-AC-001")
        self.assertEqual(canonical.source, InternalControl.Source.TEMPLATE)
        self.assertTrue(canonical.is_active)
        self.assertTrue(
            InternalControlFrameworkMapping.objects.filter(
                internal_control=canonical,
                framework_control=self.iso_control,
                mapping_source=InternalControlFrameworkMapping.MappingSource.RULE_BASED,
                validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            ).exists()
        )
        self.assertTrue(
            InternalControlFrameworkMapping.objects.filter(
                internal_control=canonical,
                framework_control=self.nist_control,
                mapping_source=InternalControlFrameworkMapping.MappingSource.RULE_BASED,
                validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            ).exists()
        )
        self.assertTrue(
            PolicyInternalControl.objects.filter(
                policy=policy,
                internal_control=canonical,
                mapping_source=PolicyInternalControl.MappingSource.RULE_BASED,
            ).exists()
        )
        self.assertTrue(
            InternalControlMechanism.objects.filter(
                internal_control=canonical,
                mechanism=mechanism,
                mapping_source=InternalControlMechanism.MappingSource.RULE_BASED,
            ).exists()
        )
        legacy_internal_control.refresh_from_db()
        self.assertFalse(legacy_internal_control.is_active)
        self.assertEqual(legacy_internal_control.status, InternalControl.Status.DEPRECATED)
        self.assertEqual(
            InternalControlFrameworkMapping.objects.filter(
                mapping_source=InternalControlFrameworkMapping.MappingSource.MIGRATED,
                validation_status=InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
            ).count(),
            2,
        )
        self.assertIn("Normalizacao do catalogo interno concluida.", output.getvalue())

    def test_normalize_internal_control_catalog_is_idempotent(self):
        call_command("bootstrap_internal_controls", stdout=StringIO())
        call_command(
            "normalize_internal_control_catalog",
            "--approve",
            "--deprecate-legacy",
            stdout=StringIO(),
        )
        first_counts = {
            "internal": InternalControl.objects.count(),
            "framework_mappings": InternalControlFrameworkMapping.objects.count(),
        }

        output = StringIO()
        call_command(
            "normalize_internal_control_catalog",
            "--approve",
            "--deprecate-legacy",
            stdout=output,
        )

        self.assertEqual(InternalControl.objects.count(), first_counts["internal"])
        self.assertEqual(
            InternalControlFrameworkMapping.objects.count(),
            first_counts["framework_mappings"],
        )
        self.assertIn("Mappings canonicos criados: 0", output.getvalue())


class PolicyInternalControlApiTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="policy-control-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)
        self.policy = self.create_policy()
        self.internal_control = self.create_internal_control()

    def test_create_policy_internal_control_manually(self):
        response = self.client.post(
            "/api/governance/policy-internal-controls/",
            {
                "policy": str(self.policy.id),
                "internal_control": str(self.internal_control.id),
                "applicability": PolicyInternalControl.Applicability.MANDATORY,
                "rationale": "Manual policy scoping.",
                "confidence_score": "75.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        link = PolicyInternalControl.objects.get()
        self.assertEqual(link.mapping_source, PolicyInternalControl.MappingSource.MANUAL)
        self.assertEqual(link.validation_status, PolicyInternalControl.ValidationStatus.DRAFT)
        self.assertEqual(link.created_by, self.user)

    def test_duplicate_policy_internal_control_is_blocked(self):
        PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PolicyInternalControl.objects.create(
                    policy=self.policy,
                    internal_control=self.internal_control,
                )

    def test_approve_policy_internal_control_sets_validator_and_timestamp(self):
        link = PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.PENDING_REVIEW,
        )

        response = self.client.post(
            f"/api/governance/policy-internal-controls/{link.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, PolicyInternalControl.ValidationStatus.APPROVED)
        self.assertEqual(link.validated_by, self.user)
        self.assertIsNotNone(link.validated_at)

    def test_reject_policy_internal_control_requires_and_stores_rationale(self):
        link = PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.PENDING_REVIEW,
        )

        missing_rationale = self.client.post(
            f"/api/governance/policy-internal-controls/{link.id}/reject/",
            {},
            format="json",
        )
        self.assertEqual(missing_rationale.status_code, 400)

        response = self.client.post(
            f"/api/governance/policy-internal-controls/{link.id}/reject/",
            {"rationale": "This internal control is outside the policy scope."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, PolicyInternalControl.ValidationStatus.REJECTED)
        self.assertEqual(link.rationale, "This internal control is outside the policy scope.")
        self.assertEqual(link.validated_by, self.user)
        self.assertIsNotNone(link.validated_at)

    def test_mark_policy_internal_control_as_deprecated(self):
        link = PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.APPROVED,
        )

        response = self.client.post(
            f"/api/governance/policy-internal-controls/{link.id}/mark-deprecated/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, PolicyInternalControl.ValidationStatus.DEPRECATED)
        self.assertFalse(link.is_active)

    def test_auxiliary_policy_and_internal_control_endpoints(self):
        PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
            validation_status=PolicyInternalControl.ValidationStatus.APPROVED,
        )

        policy_response = self.client.get(
            f"/api/governance/policies/{self.policy.id}/internal-controls/"
        )
        internal_control_response = self.client.get(
            f"/api/governance/internal-controls/{self.internal_control.id}/policies/"
        )

        self.assertEqual(policy_response.status_code, 200)
        self.assertEqual(internal_control_response.status_code, 200)
        self.assertEqual(len(policy_response.data), 1)
        self.assertEqual(len(internal_control_response.data), 1)

    def test_old_policy_control_endpoint_remains_available(self):
        PolicyControl.objects.create(
            policy=self.policy,
            control=self.control,
            rationale="Legacy policy control remains active.",
        )

        response = self.client.get("/api/governance/policy-controls/")

        self.assertEqual(response.status_code, 200)

    def test_risk_engine_import_remains_available(self):
        self.assertTrue(hasattr(RiskEngineService, "calculate_risk"))


class MigratePolicyInternalControlsCommandTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)
        self.policy = self.create_policy()
        self.policy_control = PolicyControl.objects.create(
            policy=self.policy,
            control=self.control,
            applicability=PolicyControl.Applicability.RECOMMENDED,
            rationale="Original policy rationale.",
        )
        self.internal_control = InternalControl.objects.create(
            code="IC-MIGRATED-001",
            title="Migrated internal control",
            description="Created as migration target.",
            control_domain="Governance",
            status=InternalControl.Status.ACTIVE,
            source=InternalControl.Source.MIGRATED,
            legacy_control=self.control,
        )
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            mapping_source=InternalControlFrameworkMapping.MappingSource.MIGRATED,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )

    def test_migrate_policy_internal_controls_creates_links_from_policy_control(self):
        output = StringIO()
        call_command("migrate_policy_internal_controls", stdout=output)

        self.assertEqual(PolicyInternalControl.objects.count(), 1)
        link = PolicyInternalControl.objects.get()
        self.assertEqual(link.policy, self.policy)
        self.assertEqual(link.internal_control, self.internal_control)
        self.assertEqual(link.applicability, PolicyControl.Applicability.RECOMMENDED)
        self.assertEqual(link.mapping_source, PolicyInternalControl.MappingSource.MIGRATED)
        self.assertEqual(link.validation_status, PolicyInternalControl.ValidationStatus.APPROVED)
        self.assertEqual(link.confidence_score, Decimal("100.00"))
        self.assertIn("Migra", link.rationale)
        self.assertIn("Original policy rationale.", link.rationale)
        self.assertIn("Associa", output.getvalue())

    def test_migrate_policy_internal_controls_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("migrate_policy_internal_controls", stdout=first_output)
        call_command("migrate_policy_internal_controls", stdout=second_output)

        self.assertEqual(PolicyInternalControl.objects.count(), 1)
        self.assertIn("existentes: 1", second_output.getvalue())

    def test_migrate_policy_internal_controls_uses_framework_mapping_fallback(self):
        self.internal_control.legacy_control = None
        self.internal_control.save(update_fields=["legacy_control"])

        output = StringIO()
        call_command("migrate_policy_internal_controls", stdout=output)

        self.assertEqual(PolicyInternalControl.objects.count(), 1)
        link = PolicyInternalControl.objects.get()
        self.assertEqual(link.internal_control, self.internal_control)
        self.assertIn("Warnings: 0", output.getvalue())


class InternalControlMechanismApiTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="mechanism-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)
        self.internal_control = self.create_internal_control()
        self.mechanism = self.create_mechanism()

    def test_create_internal_control_mechanism_manually(self):
        response = self.client.post(
            "/api/governance/internal-control-mechanisms/",
            {
                "internal_control": str(self.internal_control.id),
                "mechanism": str(self.mechanism.id),
                "contribution_weight": "80.00",
                "mandatory": True,
                "relationship_type": InternalControlMechanism.RelationshipType.PRIMARY,
                "rationale": "Primary implementation mechanism.",
                "confidence_score": "70.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        link = InternalControlMechanism.objects.get()
        self.assertEqual(link.mapping_source, InternalControlMechanism.MappingSource.MANUAL)
        self.assertEqual(link.validation_status, InternalControlMechanism.ValidationStatus.DRAFT)
        self.assertEqual(link.created_by, self.user)

    def test_duplicate_internal_control_mechanism_is_blocked(self):
        InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                InternalControlMechanism.objects.create(
                    internal_control=self.internal_control,
                    mechanism=self.mechanism,
                )

    def test_contribution_weight_must_be_between_zero_and_one_hundred(self):
        response = self.client.post(
            "/api/governance/internal-control-mechanisms/",
            {
                "internal_control": str(self.internal_control.id),
                "mechanism": str(self.mechanism.id),
                "contribution_weight": "101.00",
                "confidence_score": "70.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("contribution_weight", response.data)

    def test_internal_control_mechanism_confidence_must_be_between_zero_and_one_hundred(self):
        response = self.client.post(
            "/api/governance/internal-control-mechanisms/",
            {
                "internal_control": str(self.internal_control.id),
                "mechanism": str(self.mechanism.id),
                "contribution_weight": "80.00",
                "confidence_score": "-1.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("confidence_score", response.data)

    def test_approve_internal_control_mechanism_sets_validator_and_timestamp(self):
        link = InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.PENDING_REVIEW,
        )

        response = self.client.post(
            f"/api/governance/internal-control-mechanisms/{link.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, InternalControlMechanism.ValidationStatus.APPROVED)
        self.assertEqual(link.validated_by, self.user)
        self.assertIsNotNone(link.validated_at)

    def test_reject_internal_control_mechanism_requires_and_stores_rationale(self):
        link = InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.PENDING_REVIEW,
        )

        missing_rationale = self.client.post(
            f"/api/governance/internal-control-mechanisms/{link.id}/reject/",
            {},
            format="json",
        )
        self.assertEqual(missing_rationale.status_code, 400)

        response = self.client.post(
            f"/api/governance/internal-control-mechanisms/{link.id}/reject/",
            {"rationale": "Mechanism is not applicable to this control."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, InternalControlMechanism.ValidationStatus.REJECTED)
        self.assertEqual(link.rationale, "Mechanism is not applicable to this control.")
        self.assertEqual(link.validated_by, self.user)
        self.assertIsNotNone(link.validated_at)

    def test_mark_internal_control_mechanism_as_deprecated(self):
        link = InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )

        response = self.client.post(
            f"/api/governance/internal-control-mechanisms/{link.id}/mark-deprecated/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, InternalControlMechanism.ValidationStatus.DEPRECATED)
        self.assertFalse(link.is_active)

    def test_auxiliary_mechanism_and_framework_impact_endpoints(self):
        InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.internal_control,
            framework_control=self.control,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            coverage_percentage=100,
            confidence_score=100,
        )

        internal_control_response = self.client.get(
            f"/api/governance/internal-controls/{self.internal_control.id}/mechanisms/"
        )
        mechanism_response = self.client.get(
            f"/api/governance/mechanisms/{self.mechanism.id}/internal-controls/"
        )
        impact_response = self.client.get(
            f"/api/governance/internal-controls/{self.internal_control.id}/framework-impact/"
        )

        self.assertEqual(internal_control_response.status_code, 200)
        self.assertEqual(mechanism_response.status_code, 200)
        self.assertEqual(impact_response.status_code, 200)
        self.assertEqual(len(internal_control_response.data), 1)
        self.assertEqual(len(mechanism_response.data), 1)
        self.assertEqual(len(impact_response.data), 1)

    def test_implementation_readiness_recommends_status_from_task_progress(self):
        link = InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        GovernanceAction.objects.create(
            action_type=GovernanceAction.ActionType.IMPLEMENT_MECHANISM,
            title="Implement task",
            target_type="mechanism",
            target_id=str(self.mechanism.id),
            status=GovernanceAction.Status.DONE,
            priority=GovernanceAction.Priority.HIGH,
        )
        GovernanceAction.objects.create(
            action_type=GovernanceAction.ActionType.IMPLEMENT_MECHANISM,
            title="Validate task",
            target_type="mechanism",
            target_id=str(self.mechanism.id),
            status=GovernanceAction.Status.OPEN,
            priority=GovernanceAction.Priority.MEDIUM,
        )

        response = self.client.get(
            f"/api/governance/mechanisms/{self.mechanism.id}/implementation-readiness/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["recommended_status"],
            InternalControlMechanism.ImplementationStatus.PARTIALLY_IMPLEMENTED,
        )
        self.assertEqual(response.data["recommendation_source"], "governance_actions")
        self.assertTrue(response.data["requires_human_validation"])
        self.assertEqual(response.data["tasks"]["progress_percentage"], 50)
        link.refresh_from_db()
        self.assertEqual(link.implementation_status, InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED)

    def test_apply_implementation_recommendation_requires_human_confirmation(self):
        InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        GovernanceAction.objects.create(
            action_type=GovernanceAction.ActionType.IMPLEMENT_MECHANISM,
            title="Implemented task",
            target_type="mechanism",
            target_id=str(self.mechanism.id),
            status=GovernanceAction.Status.DONE,
            priority=GovernanceAction.Priority.HIGH,
        )

        response = self.client.post(
            f"/api/governance/mechanisms/{self.mechanism.id}/apply-implementation-recommendation/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        link = InternalControlMechanism.objects.get()
        self.assertEqual(link.implementation_status, InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED)

    def test_apply_implementation_recommendation_updates_after_human_confirmation(self):
        link = InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        GovernanceAction.objects.create(
            action_type=GovernanceAction.ActionType.IMPLEMENT_MECHANISM,
            title="Implemented task",
            target_type="mechanism",
            target_id=str(self.mechanism.id),
            status=GovernanceAction.Status.DONE,
            priority=GovernanceAction.Priority.HIGH,
        )

        response = self.client.post(
            f"/api/governance/mechanisms/{self.mechanism.id}/apply-implementation-recommendation/",
            {
                "confirmed_human_validation": True,
                "rationale": "Validado pelo CISO a partir das tarefas concluidas.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["updated"], 1)
        link.refresh_from_db()
        self.assertEqual(link.implementation_status, InternalControlMechanism.ImplementationStatus.IMPLEMENTED)
        self.assertIn("Validado pelo CISO", link.rationale)

    def test_old_control_mechanism_endpoint_remains_available(self):
        ControlMechanism.objects.create(
            control=self.control,
            mechanism=self.mechanism,
        )

        response = self.client.get("/api/governance/control-mechanisms/")

        self.assertEqual(response.status_code, 200)

    def test_rag_router_url_remains_resolvable_for_mechanism_phase(self):
        match = resolve("/api/assistant/rag/overview/")
        self.assertEqual(match.url_name, "rag-overview")

    def test_risk_engine_import_remains_available_for_mechanism_phase(self):
        self.assertTrue(hasattr(RiskEngineService, "calculate_risk"))


class MigrateInternalControlMechanismsCommandTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)
        self.mechanism = self.create_mechanism("MFA")
        self.control_mechanism = ControlMechanism.objects.create(
            control=self.control,
            mechanism=self.mechanism,
            status=ControlMechanism.ImplementationStatus.IMPLEMENTED,
            responsible="Security team",
            acceptance_criteria="MFA enabled for privileged access.",
        )
        self.internal_control = InternalControl.objects.create(
            code="IC-MECH-001",
            title="Internal mechanism control",
            description="Created as migration target.",
            control_domain="Governance",
            status=InternalControl.Status.ACTIVE,
            source=InternalControl.Source.MIGRATED,
            legacy_control=self.control,
        )
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            mapping_source=InternalControlFrameworkMapping.MappingSource.MIGRATED,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )

    def test_migrate_internal_control_mechanisms_creates_links_from_control_mechanism(self):
        output = StringIO()
        call_command("migrate_internal_control_mechanisms", stdout=output)

        self.assertEqual(InternalControlMechanism.objects.count(), 1)
        link = InternalControlMechanism.objects.get()
        self.assertEqual(link.internal_control, self.internal_control)
        self.assertEqual(link.mechanism, self.mechanism)
        self.assertEqual(link.contribution_weight, Decimal("100.00"))
        self.assertFalse(link.mandatory)
        self.assertEqual(link.relationship_type, InternalControlMechanism.RelationshipType.SUPPORTING)
        self.assertEqual(link.mapping_source, InternalControlMechanism.MappingSource.MIGRATED)
        self.assertEqual(link.validation_status, InternalControlMechanism.ValidationStatus.APPROVED)
        self.assertEqual(link.confidence_score, Decimal("100.00"))
        self.assertIn("Migra", link.rationale)
        self.assertIn("MFA enabled for privileged access.", link.rationale)
        self.assertIn("Associa", output.getvalue())

    def test_migrate_internal_control_mechanisms_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("migrate_internal_control_mechanisms", stdout=first_output)
        call_command("migrate_internal_control_mechanisms", stdout=second_output)

        self.assertEqual(InternalControlMechanism.objects.count(), 1)
        self.assertIn("existentes: 1", second_output.getvalue())

    def test_migrate_internal_control_mechanisms_uses_framework_mapping_fallback(self):
        self.internal_control.legacy_control = None
        self.internal_control.save(update_fields=["legacy_control"])

        output = StringIO()
        call_command("migrate_internal_control_mechanisms", stdout=output)

        self.assertEqual(InternalControlMechanism.objects.count(), 1)
        link = InternalControlMechanism.objects.get()
        self.assertEqual(link.internal_control, self.internal_control)
        self.assertIn("Warnings: 0", output.getvalue())


class GovernanceDocumentApiTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="document-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.internal_control = self.create_internal_control()
        self.document = self.create_governance_document()

    def test_create_governance_document_manually(self):
        response = self.client.post(
            "/api/governance/governance-documents/",
            {
                "title": "Access Control Policy",
                "document_type": GovernanceDocument.DocumentType.POLICY,
                "version": "1.0",
                "status": GovernanceDocument.Status.DRAFT,
                "owner": "CISO",
                "scope": "All users",
                "purpose": "Define access control governance.",
                "content": "Policy content.",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(GovernanceDocument.objects.filter(title="Access Control Policy").exists())

    def test_create_governance_document_hierarchy(self):
        standard = GovernanceDocument.objects.create(
            title="Access Control Standard",
            document_type=GovernanceDocument.DocumentType.STANDARD,
            parent_document=self.document,
        )

        self.assertEqual(standard.parent_document, self.document)
        self.assertEqual(self.document.children.count(), 1)

    def test_create_governance_document_control_manually(self):
        response = self.client.post(
            "/api/governance/governance-document-controls/",
            {
                "document": str(self.document.id),
                "internal_control": str(self.internal_control.id),
                "purpose": GovernanceDocumentControl.Purpose.DEFINES,
                "rationale": "Document defines this internal control.",
                "confidence_score": "80.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        link = GovernanceDocumentControl.objects.get()
        self.assertEqual(link.mapping_source, GovernanceDocumentControl.MappingSource.MANUAL)
        self.assertEqual(link.validation_status, GovernanceDocumentControl.ValidationStatus.DRAFT)
        self.assertEqual(link.created_by, self.user)

    def test_duplicate_governance_document_control_is_blocked(self):
        GovernanceDocumentControl.objects.create(
            document=self.document,
            internal_control=self.internal_control,
            purpose=GovernanceDocumentControl.Purpose.DEFINES,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GovernanceDocumentControl.objects.create(
                    document=self.document,
                    internal_control=self.internal_control,
                    purpose=GovernanceDocumentControl.Purpose.DEFINES,
                )

    def test_approve_governance_document_control_sets_validator_and_timestamp(self):
        link = GovernanceDocumentControl.objects.create(
            document=self.document,
            internal_control=self.internal_control,
            validation_status=GovernanceDocumentControl.ValidationStatus.PENDING_REVIEW,
        )

        response = self.client.post(
            f"/api/governance/governance-document-controls/{link.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, GovernanceDocumentControl.ValidationStatus.APPROVED)
        self.assertEqual(link.validated_by, self.user)
        self.assertIsNotNone(link.validated_at)

    def test_reject_governance_document_control_requires_rationale(self):
        link = GovernanceDocumentControl.objects.create(
            document=self.document,
            internal_control=self.internal_control,
            validation_status=GovernanceDocumentControl.ValidationStatus.PENDING_REVIEW,
        )

        missing_rationale = self.client.post(
            f"/api/governance/governance-document-controls/{link.id}/reject/",
            {},
            format="json",
        )
        self.assertEqual(missing_rationale.status_code, 400)

        response = self.client.post(
            f"/api/governance/governance-document-controls/{link.id}/reject/",
            {"rationale": "The document does not govern this control."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, GovernanceDocumentControl.ValidationStatus.REJECTED)
        self.assertEqual(link.rationale, "The document does not govern this control.")

    def test_mark_governance_document_control_as_deprecated(self):
        link = GovernanceDocumentControl.objects.create(
            document=self.document,
            internal_control=self.internal_control,
            validation_status=GovernanceDocumentControl.ValidationStatus.APPROVED,
        )

        response = self.client.post(
            f"/api/governance/governance-document-controls/{link.id}/mark-deprecated/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, GovernanceDocumentControl.ValidationStatus.DEPRECATED)

    def test_create_governance_document_section(self):
        response = self.client.post(
            "/api/governance/governance-document-sections/",
            {
                "document": str(self.document.id),
                "section_number": "1",
                "title": "Purpose",
                "content": "Section content.",
                "order": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(GovernanceDocumentSection.objects.filter(title="Purpose").exists())

    def test_runbook_step_only_accepts_runbook_document(self):
        runbook = self.create_governance_document(
            title="Incident Response Runbook",
            document_type=GovernanceDocument.DocumentType.RUNBOOK,
        )
        valid_response = self.client.post(
            "/api/governance/runbook-steps/",
            {
                "runbook": str(runbook.id),
                "step_number": 1,
                "title": "Collect logs",
                "description": "Collect endpoint and identity logs.",
                "expected_output": "Logs attached to the incident record.",
                "evidence_required": True,
            },
            format="json",
        )
        invalid_response = self.client.post(
            "/api/governance/runbook-steps/",
            {
                "runbook": str(self.document.id),
                "step_number": 1,
                "title": "Invalid step",
                "description": "This should fail.",
            },
            format="json",
        )

        self.assertEqual(valid_response.status_code, 201)
        self.assertEqual(invalid_response.status_code, 400)
        self.assertEqual(RunbookStep.objects.count(), 1)

    def test_governance_document_auxiliary_endpoints(self):
        GovernanceDocumentControl.objects.create(
            document=self.document,
            internal_control=self.internal_control,
            validation_status=GovernanceDocumentControl.ValidationStatus.APPROVED,
        )
        child = GovernanceDocument.objects.create(
            title="Child procedure",
            document_type=GovernanceDocument.DocumentType.PROCEDURE,
            parent_document=self.document,
        )
        GovernanceDocumentSection.objects.create(document=self.document, title="Scope", order=1)
        runbook = self.create_governance_document(
            title="Auxiliary runbook",
            document_type=GovernanceDocument.DocumentType.RUNBOOK,
        )
        RunbookStep.objects.create(runbook=runbook, step_number=1, title="Step one")

        controls_response = self.client.get(
            f"/api/governance/governance-documents/{self.document.id}/internal-controls/"
        )
        internal_docs_response = self.client.get(
            f"/api/governance/internal-controls/{self.internal_control.id}/governance-documents/"
        )
        children_response = self.client.get(
            f"/api/governance/governance-documents/{self.document.id}/children/"
        )
        sections_response = self.client.get(
            f"/api/governance/governance-documents/{self.document.id}/sections/"
        )
        steps_response = self.client.get(
            f"/api/governance/governance-documents/{runbook.id}/runbook-steps/"
        )

        self.assertEqual(controls_response.status_code, 200)
        self.assertEqual(internal_docs_response.status_code, 200)
        self.assertEqual(children_response.status_code, 200)
        self.assertEqual(sections_response.status_code, 200)
        self.assertEqual(steps_response.status_code, 200)
        self.assertEqual(children_response.data[0]["id"], str(child.id))


class GovernanceDocumentMigrationCommandTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.policy = self.create_policy()
        self.internal_control = self.create_internal_control()
        self.policy_internal_control = PolicyInternalControl.objects.create(
            policy=self.policy,
            internal_control=self.internal_control,
            mapping_source=PolicyInternalControl.MappingSource.MIGRATED,
            validation_status=PolicyInternalControl.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        self.parent_section = PolicySection.objects.create(
            policy=self.policy,
            title="Governance",
            content="Governance content",
            order=1,
        )
        self.child_section = PolicySection.objects.create(
            policy=self.policy,
            parent=self.parent_section,
            title="Responsibilities",
            content="Responsibilities content",
            order=2,
        )

    def test_bootstrap_governance_documents_creates_policy_documents(self):
        output = StringIO()
        call_command("bootstrap_governance_documents", stdout=output)

        self.assertEqual(GovernanceDocument.objects.filter(legacy_policy=self.policy).count(), 1)
        document = GovernanceDocument.objects.get(legacy_policy=self.policy)
        self.assertEqual(document.document_type, GovernanceDocument.DocumentType.POLICY)
        self.assertEqual(document.title, self.policy.title)
        self.assertIn("Policy documents criados: 1", output.getvalue())

    def test_bootstrap_governance_documents_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("bootstrap_governance_documents", stdout=first_output)
        call_command("bootstrap_governance_documents", stdout=second_output)

        self.assertEqual(GovernanceDocument.objects.filter(legacy_policy=self.policy).count(), 1)
        self.assertIn("Policy documents já existentes: 1", second_output.getvalue())

    def test_migrate_policy_sections_to_governance_sections_is_idempotent(self):
        call_command("bootstrap_governance_documents", stdout=StringIO())
        first_output = StringIO()
        second_output = StringIO()

        call_command("migrate_policy_sections_to_governance_sections", stdout=first_output)
        call_command("migrate_policy_sections_to_governance_sections", stdout=second_output)

        self.assertEqual(GovernanceDocumentSection.objects.count(), 2)
        migrated_child = GovernanceDocumentSection.objects.get(title="Responsibilities")
        self.assertEqual(migrated_child.parent_section.title, "Governance")
        self.assertIn("Secções já existentes: 2", second_output.getvalue())

    def test_migrate_policy_internal_controls_to_document_controls_creates_links(self):
        call_command("bootstrap_governance_documents", stdout=StringIO())
        output = StringIO()

        call_command("migrate_policy_internal_controls_to_document_controls", stdout=output)

        self.assertEqual(GovernanceDocumentControl.objects.count(), 1)
        link = GovernanceDocumentControl.objects.get()
        self.assertEqual(link.document.legacy_policy, self.policy)
        self.assertEqual(link.internal_control, self.internal_control)
        self.assertEqual(link.purpose, GovernanceDocumentControl.Purpose.DEFINES)
        self.assertEqual(link.mapping_source, GovernanceDocumentControl.MappingSource.MIGRATED)
        self.assertEqual(link.validation_status, GovernanceDocumentControl.ValidationStatus.APPROVED)
        self.assertEqual(link.confidence_score, Decimal("100.00"))
        self.assertEqual(
            link.rationale,
            "Migração inicial a partir de PolicyInternalControl existente.",
        )
        self.assertIn("Associações criadas: 1", output.getvalue())

    def test_legacy_document_endpoints_remain_available(self):
        user = get_user_model().objects.create_user(username="legacy-doc-user", password="change-me")
        client = APIClient()
        client.force_authenticate(user=user)

        policies_response = client.get("/api/governance/policies/")
        regulations_response = client.get("/api/governance/technical-regulations/")
        procedures_response = client.get("/api/governance/procedures/")

        self.assertEqual(policies_response.status_code, 200)
        self.assertEqual(regulations_response.status_code, 200)
        self.assertEqual(procedures_response.status_code, 200)

    def test_rag_router_and_risk_engine_remain_available_for_document_phase(self):
        match = resolve("/api/assistant/rag/overview/")

        self.assertEqual(match.url_name, "rag-overview")
        self.assertTrue(hasattr(RiskEngineService, "calculate_risk"))


class EvidenceItemApiTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="evidence-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)
        self.internal_control = InternalControl.objects.create(
            code="IC-EVID-001",
            title="Evidence internal control",
            description="Control used by evidence tests.",
            status=InternalControl.Status.ACTIVE,
            source=InternalControl.Source.MIGRATED,
            legacy_control=self.control,
        )
        self.mechanism = self.create_mechanism("Evidence mechanism")
        self.document = self.create_governance_document("Evidence policy")

    def test_create_evidence_item_manually(self):
        response = self.client.post(
            "/api/governance/evidence-items/",
            {
                "title": "Quarterly audit report",
                "description": "Audit report uploaded once and reused.",
                "evidence_type": EvidenceItem.EvidenceType.AUDIT_REPORT,
                "source": "manual",
                "external_reference": "AUD-001",
                "confidence_level": "90.00",
                "status": EvidenceItem.Status.VALID,
                "owner": "Security team",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(EvidenceItem.objects.filter(title="Quarterly audit report").exists())

    def test_upload_evidence_item_stores_auditable_file_metadata(self):
        content = b"mfa enabled for all privileged accounts\n"
        upload = SimpleUploadedFile(
            "mfa-audit.txt",
            content,
            content_type="text/plain",
        )

        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                response = self.client.post(
                    "/api/governance/evidence-items/",
                    {
                        "title": "MFA audit export",
                        "description": "Audit artefact with physical evidence.",
                        "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
                        "source": "IAM",
                        "confidence_level": "95.00",
                        "status": EvidenceItem.Status.VALID,
                        "owner": "Security team",
                        "file": upload,
                    },
                    format="multipart",
                )

        self.assertEqual(response.status_code, 201)
        self.assertIn("/media/evidence_items/", response.data["file"])
        self.assertEqual(response.data["original_filename"], "mfa-audit.txt")
        self.assertEqual(response.data["file_size"], len(content))
        self.assertEqual(response.data["mime_type"], "text/plain")
        self.assertEqual(response.data["sha256_hash"], hashlib.sha256(content).hexdigest())
        self.assertEqual(response.data["uploaded_by"], self.user.id)
        self.assertEqual(response.data["uploaded_by_username"], self.user.get_username())

        evidence = EvidenceItem.objects.get(title="MFA audit export")
        self.assertTrue(evidence.file.name.startswith("evidence_items/"))

    def test_evidence_item_confidence_level_must_be_between_zero_and_one_hundred(self):
        response = self.client.post(
            "/api/governance/evidence-items/",
            {
                "title": "Invalid confidence",
                "evidence_type": EvidenceItem.EvidenceType.REPORT,
                "confidence_level": "101.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("confidence_level", response.data)

    def test_create_evidence_link_manually_for_mechanism(self):
        evidence_item = self.create_evidence_item()

        response = self.client.post(
            "/api/governance/evidence-links/",
            {
                "evidence_item": str(evidence_item.id),
                "target_type": EvidenceLink.TargetType.MECHANISM,
                "target_id": str(self.mechanism.id),
                "link_type": EvidenceLink.LinkType.EVIDENCES,
                "rationale": "Evidence demonstrates mechanism operation.",
                "confidence_score": "85.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        link = EvidenceLink.objects.get()
        self.assertEqual(link.mapping_source, EvidenceLink.MappingSource.MANUAL)
        self.assertEqual(link.validation_status, EvidenceLink.ValidationStatus.DRAFT)
        self.assertEqual(link.created_by, self.user)

    def test_create_evidence_link_manually_for_internal_control(self):
        evidence_item = self.create_evidence_item()

        response = self.client.post(
            "/api/governance/evidence-links/",
            {
                "evidence_item": str(evidence_item.id),
                "target_type": EvidenceLink.TargetType.INTERNAL_CONTROL,
                "target_id": str(self.internal_control.id),
                "link_type": EvidenceLink.LinkType.SUPPORTS,
                "confidence_score": "75.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(EvidenceLink.objects.filter(target_type=EvidenceLink.TargetType.INTERNAL_CONTROL).count(), 1)

    def test_duplicate_evidence_link_is_blocked(self):
        evidence_item = self.create_evidence_item()
        EvidenceLink.objects.create(
            evidence_item=evidence_item,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=self.mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                EvidenceLink.objects.create(
                    evidence_item=evidence_item,
                    target_type=EvidenceLink.TargetType.MECHANISM,
                    target_id=self.mechanism.id,
                    link_type=EvidenceLink.LinkType.EVIDENCES,
                )

    def test_approve_evidence_link_sets_validator_and_timestamp(self):
        evidence_item = self.create_evidence_item()
        link = EvidenceLink.objects.create(
            evidence_item=evidence_item,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=self.mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.PENDING_REVIEW,
        )

        response = self.client.post(
            f"/api/governance/evidence-links/{link.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, EvidenceLink.ValidationStatus.APPROVED)
        self.assertEqual(link.validated_by, self.user)
        self.assertIsNotNone(link.validated_at)

    def test_reject_evidence_link_requires_rationale(self):
        evidence_item = self.create_evidence_item()
        link = EvidenceLink.objects.create(
            evidence_item=evidence_item,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=self.mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.PENDING_REVIEW,
        )

        missing_rationale = self.client.post(
            f"/api/governance/evidence-links/{link.id}/reject/",
            {},
            format="json",
        )
        self.assertEqual(missing_rationale.status_code, 400)

        response = self.client.post(
            f"/api/governance/evidence-links/{link.id}/reject/",
            {"rationale": "Evidence does not support this mechanism."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, EvidenceLink.ValidationStatus.REJECTED)
        self.assertEqual(link.rationale, "Evidence does not support this mechanism.")

    def test_mark_evidence_link_as_deprecated(self):
        evidence_item = self.create_evidence_item()
        link = EvidenceLink.objects.create(
            evidence_item=evidence_item,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=self.mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.APPROVED,
        )

        response = self.client.post(
            f"/api/governance/evidence-links/{link.id}/mark-deprecated/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, EvidenceLink.ValidationStatus.DEPRECATED)

    def test_expired_evidence_item_is_identified(self):
        evidence_item = EvidenceItem.objects.create(
            title="Expired evidence",
            evidence_type=EvidenceItem.EvidenceType.REPORT,
            valid_until=timezone.localdate() - timedelta(days=1),
            confidence_level=100,
            status=EvidenceItem.Status.VALID,
        )

        self.assertTrue(evidence_item.is_expired)
        self.assertFalse(evidence_item.is_score_eligible)

    def test_rejected_evidence_link_does_not_appear_as_active(self):
        evidence_item = self.create_evidence_item()
        EvidenceLink.objects.create(
            evidence_item=evidence_item,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=self.mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.REJECTED,
        )

        response = self.client.get(f"/api/governance/mechanisms/{self.mechanism.id}/evidence/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_evidence_impact_shows_mechanisms_internal_controls_and_frameworks(self):
        evidence_item = self.create_evidence_item()
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            mapping_source=InternalControlFrameworkMapping.MappingSource.MIGRATED,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        EvidenceLink.objects.create(
            evidence_item=evidence_item,
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=self.mechanism.id,
            link_type=EvidenceLink.LinkType.EVIDENCES,
            validation_status=EvidenceLink.ValidationStatus.APPROVED,
        )

        response = self.client.get(f"/api/governance/evidence-items/{evidence_item.id}/impact/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["mechanisms"]), 1)
        self.assertEqual(len(response.data["internal_controls"]), 1)
        self.assertEqual(len(response.data["frameworks"]), 1)

    def test_legacy_evidence_endpoints_remain_available(self):
        responses = [
            self.client.get("/api/governance/assessment-evidence/"),
            self.client.get("/api/governance/policy-evidences/"),
            self.client.get("/api/governance/mechanism-evidences/"),
        ]

        self.assertTrue(all(response.status_code == 200 for response in responses))

    def test_rag_router_and_risk_engine_remain_available_for_evidence_phase(self):
        match = resolve("/api/assistant/rag/overview/")

        self.assertEqual(match.url_name, "rag-overview")
        self.assertTrue(hasattr(RiskEngineService, "calculate_risk"))


class MechanismEvidenceRequirementApiTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="requirement-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.mechanism = self.create_mechanism("MFA para acessos remotos")

    def test_create_mechanism_evidence_requirement(self):
        response = self.client.post(
            "/api/governance/mechanism-evidence-requirements/",
            {
                "title": "Exportacao de configuracao MFA",
                "description": "Export tecnico que demonstra MFA ativo.",
                "evidence_type": EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
                "mechanism": str(self.mechanism.id),
                "keywords": ["mfa", "acesso"],
                "priority": MechanismEvidenceRequirement.Priority.HIGH,
                "source": MechanismEvidenceRequirement.Source.MANUAL,
                "rationale": "Comprova que o mecanismo foi configurado.",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(MechanismEvidenceRequirement.objects.count(), 1)

    def test_suggest_requirements_for_mechanism_uses_keywords(self):
        MechanismEvidenceRequirement.objects.create(
            title="Exportacao de configuracao MFA",
            description="Export tecnico que demonstra MFA ativo.",
            evidence_type=EvidenceItem.EvidenceType.CONFIGURATION_EXPORT,
            keywords=["mfa", "autenticacao"],
            priority=MechanismEvidenceRequirement.Priority.HIGH,
        )
        MechanismEvidenceRequirement.objects.create(
            title="Relatorio de scan de vulnerabilidades",
            evidence_type=EvidenceItem.EvidenceType.VULNERABILITY_SCAN,
            keywords=["vulnerab"],
            priority=MechanismEvidenceRequirement.Priority.HIGH,
        )

        response = self.client.get(
            f"/api/governance/mechanism-evidence-requirements/suggest/?mechanism={self.mechanism.id}"
        )

        self.assertEqual(response.status_code, 200)
        titles = {item["title"] for item in response.data}
        self.assertIn("Exportacao de configuracao MFA", titles)
        self.assertNotIn("Relatorio de scan de vulnerabilidades", titles)

    def test_seed_mechanism_evidence_requirements_is_idempotent(self):
        call_command("seed_mechanism_evidence_requirements", stdout=StringIO())
        first_count = MechanismEvidenceRequirement.objects.count()

        call_command("seed_mechanism_evidence_requirements", stdout=StringIO())
        second_count = MechanismEvidenceRequirement.objects.count()

        self.assertGreater(first_count, 0)
        self.assertEqual(first_count, second_count)


class EvidenceMigrationCommandTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.framework = self.create_framework()
        self.section = self.create_section(self.framework)
        self.control = self.create_control(self.framework, self.section)
        self.internal_control = InternalControl.objects.create(
            code="IC-EVID-MIG-001",
            title="Evidence migration internal control",
            status=InternalControl.Status.ACTIVE,
            source=InternalControl.Source.MIGRATED,
            legacy_control=self.control,
        )
        InternalControlFrameworkMapping.objects.create(
            internal_control=self.internal_control,
            framework_control=self.control,
            relationship_type=InternalControlFrameworkMapping.RelationshipType.EQUIVALENT,
            coverage_percentage=100,
            mapping_source=InternalControlFrameworkMapping.MappingSource.MIGRATED,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            confidence_score=100,
        )
        self.assessment = self.create_assessment(self.control)
        self.assessment_evidence = Evidence.objects.create(
            assessment=self.assessment,
            evidence_type=Evidence.EvidenceType.LOG,
            title="Assessment log evidence",
            uri="https://example.test/log",
            collected_at=timezone.now(),
        )
        self.mechanism = self.create_mechanism("Evidence migration mechanism")
        self.control_mechanism = ControlMechanism.objects.create(
            control=self.control,
            mechanism=self.mechanism,
        )
        self.mechanism_evidence = MechanismEvidence.objects.create(
            control_mechanism=self.control_mechanism,
            title="Mechanism evidence",
            description="Mechanism evidence description",
            url="https://example.test/mechanism",
        )
        self.policy = self.create_policy()
        self.policy_control = PolicyControl.objects.create(policy=self.policy, control=self.control)
        self.implementation_mechanism = ImplementationMechanism.objects.create(
            policy_control=self.policy_control,
            name="Policy implementation mechanism",
        )
        self.policy_evidence = PolicyEvidence.objects.create(
            mechanism=self.implementation_mechanism,
            title="Policy evidence",
            evidence_type=PolicyEvidence.EvidenceType.REPORT,
            description="Policy evidence description",
            status=PolicyEvidence.Status.VALID,
        )
        self.document = GovernanceDocument.objects.create(
            title="Policy governance document",
            document_type=GovernanceDocument.DocumentType.POLICY,
            legacy_policy=self.policy,
        )

    def test_bootstrap_evidence_items_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("bootstrap_evidence_items", stdout=first_output)
        call_command("bootstrap_evidence_items", stdout=second_output)

        self.assertEqual(EvidenceItem.objects.filter(legacy_evidence=self.assessment_evidence).count(), 1)
        self.assertIn("EvidenceItem já existentes: 1", second_output.getvalue())

    def test_migrate_mechanism_evidence_to_evidence_links_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("migrate_mechanism_evidence_to_evidence_links", stdout=first_output)
        call_command("migrate_mechanism_evidence_to_evidence_links", stdout=second_output)

        self.assertEqual(EvidenceItem.objects.filter(source=f"legacy_mechanism_evidence:{self.mechanism_evidence.id}").count(), 1)
        self.assertEqual(EvidenceLink.objects.filter(target_type=EvidenceLink.TargetType.MECHANISM).count(), 1)
        self.assertIn("EvidenceLink já existentes: 1", second_output.getvalue())

    def test_migrate_policy_evidence_to_evidence_links_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("migrate_policy_evidence_to_evidence_links", stdout=first_output)
        call_command("migrate_policy_evidence_to_evidence_links", stdout=second_output)

        self.assertEqual(EvidenceItem.objects.filter(source=f"legacy_policy_evidence:{self.policy_evidence.id}").count(), 1)
        self.assertEqual(EvidenceLink.objects.filter(target_type=EvidenceLink.TargetType.POLICY).count(), 1)
        self.assertEqual(EvidenceLink.objects.filter(target_type=EvidenceLink.TargetType.GOVERNANCE_DOCUMENT).count(), 1)
        self.assertIn("Policy EvidenceLink já existentes: 1", second_output.getvalue())

    def test_migrate_assessment_evidence_to_evidence_links_is_idempotent(self):
        first_output = StringIO()
        second_output = StringIO()

        call_command("migrate_assessment_evidence_to_evidence_links", stdout=first_output)
        call_command("migrate_assessment_evidence_to_evidence_links", stdout=second_output)

        self.assertEqual(EvidenceItem.objects.filter(legacy_evidence=self.assessment_evidence).count(), 1)
        self.assertEqual(EvidenceLink.objects.filter(target_type=EvidenceLink.TargetType.FRAMEWORK_CONTROL).count(), 1)
        self.assertEqual(EvidenceLink.objects.filter(target_type=EvidenceLink.TargetType.INTERNAL_CONTROL).count(), 1)
        self.assertIn("FrameworkControl EvidenceLink já existentes: 1", second_output.getvalue())


class GovernanceActionOnboardingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="onboarding-action-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.profile = CompanyProfile.objects.create(
            legal_name="Municipio Teste",
            onboarding_answers={
                "entity_category": "Important",
                "cybersecurity_responsible_name": "CISO Teste",
                "dl125_obligations_snapshot": [
                    "Responsavel de ciberseguranca e ponto de contacto permanente.",
                    "Processo de notificacao de incidentes significativos.",
                ],
            },
            onboarding_recommended_actions=[
                {
                    "id": "responsible_contact",
                    "title": "Designar responsavel e ponto de contacto",
                    "detail": "Formalizar responsavel de ciberseguranca e contacto permanente.",
                    "path": "/governance/responsibilities",
                    "priority": "high",
                },
                {
                    "id": "evidence_register",
                    "title": "Recolher evidencias reais",
                    "detail": "Associar evidencias reais a mecanismos e controlos.",
                    "path": "/governance/evidence",
                    "priority": "medium",
                },
                {
                    "id": "workbench",
                    "title": "Abrir Governance Workbench",
                    "detail": "Acompanhar gaps.",
                    "path": "/governance/workbench",
                    "priority": "medium",
                },
            ],
        )

    def test_generate_from_onboarding_creates_formal_actions(self):
        result = GovernanceActionPlanService.generate_from_onboarding(
            self.profile,
            user=self.user,
        )

        self.assertEqual(result["created"], 2)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(GovernanceAction.objects.count(), 2)
        action = GovernanceAction.objects.get(source_key="institutional_onboarding:responsible_contact")
        self.assertEqual(action.source_type, GovernanceAction.SourceType.ONBOARDING)
        self.assertEqual(action.owner, "CISO Teste")
        self.assertEqual(action.priority, GovernanceAction.Priority.HIGH)
        self.assertEqual(action.target_type, "institutional_onboarding")
        self.assertTrue(action.evidence_required)
        self.assertIn("Onboarding institucional", action.notes)

    def test_generate_from_onboarding_is_idempotent(self):
        GovernanceActionPlanService.generate_from_onboarding(self.profile, user=self.user)
        second = GovernanceActionPlanService.generate_from_onboarding(self.profile, user=self.user)

        self.assertEqual(second["created"], 0)
        self.assertEqual(second["updated"], 2)
        self.assertEqual(GovernanceAction.objects.count(), 2)

    def test_generate_from_onboarding_respects_selected_action_ids(self):
        result = GovernanceActionPlanService.generate_from_onboarding(
            self.profile,
            user=self.user,
            selected_action_ids=["evidence_register"],
        )

        self.assertEqual(result["created"], 1)
        self.assertEqual(result["skipped"], 2)
        self.assertTrue(
            GovernanceAction.objects.filter(source_key="institutional_onboarding:evidence_register").exists()
        )
        self.assertFalse(
            GovernanceAction.objects.filter(source_key="institutional_onboarding:responsible_contact").exists()
        )

    def test_generate_from_onboarding_endpoint(self):
        response = self.client.post(
            "/api/governance/governance-actions/generate-from-onboarding/",
            {"owner": "Responsavel designado", "action_ids": ["evidence_register"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["created"], 1)
        action = GovernanceAction.objects.get(source_key="institutional_onboarding:evidence_register")
        self.assertEqual(action.source_type, GovernanceAction.SourceType.ONBOARDING)
        self.assertEqual(action.action_type, GovernanceAction.ActionType.COLLECT_EVIDENCE)
        self.assertEqual(action.owner, "Responsavel designado")

    def test_partial_update_due_date_does_not_require_status(self):
        action = GovernanceAction.objects.create(
            action_type=GovernanceAction.ActionType.IMPLEMENT_MECHANISM,
            title="Definir ambito de implementacao",
            source_type=GovernanceAction.SourceType.WORKBENCH,
            source_key="mechanism:nda:scope",
            status=GovernanceAction.Status.CANCELLED,
            due_date=timezone.localdate(),
        )
        new_due_date = timezone.localdate() + timedelta(days=14)

        response = self.client.patch(
            f"/api/governance/governance-actions/{action.id}/",
            {"due_date": new_due_date.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        action.refresh_from_db()
        self.assertEqual(action.due_date, new_due_date)
        self.assertEqual(action.status, GovernanceAction.Status.CANCELLED)

    def test_duplicate_active_source_key_is_blocked_by_serializer(self):
        GovernanceAction.objects.create(
            title="Acao ativa",
            source_type=GovernanceAction.SourceType.WORKBENCH,
            source_key="mechanism:duplicate",
            status=GovernanceAction.Status.OPEN,
        )

        response = self.client.post(
            "/api/governance/governance-actions/",
            {
                "title": "Acao duplicada",
                "source_type": GovernanceAction.SourceType.WORKBENCH,
                "source_key": "mechanism:duplicate",
                "status": GovernanceAction.Status.IN_PROGRESS,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("source_key", response.data)


class GovernanceRiskLinkApiTests(GovernanceTestDataMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="risk-link-tester",
            password="change-me",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.internal_control = self.create_internal_control("IC-RISK-001")
        self.mechanism = self.create_mechanism("Risk mitigation mechanism")
        self.internal_control_mechanism = InternalControlMechanism.objects.create(
            internal_control=self.internal_control,
            mechanism=self.mechanism,
            implementation_status=InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED,
            validation_status=InternalControlMechanism.ValidationStatus.APPROVED,
        )
        self.asset = Asset.objects.create(name="Core ERP")
        self.vulnerability = Vulnerability.objects.create(
            cve_id="CVE-2099-0001",
            severity="High",
            cvss_score=Decimal("8.0"),
            description="Test vulnerability",
        )
        self.risk = Risk.objects.create(
            asset=self.asset,
            vulnerability=self.vulnerability,
            risk_score=80,
            likelihood=4,
            impact=5,
            risk_level=Risk.RiskLevel.HIGH,
        )

    def test_create_governance_risk_link_manually(self):
        response = self.client.post(
            "/api/governance/governance-risk-links/",
            {
                "source_type": GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
                "source_id": str(self.internal_control.id),
                "target_type": GovernanceRiskLink.TargetType.RISK,
                "target_id": str(self.risk.id),
                "relationship_type": GovernanceRiskLink.RelationshipType.MITIGATES,
                "effectiveness_percentage": "80.00",
                "residual_impact_percentage": "40.00",
                "confidence_score": "75.00",
                "rationale": "Internal control reduces the residual exposure.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        link = GovernanceRiskLink.objects.get()
        self.assertEqual(link.mapping_source, GovernanceRiskLink.MappingSource.MANUAL)
        self.assertEqual(link.validation_status, GovernanceRiskLink.ValidationStatus.DRAFT)
        self.assertEqual(link.created_by, self.user)

    def test_duplicate_governance_risk_link_is_blocked(self):
        GovernanceRiskLink.objects.create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=str(self.internal_control.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(self.risk.id),
            relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GovernanceRiskLink.objects.create(
                    source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
                    source_id=str(self.internal_control.id),
                    target_type=GovernanceRiskLink.TargetType.RISK,
                    target_id=str(self.risk.id),
                    relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
                )

    def test_governance_risk_percentages_must_be_between_zero_and_one_hundred(self):
        response = self.client.post(
            "/api/governance/governance-risk-links/",
            {
                "source_type": GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
                "source_id": str(self.internal_control.id),
                "target_type": GovernanceRiskLink.TargetType.RISK,
                "target_id": str(self.risk.id),
                "relationship_type": GovernanceRiskLink.RelationshipType.MITIGATES,
                "effectiveness_percentage": "101.00",
                "residual_impact_percentage": "40.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("effectiveness_percentage", response.data)

    def test_approve_governance_risk_link_sets_validator_and_timestamp(self):
        link = GovernanceRiskLink.objects.create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=str(self.internal_control.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(self.risk.id),
            validation_status=GovernanceRiskLink.ValidationStatus.PENDING_REVIEW,
        )

        response = self.client.post(
            f"/api/governance/governance-risk-links/{link.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, GovernanceRiskLink.ValidationStatus.APPROVED)
        self.assertEqual(link.validated_by, self.user)
        self.assertIsNotNone(link.validated_at)

    def test_reject_governance_risk_link_requires_rationale(self):
        link = GovernanceRiskLink.objects.create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=str(self.internal_control.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(self.risk.id),
            validation_status=GovernanceRiskLink.ValidationStatus.PENDING_REVIEW,
        )

        missing_rationale = self.client.post(
            f"/api/governance/governance-risk-links/{link.id}/reject/",
            {},
            format="json",
        )
        self.assertEqual(missing_rationale.status_code, 400)

        response = self.client.post(
            f"/api/governance/governance-risk-links/{link.id}/reject/",
            {"rationale": "This control does not mitigate the risk."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.validation_status, GovernanceRiskLink.ValidationStatus.REJECTED)
        self.assertEqual(link.rationale, "This control does not mitigate the risk.")

    def test_residual_risk_endpoint_uses_approved_governance_links(self):
        GovernanceRiskLink.objects.create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL_MECHANISM,
            source_id=str(self.internal_control_mechanism.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(self.risk.id),
            relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
            effectiveness_percentage=Decimal("80.00"),
            residual_impact_percentage=Decimal("50.00"),
            validation_status=GovernanceRiskLink.ValidationStatus.APPROVED,
        )

        response = self.client.get(f"/api/governance/residual-risk/risk/{self.risk.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["base_score"], 80.0)
        self.assertEqual(response.data["governance_reduction_percentage"], 40.0)
        self.assertEqual(response.data["adjusted_residual_score"], 48.0)
        self.assertEqual(len(response.data["links_used"]), 1)

    def test_simulation_mode_includes_pending_review_links(self):
        GovernanceRiskLink.objects.create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=str(self.internal_control.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(self.risk.id),
            relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
            effectiveness_percentage=Decimal("100.00"),
            residual_impact_percentage=Decimal("50.00"),
            validation_status=GovernanceRiskLink.ValidationStatus.PENDING_REVIEW,
        )

        official = self.client.get(f"/api/governance/residual-risk/risk/{self.risk.id}/")
        simulation = self.client.get(f"/api/governance/residual-risk/risk/{self.risk.id}/?mode=simulation")

        self.assertEqual(official.status_code, 200)
        self.assertEqual(simulation.status_code, 200)
        self.assertEqual(official.data["governance_reduction_percentage"], 0.0)
        self.assertEqual(simulation.data["governance_reduction_percentage"], 50.0)
        self.assertEqual(simulation.data["adjusted_residual_score"], 40.0)

    def test_rejected_links_are_excluded_from_active_residual_risk(self):
        GovernanceRiskLink.objects.create(
            source_type=GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            source_id=str(self.internal_control.id),
            target_type=GovernanceRiskLink.TargetType.RISK,
            target_id=str(self.risk.id),
            relationship_type=GovernanceRiskLink.RelationshipType.MITIGATES,
            residual_impact_percentage=Decimal("90.00"),
            validation_status=GovernanceRiskLink.ValidationStatus.REJECTED,
        )

        response = self.client.get(
            f"/api/governance/residual-risk/risk/{self.risk.id}/?include_inactive=true"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["governance_reduction_percentage"], 0.0)
        self.assertEqual(len(response.data["links_used"]), 0)
        self.assertEqual(len(response.data["inactive_links"]), 1)

    def test_rag_router_and_legacy_risk_engine_remain_available_for_residual_risk_phase(self):
        match = resolve("/api/assistant/rag/overview/")

        self.assertEqual(match.url_name, "rag-overview")
        self.assertTrue(hasattr(RiskEngineService, "calculate_risk"))
