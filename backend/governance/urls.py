from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .api import (
    FrameworkViewSet, ControlViewSet, MechanismViewSet,
    ControlMechanismViewSet, ControlMappingViewSet, MechanismEvidenceViewSet,
    InternalControlViewSet, InternalControlFrameworkMappingViewSet,
    InternalControlMechanismViewSet,
    ComplianceGapViewSet,
    OrganizationContextViewSet, RegulatoryContextViewSet,
    StakeholderViewSet, PolicyViewSet, PolicyControlViewSet,
    PolicyInternalControlViewSet,
    GovernanceDocumentViewSet, GovernanceDocumentControlViewSet,
    GovernanceDocumentSectionViewSet, RunbookStepViewSet,
    EvidenceItemViewSet, EvidenceLinkViewSet, MechanismEvidenceRequirementViewSet,
    ImplementationMechanismViewSet, PolicyEvidenceViewSet,
    PolicyAssessmentViewSet, PolicySectionViewSet, TechnicalRegulationViewSet,
    ProcedureViewSet, DecisionRecordViewSet, GovernanceExceptionViewSet, GovernanceActionViewSet, GovernanceRiskLinkViewSet, ControlAssessmentViewSet,
    AssessmentEvidenceViewSet, AssessmentFindingViewSet, ImprovementActionViewSet
)
from .views_decision_context import (
    DecisionContextView,
    RecommendDecisionView,
    RegisterDecisionView,
)
from .views_compliance_propagation import (
    compliance_gaps,
    framework_compliance,
    framework_control_compliance,
    governance_document_compliance,
    internal_control_compliance,
    mechanism_compliance,
    policy_compliance,
    preview_compliance,
    recalculate_compliance,
)
from .views_traceability import (
    traceability_evidence_item,
    traceability_framework,
    traceability_framework_control,
    traceability_governance_document,
    traceability_internal_control,
    traceability_mechanism,
    traceability_overview,
    traceability_policy,
)
from .views_workbench import workbench_overview
from .views_program import program_overview
from .views_drift import drift_demo_improvement, drift_demo_regression, drift_overview, drift_snapshot_current
from .views_governance_health import governance_health_overview
from .views_evidence_overview import mechanism_evidence_overview
from .views_evaluation import evaluation_overview
from .views_residual_risk import (
    residual_risk_for_asset,
    residual_risk_for_internal_control,
    residual_risk_for_mechanism,
    residual_risk_for_risk,
    residual_risk_for_vulnerability,
    residual_risk_overview,
)

router = DefaultRouter()
router.register(r"frameworks", FrameworkViewSet, basename="framework")
router.register(r"controls", ControlViewSet, basename="control")
router.register(r"framework-controls", ControlViewSet, basename="framework-control")
router.register(r"internal-controls", InternalControlViewSet, basename="internal-control")
router.register(r"internal-control-framework-mappings", InternalControlFrameworkMappingViewSet, basename="internal-control-framework-mapping")
router.register(r"internal-control-mechanisms", InternalControlMechanismViewSet, basename="internal-control-mechanism")
router.register(r"mechanisms", MechanismViewSet, basename="mechanism")
router.register(r"control-mechanisms", ControlMechanismViewSet, basename="control-mechanism")
router.register(r"control-mappings", ControlMappingViewSet, basename="control-mapping")
router.register(r"mechanism-evidences", MechanismEvidenceViewSet, basename="mechanism-evidence")
router.register(r"gaps", ComplianceGapViewSet, basename="gap")
router.register(r"control-assessments", ControlAssessmentViewSet, basename="control-assessment")
router.register(r"assessment-evidence", AssessmentEvidenceViewSet, basename="assessment-evidence")
router.register(r"assessment-findings", AssessmentFindingViewSet, basename="assessment-finding")
router.register(r"improvement-actions", ImprovementActionViewSet, basename="improvement-action")
router.register(r"organization-context", OrganizationContextViewSet, basename="organization-context")
router.register(r"regulatory-context", RegulatoryContextViewSet, basename="regulatory-context")
router.register(r"stakeholders", StakeholderViewSet, basename="stakeholder")
router.register(r"policies", PolicyViewSet, basename="policy")
router.register(r"policy-sections", PolicySectionViewSet, basename="policy-section")
router.register(r"policy-controls", PolicyControlViewSet, basename="policy-control")
router.register(r"policy-internal-controls", PolicyInternalControlViewSet, basename="policy-internal-control")
router.register(r"governance-documents", GovernanceDocumentViewSet, basename="governance-document")
router.register(r"governance-document-controls", GovernanceDocumentControlViewSet, basename="governance-document-control")
router.register(r"governance-document-sections", GovernanceDocumentSectionViewSet, basename="governance-document-section")
router.register(r"runbook-steps", RunbookStepViewSet, basename="runbook-step")
router.register(r"evidence-items", EvidenceItemViewSet, basename="evidence-item")
router.register(r"evidence-links", EvidenceLinkViewSet, basename="evidence-link")
router.register(r"mechanism-evidence-requirements", MechanismEvidenceRequirementViewSet, basename="mechanism-evidence-requirement")

router.register(r"policy-mechanisms", ImplementationMechanismViewSet, basename="policy-mechanism")
router.register(r"policy-evidences", PolicyEvidenceViewSet, basename="policy-evidence")
router.register(r"policy-assessments", PolicyAssessmentViewSet, basename="policy-assessment")
router.register(r"technical-regulations", TechnicalRegulationViewSet, basename="technical-regulation")
router.register(r"procedures", ProcedureViewSet, basename="procedure")
router.register(r"decision-records", DecisionRecordViewSet, basename="decision-record")
router.register(r"governance-exceptions", GovernanceExceptionViewSet, basename="governance-exception")
router.register(r"governance-actions", GovernanceActionViewSet, basename="governance-action")
router.register(r"governance-risk-links", GovernanceRiskLinkViewSet, basename="governance-risk-link")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "workbench/overview/",
        workbench_overview,
        name="workbench-overview",
    ),
    path(
        "program/overview/",
        program_overview,
        name="program-overview",
    ),
    path(
        "drift/overview/",
        drift_overview,
        name="drift-overview",
    ),
    path(
        "drift/snapshot-current/",
        drift_snapshot_current,
        name="drift-snapshot-current",
    ),
    path(
        "drift/demo-regression/",
        drift_demo_regression,
        name="drift-demo-regression",
    ),
    path(
        "drift/demo-improvement/",
        drift_demo_improvement,
        name="drift-demo-improvement",
    ),
    path(
        "health/overview/",
        governance_health_overview,
        name="governance-health-overview",
    ),
    path(
        "evidence/mechanism-overview/",
        mechanism_evidence_overview,
        name="mechanism-evidence-overview",
    ),
    path(
        "evaluation/overview/",
        evaluation_overview,
        name="governance-evaluation-overview",
    ),
    path(
        "residual-risk/overview/",
        residual_risk_overview,
        name="residual-risk-overview",
    ),
    path(
        "residual-risk/risk/<uuid:pk>/",
        residual_risk_for_risk,
        name="residual-risk-risk",
    ),
    path(
        "residual-risk/asset/<uuid:pk>/",
        residual_risk_for_asset,
        name="residual-risk-asset",
    ),
    path(
        "residual-risk/vulnerability/<uuid:pk>/",
        residual_risk_for_vulnerability,
        name="residual-risk-vulnerability",
    ),
    path(
        "residual-risk/internal-control/<uuid:pk>/",
        residual_risk_for_internal_control,
        name="residual-risk-internal-control",
    ),
    path(
        "residual-risk/mechanism/<uuid:pk>/",
        residual_risk_for_mechanism,
        name="residual-risk-mechanism",
    ),
    path(
        "traceability/policy/<uuid:pk>/",
        traceability_policy,
        name="traceability-policy",
    ),
    path(
        "traceability/governance-document/<uuid:pk>/",
        traceability_governance_document,
        name="traceability-governance-document",
    ),
    path(
        "traceability/internal-control/<uuid:pk>/",
        traceability_internal_control,
        name="traceability-internal-control",
    ),
    path(
        "traceability/mechanism/<uuid:pk>/",
        traceability_mechanism,
        name="traceability-mechanism",
    ),
    path(
        "traceability/evidence-item/<uuid:pk>/",
        traceability_evidence_item,
        name="traceability-evidence-item",
    ),
    path(
        "traceability/framework/<uuid:pk>/",
        traceability_framework,
        name="traceability-framework",
    ),
    path(
        "traceability/framework-control/<uuid:pk>/",
        traceability_framework_control,
        name="traceability-framework-control",
    ),
    path(
        "traceability/overview/",
        traceability_overview,
        name="traceability-overview",
    ),
    path(
        "compliance-propagation/mechanism/<uuid:pk>/",
        mechanism_compliance,
        name="compliance-propagation-mechanism",
    ),
    path(
        "compliance-propagation/internal-control/<uuid:pk>/",
        internal_control_compliance,
        name="compliance-propagation-internal-control",
    ),
    path(
        "compliance-propagation/policy/<uuid:pk>/",
        policy_compliance,
        name="compliance-propagation-policy",
    ),
    path(
        "compliance-propagation/governance-document/<uuid:pk>/",
        governance_document_compliance,
        name="compliance-propagation-governance-document",
    ),
    path(
        "compliance-propagation/framework-control/<uuid:pk>/",
        framework_control_compliance,
        name="compliance-propagation-framework-control",
    ),
    path(
        "compliance-propagation/framework/<uuid:pk>/",
        framework_compliance,
        name="compliance-propagation-framework",
    ),
    path(
        "compliance-propagation/gaps/",
        compliance_gaps,
        name="compliance-propagation-gaps",
    ),
    path(
        "compliance-propagation/recalculate/",
        recalculate_compliance,
        name="compliance-propagation-recalculate",
    ),
    path(
        "compliance-propagation/preview/",
        preview_compliance,
        name="compliance-propagation-preview",
    ),
    path(
        "decision-context/<uuid:occurrence_id>/",
        DecisionContextView.as_view(),
        name="decision-context",
    ),
    path(
        "decision-context/<uuid:occurrence_id>/register/",
        RegisterDecisionView.as_view(),
        name="decision-context-register",
    ),
    path(
        "decision-context/<uuid:occurrence_id>/recommend/",
        RecommendDecisionView.as_view(),
        name="decision-context-recommend",
    ),
]

