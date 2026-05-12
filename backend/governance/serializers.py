from rest_framework import serializers
from .models import (
    Framework, Control, ControlMapping, Mechanism, ControlMechanism, MechanismEvidence,
    Policy, PolicyControl, ImplementationMechanism, PolicyEvidence, PolicyAssessment, PolicySection,
    ComplianceGap, RegulatoryContext, Stakeholder, TechnicalRegulation, Procedure, DecisionRecord, Tag,
    ControlAssessment, Evidence, Finding, ImprovementAction
)
from company.serializers import CompanyProfileSerializer


class FrameworkSerializer(serializers.ModelSerializer):
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
    mechanisms_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Control
        fields = [
            "id",
            "code",
            "title",
            "description",
            "is_mandatory",
            "status",
            "framework",
            "framework_name",
            "mechanisms_count",
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

