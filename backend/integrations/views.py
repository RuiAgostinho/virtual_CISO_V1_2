from rest_framework import viewsets
from rest_framework.filters import SearchFilter

from .models import IntegrationConfig, IntegrationSyncStatus
from .serializers import IntegrationConfigSerializer, IntegrationSyncStatusSerializer


from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

class IntegrationConfigViewSet(viewsets.ModelViewSet):
    queryset = IntegrationConfig.objects.all().order_by("provider")
    serializer_class = IntegrationConfigSerializer
    filter_backends = [SearchFilter]
    search_fields = ["provider", "api_url", "indexer_url"]

    @action(detail=False, methods=['get'], url_path=r'(?P<provider>\w+)/provider')
    def by_provider(self, request, provider=None):
        try:
            config = IntegrationConfig.objects.get(provider=provider)
            serializer = self.get_serializer(config)
            return Response(serializer.data)
        except IntegrationConfig.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        config = self.get_object()
        provider = config.provider
        
        try:
            import requests
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            if provider == 'wazuh':
                # Test API
                auth_url = f"{config.api_url}/security/user/authenticate"
                res = requests.get(auth_url, auth=(config.username, config.password), verify=False, timeout=5)
                res.raise_for_status()
                
                # Test Indexer if URL exists
                if config.indexer_url:
                    idx_res = requests.get(config.indexer_url, auth=(config.indexer_username, config.indexer_password), verify=False, timeout=3)
                    idx_res.raise_for_status()
                
                return Response({"status": "success", "message": "Conectado ao Manager API e ao Indexer com sucesso!"})
            
            elif provider == 'nist':
                url = config.api_url or "https://services.nvd.nist.gov/rest/json/cves/2.0"
                params = {"resultsPerPage": 1}
                headers = {}
                if config.password: # API Key
                    headers["apiKey"] = config.password
                
                res = requests.get(url, params=params, headers=headers, timeout=5)
                res.raise_for_status()
                return Response({"status": "success", "message": "Conexão à API do NIST verificada com sucesso!"})

            elif provider == 'epss':
                url = config.api_url or "https://www.first.org/epss/api"
                res = requests.head(url, timeout=5)
                res.raise_for_status()
                return Response({"status": "success", "message": "Serviço EPSS alcançável!"})

            elif provider == 'nmap':
                import paramiko
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                try:
                    ssh.connect(config.api_url, username=config.username, password=config.password, timeout=5)
                    ssh.close()
                    return Response({"status": "success", "message": "Ligação SSH ao Host de Discovery estabelecida!"})
                except Exception as e:
                    return Response({"status": "error", "message": f"Erro SSH: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

            return Response({"status": "error", "message": "Provedor desconhecido."}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({"status": "error", "message": f"Erro de conexão: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class IntegrationSyncStatusViewSet(viewsets.ModelViewSet):
    queryset = IntegrationSyncStatus.objects.all().order_by("provider", "sync_type")
    serializer_class = IntegrationSyncStatusSerializer
    filter_backends = [SearchFilter]
    search_fields = ["provider", "sync_type", "status"]
