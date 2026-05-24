from rest_framework.decorators import api_view
from rest_framework.response import Response

from governance.services.governance_health_service import GovernanceHealthService


@api_view(["GET"])
def governance_health_overview(_request):
    return Response(GovernanceHealthService.overview())
