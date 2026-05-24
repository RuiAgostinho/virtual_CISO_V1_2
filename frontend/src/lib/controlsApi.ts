import { request } from "./api";

// =====================
// TYPES (UUID friendly)
// =====================

export interface Framework {
  id: string; // UUID
  code: string;
  name: string;
  version?: string | null;
  slug?: string | null;
  publisher?: string | null;
  source_uri?: string | null;
  description?: string | null;
  is_active: boolean;
}

// Se ainda usas "source" no backend, mantém. Se não existir no serializer, remove.
export type ControlSource = "SYSTEM" | "CUSTOM";

// Backend model: Status = "active" | "deprecated"
export type ControlStatus = "active" | "deprecated";

export interface Control {
  id: string; // UUID
  framework: string; // UUID do framework
  framework_name?: string | null;

  // Backend field (ID funcional do controlo)
  code: string;

  title: string;

  // Estes campos existem no model (podem ou não estar no teu serializer final)
  description?: string | null;
  implementation_guidance?: string | null;

  // Campo que queres na UI ("Obrigatório")
  is_mandatory: boolean;

  applicability_scope?: string | null;

  // Se existir no serializer
  source?: ControlSource;

  status: ControlStatus;
}

export interface Mechanism {
  id: string;
  title: string;
  description?: string;
  mechanism_type?: string;
  owner?: string;
  status?: string;
}

export interface MechanismEvidence {
  id: string;
  title?: string | null;
  description?: string | null;
  source_label?: string | null;
  url?: string | null;
  created_at?: string | null;
}

export interface ControlMechanism {
  id: string;
  control: string;
  mechanism: string;
  framework_name?: string;
  control_code?: string;
  control_title?: string;
  mechanism_title?: string;
  mechanism_description?: string;
  mechanism_type?: string;
  status?: string;
  responsible?: string;
  deadline?: string;
  acceptance_criteria?: string;
  evidences?: MechanismEvidence[];
}

export interface EvidenceSuggestion {
  id: string;
  title: string;
  description: string;
  rationale: string;
  source_label: string;
  confidence: number;
  already_attached?: boolean;
  url?: string | null;
}

export interface EvidenceSuggestionResponse {
  control_mechanism?: ControlMechanism;
  suggestions: EvidenceSuggestion[];
}

type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

// Suporta DRF com ou sem paginação
function unwrapList<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

export const controlsApi = {
  async listFrameworks(): Promise<Framework[]> {
    const data = await request<Framework[] | PaginatedResponse<Framework>>(`/api/governance/frameworks/`);
    return unwrapList<Framework>(data);
  },

  async listControls(params?: {
    framework?: string; // slug ou UUID conforme backend
    status?: ControlStatus; // "active" | "deprecated"
    search?: string;
  }): Promise<Control[]> {
    const qs = new URLSearchParams();
    if (params?.framework) qs.set("framework", params.framework);
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);

    const url = `/api/governance/controls/${qs.toString() ? `?${qs.toString()}` : ""}`;
    const data = await request<Control[] | PaginatedResponse<Control>>(url);
    return unwrapList<Control>(data);
  },

  async createControl(payload: {
    framework: string; // UUID
    code: string;
    title: string;
    description?: string;
    implementation_guidance?: string;
    is_mandatory?: boolean;
    applicability_scope?: string;
    status?: ControlStatus; // opcional; default "active" no backend
  }): Promise<Control> {
    return await request<Control>(`/api/governance/controls/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateControl(
    id: string,
    payload: Partial<{
      code: string;
      title: string;
      description?: string;
      implementation_guidance?: string;
      is_mandatory?: boolean;
      applicability_scope?: string;
      status?: ControlStatus;
    }>
  ): Promise<Control> {
    return await request<Control>(`/api/governance/controls/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  // Se os teus endpoints archive/restore ainda existirem, mantém.
  // Caso contrário, podes arquivar/restaurar via updateControl({status: ...})
  async archiveControl(id: string): Promise<void> {
    await request<void>(`/api/governance/controls/${id}/archive/`, { method: "POST" });
  },

  async restoreControl(id: string): Promise<void> {
    await request<void>(`/api/governance/controls/${id}/restore/`, { method: "POST" });
  },

  async listMechanisms(params?: { search?: string; type?: string; page_size?: number }): Promise<Mechanism[]> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.type) qs.set("type", params.type);
    if (params?.page_size) qs.set("page_size", String(params.page_size));

    const url = `/api/governance/mechanisms/${qs.toString() ? `?${qs.toString()}` : ""}`;
    const data = await request<Mechanism[] | PaginatedResponse<Mechanism>>(url);
    return unwrapList<Mechanism>(data);
  },

  async listControlMechanisms(params?: {
    control?: string;
    mechanism?: string;
    status?: string;
    page_size?: number;
  }): Promise<ControlMechanism[]> {
    const qs = new URLSearchParams();
    if (params?.control) qs.set("control", params.control);
    if (params?.mechanism) qs.set("mechanism", params.mechanism);
    if (params?.status) qs.set("status", params.status);
    if (params?.page_size) qs.set("page_size", String(params.page_size));

    const url = `/api/governance/control-mechanisms/${qs.toString() ? `?${qs.toString()}` : ""}`;
    const data = await request<ControlMechanism[] | PaginatedResponse<ControlMechanism>>(url);
    return unwrapList<ControlMechanism>(data);
  },

  async updateControlMechanism(
    id: string,
    payload: Partial<{
      status: string | null;
      responsible: string | null;
      deadline: string | null;
      acceptance_criteria: string | null;
    }>
  ): Promise<ControlMechanism> {
    return await request<ControlMechanism>(`/api/governance/control-mechanisms/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async addMechanismEvidence(
    controlMechanismId: string,
    payload: Partial<MechanismEvidence>
  ): Promise<MechanismEvidence> {
    return await request<MechanismEvidence>(
      `/api/governance/control-mechanisms/${controlMechanismId}/evidences/`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  },

  async getEvidenceSuggestions(controlMechanismId: string): Promise<EvidenceSuggestionResponse> {
    return await request<EvidenceSuggestionResponse>(
      `/api/governance/control-mechanisms/${controlMechanismId}/evidence-suggestions/`
    );
  },

  async applyEvidenceSuggestion(controlMechanismId: string, suggestionId: string): Promise<MechanismEvidence> {
    return await request<MechanismEvidence>(
      `/api/governance/control-mechanisms/${controlMechanismId}/apply-evidence-suggestion/`,
      {
        method: "POST",
        body: JSON.stringify({ suggestion_id: suggestionId }),
      }
    );
  },
};
