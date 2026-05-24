from dataclasses import dataclass
from functools import reduce
from operator import or_

from django.db.models import Q
from django.utils import timezone

from governance.models import (
    Control,
    EvidenceItem,
    EvidenceLink,
    Framework,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceDocumentSection,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    Mechanism,
    Policy,
    PolicyInternalControl,
    RunbookStep,
)
from governance.services.compliance_propagation_engine import CompliancePropagationEngine


@dataclass(frozen=True)
class TraceabilityOptions:
    mode: str = CompliancePropagationEngine.OFFICIAL
    include_inactive: bool = False
    include_evidence: bool = True
    include_gaps: bool = True
    include_scores: bool = True
    max_depth: int = 3


class TraceabilityService:
    INACTIVE_STATUSES = {
        "rejected",
        "deprecated",
    }

    @classmethod
    def options_from_query(cls, query_params):
        return TraceabilityOptions(
            mode=CompliancePropagationEngine.normalize_mode(query_params.get("mode")),
            include_inactive=cls.parse_bool(query_params.get("include_inactive"), False),
            include_evidence=cls.parse_bool(query_params.get("include_evidence"), True),
            include_gaps=cls.parse_bool(query_params.get("include_gaps"), True),
            include_scores=cls.parse_bool(query_params.get("include_scores"), True),
            max_depth=cls.parse_depth(query_params.get("max_depth")),
        )

    @classmethod
    def trace_policy(cls, policy, options):
        policy_links = PolicyInternalControl.objects.select_related("internal_control").filter(policy=policy)
        active_policy_links, pending_policy_links, inactive_policy_links = cls.split_mappings(policy_links, options)
        internal_controls = cls.unique_objects([link.internal_control for link in active_policy_links])

        document_qs = GovernanceDocument.objects.filter(legacy_policy=policy).select_related("parent_document")
        documents = list(document_qs)

        control_context = cls.context_from_internal_controls(internal_controls, options)
        direct_evidence_targets = [(EvidenceLink.TargetType.POLICY, policy.id)]
        direct_evidence_targets += [(EvidenceLink.TargetType.GOVERNANCE_DOCUMENT, document.id) for document in documents]
        indirect_evidence_targets = control_context["evidence_targets"]

        relationships = {
            "policy_internal_controls": cls.mapping_payloads(active_policy_links),
            "internal_controls": cls.internal_control_payloads(internal_controls),
            "governance_documents": cls.document_payloads(documents),
            "mechanisms": cls.mechanism_payloads(control_context["mechanisms"]) if options.max_depth >= 2 else [],
            "framework_controls": cls.control_payloads(control_context["framework_controls"]) if options.max_depth >= 2 else [],
            "frameworks": cls.framework_payloads(control_context["frameworks"]) if options.max_depth >= 2 else [],
            "pending_review_mappings": {
                "policy_internal_controls": cls.mapping_payloads(pending_policy_links),
                **control_context["pending_mappings"],
            },
        }
        active_mappings = {
            "policy_internal_controls": cls.mapping_payloads(active_policy_links),
            **control_context["active_mappings"],
        }
        inactive_mappings = {
            "policy_internal_controls": cls.mapping_payloads(inactive_policy_links),
            **control_context["inactive_mappings"],
        }

        return cls.response(
            "policy",
            cls.policy_payload(policy),
            relationships,
            active_mappings,
            inactive_mappings,
            options,
            scores=lambda: cls.score_pair("policy", policy),
            gaps=lambda: CompliancePropagationEngine.calculate_policy(
                policy,
                mode=options.mode,
                include_details=False,
                include_gaps=True,
            ).get("gaps", []),
            evidence_targets=direct_evidence_targets + indirect_evidence_targets,
        )

    @classmethod
    def trace_governance_document(cls, document, options):
        document_links = GovernanceDocumentControl.objects.select_related("internal_control").filter(document=document)
        active_document_links, pending_document_links, inactive_document_links = cls.split_mappings(document_links, options)
        internal_controls = cls.unique_objects([link.internal_control for link in active_document_links])
        children = list(document.children.all().order_by("title"))
        sections = list(document.sections.select_related("parent_section").all().order_by("order", "section_number"))
        runbook_steps = list(document.runbook_steps.all().order_by("step_number"))
        policies = []
        if document.legacy_policy_id:
            policies.append(document.legacy_policy)
        policies += cls.policies_for_internal_controls(internal_controls, options)
        policies = cls.unique_objects([policy for policy in policies if policy])
        control_context = cls.context_from_internal_controls(internal_controls, options)

        evidence_targets = [(EvidenceLink.TargetType.GOVERNANCE_DOCUMENT, document.id)]
        evidence_targets += [(EvidenceLink.TargetType.RUNBOOK_STEP, step.id) for step in runbook_steps]
        evidence_targets += control_context["evidence_targets"]

        relationships = {
            "parent_document": cls.document_payload(document.parent_document) if document.parent_document_id else None,
            "children": cls.document_payloads(children),
            "sections": cls.section_payloads(sections),
            "runbook_steps": cls.runbook_step_payloads(runbook_steps),
            "governance_document_controls": cls.mapping_payloads(active_document_links),
            "internal_controls": cls.internal_control_payloads(internal_controls),
            "mechanisms": cls.mechanism_payloads(control_context["mechanisms"]) if options.max_depth >= 2 else [],
            "policies": cls.policy_payloads(policies),
            "framework_controls": cls.control_payloads(control_context["framework_controls"]) if options.max_depth >= 2 else [],
            "frameworks": cls.framework_payloads(control_context["frameworks"]) if options.max_depth >= 2 else [],
            "pending_review_mappings": {
                "governance_document_controls": cls.mapping_payloads(pending_document_links),
                **control_context["pending_mappings"],
            },
        }
        active_mappings = {
            "governance_document_controls": cls.mapping_payloads(active_document_links),
            **control_context["active_mappings"],
        }
        inactive_mappings = {
            "governance_document_controls": cls.mapping_payloads(inactive_document_links),
            **control_context["inactive_mappings"],
        }

        return cls.response(
            "governance_document",
            cls.document_payload(document),
            relationships,
            active_mappings,
            inactive_mappings,
            options,
            scores=lambda: cls.score_pair("governance_document", document),
            gaps=lambda: CompliancePropagationEngine.calculate_governance_document(
                document,
                mode=options.mode,
                include_details=False,
                include_gaps=True,
            ).get("gaps", []),
            evidence_targets=evidence_targets,
        )

    @classmethod
    def trace_internal_control(cls, internal_control, options):
        policy_links = PolicyInternalControl.objects.select_related("policy").filter(internal_control=internal_control)
        active_policy_links, pending_policy_links, inactive_policy_links = cls.split_mappings(policy_links, options)
        document_links = GovernanceDocumentControl.objects.select_related("document").filter(internal_control=internal_control)
        active_document_links, pending_document_links, inactive_document_links = cls.split_mappings(document_links, options)
        mechanism_links = InternalControlMechanism.objects.select_related("mechanism").filter(internal_control=internal_control)
        active_mechanism_links, pending_mechanism_links, inactive_mechanism_links = cls.split_mappings(mechanism_links, options)
        framework_mappings = InternalControlFrameworkMapping.objects.select_related(
            "framework_control",
            "framework_control__framework",
        ).filter(internal_control=internal_control)
        active_framework_mappings, pending_framework_mappings, inactive_framework_mappings = cls.split_mappings(
            framework_mappings,
            options,
        )

        mechanisms = cls.unique_objects([link.mechanism for link in active_mechanism_links])
        framework_controls = cls.unique_objects([mapping.framework_control for mapping in active_framework_mappings])
        frameworks = cls.unique_objects([control.framework for control in framework_controls])
        policies = cls.unique_objects([link.policy for link in active_policy_links])
        documents = cls.unique_objects([link.document for link in active_document_links])
        evidence_targets = [(EvidenceLink.TargetType.INTERNAL_CONTROL, internal_control.id)]
        evidence_targets += [(EvidenceLink.TargetType.MECHANISM, mechanism.id) for mechanism in mechanisms]

        relationships = {
            "policies": cls.policy_payloads(policies),
            "governance_documents": cls.document_payloads(documents),
            "mechanisms": cls.mechanism_link_payloads(active_mechanism_links),
            "framework_controls": cls.control_payloads(framework_controls),
            "frameworks": cls.framework_payloads(frameworks),
            "mandatory_mechanisms_without_implementation": cls.mechanism_link_payloads(
                [
                    link
                    for link in active_mechanism_links
                    if link.mandatory
                    and link.implementation_status == InternalControlMechanism.ImplementationStatus.NOT_IMPLEMENTED
                ]
            ),
            "implemented_evidenced_without_valid_evidence": cls.mechanism_link_payloads(
                [
                    link
                    for link in active_mechanism_links
                    if link.implementation_status == InternalControlMechanism.ImplementationStatus.IMPLEMENTED_EVIDENCED
                    and not cls.has_valid_evidence(link.mechanism, options)
                ]
            ),
            "pending_review_mappings": {
                "policy_internal_controls": cls.mapping_payloads(pending_policy_links),
                "governance_document_controls": cls.mapping_payloads(pending_document_links),
                "internal_control_mechanisms": cls.mapping_payloads(pending_mechanism_links),
                "framework_mappings": cls.mapping_payloads(pending_framework_mappings),
            },
        }
        active_mappings = {
            "policy_internal_controls": cls.mapping_payloads(active_policy_links),
            "governance_document_controls": cls.mapping_payloads(active_document_links),
            "internal_control_mechanisms": cls.mapping_payloads(active_mechanism_links),
            "framework_mappings": cls.mapping_payloads(active_framework_mappings),
        }
        inactive_mappings = {
            "policy_internal_controls": cls.mapping_payloads(inactive_policy_links),
            "governance_document_controls": cls.mapping_payloads(inactive_document_links),
            "internal_control_mechanisms": cls.mapping_payloads(inactive_mechanism_links),
            "framework_mappings": cls.mapping_payloads(inactive_framework_mappings),
        }

        return cls.response(
            "internal_control",
            cls.internal_control_payload(internal_control),
            relationships,
            active_mappings,
            inactive_mappings,
            options,
            scores=lambda: cls.score_pair("internal_control", internal_control),
            gaps=lambda: CompliancePropagationEngine.calculate_internal_control(
                internal_control,
                mode=options.mode,
                include_details=False,
                include_gaps=True,
            ).get("gaps", []),
            evidence_targets=evidence_targets,
        )

    @classmethod
    def trace_mechanism(cls, mechanism, options):
        mechanism_links = InternalControlMechanism.objects.select_related("internal_control").filter(mechanism=mechanism)
        active_mechanism_links, pending_mechanism_links, inactive_mechanism_links = cls.split_mappings(
            mechanism_links,
            options,
        )
        internal_controls = cls.unique_objects([link.internal_control for link in active_mechanism_links])
        policies = cls.policies_for_internal_controls(internal_controls, options)
        documents = cls.documents_for_internal_controls(internal_controls, options)
        framework_context = cls.framework_context_from_internal_controls(internal_controls, options)
        evidence_targets = [(EvidenceLink.TargetType.MECHANISM, mechanism.id)]
        score_by_internal_control = [
            {
                "internal_control": cls.internal_control_payload(link.internal_control),
                "implementation_status": link.implementation_status,
                "mandatory": link.mandatory,
                "score": cls.score_summary(
                    CompliancePropagationEngine.calculate_mechanism(
                        mechanism,
                        mode=options.mode,
                        include_details=False,
                        include_gaps=False,
                        link_context=link,
                    )
                ),
            }
            for link in active_mechanism_links
        ]

        relationships = {
            "internal_controls": cls.internal_control_payloads(internal_controls),
            "policies": cls.policy_payloads(policies),
            "governance_documents": cls.document_payloads(documents),
            "framework_controls": cls.control_payloads(framework_context["framework_controls"]),
            "frameworks": cls.framework_payloads(framework_context["frameworks"]),
            "score_by_internal_control": score_by_internal_control,
            "implementation_status_by_internal_control": cls.mechanism_link_payloads(active_mechanism_links),
            "pending_review_mappings": {
                "internal_control_mechanisms": cls.mapping_payloads(pending_mechanism_links),
                **framework_context["pending_mappings"],
            },
        }
        active_mappings = {
            "internal_control_mechanisms": cls.mapping_payloads(active_mechanism_links),
            **framework_context["active_mappings"],
        }
        inactive_mappings = {
            "internal_control_mechanisms": cls.mapping_payloads(inactive_mechanism_links),
            **framework_context["inactive_mappings"],
        }

        return cls.response(
            "mechanism",
            cls.mechanism_payload(mechanism),
            relationships,
            active_mappings,
            inactive_mappings,
            options,
            scores=lambda: cls.score_pair("mechanism", mechanism),
            gaps=lambda: CompliancePropagationEngine.calculate_mechanism(
                mechanism,
                mode=options.mode,
                include_details=False,
                include_gaps=True,
            ).get("gaps", []),
            evidence_targets=evidence_targets,
        )

    @classmethod
    def trace_evidence_item(cls, evidence_item, options):
        links = EvidenceLink.objects.select_related("evidence_item").filter(evidence_item=evidence_item)
        active_links, pending_links, inactive_links = cls.split_mappings(links, options)
        direct_mechanisms = cls.objects_from_links(active_links, EvidenceLink.TargetType.MECHANISM, Mechanism)
        direct_internal_controls = cls.objects_from_links(active_links, EvidenceLink.TargetType.INTERNAL_CONTROL, InternalControl)
        direct_documents = cls.objects_from_links(active_links, EvidenceLink.TargetType.GOVERNANCE_DOCUMENT, GovernanceDocument)
        direct_policies = cls.objects_from_links(active_links, EvidenceLink.TargetType.POLICY, Policy)
        direct_framework_controls = cls.objects_from_links(active_links, EvidenceLink.TargetType.FRAMEWORK_CONTROL, Control)

        mechanism_links = InternalControlMechanism.objects.select_related("internal_control", "mechanism").filter(
            mechanism__in=direct_mechanisms
        )
        active_mechanism_links, pending_mechanism_links, inactive_mechanism_links = cls.split_mappings(
            mechanism_links,
            options,
        )
        indirect_internal_controls = cls.unique_objects([link.internal_control for link in active_mechanism_links])
        internal_controls = cls.unique_objects(direct_internal_controls + indirect_internal_controls)
        framework_context = cls.framework_context_from_internal_controls(internal_controls, options)
        framework_controls = cls.unique_objects(direct_framework_controls + framework_context["framework_controls"])
        policies = cls.unique_objects(direct_policies + cls.policies_for_internal_controls(internal_controls, options))
        documents = cls.unique_objects(direct_documents + cls.documents_for_internal_controls(internal_controls, options))

        relationships = {
            "direct_links": cls.evidence_link_payloads(active_links),
            "mechanisms": cls.mechanism_payloads(direct_mechanisms),
            "internal_controls_direct": cls.internal_control_payloads(direct_internal_controls),
            "internal_controls_indirect": cls.internal_control_payloads(indirect_internal_controls),
            "governance_documents": cls.document_payloads(documents),
            "policies": cls.policy_payloads(policies),
            "framework_controls": cls.control_payloads(framework_controls),
            "frameworks": cls.framework_payloads(framework_context["frameworks"]),
            "validity": {
                "status": evidence_item.status,
                "is_expired": evidence_item.is_expired,
                "valid_until": cls.date_value(evidence_item.valid_until),
                "confidence_level": float(evidence_item.confidence_level),
            },
            "estimated_score_impact": {
                "mechanisms": len(direct_mechanisms),
                "internal_controls": len(internal_controls),
                "framework_controls": len(framework_controls),
                "frameworks": len(framework_context["frameworks"]),
            },
            "pending_review_mappings": {
                "evidence_links": cls.evidence_link_payloads(pending_links),
                "internal_control_mechanisms": cls.mapping_payloads(pending_mechanism_links),
                **framework_context["pending_mappings"],
            },
        }
        active_mappings = {
            "evidence_links": cls.evidence_link_payloads(active_links),
            "internal_control_mechanisms": cls.mapping_payloads(active_mechanism_links),
            **framework_context["active_mappings"],
        }
        inactive_mappings = {
            "evidence_links": cls.evidence_link_payloads(inactive_links),
            "internal_control_mechanisms": cls.mapping_payloads(inactive_mechanism_links),
            **framework_context["inactive_mappings"],
        }

        return cls.response(
            "evidence_item",
            cls.evidence_item_payload(evidence_item),
            relationships,
            active_mappings,
            inactive_mappings,
            options,
            scores=None,
            gaps=lambda: [
                gap
                for gap in CompliancePropagationEngine.collect_gaps(options.mode)
                if gap.get("target_id") == str(evidence_item.id)
                or gap.get("target_id") in {str(control.id) for control in internal_controls}
            ],
            evidence_targets=[],
        )

    @classmethod
    def trace_framework(cls, framework, options):
        sections = list(framework.sections.all().order_by("level", "sort_order", "code"))
        controls = list(Control.objects.select_related("framework", "section").filter(framework=framework).order_by("code"))
        mappings = InternalControlFrameworkMapping.objects.select_related(
            "internal_control",
            "framework_control",
            "framework_control__framework",
        ).filter(framework_control__in=controls)
        active_mappings, pending_mappings, inactive_mappings = cls.split_mappings(mappings, options)
        internal_controls = cls.unique_objects([mapping.internal_control for mapping in active_mappings])
        control_context = cls.context_from_internal_controls(internal_controls, options)
        evidence_targets = control_context["evidence_targets"]
        evidence_targets += [(EvidenceLink.TargetType.FRAMEWORK_CONTROL, control.id) for control in controls]

        relationships = {
            "framework_sections": cls.section_payloads(sections),
            "framework_controls": cls.control_payloads(controls),
            "internal_controls": cls.internal_control_payloads(internal_controls),
            "mechanisms": cls.mechanism_payloads(control_context["mechanisms"]),
            "policies": cls.policy_payloads(cls.policies_for_internal_controls(internal_controls, options)),
            "governance_documents": cls.document_payloads(cls.documents_for_internal_controls(internal_controls, options)),
            "pending_review_mappings": {
                "framework_mappings": cls.mapping_payloads(pending_mappings),
                **control_context["pending_mappings"],
            },
        }
        active_mapping_payload = {
            "framework_mappings": cls.mapping_payloads(active_mappings),
            **control_context["active_mappings"],
        }
        inactive_mapping_payload = {
            "framework_mappings": cls.mapping_payloads(inactive_mappings),
            **control_context["inactive_mappings"],
        }

        return cls.response(
            "framework",
            cls.framework_payload(framework),
            relationships,
            active_mapping_payload,
            inactive_mapping_payload,
            options,
            scores=lambda: cls.score_pair("framework", framework),
            gaps=lambda: CompliancePropagationEngine.calculate_framework(
                framework,
                mode=options.mode,
                include_details=False,
                include_gaps=True,
            ).get("gaps", []),
            evidence_targets=evidence_targets,
        )

    @classmethod
    def trace_framework_control(cls, framework_control, options):
        mappings = InternalControlFrameworkMapping.objects.select_related(
            "internal_control",
            "framework_control",
            "framework_control__framework",
        ).filter(framework_control=framework_control)
        active_mappings, pending_mappings, inactive_mappings = cls.split_mappings(mappings, options)
        internal_controls = cls.unique_objects([mapping.internal_control for mapping in active_mappings])
        control_context = cls.context_from_internal_controls(internal_controls, options)
        evidence_targets = [(EvidenceLink.TargetType.FRAMEWORK_CONTROL, framework_control.id)] + control_context["evidence_targets"]

        relationships = {
            "framework": cls.framework_payload(framework_control.framework),
            "internal_controls": cls.internal_control_payloads(internal_controls),
            "mechanisms": cls.mechanism_payloads(control_context["mechanisms"]),
            "policies": cls.policy_payloads(cls.policies_for_internal_controls(internal_controls, options)),
            "governance_documents": cls.document_payloads(cls.documents_for_internal_controls(internal_controls, options)),
            "pending_review_mappings": {
                "framework_mappings": cls.mapping_payloads(pending_mappings),
                **control_context["pending_mappings"],
            },
        }
        active_mapping_payload = {
            "framework_mappings": cls.mapping_payloads(active_mappings),
            **control_context["active_mappings"],
        }
        inactive_mapping_payload = {
            "framework_mappings": cls.mapping_payloads(inactive_mappings),
            **control_context["inactive_mappings"],
        }

        return cls.response(
            "framework_control",
            cls.control_payload(framework_control),
            relationships,
            active_mapping_payload,
            inactive_mapping_payload,
            options,
            scores=lambda: cls.score_pair("framework_control", framework_control),
            gaps=lambda: CompliancePropagationEngine.calculate_framework_control(
                framework_control,
                mode=options.mode,
                include_details=False,
                include_gaps=True,
            ).get("gaps", []),
            evidence_targets=evidence_targets,
        )

    @classmethod
    def overview(cls, options):
        statuses = [
            InternalControlFrameworkMapping.ValidationStatus.APPROVED,
            InternalControlFrameworkMapping.ValidationStatus.PENDING_REVIEW,
            InternalControlFrameworkMapping.ValidationStatus.REJECTED,
            InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
        ]
        mapping_models = [
            InternalControlFrameworkMapping,
            InternalControlMechanism,
            PolicyInternalControl,
            GovernanceDocumentControl,
            EvidenceLink,
        ]
        mapping_counts = {
            status: sum(model.objects.filter(validation_status=status).count() for model in mapping_models)
            for status in statuses
        }
        framework_scores = [
            cls.score_summary(
                CompliancePropagationEngine.calculate_framework(
                    framework,
                    mode=options.mode,
                    include_details=False,
                    include_gaps=False,
                )
            )
            | {"framework": cls.framework_payload(framework)}
            for framework in Framework.objects.all().order_by("code", "version")
        ]
        framework_scores.sort(key=lambda item: item.get("coverage", 0), reverse=True)
        internal_controls_without_mechanisms = [
            cls.internal_control_payload(control)
            for control in InternalControl.objects.filter(is_active=True)
            if not control.mechanism_links.filter(validation_status__in=cls.active_statuses(options)).exists()
        ]
        mechanisms_without_evidence = [
            cls.mechanism_payload(mechanism)
            for mechanism in Mechanism.objects.all().order_by("title")
            if not cls.has_valid_evidence(mechanism, options)
        ]
        expired_evidence = [
            cls.evidence_item_payload(evidence)
            for evidence in EvidenceItem.objects.filter(Q(status=EvidenceItem.Status.EXPIRED) | Q(valid_until__lt=timezone.localdate()))
        ]
        pending_mappings = []
        for model in mapping_models:
            pending_mappings.extend(cls.mapping_payloads(model.objects.filter(validation_status="pending_review")[:50]))

        return {
            "root": {"type": "overview"},
            "relationships": {
                "top_frameworks_by_coverage": framework_scores[:10],
                "internal_controls_without_mechanisms": internal_controls_without_mechanisms[:50],
                "mechanisms_without_evidence": mechanisms_without_evidence[:50],
                "expired_evidence": expired_evidence[:50],
                "pending_mappings": pending_mappings[:100],
            },
            "active_mappings": {},
            "metadata": cls.metadata(options),
            "totals": {
                "policies": Policy.objects.count(),
                "governance_documents": GovernanceDocument.objects.count(),
                "internal_controls": InternalControl.objects.count(),
                "mechanisms": Mechanism.objects.count(),
                "evidence_items": EvidenceItem.objects.count(),
                "frameworks": Framework.objects.count(),
                "mappings_approved": mapping_counts["approved"],
                "mappings_pending_review": mapping_counts["pending_review"],
                "mappings_rejected": mapping_counts["rejected"],
                "mappings_deprecated": mapping_counts["deprecated"],
            },
        }

    @classmethod
    def response(
        cls,
        root_type,
        root_payload,
        relationships,
        active_mappings,
        inactive_mappings,
        options,
        scores=None,
        gaps=None,
        evidence_targets=None,
    ):
        payload = {
            "root": {
                "type": root_type,
                "object": root_payload,
            },
            "relationships": relationships,
            "active_mappings": active_mappings,
            "metadata": cls.metadata(options),
        }
        if options.include_inactive:
            payload["inactive_mappings"] = inactive_mappings
        if options.include_scores and scores:
            payload["scores"] = scores()
        if options.include_evidence:
            payload["evidence"] = cls.evidence_section(evidence_targets or [], options)
        if options.include_gaps and gaps:
            payload["gaps"] = gaps()
        return payload

    @classmethod
    def context_from_internal_controls(cls, internal_controls, options):
        mechanism_links = InternalControlMechanism.objects.select_related("mechanism", "internal_control").filter(
            internal_control__in=internal_controls
        )
        active_mechanism_links, pending_mechanism_links, inactive_mechanism_links = cls.split_mappings(
            mechanism_links,
            options,
        )
        framework_context = cls.framework_context_from_internal_controls(internal_controls, options)
        mechanisms = cls.unique_objects([link.mechanism for link in active_mechanism_links])
        evidence_targets = [(EvidenceLink.TargetType.INTERNAL_CONTROL, control.id) for control in internal_controls]
        evidence_targets += [(EvidenceLink.TargetType.MECHANISM, mechanism.id) for mechanism in mechanisms]
        return {
            "mechanism_links": active_mechanism_links,
            "mechanisms": mechanisms,
            "framework_controls": framework_context["framework_controls"],
            "frameworks": framework_context["frameworks"],
            "evidence_targets": evidence_targets,
            "active_mappings": {
                "internal_control_mechanisms": cls.mapping_payloads(active_mechanism_links),
                **framework_context["active_mappings"],
            },
            "pending_mappings": {
                "internal_control_mechanisms": cls.mapping_payloads(pending_mechanism_links),
                **framework_context["pending_mappings"],
            },
            "inactive_mappings": {
                "internal_control_mechanisms": cls.mapping_payloads(inactive_mechanism_links),
                **framework_context["inactive_mappings"],
            },
        }

    @classmethod
    def framework_context_from_internal_controls(cls, internal_controls, options):
        mappings = InternalControlFrameworkMapping.objects.select_related(
            "framework_control",
            "framework_control__framework",
            "internal_control",
        ).filter(internal_control__in=internal_controls)
        active_mappings, pending_mappings, inactive_mappings = cls.split_mappings(mappings, options)
        framework_controls = cls.unique_objects([mapping.framework_control for mapping in active_mappings])
        frameworks = cls.unique_objects([control.framework for control in framework_controls])
        return {
            "framework_controls": framework_controls,
            "frameworks": frameworks,
            "active_mappings": {"framework_mappings": cls.mapping_payloads(active_mappings)},
            "pending_mappings": {"framework_mappings": cls.mapping_payloads(pending_mappings)},
            "inactive_mappings": {"framework_mappings": cls.mapping_payloads(inactive_mappings)},
        }

    @classmethod
    def policies_for_internal_controls(cls, internal_controls, options):
        links = PolicyInternalControl.objects.select_related("policy").filter(internal_control__in=internal_controls)
        active_links, _pending_links, _inactive_links = cls.split_mappings(links, options)
        return cls.unique_objects([link.policy for link in active_links])

    @classmethod
    def documents_for_internal_controls(cls, internal_controls, options):
        links = GovernanceDocumentControl.objects.select_related("document").filter(internal_control__in=internal_controls)
        active_links, _pending_links, _inactive_links = cls.split_mappings(links, options)
        return cls.unique_objects([link.document for link in active_links])

    @classmethod
    def evidence_section(cls, targets, options):
        links = cls.evidence_links_for_targets(targets, options)
        active_links, pending_links, inactive_links = cls.split_mappings(links, options)
        evidence_items = cls.unique_objects([link.evidence_item for link in active_links])
        section = {
            "items": cls.evidence_item_payloads(evidence_items),
            "links": cls.evidence_link_payloads(active_links),
            "pending_review_links": cls.evidence_link_payloads(pending_links),
        }
        if options.include_inactive:
            section["inactive_links"] = cls.evidence_link_payloads(inactive_links)
        return section

    @classmethod
    def evidence_links_for_targets(cls, targets, options):
        if not targets:
            return []
        queries = [Q(target_type=target_type, target_id=target_id) for target_type, target_id in targets]
        return list(
            EvidenceLink.objects.select_related("evidence_item")
            .filter(reduce(or_, queries))
            .order_by("target_type", "evidence_item__title")
        )

    @classmethod
    def objects_from_links(cls, links, target_type, model):
        ids = [link.target_id for link in links if link.target_type == target_type]
        if not ids:
            return []
        return list(model.objects.filter(id__in=ids))

    @classmethod
    def has_valid_evidence(cls, mechanism, options):
        links = EvidenceLink.objects.select_related("evidence_item").filter(
            target_type=EvidenceLink.TargetType.MECHANISM,
            target_id=mechanism.id,
            link_type__in=CompliancePropagationEngine.VALID_EVIDENCE_LINK_TYPES,
            validation_status__in=cls.active_statuses(options),
        )
        return any(link.evidence_item.is_score_eligible for link in links)

    @classmethod
    def score_pair(cls, target_type, obj):
        return {
            "official": cls.score_summary(
                CompliancePropagationEngine.calculate_target(
                    target_type,
                    str(obj.id),
                    mode=CompliancePropagationEngine.OFFICIAL,
                    include_details=False,
                    include_gaps=False,
                )
            ),
            "simulation": cls.score_summary(
                CompliancePropagationEngine.calculate_target(
                    target_type,
                    str(obj.id),
                    mode=CompliancePropagationEngine.SIMULATION,
                    include_details=False,
                    include_gaps=False,
                )
            ),
        }

    @classmethod
    def score_summary(cls, result):
        summary = {
            "score": result.get("score"),
            "status": result.get("status"),
            "calculation_mode": result.get("calculation_mode"),
        }
        if "coverage" in result:
            summary["coverage"] = result["coverage"]
        return summary

    @classmethod
    def split_mappings(cls, mappings, options):
        mappings = list(mappings)
        active_statuses = set(cls.active_statuses(options))
        active = [mapping for mapping in mappings if getattr(mapping, "validation_status", None) in active_statuses]
        pending = [
            mapping
            for mapping in mappings
            if getattr(mapping, "validation_status", None) == "pending_review"
            and "pending_review" not in active_statuses
        ]
        inactive = [
            mapping
            for mapping in mappings
            if getattr(mapping, "validation_status", None) in cls.INACTIVE_STATUSES
        ]
        return active, pending, inactive

    @classmethod
    def active_statuses(cls, options):
        if options.mode == CompliancePropagationEngine.OFFICIAL:
            return ["approved"]
        if options.mode == CompliancePropagationEngine.SIMULATION:
            return ["approved", "pending_review"]
        return ["approved", "pending_review", "draft"]

    @staticmethod
    def parse_bool(value, default):
        if value is None:
            return default
        return str(value).lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def parse_depth(value):
        try:
            depth = int(value or 3)
        except (TypeError, ValueError):
            return 3
        return max(1, min(depth, 3))

    @staticmethod
    def unique_objects(objects):
        seen = set()
        unique = []
        for obj in objects:
            if not obj:
                continue
            obj_id = getattr(obj, "id", None)
            if obj_id in seen:
                continue
            seen.add(obj_id)
            unique.append(obj)
        return unique

    @classmethod
    def mapping_payloads(cls, mappings):
        return [cls.mapping_payload(mapping) for mapping in mappings]

    @classmethod
    def mapping_payload(cls, mapping):
        payload = {
            "id": str(mapping.id),
            "type": mapping.__class__.__name__,
            "validation_status": getattr(mapping, "validation_status", None),
            "mapping_source": getattr(mapping, "mapping_source", ""),
        }
        if isinstance(mapping, PolicyInternalControl):
            payload.update(
                {
                    "policy": cls.policy_payload(mapping.policy),
                    "internal_control": cls.internal_control_payload(mapping.internal_control),
                    "applicability": mapping.applicability,
                }
            )
        elif isinstance(mapping, GovernanceDocumentControl):
            payload.update(
                {
                    "document": cls.document_payload(mapping.document),
                    "internal_control": cls.internal_control_payload(mapping.internal_control),
                    "purpose": mapping.purpose,
                }
            )
        elif isinstance(mapping, InternalControlMechanism):
            payload.update(cls.mechanism_link_payload(mapping))
        elif isinstance(mapping, InternalControlFrameworkMapping):
            payload.update(
                {
                    "internal_control": cls.internal_control_payload(mapping.internal_control),
                    "framework_control": cls.control_payload(mapping.framework_control),
                    "coverage_percentage": float(mapping.coverage_percentage),
                    "relationship_type": mapping.relationship_type,
                }
            )
        elif isinstance(mapping, EvidenceLink):
            payload.update(cls.evidence_link_payload(mapping))
        return payload

    @classmethod
    def mechanism_link_payloads(cls, links):
        return [cls.mechanism_link_payload(link) for link in links]

    @classmethod
    def mechanism_link_payload(cls, link):
        return {
            "id": str(link.id),
            "internal_control": cls.internal_control_payload(link.internal_control),
            "mechanism": cls.mechanism_payload(link.mechanism),
            "implementation_status": link.implementation_status,
            "mandatory": link.mandatory,
            "relationship_type": link.relationship_type,
            "contribution_weight": float(link.contribution_weight),
            "validation_status": link.validation_status,
        }

    @classmethod
    def evidence_link_payloads(cls, links):
        return [cls.evidence_link_payload(link) for link in links]

    @classmethod
    def evidence_link_payload(cls, link):
        return {
            "id": str(link.id),
            "target_type": link.target_type,
            "target_id": str(link.target_id),
            "link_type": link.link_type,
            "validation_status": link.validation_status,
            "mapping_source": link.mapping_source,
            "confidence_score": float(link.confidence_score),
            "evidence_item": cls.evidence_item_payload(link.evidence_item),
        }

    @classmethod
    def policy_payloads(cls, policies):
        return [cls.policy_payload(policy) for policy in policies]

    @staticmethod
    def policy_payload(policy):
        if not policy:
            return None
        return {
            "id": str(policy.id),
            "code": policy.code,
            "title": policy.title,
            "status": policy.status,
        }

    @classmethod
    def document_payloads(cls, documents):
        return [cls.document_payload(document) for document in documents]

    @staticmethod
    def document_payload(document):
        if not document:
            return None
        return {
            "id": str(document.id),
            "title": document.title,
            "document_type": document.document_type,
            "status": document.status,
            "version": document.version,
            "parent_document": str(document.parent_document_id) if document.parent_document_id else None,
            "legacy_policy": str(document.legacy_policy_id) if document.legacy_policy_id else None,
        }

    @classmethod
    def internal_control_payloads(cls, internal_controls):
        return [cls.internal_control_payload(control) for control in internal_controls]

    @staticmethod
    def internal_control_payload(control):
        if not control:
            return None
        return {
            "id": str(control.id),
            "code": control.code,
            "title": control.title,
            "control_domain": control.control_domain,
            "criticality": control.criticality,
            "status": control.status,
        }

    @classmethod
    def mechanism_payloads(cls, mechanisms):
        return [cls.mechanism_payload(mechanism) for mechanism in mechanisms]

    @staticmethod
    def mechanism_payload(mechanism):
        if not mechanism:
            return None
        return {
            "id": str(mechanism.id),
            "title": mechanism.title,
            "mechanism_type": mechanism.mechanism_type,
        }

    @classmethod
    def control_payloads(cls, controls):
        return [cls.control_payload(control) for control in controls]

    @staticmethod
    def control_payload(control):
        if not control:
            return None
        return {
            "id": str(control.id),
            "code": control.code,
            "title": control.title,
            "framework": str(control.framework_id),
            "framework_code": control.framework.code if control.framework_id else "",
            "section": str(control.section_id) if control.section_id else None,
        }

    @classmethod
    def framework_payloads(cls, frameworks):
        return [cls.framework_payload(framework) for framework in frameworks]

    @staticmethod
    def framework_payload(framework):
        if not framework:
            return None
        return {
            "id": str(framework.id),
            "code": framework.code,
            "name": framework.name,
            "version": framework.version,
        }

    @classmethod
    def evidence_item_payloads(cls, evidence_items):
        return [cls.evidence_item_payload(evidence) for evidence in evidence_items]

    @classmethod
    def evidence_item_payload(cls, evidence):
        if not evidence:
            return None
        return {
            "id": str(evidence.id),
            "title": evidence.title,
            "evidence_type": evidence.evidence_type,
            "status": evidence.status,
            "source": evidence.source,
            "external_reference": evidence.external_reference,
            "valid_until": cls.date_value(evidence.valid_until),
            "is_expired": evidence.is_expired,
            "confidence_level": float(evidence.confidence_level),
            "is_active": evidence.is_active,
        }

    @classmethod
    def section_payloads(cls, sections):
        return [cls.section_payload(section) for section in sections]

    @staticmethod
    def section_payload(section):
        if isinstance(section, GovernanceDocumentSection):
            return {
                "id": str(section.id),
                "document": str(section.document_id),
                "section_number": section.section_number,
                "title": section.title,
                "order": section.order,
                "parent_section": str(section.parent_section_id) if section.parent_section_id else None,
                "content_length": len(section.content or ""),
            }
        return {
            "id": str(section.id),
            "framework": str(section.framework_id),
            "code": section.code,
            "name": section.name,
            "level": section.level,
            "parent": str(section.parent_id) if section.parent_id else None,
        }

    @classmethod
    def runbook_step_payloads(cls, steps):
        return [cls.runbook_step_payload(step) for step in steps]

    @staticmethod
    def runbook_step_payload(step):
        return {
            "id": str(step.id),
            "runbook": str(step.runbook_id),
            "step_number": step.step_number,
            "title": step.title,
            "evidence_required": step.evidence_required,
            "description_length": len(step.description or ""),
            "expected_output_length": len(step.expected_output or ""),
        }

    @staticmethod
    def date_value(value):
        return value.isoformat() if value else None

    @staticmethod
    def metadata(options):
        return {
            "mode": options.mode,
            "max_depth": options.max_depth,
            "generated_at": timezone.now().isoformat(),
        }
