from django.urls import path, include

from rest_framework.routers import DefaultRouter

from .views import (

    AssetViewSet, SoftwareViewSet, 

    VulnerabilityViewSet, AssetVulnerabilityViewSet,

    RiskViewSet, RiskTreatmentViewSet, RiskAssessmentViewSet, NetworkRangeViewSet,

    AssetCategoryViewSet, AssetTypeViewSet,

    AssetLocationViewSet, AssetEnvironmentViewSet, AssetInfrastructureViewSet,

    RiskConfigurationViewSet

)



router = DefaultRouter()

router.register(r'risk-configuration', RiskConfigurationViewSet, basename='risk-configuration')

router.register(r'assets', AssetViewSet, basename='asset')

router.register(r'software', SoftwareViewSet, basename='software')

router.register(r'vulnerabilities', VulnerabilityViewSet, basename='vulnerability')

router.register(r'vulnerability-occurrences', AssetVulnerabilityViewSet, basename='vulnerability-occurrence')

router.register(r'risks', RiskViewSet, basename='risk')

router.register(r'risk-treatments', RiskTreatmentViewSet, basename='risk-treatment')

router.register(r'risk-assessments', RiskAssessmentViewSet, basename='risk-assessment')

router.register(r'network-ranges', NetworkRangeViewSet, basename='network-range')

router.register(r'asset-categories', AssetCategoryViewSet, basename='asset-category')

router.register(r'asset-types', AssetTypeViewSet, basename='asset-type')

router.register(r'asset-locations', AssetLocationViewSet, basename='asset-location')

router.register(r'asset-environments', AssetEnvironmentViewSet, basename='asset-environment')

router.register(r'asset-infrastructures', AssetInfrastructureViewSet, basename='asset-infrastructure')



urlpatterns = [

    path('', include(router.urls)),

]



