from rest_framework import status, viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Case, Count, IntegerField, Q, When
from django.utils import timezone

from .models import (
    Framework, Control, ControlMapping, Mechanism, ControlMechanism, MechanismEvidence,
    InternalControl, InternalControlFrameworkMapping,
    InternalControlMechanism,
    Policy, PolicyControl, ImplementationMechanism, PolicyEvidence, PolicyAssessment, PolicySection,
    PolicyInternalControl,
    GovernanceDocument, GovernanceDocumentControl, GovernanceDocumentSection, RunbookStep,
    EvidenceItem, EvidenceLink, MechanismEvidenceRequirement,
    ComplianceGap, RegulatoryContext, Stakeholder, TechnicalRegulation, Procedure, DecisionRecord, GovernanceException, GovernanceAction, GovernanceRiskLink,
    FrameworkProfile, ControlAssessment, Evidence, Finding, ImprovementAction
)
from .serializers import (
    FrameworkSerializer, ControlSerializer, 
    ControlMappingSerializer,
    InternalControlSerializer, InternalControlFrameworkMappingSerializer,
    InternalControlMechanismSerializer,
    MechanismSerializer, ControlMechanismSerializer,
    MechanismEvidenceSerializer, ComplianceGapSerializer,
    RegulatoryContextSerializer, StakeholderSerializer,
    PolicySerializer, PolicyControlSerializer, 
    PolicyInternalControlSerializer,
    GovernanceDocumentSerializer, GovernanceDocumentControlSerializer,
    GovernanceDocumentSectionSerializer, RunbookStepSerializer,
    EvidenceItemSerializer, EvidenceLinkSerializer, MechanismEvidenceRequirementSerializer,
    ImplementationMechanismSerializer, PolicyEvidenceSerializer,
    PolicyAssessmentSerializer, TechnicalRegulationSerializer, ProcedureSerializer,
    OrganizationContextSerializer, PolicySectionSerializer, DecisionRecordSerializer, GovernanceExceptionSerializer, GovernanceActionSerializer, GovernanceRiskLinkSerializer,
    ControlAssessmentSerializer, AssessmentEvidenceSerializer,
    AssessmentFindingSerializer, ImprovementActionSerializer
)
from .services.compliance_gap_engine import ComplianceGapEngine
from .services.control_mapping_engine import ControlMappingEngine
from .services.evidence_assignment_engine import EvidenceAssignmentEngine
from .services.action_plan_service import GovernanceActionPlanService
from .services.assessment_advisor import AssessmentAdvisor
from .services.ai_assistant import GovernanceAIAssistant
from .services.mechanism_implementation_planner import MechanismImplementationPlanner
from company.models.company import CompanyProfile


def refresh_control_gap(control):
    if control and control.framework_id:
        ComplianceGapEngine.evaluate_control(control.framework, control)


def request_user_or_none(request):
    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        return user
    return None


def query_bool(request, name, default=False):
    value = request.query_params.get(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def should_apply_mapping_list_filters(view):
    return getattr(view, "action", None) in {None, "list", "internal_controls"}


def exclude_inactive_mappings(request, queryset, model, view=None):
    if view is not None and not should_apply_mapping_list_filters(view):
        return queryset
    if query_bool(request, "include_inactive"):
        return queryset
    return queryset.exclude(
        validation_status__in=[
            model.ValidationStatus.REJECTED,
            model.ValidationStatus.DEPRECATED,
        ]
    )


def filter_active_internal_controls(request, queryset, view=None):
    if view is not None and not should_apply_mapping_list_filters(view):
        return queryset
    if query_bool(request, "active_internal_controls"):
        return queryset.filter(internal_control__is_active=True)
    return queryset


def active_evidence_links(target_type, target_id):
    return (
        EvidenceLink.objects
        .select_related("evidence_item", "created_by", "updated_by", "validated_by")
        .filter(target_type=target_type, target_id=target_id)
        .exclude(
            validation_status__in=[
                EvidenceLink.ValidationStatus.REJECTED,
                EvidenceLink.ValidationStatus.DEPRECATED,
            ]
        )
    )


def evidence_links_response(target_type, target_id):
    return Response(EvidenceLinkSerializer(active_evidence_links(target_type, target_id), many=True).data)


class FrameworkViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Framework.objects.all().order_by("name")
    serializer_class = FrameworkSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "code", "slug"]
    ordering_fields = ["name", "code"]


class ControlViewSet(viewsets.ModelViewSet):
    queryset = (
        Control.objects
        .select_related("framework")
        .annotate(mechanisms_count=Count("mechanisms"))
        .all()
        .order_by("framework__name", "code")
    )
    serializer_class = ControlSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "framework": ["exact"],
        "status": ["exact"],
        "is_mandatory": ["exact"],
    }
    search_fields = ["code", "title"]
    ordering_fields = ["code", "title", "status", "is_mandatory", "framework__name"]

    @action(detail=True, methods=["get"])
    def evidence(self, request, pk=None):
        control = self.get_object()
        return evidence_links_response(EvidenceLink.TargetType.FRAMEWORK_CONTROL, control.id)


class MechanismViewSet(viewsets.ModelViewSet):
    serializer_class = MechanismSerializer
    filter_backends = [SearchFilter, OrderingFilter, DjangoFilterBackend]
    search_fields = ["title", "description", "tags__name"]
    filterset_fields = {"mechanism_type": ["exact"]}
    ordering_fields = ["title", "mechanism_type"]

    def get_queryset(self):
        qs = Mechanism.objects.prefetch_related("tags").all().order_by("title")
        tags_query = self.request.query_params.get("tags")
        if tags_query:
            tags_list = tags_query.split(",")
            qs = qs.filter(tags__name__in=tags_list).distinct()
        return qs

    @action(detail=True, methods=["get"], url_path="internal-controls")
    def internal_controls(self, request, pk=None):
        mechanism = self.get_object()
        links = InternalControlMechanism.objects.select_related(
            "internal_control",
            "mechanism",
            "created_by",
            "updated_by",
            "validated_by",
        ).filter(mechanism=mechanism)
        links = links.exclude(
            validation_status__in=[
                InternalControlMechanism.ValidationStatus.REJECTED,
                InternalControlMechanism.ValidationStatus.DEPRECATED,
            ]
        )
        serializer = InternalControlMechanismSerializer(links, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def evidence(self, request, pk=None):
        mechanism = self.get_object()
        return evidence_links_response(EvidenceLink.TargetType.MECHANISM, mechanism.id)

    @action(detail=True, methods=["get", "post"], url_path="implementation-actions")
    def implementation_actions(self, request, pk=None):
        mechanism = self.get_object()
        if request.method == "POST":
            payload = request.data.copy()
            payload["target_type"] = "mechanism"
            payload["target_id"] = str(mechanism.id)
            payload.setdefault("action_type", GovernanceAction.ActionType.IMPLEMENT_MECHANISM)
            payload.setdefault("source_type", GovernanceAction.SourceType.MANUAL)
            serializer = GovernanceActionSerializer(data=payload)
            serializer.is_valid(raise_exception=True)
            user = request_user_or_none(request)
            action_item = serializer.save(created_by=user, updated_by=user)
            return Response(GovernanceActionSerializer(action_item).data, status=status.HTTP_201_CREATED)

        actions = (
            GovernanceAction.objects
            .select_related("created_by", "updated_by", "completed_by", "linked_decision", "linked_exception")
            .filter(target_type="mechanism", target_id=str(mechanism.id))
            .order_by("status", "due_date", "-created_at")
        )
        return Response(GovernanceActionSerializer(actions, many=True).data)

    @action(detail=True, methods=["post"], url_path="suggest-implementation-plan")
    def suggest_implementation_plan(self, request, pk=None):
        mechanism = self.get_object()
        return Response(MechanismImplementationPlanner.suggest(mechanism))

    @action(detail=True, methods=["post"], url_path="generate-implementation-actions")
    def generate_implementation_actions(self, request, pk=None):
        mechanism = self.get_object()
        tasks = request.data.get("tasks") or None
        result = MechanismImplementationPlanner.create_actions(
            mechanism,
            tasks=tasks,
            owner=request.data.get("owner") or "",
            user=request_user_or_none(request),
        )
        return Response({
            "created": result["created"],
            "updated": result["updated"],
            "skipped": result["skipped"],
            "total": result["total"],
            "actions": GovernanceActionSerializer(result["actions"], many=True).data,
            "suggestion": result.get("suggestion"),
        })

    @action(detail=True, methods=["get"], url_path="implementation-readiness")
    def implementation_readiness(self, request, pk=None):
        mechanism = self.get_object()
        return Response(MechanismImplementationPlanner.readiness(mechanism))

    @action(detail=True, methods=["post"], url_path="apply-implementation-recommendation")
    def apply_implementation_recommendation(self, request, pk=None):
        mechanism = self.get_object()
        confirmed = str(request.data.get("confirmed_human_validation", "")).strip().lower()
        if confirmed not in {"1", "true", "yes", "on"}:
            return Response(
                {
                    "detail": (
                        "A recomendacao de estado operacional exige validacao humana explicita "
                        "antes de ser aplicada."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = MechanismImplementationPlanner.apply_readiness_recommendation(
            mechanism,
            user=request_user_or_none(request),
            link_ids=request.data.get("internal_control_mechanisms") or None,
            rationale=request.data.get("rationale") or "",
        )
        return Response({
            "updated": result["updated"],
            "readiness": result["readiness"],
            "links": InternalControlMechanismSerializer(result["links"], many=True).data,
        })


class ControlMechanismViewSet(viewsets.ModelViewSet):
    queryset = ControlMechanism.objects.select_related("mechanism", "control").prefetch_related("evidences").all()
    serializer_class = ControlMechanismSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {"control": ["exact"], "mechanism": ["exact"], "status": ["exact"]}

    def perform_create(self, serializer):
        instance = serializer.save()
        refresh_control_gap(instance.control)

    def perform_update(self, serializer):
        instance = serializer.save()
        refresh_control_gap(instance.control)

    def perform_destroy(self, instance):
        control = instance.control
        instance.delete()
        refresh_control_gap(control)

    @action(detail=True, methods=["post"], url_path="evidences")
    def evidences(self, request, pk=None):
        control_mechanism = self.get_object()
        serializer = MechanismEvidenceSerializer(
            data={**request.data, "control_mechanism": control_mechanism.pk}
        )
        serializer.is_valid(raise_exception=True)
        evidence = serializer.save()
        refresh_control_gap(control_mechanism.control)
        return Response(
            MechanismEvidenceSerializer(evidence).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="evidence-suggestions")
    def evidence_suggestions(self, request, pk=None):
        control_mechanism = self.get_object()
        results = EvidenceAssignmentEngine.suggestions_for_control_mechanism(control_mechanism.pk)
        return Response(results)

    @action(detail=True, methods=["post"], url_path="apply-evidence-suggestion")
    def apply_evidence_suggestion(self, request, pk=None):
        control_mechanism = self.get_object()
        suggestion_id = request.data.get("suggestion_id")
        if not suggestion_id:
            return Response(
                {"detail": "suggestion_id e obrigatorio."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            evidence = EvidenceAssignmentEngine.apply_suggestion(control_mechanism.pk, suggestion_id)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        refresh_control_gap(control_mechanism.control)
        serializer = MechanismEvidenceSerializer(evidence)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ControlMappingViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ControlMappingSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["source_control", "target_control", "mapping_type"]
    search_fields = [
        "source_control__code",
        "source_control__title",
        "source_control__framework__name",
        "target_control__code",
        "target_control__title",
        "target_control__framework__name",
        "rationale",
    ]
    ordering_fields = ["confidence", "created_at", "updated_at"]
    ordering = ["source_control__framework__name", "source_control__code", "-confidence"]

    def get_queryset(self):
        qs = ControlMapping.objects.select_related(
            "source_control__framework",
            "target_control__framework",
        )

        source_framework = self.request.query_params.get("source_framework")
        target_framework = self.request.query_params.get("target_framework")
        framework = self.request.query_params.get("framework")

        if source_framework:
            qs = qs.filter(source_control__framework_id=source_framework)
        if target_framework:
            qs = qs.filter(target_control__framework_id=target_framework)
        if framework:
            qs = qs.filter(
                Q(source_control__framework_id=framework) |
                Q(target_control__framework_id=framework)
            )

        return qs

    @action(detail=False, methods=["get"])
    def overview(self, request):
        return Response(ControlMappingEngine.overview())

    @action(detail=False, methods=["post"])
    def rebuild(self, request):
        min_shared = request.data.get("min_shared_mechanisms", 1)
        results = ControlMappingEngine.build_mappings(min_shared_mechanisms=min_shared)
        return Response({"detail": "Control mapping rebuilt", "results": results})


class InternalControlViewSet(viewsets.ModelViewSet):
    serializer_class = InternalControlSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "control_domain": ["exact", "icontains"],
        "criticality": ["exact"],
        "status": ["exact"],
        "source": ["exact"],
        "is_active": ["exact"],
        "legacy_control": ["exact"],
    }
    search_fields = [
        "code",
        "title",
        "description",
        "control_domain",
        "objective",
        "risk_statement",
        "owner_role",
        "legacy_control__code",
        "legacy_control__title",
    ]
    ordering_fields = [
        "code",
        "title",
        "control_domain",
        "criticality",
        "status",
        "source",
        "is_active",
        "created_at",
        "updated_at",
    ]
    ordering = ["code"]

    def get_queryset(self):
        return (
            InternalControl.objects
            .select_related("legacy_control", "legacy_control__framework", "legacy_control__section")
            .prefetch_related("framework_mappings")
            .annotate(mappings_count=Count("framework_mappings"))
            .all()
        )

    @action(detail=True, methods=["get"], url_path="frameworks")
    def frameworks(self, request, pk=None):
        internal_control = self.get_object()
        official_only = request.query_params.get("official_only", "").lower() in {"1", "true", "yes"}
        mappings = internal_control.framework_mappings.select_related(
            "framework_control",
            "framework_control__framework",
        )
        if official_only:
            mappings = mappings.filter(
                validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED
            )
        else:
            mappings = mappings.exclude(
                validation_status__in=[
                    InternalControlFrameworkMapping.ValidationStatus.REJECTED,
                    InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
                ]
            )

        frameworks = {}
        for mapping in mappings:
            framework = mapping.framework_control.framework
            frameworks[str(framework.id)] = {
                "id": str(framework.id),
                "code": framework.code,
                "name": framework.name,
                "version": framework.version,
            }

        return Response(list(frameworks.values()))

    @action(detail=True, methods=["get"], url_path="policies")
    def policies(self, request, pk=None):
        internal_control = self.get_object()
        links = PolicyInternalControl.objects.select_related(
            "policy",
            "internal_control",
            "created_by",
            "updated_by",
            "validated_by",
        ).filter(internal_control=internal_control)
        links = links.exclude(
            validation_status__in=[
                PolicyInternalControl.ValidationStatus.REJECTED,
                PolicyInternalControl.ValidationStatus.DEPRECATED,
            ]
        )
        serializer = PolicyInternalControlSerializer(links, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="mechanisms")
    def mechanisms(self, request, pk=None):
        internal_control = self.get_object()
        links = InternalControlMechanism.objects.select_related(
            "internal_control",
            "mechanism",
            "created_by",
            "updated_by",
            "validated_by",
        ).filter(internal_control=internal_control)
        links = links.exclude(
            validation_status__in=[
                InternalControlMechanism.ValidationStatus.REJECTED,
                InternalControlMechanism.ValidationStatus.DEPRECATED,
            ]
        )
        serializer = InternalControlMechanismSerializer(links, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="governance-documents")
    def governance_documents(self, request, pk=None):
        internal_control = self.get_object()
        links = GovernanceDocumentControl.objects.select_related(
            "document",
            "internal_control",
            "created_by",
            "updated_by",
            "validated_by",
        ).filter(internal_control=internal_control)
        links = links.exclude(
            validation_status__in=[
                GovernanceDocumentControl.ValidationStatus.REJECTED,
                GovernanceDocumentControl.ValidationStatus.DEPRECATED,
            ]
        )
        serializer = GovernanceDocumentControlSerializer(links, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def evidence(self, request, pk=None):
        internal_control = self.get_object()
        return evidence_links_response(EvidenceLink.TargetType.INTERNAL_CONTROL, internal_control.id)

    @action(detail=True, methods=["get"], url_path="framework-impact")
    def framework_impact(self, request, pk=None):
        internal_control = self.get_object()
        mappings = internal_control.framework_mappings.select_related(
            "framework_control",
            "framework_control__framework",
        ).filter(
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED
        )

        frameworks = {}
        for mapping in mappings:
            framework = mapping.framework_control.framework
            key = str(framework.id)
            if key not in frameworks:
                frameworks[key] = {
                    "id": key,
                    "code": framework.code,
                    "name": framework.name,
                    "version": framework.version,
                    "controls": [],
                }
            frameworks[key]["controls"].append({
                "id": str(mapping.framework_control.id),
                "code": mapping.framework_control.code,
                "title": mapping.framework_control.title,
                "relationship_type": mapping.relationship_type,
                "coverage_percentage": mapping.coverage_percentage,
                "confidence_score": mapping.confidence_score,
            })

        return Response(list(frameworks.values()))


class InternalControlFrameworkMappingViewSet(viewsets.ModelViewSet):
    serializer_class = InternalControlFrameworkMappingSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "internal_control": ["exact"],
        "framework_control": ["exact"],
        "framework_control__framework": ["exact"],
        "relationship_type": ["exact"],
        "validation_status": ["exact"],
        "mapping_source": ["exact"],
        "internal_control__status": ["exact"],
        "internal_control__source": ["exact"],
        "internal_control__control_domain": ["exact", "icontains"],
    }
    search_fields = [
        "internal_control__code",
        "internal_control__title",
        "internal_control__description",
        "internal_control__control_domain",
        "framework_control__code",
        "framework_control__title",
        "framework_control__framework__code",
        "framework_control__framework__name",
        "rationale",
    ]
    ordering_fields = [
        "internal_control__code",
        "framework_control__code",
        "coverage_percentage",
        "confidence_score",
        "relationship_type",
        "validation_status",
        "mapping_source",
        "created_at",
        "updated_at",
        "validated_at",
    ]
    ordering = ["internal_control__code", "framework_control__framework__code", "framework_control__code"]

    def get_queryset(self):
        qs = InternalControlFrameworkMapping.objects.select_related(
            "internal_control",
            "framework_control",
            "framework_control__framework",
            "created_by",
            "updated_by",
            "validated_by",
        )

        framework = self.request.query_params.get("framework")
        if framework:
            qs = qs.filter(framework_control__framework_id=framework)

        status_value = self.request.query_params.get("status")
        if status_value:
            qs = qs.filter(internal_control__status=status_value)

        source = self.request.query_params.get("source")
        if source:
            qs = qs.filter(internal_control__source=source)

        control_domain = self.request.query_params.get("control_domain")
        if control_domain:
            qs = qs.filter(internal_control__control_domain__icontains=control_domain)

        qs = filter_active_internal_controls(self.request, qs, self)
        return exclude_inactive_mappings(self.request, qs, InternalControlFrameworkMapping, self)

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(
            mapping_source=InternalControlFrameworkMapping.MappingSource.MANUAL,
            validation_status=InternalControlFrameworkMapping.ValidationStatus.DRAFT,
            created_by=user,
            updated_by=user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=request_user_or_none(self.request))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        mapping = self.get_object()
        mapping.approve(request_user_or_none(request))
        mapping.save(update_fields=["validation_status", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(mapping).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        mapping = self.get_object()
        mapping.reject(request_user_or_none(request))
        mapping.save(update_fields=["validation_status", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(mapping).data)

    @action(detail=True, methods=["post"], url_path="mark-deprecated")
    def mark_deprecated(self, request, pk=None):
        mapping = self.get_object()
        mapping.mark_deprecated(request_user_or_none(request))
        mapping.save(update_fields=["validation_status", "updated_by", "updated_at"])
        return Response(self.get_serializer(mapping).data)

    @action(detail=False, methods=["get"], url_path="internal-controls")
    def internal_controls(self, request):
        framework_control_id = request.query_params.get("framework_control")
        if not framework_control_id:
            return Response(
                {"detail": "framework_control e obrigatorio."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mappings = self.filter_queryset(self.get_queryset()).filter(
            framework_control_id=framework_control_id
        )
        internal_controls = InternalControl.objects.filter(
            id__in=mappings.values_list("internal_control_id", flat=True)
        ).select_related("legacy_control", "legacy_control__framework")
        serializer = InternalControlSerializer(internal_controls, many=True)
        return Response(serializer.data)


class InternalControlMechanismViewSet(viewsets.ModelViewSet):
    serializer_class = InternalControlMechanismSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "internal_control": ["exact"],
        "mechanism": ["exact"],
        "relationship_type": ["exact"],
        "mandatory": ["exact"],
        "implementation_status": ["exact"],
        "mapping_source": ["exact"],
        "validation_status": ["exact"],
        "internal_control__status": ["exact"],
        "internal_control__source": ["exact"],
        "internal_control__control_domain": ["exact", "icontains"],
        "mechanism__mechanism_type": ["exact"],
    }
    search_fields = [
        "internal_control__code",
        "internal_control__title",
        "internal_control__description",
        "internal_control__control_domain",
        "mechanism__title",
        "mechanism__description",
        "rationale",
    ]
    ordering_fields = [
        "internal_control__code",
        "mechanism__title",
        "contribution_weight",
        "mandatory",
        "implementation_status",
        "relationship_type",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "created_at",
        "updated_at",
        "validated_at",
    ]
    ordering = ["internal_control__code", "mechanism__title"]

    def get_queryset(self):
        qs = InternalControlMechanism.objects.select_related(
            "internal_control",
            "mechanism",
            "created_by",
            "updated_by",
            "validated_by",
        )
        qs = filter_active_internal_controls(self.request, qs, self)
        return exclude_inactive_mappings(self.request, qs, InternalControlMechanism, self)

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(
            mapping_source=InternalControlMechanism.MappingSource.MANUAL,
            validation_status=InternalControlMechanism.ValidationStatus.DRAFT,
            created_by=user,
            updated_by=user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=request_user_or_none(self.request))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        link = self.get_object()
        link.approve(request_user_or_none(request))
        link.save(update_fields=["validation_status", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        rationale = str(request.data.get("rationale") or "").strip()
        if not rationale:
            return Response(
                {"detail": "rationale e obrigatorio para rejeitar a associacao."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link = self.get_object()
        link.reject(rationale, request_user_or_none(request))
        link.save(update_fields=["validation_status", "rationale", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="mark-deprecated")
    def mark_deprecated(self, request, pk=None):
        link = self.get_object()
        link.mark_deprecated(request_user_or_none(request))
        link.save(update_fields=["validation_status", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)


class EvidenceItemViewSet(viewsets.ModelViewSet):
    serializer_class = EvidenceItemSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "evidence_type": ["exact"],
        "status": ["exact"],
        "owner": ["exact", "icontains"],
        "valid_until": ["exact", "lt", "lte", "gt", "gte", "isnull"],
        "is_active": ["exact"],
        "legacy_evidence": ["exact"],
    }
    search_fields = ["title", "description", "source", "external_reference", "owner"]
    ordering_fields = [
        "title",
        "evidence_type",
        "status",
        "owner",
        "collected_at",
        "valid_until",
        "confidence_level",
        "is_active",
        "created_at",
        "updated_at",
    ]
    ordering = ["title"]

    def get_queryset(self):
        return (
            EvidenceItem.objects
            .select_related("legacy_evidence")
            .prefetch_related("links")
            .annotate(links_count=Count("links"))
            .all()
        )

    @action(detail=True, methods=["get"])
    def links(self, request, pk=None):
        evidence_item = self.get_object()
        links = evidence_item.links.select_related(
            "evidence_item",
            "created_by",
            "updated_by",
            "validated_by",
        )
        serializer = EvidenceLinkSerializer(links, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def impact(self, request, pk=None):
        evidence_item = self.get_object()
        links = evidence_item.links.select_related("evidence_item").exclude(
            validation_status__in=[
                EvidenceLink.ValidationStatus.REJECTED,
                EvidenceLink.ValidationStatus.DEPRECATED,
            ]
        )

        impact = {
            "evidence": EvidenceItemSerializer(evidence_item).data,
            "links": EvidenceLinkSerializer(links, many=True).data,
            "mechanisms": [],
            "internal_controls": [],
            "governance_documents": [],
            "policies": [],
            "frameworks": [],
            "framework_controls": [],
        }
        seen = {key: set() for key in impact if key not in {"evidence", "links"}}

        def add_once(key, object_id, payload):
            object_id = str(object_id)
            if object_id in seen[key]:
                return False
            seen[key].add(object_id)
            impact[key].append(payload)
            return True

        def add_framework_control(control):
            added = add_once("framework_controls", control.id, {
                "id": str(control.id),
                "code": control.code,
                "title": control.title,
                "framework": str(control.framework_id),
                "framework_code": control.framework.code,
                "framework_name": control.framework.name,
            })
            if not added:
                return
            add_once("frameworks", control.framework_id, {
                "id": str(control.framework_id),
                "code": control.framework.code,
                "name": control.framework.name,
                "version": control.framework.version,
            })

        def add_internal_control(internal_control):
            added = add_once("internal_controls", internal_control.id, {
                "id": str(internal_control.id),
                "code": internal_control.code,
                "title": internal_control.title,
                "control_domain": internal_control.control_domain,
            })
            if not added:
                return
            for mapping in internal_control.framework_mappings.select_related(
                "framework_control",
                "framework_control__framework",
            ).filter(validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED):
                add_framework_control(mapping.framework_control)
            for mechanism_link in internal_control.mechanism_links.select_related("mechanism").filter(
                validation_status=InternalControlMechanism.ValidationStatus.APPROVED
            ):
                add_mechanism(mechanism_link.mechanism)

        def add_mechanism(mechanism):
            added = add_once("mechanisms", mechanism.id, {
                "id": str(mechanism.id),
                "title": mechanism.title,
                "mechanism_type": mechanism.mechanism_type,
            })
            if not added:
                return
            for control_link in mechanism.internal_control_links.select_related("internal_control").filter(
                validation_status=InternalControlMechanism.ValidationStatus.APPROVED
            ):
                add_internal_control(control_link.internal_control)

        def add_document(document):
            added = add_once("governance_documents", document.id, {
                "id": str(document.id),
                "title": document.title,
                "document_type": document.document_type,
                "status": document.status,
            })
            if not added:
                return
            if document.legacy_policy_id:
                add_policy(document.legacy_policy)
            for control_link in document.control_links.select_related("internal_control").filter(
                validation_status=GovernanceDocumentControl.ValidationStatus.APPROVED
            ):
                add_internal_control(control_link.internal_control)

        def add_policy(policy):
            added = add_once("policies", policy.id, {
                "id": str(policy.id),
                "code": policy.code,
                "title": policy.title,
                "status": policy.status,
            })
            if not added:
                return
            for document in policy.governance_documents.all():
                add_document(document)
            for control_link in policy.internal_control_links.select_related("internal_control").filter(
                validation_status=PolicyInternalControl.ValidationStatus.APPROVED
            ):
                add_internal_control(control_link.internal_control)

        for link in links:
            target = link.target
            if not target:
                continue
            if link.target_type == EvidenceLink.TargetType.MECHANISM:
                add_mechanism(target)
            elif link.target_type == EvidenceLink.TargetType.INTERNAL_CONTROL:
                add_internal_control(target)
            elif link.target_type == EvidenceLink.TargetType.GOVERNANCE_DOCUMENT:
                add_document(target)
            elif link.target_type == EvidenceLink.TargetType.RUNBOOK_STEP:
                add_document(target.runbook)
            elif link.target_type == EvidenceLink.TargetType.FRAMEWORK_CONTROL:
                add_framework_control(target)
                for mapping in target.internal_control_mappings.select_related("internal_control").filter(
                    validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED
                ):
                    add_internal_control(mapping.internal_control)
            elif link.target_type == EvidenceLink.TargetType.POLICY:
                add_policy(target)

        return Response(impact)


class EvidenceLinkViewSet(viewsets.ModelViewSet):
    serializer_class = EvidenceLinkSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "evidence_item": ["exact"],
        "target_type": ["exact"],
        "target_id": ["exact"],
        "link_type": ["exact"],
        "mapping_source": ["exact"],
        "validation_status": ["exact"],
    }
    search_fields = [
        "evidence_item__title",
        "evidence_item__description",
        "evidence_item__source",
        "evidence_item__external_reference",
        "rationale",
    ]
    ordering_fields = [
        "evidence_item__title",
        "target_type",
        "link_type",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "created_at",
        "updated_at",
        "validated_at",
    ]
    ordering = ["evidence_item__title", "target_type", "link_type"]

    def get_queryset(self):
        qs = EvidenceLink.objects.select_related(
            "evidence_item",
            "target_content_type",
            "created_by",
            "updated_by",
            "validated_by",
        )
        return exclude_inactive_mappings(self.request, qs, EvidenceLink, self)

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(
            mapping_source=EvidenceLink.MappingSource.MANUAL,
            validation_status=EvidenceLink.ValidationStatus.DRAFT,
            created_by=user,
            updated_by=user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=request_user_or_none(self.request))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        link = self.get_object()
        link.approve(request_user_or_none(request))
        link.save(update_fields=["validation_status", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        rationale = str(request.data.get("rationale") or "").strip()
        if not rationale:
            return Response(
                {"detail": "rationale e obrigatorio para rejeitar a associacao."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link = self.get_object()
        link.reject(rationale, request_user_or_none(request))
        link.save(update_fields=["validation_status", "rationale", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="mark-deprecated")
    def mark_deprecated(self, request, pk=None):
        link = self.get_object()
        link.mark_deprecated(request_user_or_none(request))
        link.save(update_fields=["validation_status", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)


class MechanismEvidenceRequirementViewSet(viewsets.ModelViewSet):
    serializer_class = MechanismEvidenceRequirementSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "mechanism": ["exact", "isnull"],
        "evidence_type": ["exact"],
        "mechanism_type": ["exact"],
        "control_domain": ["exact", "icontains"],
        "priority": ["exact"],
        "source": ["exact"],
        "is_active": ["exact"],
    }
    search_fields = [
        "title",
        "description",
        "rationale",
        "control_domain",
        "mechanism__title",
        "mechanism__description",
    ]
    ordering_fields = [
        "title",
        "evidence_type",
        "mechanism_type",
        "control_domain",
        "priority",
        "source",
        "is_active",
        "created_at",
        "updated_at",
    ]
    ordering = ["priority", "title"]

    def get_queryset(self):
        return MechanismEvidenceRequirement.objects.select_related("mechanism").all()

    @action(detail=False, methods=["get"], url_path="suggest")
    def suggest(self, request):
        mechanism_id = request.query_params.get("mechanism")
        if not mechanism_id:
            return Response({"detail": "mechanism e obrigatorio."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mechanism = Mechanism.objects.prefetch_related("tags").get(pk=mechanism_id)
        except Mechanism.DoesNotExist:
            return Response({"detail": "Mecanismo nao encontrado."}, status=status.HTTP_404_NOT_FOUND)

        control_domain = str(request.query_params.get("control_domain") or "")
        try:
            limit = int(request.query_params.get("limit") or 6)
        except (TypeError, ValueError):
            limit = 6

        queryset = self.get_queryset().filter(is_active=True)
        exact = list(queryset.filter(mechanism=mechanism))
        templates = [
            requirement
            for requirement in queryset.filter(mechanism__isnull=True)
            if requirement.matches_mechanism(mechanism, control_domain)
        ]

        seen = set()
        results = []
        for requirement in exact + templates:
            if requirement.id in seen:
                continue
            seen.add(requirement.id)
            results.append(requirement)
            if len(results) >= limit:
                break

        return Response(self.get_serializer(results, many=True).data)


class MechanismEvidenceViewSet(viewsets.ModelViewSet):
    queryset = MechanismEvidence.objects.all()
    serializer_class = MechanismEvidenceSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {"control_mechanism": ["exact"]}

    def perform_create(self, serializer):
        instance = serializer.save()
        refresh_control_gap(instance.control_mechanism.control)

    def perform_update(self, serializer):
        instance = serializer.save()
        refresh_control_gap(instance.control_mechanism.control)

    def perform_destroy(self, instance):
        control = instance.control_mechanism.control
        instance.delete()
        refresh_control_gap(control)


class ComplianceGapViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ComplianceGapSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['framework', 'control', 'status']
    search_fields = ['control__code', 'control__title']
    ordering_fields = ['confidence_score', 'evidence_count', 'last_evaluated', 'status_rank']

    def get_queryset(self):
        return (
            ComplianceGap.objects.select_related('control', 'framework')
            .annotate(
                status_rank=Case(
                    When(status='MISSING', then=0),
                    When(status='PARTIAL', then=1),
                    When(status='IMPLEMENTED', then=2),
                    default=3,
                    output_field=IntegerField(),
                )
            )
            .order_by('status_rank', 'evidence_count', 'framework__code', 'control__code')
        )

    @action(detail=False, methods=['post'])
    def analyze(self, request):
        results = ComplianceGapEngine.evaluate_all()
        return Response({"detail": "Analysis complete", "results": results})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        framework_id = request.query_params.get('framework')
        qs = self.get_queryset()
        framework_name = "All Frameworks"
        if framework_id:
            qs = qs.filter(framework_id=framework_id)
            framework_obj = Framework.objects.filter(id=framework_id).first()
            if framework_obj:
                framework_name = framework_obj.name
        total = qs.count()
        missing = qs.filter(status='MISSING').count()
        partial = qs.filter(status='PARTIAL').count()
        implemented = qs.filter(status='IMPLEMENTED').count()
        score = 0.0
        if total > 0:
            score = (implemented + 0.5 * partial) / total * 100
        return Response({
            "framework": framework_name,
            "total": total,
            "missing": missing,
            "partial": partial,
            "implemented": implemented,
            "score": round(score, 1)
        })


class ControlAssessmentViewSet(viewsets.ModelViewSet):
    serializer_class = ControlAssessmentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['profile', 'control', 'implementation_status']
    search_fields = ['control__code', 'control__title', 'notes', 'assessed_by']
    ordering_fields = [
        'control__code',
        'implementation_status',
        'maturity_level',
        'effectiveness',
        'risk_residual',
        'assessed_at',
        'updated_at',
    ]
    ordering = ['control__framework__code', 'control__code']

    def get_queryset(self):
        qs = (
            ControlAssessment.objects.select_related(
                'profile',
                'profile__framework',
                'control',
                'control__framework',
            )
            .prefetch_related('evidence', 'findings', 'actions')
            .all()
        )

        framework = self.request.query_params.get('framework')
        if framework:
            qs = qs.filter(control__framework_id=framework)

        profile_type = self.request.query_params.get('profile_type')
        if profile_type:
            qs = qs.filter(profile__name=profile_type)

        gap_status = self.request.query_params.get('gap_status')
        if gap_status:
            control_ids = ComplianceGap.objects.filter(status=gap_status).values_list('control_id', flat=True)
            qs = qs.filter(control_id__in=control_ids)

        return qs

    def perform_update(self, serializer):
        instance = serializer.save(
            assessed_at=serializer.validated_data.get('assessed_at') or timezone.now()
        )
        ComplianceGapEngine.evaluate_control(instance.control.framework, instance.control)

    @action(detail=False, methods=['post'])
    def bootstrap(self, request):
        framework_id = request.data.get('framework')
        profile_type = request.data.get('profile_type') or FrameworkProfile.ProfileType.BASELINE
        maturity_model = request.data.get('maturity_model') or 'Virtual CISO'

        if not framework_id:
            return Response({"detail": "framework e obrigatorio."}, status=status.HTTP_400_BAD_REQUEST)

        framework = Framework.objects.filter(id=framework_id).first()
        if not framework:
            return Response({"detail": "Framework nao encontrada."}, status=status.HTTP_404_NOT_FOUND)

        profile, _created = FrameworkProfile.objects.get_or_create(
            framework=framework,
            name=profile_type,
            defaults={"maturity_model": maturity_model, "max_level": 5},
        )

        controls = Control.objects.filter(framework=framework, status=Control.Status.ACTIVE).order_by('code')
        created_count = 0
        existing_count = 0

        for control in controls:
            _assessment, created = ControlAssessment.objects.get_or_create(
                profile=profile,
                control=control,
                defaults={
                    "implementation_status": ControlAssessment.ImplementationStatus.NOT_STARTED,
                    "maturity_level": 0,
                    "effectiveness": 0,
                    "risk_inherent": 0,
                    "risk_residual": 0,
                },
            )
            if created:
                created_count += 1
            else:
                existing_count += 1

        return Response({
            "detail": "Avaliacoes inicializadas.",
            "framework": str(framework.id),
            "profile": str(profile.id),
            "created": created_count,
            "existing": existing_count,
            "total_controls": controls.count(),
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.filter_queryset(self.get_queryset())
        total = qs.count()
        implemented = qs.filter(
            implementation_status__in=[
                ControlAssessment.ImplementationStatus.IMPLEMENTED,
                ControlAssessment.ImplementationStatus.OPTIMIZED,
            ]
        ).count()
        partial = qs.filter(implementation_status=ControlAssessment.ImplementationStatus.PARTIAL).count()
        planned = qs.filter(implementation_status=ControlAssessment.ImplementationStatus.PLANNED).count()
        not_started = qs.filter(implementation_status=ControlAssessment.ImplementationStatus.NOT_STARTED).count()
        with_evidence = qs.filter(evidence__isnull=False).distinct().count()
        with_open_findings = qs.filter(findings__status=Finding.Status.OPEN).distinct().count()
        actions_open = ImprovementAction.objects.filter(
            assessment__in=qs
        ).exclude(status=ImprovementAction.Status.DONE).count()

        score = 0.0
        if total:
            score = ((implemented + 0.5 * partial + 0.25 * planned) / total) * 100

        return Response({
            "total": total,
            "implemented": implemented,
            "partial": partial,
            "planned": planned,
            "not_started": not_started,
            "with_evidence": with_evidence,
            "with_open_findings": with_open_findings,
            "actions_open": actions_open,
            "score": round(score, 1),
        })

    @action(detail=True, methods=['get'])
    def recommendation(self, request, pk=None):
        assessment = self.get_object()
        return Response(AssessmentAdvisor.recommend(assessment))


def reevaluate_assessment_gap(assessment):
    ComplianceGapEngine.evaluate_control(assessment.control.framework, assessment.control)


class AssessmentEvidenceViewSet(viewsets.ModelViewSet):
    serializer_class = AssessmentEvidenceSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['assessment', 'evidence_type']
    search_fields = ['title', 'uri', 'hash_sha256']
    ordering_fields = ['collected_at', 'created_at', 'updated_at']

    def get_queryset(self):
        return Evidence.objects.select_related('assessment', 'assessment__control', 'assessment__profile').all()

    def perform_create(self, serializer):
        instance = serializer.save()
        reevaluate_assessment_gap(instance.assessment)

    def perform_update(self, serializer):
        instance = serializer.save()
        reevaluate_assessment_gap(instance.assessment)

    def perform_destroy(self, instance):
        assessment = instance.assessment
        instance.delete()
        reevaluate_assessment_gap(assessment)


class AssessmentFindingViewSet(viewsets.ModelViewSet):
    serializer_class = AssessmentFindingSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['assessment', 'severity', 'status']
    search_fields = ['title', 'description', 'reference']
    ordering_fields = ['severity', 'status', 'opened_at', 'closed_at', 'created_at']

    def get_queryset(self):
        return Finding.objects.select_related('assessment', 'assessment__control', 'assessment__profile').all()

    def perform_create(self, serializer):
        instance = serializer.save()
        reevaluate_assessment_gap(instance.assessment)

    def perform_update(self, serializer):
        instance = serializer.save()
        reevaluate_assessment_gap(instance.assessment)

    def perform_destroy(self, instance):
        assessment = instance.assessment
        instance.delete()
        reevaluate_assessment_gap(assessment)


class ImprovementActionViewSet(viewsets.ModelViewSet):
    serializer_class = ImprovementActionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['assessment', 'status', 'owner']
    search_fields = ['title', 'plan', 'owner']
    ordering_fields = ['due_date', 'status', 'created_at', 'updated_at']

    def get_queryset(self):
        return ImprovementAction.objects.select_related('assessment', 'assessment__control', 'assessment__profile').all()


class OrganizationContextViewSet(viewsets.ModelViewSet):
    queryset = CompanyProfile.objects.all()
    serializer_class = OrganizationContextSerializer

    def get_object(self):
        obj = CompanyProfile.objects.first()
        if not obj:
            obj = CompanyProfile.objects.create(legal_name="Nova Organização")
        return obj

    @action(detail=False, methods=['get'])
    def current(self, request):
        obj = self.get_object()
        serializer = self.get_serializer(obj)
        return Response(serializer.data)


class RegulatoryContextViewSet(viewsets.ModelViewSet):
    queryset = RegulatoryContext.objects.all()
    serializer_class = RegulatoryContextSerializer

    def get_object(self):
        org = CompanyProfile.objects.first()
        if not org:
            org = CompanyProfile.objects.create(legal_name="Nova Organização")
        obj, created = RegulatoryContext.objects.get_or_create(organization=org)
        return obj

    @action(detail=False, methods=['get'])
    def current(self, request):
        obj = self.get_object()
        serializer = self.get_serializer(obj)
        return Response(serializer.data)


class StakeholderViewSet(viewsets.ModelViewSet):
    queryset = Stakeholder.objects.all()
    serializer_class = StakeholderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['stakeholder_type']
    search_fields = ['name', 'responsibility']


class PolicyViewSet(viewsets.ModelViewSet):
    queryset = Policy.objects.select_related('owner_person', 'owner_org_unit', 'accountable_person').all().order_by('code')
    serializer_class = PolicySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'owner', 'owner_person', 'owner_org_unit', 'accountable_person']
    search_fields = ['code', 'title', 'description', 'owner', 'owner_person__name', 'owner_org_unit__name']
    ordering_fields = ['code', 'title', 'next_review_date', 'status']

    @action(detail=True, methods=['get'])
    def recommend_controls(self, request, pk=None):
        results = GovernanceAIAssistant.recommend_controls_for_policy(pk)
        if "error" in results:
            return Response(results, status=500)
        return Response(results)

    @action(detail=True, methods=['get'], url_path='internal-controls')
    def internal_controls(self, request, pk=None):
        policy = self.get_object()
        links = PolicyInternalControl.objects.select_related(
            "policy",
            "internal_control",
            "created_by",
            "updated_by",
            "validated_by",
        ).filter(policy=policy)
        links = links.exclude(
            validation_status__in=[
                PolicyInternalControl.ValidationStatus.REJECTED,
                PolicyInternalControl.ValidationStatus.DEPRECATED,
            ]
        )
        serializer = PolicyInternalControlSerializer(links, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def evidence(self, request, pk=None):
        policy = self.get_object()
        return evidence_links_response(EvidenceLink.TargetType.POLICY, policy.id)


class PolicyControlViewSet(viewsets.ModelViewSet):
    queryset = PolicyControl.objects.select_related('policy', 'control').all()
    serializer_class = PolicyControlSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['policy', 'control', 'priority']


class PolicyInternalControlViewSet(viewsets.ModelViewSet):
    serializer_class = PolicyInternalControlSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "policy": ["exact"],
        "internal_control": ["exact"],
        "applicability": ["exact"],
        "mapping_source": ["exact"],
        "validation_status": ["exact"],
        "internal_control__status": ["exact"],
        "internal_control__source": ["exact"],
        "internal_control__control_domain": ["exact", "icontains"],
    }
    search_fields = [
        "policy__code",
        "policy__title",
        "policy__description",
        "internal_control__code",
        "internal_control__title",
        "internal_control__description",
        "internal_control__control_domain",
        "rationale",
    ]
    ordering_fields = [
        "policy__code",
        "internal_control__code",
        "applicability",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "created_at",
        "updated_at",
        "validated_at",
    ]
    ordering = ["policy__code", "internal_control__code"]

    def get_queryset(self):
        qs = PolicyInternalControl.objects.select_related(
            "policy",
            "internal_control",
            "created_by",
            "updated_by",
            "validated_by",
        )
        qs = filter_active_internal_controls(self.request, qs, self)
        return exclude_inactive_mappings(self.request, qs, PolicyInternalControl, self)

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(
            mapping_source=PolicyInternalControl.MappingSource.MANUAL,
            validation_status=PolicyInternalControl.ValidationStatus.DRAFT,
            created_by=user,
            updated_by=user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=request_user_or_none(self.request))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        link = self.get_object()
        link.approve(request_user_or_none(request))
        link.save(update_fields=["validation_status", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        rationale = str(request.data.get("rationale") or "").strip()
        if not rationale:
            return Response(
                {"detail": "rationale e obrigatorio para rejeitar a associacao."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link = self.get_object()
        link.reject(rationale, request_user_or_none(request))
        link.save(update_fields=["validation_status", "rationale", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="mark-deprecated")
    def mark_deprecated(self, request, pk=None):
        link = self.get_object()
        link.mark_deprecated(request_user_or_none(request))
        link.save(update_fields=["validation_status", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)


class GovernanceDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = GovernanceDocumentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "document_type": ["exact"],
        "status": ["exact"],
        "owner": ["exact", "icontains"],
        "parent_document": ["exact", "isnull"],
        "is_active": ["exact"],
        "legacy_policy": ["exact"],
        "legacy_technical_regulation": ["exact"],
        "legacy_procedure": ["exact"],
    }
    search_fields = [
        "title",
        "owner",
        "scope",
        "purpose",
        "content",
        "legacy_policy__code",
        "legacy_policy__title",
        "legacy_technical_regulation__code",
        "legacy_technical_regulation__title",
        "legacy_procedure__code",
        "legacy_procedure__title",
    ]
    ordering_fields = [
        "title",
        "document_type",
        "status",
        "owner",
        "version",
        "approval_date",
        "review_date",
        "is_active",
        "created_at",
        "updated_at",
    ]
    ordering = ["document_type", "title"]

    def get_queryset(self):
        return (
            GovernanceDocument.objects
            .select_related(
                "parent_document",
                "legacy_policy",
                "legacy_technical_regulation",
                "legacy_procedure",
            )
            .prefetch_related("children", "sections", "control_links", "runbook_steps")
            .all()
        )

    @action(detail=True, methods=["get"], url_path="internal-controls")
    def internal_controls(self, request, pk=None):
        document = self.get_object()
        links = GovernanceDocumentControl.objects.select_related(
            "document",
            "internal_control",
            "created_by",
            "updated_by",
            "validated_by",
        ).filter(document=document)
        links = links.exclude(
            validation_status__in=[
                GovernanceDocumentControl.ValidationStatus.REJECTED,
                GovernanceDocumentControl.ValidationStatus.DEPRECATED,
            ]
        )
        serializer = GovernanceDocumentControlSerializer(links, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def children(self, request, pk=None):
        document = self.get_object()
        serializer = self.get_serializer(document.children.all(), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def sections(self, request, pk=None):
        document = self.get_object()
        sections = GovernanceDocumentSection.objects.filter(document=document).select_related("document", "parent_section")
        serializer = GovernanceDocumentSectionSerializer(sections, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="runbook-steps")
    def runbook_steps(self, request, pk=None):
        document = self.get_object()
        steps = RunbookStep.objects.filter(runbook=document).select_related("runbook")
        serializer = RunbookStepSerializer(steps, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def evidence(self, request, pk=None):
        document = self.get_object()
        return evidence_links_response(EvidenceLink.TargetType.GOVERNANCE_DOCUMENT, document.id)


class GovernanceDocumentControlViewSet(viewsets.ModelViewSet):
    serializer_class = GovernanceDocumentControlSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "document": ["exact"],
        "internal_control": ["exact"],
        "purpose": ["exact"],
        "mapping_source": ["exact"],
        "validation_status": ["exact"],
        "document__document_type": ["exact"],
        "document__status": ["exact"],
        "internal_control__status": ["exact"],
        "internal_control__source": ["exact"],
        "internal_control__control_domain": ["exact", "icontains"],
    }
    search_fields = [
        "document__title",
        "document__content",
        "document__owner",
        "internal_control__code",
        "internal_control__title",
        "internal_control__description",
        "rationale",
    ]
    ordering_fields = [
        "document__title",
        "internal_control__code",
        "purpose",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "created_at",
        "updated_at",
        "validated_at",
    ]
    ordering = ["document__title", "internal_control__code", "purpose"]

    def get_queryset(self):
        qs = GovernanceDocumentControl.objects.select_related(
            "document",
            "internal_control",
            "created_by",
            "updated_by",
            "validated_by",
        )
        qs = filter_active_internal_controls(self.request, qs, self)
        return exclude_inactive_mappings(self.request, qs, GovernanceDocumentControl, self)

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(
            mapping_source=GovernanceDocumentControl.MappingSource.MANUAL,
            validation_status=GovernanceDocumentControl.ValidationStatus.DRAFT,
            created_by=user,
            updated_by=user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=request_user_or_none(self.request))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        link = self.get_object()
        link.approve(request_user_or_none(request))
        link.save(update_fields=["validation_status", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        rationale = str(request.data.get("rationale") or "").strip()
        if not rationale:
            return Response(
                {"detail": "rationale e obrigatorio para rejeitar a associacao."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link = self.get_object()
        link.reject(rationale, request_user_or_none(request))
        link.save(update_fields=["validation_status", "rationale", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="mark-deprecated")
    def mark_deprecated(self, request, pk=None):
        link = self.get_object()
        link.mark_deprecated(request_user_or_none(request))
        link.save(update_fields=["validation_status", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)


class GovernanceDocumentSectionViewSet(viewsets.ModelViewSet):
    queryset = GovernanceDocumentSection.objects.select_related("document", "parent_section").all()
    serializer_class = GovernanceDocumentSectionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "document": ["exact"],
        "parent_section": ["exact", "isnull"],
    }
    search_fields = ["section_number", "title", "content", "document__title"]
    ordering_fields = ["document__title", "section_number", "title", "order", "created_at", "updated_at"]
    ordering = ["document__title", "order", "section_number"]


class RunbookStepViewSet(viewsets.ModelViewSet):
    queryset = RunbookStep.objects.select_related("runbook").all()
    serializer_class = RunbookStepSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "runbook": ["exact"],
        "evidence_required": ["exact"],
    }
    search_fields = ["title", "description", "expected_output", "runbook__title"]
    ordering_fields = ["runbook__title", "step_number", "title", "created_at", "updated_at"]
    ordering = ["runbook__title", "step_number"]

    @action(detail=True, methods=["get"])
    def evidence(self, request, pk=None):
        step = self.get_object()
        return evidence_links_response(EvidenceLink.TargetType.RUNBOOK_STEP, step.id)


class ImplementationMechanismViewSet(viewsets.ModelViewSet):
    queryset = ImplementationMechanism.objects.select_related('policy_control').all()
    serializer_class = ImplementationMechanismSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['policy_control', 'mechanism_type', 'implementation_status']
    search_fields = ['name', 'description']


class PolicyEvidenceViewSet(viewsets.ModelViewSet):
    queryset = PolicyEvidence.objects.select_related('mechanism').all()
    serializer_class = PolicyEvidenceSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['mechanism', 'evidence_type', 'status']
    search_fields = ['title', 'description']


class PolicyAssessmentViewSet(viewsets.ModelViewSet):
    queryset = PolicyAssessment.objects.select_related('policy').all()
    serializer_class = PolicyAssessmentSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['policy', 'overall_status']


class TechnicalRegulationViewSet(viewsets.ModelViewSet):
    queryset = TechnicalRegulation.objects.all()
    serializer_class = TechnicalRegulationSerializer


class ProcedureViewSet(viewsets.ModelViewSet):
    queryset = Procedure.objects.all()
    serializer_class = ProcedureSerializer

class PolicySectionViewSet(viewsets.ModelViewSet):
    queryset = PolicySection.objects.all()
    serializer_class = PolicySectionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['policy', 'parent']


class DecisionRecordViewSet(viewsets.ModelViewSet):
    queryset = DecisionRecord.objects.all()
    serializer_class = DecisionRecordSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['decision_type', 'decision', 'target_type', 'target_id', 'responsible', 'due_date']
    search_fields = [
        'title',
        'recommendation',
        'rationale',
        'justification',
        'responsible',
        'risk_impact',
        'compliance_impact',
        'evidence_reference',
        'action_reference',
        'decided_by',
    ]
    ordering_fields = ['created_at', 'updated_at', 'decided_at', 'due_date']

    def perform_create(self, serializer):
        decided_by = serializer.validated_data.get('decided_by')
        if not decided_by and self.request.user and self.request.user.is_authenticated:
            decided_by = self.request.user.get_username()
        responsible = serializer.validated_data.get('responsible')
        serializer.save(
            decided_by=decided_by or 'system',
            responsible=responsible or decided_by or 'system',
        )


class GovernanceExceptionViewSet(viewsets.ModelViewSet):
    queryset = GovernanceException.objects.all()
    serializer_class = GovernanceExceptionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "exception_type",
        "target_type",
        "target_id",
        "approval_status",
        "owner",
        "approver",
        "valid_until",
    ]
    search_fields = [
        "title",
        "description",
        "business_justification",
        "compensating_control_description",
        "risk_impact",
        "compliance_impact",
        "evidence_reference",
        "action_reference",
        "owner",
        "approver",
        "target_id",
    ]
    ordering_fields = [
        "created_at",
        "updated_at",
        "valid_from",
        "valid_until",
        "approved_at",
        "score_impact",
    ]

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(created_by=user, updated_by=user)

    def perform_update(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(updated_by=user)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        exception = self.get_object()
        if not exception.valid_until:
            return Response(
                {"valid_until": "Define um prazo de validade antes de aprovar a excecao."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if exception.valid_until < timezone.localdate():
            return Response(
                {"valid_until": "Nao e possivel aprovar uma excecao com prazo expirado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not exception.business_justification.strip():
            return Response(
                {"business_justification": "A justificacao de negocio e obrigatoria para aprovacao."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.data.get("review_note"):
            exception.review_note = request.data.get("review_note")
        exception.approve(request_user_or_none(request))
        exception.save()
        return Response(self.get_serializer(exception).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        exception = self.get_object()
        review_note = str(request.data.get("review_note", "")).strip()
        if not review_note:
            return Response(
                {"review_note": "Indica a justificacao da rejeicao."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        exception.reject(review_note=review_note, user=request_user_or_none(request))
        exception.save()
        return Response(self.get_serializer(exception).data)

    @action(detail=True, methods=["post"], url_path="revoke")
    def revoke_exception(self, request, pk=None):
        exception = self.get_object()
        review_note = str(request.data.get("review_note", "")).strip()
        exception.revoke(review_note=review_note, user=request_user_or_none(request))
        exception.save()
        return Response(self.get_serializer(exception).data)

    @action(detail=True, methods=["post"], url_path="mark-expired")
    def mark_expired(self, request, pk=None):
        exception = self.get_object()
        exception.mark_expired(request_user_or_none(request))
        exception.save()
        return Response(self.get_serializer(exception).data)


class GovernanceRiskLinkViewSet(viewsets.ModelViewSet):
    queryset = GovernanceRiskLink.objects.select_related(
        "created_by",
        "updated_by",
        "validated_by",
    ).all()
    serializer_class = GovernanceRiskLinkSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "source_type": ["exact"],
        "source_id": ["exact"],
        "target_type": ["exact"],
        "target_id": ["exact"],
        "relationship_type": ["exact"],
        "mapping_source": ["exact"],
        "validation_status": ["exact"],
    }
    search_fields = [
        "source_id",
        "target_id",
        "rationale",
    ]
    ordering_fields = [
        "created_at",
        "updated_at",
        "validated_at",
        "effectiveness_percentage",
        "residual_impact_percentage",
        "confidence_score",
    ]
    ordering = ["target_type", "target_id", "source_type", "source_id"]

    def get_queryset(self):
        qs = super().get_queryset()
        return exclude_inactive_mappings(self.request, qs, GovernanceRiskLink, self)

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(
            mapping_source=GovernanceRiskLink.MappingSource.MANUAL,
            validation_status=GovernanceRiskLink.ValidationStatus.DRAFT,
            created_by=user,
            updated_by=user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=request_user_or_none(self.request))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        link = self.get_object()
        link.approve(request_user_or_none(request))
        link.save(update_fields=["validation_status", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        rationale = str(request.data.get("rationale") or "").strip()
        if not rationale:
            return Response(
                {"detail": "rationale e obrigatorio para rejeitar a ligacao ao risco."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link = self.get_object()
        link.reject(rationale, request_user_or_none(request))
        link.save(update_fields=["validation_status", "rationale", "validated_by", "validated_at", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)

    @action(detail=True, methods=["post"], url_path="mark-deprecated")
    def mark_deprecated(self, request, pk=None):
        link = self.get_object()
        link.mark_deprecated(request_user_or_none(request))
        link.save(update_fields=["validation_status", "updated_by", "updated_at"])
        return Response(self.get_serializer(link).data)


class GovernanceActionViewSet(viewsets.ModelViewSet):
    queryset = GovernanceAction.objects.select_related(
        "linked_decision",
        "linked_exception",
        "created_by",
        "updated_by",
        "completed_by",
    ).all()
    serializer_class = GovernanceActionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "action_type",
        "priority",
        "status",
        "source_type",
        "source_key",
        "owner",
        "due_date",
        "target_type",
        "target_id",
        "linked_decision",
        "linked_exception",
    ]
    search_fields = [
        "title",
        "description",
        "recommendation",
        "owner",
        "notes",
        "source_key",
        "target_id",
    ]
    ordering_fields = [
        "created_at",
        "updated_at",
        "due_date",
        "completed_at",
        "priority",
        "status",
        "action_type",
    ]

    def perform_create(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(created_by=user, updated_by=user)

    def perform_update(self, serializer):
        user = request_user_or_none(self.request)
        serializer.save(updated_by=user)

    def _set_status(self, request, new_status):
        action_item = self.get_object()
        if request.data.get("notes"):
            note = str(request.data.get("notes", "")).strip()
            action_item.notes = f"{action_item.notes}\n{note}".strip() if action_item.notes else note
        if request.data.get("due_date"):
            action_item.due_date = request.data.get("due_date")
        action_item.set_status(new_status, request_user_or_none(request))
        action_item.save()
        return Response(self.get_serializer(action_item).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        return self._set_status(request, GovernanceAction.Status.IN_PROGRESS)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        return self._set_status(request, GovernanceAction.Status.DONE)

    @action(detail=True, methods=["post"])
    def block(self, request, pk=None):
        return self._set_status(request, GovernanceAction.Status.BLOCKED)

    @action(detail=True, methods=["post"])
    def defer(self, request, pk=None):
        return self._set_status(request, GovernanceAction.Status.DEFERRED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._set_status(request, GovernanceAction.Status.CANCELLED)

    @action(detail=False, methods=["post"], url_path="generate-from-workbench")
    def generate_from_workbench(self, request):
        result = GovernanceActionPlanService.generate_from_workbench(
            owner=request.data.get("owner") or None,
            user=request_user_or_none(request),
        )
        serializer = self.get_serializer(result["actions"], many=True)
        return Response(
            {
                "created": result["created"],
                "updated": result["updated"],
                "skipped": result["skipped"],
                "total": result["total"],
                "actions": serializer.data,
            }
        )

    @action(detail=False, methods=["post"], url_path="generate-mechanism-tasks")
    def generate_mechanism_tasks(self, request):
        owner = request.data.get("owner") or ""
        force_value = str(request.data.get("force", "")).strip().lower()
        force = query_bool(request, "force", False) or force_value in {"1", "true", "yes", "on"}
        mechanism_id = request.data.get("mechanism_id") or None
        mechanisms = Mechanism.objects.all().order_by("title")
        if mechanism_id:
            mechanisms = mechanisms.filter(id=mechanism_id)

        created = 0
        updated = 0
        skipped = 0
        actions = []
        for mechanism in mechanisms:
            has_active_plan = (
                GovernanceAction.objects
                .filter(target_type="mechanism", target_id=str(mechanism.id))
                .exclude(status__in=[GovernanceAction.Status.DONE, GovernanceAction.Status.CANCELLED])
                .exists()
            )
            if has_active_plan and not force:
                skipped += 1
                continue

            result = MechanismImplementationPlanner.create_template_actions(
                mechanism,
                owner=owner,
                user=request_user_or_none(request),
            )
            created += result["created"]
            updated += result["updated"]
            skipped += result["skipped"]
            actions.extend(result["actions"])

        return Response({
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(actions),
            "actions": self.get_serializer(actions, many=True).data,
        })
