from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from governance.models import Control, EvidenceItem, Framework, GovernanceDocument, InternalControl, Mechanism, Policy
from governance.services.traceability_service import TraceabilityService


@api_view(["GET"])
def traceability_policy(request, pk):
    options = TraceabilityService.options_from_query(request.query_params)
    policy = get_object_or_404(Policy, pk=pk)
    return Response(TraceabilityService.trace_policy(policy, options))


@api_view(["GET"])
def traceability_governance_document(request, pk):
    options = TraceabilityService.options_from_query(request.query_params)
    document = get_object_or_404(GovernanceDocument, pk=pk)
    return Response(TraceabilityService.trace_governance_document(document, options))


@api_view(["GET"])
def traceability_internal_control(request, pk):
    options = TraceabilityService.options_from_query(request.query_params)
    internal_control = get_object_or_404(InternalControl, pk=pk)
    return Response(TraceabilityService.trace_internal_control(internal_control, options))


@api_view(["GET"])
def traceability_mechanism(request, pk):
    options = TraceabilityService.options_from_query(request.query_params)
    mechanism = get_object_or_404(Mechanism, pk=pk)
    return Response(TraceabilityService.trace_mechanism(mechanism, options))


@api_view(["GET"])
def traceability_evidence_item(request, pk):
    options = TraceabilityService.options_from_query(request.query_params)
    evidence_item = get_object_or_404(EvidenceItem, pk=pk)
    return Response(TraceabilityService.trace_evidence_item(evidence_item, options))


@api_view(["GET"])
def traceability_framework(request, pk):
    options = TraceabilityService.options_from_query(request.query_params)
    framework = get_object_or_404(Framework, pk=pk)
    return Response(TraceabilityService.trace_framework(framework, options))


@api_view(["GET"])
def traceability_framework_control(request, pk):
    options = TraceabilityService.options_from_query(request.query_params)
    framework_control = get_object_or_404(Control, pk=pk)
    return Response(TraceabilityService.trace_framework_control(framework_control, options))


@api_view(["GET"])
def traceability_overview(request):
    options = TraceabilityService.options_from_query(request.query_params)
    return Response(TraceabilityService.overview(options))
