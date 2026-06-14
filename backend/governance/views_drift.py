from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from governance.models import ControlAssessmentSnapshot
from governance.services.security_posture_drift import SecurityPostureDriftService


def _snapshot_type(value):
    valid = {choice[0] for choice in ControlAssessmentSnapshot.SnapshotType.choices}
    return value if value in valid else ControlAssessmentSnapshot.SnapshotType.MANUAL


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def drift_overview(request):
    since = parse_datetime(request.query_params.get("since") or "")
    return Response(SecurityPostureDriftService.overview(since=since))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def drift_snapshot_current(request):
    user = request.user if request.user and request.user.is_authenticated else None
    result = SecurityPostureDriftService.create_current_snapshot(
        label=request.data.get("label") or "",
        snapshot_type=_snapshot_type(request.data.get("snapshot_type") or ""),
        user=user,
    )
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def drift_demo_regression(request):
    user = request.user if request.user and request.user.is_authenticated else None
    return Response(SecurityPostureDriftService.create_demo_regression(user=user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def drift_demo_improvement(request):
    user = request.user if request.user and request.user.is_authenticated else None
    return Response(SecurityPostureDriftService.create_demo_improvement(user=user))
