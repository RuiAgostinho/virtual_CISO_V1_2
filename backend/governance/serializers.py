from rest_framework import serializers
from django.apps import apps
from .models import (
    Framework, Control, ControlMapping, Mechanism, ControlMechanism, MechanismEvidence,
    InternalControl, InternalControlFrameworkMapping,
    InternalControlMechanism,
    Policy, PolicyControl, ImplementationMechanism, PolicyEvidence, PolicyAssessment, PolicySection,
    PolicyInternalControl,
    GovernanceDocument, GovernanceDocumentControl, GovernanceDocumentSection, RunbookStep,
    EvidenceItem, EvidenceLink, MechanismEvidenceRequirement,
    CompliancePropagationResult,
    ComplianceGap, RegulatoryContext, Stakeholder, TechnicalRegulation, Procedure, DecisionRecord, GovernanceException, GovernanceAction, GovernanceRiskLink, Tag,
    ControlAssessment, Evidence, Finding, ImprovementAction
)
from company.serializers import CompanyProfileSerializer


class FrameworkSerializer(serializers.ModelSerializer):
    controls_count = serializers.IntegerField(source="controls.count", read_only=True)
    sections_count = serializers.IntegerField(source="sections.count", read_only=True)

    class Meta:
        model = Framework
        fields = "__all__"


class MechanismSerializer(serializers.ModelSerializer):
    controls_count = serializers.IntegerField(source="controls.count", read_only=True)
    evidence_count = serializers.SerializerMethodField()
    tags = serializers.ListField(
        child=serializers.CharField(max_length=255),
        write_only=True,
        required=False
    )

    class Meta:
        model = Mechanism
        fields = "__all__"

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['tags'] = [tag.name for tag in instance.tags.all()]
        return ret

    def get_evidence_count(self, obj):
        return MechanismEvidence.objects.filter(control_mechanism__mechanism=obj).count()

    def _set_tags(self, mechanism, tag_names):
        tags = []
        for tag_name in tag_names:
            clean_name = str(tag_name).strip()
            if not clean_name:
                continue
            tag, _created = Tag.objects.get_or_create(name=clean_name)
            tags.append(tag)
        mechanism.tags.set(tags)

    def create(self, validated_data):
        tags = validated_data.pop('tags', [])
        mechanism = super().create(validated_data)
        self._set_tags(mechanism, tags)
        return mechanism

    def update(self, instance, validated_data):
        tags = validated_data.pop('tags', None)
        mechanism = super().update(instance, validated_data)
        if tags is not None:
            self._set_tags(mechanism, tags)
        return mechanism


class MechanismEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = MechanismEvidence
        fields = "__all__"


class ControlMechanismSerializer(serializers.ModelSerializer):
    mechanism_title = serializers.CharField(source="mechanism.title", read_only=True)
    mechanism_type = serializers.CharField(source="mechanism.mechanism_type", read_only=True)
    mechanism_description = serializers.CharField(source="mechanism.description", read_only=True)
    control_code = serializers.CharField(source="control.code", read_only=True)
    control_title = serializers.CharField(source="control.title", read_only=True)
    framework_name = serializers.CharField(source="control.framework.name", read_only=True)
    evidences = MechanismEvidenceSerializer(many=True, read_only=True)

    class Meta:
        model = ControlMechanism
        fields = [
            "id", "control", "mechanism", "status", "responsible", 
            "deadline", "acceptance_criteria",
            "mechanism_title", "mechanism_type", "mechanism_description",
            "control_code", "control_title", "framework_name", "evidences"
        ]


class ControlSerializer(serializers.ModelSerializer):
    framework_name = serializers.CharField(source="framework.name", read_only=True)
    framework_code = serializers.CharField(source="framework.code", read_only=True)
    framework_version = serializers.CharField(source="framework.version", read_only=True)
    section_code = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()
    mechanisms_count = serializers.IntegerField(read_only=True)
    internal_mappings_count = serializers.SerializerMethodField()
    approved_internal_mappings_count = serializers.SerializerMethodField()

    def get_section_code(self, obj):
        return obj.section.code if obj.section_id and obj.section else None

    def get_section_name(self, obj):
        return obj.section.name if obj.section_id and obj.section else None

    def get_internal_mappings_count(self, obj):
        annotated_value = getattr(obj, "internal_mappings_count", None)
        if annotated_value is not None:
            return annotated_value
        return obj.internal_control_mappings.exclude(
            validation_status__in=[
                InternalControlFrameworkMapping.ValidationStatus.REJECTED,
                InternalControlFrameworkMapping.ValidationStatus.DEPRECATED,
            ]
        ).count()

    def get_approved_internal_mappings_count(self, obj):
        annotated_value = getattr(obj, "approved_internal_mappings_count", None)
        if annotated_value is not None:
            return annotated_value
        return obj.internal_control_mappings.filter(
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED
        ).count()

    class Meta:
        model = Control
        fields = [
            "id",
            "code",
            "title",
            "description",
            "implementation_guidance",
            "is_mandatory",
            "applicability_scope",
            "status",
            "framework",
            "framework_name",
            "framework_code",
            "framework_version",
            "section",
            "section_code",
            "section_name",
            "mechanisms_count",
            "internal_mappings_count",
            "approved_internal_mappings_count",
        ]


class ControlMappingSerializer(serializers.ModelSerializer):
    source_control_code = serializers.CharField(source="source_control.code", read_only=True)
    source_control_title = serializers.CharField(source="source_control.title", read_only=True)
    source_framework = serializers.UUIDField(source="source_control.framework.id", read_only=True)
    source_framework_name = serializers.CharField(source="source_control.framework.name", read_only=True)
    source_framework_code = serializers.CharField(source="source_control.framework.code", read_only=True)
    target_control_code = serializers.CharField(source="target_control.code", read_only=True)
    target_control_title = serializers.CharField(source="target_control.title", read_only=True)
    target_framework = serializers.UUIDField(source="target_control.framework.id", read_only=True)
    target_framework_name = serializers.CharField(source="target_control.framework.name", read_only=True)
    target_framework_code = serializers.CharField(source="target_control.framework.code", read_only=True)
    mapping_type_display = serializers.CharField(source="get_mapping_type_display", read_only=True)

    class Meta:
        model = ControlMapping
        fields = [
            "id",
            "source_control",
            "source_control_code",
            "source_control_title",
            "source_framework",
            "source_framework_name",
            "source_framework_code",
            "target_control",
            "target_control_code",
            "target_control_title",
            "target_framework",
            "target_framework_name",
            "target_framework_code",
            "mapping_type",
            "mapping_type_display",
            "confidence",
            "rationale",
            "created_at",
            "updated_at",
        ]


class InternalControlSerializer(serializers.ModelSerializer):
    legacy_control_code = serializers.CharField(source="legacy_control.code", read_only=True)
    legacy_control_title = serializers.CharField(source="legacy_control.title", read_only=True)
    legacy_framework = serializers.UUIDField(source="legacy_control.framework.id", read_only=True)
    legacy_framework_code = serializers.CharField(source="legacy_control.framework.code", read_only=True)
    legacy_framework_name = serializers.CharField(source="legacy_control.framework.name", read_only=True)
    mappings_count = serializers.IntegerField(source="framework_mappings.count", read_only=True)
    approved_mappings_count = serializers.SerializerMethodField()

    class Meta:
        model = InternalControl
        fields = [
            "id",
            "code",
            "title",
            "description",
            "control_domain",
            "objective",
            "risk_statement",
            "owner_role",
            "criticality",
            "status",
            "source",
            "legacy_control",
            "legacy_control_code",
            "legacy_control_title",
            "legacy_framework",
            "legacy_framework_code",
            "legacy_framework_name",
            "is_active",
            "mappings_count",
            "approved_mappings_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "legacy_control_code",
            "legacy_control_title",
            "legacy_framework",
            "legacy_framework_code",
            "legacy_framework_name",
            "mappings_count",
            "approved_mappings_count",
        ]

    def get_approved_mappings_count(self, obj):
        return obj.framework_mappings.filter(
            validation_status=InternalControlFrameworkMapping.ValidationStatus.APPROVED
        ).count()


class InternalControlFrameworkMappingSerializer(serializers.ModelSerializer):
    internal_control_code = serializers.CharField(source="internal_control.code", read_only=True)
    internal_control_title = serializers.CharField(source="internal_control.title", read_only=True)
    internal_control_status = serializers.CharField(source="internal_control.status", read_only=True)
    internal_control_source = serializers.CharField(source="internal_control.source", read_only=True)
    internal_control_domain = serializers.CharField(source="internal_control.control_domain", read_only=True)
    framework_control_code = serializers.CharField(source="framework_control.code", read_only=True)
    framework_control_title = serializers.CharField(source="framework_control.title", read_only=True)
    framework = serializers.UUIDField(source="framework_control.framework.id", read_only=True)
    framework_code = serializers.CharField(source="framework_control.framework.code", read_only=True)
    framework_name = serializers.CharField(source="framework_control.framework.name", read_only=True)
    relationship_type_display = serializers.CharField(source="get_relationship_type_display", read_only=True)
    mapping_source_display = serializers.CharField(source="get_mapping_source_display", read_only=True)
    validation_status_display = serializers.CharField(source="get_validation_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    validated_by_username = serializers.CharField(source="validated_by.username", read_only=True)
    is_official = serializers.BooleanField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = InternalControlFrameworkMapping
        fields = [
            "id",
            "internal_control",
            "internal_control_code",
            "internal_control_title",
            "internal_control_status",
            "internal_control_source",
            "internal_control_domain",
            "framework_control",
            "framework_control_code",
            "framework_control_title",
            "framework",
            "framework_code",
            "framework_name",
            "relationship_type",
            "relationship_type_display",
            "coverage_percentage",
            "rationale",
            "mapping_source",
            "mapping_source_display",
            "validation_status",
            "validation_status_display",
            "confidence_score",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "validated_by",
            "validated_by_username",
            "validated_at",
            "is_official",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mapping_source",
            "validation_status",
            "created_by",
            "updated_by",
            "validated_by",
            "validated_at",
            "created_at",
            "updated_at",
            "relationship_type_display",
            "mapping_source_display",
            "validation_status_display",
            "created_by_username",
            "updated_by_username",
            "validated_by_username",
            "is_official",
            "is_active",
        ]

    def validate_coverage_percentage(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value

    def validate_confidence_score(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value


class InternalControlMechanismSerializer(serializers.ModelSerializer):
    internal_control_code = serializers.CharField(source="internal_control.code", read_only=True)
    internal_control_title = serializers.CharField(source="internal_control.title", read_only=True)
    internal_control_domain = serializers.CharField(source="internal_control.control_domain", read_only=True)
    mechanism_title = serializers.CharField(source="mechanism.title", read_only=True)
    mechanism_description = serializers.CharField(source="mechanism.description", read_only=True)
    mechanism_type = serializers.CharField(source="mechanism.mechanism_type", read_only=True)
    implementation_status_display = serializers.CharField(source="get_implementation_status_display", read_only=True)
    relationship_type_display = serializers.CharField(source="get_relationship_type_display", read_only=True)
    mapping_source_display = serializers.CharField(source="get_mapping_source_display", read_only=True)
    validation_status_display = serializers.CharField(source="get_validation_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    validated_by_username = serializers.CharField(source="validated_by.username", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_official = serializers.BooleanField(read_only=True)

    class Meta:
        model = InternalControlMechanism
        fields = [
            "id",
            "internal_control",
            "internal_control_code",
            "internal_control_title",
            "internal_control_domain",
            "mechanism",
            "mechanism_title",
            "mechanism_description",
            "mechanism_type",
            "contribution_weight",
            "mandatory",
            "implementation_status",
            "implementation_status_display",
            "relationship_type",
            "relationship_type_display",
            "rationale",
            "mapping_source",
            "mapping_source_display",
            "validation_status",
            "validation_status_display",
            "confidence_score",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "validated_by",
            "validated_by_username",
            "validated_at",
            "is_active",
            "is_official",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mapping_source",
            "validation_status",
            "created_by",
            "updated_by",
            "validated_by",
            "validated_at",
            "created_at",
            "updated_at",
            "internal_control_code",
            "internal_control_title",
            "internal_control_domain",
            "mechanism_title",
            "mechanism_description",
            "mechanism_type",
            "implementation_status_display",
            "relationship_type_display",
            "mapping_source_display",
            "validation_status_display",
            "created_by_username",
            "updated_by_username",
            "validated_by_username",
            "is_active",
            "is_official",
        ]

    def validate_contribution_weight(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value

    def validate_confidence_score(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value


class ComplianceGapSerializer(serializers.ModelSerializer):
    control_code = serializers.CharField(source="control.code", read_only=True)
    control_title = serializers.CharField(source="control.title", read_only=True)
    framework_name = serializers.CharField(source="framework.name", read_only=True)
    framework_code = serializers.CharField(source="framework.code", read_only=True)
    framework_version = serializers.CharField(source="framework.version", read_only=True)

    class Meta:
        model = ComplianceGap
        fields = [
            "id", "control", "framework", "control_code", "control_title", "framework_name",
            "framework_code", "framework_version",
            "status", "confidence_score", "evidence_count", "notes", "last_evaluated"
        ]
        read_only_fields = ["last_evaluated", "created_at", "updated_at"]


class AssessmentEvidenceSerializer(serializers.ModelSerializer):
    evidence_type_display = serializers.CharField(source="get_evidence_type_display", read_only=True)

    class Meta:
        model = Evidence
        fields = [
            "id",
            "assessment",
            "evidence_type",
            "evidence_type_display",
            "title",
            "uri",
            "hash_sha256",
            "collected_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "evidence_type_display"]


class AssessmentFindingSerializer(serializers.ModelSerializer):
    severity_display = serializers.CharField(source="get_severity_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Finding
        fields = [
            "id",
            "assessment",
            "severity",
            "severity_display",
            "title",
            "description",
            "reference",
            "opened_at",
            "closed_at",
            "status",
            "status_display",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "severity_display", "status_display"]


class ImprovementActionSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ImprovementAction
        fields = [
            "id",
            "assessment",
            "title",
            "plan",
            "owner",
            "due_date",
            "status",
            "status_display",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "status_display"]


class ControlAssessmentSerializer(serializers.ModelSerializer):
    implementation_status_display = serializers.CharField(source="get_implementation_status_display", read_only=True)
    control_code = serializers.CharField(source="control.code", read_only=True)
    control_title = serializers.CharField(source="control.title", read_only=True)
    control_description = serializers.CharField(source="control.description", read_only=True)
    framework_id = serializers.UUIDField(source="control.framework.id", read_only=True)
    framework_code = serializers.CharField(source="control.framework.code", read_only=True)
    framework_name = serializers.CharField(source="control.framework.name", read_only=True)
    framework_version = serializers.CharField(source="control.framework.version", read_only=True)
    profile_name = serializers.CharField(source="profile.name", read_only=True)
    profile_type = serializers.CharField(source="profile.name", read_only=True)
    evidence_count = serializers.IntegerField(source="evidence.count", read_only=True)
    finding_count = serializers.IntegerField(source="findings.count", read_only=True)
    open_finding_count = serializers.SerializerMethodField()
    action_count = serializers.IntegerField(source="actions.count", read_only=True)
    open_action_count = serializers.SerializerMethodField()
    gap_status = serializers.SerializerMethodField()
    gap_id = serializers.SerializerMethodField()
    evidence = AssessmentEvidenceSerializer(many=True, read_only=True)
    findings = AssessmentFindingSerializer(many=True, read_only=True)
    actions = ImprovementActionSerializer(many=True, read_only=True)

    class Meta:
        model = ControlAssessment
        fields = [
            "id",
            "profile",
            "profile_name",
            "profile_type",
            "control",
            "control_code",
            "control_title",
            "control_description",
            "framework_id",
            "framework_code",
            "framework_name",
            "framework_version",
            "implementation_status",
            "implementation_status_display",
            "maturity_level",
            "effectiveness",
            "risk_inherent",
            "risk_residual",
            "notes",
            "assessed_at",
            "assessed_by",
            "evidence_count",
            "finding_count",
            "open_finding_count",
            "action_count",
            "open_action_count",
            "gap_status",
            "gap_id",
            "evidence",
            "findings",
            "actions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "implementation_status_display",
            "control_code",
            "control_title",
            "control_description",
            "framework_id",
            "framework_code",
            "framework_name",
            "framework_version",
            "profile_name",
            "profile_type",
            "evidence_count",
            "finding_count",
            "open_finding_count",
            "action_count",
            "open_action_count",
            "gap_status",
            "gap_id",
            "evidence",
            "findings",
            "actions",
        ]

    def get_open_finding_count(self, obj):
        return obj.findings.filter(status=Finding.Status.OPEN).count()

    def get_open_action_count(self, obj):
        return obj.actions.exclude(status=ImprovementAction.Status.DONE).count()

    def get_gap_status(self, obj):
        gap = getattr(obj, "_prefetched_gap", None)
        if gap:
            return gap.status
        gap = ComplianceGap.objects.filter(control=obj.control, framework=obj.control.framework).first()
        return gap.status if gap else None

    def get_gap_id(self, obj):
        gap = getattr(obj, "_prefetched_gap", None)
        if gap:
            return str(gap.id)
        gap = ComplianceGap.objects.filter(control=obj.control, framework=obj.control.framework).first()
        return str(gap.id) if gap else None


class OrganizationContextSerializer(CompanyProfileSerializer):
    class Meta(CompanyProfileSerializer.Meta):
        pass


class RegulatoryContextSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegulatoryContext
        fields = "__all__"


class StakeholderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stakeholder
        fields = "__all__"


class PolicyEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PolicyEvidence
        fields = "__all__"


class ImplementationMechanismSerializer(serializers.ModelSerializer):
    evidences = PolicyEvidenceSerializer(many=True, read_only=True)
    evidence_count = serializers.IntegerField(source='evidences.count', read_only=True)
    valid_evidence_count = serializers.SerializerMethodField()

    class Meta:
        model = ImplementationMechanism
        fields = "__all__"

    def get_valid_evidence_count(self, obj):
        return obj.evidences.filter(status='valid').count()


class PolicyControlSerializer(serializers.ModelSerializer):
    control_details = ControlSerializer(source='control', read_only=True)
    mechanisms = ImplementationMechanismSerializer(many=True, read_only=True)
    mechanism_count = serializers.IntegerField(source='mechanisms.count', read_only=True)
    implementation_score = serializers.SerializerMethodField()

    class Meta:
        model = PolicyControl
        fields = "__all__"

    def get_implementation_score(self, obj):
        mechanisms = obj.mechanisms.all()
        if not mechanisms: return 0
        implemented = mechanisms.filter(implementation_status='implemented').count()
        return (implemented / mechanisms.count()) * 100


class PolicyInternalControlSerializer(serializers.ModelSerializer):
    policy_code = serializers.CharField(source="policy.code", read_only=True)
    policy_title = serializers.CharField(source="policy.title", read_only=True)
    internal_control_code = serializers.CharField(source="internal_control.code", read_only=True)
    internal_control_title = serializers.CharField(source="internal_control.title", read_only=True)
    internal_control_domain = serializers.CharField(source="internal_control.control_domain", read_only=True)
    internal_control_status = serializers.CharField(source="internal_control.status", read_only=True)
    applicability_display = serializers.CharField(source="get_applicability_display", read_only=True)
    mapping_source_display = serializers.CharField(source="get_mapping_source_display", read_only=True)
    validation_status_display = serializers.CharField(source="get_validation_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    validated_by_username = serializers.CharField(source="validated_by.username", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_official = serializers.BooleanField(read_only=True)

    class Meta:
        model = PolicyInternalControl
        fields = [
            "id",
            "policy",
            "policy_code",
            "policy_title",
            "internal_control",
            "internal_control_code",
            "internal_control_title",
            "internal_control_domain",
            "internal_control_status",
            "applicability",
            "applicability_display",
            "rationale",
            "mapping_source",
            "mapping_source_display",
            "validation_status",
            "validation_status_display",
            "confidence_score",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "validated_by",
            "validated_by_username",
            "validated_at",
            "is_active",
            "is_official",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mapping_source",
            "validation_status",
            "created_by",
            "updated_by",
            "validated_by",
            "validated_at",
            "created_at",
            "updated_at",
            "policy_code",
            "policy_title",
            "internal_control_code",
            "internal_control_title",
            "internal_control_domain",
            "internal_control_status",
            "applicability_display",
            "mapping_source_display",
            "validation_status_display",
            "created_by_username",
            "updated_by_username",
            "validated_by_username",
            "is_active",
            "is_official",
        ]

    def validate_confidence_score(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value


class GovernanceDocumentSerializer(serializers.ModelSerializer):
    parent_document_title = serializers.CharField(source="parent_document.title", read_only=True)
    legacy_policy_code = serializers.CharField(source="legacy_policy.code", read_only=True)
    legacy_policy_title = serializers.CharField(source="legacy_policy.title", read_only=True)
    legacy_technical_regulation_code = serializers.CharField(source="legacy_technical_regulation.code", read_only=True)
    legacy_technical_regulation_title = serializers.CharField(source="legacy_technical_regulation.title", read_only=True)
    legacy_procedure_code = serializers.CharField(source="legacy_procedure.code", read_only=True)
    legacy_procedure_title = serializers.CharField(source="legacy_procedure.title", read_only=True)
    children_count = serializers.IntegerField(source="children.count", read_only=True)
    sections_count = serializers.IntegerField(source="sections.count", read_only=True)
    controls_count = serializers.IntegerField(source="control_links.count", read_only=True)
    runbook_steps_count = serializers.IntegerField(source="runbook_steps.count", read_only=True)

    class Meta:
        model = GovernanceDocument
        fields = [
            "id",
            "title",
            "document_type",
            "version",
            "status",
            "owner",
            "parent_document",
            "parent_document_title",
            "scope",
            "purpose",
            "content",
            "approval_date",
            "review_date",
            "legacy_policy",
            "legacy_policy_code",
            "legacy_policy_title",
            "legacy_technical_regulation",
            "legacy_technical_regulation_code",
            "legacy_technical_regulation_title",
            "legacy_procedure",
            "legacy_procedure_code",
            "legacy_procedure_title",
            "is_active",
            "children_count",
            "sections_count",
            "controls_count",
            "runbook_steps_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "parent_document_title",
            "legacy_policy_code",
            "legacy_policy_title",
            "legacy_technical_regulation_code",
            "legacy_technical_regulation_title",
            "legacy_procedure_code",
            "legacy_procedure_title",
            "children_count",
            "sections_count",
            "controls_count",
            "runbook_steps_count",
        ]


class GovernanceDocumentControlSerializer(serializers.ModelSerializer):
    document_title = serializers.CharField(source="document.title", read_only=True)
    document_type = serializers.CharField(source="document.document_type", read_only=True)
    internal_control_code = serializers.CharField(source="internal_control.code", read_only=True)
    internal_control_title = serializers.CharField(source="internal_control.title", read_only=True)
    internal_control_domain = serializers.CharField(source="internal_control.control_domain", read_only=True)
    purpose_display = serializers.CharField(source="get_purpose_display", read_only=True)
    mapping_source_display = serializers.CharField(source="get_mapping_source_display", read_only=True)
    validation_status_display = serializers.CharField(source="get_validation_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    validated_by_username = serializers.CharField(source="validated_by.username", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_official = serializers.BooleanField(read_only=True)

    class Meta:
        model = GovernanceDocumentControl
        fields = [
            "id",
            "document",
            "document_title",
            "document_type",
            "internal_control",
            "internal_control_code",
            "internal_control_title",
            "internal_control_domain",
            "purpose",
            "purpose_display",
            "rationale",
            "mapping_source",
            "mapping_source_display",
            "validation_status",
            "validation_status_display",
            "confidence_score",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "validated_by",
            "validated_by_username",
            "validated_at",
            "is_active",
            "is_official",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mapping_source",
            "validation_status",
            "created_by",
            "updated_by",
            "validated_by",
            "validated_at",
            "created_at",
            "updated_at",
            "document_title",
            "document_type",
            "internal_control_code",
            "internal_control_title",
            "internal_control_domain",
            "purpose_display",
            "mapping_source_display",
            "validation_status_display",
            "created_by_username",
            "updated_by_username",
            "validated_by_username",
            "is_active",
            "is_official",
        ]

    def validate_confidence_score(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value


class GovernanceDocumentSectionSerializer(serializers.ModelSerializer):
    document_title = serializers.CharField(source="document.title", read_only=True)
    parent_section_title = serializers.CharField(source="parent_section.title", read_only=True)

    class Meta:
        model = GovernanceDocumentSection
        fields = [
            "id",
            "document",
            "document_title",
            "section_number",
            "title",
            "content",
            "order",
            "parent_section",
            "parent_section_title",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "document_title", "parent_section_title"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        document = attrs.get("document") or getattr(self.instance, "document", None)
        parent = attrs.get("parent_section") or getattr(self.instance, "parent_section", None)
        if document and parent and parent.document_id != document.id:
            raise serializers.ValidationError({"parent_section": "A secção parent tem de pertencer ao mesmo documento."})
        return attrs


class RunbookStepSerializer(serializers.ModelSerializer):
    runbook_title = serializers.CharField(source="runbook.title", read_only=True)

    class Meta:
        model = RunbookStep
        fields = [
            "id",
            "runbook",
            "runbook_title",
            "step_number",
            "title",
            "description",
            "expected_output",
            "evidence_required",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "runbook_title"]

    def validate_runbook(self, value):
        if value.document_type != GovernanceDocument.DocumentType.RUNBOOK:
            raise serializers.ValidationError("RunbookStep só pode ser associado a GovernanceDocument do tipo runbook.")
        return value


class EvidenceItemSerializer(serializers.ModelSerializer):
    legacy_evidence_title = serializers.CharField(source="legacy_evidence.title", read_only=True)
    uploaded_by_username = serializers.SerializerMethodField()
    links_count = serializers.IntegerField(source="links.count", read_only=True)
    active_links_count = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_score_eligible = serializers.BooleanField(read_only=True)

    class Meta:
        model = EvidenceItem
        fields = [
            "id",
            "title",
            "description",
            "evidence_type",
            "source",
            "file",
            "original_filename",
            "file_size",
            "mime_type",
            "sha256_hash",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_at",
            "external_reference",
            "collected_at",
            "valid_until",
            "confidence_level",
            "status",
            "owner",
            "legacy_evidence",
            "legacy_evidence_title",
            "is_active",
            "is_expired",
            "is_score_eligible",
            "links_count",
            "active_links_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "original_filename",
            "file_size",
            "mime_type",
            "sha256_hash",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_at",
            "legacy_evidence_title",
            "is_expired",
            "is_score_eligible",
            "links_count",
            "active_links_count",
        ]

    def validate_confidence_level(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value

    def get_active_links_count(self, obj):
        return obj.links.exclude(
            validation_status__in=[
                EvidenceLink.ValidationStatus.REJECTED,
                EvidenceLink.ValidationStatus.DEPRECATED,
            ]
        ).count()

    def get_uploaded_by_username(self, obj):
        if not obj.uploaded_by_id:
            return ""
        return obj.uploaded_by.get_username()


class EvidenceLinkSerializer(serializers.ModelSerializer):
    evidence_title = serializers.CharField(source="evidence_item.title", read_only=True)
    evidence_type = serializers.CharField(source="evidence_item.evidence_type", read_only=True)
    evidence_status = serializers.CharField(source="evidence_item.status", read_only=True)
    evidence_is_expired = serializers.BooleanField(source="evidence_item.is_expired", read_only=True)
    target_label = serializers.SerializerMethodField()
    link_type_display = serializers.CharField(source="get_link_type_display", read_only=True)
    mapping_source_display = serializers.CharField(source="get_mapping_source_display", read_only=True)
    validation_status_display = serializers.CharField(source="get_validation_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    validated_by_username = serializers.CharField(source="validated_by.username", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_official = serializers.BooleanField(read_only=True)

    class Meta:
        model = EvidenceLink
        fields = [
            "id",
            "evidence_item",
            "evidence_title",
            "evidence_type",
            "evidence_status",
            "evidence_is_expired",
            "target_type",
            "target_id",
            "target_label",
            "link_type",
            "link_type_display",
            "rationale",
            "mapping_source",
            "mapping_source_display",
            "validation_status",
            "validation_status_display",
            "confidence_score",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "validated_by",
            "validated_by_username",
            "validated_at",
            "is_active",
            "is_official",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mapping_source",
            "validation_status",
            "created_by",
            "updated_by",
            "validated_by",
            "validated_at",
            "created_at",
            "updated_at",
            "evidence_title",
            "evidence_type",
            "evidence_status",
            "evidence_is_expired",
            "target_label",
            "link_type_display",
            "mapping_source_display",
            "validation_status_display",
            "created_by_username",
            "updated_by_username",
            "validated_by_username",
            "is_active",
            "is_official",
        ]

    def validate_confidence_score(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        target_type = attrs.get("target_type") or getattr(self.instance, "target_type", None)
        if target_type and target_type not in EvidenceLink.TARGET_MODEL_MAP:
            raise serializers.ValidationError({"target_type": "Tipo de alvo não suportado."})
        return attrs

    def create(self, validated_data):
        target_type = validated_data.get("target_type")
        if target_type:
            validated_data["target_content_type"] = EvidenceLink.content_type_for_target_type(target_type)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        target_type = validated_data.get("target_type")
        if target_type and target_type != instance.target_type:
            validated_data["target_content_type"] = EvidenceLink.content_type_for_target_type(target_type)
        return super().update(instance, validated_data)

    def get_target_label(self, obj):
        target = obj.target
        if not target:
            return ""
        return str(target)


class MechanismEvidenceRequirementSerializer(serializers.ModelSerializer):
    mechanism_type = serializers.CharField(required=False, allow_blank=True)
    control_domain = serializers.CharField(required=False, allow_blank=True)
    keywords = serializers.ListField(
        child=serializers.CharField(allow_blank=False),
        required=False,
        allow_empty=True,
    )
    mechanism_title = serializers.CharField(source="mechanism.title", read_only=True)
    evidence_type_display = serializers.CharField(source="get_evidence_type_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = MechanismEvidenceRequirement
        fields = [
            "id",
            "mechanism",
            "mechanism_title",
            "title",
            "description",
            "evidence_type",
            "evidence_type_display",
            "mechanism_type",
            "keywords",
            "control_domain",
            "priority",
            "priority_display",
            "source",
            "source_display",
            "rationale",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mechanism_title",
            "evidence_type_display",
            "priority_display",
            "source_display",
            "created_at",
            "updated_at",
        ]
        validators = []

    def validate_keywords(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Keywords must be a list.")
        return [str(keyword).strip() for keyword in value if str(keyword).strip()]


class CompliancePropagationResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompliancePropagationResult
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at", "calculated_at"]


class PolicyAssessmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PolicyAssessment
        fields = "__all__"


class PolicySectionSerializer(serializers.ModelSerializer):
    subsections = serializers.SerializerMethodField()

    class Meta:
        model = PolicySection
        fields = ['id', 'policy', 'title', 'content', 'order', 'parent', 'subsections']

    def get_subsections(self, obj):
        # Recursive serialization for subchapters
        subs = obj.subsections.all().order_by('order')
        return PolicySectionSerializer(subs, many=True).data

class PolicySerializer(serializers.ModelSerializer):
    policy_controls = PolicyControlSerializer(many=True, read_only=True)
    sections = serializers.SerializerMethodField()
    control_count = serializers.IntegerField(source='policy_controls.count', read_only=True)
    mechanism_count = serializers.SerializerMethodField()
    compliance_score = serializers.SerializerMethodField()
    latest_assessment = serializers.SerializerMethodField()
    owner_person_name = serializers.CharField(source="owner_person.name", read_only=True)
    owner_org_unit_name = serializers.CharField(source="owner_org_unit.name", read_only=True)
    accountable_person_name = serializers.CharField(source="accountable_person.name", read_only=True)
    owner_display = serializers.SerializerMethodField()

    class Meta:
        model = Policy
        fields = "__all__"

    def get_sections(self, obj):
        # Get only top-level sections
        top_sections = obj.sections.filter(parent__isnull=True).order_by('order')
        return PolicySectionSerializer(top_sections, many=True).data


    def get_mechanism_count(self, obj):
        return ImplementationMechanism.objects.filter(policy_control__policy=obj).count()

    def get_compliance_score(self, obj):
        mechanisms = ImplementationMechanism.objects.filter(policy_control__policy=obj)
        if not mechanisms: return 0
        valid_implemented = mechanisms.filter(
            implementation_status='implemented',
            evidences__status='valid'
        ).distinct().count()
        return (valid_implemented / mechanisms.count()) * 100

    def get_latest_assessment(self, obj):
        assessment = obj.assessments.order_by('-last_assessed_at').first()
        if assessment:
            return PolicyAssessmentSerializer(assessment).data
        return None

    def get_owner_display(self, obj):
        if obj.owner_person:
            return obj.owner_person.name
        if obj.owner_org_unit:
            return obj.owner_org_unit.name
        return obj.owner or ""


class TechnicalRegulationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TechnicalRegulation
        fields = "__all__"


class ProcedureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Procedure
        fields = "__all__"


class DecisionRecordSerializer(serializers.ModelSerializer):
    decision_display = serializers.CharField(source="get_decision_display", read_only=True)
    decision_type_display = serializers.CharField(source="get_decision_type_display", read_only=True)

    class Meta:
        model = DecisionRecord
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at", "decision_display", "decision_type_display"]


class GovernanceExceptionSerializer(serializers.ModelSerializer):
    exception_type_display = serializers.CharField(source="get_exception_type_display", read_only=True)
    target_type_display = serializers.CharField(source="get_target_type_display", read_only=True)
    approval_status_display = serializers.CharField(source="get_approval_status_display", read_only=True)
    target_label = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_currently_active = serializers.BooleanField(read_only=True)

    TARGET_MODELS = {
        GovernanceException.TargetType.POLICY: ("governance", "Policy"),
        GovernanceException.TargetType.INTERNAL_CONTROL: ("governance", "InternalControl"),
        GovernanceException.TargetType.FRAMEWORK_CONTROL: ("governance", "Control"),
        GovernanceException.TargetType.MECHANISM: ("governance", "Mechanism"),
        GovernanceException.TargetType.INTERNAL_CONTROL_MECHANISM: ("governance", "InternalControlMechanism"),
        GovernanceException.TargetType.GOVERNANCE_DOCUMENT: ("governance", "GovernanceDocument"),
        GovernanceException.TargetType.RISK: ("risk", "Risk"),
        GovernanceException.TargetType.ASSET: ("risk", "Asset"),
        GovernanceException.TargetType.VULNERABILITY: ("risk", "Vulnerability"),
    }

    class Meta:
        model = GovernanceException
        fields = "__all__"
        read_only_fields = [
            "created_at",
            "updated_at",
            "approved_at",
            "approved_by",
            "exception_type_display",
            "target_type_display",
            "approval_status_display",
            "target_label",
            "is_expired",
            "is_currently_active",
        ]

    def validate(self, attrs):
        valid_from = attrs.get("valid_from", getattr(self.instance, "valid_from", None))
        valid_until = attrs.get("valid_until", getattr(self.instance, "valid_until", None))
        if valid_from and valid_until and valid_until < valid_from:
            raise serializers.ValidationError({"valid_until": "A data de fim deve ser posterior ao inicio."})
        score_impact = attrs.get("score_impact", getattr(self.instance, "score_impact", 0))
        if score_impact is not None and (score_impact < -100 or score_impact > 100):
            raise serializers.ValidationError({"score_impact": "O impacto no score deve estar entre -100 e 100."})
        return attrs

    def get_target_label(self, obj):
        model_ref = self.TARGET_MODELS.get(obj.target_type)
        if not model_ref:
            return obj.target_id
        try:
            model = apps.get_model(*model_ref)
            target = model.objects.filter(id=obj.target_id).first()
        except Exception:
            target = None
        if not target:
            return obj.target_id
        code = getattr(target, "code", "")
        title = getattr(target, "title", "") or getattr(target, "name", "")
        if code and title:
            return f"{code} - {title}"
        return title or code or str(target)


class GovernanceActionSerializer(serializers.ModelSerializer):
    action_type_display = serializers.CharField(source="get_action_type_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    source_type_display = serializers.CharField(source="get_source_type_display", read_only=True)
    target_label = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    TARGET_MODELS = {
        "policy": ("governance", "Policy"),
        "internal_control": ("governance", "InternalControl"),
        "framework_control": ("governance", "Control"),
        "mechanism": ("governance", "Mechanism"),
        "internal_control_mechanism": ("governance", "InternalControlMechanism"),
        "governance_document": ("governance", "GovernanceDocument"),
        "evidence_item": ("governance", "EvidenceItem"),
        "risk": ("risk", "Risk"),
        "asset": ("risk", "Asset"),
        "vulnerability": ("risk", "Vulnerability"),
    }

    class Meta:
        model = GovernanceAction
        fields = "__all__"
        read_only_fields = [
            "created_at",
            "updated_at",
            "completed_at",
            "completed_by",
            "action_type_display",
            "priority_display",
            "status_display",
            "source_type_display",
            "target_label",
            "is_overdue",
        ]

    def validate(self, attrs):
        score_impact = attrs.get("score_impact", getattr(self.instance, "score_impact", 0))
        if score_impact is not None and (score_impact < -100 or score_impact > 100):
            raise serializers.ValidationError({"score_impact": "O impacto no score deve estar entre -100 e 100."})
        return attrs

    def get_target_label(self, obj):
        model_ref = self.TARGET_MODELS.get(obj.target_type)
        if not model_ref or not obj.target_id:
            return obj.target_id or ""
        try:
            model = apps.get_model(*model_ref)
            target = model.objects.filter(id=obj.target_id).first()
        except Exception:
            target = None
        if not target:
            return obj.target_id
        code = getattr(target, "code", "")
        title = getattr(target, "title", "") or getattr(target, "name", "")
        if code and title:
            return f"{code} - {title}"
        return title or code or str(target)


class GovernanceRiskLinkSerializer(serializers.ModelSerializer):
    source_label = serializers.SerializerMethodField()
    target_label = serializers.SerializerMethodField()
    relationship_type_display = serializers.CharField(source="get_relationship_type_display", read_only=True)
    mapping_source_display = serializers.CharField(source="get_mapping_source_display", read_only=True)
    validation_status_display = serializers.CharField(source="get_validation_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    validated_by_username = serializers.CharField(source="validated_by.username", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_official = serializers.BooleanField(read_only=True)

    SOURCE_MODELS = {
        GovernanceRiskLink.SourceType.INTERNAL_CONTROL: ("governance", "InternalControl"),
        GovernanceRiskLink.SourceType.MECHANISM: ("governance", "Mechanism"),
        GovernanceRiskLink.SourceType.INTERNAL_CONTROL_MECHANISM: ("governance", "InternalControlMechanism"),
        GovernanceRiskLink.SourceType.POLICY: ("governance", "Policy"),
        GovernanceRiskLink.SourceType.GOVERNANCE_DOCUMENT: ("governance", "GovernanceDocument"),
    }
    TARGET_MODELS = {
        GovernanceRiskLink.TargetType.RISK: ("risk", "Risk"),
        GovernanceRiskLink.TargetType.ASSET: ("risk", "Asset"),
        GovernanceRiskLink.TargetType.VULNERABILITY: ("risk", "Vulnerability"),
        GovernanceRiskLink.TargetType.ASSET_VULNERABILITY: ("risk", "AssetVulnerability"),
    }

    class Meta:
        model = GovernanceRiskLink
        fields = [
            "id",
            "source_type",
            "source_id",
            "source_label",
            "target_type",
            "target_id",
            "target_label",
            "relationship_type",
            "relationship_type_display",
            "effectiveness_percentage",
            "residual_impact_percentage",
            "rationale",
            "mapping_source",
            "mapping_source_display",
            "validation_status",
            "validation_status_display",
            "confidence_score",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "validated_by",
            "validated_by_username",
            "validated_at",
            "is_active",
            "is_official",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mapping_source",
            "validation_status",
            "created_by",
            "updated_by",
            "validated_by",
            "validated_at",
            "created_at",
            "updated_at",
            "source_label",
            "target_label",
            "relationship_type_display",
            "mapping_source_display",
            "validation_status_display",
            "created_by_username",
            "updated_by_username",
            "validated_by_username",
            "is_active",
            "is_official",
        ]

    def validate_effectiveness_percentage(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value

    def validate_residual_impact_percentage(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value

    def validate_confidence_score(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("O valor deve estar entre 0 e 100.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        source_type = attrs.get("source_type") or getattr(self.instance, "source_type", None)
        source_id = attrs.get("source_id") or getattr(self.instance, "source_id", None)
        target_type = attrs.get("target_type") or getattr(self.instance, "target_type", None)
        target_id = attrs.get("target_id") or getattr(self.instance, "target_id", None)

        if source_type and source_type not in self.SOURCE_MODELS:
            raise serializers.ValidationError({"source_type": "Tipo de origem nao suportado."})
        if target_type and target_type not in self.TARGET_MODELS:
            raise serializers.ValidationError({"target_type": "Tipo de alvo nao suportado."})
        if source_type and source_id and not self._resolve(self.SOURCE_MODELS[source_type], source_id):
            raise serializers.ValidationError({"source_id": "A entidade de origem nao existe."})
        if target_type and target_id and not self._resolve(self.TARGET_MODELS[target_type], target_id):
            raise serializers.ValidationError({"target_id": "A entidade de risco indicada nao existe."})
        return attrs

    def get_source_label(self, obj):
        return self._label(self.SOURCE_MODELS.get(obj.source_type), obj.source_id)

    def get_target_label(self, obj):
        return self._label(self.TARGET_MODELS.get(obj.target_type), obj.target_id)

    def _resolve(self, model_ref, object_id):
        try:
            model = apps.get_model(*model_ref)
            return model.objects.filter(id=object_id).first()
        except Exception:
            return None

    def _label(self, model_ref, object_id):
        if not model_ref or not object_id:
            return object_id or ""
        target = self._resolve(model_ref, object_id)
        if not target:
            return object_id
        if model_ref == ("risk", "Risk"):
            asset_name = getattr(getattr(target, "asset", None), "name", "")
            vulnerability = getattr(target, "vulnerability", None)
            vulnerability_label = getattr(vulnerability, "cve_id", "") if vulnerability else "Risco de ativo"
            return f"{asset_name} - {vulnerability_label}".strip(" -")
        if model_ref == ("risk", "AssetVulnerability"):
            asset_name = getattr(getattr(target, "asset", None), "name", "")
            vulnerability_label = getattr(getattr(target, "vulnerability", None), "cve_id", "")
            return f"{vulnerability_label} on {asset_name}".strip()
        code = getattr(target, "code", "")
        title = getattr(target, "title", "") or getattr(target, "name", "") or getattr(target, "cve_id", "")
        if code and title:
            return f"{code} - {title}"
        return title or code or f"{target.__class__.__name__} {target.pk}"

