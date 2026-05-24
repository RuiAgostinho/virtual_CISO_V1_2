from rest_framework.decorators import api_view
from rest_framework.response import Response

from governance.services.mechanism_evidence_overview_service import MechanismEvidenceOverviewService


@api_view(["GET"])
def mechanism_evidence_overview(request):
    return Response(MechanismEvidenceOverviewService.overview(request.query_params))
