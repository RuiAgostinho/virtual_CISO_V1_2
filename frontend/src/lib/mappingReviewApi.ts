/* eslint-disable @typescript-eslint/no-explicit-any */
import { request } from "./api";
import type { PaginatedResponse } from "./governanceApi";

export type ValidationStatus = "draft" | "pending_review" | "approved" | "rejected" | "deprecated";
export type MappingSource = "manual" | "migrated" | "imported" | "ai_suggested" | "rule_based" | "template";

export type MappingKind =
  | "policy_internal_control"
  | "governance_document_control"
  | "internal_control_framework_mapping"
  | "internal_control_mechanism"
  | "evidence_link";

export type MappingRecord = {
  id: string;
  kind: MappingKind;
  sourceId?: string;
  sourceLabel: string;
  sourceType: string;
  targetId?: string;
  targetLabel: string;
  targetType: string;
  validation_status: ValidationStatus;
  mapping_source: MappingSource;
  rationale?: string;
  confidence_score?: number | string;
  relationship_type?: string;
  coverage_percentage?: number | string;
  contribution_weight?: number | string;
  mandatory?: boolean;
  implementation_status?: string;
  link_type?: string;
  purpose?: string;
  applicability?: string;
  created_by_username?: string;
  updated_by_username?: string;
  validated_by_username?: string;
  validated_at?: string | null;
  raw: any;
};

export type SearchOption = {
  id: string;
  label: string;
  description?: string;
  meta?: string;
  raw: any;
};

export type TraceabilityOptions = {
  mode?: "official" | "simulation" | "exploratory";
  include_inactive?: boolean;
  include_evidence?: boolean;
  include_gaps?: boolean;
  include_scores?: boolean;
  max_depth?: 1 | 2 | 3;
};

export type TraceabilityPayload = {
  root: { type: string; object?: any };
  relationships?: Record<string, any>;
  active_mappings?: Record<string, any>;
  inactive_mappings?: Record<string, any>;
  scores?: Record<string, any>;
  evidence?: Record<string, any>;
  gaps?: any[];
  metadata?: Record<string, any>;
  totals?: Record<string, number>;
};

const endpoints: Record<MappingKind, string> = {
  policy_internal_control: "/api/governance/policy-internal-controls/",
  governance_document_control: "/api/governance/governance-document-controls/",
  internal_control_framework_mapping: "/api/governance/internal-control-framework-mappings/",
  internal_control_mechanism: "/api/governance/internal-control-mechanisms/",
  evidence_link: "/api/governance/evidence-links/",
};

const traceabilityEndpoints: Record<string, string> = {
  policy: "/api/governance/traceability/policy/",
  governance_document: "/api/governance/traceability/governance-document/",
  internal_control: "/api/governance/traceability/internal-control/",
  mechanism: "/api/governance/traceability/mechanism/",
  evidence_item: "/api/governance/traceability/evidence-item/",
  framework: "/api/governance/traceability/framework/",
  framework_control: "/api/governance/traceability/framework-control/",
};

function queryString(params?: Record<string, any>) {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

function unwrap<T>(payload: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(payload)) return payload;
  return payload?.results || [];
}

function numberValue(value: number | string | undefined) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function joinLabel(parts: Array<string | number | undefined | null>, separator = " - ") {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(separator);
}

function internalControlLabel(code?: string | null, title?: string | null) {
  const cleanCode = String(code || "").trim();
  const displayCode = cleanCode && cleanCode.startsWith("IC-") ? cleanCode : cleanCode ? `IC-${cleanCode}` : "";
  return joinLabel([displayCode, title]);
}

function externalControlLabel(frameworkCode?: string | null, controlCode?: string | null, title?: string | null) {
  const framework = String(frameworkCode || "").trim();
  const code = String(controlCode || "").trim();
  const displayCode = framework && code ? `EXT-${framework}:${code}` : code ? `EXT-${code}` : "";
  return joinLabel([displayCode, title]);
}

function optionFromItem(item: any, label: string, description?: string, meta?: string): SearchOption {
  return {
    id: String(item.id),
    label: label || String(item.id),
    description,
    meta,
    raw: item,
  };
}

async function searchEndpoint(
  endpoint: string,
  params: Record<string, any>,
  toOption: (item: any) => SearchOption
) {
  const payload = await request<PaginatedResponse<any> | any[]>(`${endpoint}${queryString(params)}`);
  return unwrap(payload).map(toOption);
}

function normalize(kind: MappingKind, item: any): MappingRecord {
  if (kind === "policy_internal_control") {
    return {
      id: item.id,
      kind,
      sourceId: item.policy,
      sourceType: "policy",
      sourceLabel: item.policy_title || item.policy_code || item.policy || "Política",
      targetId: item.internal_control,
      targetType: "internal_control",
      targetLabel: item.internal_control_code
        ? internalControlLabel(item.internal_control_code, item.internal_control_title)
        : item.internal_control || "Internal control",
      validation_status: item.validation_status,
      mapping_source: item.mapping_source,
      rationale: item.rationale,
      confidence_score: item.confidence_score,
      applicability: item.applicability,
      created_by_username: item.created_by_username,
      updated_by_username: item.updated_by_username,
      validated_by_username: item.validated_by_username,
      validated_at: item.validated_at,
      raw: item,
    };
  }

  if (kind === "governance_document_control") {
    return {
      id: item.id,
      kind,
      sourceId: item.document,
      sourceType: "governance_document",
      sourceLabel: item.document_title || item.document || "Documento",
      targetId: item.internal_control,
      targetType: "internal_control",
      targetLabel: item.internal_control_code
        ? internalControlLabel(item.internal_control_code, item.internal_control_title)
        : item.internal_control || "Internal control",
      validation_status: item.validation_status,
      mapping_source: item.mapping_source,
      rationale: item.rationale,
      confidence_score: item.confidence_score,
      purpose: item.purpose,
      created_by_username: item.created_by_username,
      updated_by_username: item.updated_by_username,
      validated_by_username: item.validated_by_username,
      validated_at: item.validated_at,
      raw: item,
    };
  }

  if (kind === "internal_control_framework_mapping") {
    return {
      id: item.id,
      kind,
      sourceId: item.internal_control,
      sourceType: "internal_control",
      sourceLabel: item.internal_control_code
        ? internalControlLabel(item.internal_control_code, item.internal_control_title)
        : item.internal_control || "Internal control",
      targetId: item.framework_control,
      targetType: "framework_control",
      targetLabel: item.framework_control_code
        ? externalControlLabel(item.framework_code, item.framework_control_code, item.framework_control_title)
        : item.framework_control || "Controlo externo",
      validation_status: item.validation_status,
      mapping_source: item.mapping_source,
      rationale: item.rationale,
      confidence_score: item.confidence_score,
      relationship_type: item.relationship_type,
      coverage_percentage: item.coverage_percentage,
      created_by_username: item.created_by_username,
      updated_by_username: item.updated_by_username,
      validated_by_username: item.validated_by_username,
      validated_at: item.validated_at,
      raw: item,
    };
  }

  if (kind === "internal_control_mechanism") {
    return {
      id: item.id,
      kind,
      sourceId: item.internal_control,
      sourceType: "internal_control",
      sourceLabel: item.internal_control_code
        ? internalControlLabel(item.internal_control_code, item.internal_control_title)
        : item.internal_control || "Internal control",
      targetId: item.mechanism,
      targetType: "mechanism",
      targetLabel: item.mechanism_title || item.mechanism || "Mecanismo",
      validation_status: item.validation_status,
      mapping_source: item.mapping_source,
      rationale: item.rationale,
      confidence_score: item.confidence_score,
      relationship_type: item.relationship_type,
      contribution_weight: item.contribution_weight,
      mandatory: item.mandatory,
      implementation_status: item.implementation_status,
      created_by_username: item.created_by_username,
      updated_by_username: item.updated_by_username,
      validated_by_username: item.validated_by_username,
      validated_at: item.validated_at,
      raw: item,
    };
  }

  return {
    id: item.id,
    kind,
    sourceId: item.evidence_item,
    sourceType: "evidence_item",
    sourceLabel: item.evidence_title || item.evidence_item || "Evidência",
    targetId: item.target_id,
    targetType: item.target_type,
    targetLabel: item.target_label || `${item.target_type}:${item.target_id}`,
    validation_status: item.validation_status,
    mapping_source: item.mapping_source,
    rationale: item.rationale,
    confidence_score: item.confidence_score,
    link_type: item.link_type,
    created_by_username: item.created_by_username,
    updated_by_username: item.updated_by_username,
    validated_by_username: item.validated_by_username,
    validated_at: item.validated_at,
    raw: item,
  };
}

export const mappingReviewApi = {
  async listMappings(kind: MappingKind, params?: Record<string, any>) {
    const payload = await request<PaginatedResponse<any> | any[]>(`${endpoints[kind]}${queryString(params)}`);
    return unwrap(payload).map((item) => normalize(kind, item));
  },

  async listAllMappings(params?: Record<string, any>) {
    const kinds = Object.keys(endpoints) as MappingKind[];
    const batches = await Promise.all(
      kinds.map((kind) => mappingReviewApi.listMappings(kind, { page_size: 1000, ...params }))
    );
    return batches.flat();
  },

  updateMapping(kind: MappingKind, id: string, data: Record<string, any>) {
    return request<any>(`${endpoints[kind]}${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  createMapping(kind: MappingKind, data: Record<string, any>) {
    return request<any>(endpoints[kind], {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  approveMapping(kind: MappingKind, id: string) {
    return request<any>(`${endpoints[kind]}${id}/approve/`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  rejectMapping(kind: MappingKind, id: string, rationale: string) {
    return request<any>(`${endpoints[kind]}${id}/reject/`, {
      method: "POST",
      body: JSON.stringify({ rationale }),
    });
  },

  deprecateMapping(kind: MappingKind, id: string) {
    return request<any>(`${endpoints[kind]}${id}/mark-deprecated/`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  getTraceability(targetType: string, id: string, params?: TraceabilityOptions) {
    const base = traceabilityEndpoints[targetType];
    if (!base) throw new Error(`Traceability não suportada para ${targetType}`);
    return request<TraceabilityPayload>(`${base}${id}/${queryString(params)}`);
  },

  getOverview(params?: TraceabilityOptions) {
    return request<TraceabilityPayload>(`/api/governance/traceability/overview/${queryString(params)}`);
  },

  getPropagationGaps(params?: Record<string, any>) {
    return request<{ calculation_mode: string; gaps: any[] }>(
      `/api/governance/compliance-propagation/gaps/${queryString(params)}`
    );
  },

  getFrameworkScore(id: string, params?: Record<string, any>) {
    return request<any>(`/api/governance/compliance-propagation/framework/${id}/${queryString(params)}`);
  },

  getInternalControlComplianceScore(id: string, params?: Record<string, any>) {
    return request<any>(`/api/governance/compliance-propagation/internal-control/${id}/${queryString(params)}`);
  },

  getFrameworkControlComplianceScore(id: string, params?: Record<string, any>) {
    return request<any>(`/api/governance/compliance-propagation/framework-control/${id}/${queryString(params)}`);
  },

  searchPolicies(search = "") {
    return searchEndpoint("/api/governance/policies/", { search, page_size: 20 }, (item) =>
      optionFromItem(
        item,
        joinLabel([item.code, item.title]),
        item.description,
        item.status || item.owner_display || item.owner
      )
    );
  },

  getPolicy(id: string) {
    return request<any>(`/api/governance/policies/${id}/`);
  },

  searchGovernanceDocuments(search = "") {
    return searchEndpoint("/api/governance/governance-documents/", { search, page_size: 20 }, (item) =>
      optionFromItem(
        item,
        joinLabel([item.title, item.version ? `v${item.version}` : ""]),
        item.purpose || item.scope || item.content,
        item.document_type || item.status
      )
    );
  },

  listGovernanceDocuments(params?: Record<string, any>) {
    return request<PaginatedResponse<any> | any[]>(`/api/governance/governance-documents/${queryString(params)}`);
  },

  getGovernanceDocument(id: string) {
    return request<any>(`/api/governance/governance-documents/${id}/`);
  },

  updateGovernanceDocument(id: string, data: Record<string, any>) {
    return request<any>(`/api/governance/governance-documents/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getGovernanceDocumentChildren(id: string) {
    return request<any[]>(`/api/governance/governance-documents/${id}/children/`);
  },

  getGovernanceDocumentSections(id: string) {
    return request<any[]>(`/api/governance/governance-documents/${id}/sections/`);
  },

  createGovernanceDocumentSection(data: Record<string, any>) {
    return request<any>("/api/governance/governance-document-sections/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateGovernanceDocumentSection(id: string, data: Record<string, any>) {
    return request<any>(`/api/governance/governance-document-sections/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  deleteGovernanceDocumentSection(id: string) {
    return request<void>(`/api/governance/governance-document-sections/${id}/`, {
      method: "DELETE",
    });
  },

  getGovernanceDocumentRunbookSteps(id: string) {
    return request<any[]>(`/api/governance/governance-documents/${id}/runbook-steps/`);
  },

  getGovernanceDocumentInternalControls(id: string) {
    return request<any[]>(`/api/governance/governance-documents/${id}/internal-controls/`);
  },

  getGovernanceDocumentComplianceScore(id: string, params?: Record<string, any>) {
    return request<any>(`/api/governance/compliance-propagation/governance-document/${id}/${queryString(params)}`);
  },

  async searchInternalControls(search = "", params?: Record<string, any>) {
    const { include_migrated: includeMigrated, ...requestParams } = params || {};
    const options = await searchEndpoint("/api/governance/internal-controls/", { search, is_active: true, page_size: 50, ...requestParams }, (item) =>
      optionFromItem(
        item,
        internalControlLabel(item.code, item.title),
        item.description || item.objective,
        item.control_domain || item.criticality
      )
    );
    if (includeMigrated || requestParams.source) return options;
    return options.filter((option) => option.raw?.source !== "migrated");
  },

  searchFrameworks(search = "") {
    return searchEndpoint("/api/governance/frameworks/", { search, page_size: 20 }, (item) =>
      optionFromItem(item, joinLabel([item.code, item.name]), item.description, item.version || item.slug)
    );
  },

  searchFrameworkControls(search = "", frameworkId?: string) {
    return searchEndpoint(
      "/api/governance/framework-controls/",
      { search, framework: frameworkId, page_size: 20 },
      (item) => optionFromItem(
        item,
        externalControlLabel(item.framework_code || item.framework_name, item.code, item.title),
        item.description,
        item.status
      )
    );
  },

  searchMechanisms(search = "") {
    return searchEndpoint("/api/governance/mechanisms/", { search, page_size: 20 }, (item) =>
      optionFromItem(item, joinLabel([item.title || item.name]), item.description, item.mechanism_type)
    );
  },

  listMechanisms(params?: Record<string, any>) {
    return request<PaginatedResponse<any> | any[]>(`/api/governance/mechanisms/${queryString(params)}`);
  },

  getMechanism(id: string) {
    return request<any>(`/api/governance/mechanisms/${id}/`);
  },

  createMechanism(data: Record<string, any>) {
    return request<any>("/api/governance/mechanisms/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateMechanism(id: string, data: Record<string, any>) {
    return request<any>(`/api/governance/mechanisms/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  createInternalControlMechanism(data: Record<string, any>) {
    return mappingReviewApi.createMapping("internal_control_mechanism", data);
  },

  createInternalControlFrameworkMapping(data: Record<string, any>) {
    return mappingReviewApi.createMapping("internal_control_framework_mapping", data);
  },

  getMechanismTraceability(id: string, params?: TraceabilityOptions) {
    return mappingReviewApi.getTraceability("mechanism", id, params);
  },

  getMechanismComplianceScore(id: string, params?: Record<string, any>) {
    return request<any>(`/api/governance/compliance-propagation/mechanism/${id}/${queryString(params)}`);
  },

  getFrameworkTraceability(id: string, params?: TraceabilityOptions) {
    return mappingReviewApi.getTraceability("framework", id, params);
  },

  getFrameworkControlTraceability(id: string, params?: TraceabilityOptions) {
    return mappingReviewApi.getTraceability("framework_control", id, params);
  },

  getMechanismEvidence(id: string) {
    return request<any[]>(`/api/governance/mechanisms/${id}/evidence/`);
  },

  getMechanismEvidenceRequirements(id: string, params?: Record<string, any>) {
    return request<any[]>(
      `/api/governance/mechanism-evidence-requirements/suggest/${queryString({ ...params, mechanism: id })}`
    );
  },

  listMechanismEvidenceRequirements(params?: Record<string, any>) {
    return request<PaginatedResponse<any> | any[]>(
      `/api/governance/mechanism-evidence-requirements/${queryString(params)}`
    );
  },

  createMechanismEvidenceRequirement(data: Record<string, any>) {
    return request<any>("/api/governance/mechanism-evidence-requirements/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateMechanismEvidenceRequirement(id: string, data: Record<string, any>) {
    return request<any>(`/api/governance/mechanism-evidence-requirements/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getMechanismInternalControls(id: string) {
    return request<any[]>(`/api/governance/mechanisms/${id}/internal-controls/`);
  },

  searchEvidenceItems(search = "") {
    return searchEndpoint("/api/governance/evidence-items/", { search, is_active: true, page_size: 20 }, (item) =>
      optionFromItem(item, joinLabel([item.title]), item.description || item.external_reference, item.evidence_type || item.status)
    );
  },

  listEvidenceItems(params?: Record<string, any>) {
    return request<PaginatedResponse<any> | any[]>(`/api/governance/evidence-items/${queryString(params)}`);
  },

  getMechanismEvidenceOverview(params?: Record<string, any>) {
    return request<any>(`/api/governance/evidence/mechanism-overview/${queryString(params)}`);
  },

  getEvidenceItem(id: string) {
    return request<any>(`/api/governance/evidence-items/${id}/`);
  },

  createEvidenceItem(data: Record<string, any> | FormData) {
    const hasFormDataBody = typeof FormData !== "undefined" && data instanceof FormData;
    return request<any>("/api/governance/evidence-items/", {
      method: "POST",
      body: hasFormDataBody ? data : JSON.stringify(data),
    });
  },

  updateEvidenceItem(id: string, data: Record<string, any>) {
    return request<any>(`/api/governance/evidence-items/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getEvidenceItemLinks(id: string) {
    return request<any[]>(`/api/governance/evidence-items/${id}/links/`);
  },

  getEvidenceItemImpact(id: string) {
    return request<any>(`/api/governance/evidence-items/${id}/impact/`);
  },

  getEvidenceItemTraceability(id: string, params?: TraceabilityOptions) {
    return mappingReviewApi.getTraceability("evidence_item", id, params);
  },

  approveEvidenceLink(id: string) {
    return mappingReviewApi.approveMapping("evidence_link", id);
  },

  rejectEvidenceLink(id: string, rationale: string) {
    return mappingReviewApi.rejectMapping("evidence_link", id, rationale);
  },

  markEvidenceLinkDeprecated(id: string) {
    return mappingReviewApi.deprecateMapping("evidence_link", id);
  },

  searchRunbookSteps(search = "") {
    return searchEndpoint("/api/governance/runbook-steps/", { search, page_size: 20 }, (item) =>
      optionFromItem(
        item,
        joinLabel([item.runbook_title, item.step_number ? `Step ${item.step_number}` : "", item.title]),
        item.description || item.expected_output,
        item.evidence_required ? "Evidência obrigatória" : "Sem evidência obrigatória"
      )
    );
  },

  createGovernanceDocument(data: Record<string, any>) {
    return request<any>("/api/governance/governance-documents/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  createGovernanceDocumentControl(data: Record<string, any>) {
    return mappingReviewApi.createMapping("governance_document_control", data);
  },

  createRunbookStep(data: Record<string, any>) {
    return request<any>("/api/governance/runbook-steps/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  createEvidenceLink(data: Record<string, any>) {
    return mappingReviewApi.createMapping("evidence_link", data);
  },

  searchRisks(search = "") {
    return searchEndpoint("/api/risk/risks/", { search, page_size: 20 }, (item) =>
      optionFromItem(
        item,
        joinLabel([item.asset_name || item.asset?.name || "Risk", item.risk_level || item.risk_score]),
        item.ai_explanation || item.description,
        item.status
      )
    );
  },

  searchAssets(search = "") {
    return searchEndpoint("/api/risk/assets/", { search, page_size: 20 }, (item) =>
      optionFromItem(item, joinLabel([item.name]), item.description || item.business_process, item.criticality || item.status)
    );
  },

  searchVulnerabilities(search = "") {
    return searchEndpoint("/api/risk/vulnerabilities/", { search, page_size: 20 }, (item) =>
      optionFromItem(item, joinLabel([item.cve_id, item.title]), item.description, item.severity)
    );
  },

  searchFindings(search = "") {
    return searchEndpoint("/api/governance/assessment-findings/", { search, page_size: 20 }, (item) =>
      optionFromItem(item, joinLabel([item.title || item.reference]), item.description, item.severity || item.status)
    );
  },

  searchImprovementActions(search = "") {
    return searchEndpoint("/api/governance/improvement-actions/", { search, page_size: 20 }, (item) =>
      optionFromItem(item, joinLabel([item.title]), item.plan, item.owner || item.status)
    );
  },

  createPolicyInternalControl(data: Record<string, any>) {
    return mappingReviewApi.createMapping("policy_internal_control", data);
  },

  getInternalControlTraceability(id: string, params?: TraceabilityOptions) {
    return mappingReviewApi.getTraceability("internal_control", id, params);
  },

  getPolicyTraceability(id: string, params?: TraceabilityOptions) {
    return mappingReviewApi.getTraceability("policy", id, params);
  },

  getGovernanceDocumentTraceability(id: string, params?: TraceabilityOptions) {
    return mappingReviewApi.getTraceability("governance_document", id, params);
  },

  getCompliancePropagationPreview(data: Record<string, any>) {
    return request<any>("/api/governance/compliance-propagation/preview/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  numberValue,
};
