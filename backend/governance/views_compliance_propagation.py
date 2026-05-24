from django.shortcuts import get_object_or_404
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from governance.models import Control, Framework, GovernanceDocument, InternalControl, Mechanism, Policy
from governance.services.compliance_propagation_engine import CompliancePropagationEngine


def request_options(request):
    mode = CompliancePropagationEngine.normalize_mode(request.query_params.get("mode"))
    include_details = request.query_params.get("include_details", "true").lower() != "false"
    include_gaps = request.query_params.get("include_gaps", "true").lower() != "false"
    return mode, include_details, include_gaps


@api_view(["GET"])
def mechanism_compliance(request, pk):
    mode, include_details, include_gaps = request_options(request)
    mechanism = get_object_or_404(Mechanism, pk=pk)
    return Response(
        CompliancePropagationEngine.calculate_mechanism(mechanism, mode, include_details, include_gaps)
    )


@api_view(["GET"])
def internal_control_compliance(request, pk):
    mode, include_details, include_gaps = request_options(request)
    internal_control = get_object_or_404(InternalControl, pk=pk)
    return Response(
        CompliancePropagationEngine.calculate_internal_control(internal_control, mode, include_details, include_gaps)
    )


@api_view(["GET"])
def policy_compliance(request, pk):
    mode, include_details, include_gaps = request_options(request)
    policy = get_object_or_404(Policy, pk=pk)
    return Response(
        CompliancePropagationEngine.calculate_policy(policy, mode, include_details, include_gaps)
    )


@api_view(["GET"])
def governance_document_compliance(request, pk):
    mode, include_details, include_gaps = request_options(request)
    document = get_object_or_404(GovernanceDocument, pk=pk)
    return Response(
        CompliancePropagationEngine.calculate_governance_document(document, mode, include_details, include_gaps)
    )


@api_view(["GET"])
def framework_control_compliance(request, pk):
    mode, include_details, include_gaps = request_options(request)
    control = get_object_or_404(Control, pk=pk)
    return Response(
        CompliancePropagationEngine.calculate_framework_control(control, mode, include_details, include_gaps)
    )


@api_view(["GET"])
def framework_compliance(request, pk):
    mode, include_details, include_gaps = request_options(request)
    framework = get_object_or_404(Framework, pk=pk)
    return Response(
        CompliancePropagationEngine.calculate_framework(framework, mode, include_details, include_gaps)
    )


@api_view(["GET"])
def compliance_gaps(request):
    mode, _include_details, _include_gaps = request_options(request)
    return Response(
        {
            "calculation_mode": mode,
            "gaps": CompliancePropagationEngine.collect_gaps(mode),
        }
    )


@api_view(["POST"])
def recalculate_compliance(request):
    mode, include_details, include_gaps = request_options(request)
    summary = CompliancePropagationEngine.recalculate(mode, include_details, include_gaps)
    return Response(summary, status=status.HTTP_200_OK)


@api_view(["POST"])
def preview_compliance(request):
    mode, include_details, include_gaps = request_options(request)
    try:
        payload = CompliancePropagationEngine.preview(request.data, mode, include_details, include_gaps)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except ObjectDoesNotExist:
        return Response({"detail": "Target not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(payload, status=status.HTTP_200_OK)
