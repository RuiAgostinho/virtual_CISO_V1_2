export type Framework = {
  id: number;
  slug: string; // "iso27002" | "nist" | etc
  name: string; // "ISO 27002" | "NIST CSF"
  version?: string;
};

export type ControlSource = "SYSTEM" | "CUSTOM";
export type ControlStatus = "ACTIVE" | "ARCHIVED";

export type Control = {
  id: number;
  framework: number; // FK id
  framework_slug?: string; // opcional se API devolver
  framework_name?: string; // opcional se API devolver
  control_id: string; // "5.1" | "PR.AC-01"
  title: string;
  description_short?: string;
  source: ControlSource;
  status: ControlStatus;
  metadata?: Record<string, any>;
  updated_at?: string;
};

const BASE = "/api";

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  // Alguns endpoints podem devolver 204
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const controlsApi = {
  listFrameworks: () => http<Framework[]>(`${BASE}/frameworks/`),

  listControls: (params: { framework?: string; status?: "active" | "archived"; search?: string }) => {
    const qs = new URLSearchParams();
    if (params.framework) qs.set("framework", params.framework);
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    const q = qs.toString();
    return http<Control[]>(`${BASE}/controls/${q ? `?${q}` : ""}`);
  },

  createControl: (payload: {
    framework: number;
    control_id: string;
    title: string;
    description_short?: string;
    metadata?: Record<string, any>;
  }) =>
    http<Control>(`${BASE}/controls/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateControl: (id: number, payload: Partial<Pick<Control, "control_id" | "title" | "description_short" | "metadata">>) =>
    http<Control>(`${BASE}/controls/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  archiveControl: (id: number) =>
    http<void>(`${BASE}/controls/${id}/archive/`, { method: "POST" }),

  restoreControl: (id: number) =>
    http<void>(`${BASE}/controls/${id}/restore/`, { method: "POST" }),
};