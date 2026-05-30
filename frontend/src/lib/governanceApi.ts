import { request } from "./api";

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export type ApiRecord = Record<string, unknown>;
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export type LegacyApiRecord = ApiRecord & {
    id: string;
    code?: string;
    title?: string;
    name?: string;
    description?: string;
    status?: string;
    owner?: string;
    framework?: string;
    framework_name?: string;
    control_details?: LegacyApiRecord;
    mechanisms?: LegacyApiRecord[];
    results?: LegacyApiRecord[];
};

export type RelatedFrameworkReference = string | number | { id?: string | number };

export type OrganizationContextRecord = ApiRecord & {
    id?: string;
    name?: string;
    description?: string;
};

export type PolicyRecord = LegacyApiRecord & {
    version?: string;
    scope?: string;
    purpose?: string;
    objective?: string;
    description?: string;
    owner?: string;
    owner_person?: string;
    owner_org_unit?: string;
    accountable_person?: string;
    approval_date?: string | null;
    review_date?: string | null;
    next_review_date?: string | null;
    next_review_at?: string | null;
    related_frameworks?: RelatedFrameworkReference[];
};

export type FrameworkRecord = LegacyApiRecord & {
    version?: string;
    framework_type?: string;
    publisher?: string;
    source_uri?: string;
    is_active?: boolean;
    controls_count?: number;
    sections_count?: number;
};

export type FrameworkSectionRecord = ApiRecord & {
    id: string;
    code?: string;
    name?: string;
    level?: number;
    parent?: string | null;
    sort_order?: number;
};

export type FrameworkControlRecord = LegacyApiRecord & {
    framework?: string;
    framework_code?: string;
    section?: string;
    section_code?: string;
    section_name?: string;
    framework_version?: string;
    implementation_guidance?: string;
    applicability_scope?: string;
    is_mandatory?: boolean;
    mechanisms_count?: number;
    internal_mappings_count?: number;
    approved_internal_mappings_count?: number;
};

export type MechanismRecord = LegacyApiRecord & {
    mechanism_type?: string;
};

export type PolicyControlRecord = LegacyApiRecord & {
    policy?: string;
    control?: string;
    rationale?: string;
    applicability?: string;
    priority?: string;
};

export type DecisionScoreSnapshot = ApiRecord & {
    global_score?: string | number | null;
    score?: string | number | null;
    recommended_action?: string | null;
    recommendedAction?: string | null;
};

export type ResidualRiskUsedLink = {
    id: string | number;
    source_type: string;
    source_id: string;
    source?: { label?: string | null } | null;
    relationship_type: string;
    validation_status: string;
    effective_reduction_percentage?: string | number | null;
    implementation_factor?: string | number | null;
    effectiveness_percentage?: string | number | null;
    residual_impact_percentage?: string | number | null;
    rationale?: string | null;
};

function toSearchParams(params: QueryParams): URLSearchParams {
    return new URLSearchParams(
        Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
            if (value === undefined || value === null || value === "") return acc;
            acc[key] = String(value);
            return acc;
        }, {})
    );
}

export type ComplianceSummary = {
    framework: string;
    total: number;
    missing: number;
    partial: number;
    implemented: number;
    score: number;
};

export type ComplianceGapRecord = {
    id: string;
    control: string;
    framework: string;
    control_code: string;
    control_title: string;
    framework_name: string;
    framework_code: string;
    framework_version: string;
    status: "MISSING" | "PARTIAL" | "IMPLEMENTED";
    evidence_count: number;
    confidence_score: number;
    notes: string;
    last_evaluated: string;
};

export type ComplianceAnalysisResult = {
    detail: string;
    results: {
        total_frameworks: number;
        total_controls: number;
        missing: number;
        partial: number;
        implemented: number;
    };
};

export type FrameworkScore = {
    framework_id: string;
    framework_name: string;
    framework_code: string;
    version?: string | null;
    total_controls: number;
    evaluated_controls: number;
    missing: number;
    partial: number;
    implemented: number;
    score: number;
    mapped_controls: number;
    mapping_coverage: number;
    evidence_count: number;
    has_controls?: boolean;
    score_status?: "measured" | "not_configured";
};

export type ControlAssessmentStatus = "not_started" | "planned" | "partial" | "implemented" | "optimized";

export type AssessmentEvidence = {
    id: string;
    assessment: string;
    evidence_type: "policy" | "procedure" | "log" | "screenshot" | "ticket" | "config";
    evidence_type_display?: string;
    title: string;
    uri: string;
    hash_sha256: string;
    collected_at: string | null;
};

export type AssessmentFinding = {
    id: string;
    assessment: string;
    severity: "low" | "medium" | "high" | "critical";
    severity_display?: string;
    title: string;
    description: string;
    reference: string;
    opened_at: string | null;
    closed_at: string | null;
    status: "open" | "mitigated" | "accepted" | "closed";
    status_display?: string;
};

export type ImprovementActionRecord = {
    id: string;
    assessment: string;
    title: string;
    plan: string;
    owner: string;
    due_date: string | null;
    status: "open" | "in_progress" | "done" | "blocked";
    status_display?: string;
};

export type ControlAssessmentRecord = {
    id: string;
    profile: string;
    profile_name: string;
    profile_type: string;
    control: string;
    control_code: string;
    control_title: string;
    control_description: string;
    framework_id: string;
    framework_code: string;
    framework_name: string;
    framework_version: string;
    implementation_status: ControlAssessmentStatus;
    implementation_status_display?: string;
    maturity_level: number;
    effectiveness: string | number;
    risk_inherent: string | number;
    risk_residual: string | number;
    notes: string;
    assessed_at: string | null;
    assessed_by: string;
    evidence_count: number;
    finding_count: number;
    open_finding_count: number;
    action_count: number;
    open_action_count: number;
    gap_status: "MISSING" | "PARTIAL" | "IMPLEMENTED" | null;
    gap_id: string | null;
    evidence: AssessmentEvidence[];
    findings: AssessmentFinding[];
    actions: ImprovementActionRecord[];
    created_at: string;
    updated_at: string;
};

export type AssessmentSummary = {
    total: number;
    implemented: number;
    partial: number;
    planned: number;
    not_started: number;
    with_evidence: number;
    with_open_findings: number;
    actions_open: number;
    score: number;
};

export type AssessmentRecommendation = {
    assessment_id: string;
    control: {
        id: string;
        code: string;
        title: string;
        framework: string;
    };
    current_status: ControlAssessmentStatus;
    current_status_label: string;
    suggested_status: ControlAssessmentStatus;
    suggested_status_label: string;
    confidence: number;
    executive_summary: string;
    rationale: string[];
    missing_evidence: string[];
    next_actions: string[];
    source_metrics: {
        formal_evidence: number;
        mechanism_evidence: number;
        policy_evidence: number;
        valid_policy_evidence: number;
        total_evidence: number;
        open_findings: number;
        open_actions: number;
        linked_mechanisms: number;
        implemented_mechanisms: number;
        in_progress_mechanisms: number;
        gap_status: "MISSING" | "PARTIAL" | "IMPLEMENTED" | null;
        gap_confidence: number | null;
    };
    traceability: Array<{
        label: string;
        value: number | null;
    }>;
};

export type AssessmentBootstrapResult = {
    detail: string;
    framework: string;
    profile: string;
    created: number;
    existing: number;
    total_controls: number;
};

export type ControlMappingSummary = {
    total_mappings: number;
    equivalent: number;
    partial: number;
    supports: number;
    conflicts: number;
    mapped_controls: number;
    frameworks: number;
};

export type ControlMappingOverview = {
    framework_scores: FrameworkScore[];
    mapping_summary: ControlMappingSummary;
};

export type ControlMappingRecord = {
    id: string;
    source_control: string;
    source_control_code: string;
    source_control_title: string;
    source_framework: string;
    source_framework_name: string;
    source_framework_code: string;
    target_control: string;
    target_control_code: string;
    target_control_title: string;
    target_framework: string;
    target_framework_name: string;
    target_framework_code: string;
    mapping_type: "equivalent" | "partial" | "supports" | "conflicts";
    mapping_type_display?: string;
    confidence: number | string;
    rationale: string;
    created_at: string;
    updated_at: string;
};

export type ControlMappingRebuildResult = {
    detail: string;
    results: {
        deleted_auto_mappings: number;
        created_mappings: number;
        skipped_existing_mappings: number;
        candidate_mappings: number;
        min_shared_mechanisms: number;
    };
};

export type DecisionValue =
    | "accepted"
    | "rejected"
    | "deferred"
    | "mitigate"
    | "transferred"
    | "converted_to_action";

export type DecisionRecord = {
    id: string;
    decision_type: "risk" | "vulnerability" | "compliance_gap" | "assistant_recommendation";
    target_type: string;
    target_id: string;
    title: string;
    recommendation: string;
    rationale: string;
    source_snapshot: ApiRecord[];
    score_snapshot: DecisionScoreSnapshot;
    decision: DecisionValue;
    decision_display?: string;
    decision_type_display?: string;
    justification: string;
    responsible: string;
    due_date: string | null;
    risk_impact: string;
    compliance_impact: string;
    evidence_reference: string;
    action_reference: string;
    decided_by: string;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
};

export type GovernanceExceptionStatus =
    | "draft"
    | "pending_review"
    | "approved"
    | "rejected"
    | "expired"
    | "revoked";

export type GovernanceExceptionType =
    | "policy_exception"
    | "control_exception"
    | "risk_acceptance"
    | "implementation_delay"
    | "compensating_control";

export type GovernanceExceptionTargetType =
    | "policy"
    | "internal_control"
    | "framework_control"
    | "mechanism"
    | "internal_control_mechanism"
    | "governance_document"
    | "risk"
    | "asset"
    | "vulnerability";

export type GovernanceException = {
    id: string;
    exception_type: GovernanceExceptionType;
    exception_type_display?: string;
    target_type: GovernanceExceptionTargetType;
    target_type_display?: string;
    target_id: string;
    target_label?: string;
    title: string;
    description: string;
    business_justification: string;
    compensating_control_description: string;
    risk_impact: string;
    compliance_impact: string;
    score_impact: string | number;
    valid_from: string | null;
    valid_until: string | null;
    owner: string;
    approver: string;
    approval_status: GovernanceExceptionStatus;
    approval_status_display?: string;
    review_note: string;
    evidence_reference: string;
    action_reference: string;
    linked_decision: string | null;
    approved_by: string | null;
    approved_at: string | null;
    is_expired: boolean;
    is_currently_active: boolean;
    created_at: string;
    updated_at: string;
};

export type GovernanceRiskLinkSourceType =
    | "internal_control"
    | "mechanism"
    | "internal_control_mechanism"
    | "policy"
    | "governance_document";

export type GovernanceRiskLinkTargetType =
    | "risk"
    | "asset"
    | "vulnerability"
    | "asset_vulnerability";

export type GovernanceRiskLinkStatus = "draft" | "pending_review" | "approved" | "rejected" | "deprecated";
export type GovernanceRiskCalculationMode = "official" | "simulation" | "exploratory";

export type GovernanceRiskLink = {
    id: string;
    source_type: GovernanceRiskLinkSourceType;
    source_id: string;
    source_label?: string;
    target_type: GovernanceRiskLinkTargetType;
    target_id: string;
    target_label?: string;
    relationship_type:
        | "mitigates"
        | "reduces_likelihood"
        | "reduces_impact"
        | "detects"
        | "prevents"
        | "compensates"
        | "monitors";
    relationship_type_display?: string;
    effectiveness_percentage: string | number;
    residual_impact_percentage: string | number;
    rationale: string;
    mapping_source: "manual" | "migrated" | "imported" | "ai_suggested" | "rule_based" | "template";
    validation_status: GovernanceRiskLinkStatus;
    validation_status_display?: string;
    confidence_score: string | number;
    validated_at: string | null;
    is_active: boolean;
    is_official: boolean;
    created_at: string;
    updated_at: string;
};

export type ResidualRiskImpact = {
    found: boolean;
    mode: GovernanceRiskCalculationMode;
    risk?: { id: string; code: string; title: string; label: string };
    asset?: { id: string; code: string; title: string; label: string } | null;
    vulnerability?: { id: string; code: string; title: string; label: string } | null;
    base_score: number;
    governance_reduction_percentage: number;
    adjusted_residual_score: number;
    adjusted_level: string;
    links_used: ResidualRiskUsedLink[];
    inactive_links: ResidualRiskUsedLink[];
    generated_at: string;
};

export type GovernanceActionType =
    | "correct_policy"
    | "map_control"
    | "implement_mechanism"
    | "collect_evidence"
    | "review_document"
    | "approve_mapping"
    | "update_framework"
    | "review_exception"
    | "review_score"
    | "other";

export type GovernanceActionPriority = "low" | "medium" | "high" | "critical";
export type GovernanceActionStatus = "open" | "in_progress" | "blocked" | "done" | "deferred" | "cancelled";
export type GovernanceActionSourceType = "manual" | "onboarding" | "workbench" | "compliance_gap" | "ai_recommendation" | "score" | "exception";

export type GovernanceAction = {
    id: string;
    action_type: GovernanceActionType;
    action_type_display?: string;
    title: string;
    description: string;
    recommendation: string;
    target_type: string;
    target_id: string;
    target_label?: string;
    source_type: GovernanceActionSourceType;
    source_type_display?: string;
    source_key: string;
    owner: string;
    priority: GovernanceActionPriority;
    priority_display?: string;
    status: GovernanceActionStatus;
    status_display?: string;
    due_date: string | null;
    estimated_effort_hours?: string | number | null;
    required_roles?: string;
    required_materials?: string;
    evidence_required?: boolean;
    expected_evidence?: string;
    ai_generated?: boolean;
    ai_rationale?: string;
    dependency_notes?: string;
    score_impact: string | number;
    notes: string;
    linked_decision: string | null;
    linked_exception: string | null;
    completed_at: string | null;
    completed_by: string | null;
    is_overdue: boolean;
    created_at: string;
    updated_at: string;
};

export type GovernanceActionGenerationResult = {
    created: number;
    updated: number;
    skipped: number;
    total: number;
    actions: GovernanceAction[];
};

export type MechanismImplementationReadiness = {
    mechanism: string;
    generated_at?: string;
    recommendation_source?: string;
    requires_human_validation?: boolean;
    readiness_status: string;
    recommended_status: string | null;
    recommended_status_label: string;
    can_apply: boolean;
    tasks: {
        total: number;
        done: number;
        open: number;
        in_progress: number;
        blocked?: number;
        deferred?: number;
        progress_percentage?: number;
        all_done: boolean;
        items?: Array<{
            id: string;
            title: string;
            status: GovernanceActionStatus;
            priority: GovernanceActionPriority;
            due_date: string | null;
            evidence_required: boolean;
        }>;
    };
    evidence: {
        valid_approved: number;
        has_valid_approved: boolean;
        items: Array<{
            id: string;
            title: string;
            evidence_type: string;
            valid_until: string | null;
            confidence_level: number;
        }>;
    };
    internal_control_mechanisms: Array<{
        id: string;
        internal_control: string;
        internal_control_code: string;
        internal_control_title: string;
        current_status: string;
        current_status_label: string;
        will_change: boolean;
    }>;
    applicable_count: number;
    reasons: string[];
    blockers: string[];
};

export type GovernanceHealthSeverity = "critical" | "high" | "medium" | "low" | "info";

export type GovernanceHealthSection = {
    id: string;
    title: string;
    description: string;
    count: number;
    href: string;
    action_label: string;
    severity: GovernanceHealthSeverity;
};

export type GovernanceHealthListItem = {
    id: string;
    code?: string;
    title: string;
    owner?: string;
    status?: string;
    priority?: string;
    due_date?: string | null;
    valid_until?: string | null;
    evidence_type?: string;
    mechanism_type?: string;
    expected_evidence_count?: number;
    target_type?: string;
    target_id?: string;
    href: string;
};

export type GovernanceHealthMappingRow = {
    key: string;
    label: string;
    pending_review: number;
    draft: number;
    approved: number;
    rejected: number;
    deprecated: number;
    href: string;
};

export type GovernanceHealthRagRow = {
    source_type: string;
    label: string;
    expected_count: number;
    chunk_count: number;
    missing_count: number;
    chunks_without_embedding: number;
    missing_examples: string[];
    href: string;
};

export type GovernanceHealthPayload = {
    generated_at: string;
    metrics: {
        policies_without_controls: number;
        mechanisms_without_valid_evidence: number;
        overdue_tasks: number;
        expired_evidence: number;
        pending_mappings: number;
        draft_mappings: number;
        rag_missing_chunks: number;
        rag_chunks_without_embedding: number;
        total_attention: number;
    };
    sections: GovernanceHealthSection[];
    lists: {
        policies_without_controls: GovernanceHealthListItem[];
        mechanisms_without_valid_evidence: GovernanceHealthListItem[];
        overdue_tasks: GovernanceHealthListItem[];
        expired_evidence: GovernanceHealthListItem[];
    };
    pending_mappings: GovernanceHealthMappingRow[];
    rag_health: GovernanceHealthRagRow[];
    recommendations: string[];
};

export type GovernanceEvaluationOverview = {
    generated_at: string;
    assistant: ApiRecord;
    rag: ApiRecord;
    frameworks: {
        total_frameworks: number;
        average_score: number;
        average_coverage: number;
        items: ApiRecord[];
    };
    policies: {
        total_policies: number;
        average_score: number;
        items: ApiRecord[];
    };
    traceability: ApiRecord;
    mappings: Record<string, number>;
    gaps: ApiRecord;
};

export type ComplianceDriftEvent = {
    type: string;
    severity: "critical" | "high" | "medium" | "low" | string;
    impact_score?: number;
    recommendation?: string;
    [key: string]: unknown;
};

export type ComplianceDriftOverview = {
    generated_at: string;
    baseline: {
        captured_at: string | null;
        snapshots: number;
        source: string;
    };
    metrics: {
        total_events: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
        control_regressions: number;
        asset_exposure_regressions: number;
        new_vulnerabilities: number;
        framework_mapping_gaps: number;
    };
    summary: string;
    control_regressions: ComplianceDriftEvent[];
    asset_exposure_regressions: ComplianceDriftEvent[];
    new_vulnerabilities: ComplianceDriftEvent[];
    framework_mapping_gaps: ComplianceDriftEvent[];
    recommendations: string[];
};

export type ComplianceDriftSnapshotResult = {
    created: number;
    captured_at: string;
    snapshot_label: string;
    snapshot_type: string;
};

export type ComplianceDriftDemoResult = {
    created: boolean;
    message: string;
    assessment_id?: string;
    control_id?: string;
    control_code?: string;
    control_title?: string;
    framework?: {
        id: string;
        code: string;
        name: string;
        version?: string;
    };
    snapshot_id?: string;
};

export interface RegulatoryContextRecord {
    id?: string;
    organization?: string;
    nis2_classification: "Essential" | "Important" | "Out of Scope" | "Pending";
    classification_criteria?: string | null;
    applicable_obligations?: string | null;
    competent_authority?: string | null;
    last_reviewed_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface TechnicalRegulation {
    id: string;
    policy: string;
    code: string;
    title: string;
    description?: string;
    status: "draft" | "active" | "review" | "obsolete";
    version: string;
    technical_owner?: string;
    approved_at?: string;
    next_review_at?: string;
    technical_objective?: string;
    covered_systems?: string;
    technical_requirements?: string;
    created_at: string;
    updated_at: string;
}

export interface Procedure {
    id: string;
    policy?: string;
    technical_regulation?: string;
    code: string;
    title: string;
    description?: string;
    status: "draft" | "active" | "review" | "obsolete";
    version: string;
    owner?: string;
    periodicity?: string;
    next_review_at?: string;
    steps?: string;
    expected_evidence?: string;
    created_at: string;
    updated_at: string;
}

export interface Stakeholder {
    id: string;
    organization?: string;
    name: string;
    stakeholder_type: "Internal" | "External" | "Regulator" | "Supplier" | "Partner";
    responsibility?: string | null;
    contact?: string | null;
    security_relevance?: string | null;
    critical_process_relation?: string | null;
    created_at?: string;
    updated_at?: string;
}

export const governanceApi = {
    // Organization Context
    getOrganizationContext: () => request<LegacyApiRecord>("/api/governance/organization-context/current/"),
    updateOrganizationContext: (id: string, payload: ApiRecord) => request<LegacyApiRecord>(`/api/governance/organization-context/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload)
    }),

    // Regulatory Context
    getRegulatoryContext: () => request<RegulatoryContextRecord>("/api/governance/regulatory-context/current/"),
    updateRegulatoryContext: (id: string, payload: Partial<RegulatoryContextRecord>) => request<RegulatoryContextRecord>(`/api/governance/regulatory-context/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload)
    }),

    // Policies
    listPolicies: (params?: QueryParams) => {
        let url = "/api/governance/policies/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<PolicyRecord>>(url);
    },
    getPolicy: (id: string) => request<PolicyRecord>(`/api/governance/policies/${id}/`),
    createPolicy: (data: ApiRecord) => request<PolicyRecord>("/api/governance/policies/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicy: (id: string, data: ApiRecord) => request<PolicyRecord>(`/api/governance/policies/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicy: (id: string) => request<LegacyApiRecord>(`/api/governance/policies/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Controls
    listPolicyControls: (params?: QueryParams) => {
        let url = "/api/governance/policy-controls/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<LegacyApiRecord>>(url);
    },
    createPolicyControl: (data: ApiRecord) => request<PolicyControlRecord>("/api/governance/policy-controls/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicyControl: (id: string, data: ApiRecord) => request<PolicyControlRecord>(`/api/governance/policy-controls/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicyControl: (id: string) => request<LegacyApiRecord>(`/api/governance/policy-controls/${id}/`, {
        method: 'DELETE'
    }),
    getAIRecommendations: (policyId: string) => request<LegacyApiRecord>(`/api/governance/policies/${policyId}/recommend_controls/`),

    // Implementation Mechanisms
    listPolicyMechanisms: (params?: QueryParams) => {
        let url = "/api/governance/policy-mechanisms/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<LegacyApiRecord>>(url);
    },
    createPolicyMechanism: (data: ApiRecord) => request<LegacyApiRecord>("/api/governance/policy-mechanisms/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicyMechanism: (id: string, data: ApiRecord) => request<LegacyApiRecord>(`/api/governance/policy-mechanisms/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicyMechanism: (id: string) => request<LegacyApiRecord>(`/api/governance/policy-mechanisms/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Evidences
    listPolicyEvidences: (params?: QueryParams) => {
        let url = "/api/governance/policy-evidences/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<LegacyApiRecord>>(url);
    },
    createPolicyEvidence: (data: ApiRecord) => request<LegacyApiRecord>("/api/governance/policy-evidences/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicyEvidence: (id: string, data: ApiRecord) => request<LegacyApiRecord>(`/api/governance/policy-evidences/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicyEvidence: (id: string) => request<LegacyApiRecord>(`/api/governance/policy-evidences/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Assessments
    listPolicyAssessments: (params?: QueryParams) => {
        let url = "/api/governance/policy-assessments/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<LegacyApiRecord>>(url);
    },
    createPolicyAssessment: (data: ApiRecord) => request<LegacyApiRecord>("/api/governance/policy-assessments/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    deletePolicyAssessment: (id: string) => request<LegacyApiRecord>(`/api/governance/policy-assessments/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Sections
    listPolicySections: (params?: QueryParams) => {
        let url = "/api/governance/policy-sections/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<LegacyApiRecord>(url);
    },
    createPolicySection: (data: ApiRecord) => request<LegacyApiRecord>("/api/governance/policy-sections/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicySection: (id: string, data: ApiRecord) => request<LegacyApiRecord>(`/api/governance/policy-sections/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicySection: (id: string) => request<LegacyApiRecord>(`/api/governance/policy-sections/${id}/`, {
        method: 'DELETE'
    }),

    // Compliance Gaps
    getComplianceSummary: (params?: QueryParams) => {
        let url = "/api/governance/gaps/summary/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<ComplianceSummary>(url);
    },
    listComplianceGaps: (params?: QueryParams) => {
        let url = "/api/governance/gaps/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<ComplianceGapRecord> | ComplianceGapRecord[]>(url);
    },
    analyzeComplianceGaps: () => request<ComplianceAnalysisResult>("/api/governance/gaps/analyze/", {
        method: "POST",
        body: JSON.stringify({})
    }),

    // Control assessments / human validation
    listControlAssessments: (params?: QueryParams) => {
        let url = "/api/governance/control-assessments/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<ControlAssessmentRecord> | ControlAssessmentRecord[]>(url);
    },
    getControlAssessmentSummary: (params?: QueryParams) => {
        let url = "/api/governance/control-assessments/summary/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<AssessmentSummary>(url);
    },
    bootstrapControlAssessments: (data: { framework: string; profile_type?: string; maturity_model?: string }) =>
        request<AssessmentBootstrapResult>("/api/governance/control-assessments/bootstrap/", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    updateControlAssessment: (id: string, data: Partial<ControlAssessmentRecord>) =>
        request<ControlAssessmentRecord>(`/api/governance/control-assessments/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(data)
        }),
    getControlAssessmentRecommendation: (id: string) =>
        request<AssessmentRecommendation>(`/api/governance/control-assessments/${id}/recommendation/`),
    createAssessmentEvidence: (data: Partial<AssessmentEvidence>) =>
        request<AssessmentEvidence>("/api/governance/assessment-evidence/", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    createAssessmentFinding: (data: Partial<AssessmentFinding>) =>
        request<AssessmentFinding>("/api/governance/assessment-findings/", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    createImprovementAction: (data: Partial<ImprovementActionRecord>) =>
        request<ImprovementActionRecord>("/api/governance/improvement-actions/", {
            method: "POST",
            body: JSON.stringify(data)
        }),

    // Control mappings / framework scoring
    getControlMappingOverview: () => request<ControlMappingOverview>("/api/governance/control-mappings/overview/"),
    listControlMappings: (params?: QueryParams) => {
        let url = "/api/governance/control-mappings/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<ControlMappingRecord> | ControlMappingRecord[]>(url);
    },
    rebuildControlMappings: (minSharedMechanisms = 1) => request<ControlMappingRebuildResult>("/api/governance/control-mappings/rebuild/", {
        method: "POST",
        body: JSON.stringify({ min_shared_mechanisms: minSharedMechanisms })
    }),

    // Reusable mechanisms / cross-framework implementation layer
    listMechanisms: (params?: QueryParams) => {
        let url = "/api/governance/mechanisms/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<MechanismRecord> | MechanismRecord[]>(url);
    },
    createMechanism: (data: ApiRecord) => request<MechanismRecord>("/api/governance/mechanisms/", {
        method: "POST",
        body: JSON.stringify(data)
    }),
    listControlMechanisms: (params?: QueryParams) => {
        let url = "/api/governance/control-mechanisms/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<LegacyApiRecord> | LegacyApiRecord[]>(url);
    },
    createControlMechanism: (data: ApiRecord) => request<LegacyApiRecord>("/api/governance/control-mechanisms/", {
        method: "POST",
        body: JSON.stringify(data)
    }),
    createMechanismEvidence: (data: ApiRecord) => request<LegacyApiRecord>("/api/governance/mechanism-evidences/", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    // Decision Records / Human validation
    listDecisionRecords: (params?: QueryParams) => {
        let url = "/api/governance/decision-records/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<DecisionRecord>>(url);
    },
    createDecisionRecord: (data: Partial<DecisionRecord>) => request<DecisionRecord>("/api/governance/decision-records/", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    // Governance exceptions / temporary risk acceptance
    listGovernanceExceptions: (params?: QueryParams) => {
        let url = "/api/governance/governance-exceptions/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<GovernanceException>>(url);
    },
    createGovernanceException: (data: Partial<GovernanceException>) =>
        request<GovernanceException>("/api/governance/governance-exceptions/", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    updateGovernanceException: (id: string, data: Partial<GovernanceException>) =>
        request<GovernanceException>(`/api/governance/governance-exceptions/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(data)
        }),
    approveGovernanceException: (id: string, review_note?: string) =>
        request<GovernanceException>(`/api/governance/governance-exceptions/${id}/approve/`, {
            method: "POST",
            body: JSON.stringify({ review_note })
        }),
    rejectGovernanceException: (id: string, review_note: string) =>
        request<GovernanceException>(`/api/governance/governance-exceptions/${id}/reject/`, {
            method: "POST",
            body: JSON.stringify({ review_note })
        }),
    revokeGovernanceException: (id: string, review_note?: string) =>
        request<GovernanceException>(`/api/governance/governance-exceptions/${id}/revoke/`, {
            method: "POST",
            body: JSON.stringify({ review_note })
        }),

    // Governance links to residual risk
    listGovernanceRiskLinks: (params?: Record<string, unknown>) => {
        let url = "/api/governance/governance-risk-links/";
        if (params) {
            const query = new URLSearchParams(
                Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
                    if (value === undefined || value === null || value === "") return acc;
                    acc[key] = String(value);
                    return acc;
                }, {})
            ).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<GovernanceRiskLink> | GovernanceRiskLink[]>(url);
    },
    createGovernanceRiskLink: (data: Partial<GovernanceRiskLink>) =>
        request<GovernanceRiskLink>("/api/governance/governance-risk-links/", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    updateGovernanceRiskLink: (id: string, data: Partial<GovernanceRiskLink>) =>
        request<GovernanceRiskLink>(`/api/governance/governance-risk-links/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(data)
        }),
    approveGovernanceRiskLink: (id: string) =>
        request<GovernanceRiskLink>(`/api/governance/governance-risk-links/${id}/approve/`, {
            method: "POST",
            body: JSON.stringify({})
        }),
    rejectGovernanceRiskLink: (id: string, rationale: string) =>
        request<GovernanceRiskLink>(`/api/governance/governance-risk-links/${id}/reject/`, {
            method: "POST",
            body: JSON.stringify({ rationale })
        }),
    markGovernanceRiskLinkDeprecated: (id: string) =>
        request<GovernanceRiskLink>(`/api/governance/governance-risk-links/${id}/mark-deprecated/`, {
            method: "POST",
            body: JSON.stringify({})
        }),
    getResidualRiskOverview: (mode: GovernanceRiskCalculationMode = "official") =>
        request<ApiRecord>(`/api/governance/residual-risk/overview/?mode=${mode}`),
    getResidualRiskForRisk: (id: string, mode: GovernanceRiskCalculationMode = "official", includeInactive = false) =>
        request<ResidualRiskImpact>(`/api/governance/residual-risk/risk/${id}/?mode=${mode}&include_inactive=${includeInactive}`),
    getResidualRiskForAsset: (id: string, mode: GovernanceRiskCalculationMode = "official", includeInactive = false) =>
        request<ResidualRiskImpact>(`/api/governance/residual-risk/asset/${id}/?mode=${mode}&include_inactive=${includeInactive}`),
    getResidualRiskForVulnerability: (id: string, mode: GovernanceRiskCalculationMode = "official", includeInactive = false) =>
        request<ResidualRiskImpact>(`/api/governance/residual-risk/vulnerability/${id}/?mode=${mode}&include_inactive=${includeInactive}`),
    getResidualRiskForInternalControl: (id: string, mode: GovernanceRiskCalculationMode = "official", includeInactive = false) =>
        request<ResidualRiskImpact>(`/api/governance/residual-risk/internal-control/${id}/?mode=${mode}&include_inactive=${includeInactive}`),
    getResidualRiskForMechanism: (id: string, mode: GovernanceRiskCalculationMode = "official", includeInactive = false) =>
        request<ResidualRiskImpact>(`/api/governance/residual-risk/mechanism/${id}/?mode=${mode}&include_inactive=${includeInactive}`),

    // Governance action plan
    listGovernanceActions: (params?: QueryParams) => {
        let url = "/api/governance/governance-actions/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<GovernanceAction>>(url);
    },
    getGovernanceAction: (id: string) =>
        request<GovernanceAction>(`/api/governance/governance-actions/${id}/`),
    createGovernanceAction: (data: Partial<GovernanceAction>) =>
        request<GovernanceAction>("/api/governance/governance-actions/", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    updateGovernanceAction: (id: string, data: Partial<GovernanceAction>) =>
        request<GovernanceAction>(`/api/governance/governance-actions/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(data)
        }),
    generateGovernanceActionsFromWorkbench: (owner?: string) =>
        request<GovernanceActionGenerationResult>("/api/governance/governance-actions/generate-from-workbench/", {
            method: "POST",
            body: JSON.stringify({ owner })
        }),
    generateGovernanceActionsFromOnboarding: (owner?: string, action_ids?: string[]) =>
        request<GovernanceActionGenerationResult>("/api/governance/governance-actions/generate-from-onboarding/", {
            method: "POST",
            body: JSON.stringify({ owner, action_ids })
        }),
    generateMechanismTasks: (owner?: string, force = false) =>
        request<GovernanceActionGenerationResult>("/api/governance/governance-actions/generate-mechanism-tasks/", {
            method: "POST",
            body: JSON.stringify({ owner, force })
        }),
    listMechanismImplementationActions: (mechanismId: string) =>
        request<GovernanceAction[]>(`/api/governance/mechanisms/${mechanismId}/implementation-actions/`),
    createMechanismImplementationAction: (mechanismId: string, data: Partial<GovernanceAction>) =>
        request<GovernanceAction>(`/api/governance/mechanisms/${mechanismId}/implementation-actions/`, {
            method: "POST",
            body: JSON.stringify(data)
        }),
    suggestMechanismImplementationPlan: (mechanismId: string) =>
        request<{ generated_by: string; llm_available: boolean; tasks: Array<Record<string, unknown>> }>(`/api/governance/mechanisms/${mechanismId}/suggest-implementation-plan/`, {
            method: "POST",
            body: JSON.stringify({})
        }),
    generateMechanismImplementationActions: (mechanismId: string, tasks?: Array<Record<string, unknown>>, owner?: string) =>
        request<GovernanceActionGenerationResult & { suggestion?: unknown }>(`/api/governance/mechanisms/${mechanismId}/generate-implementation-actions/`, {
            method: "POST",
            body: JSON.stringify({ tasks, owner })
        }),
    getMechanismImplementationReadiness: (mechanismId: string) =>
        request<MechanismImplementationReadiness>(`/api/governance/mechanisms/${mechanismId}/implementation-readiness/`),
    applyMechanismImplementationRecommendation: (mechanismId: string, internalControlMechanisms?: string[], rationale?: string) =>
        request<{ updated: number; readiness: MechanismImplementationReadiness; links: Array<Record<string, unknown>> }>(`/api/governance/mechanisms/${mechanismId}/apply-implementation-recommendation/`, {
            method: "POST",
            body: JSON.stringify({
                internal_control_mechanisms: internalControlMechanisms,
                confirmed_human_validation: true,
                rationale,
            })
        }),
    startGovernanceAction: (id: string, notes?: string) =>
        request<GovernanceAction>(`/api/governance/governance-actions/${id}/start/`, {
            method: "POST",
            body: JSON.stringify({ notes })
        }),
    completeGovernanceAction: (id: string, notes?: string) =>
        request<GovernanceAction>(`/api/governance/governance-actions/${id}/complete/`, {
            method: "POST",
            body: JSON.stringify({ notes })
        }),
    blockGovernanceAction: (id: string, notes?: string) =>
        request<GovernanceAction>(`/api/governance/governance-actions/${id}/block/`, {
            method: "POST",
            body: JSON.stringify({ notes })
        }),
    deferGovernanceAction: (id: string, notes?: string, due_date?: string) =>
        request<GovernanceAction>(`/api/governance/governance-actions/${id}/defer/`, {
            method: "POST",
            body: JSON.stringify({ notes, due_date })
        }),
    cancelGovernanceAction: (id: string, notes?: string) =>
        request<GovernanceAction>(`/api/governance/governance-actions/${id}/cancel/`, {
            method: "POST",
            body: JSON.stringify({ notes })
        }),

    getGovernanceHealth: () =>
        request<GovernanceHealthPayload>("/api/governance/health/overview/"),
    getGovernanceEvaluationOverview: () =>
        request<GovernanceEvaluationOverview>("/api/governance/evaluation/overview/"),
    getComplianceDriftOverview: () =>
        request<ComplianceDriftOverview>("/api/governance/drift/overview/"),
    createComplianceDriftSnapshot: (label?: string, snapshot_type = "audit") =>
        request<ComplianceDriftSnapshotResult>("/api/governance/drift/snapshot-current/", {
            method: "POST",
            body: JSON.stringify({ label, snapshot_type })
        }),
    createComplianceDriftDemoRegression: () =>
        request<ComplianceDriftDemoResult>("/api/governance/drift/demo-regression/", {
            method: "POST",
            body: JSON.stringify({})
        }),

    getFrameworks: (params?: QueryParams) => {
        let url = "/api/governance/frameworks/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<FrameworkRecord> | FrameworkRecord[]>(url);
    },
    getFramework: (id: string) =>
        request<FrameworkRecord>(`/api/governance/frameworks/${id}/`),
    getFrameworkSections: (id: string) =>
        request<FrameworkSectionRecord[]>(`/api/governance/frameworks/${id}/sections/`),
    listControls: (params?: QueryParams) => {
        let url = "/api/governance/controls/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<FrameworkControlRecord>>(url);
    },
    getControls: (frameworkId?: string) => {
        let url = "/api/governance/controls/";
        if (frameworkId) {
            url += `?framework=${frameworkId}`;
        }
        return request<PaginatedResponse<FrameworkControlRecord>>(url);
    },

    // Stakeholders
    listStakeholders: (params?: QueryParams) => {
        let url = "/api/governance/stakeholders/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<Stakeholder>>(url);
    },
    createStakeholder: (data: Partial<Stakeholder>) => request<Stakeholder>("/api/governance/stakeholders/", {
        method: "POST",
        body: JSON.stringify(data)
    }),
    updateStakeholder: (id: string, data: Partial<Stakeholder>) => request<Stakeholder>(`/api/governance/stakeholders/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data)
    }),
    deleteStakeholder: (id: string) => request(`/api/governance/stakeholders/${id}/`, {
        method: "DELETE"
    }),

    // Technical Regulations
    listTechnicalRegulations: (params?: QueryParams) => {
        let url = "/api/governance/technical-regulations/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<TechnicalRegulation>>(url);
    },

    // Procedures
    listProcedures: (params?: QueryParams) => {
        let url = "/api/governance/procedures/";
        if (params) {
            const query = toSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<Procedure>>(url);
    },
};



