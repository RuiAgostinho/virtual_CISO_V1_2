from django.contrib import admin
from .models import (
    DecisionRecord,
    GovernanceAction,
    GovernanceException,
    GovernanceRiskLink,
    InternalControl,
    InternalControlFrameworkMapping,
    InternalControlMechanism,
    PolicyInternalControl,
    GovernanceDocument,
    GovernanceDocumentControl,
    GovernanceDocumentSection,
    RunbookStep,
    EvidenceItem,
    EvidenceLink,
    MechanismEvidenceRequirement,
    CompliancePropagationResult,
    ControlAssessmentSnapshot,
)


@admin.register(DecisionRecord)
class DecisionRecordAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "decision_type",
        "decision",
        "target_type",
        "responsible",
        "due_date",
        "decided_by",
        "decided_at",
        "created_at",
    )
    list_filter = ("decision_type", "decision", "target_type", "due_date")
    search_fields = (
        "title",
        "recommendation",
        "rationale",
        "justification",
        "responsible",
        "risk_impact",
        "compliance_impact",
        "evidence_reference",
        "action_reference",
        "decided_by",
    )


@admin.register(GovernanceException)
class GovernanceExceptionAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "exception_type",
        "target_type",
        "target_id",
        "approval_status",
        "owner",
        "approver",
        "valid_until",
        "score_impact",
        "approved_at",
    )
    list_filter = (
        "exception_type",
        "target_type",
        "approval_status",
        "owner",
        "approver",
        "valid_until",
    )
    search_fields = (
        "title",
        "description",
        "business_justification",
        "compensating_control_description",
        "risk_impact",
        "compliance_impact",
        "evidence_reference",
        "action_reference",
        "target_id",
        "owner",
        "approver",
    )
    readonly_fields = ("created_at", "updated_at", "approved_at")


@admin.register(GovernanceAction)
class GovernanceActionAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "action_type",
        "priority",
        "status",
        "owner",
        "due_date",
        "estimated_effort_hours",
        "evidence_required",
        "ai_generated",
        "source_type",
        "source_key",
        "target_type",
        "target_id",
        "completed_at",
    )
    list_filter = (
        "action_type",
        "priority",
        "status",
        "source_type",
        "target_type",
        "evidence_required",
        "ai_generated",
        "owner",
        "due_date",
    )
    search_fields = (
        "title",
        "description",
        "recommendation",
        "required_roles",
        "required_materials",
        "expected_evidence",
        "owner",
        "notes",
        "source_key",
        "target_id",
    )
    readonly_fields = ("created_at", "updated_at", "completed_at")


@admin.register(GovernanceRiskLink)
class GovernanceRiskLinkAdmin(admin.ModelAdmin):
    list_display = (
        "source_type",
        "source_id",
        "target_type",
        "target_id",
        "relationship_type",
        "effectiveness_percentage",
        "residual_impact_percentage",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "validated_by",
        "validated_at",
    )
    list_filter = (
        "source_type",
        "target_type",
        "relationship_type",
        "mapping_source",
        "validation_status",
    )
    search_fields = (
        "source_id",
        "target_id",
        "rationale",
    )
    readonly_fields = ("created_at", "updated_at", "validated_at")
    raw_id_fields = ("created_by", "updated_by", "validated_by")


@admin.register(InternalControl)
class InternalControlAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "title",
        "control_domain",
        "criticality",
        "status",
        "source",
        "is_active",
        "legacy_control",
        "updated_at",
    )
    list_filter = (
        "control_domain",
        "criticality",
        "status",
        "source",
        "is_active",
    )
    search_fields = (
        "code",
        "title",
        "description",
        "control_domain",
        "objective",
        "risk_statement",
        "legacy_control__code",
        "legacy_control__title",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("legacy_control",)


@admin.register(InternalControlFrameworkMapping)
class InternalControlFrameworkMappingAdmin(admin.ModelAdmin):
    list_display = (
        "internal_control",
        "framework_control",
        "framework",
        "relationship_type",
        "coverage_percentage",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "validated_by",
        "validated_at",
    )
    list_filter = (
        "framework_control__framework",
        "validation_status",
        "mapping_source",
        "relationship_type",
    )
    search_fields = (
        "internal_control__code",
        "internal_control__title",
        "framework_control__code",
        "framework_control__title",
        "rationale",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = (
        "internal_control",
        "framework_control",
        "created_by",
        "updated_by",
        "validated_by",
    )

    @admin.display(ordering="framework_control__framework__code")
    def framework(self, obj):
        return obj.framework_control.framework


@admin.register(PolicyInternalControl)
class PolicyInternalControlAdmin(admin.ModelAdmin):
    list_display = (
        "policy",
        "internal_control",
        "applicability",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "validated_by",
        "validated_at",
    )
    list_filter = (
        "policy",
        "internal_control",
        "applicability",
        "mapping_source",
        "validation_status",
    )
    search_fields = (
        "policy__code",
        "policy__title",
        "internal_control__code",
        "internal_control__title",
        "rationale",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = (
        "policy",
        "internal_control",
        "created_by",
        "updated_by",
        "validated_by",
    )


@admin.register(InternalControlMechanism)
class InternalControlMechanismAdmin(admin.ModelAdmin):
    list_display = (
        "internal_control",
        "mechanism",
        "relationship_type",
        "mandatory",
        "implementation_status",
        "contribution_weight",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "validated_by",
        "validated_at",
    )
    list_filter = (
        "internal_control",
        "mechanism",
        "relationship_type",
        "mandatory",
        "implementation_status",
        "mapping_source",
        "validation_status",
    )
    search_fields = (
        "internal_control__code",
        "internal_control__title",
        "mechanism__title",
        "mechanism__description",
        "rationale",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = (
        "internal_control",
        "mechanism",
        "created_by",
        "updated_by",
        "validated_by",
    )


@admin.register(GovernanceDocument)
class GovernanceDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "document_type",
        "status",
        "version",
        "owner",
        "parent_document",
        "is_active",
        "updated_at",
    )
    list_filter = (
        "document_type",
        "status",
        "owner",
        "parent_document",
        "is_active",
    )
    search_fields = (
        "title",
        "content",
        "scope",
        "purpose",
        "owner",
        "legacy_policy__code",
        "legacy_policy__title",
        "legacy_technical_regulation__code",
        "legacy_technical_regulation__title",
        "legacy_procedure__code",
        "legacy_procedure__title",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = (
        "parent_document",
        "legacy_policy",
        "legacy_technical_regulation",
        "legacy_procedure",
    )


@admin.register(GovernanceDocumentControl)
class GovernanceDocumentControlAdmin(admin.ModelAdmin):
    list_display = (
        "document",
        "internal_control",
        "purpose",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "validated_by",
        "validated_at",
    )
    list_filter = (
        "document",
        "internal_control",
        "purpose",
        "validation_status",
        "mapping_source",
    )
    search_fields = (
        "document__title",
        "document__content",
        "internal_control__code",
        "internal_control__title",
        "rationale",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = (
        "document",
        "internal_control",
        "created_by",
        "updated_by",
        "validated_by",
    )


@admin.register(GovernanceDocumentSection)
class GovernanceDocumentSectionAdmin(admin.ModelAdmin):
    list_display = ("document", "section_number", "title", "order", "parent_section")
    list_filter = ("document", "parent_section")
    search_fields = ("document__title", "section_number", "title", "content")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("document", "parent_section")


@admin.register(RunbookStep)
class RunbookStepAdmin(admin.ModelAdmin):
    list_display = ("runbook", "step_number", "title", "evidence_required")
    list_filter = ("runbook", "evidence_required")
    search_fields = ("runbook__title", "title", "description", "expected_output")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("runbook",)


@admin.register(EvidenceItem)
class EvidenceItemAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "evidence_type",
        "status",
        "owner",
        "valid_until",
        "confidence_level",
        "is_active",
        "updated_at",
    )
    list_filter = (
        "evidence_type",
        "status",
        "owner",
        "valid_until",
        "is_active",
    )
    search_fields = (
        "title",
        "description",
        "source",
        "external_reference",
        "owner",
        "legacy_evidence__title",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("legacy_evidence",)


@admin.register(EvidenceLink)
class EvidenceLinkAdmin(admin.ModelAdmin):
    list_display = (
        "evidence_item",
        "target_type",
        "target_id",
        "link_type",
        "mapping_source",
        "validation_status",
        "confidence_score",
        "validated_by",
        "validated_at",
    )
    list_filter = (
        "target_type",
        "link_type",
        "validation_status",
        "mapping_source",
    )
    search_fields = (
        "evidence_item__title",
        "evidence_item__description",
        "evidence_item__source",
        "evidence_item__external_reference",
        "rationale",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = (
        "evidence_item",
        "target_content_type",
        "created_by",
        "updated_by",
        "validated_by",
    )


@admin.register(MechanismEvidenceRequirement)
class MechanismEvidenceRequirementAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "evidence_type",
        "mechanism",
        "mechanism_type",
        "control_domain",
        "priority",
        "source",
        "is_active",
        "updated_at",
    )
    list_filter = (
        "evidence_type",
        "mechanism_type",
        "control_domain",
        "priority",
        "source",
        "is_active",
    )
    search_fields = (
        "title",
        "description",
        "rationale",
        "mechanism__title",
        "mechanism__description",
        "control_domain",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("mechanism",)


@admin.register(CompliancePropagationResult)
class CompliancePropagationResultAdmin(admin.ModelAdmin):
    list_display = (
        "result_type",
        "target_type",
        "target_id",
        "score",
        "status",
        "calculation_mode",
        "calculated_at",
    )
    list_filter = ("result_type", "target_type", "status", "calculation_mode", "calculated_at")
    search_fields = ("target_id",)
    readonly_fields = ("created_at", "updated_at", "calculated_at")


@admin.register(ControlAssessmentSnapshot)
class ControlAssessmentSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "control",
        "profile",
        "snapshot_type",
        "snapshot_label",
        "implementation_status",
        "maturity_level",
        "effectiveness",
        "risk_residual",
        "captured_at",
        "created_by",
    )
    list_filter = (
        "snapshot_type",
        "implementation_status",
        "profile",
        "control__framework",
        "captured_at",
    )
    search_fields = (
        "snapshot_label",
        "control__code",
        "control__title",
        "control__framework__code",
        "notes",
        "assessed_by",
    )
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("assessment", "profile", "control", "created_by")
