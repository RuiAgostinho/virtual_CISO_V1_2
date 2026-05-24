from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import GovernanceRiskLink
from .services.residual_risk_service import GovernanceResidualRiskService


def _mode(request):
    value = request.query_params.get("mode", "official")
    if value not in {"official", "simulation", "exploratory"}:
        return "official"
    return value


def _include_inactive(request):
    return str(request.query_params.get("include_inactive", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def residual_risk_overview(request):
    return Response(GovernanceResidualRiskService.overview(mode=_mode(request)))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def residual_risk_for_risk(request, pk):
    payload = GovernanceResidualRiskService.risk_impact(
        pk,
        mode=_mode(request),
        include_inactive=_include_inactive(request),
    )
    if not payload.get("found", True):
        return Response(payload, status=status.HTTP_404_NOT_FOUND)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def residual_risk_for_asset(request, pk):
    payload = GovernanceResidualRiskService.asset_impact(
        pk,
        mode=_mode(request),
        include_inactive=_include_inactive(request),
    )
    if not payload.get("found", True):
        return Response(payload, status=status.HTTP_404_NOT_FOUND)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def residual_risk_for_vulnerability(request, pk):
    payload = GovernanceResidualRiskService.vulnerability_impact(
        pk,
        mode=_mode(request),
        include_inactive=_include_inactive(request),
    )
    if not payload.get("found", True):
        return Response(payload, status=status.HTTP_404_NOT_FOUND)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def residual_risk_for_internal_control(request, pk):
    return Response(
        GovernanceResidualRiskService.source_impact(
            GovernanceRiskLink.SourceType.INTERNAL_CONTROL,
            pk,
            mode=_mode(request),
            include_inactive=_include_inactive(request),
        )
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def residual_risk_for_mechanism(request, pk):
    return Response(
        GovernanceResidualRiskService.source_impact(
            GovernanceRiskLink.SourceType.MECHANISM,
            pk,
            mode=_mode(request),
            include_inactive=_include_inactive(request),
        )
    )
