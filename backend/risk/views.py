import re
import logging
import subprocess
import sys
from pathlib import Path

from rest_framework import viewsets, filters, status

from rest_framework.decorators import action, api_view

from rest_framework.response import Response

from django_filters.rest_framework import DjangoFilterBackend

from django.conf import settings

from django.utils import timezone

from django.db.models import Count, F, Q, Max, Case, When, Value, CharField

from django.db import transaction

from .models.asset import Asset, AssetCategory, AssetType, AssetHistory, RiskConfiguration

from .models.discovery import (
    AssetClassificationReview,
    AssetDiscoveryFinding,
    AssetDiscoveryRun,
    AssetExposureSnapshot,
)

from .models.software import Software

from .models.vulnerability import Vulnerability, AssetVulnerability, VulnerabilityHistory

from .models.risk import Risk, RiskFactor, RiskAssessment, RiskTreatment

from .models.network_range import NetworkRange

from .models.priority_model import PriorityModelConfig

from .models.asset_lookups import AssetLocation, AssetEnvironment, AssetInfrastructure

from .serializers import (

    AssetSerializer, AssetListSerializer, 

    SoftwareListSerializer, SoftwareDetailSerializer,

    VulnerabilitySerializer,

    AssetVulnerabilitySerializer, AssetVulnerabilityListSerializer,

    VulnerabilityHistorySerializer,

    RiskSerializer, RiskFactorSerializer, RiskAssessmentSerializer, RiskTreatmentSerializer,

    NetworkRangeSerializer,

    AssetCategorySerializer,

    AssetTypeSerializer,

    AssetLocationSerializer,

    AssetEnvironmentSerializer,

    AssetInfrastructureSerializer,

    RiskConfigurationSerializer,
    PriorityModelConfigSerializer,
    AttackVectorOverviewSerializer,

    AssetClassificationReviewSerializer,

    AssetDiscoveryFindingSerializer,

    AssetDiscoveryRunSerializer,

    AssetExposureSnapshotSerializer

)

from .services.wazuh_service import WazuhService

from .services.intel_service import IntelService

from .services.risk_engine import RiskEngineService

from .services.prioritization import VulnerabilityPrioritizationService, VulnerabilityScoringEngine
from .services.ciso_risk_panel import CisoRiskPanelService
from .services.attack_vector_risk import AttackVectorRiskService


logger = logging.getLogger(__name__)


def _start_management_command(command_name):
    manage_py = Path(settings.BASE_DIR) / "manage.py"
    subprocess.Popen([sys.executable, str(manage_py), command_name], cwd=str(settings.BASE_DIR))


def _start_wazuh_sync():
    _start_management_command("sync_wazuh_assets")
    _start_management_command("sync_wazuh_vulns")


def _attack_vector_horizon(request):
    try:
        return int(request.query_params.get("horizon_days", 30))
    except (TypeError, ValueError):
        return 30


@api_view(["GET"])
def attack_vector_catalog(request):
    return Response({"vectors": AttackVectorRiskService.catalog()})


@api_view(["GET"])
def attack_vector_overview(request):
    payload = AttackVectorRiskService.overview(horizon_days=_attack_vector_horizon(request))
    return Response(AttackVectorOverviewSerializer(payload).data)


@api_view(["GET"])
def attack_vector_detail(request, vector_id):
    payload = AttackVectorRiskService.detail(vector_id, horizon_days=_attack_vector_horizon(request))
    if payload is None:
        return Response({"detail": "Vetor de ataque nao encontrado."}, status=status.HTTP_404_NOT_FOUND)
    return Response(payload)



class RiskViewSet(viewsets.ModelViewSet):

    queryset = Risk.objects.select_related('asset', 'vulnerability').prefetch_related('factors', 'treatments').all()

    serializer_class = RiskSerializer

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    filterset_fields = ['status', 'risk_level', 'asset', 'vulnerability']

    search_fields = ['asset__name', 'vulnerability__cve_id', 'ai_explanation']

    ordering_fields = ['risk_score', 'created_at']

    ordering = ['-risk_score']



    @action(detail=True, methods=['post'])

    def recalculate(self, request, pk=None):

        risk = self.get_object()

        updated_risk = RiskEngineService.calculate_risk(risk.asset, risk.vulnerability)

        return Response(RiskSerializer(updated_risk).data)



    @action(detail=False, methods=['get'])

    def dashboard(self, request):

        total = Risk.objects.count()

        critical = Risk.objects.filter(risk_level='critical', status='open').count()

        high = Risk.objects.filter(risk_level='high', status='open').count()

        open_risks = Risk.objects.filter(status='open').count()

        

        # Distribution

        levels = Risk.objects.values('risk_level').annotate(count=Count('id'))

        

        # Top Assets by Risk

        top_assets = Risk.objects.values('asset__name').annotate(

            score=Max('risk_score')

        ).order_by('-score')[:5]



        return Response({

            "metrics": {

                "total": total,

                "critical": critical,

                "high": high,

                "open": open_risks

            },

            "distribution": levels,

            "top_assets": top_assets

        })


    @action(detail=False, methods=['get'], url_path='ciso-panel')

    def ciso_panel(self, request):

        try:

            priority_limit = int(request.query_params.get("priority_limit", 10))

        except (TypeError, ValueError):

            priority_limit = 10

        priority_limit = max(1, min(priority_limit, 25))

        return Response(CisoRiskPanelService.dashboard(priority_limit=priority_limit))



class RiskTreatmentViewSet(viewsets.ModelViewSet):

    queryset = RiskTreatment.objects.all()

    serializer_class = RiskTreatmentSerializer

    filterset_fields = ['risk', 'status', 'treatment_type']



class RiskAssessmentViewSet(viewsets.ModelViewSet):

    queryset = RiskAssessment.objects.all()

    serializer_class = RiskAssessmentSerializer

    filterset_fields = ['asset', 'overall_level']



class VulnerabilityViewSet(viewsets.ModelViewSet):

    """CVE Definition Dictionary annotated with asset counts"""

    queryset = Vulnerability.objects.annotate(

        affected_assets_count=Count('occurrences__asset', distinct=True),

        open_assets_count=Count('occurrences', filter=Q(occurrences__status='Open'), distinct=True),

        last_seen_date=Max('occurrences__last_seen')

    ).all()

    serializer_class = VulnerabilitySerializer

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    filterset_fields = ['severity', 'source']

    search_fields = ['cve_id', 'description']

    ordering_fields = ['cvss_score', 'cve_id', 'published_at']

    ordering = ['-cvss_score']


    def filter_queryset(self, queryset):

        queryset = super().filter_queryset(queryset)

        if self._truthy(self.request.query_params.get('missing_cvss')):
            queryset = queryset.filter(cvss_score__isnull=True)

        if self._truthy(self.request.query_params.get('missing_epss')):
            queryset = queryset.filter(epss_score__isnull=True)

        if self._truthy(self.request.query_params.get('missing_nvd')):
            queryset = queryset.filter(nvd_data__isnull=True)

        if self._truthy(self.request.query_params.get('missing_kev_check')):
            queryset = queryset.filter(kev_last_updated__isnull=True)

        if self._truthy(self.request.query_params.get('missing_mitigation')):
            queryset = queryset.filter(Q(mitigation__isnull=True) | Q(mitigation=''))

        if self._truthy(self.request.query_params.get('kev')):
            queryset = queryset.filter(is_in_kev=True)

        if self._truthy(self.request.query_params.get('missing_enrichment')):
            queryset = queryset.filter(
                Q(cvss_score__isnull=True)
                | Q(epss_score__isnull=True)
                | Q(nvd_data__isnull=True)
                | Q(mitigation__isnull=True)
                | Q(mitigation='')
            )

        if self._truthy(self.request.query_params.get('without_any_enrichment')):
            queryset = queryset.filter(
                cvss_score__isnull=True,
                epss_score__isnull=True,
                nvd_data__isnull=True,
                kev_last_updated__isnull=True,
            ).filter(Q(mitigation__isnull=True) | Q(mitigation=''))

        return queryset


    @staticmethod
    def _truthy(value):

        return str(value).lower() in {'1', 'true', 'yes', 'on'}


    @action(detail=False, methods=['get'])

    def intel_quality(self, request):

        return Response(IntelService.intel_quality())



    @action(detail=False, methods=['post'])

    def sync_wazuh(self, request):
        _start_wazuh_sync()

        

        return Response({"detail": "Processo de sincronização iniciado em background. A UI reportará os novos dados brevemente."})



    @action(detail=False, methods=['post'])

    def refresh_intel(self, request):

        import subprocess

        import sys

        

        subprocess.Popen([sys.executable, 'manage.py', 'sync_epss'])

        return Response({"detail": "Processo de atualização do EPSS iniciado em background. Verifique o estado nas definições de integração."})



    @action(detail=False, methods=['post'])

    def refresh_nvd(self, request):

        import subprocess

        import sys

        

        subprocess.Popen([sys.executable, 'manage.py', 'sync_nist'])

        return Response({"detail": "Processo de atualização com o NIST NVD iniciado em background. Verifique o estado nas definições de integração."})


    @action(detail=False, methods=['post'])

    def refresh_kev(self, request):

        import subprocess

        import sys

        subprocess.Popen([sys.executable, 'manage.py', 'sync_kev'])

        return Response({"detail": "Processo de atualização CISA KEV iniciado em background. Verifique o estado nas definições de integração."})



class AssetVulnerabilityViewSet(viewsets.ModelViewSet):

    """Occurrences of vulnerabilities on assets"""

    queryset = AssetVulnerability.objects.select_related('asset', 'vulnerability', 'software').all()

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    filterset_fields = ['status', 'asset', 'vulnerability', 'source']

    search_fields = ['vulnerability__cve_id', 'asset__name']

    ordering_fields = ['vulnerability__cvss_score', 'first_detected', 'last_seen']

    ordering = ['-vulnerability__cvss_score']



    def get_serializer_class(self):

        if self.action == 'list':

            return AssetVulnerabilityListSerializer

        return AssetVulnerabilitySerializer



    @action(detail=False, methods=['get'])

    def prioritized(self, request):

        try:

            limit = int(request.query_params.get('limit', 10))

        except (TypeError, ValueError):

            limit = 10

        limit = max(1, min(limit, 100))

        filters_payload = {}

        for key in [
            'asset_id',
            'asset_criticality',
            'severity',
            'status',
            'source',
            'occurrence_id',
            'detected_since_days',
            'candidate_limit',
        ]:

            value = request.query_params.get(key)

            if value:

                filters_payload[key] = value

        only_known_exploited = request.query_params.get('only_known_exploited')

        if only_known_exploited is not None:

            filters_payload['only_known_exploited'] = only_known_exploited.lower() in {

                '1', 'true', 'yes', 'on'

            }

        mode = request.query_params.get('mode') or 'explainable_weighted'
        if mode not in {'explainable_weighted', 'xgboost_experimental', 'xgboost_shap'}:
            return Response({"detail": "Modo de priorização inválido."}, status=status.HTTP_400_BAD_REQUEST)

        items = VulnerabilityPrioritizationService.get_top_vulnerabilities(

            limit=limit,

            filters=filters_payload,

            mode=mode,

        )

        return Response([item.to_dict() for item in items])



    @action(detail=True, methods=['post'])

    def change_status(self, request, pk=None):

        instance = self.get_object()

        new_status = request.data.get('status')

        notes = request.data.get('notes', '')

        

        if new_status not in [c[0] for c in AssetVulnerability.STATUS_CHOICES]:

            return Response({"detail": "Status inválido."}, status=status.HTTP_400_BAD_REQUEST)

            

        old_status = instance.status

        instance.status = new_status

        if new_status == 'Resolved' and not instance.resolved_at:

            instance.resolved_at = timezone.now()

        elif new_status != 'Resolved':

            instance.resolved_at = None

        instance.save()

        

        VulnerabilityHistory.objects.create(

            asset_vuln=instance,

            action=f"Status changed from {old_status} to {new_status}",

            user=request.user.username if request.user.is_authenticated else "system",

            notes=notes

        )

        return Response(AssetVulnerabilitySerializer(instance).data)


    @action(detail=True, methods=['get'], url_path='model-explanation')

    def model_explanation(self, request, pk=None):

        mode = request.query_params.get('mode') or 'explainable_weighted'
        if mode not in {'explainable_weighted', 'xgboost_experimental', 'xgboost_shap'}:
            return Response({"detail": "Modo de priorização inválido."}, status=status.HTTP_400_BAD_REQUEST)

        occurrence = self.get_object()
        score_data = VulnerabilityScoringEngine.calculate_scores(occurrence, mode=mode)
        vulnerability = occurrence.vulnerability
        asset = occurrence.asset

        return Response({
            "occurrence": {
                "id": str(occurrence.id),
                "status": occurrence.status,
                "source": occurrence.source,
                "first_detected": occurrence.first_detected,
                "last_seen": occurrence.last_seen,
            },
            "asset": {
                "id": str(asset.id),
                "name": asset.name,
                "criticality": asset.criticality,
                "classification_status": getattr(asset, "classification_status", None),
            },
            "vulnerability": {
                "id": str(vulnerability.id),
                "cve_id": vulnerability.cve_id,
                "severity": vulnerability.severity,
                "cvss_score": vulnerability.cvss_score,
                "epss_score": vulnerability.epss_score,
                "is_in_kev": vulnerability.is_in_kev,
            },
            "model": {
                "requested_mode": mode,
                "served_mode": score_data.get("model_mode"),
                "estimator_key": score_data.get("estimator_key"),
                "model_note": score_data.get("model_note"),
                "experimental_model": score_data.get("experimental_model", {}),
            },
            "scores": {
                "priority_score": score_data.get("priority_score"),
                "risk_score": score_data.get("risk_score"),
                "remediation_score": score_data.get("remediation_score"),
                "risk_breakdown": score_data.get("risk_breakdown", {}),
                "remediation_breakdown": score_data.get("remediation_breakdown", {}),
                "priority_summary": score_data.get("priority_summary"),
            },
            "contribution_breakdown": score_data.get("contribution_breakdown", []),
            "governance_context": score_data.get("governance_context", {}),
            "audit": {
                "target_type": "asset_vulnerability",
                "target_id": str(occurrence.id),
                "decision_context_url": f"/decisions/{occurrence.id}",
                "generated_at": timezone.now(),
                "statement": (
                    "Explicação auditável do modelo de priorização para esta ocorrência: "
                    "features, pesos explicáveis/SHAP quando aplicável, score e contexto de governação."
                ),
            },
        })



class SoftwareViewSet(viewsets.ModelViewSet):

    severity_order = Case(

        When(vulnerability_occurrences__vulnerability__severity='Critical', then=Value(5)),

        When(vulnerability_occurrences__vulnerability__severity='High', then=Value(4)),

        When(vulnerability_occurrences__vulnerability__severity='Medium', then=Value(3)),

        When(vulnerability_occurrences__vulnerability__severity='Low', then=Value(2)),

        default=Value(1)

    )



    queryset = Software.objects.annotate(

        assets_count_anno=Count('assets', distinct=True),

        vulnerabilities_count_anno=Count('vulnerability_occurrences', distinct=True),

        risk_score_anno=Max('vulnerability_occurrences__vulnerability__cvss_score'),

        max_severity_rank=Max(severity_order)

    ).annotate(

        max_severity_anno=Case(

            When(max_severity_rank=5, then=Value('Critical')),

            When(max_severity_rank=4, then=Value('High')),

            When(max_severity_rank=3, then=Value('Medium')),

            When(max_severity_rank=2, then=Value('Low')),

            default=Value('None'),

            output_field=CharField()

        )

    ).all()

    serializer_class = SoftwareListSerializer

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    filterset_fields = ['architecture', 'vendor']

    search_fields = ['name', 'version', 'vendor']

    ordering_fields = ['name', 'version', 'created_at', 'vulnerabilities_count_anno', 'assets_count_anno', 'vendor', 'risk_score_anno']

    ordering = ['name']



    def filter_queryset(self, queryset):

        queryset = super().filter_queryset(queryset)

        vuln_status = self.request.query_params.get('vulnerability_status')

        if vuln_status == 'vulnerable':

            queryset = queryset.filter(vulnerabilities_count_anno__gt=0)

        elif vuln_status == 'critical':

            queryset = queryset.filter(max_severity_anno='Critical')

        elif vuln_status == 'ok':

            queryset = queryset.filter(vulnerabilities_count_anno=0)

        return queryset



    def perform_create(self, serializer):

        software = serializer.save()

        SoftwareHistory.objects.create(

            software=software,

            action="Criado",

            details=f"Software registado no catálogo.",

            user=self.request.user.username if self.request.user.is_authenticated else "Sistema"

        )



    def perform_update(self, serializer):

        instance = self.get_object()

        old_data = {}

        for field in serializer.validated_data:

            if hasattr(instance, field):

                old_data[field] = getattr(instance, field)

        

        software = serializer.save()

        

        changes = []

        for field, old_value in old_data.items():

            new_value = getattr(software, field)

            if old_value != new_value:

                changes.append(f"Alterou {field}: '{old_value}' -> '{new_value}'")

        

        if changes:

            SoftwareHistory.objects.create(

                software=software,

                action="Atualização",

                details="\n".join(changes),

                user=self.request.user.username if self.request.user.is_authenticated else "Sistema"

            )



    @action(detail=False, methods=['get'])

    def stats(self, request):

        total_sw = Software.objects.count()

        vulnerable_sw = Software.objects.filter(vulnerability_occurrences__status='Open').order_by().distinct().count()

        critical_sw = Software.objects.filter(

            vulnerability_occurrences__vulnerability__severity='Critical',

            vulnerability_occurrences__status='Open'

        ).order_by().distinct().count()

        total_assets = Asset.objects.filter(installed_software__isnull=False).order_by().distinct().count()



        return Response({

            "total_software": total_sw,

            "vulnerable": vulnerable_sw,

            "critical_cves": critical_sw,

            "total_assets": total_assets

        })



    def get_serializer_class(self):

        if self.action in ['retrieve', 'update', 'partial_update']:

            return SoftwareDetailSerializer

        return SoftwareListSerializer



def _request_user_or_none(request):
    return request.user if getattr(request.user, "is_authenticated", False) else None


def _exposure_score_from_services(services):
    service_text = " ".join(str(service).lower() for service in services or [])
    internet_like = ("http", "https", "rdp", "ssh", "ftp", "smtp", "vpn")
    if any(token in service_text for token in internet_like):
        return 4
    return 2 if not services else 3


def _create_exposure_snapshot(asset, host_data, run=None, source="nmap"):
    services = host_data.get("services") or []
    vulnerabilities = host_data.get("vulnerabilities") or []
    snapshot = AssetExposureSnapshot.objects.create(
        asset=asset,
        discovery_run=run,
        source=source,
        exposure_score=_exposure_score_from_services(services),
        exposure_label="Detectado por scan",
        open_ports=[
            service.split(" ", 1)[0]
            for service in services
            if isinstance(service, str) and service
        ],
        services=services,
        vulnerabilities_summary={
            "count": len(vulnerabilities),
            "cves": [item.get("cve_id") for item in vulnerabilities if item.get("cve_id")],
        },
        raw_data=host_data,
    )
    return snapshot


CLASSIFICATION_FIELDS = (
    "confidentiality",
    "integrity",
    "availability",
    "exposure",
    "business_value",
    "dependency_score",
)


def _parse_classification_payload(data, current_asset=None):
    values = {}
    missing = []
    for field in CLASSIFICATION_FIELDS:
        raw = data.get(field)
        if raw in (None, "") and current_asset is not None:
            raw = getattr(current_asset, field)
        if raw in (None, ""):
            missing.append(field)
            continue
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValueError(f"{field} deve ser um número entre 1 e 5.")
        if value < 1 or value > 5:
            raise ValueError(f"{field} deve estar entre 1 e 5.")
        values[field] = value
    if missing:
        raise ValueError(f"Campos obrigatórios em falta: {', '.join(missing)}.")
    return values


def _classification_status_from_payload(data):
    requested = data.get("classification_status") or data.get("status") or AssetClassificationReview.Status.VALIDATED
    allowed = {choice[0] for choice in AssetClassificationReview.Status.choices}
    if requested not in allowed:
        raise ValueError("Estado da classificação inválido.")
    return requested


def _recalculate_asset_risks(asset):
    recalculated = 0
    risks = Risk.objects.filter(asset=asset).select_related("asset", "vulnerability")
    for risk in risks:
        RiskEngineService.recalculate_risk(risk)
        recalculated += 1
    if recalculated:
        RiskEngineService.assess_asset(asset)
    return recalculated


def _apply_asset_classification(asset, data, user=None, bulk=False):
    values = _parse_classification_payload(data, asset)
    owner = (data.get("owner") or asset.owner or "").strip()
    rationale = (data.get("rationale") or "").strip()
    next_review_at = data.get("next_review_at") or None
    status_value = _classification_status_from_payload(data)

    if status_value == AssetClassificationReview.Status.VALIDATED:
        if not owner:
            raise ValueError("Owner é obrigatório para validar a classificação.")
        if not rationale:
            raise ValueError("Justificação é obrigatória para validar a classificação.")
        if not next_review_at:
            raise ValueError("Data de revisão é obrigatória para validar a classificação.")

    for field, value in values.items():
        setattr(asset, field, value)
    asset.owner = owner
    asset.save()
    _recalculate_asset_risks(asset)

    AssetClassificationReview.objects.filter(asset=asset, is_current=True).update(is_current=False)
    review = AssetClassificationReview.from_asset(
        asset,
        status=status_value,
        rationale=rationale,
        next_review_at=next_review_at,
        is_current=True,
        created_by=user if user and getattr(user, "is_authenticated", False) else None,
    )
    if status_value == AssetClassificationReview.Status.VALIDATED:
        review.validate_review(user)
    review.save()
    AssetHistory.objects.create(
        asset=asset,
        action="Classificação em massa" if bulk else "Classificação atualizada",
        details=rationale or f"Estado da classificação: {status_value}.",
        user=user.username if user and getattr(user, "is_authenticated", False) else "Sistema",
    )
    return review


class AssetDiscoveryRunViewSet(viewsets.ModelViewSet):
    queryset = AssetDiscoveryRun.objects.prefetch_related("findings").all()
    serializer_class = AssetDiscoveryRunSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["source", "status"]
    search_fields = ["target_scope", "notes", "error_message"]
    ordering_fields = ["started_at", "completed_at", "processed_count", "created_count"]
    ordering = ["-started_at"]

    def perform_create(self, serializer):
        serializer.save(started_by=_request_user_or_none(self.request))


class AssetDiscoveryFindingViewSet(viewsets.ModelViewSet):
    queryset = AssetDiscoveryFinding.objects.select_related("run", "asset", "reviewed_by").all()
    serializer_class = AssetDiscoveryFindingSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["run", "asset", "status", "ip_address", "hostname"]
    search_fields = ["ip_address", "hostname", "mac_address", "os_name", "match_reason"]
    ordering_fields = ["created_at", "reviewed_at", "confidence_score"]
    ordering = ["status", "-created_at"]

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        finding = self.get_object()
        with transaction.atomic():
            asset = finding.asset
            if not asset:
                asset_name = finding.hostname or f"Nmap-Host-{finding.ip_address.replace('.', '-')}"
                asset = Asset.objects.create(
                    name=asset_name,
                    description=f"Ativo confirmado a partir da descoberta {finding.run.source}.",
                    source="discovery",
                    wazuh_ip=finding.ip_address or None,
                    wazuh_os_name=finding.os_name or None,
                    last_sync_at=timezone.now(),
                    status="New",
                )
                finding.asset = asset
                finding.match_reason = finding.match_reason or "Ativo criado a partir de finding validado pelo CISO."
                finding.run.created_count += 1
            finding.mark_reviewed(AssetDiscoveryFinding.Status.CONFIRMED, _request_user_or_none(request))
            finding.save()
            finding.run.confirmed_count += 1
            finding.run.save(update_fields=["created_count", "confirmed_count", "updated_at"])
            _create_exposure_snapshot(asset, finding.raw_data or {
                "services": finding.services,
                "vulnerabilities": finding.vulnerabilities,
            }, finding.run, finding.run.source)
        return Response(self.get_serializer(finding).data)

    @action(detail=True, methods=["post"])
    def ignore(self, request, pk=None):
        finding = self.get_object()
        finding.mark_reviewed(AssetDiscoveryFinding.Status.IGNORED, _request_user_or_none(request))
        finding.match_reason = request.data.get("reason", finding.match_reason)
        finding.save()
        finding.run.ignored_count += 1
        finding.run.save(update_fields=["ignored_count", "updated_at"])
        return Response(self.get_serializer(finding).data)

    @action(detail=True, methods=["post"])
    def mark_duplicate(self, request, pk=None):
        finding = self.get_object()
        asset_id = request.data.get("asset")
        if asset_id:
            finding.asset_id = asset_id
        finding.mark_reviewed(AssetDiscoveryFinding.Status.DUPLICATE, _request_user_or_none(request))
        finding.match_reason = request.data.get("reason", finding.match_reason or "Marcado como duplicado.")
        finding.save()
        finding.run.duplicate_count += 1
        finding.run.save(update_fields=["duplicate_count", "updated_at"])
        return Response(self.get_serializer(finding).data)


class AssetExposureSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AssetExposureSnapshot.objects.select_related("asset", "discovery_run").all()
    serializer_class = AssetExposureSnapshotSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["asset", "source", "exposure_score", "discovery_run"]
    search_fields = ["asset__name", "exposure_label"]
    ordering_fields = ["captured_at", "exposure_score"]
    ordering = ["-captured_at"]


class AssetClassificationReviewViewSet(viewsets.ModelViewSet):
    queryset = AssetClassificationReview.objects.select_related("asset", "created_by", "reviewed_by").all()
    serializer_class = AssetClassificationReviewSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["asset", "status", "is_current", "criticality_at_review"]
    search_fields = ["asset__name", "rationale", "criticality_at_review"]
    ordering_fields = ["created_at", "reviewed_at", "next_review_at", "classification_score"]
    ordering = ["-is_current", "-created_at"]

    def perform_create(self, serializer):
        asset = serializer.validated_data["asset"]
        if serializer.validated_data.get("is_current", True):
            AssetClassificationReview.objects.filter(asset=asset, is_current=True).update(is_current=False)
        serializer.save(
            created_by=_request_user_or_none(self.request),
            snapshot=AssetClassificationReview.build_snapshot(asset),
        )

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        review = self.get_object()
        review.validate_review(_request_user_or_none(request))
        review.is_current = True
        AssetClassificationReview.objects.filter(asset=review.asset, is_current=True).exclude(pk=review.pk).update(is_current=False)
        review.save()
        _recalculate_asset_risks(review.asset)
        return Response(self.get_serializer(review).data)


class AssetViewSet(viewsets.ModelViewSet):

    queryset = Asset.objects.annotate(

        vulnerabilities_count_anno=Count('vulnerability_occurrences', distinct=True),

        controls_count_anno=Count('controls', distinct=True)

    ).all()



    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    filterset_fields = ['asset_type', 'category', 'owner', 'criticality', 'status', 'controls', 'source']

    search_fields = ['name', 'description', 'owner', 'business_process', 'wazuh_agent_id', 'wazuh_ip', 'category__name', 'asset_type__name']

    ordering_fields = ['name', 'category__name', 'criticality', 'created_at']

    ordering = ['-created_at']



    def get_serializer_class(self):
        if self.action == 'list':
            return AssetListSerializer
        return AssetSerializer

    @action(detail=False, methods=['get'])
    def network_map(self, request):
        import ipaddress
        assets = Asset.objects.all().select_related('category', 'asset_type')
        ranges = NetworkRange.objects.filter(is_active=True)
        nodes = []
        edges = []
        
        cat_colors = {
            'Infrastructure': '#4f46e5',
            'Application': '#10b981',
            'Information': '#f59e0b',
            'Service': '#ef4444',
            'ThirdParty': '#6366f1'
        }

        # 1. Add Network Range Nodes (the "Hubs")
        for net in ranges:
            nodes.append({
                "id": f"net-{net.id}",
                "type": "input", # Entry points
                "data": { 
                    "label": f"Rede: {net.name}",
                    "type": "Rede",
                    "category": "Network",
                    "criticality": "Medium",
                    "ip": net.cidr,
                    "color": "#1e293b" # Slate 800
                },
                "position": {"x": 0, "y": 0},
                "style": { "background": "#1e293b", "color": "#fff", "borderRadius": "12px", "padding": "10px" }
            })

        # 2. Add Asset Nodes and connect to Segments
        # Optimized: Prefetch M2M to avoid N+1 queries
        assets_with_rels = assets.prefetch_related('dependent_assets', 'integration_assets')

        for asset in assets_with_rels:
            type_name = asset.asset_type.name if asset.asset_type else "Outro"
            cat_name = asset.category.name if asset.category else "Geral"
            
            nodes.append({
                "id": str(asset.id),
                "type": "customNode",
                "data": { 
                    "label": asset.name,
                    "type": type_name,
                    "category": cat_name,
                    "criticality": asset.criticality,
                    "ip": asset.wazuh_ip,
                    "status": asset.status,
                    "color": cat_colors.get(cat_name, '#94a3b8')
                },
                "position": {"x": 0, "y": 0}
            })
            
            # Explicit Dependency (Parent/Child)
            if asset.parent_id:
                edges.append({
                    "id": f"e-dep-{asset.parent_id}-{asset.id}",
                    "source": str(asset.parent_id),
                    "target": str(asset.id),
                    "animated": True,
                    "label": "Dependência",
                    "style": {"stroke": "#4f46e5", "strokeWidth": 3}
                })
            
            # M2M Relationships (Communications/Dependencies)
            for dep in asset.dependent_assets.all():
                edges.append({
                    "id": f"e-m2m-{asset.id}-{dep.id}",
                    "source": str(asset.id),
                    "target": str(dep.id),
                    "animated": True,
                    "label": "Comunica",
                    "style": {"stroke": "#10b981", "strokeWidth": 2}
                })

            for integ in asset.integration_assets.all():
                edges.append({
                    "id": f"e-int-{asset.id}-{integ.id}",
                    "source": str(asset.id),
                    "target": str(integ.id),
                    "animated": False,
                    "label": "Integração",
                    "style": {"stroke": "#f59e0b", "strokeWidth": 2, "strokeDasharray": "5,5"}
                })
            
            # Automatic Network Mapping
            if asset.wazuh_ip:
                try:
                    ip = ipaddress.ip_address(asset.wazuh_ip)
                    for net in ranges:
                        network = ipaddress.ip_network(net.cidr)
                        if ip in network:
                            edges.append({
                                "id": f"e-net-{net.id}-{asset.id}",
                                "source": f"net-{net.id}",
                                "target": str(asset.id),
                                "animated": False,
                                "label": "Membro",
                                "style": {"stroke": "#94a3b8", "strokeWidth": 1}
                            })
                            break
                except ValueError:
                    pass

        return Response({"nodes": nodes, "edges": edges})



    def perform_create(self, serializer):

        asset = serializer.save()

        AssetHistory.objects.create(

            asset=asset,

            action="Created",

            details=f"Ativo criado manualmente.",

            user=self.request.user.username if self.request.user.is_authenticated else "Sistema"

        )



    def perform_update(self, serializer):

        instance = self.get_object()

        # Captura valores antigos para comparação

        old_data = {}

        for field in serializer.validated_data:

            if hasattr(instance, field):

                old_data[field] = getattr(instance, field)

        

        asset = serializer.save()

        

        # Compara e regista alterações

        risks_recalculated = 0

        if any(
            field in CLASSIFICATION_FIELDS and old_data[field] != getattr(asset, field)
            for field in old_data
        ):

            risks_recalculated = _recalculate_asset_risks(asset)

        changes = []

        for field, old_value in old_data.items():

            new_value = getattr(asset, field)

            if old_value != new_value:

                # Formatação amigável para FKs e Enums

                changes.append(f"Alterou {field}: '{old_value}' -> '{new_value}'")

        

        if risks_recalculated:

            changes.append(f"Recalculou {risks_recalculated} risco(s) associado(s) apos alteracao da classificacao.")

        if changes:

            AssetHistory.objects.create(

                asset=asset,

                action="Atualização",

                details="\n".join(changes),

                user=self.request.user.username if self.request.user.is_authenticated else "Sistema"

            )





    def get_queryset(self):

        qs = super().get_queryset()

        

        # Omit specific sources from the main list if requested

        exclude_source = self.request.query_params.get('exclude_source')

        if exclude_source:

            qs = qs.exclude(source=exclude_source)

            

        if self.action == 'retrieve':

            return qs.select_related('category', 'asset_type').prefetch_related(

                'vulnerability_occurrences', 

                'vulnerability_occurrences__vulnerability',

                'vulnerability_occurrences__software',

                'installed_software', 

                'controls'

            )

        return qs.select_related('category', 'asset_type')


    @action(detail=False, methods=['get'])
    def classification_overview(self, request):
        total = Asset.objects.count()
        validated = AssetClassificationReview.objects.filter(
            is_current=True,
            status=AssetClassificationReview.Status.VALIDATED,
        ).values("asset").distinct().count()
        pending = AssetClassificationReview.objects.filter(
            is_current=True,
            status__in=[
                AssetClassificationReview.Status.INCOMPLETE,
                AssetClassificationReview.Status.DRAFT,
                AssetClassificationReview.Status.PENDING_REVIEW,
            ],
        ).values("asset").distinct().count()
        expired = AssetClassificationReview.objects.filter(
            is_current=True,
            status=AssetClassificationReview.Status.EXPIRED,
        ).values("asset").distinct().count()
        by_criticality = list(
            Asset.objects.values("criticality").annotate(count=Count("id")).order_by("criticality")
        )
        return Response({
            "total_assets": total,
            "validated": validated,
            "incomplete": pending,
            "pending_review": pending,
            "expired": expired,
            "not_validated": max(total - validated - pending - expired, 0),
            "by_criticality": by_criticality,
        })


    @action(detail=True, methods=['post'])
    def validate_classification(self, request, pk=None):
        asset = self.get_object()
        payload = request.data.copy()
        payload["status"] = AssetClassificationReview.Status.VALIDATED
        try:
            with transaction.atomic():
                review = _apply_asset_classification(asset, payload, _request_user_or_none(request))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AssetClassificationReviewSerializer(review).data)


    @action(detail=True, methods=['post'])
    def classify(self, request, pk=None):
        asset = self.get_object()
        try:
            with transaction.atomic():
                review = _apply_asset_classification(asset, request.data, _request_user_or_none(request))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AssetClassificationReviewSerializer(review).data)


    @action(detail=False, methods=['post'])
    def bulk_classify(self, request):
        asset_ids = request.data.get("asset_ids") or []
        if not asset_ids:
            return Response({"detail": "Seleciona pelo menos um ativo."}, status=status.HTTP_400_BAD_REQUEST)
        assets = list(Asset.objects.filter(id__in=asset_ids))
        if not assets:
            return Response({"detail": "Nenhum ativo encontrado."}, status=status.HTTP_404_NOT_FOUND)
        created = []
        errors = []
        try:
            _parse_classification_payload(request.data)
            _classification_status_from_payload(request.data)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            for asset in assets:
                try:
                    review = _apply_asset_classification(asset, request.data, _request_user_or_none(request), bulk=True)
                    created.append(review)
                except ValueError as exc:
                    errors.append({"asset": str(asset.id), "detail": str(exc)})
        return Response({
            "processed": len(assets),
            "created": len(created),
            "errors": errors,
            "reviews": AssetClassificationReviewSerializer(created, many=True).data,
        })



    @action(detail=False, methods=['post'])

    def sync_wazuh(self, request):
        _start_wazuh_sync()

        

        return Response({"detail": "Processo de sincronização iniciado em background. A UI reportará os novos dados brevemente."})



    @action(detail=False, methods=['post'])

    def scan_nmap(self, request):

        from risk.services.nmap_discovery_service import NmapDiscoveryService

        

        username = request.data.get('username')

        password = request.data.get('password')

        

        # O utilizador pode opcionalmente passar credenciais se não quiser usar as guardadas

        # 1. Registar início da sincronização

        from integrations.models import IntegrationSyncStatus

        sync_status, _ = IntegrationSyncStatus.objects.get_or_create(

            provider='nmap',

            sync_type='discovery'

        )

        sync_status.status = 'RUNNING'

        sync_status.save()

        start_time = timezone.now()
        discovery_run = AssetDiscoveryRun.objects.create(
            source=AssetDiscoveryRun.Source.NMAP,
            status=AssetDiscoveryRun.Status.RUNNING,
            started_by=_request_user_or_none(request),
            target_scope="Redes configuradas",
        )

        

        try:

            service = NmapDiscoveryService(username=username, password=password)

            # 2. Realizar o scan

            found_hosts = service.run_all_networks_scan()

            found_ips_list = [h["ip"] for h in found_hosts if h.get("ip")]
            discovery_run.processed_count = len(found_hosts)

            

            if not found_hosts:

                sync_status.status = 'SUCCESS'

                sync_status.duration_seconds = (timezone.now() - start_time).seconds

                sync_status.save()
                discovery_run.raw_summary = {"found_ips": []}
                discovery_run.finish(AssetDiscoveryRun.Status.COMPLETED)



                return Response({

                    "detail": "O scan terminou mas não foram encontrados dispositivos ativos.",

                    "found": 0,

                    "created": 0,

                    "ignored": 0,

                    "run_id": str(discovery_run.id)

                })



            # 3. Criar/Ignorar novos ativos, sem apagar histórico de scans anteriores

            stats = service.match_and_create_assets(found_hosts)
            assets_by_ip = stats.pop("assets_by_ip", {})
            for host in found_hosts:
                ip = host.get("ip") or ""
                asset = assets_by_ip.get(ip)
                services = host.get("services") or []
                finding_status = (
                    AssetDiscoveryFinding.Status.CONFIRMED
                    if asset and asset.source == "manual"
                    else AssetDiscoveryFinding.Status.NEW
                )
                AssetDiscoveryFinding.objects.create(
                    run=discovery_run,
                    asset=asset,
                    ip_address=ip,
                    hostname=host.get("hostname") or "",
                    os_name=host.get("os_name") or "",
                    open_ports=[
                        service.split(" ", 1)[0]
                        for service in services
                        if isinstance(service, str) and service
                    ],
                    services=services,
                    vulnerabilities=host.get("vulnerabilities") or [],
                    status=finding_status,
                    confidence_score=80 if asset else 60,
                    match_reason="Correspondência por IP existente." if asset else "Novo ativo detetado por Nmap.",
                    raw_data=host,
                )
                if asset:
                    _create_exposure_snapshot(asset, host, discovery_run, "nmap")

            

            # 5. Finalizar status

            sync_status.status = 'SUCCESS'

            sync_status.duration_seconds = (timezone.now() - start_time).seconds

            sync_status.save()
            discovery_run.created_count = stats["created"]
            discovery_run.updated_count = stats.get("updated", 0)
            discovery_run.confirmed_count = AssetDiscoveryFinding.objects.filter(
                run=discovery_run,
                status=AssetDiscoveryFinding.Status.CONFIRMED,
            ).count()
            discovery_run.raw_summary = {
                "found_ips": found_ips_list,
                "created": stats["created"],
                "ignored": stats["ignored"],
            }
            discovery_run.finish(AssetDiscoveryRun.Status.COMPLETED)



            return Response({

                "detail": f"Scan Nmap concluído. {len(found_hosts)} dispositivos encontrados, {stats['created']} novos registados para validação.",

                "found": len(found_hosts),

                "created": stats["created"],

                "ignored": stats["ignored"],

                "run_id": str(discovery_run.id)

            })

        except Exception as e:

            sync_status.status = 'FAILED'

            sync_status.last_error = str(e)

            sync_status.save()
            discovery_run.finish(AssetDiscoveryRun.Status.FAILED, str(e))

            import traceback

            print(traceback.format_exc())

            return Response({"detail": f"Erro no scan: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



    @action(detail=True, methods=['post'])

    def enrich_nmap(self, request, pk=None):

        from risk.services.nmap_discovery_service import NmapDiscoveryService

        asset = self.get_object()

        

        if not asset.wazuh_ip:

            return Response({"detail": "Este ativo não tem um endereço IP associado para scan."}, status=status.HTTP_400_BAD_REQUEST)

            

        try:

            service = NmapDiscoveryService()

            host_data = service.enrich_single_host(asset.wazuh_ip)

            

            if not host_data:

                return Response({"detail": "Não foi possível obter detalhes adicionais para este IP (o host pode estar offline)."}, status=status.HTTP_404_NOT_FOUND)

            

            # Atualiza o ativo com os novos dados

            if host_data.get("hostname"):

                asset.name = host_data["hostname"]

            

            if host_data.get("os_name") and host_data["os_name"] != "Unknown":

                asset.wazuh_os_name = host_data["os_name"]

            

            # Enriquece a descrição com serviços

            services_str = ", ".join(host_data["services"])

            if services_str:

                current_desc = asset.description or ""

                if "[NMAP ENRICHED]" in current_desc:

                    # Tenta substituir a parte dos serviços ou apenas anexar

                    asset.description = re.sub(r"Serviços Abertos:.*", f"Serviços Abertos: {services_str}", current_desc)

                else:

                    asset.description = current_desc + f"\n[NMAP ENRICHED] Serviços: {services_str}"

            

            # 3. Sincronizar Inventário de Software

            for sw_data in host_data.get("detected_software", []):

                sw_obj, _ = Software.objects.get_or_create(

                    name=sw_data["name"],

                    version=sw_data["version"],

                    defaults={

                        "vendor": sw_data["vendor"],

                        "source": "nmap"

                    }

                )

                sw_obj.assets.add(asset)



            # 4. Sincronizar Vulnerabilidades

            from .models.vulnerability import Vulnerability, AssetVulnerability

            

            vulns_found = host_data.get("vulnerabilities", [])

            created_vulns_count = 0

            

            for vdata in vulns_found:

                cve_id = vdata["cve_id"]

                cvss = vdata["cvss"]

                

                # Determinar severidade baseada no CVSS v3/v2 (estimativa básica)

                if cvss >= 9.0: severity = 'Critical'

                elif cvss >= 7.0: severity = 'High'

                elif cvss >= 4.0: severity = 'Medium'

                else: severity = 'Low'

                

                # Get/Create Vulnerability definition

                vuln_def, _ = Vulnerability.objects.get_or_create(

                    cve_id=cve_id,

                    defaults={

                        'severity': severity,

                        'cvss_score': cvss,

                        'source': 'nmap',

                        'description': f"Vulnerabilidade detetada via Nmap (vulners) no serviço {vdata['service']} {vdata['version']}."

                    }

                )

                

                # Find the software object we just created/associated

                sw_obj = Software.objects.filter(

                    name=vdata['service'],

                    version=vdata['version'] or "unknown"

                ).first()



                # Create/Update AssetVulnerability

                asset_vuln, created = AssetVulnerability.objects.get_or_create(

                    asset=asset,

                    vulnerability=vuln_def,

                    software=sw_obj,

                    software_version=vdata.get('version'),

                    defaults={'source': 'nmap', 'status': 'Open'}

                )

                if created:

                    created_vulns_count += 1

                else:

                    asset_vuln.status = 'Open' # Reabrir se foi corrigido mas reapareceu

                    asset_vuln.save()



            asset.last_sync_at = timezone.now()

            asset.save()
            _create_exposure_snapshot(asset, host_data, source="nmap")

            

            return Response({

                "detail": f"Detalhes enriquecidos com sucesso. {len(host_data['services'])} serviços e {created_vulns_count} novas vulnerabilidades detetadas.",

                "hostname": host_data["hostname"],

                "os_name": host_data["os_name"],

                "services": host_data["services"],

                "vulnerabilities_count": len(vulns_found)

            })

        except Exception as e:

            return Response({"detail": f"Erro no enriquecimento: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



    @action(detail=True, methods=['post'])

    def promote_to_inventory(self, request, pk=None):

        asset = self.get_object()

        

        if asset.source != 'discovery':

            return Response({"detail": "Este ativo já faz parte do inventário principal ou é gerido pelo Wazuh."}, status=status.HTTP_400_BAD_REQUEST)

            

        asset.source = 'manual'

        asset.description = (asset.description or "") + f"\n\n[PROMOTED] Ativo aprovado pelo CISO e movido para o inventário principal em {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}."

        asset.save()



        # Log no histórico

        from .models.asset import AssetHistory

        AssetHistory.objects.create(

            asset=asset,

            action="Promovido ao Inventário",

            details="Ativo promovido de 'Descoberta' para o Inventário Principal da organização."

        )

        

        return Response({

            "detail": f"Ativo '{asset.name}' promovido para o inventário principal com sucesso.",

            "id": asset.id,

            "source": asset.source

        })



    @action(detail=True, methods=['post'])

    def merge(self, request, pk=None):

        """

        Merges other assets into this one. 

        Consolidates IPs, Software, and Vulnerabilities.

        Handles duplicates to avoid IntegrityError.

        """

        target_asset = self.get_object()

        source_ids = request.data.get('source_asset_ids', [])

        

        if not source_ids:

            return Response({"detail": "Nenhum ativo de origem fornecido para fusão."}, status=status.HTTP_400_BAD_REQUEST)

            

        source_assets = Asset.objects.filter(id__in=source_ids).exclude(id=target_asset.id)

        

        if not source_assets.exists():

            return Response({"detail": "Ativos de origem não encontrados."}, status=status.HTTP_404_NOT_FOUND)

            

        merged_count = 0

        # Consolidação de IPs: garantir que o IP principal não está nos secundários

        new_ips = set(target_asset.secondary_ips or [])

        primary_ip = target_asset.wazuh_ip

        

        for source in source_assets:

            # 1. Coleta de IPs

            if source.wazuh_ip and source.wazuh_ip != primary_ip:

                new_ips.add(source.wazuh_ip)

            if source.secondary_ips:

                for ip in source.secondary_ips:

                    if ip != primary_ip:

                        new_ips.add(ip)

            

            # 2. Re-associação de Software (M2M automático)

            source_sw = Software.objects.filter(assets=source)

            for sw in source_sw:

                sw.assets.add(target_asset)

                

            # 3. Transferência de Vulnerabilidades (Segura contra duplicados)

            source_vulns = AssetVulnerability.objects.filter(asset=source)

            for sv in source_vulns:

                # Verificar se o destino já tem esta ocorrência

                exists = AssetVulnerability.objects.filter(

                    asset=target_asset,

                    vulnerability=sv.vulnerability,

                    software=sv.software,

                    software_version=sv.software_version

                ).exists()

                

                if not exists:

                    sv.asset = target_asset

                    sv.save()

                else:

                    # Já existe, apagamos no de origem para libertar o ativo

                    sv.delete()



            # 4. Transferência de Riscos

            Risk.objects.filter(asset=source).update(asset=target_asset)

            

            # 5. Eliminar origem

            source.delete()

            merged_count += 1

            

        target_asset.secondary_ips = list(new_ips)

        target_asset.description = (target_asset.description or "") + f"\n\n[MERGE] Foram fundidos {merged_count} ativos neste registo em {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}."

        target_asset.save()



        # Log no histórico

        from .models.asset import AssetHistory

        AssetHistory.objects.create(

            asset=target_asset,

            action="Ativos Fundidos",

            details=f"Foram fundidos {merged_count} ativos neste registo. IPs consolidados: {', '.join(target_asset.secondary_ips)}"

        )

        

        return Response({

            "detail": f"Sucesso! {merged_count} ativos foram fundidos em '{target_asset.name}'.",

            "secondary_ips": target_asset.secondary_ips

        })



class NetworkRangeViewSet(viewsets.ModelViewSet):

    queryset = NetworkRange.objects.all()

    serializer_class = NetworkRangeSerializer

    filter_backends = [filters.SearchFilter]

    search_fields = ['name', 'cidr']



class AssetCategoryViewSet(viewsets.ModelViewSet):

    queryset = AssetCategory.objects.all()

    serializer_class = AssetCategorySerializer

    filter_backends = [filters.SearchFilter]

    search_fields = ['name']



class AssetTypeViewSet(viewsets.ModelViewSet):

    queryset = AssetType.objects.select_related('category').all()

    serializer_class = AssetTypeSerializer

    filter_backends = [DjangoFilterBackend, filters.SearchFilter]

    filterset_fields = ['category']

    search_fields = ['name']



class AssetLocationViewSet(viewsets.ModelViewSet):

    queryset = AssetLocation.objects.all()

    serializer_class = AssetLocationSerializer

    filter_backends = [filters.SearchFilter]

    search_fields = ['name']



class AssetEnvironmentViewSet(viewsets.ModelViewSet):

    queryset = AssetEnvironment.objects.all()

    serializer_class = AssetEnvironmentSerializer

    filter_backends = [filters.SearchFilter]

    search_fields = ['name']



class AssetInfrastructureViewSet(viewsets.ModelViewSet):

    queryset = AssetInfrastructure.objects.all()

    serializer_class = AssetInfrastructureSerializer

    filter_backends = [filters.SearchFilter]

    search_fields = ['name']



class RiskConfigurationViewSet(viewsets.ModelViewSet):

    queryset = RiskConfiguration.objects.all()

    serializer_class = RiskConfigurationSerializer



    @action(detail=False, methods=['get'])

    def current(self, request):

        config = RiskConfiguration.get_config()

        serializer = self.get_serializer(config)

        return Response(serializer.data)


class PriorityModelConfigViewSet(viewsets.ModelViewSet):

    queryset = PriorityModelConfig.objects.all()

    serializer_class = PriorityModelConfigSerializer


    def perform_update(self, serializer):

        previous_mode = serializer.instance.mode if serializer.instance else None

        previous_shadow_mode = serializer.instance.shadow_mode_enabled if serializer.instance else None

        instance = serializer.save()

        self._record_model_decision(previous_mode, previous_shadow_mode, instance)


    def _record_model_decision(self, previous_mode, previous_shadow_mode, instance):

        if previous_mode == instance.mode and previous_shadow_mode == instance.shadow_mode_enabled:
            return

        try:
            from governance.models.decision import DecisionRecord

            actor = self.request.user.get_username() if self.request.user.is_authenticated else "system"
            readiness = instance.readiness_snapshot()
            activated = previous_mode != instance.mode and instance.mode == PriorityModelConfig.Mode.XGBOOST_SHAP
            deactivated = previous_mode != instance.mode and instance.mode == PriorityModelConfig.Mode.EXPLAINABLE_WEIGHTED
            shadow_changed = previous_shadow_mode != instance.shadow_mode_enabled

            if activated:
                title = "Ativação governada do XGBoost+SHAP interno"
                recommendation = "Servir o estimador XGBoost+SHAP interno como modelo oficial de priorização."
                risk_impact = "A priorização passa a refletir padrões aprendidos dos desfechos históricos da organização."
                compliance_impact = "A ativação fica registada como decisão auditável com métricas e artefacto aprovados."
            elif deactivated:
                title = "Desativação do XGBoost+SHAP interno"
                recommendation = "Voltar ao modelo ponderado explicável como modelo oficial de priorização."
                risk_impact = "A priorização volta ao combinador determinístico enquanto se revê o modelo interno."
                compliance_impact = "A alteração preserva rastreabilidade e evita servir um modelo sem confiança suficiente."
            elif shadow_changed:
                title = "Alteração do shadow mode XGBoost+SHAP"
                recommendation = (
                    "Ativar comparação paralela do XGBoost+SHAP."
                    if instance.shadow_mode_enabled
                    else "Desativar comparação paralela do XGBoost+SHAP."
                )
                risk_impact = "O modelo servido não muda; apenas se recolhe evidência comparativa."
                compliance_impact = "O shadow mode apoia validação controlada antes de ativação oficial."
            else:
                return

            DecisionRecord.objects.create(
                decision_type=DecisionRecord.DecisionType.RISK,
                target_type="priority_model_config",
                target_id=str(instance.id),
                title=title,
                recommendation=recommendation,
                rationale=(
                    f"Modo anterior={previous_mode}; modo atual={instance.mode}; "
                    f"shadow_mode={instance.shadow_mode_enabled}; artefacto={instance.active_model_version or 'n/d'}."
                ),
                source_snapshot=[
                    {
                        "source_type": "priority_model_readiness",
                        "source_ref": f"priority_model_config:{instance.id}",
                        "content": readiness,
                    }
                ],
                score_snapshot={
                    "previous_mode": previous_mode,
                    "current_mode": instance.mode,
                    "shadow_mode_enabled": instance.shadow_mode_enabled,
                    "active_model_version": instance.active_model_version,
                    "trained_at": instance.trained_at.isoformat() if instance.trained_at else None,
                    "holdout_auc": float(instance.holdout_auc) if instance.holdout_auc is not None else None,
                    "holdout_brier": float(instance.holdout_brier) if instance.holdout_brier is not None else None,
                    "readiness": readiness,
                },
                decision=DecisionRecord.Decision.ACCEPTED,
                justification=(
                    "Alteração de modelo registada automaticamente pelo painel de administração "
                    "para manter a ativação de IA rastreável e defensável."
                ),
                responsible=actor,
                risk_impact=risk_impact,
                compliance_impact=compliance_impact,
                evidence_reference=f"/admin/priority-model#config-{instance.id}",
                action_reference="priority_model_config_update",
                decided_by=actor,
                decided_at=timezone.now(),
            )
        except Exception as exc:
            logger.warning("[PRIORITY_MODEL] DecisionRecord skipped for config %s: %s", instance.id, exc, exc_info=True)


    @action(detail=False, methods=['get'])

    def current(self, request):

        config = PriorityModelConfig.get_config()

        serializer = self.get_serializer(config)

        return Response(serializer.data)


    @action(detail=False, methods=['get'])

    def readiness(self, request):

        config = PriorityModelConfig.get_config()

        return Response(config.readiness_snapshot())
