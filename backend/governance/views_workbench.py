from rest_framework.decorators import api_view
from rest_framework.response import Response

from governance.services.workbench_service import GovernanceWorkbenchService


@api_view(["GET"])
def workbench_overview(_request):
    return Response(GovernanceWorkbenchService.overview())
