from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .api import (
    FrameworkViewSet, ControlViewSet, MechanismViewSet,
    ControlMechanismViewSet, ControlMappingViewSet, MechanismEvidenceViewSet,
    ComplianceGapViewSet,
    OrganizationContextViewSet, RegulatoryContextViewSet,
    StakeholderViewSet, PolicyViewSet, PolicyControlViewSet,
    ImplementationMechanismViewSet, PolicyEvidenceViewSet,
    PolicyAssessmentViewSet, PolicySectionViewSet, TechnicalRegulationViewSet,
    ProcedureViewSet, DecisionRecordViewSet, ControlAssessmentViewSet,
    AssessmentEvidenceViewSet, AssessmentFindingViewSet, ImprovementActionViewSet
)
from .views_decision_context import (
    DecisionContextView,
    RecommendDecisionView,
    RegisterDecisionView,
)

router = DefaultRouter()
router.register(r"frameworks", FrameworkViewSet, basename="framework")
router.register(r"controls", ControlViewSet, basename="control")
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

router.register(r"policy-mechanisms", ImplementationMechanismViewSet, basename="policy-mechanism")
router.register(r"policy-evidences", PolicyEvidenceViewSet, basename="policy-evidence")
router.register(r"policy-assessments", PolicyAssessmentViewSet, basename="policy-assessment")
router.register(r"technical-regulations", TechnicalRegulationViewSet, basename="technical-regulation")
router.register(r"procedures", ProcedureViewSet, basename="procedure")
router.register(r"decision-records", DecisionRecordViewSet, basename="decision-record")

urlpatterns = [
    path("", include(router.urls)),
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

