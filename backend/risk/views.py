import re

from rest_framework import viewsets, filters, status

from rest_framework.decorators import action

from rest_framework.response import Response

from django_filters.rest_framework import DjangoFilterBackend

from django.utils import timezone

from django.db.models import Count, F, Q, Max, Case, When, Value, CharField

from .models.asset import Asset, AssetCategory, AssetType, AssetHistory, RiskConfiguration

from .models.software import Software

from .models.vulnerability import Vulnerability, AssetVulnerability, VulnerabilityHistory

from .models.risk import Risk, RiskFactor, RiskAssessment, RiskTreatment

from .models.network_range import NetworkRange

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

    RiskConfigurationSerializer

)

from .services.wazuh_service import WazuhService

from .services.intel_service import IntelService

from .services.risk_engine import RiskEngineService



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



    @action(detail=False, methods=['post'])

    def sync_wazuh(self, request):

        import subprocess

        import sys

        

        # Inicia a sincronizaÃ§Ã£o de background via subprocesses

        subprocess.Popen([sys.executable, 'manage.py', 'sync_wazuh_assets'])

        subprocess.Popen([sys.executable, 'manage.py', 'sync_wazuh_vulns'])

        

        return Response({"detail": "Processo de sincronizaÃ§Ã£o iniciado em background. A UI reportarÃ¡ os novos dados brevemente."})



    @action(detail=False, methods=['post'])

    def refresh_intel(self, request):

        import subprocess

        import sys

        

        subprocess.Popen([sys.executable, 'manage.py', 'sync_epss'])

        return Response({"detail": "Processo de atualizaÃ§Ã£o do EPSS iniciado em background. Verifique o estado nas definiÃ§Ãµes de integraÃ§Ã£o."})



    @action(detail=False, methods=['post'])

    def refresh_nvd(self, request):

        import subprocess

        import sys

        

        subprocess.Popen([sys.executable, 'manage.py', 'sync_nist'])

        return Response({"detail": "Processo de atualizaÃ§Ã£o com o NIST NVD iniciado em background. Verifique o estado nas definiÃ§Ãµes de integraÃ§Ã£o."})



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



    @action(detail=True, methods=['post'])

    def change_status(self, request, pk=None):

        instance = self.get_object()

        new_status = request.data.get('status')

        notes = request.data.get('notes', '')

        

        if new_status not in [c[0] for c in AssetVulnerability.STATUS_CHOICES]:

            return Response({"detail": "Status invÃ¡lido."}, status=status.HTTP_400_BAD_REQUEST)

            

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

            details=f"Software registado no catÃ¡logo.",

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

                action="AtualizaÃ§Ã£o",

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

        # Captura valores antigos para comparaÃ§Ã£o

        old_data = {}

        for field in serializer.validated_data:

            if hasattr(instance, field):

                old_data[field] = getattr(instance, field)

        

        asset = serializer.save()

        

        # Compara e regista alteraÃ§Ãµes

        changes = []

        for field, old_value in old_data.items():

            new_value = getattr(asset, field)

            if old_value != new_value:

                # FormataÃ§Ã£o amigÃ¡vel para FKs e Enums

                changes.append(f"Alterou {field}: '{old_value}' -> '{new_value}'")

        

        if changes:

            AssetHistory.objects.create(

                asset=asset,

                action="AtualizaÃ§Ã£o",

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

                'installed_software', 

                'controls'

            )

        return qs.select_related('category', 'asset_type')



    @action(detail=False, methods=['post'])

    def sync_wazuh(self, request):

        import subprocess

        import sys

        

        # Inicia a sincronizaÃ§Ã£o de background via subprocesses

        # para nÃ£o bloquear a chamada da API do frontend.

        subprocess.Popen([sys.executable, 'manage.py', 'sync_wazuh_assets'])

        subprocess.Popen([sys.executable, 'manage.py', 'sync_wazuh_vulns'])

        

        return Response({"detail": "Processo de sincronizaÃ§Ã£o iniciado em background. A UI reportarÃ¡ os novos dados brevemente."})



    @action(detail=False, methods=['post'])

    def scan_nmap(self, request):

        from risk.services.nmap_discovery_service import NmapDiscoveryService

        

        username = request.data.get('username')

        password = request.data.get('password')

        

        # O utilizador pode opcionalmente passar credenciais se nÃ£o quiser usar as guardadas

        # 1. Registar inÃ­cio da sincronizaÃ§Ã£o

        from integrations.models import IntegrationSyncStatus

        sync_status, _ = IntegrationSyncStatus.objects.get_or_create(

            provider='nmap',

            sync_type='discovery'

        )

        sync_status.status = 'RUNNING'

        sync_status.save()

        start_time = timezone.now()

        

        try:

            service = NmapDiscoveryService(username=username, password=password)

            

            # Limpa lixo de execuÃ§Ãµes anteriores mal sucedidas

            cleaned_count = service.cleanup_ghost_assets()

            

            # 2. Realizar o scan

            found_hosts = service.run_all_networks_scan()

            found_ips_list = [h["ip"] for h in found_hosts if h.get("ip")]

            

            if not found_hosts:

                # Se nÃ£o encontrou nada, purga tudo o que era 'discovery'

                purged_count = service.purge_missing_assets([])

                

                sync_status.status = 'SUCCESS'

                sync_status.duration_seconds = (timezone.now() - start_time).seconds

                sync_status.save()



                return Response({

                    "detail": f"O scan terminou mas nÃ£o foram encontrados dispositivos ativos. ({purged_count} ativos antigos removidos)",

                    "found": 0,

                    "created": 0,

                    "ignored": 0,

                    "cleaned": cleaned_count,

                    "purged": purged_count

                })



            # 3. Purgar ativos que jÃ¡ nÃ£o estÃ£o presentes

            purged_count = service.purge_missing_assets(found_ips_list)

            

            # 4. Criar/Ignorar novos ativos

            stats = service.match_and_create_assets(found_hosts)

            

            # 5. Finalizar status

            sync_status.status = 'SUCCESS'

            sync_status.duration_seconds = (timezone.now() - start_time).seconds

            sync_status.save()



            return Response({

                "detail": f"Scan Nmap concluÃ­do. {len(found_hosts)} dispositivos encontrados, {stats['created']} novos integrados. ({purged_count} removidos por estarem offline)",

                "found": len(found_hosts),

                "created": stats["created"],

                "ignored": stats["ignored"],

                "cleaned": cleaned_count,

                "purged": purged_count

            })

        except Exception as e:

            sync_status.status = 'FAILED'

            sync_status.last_error = str(e)

            sync_status.save()

            import traceback

            print(traceback.format_exc())

            return Response({"detail": f"Erro no scan: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



    @action(detail=True, methods=['post'])

    def enrich_nmap(self, request, pk=None):

        from risk.services.nmap_discovery_service import NmapDiscoveryService

        asset = self.get_object()

        

        if not asset.wazuh_ip:

            return Response({"detail": "Este ativo nÃ£o tem um endereÃ§o IP associado para scan."}, status=status.HTTP_400_BAD_REQUEST)

            

        try:

            service = NmapDiscoveryService()

            host_data = service.enrich_single_host(asset.wazuh_ip)

            

            if not host_data:

                return Response({"detail": "NÃ£o foi possÃ­vel obter detalhes adicionais para este IP (o host pode estar offline)."}, status=status.HTTP_404_NOT_FOUND)

            

            # Atualiza o ativo com os novos dados

            if host_data.get("hostname"):

                asset.name = host_data["hostname"]

            

            if host_data.get("os_name") and host_data["os_name"] != "Unknown":

                asset.wazuh_os_name = host_data["os_name"]

            

            # Enriquece a descriÃ§Ã£o com serviÃ§os

            services_str = ", ".join(host_data["services"])

            if services_str:

                current_desc = asset.description or ""

                if "[NMAP ENRICHED]" in current_desc:

                    # Tenta substituir a parte dos serviÃ§os ou apenas anexar

                    asset.description = re.sub(r"ServiÃ§os Abertos:.*", f"ServiÃ§os Abertos: {services_str}", current_desc)

                else:

                    asset.description = current_desc + f"\n[NMAP ENRICHED] ServiÃ§os: {services_str}"

            

            # 3. Sincronizar InventÃ¡rio de Software

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

                

                # Determinar severidade baseada no CVSS v3/v2 (estimativa bÃ¡sica)

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

                        'description': f"Vulnerabilidade detetada via Nmap (vulners) no serviÃ§o {vdata['service']} {vdata['version']}."

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

            

            return Response({

                "detail": f"Detalhes enriquecidos com sucesso. {len(host_data['services'])} serviÃ§os e {created_vulns_count} novas vulnerabilidades detetadas.",

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

            return Response({"detail": "Este ativo jÃ¡ faz parte do inventÃ¡rio principal ou Ã© gerido pelo Wazuh."}, status=status.HTTP_400_BAD_REQUEST)

            

        asset.source = 'manual'

        asset.description = (asset.description or "") + f"\n\n[PROMOTED] Ativo aprovado pelo CISO e movido para o inventÃ¡rio principal em {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}."

        asset.save()



        # Log no histÃ³rico

        from .models.asset import AssetHistory

        AssetHistory.objects.create(

            asset=asset,

            action="Promovido ao InventÃ¡rio",

            details="Ativo promovido de 'Descoberta' para o InventÃ¡rio Principal da organizaÃ§Ã£o."

        )

        

        return Response({

            "detail": f"Ativo '{asset.name}' promovido para o inventÃ¡rio principal com sucesso.",

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

            return Response({"detail": "Nenhum ativo de origem fornecido para fusÃ£o."}, status=status.HTTP_400_BAD_REQUEST)

            

        source_assets = Asset.objects.filter(id__in=source_ids).exclude(id=target_asset.id)

        

        if not source_assets.exists():

            return Response({"detail": "Ativos de origem nÃ£o encontrados."}, status=status.HTTP_404_NOT_FOUND)

            

        merged_count = 0

        # ConsolidaÃ§Ã£o de IPs: garantir que o IP principal nÃ£o estÃ¡ nos secundÃ¡rios

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

            

            # 2. Re-associaÃ§Ã£o de Software (M2M automÃ¡tico)

            source_sw = Software.objects.filter(assets=source)

            for sw in source_sw:

                sw.assets.add(target_asset)

                

            # 3. TransferÃªncia de Vulnerabilidades (Segura contra duplicados)

            source_vulns = AssetVulnerability.objects.filter(asset=source)

            for sv in source_vulns:

                # Verificar se o destino jÃ¡ tem esta ocorrÃªncia

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

                    # JÃ¡ existe, apagamos no de origem para libertar o ativo

                    sv.delete()



            # 4. TransferÃªncia de Riscos

            Risk.objects.filter(asset=source).update(asset=target_asset)

            

            # 5. Eliminar origem

            source.delete()

            merged_count += 1

            

        target_asset.secondary_ips = list(new_ips)

        target_asset.description = (target_asset.description or "") + f"\n\n[MERGE] Foram fundidos {merged_count} ativos neste registo em {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}."

        target_asset.save()



        # Log no histÃ³rico

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





