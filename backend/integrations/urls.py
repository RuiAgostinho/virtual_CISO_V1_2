from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import IntegrationConfigViewSet, IntegrationSyncStatusViewSet

router = DefaultRouter()
router.register(r"configs", IntegrationConfigViewSet, basename="integration-config")
router.register(r"sync-status", IntegrationSyncStatusViewSet, basename="integration-sync-status")

urlpatterns = [
    path("", include(router.urls)),
]
