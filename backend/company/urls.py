from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CompanyProfileView, OrgUnitViewSet, PersonViewSet

router = DefaultRouter()
router.register(r"people", PersonViewSet, basename="person")
router.register(r"org-units", OrgUnitViewSet, basename="org-unit")

urlpatterns = [
    path("profile/", CompanyProfileView.as_view(), name="company-profile"),
    path("", include(router.urls)),
]
