"""
Decision screen — context + register endpoints.

`DecisionContextView` (GET) aggregates everything the Decision UI needs in a
single round-trip.
`RegisterDecisionView` (POST) persists the CISO decision with a
server-rebuilt snapshot so the audit trail is defensible regardless of what
the client sent (delegates to governance.services.decision_registrar).

Both back the requirements of Cap. 4.11 and 4.12.5 of the dissertation.
"""

from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from governance.services.decision_context_builder import DecisionContextBuilder
from governance.services.decision_recommendation import DecisionRecommendationService
from governance.services.decision_registrar import (
    DecisionValidationError,
    register_decision,
)
from risk.models.vulnerability import AssetVulnerability


def _actor_label(user) -> str:
    if not user or not getattr(user, "is_authenticated", False):
        return "sistema"
    for attr in ("get_full_name", "username", "email"):
        value = getattr(user, attr, None)
        if callable(value):
            value = value()
        if value:
            return str(value)
    return "utilizador"


class DecisionContextView(APIView):
    """
    GET /api/governance/decision-context/<occurrence_id>/

    Returns the full payload for the Decision screen: occurrence identification,
    multidimensional score, compliance chain, decision history, available actions
    and a placeholder for the AI recommendation (filled by a separate endpoint).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, occurrence_id, *args, **kwargs):
        occurrence = get_object_or_404(
            AssetVulnerability.objects.select_related("asset", "vulnerability"),
            id=occurrence_id,
        )
        payload = DecisionContextBuilder.build(occurrence)
        return Response(payload)


class RegisterDecisionView(APIView):
    """
    POST /api/governance/decision-context/<occurrence_id>/register/

    Body (JSON):
        decision_code    (required) one of accepted/mitigate/deferred/transferred/converted_to_action
        justification    (required) non-empty rationale text (>= 10 chars)
        title            (optional) custom title; auto-generated otherwise
        transfer_to      (optional) free text used in rationale for the transferred decision
        due_date         (optional, ISO date) informational

    The snapshot (score + chain) is rebuilt server-side at the moment of
    registration to guarantee it reflects the actual state when the decision was
    taken — defensability in audit (Cap. 4.12.5). The client cannot override
    the snapshot.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, occurrence_id, *args, **kwargs):
        occurrence = get_object_or_404(
            AssetVulnerability.objects.select_related("asset", "vulnerability"),
            id=occurrence_id,
        )

        try:
            result = register_decision(
                occurrence,
                decision_code=request.data.get("decision_code", ""),
                justification=request.data.get("justification", ""),
                actor=_actor_label(request.user),
                title=request.data.get("title"),
                transfer_to=request.data.get("transfer_to"),
                due_date=request.data.get("due_date"),
            )
        except DecisionValidationError as exc:
            return Response({"errors": exc.errors}, status=http_status.HTTP_400_BAD_REQUEST)

        return Response(result.to_dict(), status=http_status.HTTP_201_CREATED)


class RecommendDecisionView(APIView):
    """
    POST /api/governance/decision-context/<occurrence_id>/recommend/

    Generates the AI recommendation (region C of the Decision screen) on demand.
    Kept out of the GET context endpoint so page loads stay fast — the LLM call
    can take several seconds.

    Combines structured retrieval (score + compliance chain) with semantic
    retrieval (pgvector knowledge chunks) into one grounded prompt — Cap. 4.10.
    Degrades gracefully when the local LLM is unreachable.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, occurrence_id, *args, **kwargs):
        occurrence = get_object_or_404(
            AssetVulnerability.objects.select_related("asset", "vulnerability"),
            id=occurrence_id,
        )
        recommendation = DecisionRecommendationService.generate(occurrence)
        return Response(recommendation)
