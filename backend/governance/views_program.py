from rest_framework.decorators import api_view
from rest_framework.response import Response

from governance.services.program_service import ProgramService


@api_view(["GET"])
def program_overview(_request):
    return Response(ProgramService.overview())
