from rest_framework import viewsets
from rest_framework.filters import SearchFilter

from .models import IntegrationConfig, IntegrationSyncStatus
from .serializers import IntegrationConfigSerializer, IntegrationSyncStatusSerializer


class IntegrationConfigViewSet(viewsets.ModelViewSet):
    queryset = IntegrationConfig.objects.all().order_by("provider")
    serializer_class = IntegrationConfigSerializer
    filter_backends = [SearchFilter]
    search_fields = ["provider", "api_url", "indexer_url"]


class IntegrationSyncStatusViewSet(viewsets.ModelViewSet):
    queryset = IntegrationSyncStatus.objects.all().order_by("provider", "sync_type")
    serializer_class = IntegrationSyncStatusSerializer
    filter_backends = [SearchFilter]
    search_fields = ["provider", "sync_type", "status"]
