import { request } from "./api";

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
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

export type DecisionValue = "accepted" | "rejected" | "deferred" | "converted_to_action";

export type DecisionRecord = {
    id: string;
    decision_type: "risk" | "vulnerability" | "compliance_gap" | "assistant_recommendation";
    target_type: string;
    target_id: string;
    title: string;
    recommendation: string;
    rationale: string;
    source_snapshot: any[];
    score_snapshot: Record<string, any>;
    decision: DecisionValue;
    decision_display?: string;
    justification: string;
    decided_by: string;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
};

export const governanceApi = {
    // Organization Context
    getOrganizationContext: () => request<any>("/api/governance/organization-context/current/"),
    updateOrganizationContext: (id: string, data: any) => request<any>(`/api/governance/organization-context/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),

    // Regulatory Context
    getRegulatoryContext: () => request<any>("/api/governance/regulatory-context/current/"),
    updateRegulatoryContext: (id: string, data: any) => request<any>(`/api/governance/regulatory-context/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),

    // Stakeholders
    listStakeholders: (params?: Record<string, any>) => {
        let url = "/api/governance/stakeholders/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
    getStakeholder: (id: string) => request<any>(`/api/governance/stakeholders/${id}/`),
    createStakeholder: (data: any) => request<any>("/api/governance/stakeholders/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateStakeholder: (id: string, data: any) => request<any>(`/api/governance/stakeholders/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deleteStakeholder: (id: string) => request<any>(`/api/governance/stakeholders/${id}/`, {
        method: 'DELETE'
    }),

    // Policies
    listPolicies: (params?: Record<string, any>) => {
        let url = "/api/governance/policies/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
    getPolicy: (id: string) => request<any>(`/api/governance/policies/${id}/`),
    createPolicy: (data: any) => request<any>("/api/governance/policies/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicy: (id: string, data: any) => request<any>(`/api/governance/policies/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicy: (id: string) => request<any>(`/api/governance/policies/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Controls
    listPolicyControls: (params?: Record<string, any>) => {
        let url = "/api/governance/policy-controls/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
    createPolicyControl: (data: any) => request<any>("/api/governance/policy-controls/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicyControl: (id: string, data: any) => request<any>(`/api/governance/policy-controls/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicyControl: (id: string) => request<any>(`/api/governance/policy-controls/${id}/`, {
        method: 'DELETE'
    }),
    getAIRecommendations: (policyId: string) => request<any>(`/api/governance/policies/${policyId}/recommend_controls/`),

    // Implementation Mechanisms
    listPolicyMechanisms: (params?: Record<string, any>) => {
        let url = "/api/governance/policy-mechanisms/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
    createPolicyMechanism: (data: any) => request<any>("/api/governance/policy-mechanisms/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicyMechanism: (id: string, data: any) => request<any>(`/api/governance/policy-mechanisms/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicyMechanism: (id: string) => request<any>(`/api/governance/policy-mechanisms/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Evidences
    listPolicyEvidences: (params?: Record<string, any>) => {
        let url = "/api/governance/policy-evidences/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
    createPolicyEvidence: (data: any) => request<any>("/api/governance/policy-evidences/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicyEvidence: (id: string, data: any) => request<any>(`/api/governance/policy-evidences/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicyEvidence: (id: string) => request<any>(`/api/governance/policy-evidences/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Assessments
    listPolicyAssessments: (params?: Record<string, any>) => {
        let url = "/api/governance/policy-assessments/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
    createPolicyAssessment: (data: any) => request<any>("/api/governance/policy-assessments/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    deletePolicyAssessment: (id: string) => request<any>(`/api/governance/policy-assessments/${id}/`, {
        method: 'DELETE'
    }),

    // Policy Sections
    listPolicySections: (params?: Record<string, any>) => {
        let url = "/api/governance/policy-sections/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<any>(url);
    },
    createPolicySection: (data: any) => request<any>("/api/governance/policy-sections/", {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePolicySection: (id: string, data: any) => request<any>(`/api/governance/policy-sections/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePolicySection: (id: string) => request<any>(`/api/governance/policy-sections/${id}/`, {
        method: 'DELETE'
    }),

    // Frameworks & Controls (Read-only)
    listTechnicalRegulations: (params?: Record<string, any>) => {
        let url = "/api/governance/technical-regulations/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
    listProcedures: (params?: Record<string, any>) => {
        let url = "/api/governance/procedures/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<any>>(url);
    },

    // Compliance Gaps
    getComplianceSummary: (params?: Record<string, any>) => {
        let url = "/api/governance/gaps/summary/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<ComplianceSummary>(url);
    },
    listComplianceGaps: (params?: Record<string, any>) => {
        let url = "/api/governance/gaps/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<ComplianceGapRecord> | ComplianceGapRecord[]>(url);
    },
    analyzeComplianceGaps: () => request<ComplianceAnalysisResult>("/api/governance/gaps/analyze/", {
        method: "POST",
        body: JSON.stringify({})
    }),

    // Control assessments / human validation
    listControlAssessments: (params?: Record<string, any>) => {
        let url = "/api/governance/control-assessments/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<ControlAssessmentRecord> | ControlAssessmentRecord[]>(url);
    },
    getControlAssessmentSummary: (params?: Record<string, any>) => {
        let url = "/api/governance/control-assessments/summary/";
        if (params) {
            const query = new URLSearchParams(params).toString();
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
    listControlMappings: (params?: Record<string, any>) => {
        let url = "/api/governance/control-mappings/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<ControlMappingRecord> | ControlMappingRecord[]>(url);
    },
    rebuildControlMappings: (minSharedMechanisms = 1) => request<ControlMappingRebuildResult>("/api/governance/control-mappings/rebuild/", {
        method: "POST",
        body: JSON.stringify({ min_shared_mechanisms: minSharedMechanisms })
    }),

    // Decision Records / Human validation
    listDecisionRecords: (params?: Record<string, any>) => {
        let url = "/api/governance/decision-records/";
        if (params) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }
        return request<PaginatedResponse<DecisionRecord>>(url);
    },
    createDecisionRecord: (data: Partial<DecisionRecord>) => request<DecisionRecord>("/api/governance/decision-records/", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    getFrameworks: () => request<PaginatedResponse<any>>("/api/governance/frameworks/"),
    getControls: (frameworkId?: string) => {
        let url = "/api/governance/controls/";
        if (frameworkId) {
            url += `?framework=${frameworkId}`;
        }
        return request<PaginatedResponse<any>>(url);
    },
};


