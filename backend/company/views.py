from rest_framework.generics import RetrieveUpdateAPIView

from .models import CompanyProfile
from .serializers import CompanyProfileSerializer


class CompanyProfileView(RetrieveUpdateAPIView):
    serializer_class = CompanyProfileSerializer

    def get_object(self):
        profile = CompanyProfile.objects.order_by("created_at").first()
        if profile:
            return profile
        return CompanyProfile.objects.create(legal_name="A sua Instituicao")
