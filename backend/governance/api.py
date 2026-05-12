from rest_framework import status, viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Case, Count, IntegerField, Q, When
from django.utils import timezone

from .models import (
    Framework, Control, ControlMapping, Mechanism, ControlMechanism, MechanismEvidence,
    Policy, PolicyControl, ImplementationMechanism, PolicyEvidence, PolicyAssessment, PolicySection,
    ComplianceGap, RegulatoryContext, Stakeholder, TechnicalRegulation, Procedure, DecisionRecord,
    FrameworkProfile, ControlAssessment, Evidence, Finding, ImprovementAction
)
from .serializers import (
    FrameworkSerializer, ControlSerializer, 
    ControlMappingSerializer,
    MechanismSerializer, ControlMechanismSerializer,
    MechanismEvidenceSerializer, ComplianceGapSerializer,
    RegulatoryContextSerializer, StakeholderSerializer,
    PolicySerializer, PolicyControlSerializer, 
    ImplementationMechanismSerializer, PolicyEvidenceSerializer,
    PolicyAssessmentSerializer, TechnicalRegulationSerializer, ProcedureSerializer,
    OrganizationContextSerializer, PolicySectionSerializer, DecisionRecordSerializer,
    ControlAssessmentSerializer, AssessmentEvidenceSerializer,
    AssessmentFindingSerializer, ImprovementActionSerializer
)
from .services.compliance_gap_engine import ComplianceGapEngine
from .services.control_mapping_engine import ControlMappingEngine
from .services.evidence_assignment_engine import EvidenceAssignmentEngine
from .services.assessment_advisor import AssessmentAdvisor
from .services.ai_assistant import GovernanceAIAssistant
from company.models.company import CompanyProfile


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


class ControlMechanismViewSet(viewsets.ModelViewSet):
    queryset = ControlMechanism.objects.select_related("mechanism", "control").prefetch_related("evidences").all()
    serializer_class = ControlMechanismSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {"control": ["exact"], "mechanism": ["exact"], "status": ["exact"]}

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


class MechanismEvidenceViewSet(viewsets.ModelViewSet):
    queryset = MechanismEvidence.objects.all()
    serializer_class = MechanismEvidenceSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {"control_mechanism": ["exact"]}


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
            obj = CompanyProfile.objects.create(legal_name="Nova OrganizaÃ§Ã£o")
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
            org = CompanyProfile.objects.create(legal_name="Nova OrganizaÃ§Ã£o")
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
    queryset = Policy.objects.all().order_by('code')
    serializer_class = PolicySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'owner']
    search_fields = ['code', 'title', 'description']
    ordering_fields = ['code', 'title', 'next_review_date', 'status']

    @action(detail=True, methods=['get'])
    def recommend_controls(self, request, pk=None):
        results = GovernanceAIAssistant.recommend_controls_for_policy(pk)
        if "error" in results:
            return Response(results, status=500)
        return Response(results)


class PolicyControlViewSet(viewsets.ModelViewSet):
    queryset = PolicyControl.objects.select_related('policy', 'control').all()
    serializer_class = PolicyControlSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['policy', 'control', 'priority']


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
    filterset_fields = ['decision_type', 'decision', 'target_type', 'target_id']
    search_fields = ['title', 'recommendation', 'rationale', 'justification', 'decided_by']
    ordering_fields = ['created_at', 'updated_at', 'decided_at']

    def perform_create(self, serializer):
        decided_by = serializer.validated_data.get('decided_by')
        if not decided_by and self.request.user and self.request.user.is_authenticated:
            decided_by = self.request.user.get_username()
        serializer.save(decided_by=decided_by or 'system')

