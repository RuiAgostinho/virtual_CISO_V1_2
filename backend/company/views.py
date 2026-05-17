from rest_framework import filters, viewsets
from rest_framework.generics import RetrieveUpdateAPIView

from .models import CompanyProfile, OrgUnit, Person
from .serializers import CompanyProfileSerializer, OrgUnitSerializer, PersonSerializer


class CompanyProfileView(RetrieveUpdateAPIView):
    serializer_class = CompanyProfileSerializer

    def get_object(self):
        profile = CompanyProfile.objects.order_by("created_at").first()
        if profile:
            return profile
        return CompanyProfile.objects.create(legal_name="A sua Instituicao")


class OrgUnitViewSet(viewsets.ModelViewSet):
    queryset = OrgUnit.objects.select_related("parent", "manager").prefetch_related("people").all()
    serializer_class = OrgUnitSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "description", "security_relevance", "critical_services"]


class PersonViewSet(viewsets.ModelViewSet):
    queryset = Person.objects.select_related("org_unit", "backup_for").all()
    serializer_class = PersonSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "email", "role", "responsibilities"]
