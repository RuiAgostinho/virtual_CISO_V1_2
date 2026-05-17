import { request } from "./api";

// ---------------------------------------------------------------------------
// TypeScript contracts mirroring backend payloads.
// Source: backend/governance/services/decision_context_builder.py
// ---------------------------------------------------------------------------

export type AssetVulnerabilityStatus =
  | "Open"
  | "In remediation"
  | "Mitigated"
  | "Accepted risk"
  | "False positive"
  | "Resolved";

export type DecisionCode =
  | "accepted"
  | "mitigate"
  | "deferred"
  | "transferred"
  | "converted_to_action";

export interface DimensionScore {
  code: string;
  label: string;
  raw_value: string;
  normalized_score: number;
  weight: number;
  contribution: number;
  source: string;
  explanation: string;
}

export interface MultidimensionalScore {
  occurrence_id: string;
  global_score: number;
  classification_label: string;
  classification_band: string;
  recommended_action: string;
  dimensions: DimensionScore[];
  computed_at: string | null;
  weights_profile: string;
}

export interface OccurrenceAsset {
  id: string;
  name: string;
  criticality: string;
  exposure: number;
  business_value: number;
  dependency_score: number;
  owner: string | null;
  category: string | null;
}

export interface OccurrenceVulnerability {
  id: string;
  cve_id: string;
  severity: string;
  cvss_score: number | null;
  epss_score: number | null;
  is_in_kev: boolean;
  description: string | null;
  mitigation: string | null;
  published_at: string | null;
}

export interface Occurrence {
  id: string;
  status: AssetVulnerabilityStatus;
  first_detected: string | null;
  last_seen: string | null;
  source: string;
  asset: OccurrenceAsset;
  vulnerability: OccurrenceVulnerability;
}

export interface ChainMechanism {
  id: string;
  title: string;
  type: string;
  status: string;
  responsible: string;
  deadline: string | null;
  evidences_count: number;
}

export interface ChainFinding {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "mitigated" | "accepted" | "closed";
  reference: string;
  opened_at: string | null;
}

export interface ChainGap {
  id: string;
  status: "MISSING" | "PARTIAL" | "IMPLEMENTED";
  confidence_score: number | null;
  evidence_count: number;
  framework_code: string | null;
  last_evaluated: string | null;
}

export interface ChainAssessment {
  id: string;
  implementation_status: string;
  maturity_level: number;
  effectiveness: number;
  risk_residual: number;
  assessed_at: string | null;
  assessed_by: string;
  evidence_count: number;
}

export interface ComplianceChainEntry {
  framework: {
    id: string;
    code: string;
    name: string;
    version: string;
  };
  control: {
    id: string;
    code: string;
    title: string;
    is_mandatory: boolean;
    section: string | null;
  };
  assessment: ChainAssessment | null;
  mechanisms: ChainMechanism[];
  findings: ChainFinding[];
  compliance_gaps: ChainGap[];
}

export interface HistoryEvent {
  timestamp: string;
  type: "occurrence_event" | "decision";
  title: string;
  actor: string;
  details: string;
}

export interface AvailableAction {
  code: DecisionCode;
  label: string;
  description: string;
  requires_justification: boolean;
  next_status: AssetVulnerabilityStatus | null;
}

export interface DecisionSource {
  index: number;
  kind: "structured" | "rag";
  ref: string;
  label: string;
  detail: string;
}

export interface AIRecommendation {
  available: boolean;
  text: string;
  unavailable_reason: string | null;
  model_used: string;
  generated_at: string;
  sources: DecisionSource[];
}

export interface DecisionContextResponse {
  occurrence_id: string;
  occurrence: Occurrence;
  score: MultidimensionalScore;
  compliance_chain: ComplianceChainEntry[];
  decision_history: HistoryEvent[];
  available_actions: AvailableAction[];
  ai_recommendation: AIRecommendation | null;
  snapshot_at: string;
}

export interface RegisterDecisionRequest {
  decision_code: DecisionCode;
  justification: string;
  title?: string;
  transfer_to?: string;
  due_date?: string;
}

export interface RegisterDecisionResponse {
  decision_id: string;
  occurrence_id: string;
  decision_code: DecisionCode;
  decided_at: string;
  decided_by: string;
  occurrence_status: AssetVulnerabilityStatus;
  snapshot_at: string;
}

export interface RegisterDecisionError {
  errors: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const decisionApi = {
  getContext: (occurrenceId: string) =>
    request<DecisionContextResponse>(`/api/governance/decision-context/${occurrenceId}/`),

  register: (occurrenceId: string, payload: RegisterDecisionRequest) =>
    request<RegisterDecisionResponse>(
      `/api/governance/decision-context/${occurrenceId}/register/`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  recommend: (occurrenceId: string) =>
    request<AIRecommendation>(
      `/api/governance/decision-context/${occurrenceId}/recommend/`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    ),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildDecisionUrl(occurrenceId: string): string {
  return `/decisions/${occurrenceId}`;
}

export function scoreTone(value: number): "emerald" | "amber" | "orange" | "red" {
  if (value >= 81) return "red";
  if (value >= 61) return "orange";
  if (value >= 41) return "amber";
  return "emerald";
}

export function statusBadgeTone(status: AssetVulnerabilityStatus): string {
  switch (status) {
    case "Open":
      return "bg-red-50 text-red-700 border-red-100";
    case "In remediation":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "Mitigated":
    case "Resolved":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "Accepted risk":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "False positive":
      return "bg-slate-50 text-slate-500 border-slate-100";
    default:
      return "bg-slate-50 text-slate-600 border-slate-100";
  }
}
