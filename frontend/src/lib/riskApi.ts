import { request } from "./api";

/**
 * API Client for Intelligent Risk Management module (ISO 27005)
 */
export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface Software {
    id: number;
    name: string;
    version: string;
    architecture?: string;
    vendor?: string;
    source?: string;
    assets_count?: number;
    vulnerabilities_count?: number;
    max_severity?: "Critical" | "High" | "Medium" | "Low" | "None";
    risk_score?: number;
    assets_detail?: any[];
    vulnerabilities_detail?: any[];
    created_at: string;
    updated_at: string;
}

export interface AssetCategory {
    id: number;
    name: string;
    description?: string;
}

export interface AssetType {
    id: number;
    category?: number;
    category_name?: string;
    name: string;
    description?: string;
}

export interface AssetLocation {
    id: number;
    name: string;
    description?: string;
    [key: string]: any;
}

export interface AssetEnvironment {
    id: number;
    name: string;
    description?: string;
    [key: string]: any;
}

export interface AssetInfrastructure {
    id: number;
    name: string;
    description?: string;
    [key: string]: any;
}

export interface NetworkRange {
    id: number;
    name: string;
    cidr: string;
    description?: string;
    is_active?: boolean;
    [key: string]: any;
}

export interface Vulnerability {
    id: string;
    cve_id: string;
    title?: string;
    severity: "Low" | "Medium" | "High" | "Critical";
    cvss_score?: number;
    cvss_exploitability_score?: number | string;
    description?: string;
    mitigation?: string;
    epss_score?: number | string;
    epss_percentile?: number | string;
    is_in_kev?: boolean;
    source: string;
    published_at?: string;
    controls?: any[];
    assets_count?: number;
    assets_detail?: any[];
    software_count?: number;
    software_detail?: any[];
    remediation_status?: string;
    detected_at?: string;
    affected_assets_count?: number;
    open_assets_count?: number;
    last_seen_date?: string;
}

export interface Asset {
    id: string;
    name: string;
    description?: string;
    category: string | number;
    category_name?: string;
    asset_type: string | number;
    type_name?: string;
    criticality: string;
    confidentiality?: number | string;
    integrity?: number | string;
    availability?: number | string;
    exposure: number;
    business_process?: string;
    business_owner?: string | number;
    business_owner_name?: string;
    technical_owner?: string | number;
    owner?: string;
    status: string;
    source?: string;
    location?: string | number;
    environment?: string | number;
    deployment_type?: string | number;
    parent?: string | null;
    parent_details?: any;
    children_details?: any[];
    controls?: any[];
    vulnerability_occurrences?: AssetVulnerability[];
    secondary_ips?: string[];
    last_sync_at?: string;
    wazuh_agent_id?: string;
    wazuh_os_name?: string;
    wazuh_os_version?: string;
    wazuh_node_name?: string;
    vulnerabilities_count?: number;
    controls_count?: number;
    wazuh_ip?: string;
}

export interface AssetVulnerability {
    id: string;
    asset: string;
    asset_name?: string;
    vulnerability: string;
    cve_id?: string;
    severity?: string;
    cvss_score?: number;
    cvss_exploitability_score?: number | string;
    software?: string;
    software_name?: string;
    software_version?: string;
    status: "Open" | "In remediation" | "Mitigated" | "Accepted risk" | "False positive" | "Resolved";
    first_detected: string;
    last_seen: string;
    resolved_at?: string;
    missing_count: number;
    source: string;
    epss_score?: number | string;
    vulnerability_details?: Vulnerability;
    asset_details?: any;
    software_details?: any;
    history?: any[];
}

export interface RiskFactor {
    id: string;
    name: string;
    value: string;
    weight: number;
    contribution: number;
}

export interface RiskTreatment {
    id: string;
    risk: string;
    treatment_type: 'mitigate' | 'transfer' | 'accept' | 'avoid';
    treatment_type_display: string;
    action: string;
    responsible: string;
    due_date: string;
    status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
    status_display: string;
}

export interface Risk {
    id: string;
    title?: string;
    asset: string;
    asset_name?: string;
    asset_criticality?: string;
    vulnerability?: string;
    vulnerability_cve?: string;
    vulnerability_title?: string;
    vulnerability_cvss?: number;
    risk_score: number;
    score?: number;
    risk_level: 'very_low' | 'low' | 'medium' | 'high' | 'critical';
    risk_level_display: string;
    status: 'open' | 'in_progress' | 'mitigated' | 'accepted';
    status_display: string;
    ai_explanation?: string;
    likelihood: number;
    impact: number;
    factors: RiskFactor[];
    treatments: RiskTreatment[];
    created_at: string;
    updated_at: string;
}

export interface PrioritizedVulnerability {
    rank: number;
    vulnerability_id: string;
    cve_id: string;
    title: string;
    severity: string;
    asset: {
        id: string;
        name: string;
        criticality: string;
        exposure_level: string;
    };
    risk_score: number;
    remediation_score: number;
    priority_score: number;
    risk_breakdown: {
        cvss: number;
        epss: number;
        asset_criticality: number;
        exposure: number;
        exploit_availability: number;
    };
    remediation_breakdown: {
        patch_actionability: number;
        age_urgency_bonus: number;
    };
    risk_reasons: string[];
    remediation_reasons: string[];
    priority_summary: string;
}

export interface RiskAssessment {
    id: string;
    asset: string;
    asset_name: string;
    overall_score: number;
    overall_level: string;
    overall_level_display: string;
    last_assessed_at: string;
    summary: string;
    recommendations: string;
}

export interface RiskConfig {
    id: number;
    weight_cia: number;
    weight_exposure: number;
    weight_value: number;
    weight_dependency: number;
}

function cleanParams(params: any): string {
    if (!params) return "";
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
            p.append(k, String(v));
        }
    });
    return p.toString();
}

export const riskApi = {
    request,

    // --- Asset Management ---
    async listAssets(params?: any): Promise<PaginatedResponse<any>> {
        const query = cleanParams(params);
        return await request<PaginatedResponse<any>>(`/api/risk/assets/${query ? '?' + query : ''}`);
    },

    async getAsset(id: string): Promise<any> {
        return await request<any>(`/api/risk/assets/${id}/`);
    },

    async createAsset(payload: any): Promise<any> {
        return await request<any>('/api/risk/assets/', {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async updateAsset(id: string | number, payload: any): Promise<any> {
        return await request<any>(`/api/risk/assets/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    },

    async enrichAsset(id: string | number): Promise<any> {
        return await request<any>(`/api/risk/assets/${id}/enrich_nmap/`, {
            method: "POST",
            body: JSON.stringify({})
        });
    },

    async mergeAsset(id: string | number, sourceAssetIds: Array<string | number>): Promise<any> {
        return await request<any>(`/api/risk/assets/${id}/merge/`, {
            method: "POST",
            body: JSON.stringify({ source_asset_ids: sourceAssetIds })
        });
    },

    async scanNmap(payload: any = {}): Promise<any> {
        return await request<any>('/api/risk/assets/scan_nmap/', {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async syncWazuhAssets(): Promise<any> {
        return await request<any>('/api/risk/assets/sync_wazuh/', {
            method: "POST",
            body: JSON.stringify({})
        });
    },

    async listAssetCategories(): Promise<AssetCategory[]> {
        const data = await request<any>('/api/risk/asset-categories/');
        return Array.isArray(data) ? data : data.results || [];
    },

    async listAssetTypes(categoryId?: string | number): Promise<AssetType[]> {
        const query = categoryId ? `?category=${categoryId}` : "";
        const data = await request<any>(`/api/risk/asset-types/${query}`);
        return Array.isArray(data) ? data : data.results || [];
    },

    async listAssetLocations(): Promise<AssetLocation[]> {
        const data = await request<any>('/api/risk/asset-locations/');
        return Array.isArray(data) ? data : data.results || [];
    },

    async createAssetLocation(payload: Partial<AssetLocation>): Promise<AssetLocation> {
        return await request<AssetLocation>('/api/risk/asset-locations/', {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async listAssetEnvironments(): Promise<AssetEnvironment[]> {
        const data = await request<any>('/api/risk/asset-environments/');
        return Array.isArray(data) ? data : data.results || [];
    },

    async createAssetEnvironment(payload: Partial<AssetEnvironment>): Promise<AssetEnvironment> {
        return await request<AssetEnvironment>('/api/risk/asset-environments/', {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async listAssetInfrastructures(): Promise<AssetInfrastructure[]> {
        const data = await request<any>('/api/risk/asset-infrastructures/');
        return Array.isArray(data) ? data : data.results || [];
    },

    async createAssetInfrastructure(payload: Partial<AssetInfrastructure>): Promise<AssetInfrastructure> {
        return await request<AssetInfrastructure>('/api/risk/asset-infrastructures/', {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async listNetworkRanges(params?: any): Promise<NetworkRange[]> {
        const query = cleanParams(params);
        const data = await request<any>(`/api/risk/network-ranges/${query ? '?' + query : ''}`);
        return Array.isArray(data) ? data : data.results || [];
    },

    async createNetworkRange(payload: Partial<NetworkRange>): Promise<NetworkRange> {
        return await request<NetworkRange>('/api/risk/network-ranges/', {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async updateNetworkRange(id: string | number, payload: Partial<NetworkRange>): Promise<NetworkRange> {
        return await request<NetworkRange>(`/api/risk/network-ranges/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    },

    async deleteNetworkRange(id: string | number): Promise<void> {
        return await request<void>(`/api/risk/network-ranges/${id}/`, {
            method: "DELETE"
        });
    },

    // --- Software Management ---
    async listSoftware(params?: any): Promise<PaginatedResponse<Software>> {
        const query = cleanParams(params);
        return await request<PaginatedResponse<Software>>(`/api/risk/software/${query ? '?' + query : ''}`);
    },

    async getSoftware(id: string | number): Promise<Software> {
        return await request<Software>(`/api/risk/software/${id}/`);
    },

    async updateSoftware(id: string | number, payload: Partial<Software>): Promise<Software> {
        return await request<Software>(`/api/risk/software/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    },

    async getSoftwareStats(): Promise<any> {
        return await request<any>('/api/risk/software/stats/');
    },

    // --- Vulnerabilities ---
    async listVulnerabilities(params?: any): Promise<PaginatedResponse<Vulnerability>> {
        const query = cleanParams(params);
        return await request<PaginatedResponse<Vulnerability>>(`/api/risk/vulnerabilities/${query ? '?' + query : ''}`);
    },

    async getVulnerability(id: string): Promise<Vulnerability> {
        return await request<Vulnerability>(`/api/risk/vulnerabilities/${id}/`);
    },

    async updateVulnerability(id: string, payload: Partial<Vulnerability>): Promise<Vulnerability> {
        return await request<Vulnerability>(`/api/risk/vulnerabilities/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    },

    async refreshVulnerabilityIntel(): Promise<any> {
        return await request<any>('/api/risk/vulnerabilities/refresh_intel/', {
            method: "POST",
            body: JSON.stringify({})
        });
    },

    async refreshNvdIntel(): Promise<any> {
        return await request<any>('/api/risk/vulnerabilities/refresh_nvd/', {
            method: "POST",
            body: JSON.stringify({})
        });
    },

    async listVulnerabilityOccurrences(params?: any): Promise<PaginatedResponse<AssetVulnerability>> {
        const query = cleanParams(params);
        return await request<PaginatedResponse<AssetVulnerability>>(`/api/risk/vulnerability-occurrences/${query ? '?' + query : ''}`);
    },

    async getVulnerabilityOccurrence(id: string): Promise<AssetVulnerability> {
        return await request<AssetVulnerability>(`/api/risk/vulnerability-occurrences/${id}/`);
    },

    async changeVulnerabilityStatus(id: string, status: string, notes = ""): Promise<AssetVulnerability> {
        return await request<AssetVulnerability>(`/api/risk/vulnerability-occurrences/${id}/change_status/`, {
            method: "POST",
            body: JSON.stringify({ status, notes })
        });
    },

    async listPrioritizedVulnerabilities(params?: any): Promise<PrioritizedVulnerability[]> {
        const query = cleanParams(params);
        return await request<PrioritizedVulnerability[]>(`/api/risk/vulnerability-occurrences/prioritized/${query ? '?' + query : ''}`);
    },

    // --- Risks ---
    async listRisks(params?: any): Promise<PaginatedResponse<Risk>> {
        const query = cleanParams(params);
        return await request<PaginatedResponse<Risk>>(`/api/risk/risks/${query ? '?' + query : ''}`);
    },

    async getRisk(id: string): Promise<Risk> {
        return await request<Risk>(`/api/risk/risks/${id}/`);
    },

    async recalculateRisk(id: string): Promise<Risk> {
        return await request<Risk>(`/api/risk/risks/${id}/recalculate/`, {
            method: "POST"
        });
    },

    async getRiskDashboard(): Promise<{
        metrics: { total: number, critical: number, high: number, open: number },
        distribution: { risk_level: string, count: number }[],
        top_assets: { asset__name: string, score: number }[]
    }> {
        return await request<any>('/api/risk/risks/dashboard/');
    },

    // --- Risk Treatments & Assessments ---
    async listTreatments(params?: any): Promise<PaginatedResponse<RiskTreatment>> {
        const query = cleanParams(params);
        return await request<PaginatedResponse<RiskTreatment>>(`/api/risk/risk-treatments/${query ? '?' + query : ''}`);
    },

    async createTreatment(payload: Partial<RiskTreatment>): Promise<RiskTreatment> {
        return await request<RiskTreatment>('/api/risk/risk-treatments/', {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async listAssessments(params?: any): Promise<PaginatedResponse<RiskAssessment>> {
        const query = cleanParams(params);
        return await request<PaginatedResponse<RiskAssessment>>(`/api/risk/risk-assessments/${query ? '?' + query : ''}`);
    },

    // --- Config ---
    async getRiskConfig(): Promise<RiskConfig> {
        return await request<RiskConfig>('/api/risk/risk-configuration/current/');
    },

    async updateRiskConfig(id: number, payload: Partial<RiskConfig>): Promise<RiskConfig> {
        return await request<RiskConfig>(`/api/risk/risk-configuration/${id}/`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    }
};


