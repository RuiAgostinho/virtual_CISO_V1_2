from django.urls import path

from .views import CompanyProfileView

urlpatterns = [
    path("profile/", CompanyProfileView.as_view(), name="company-profile"),
]
