import { request } from "./api";

export type OrganizationType = "Public" | "Private" | "ThirdSector";
export type RiskAppetite = "conservative" | "balanced" | "tolerant";
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;
export type ListResponse<T> = T[] | {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

export interface OnboardingAction {
  id: string;
  title: string;
  detail: string;
  path: string;
  priority: "high" | "medium" | "low";
}

export interface CompanyProfile {
  id?: string;
  legal_name?: string | null;
  org_type?: OrganizationType | null;
  sector?: string | null;
  employee_count?: number | null;
  city?: string | null;
  country?: string | null;
  tax_id?: string | null;
  website?: string | null;
  main_email?: string | null;
  main_phone?: string | null;
  geographic_scope?: string | null;
  critical_services?: string | null;
  mission?: string | null;
  vision?: string | null;
  strategic_objectives?: string | null;
  security_objectives?: string | null;
  primary_security_goals?: string[];
  preferred_frameworks?: string[];
  risk_appetite?: RiskAppetite | null;
  notes?: string | null;
  onboarding_answers?: Record<string, unknown>;
  onboarding_recommended_actions?: OnboardingAction[];
  institutional_onboarding_required?: boolean;
  onboarding_completed_at?: string | null;
}

export interface OrgUnit {
  id: string;
  name: string;
  description?: string;
  unit_type?: string;
  unit_type_display?: string;
  parent?: string | null;
  parent_name?: string | null;
  manager?: string | null;
  manager_name?: string | null;
  is_security_relevant?: boolean;
  security_relevance?: string;
  critical_services?: string;
  people_count?: number;
}

export interface Person {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  governance_role?: string;
  governance_role_display?: string;
  is_security_contact?: boolean;
  responsibilities?: string;
  org_unit?: string | null;
  org_unit_name?: string | null;
  backup_for?: string | null;
  backup_for_name?: string | null;
}

function withQuery(path: string, params?: QueryParams) {
  if (!params) return path;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export const companyApi = {
  async getProfile(): Promise<CompanyProfile> {
    return await request<CompanyProfile>("/api/company/profile/");
  },

  async updateProfile(payload: Partial<CompanyProfile>): Promise<CompanyProfile> {
    return await request<CompanyProfile>("/api/company/profile/", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  listPeople: (params?: QueryParams) => request<ListResponse<Person>>(withQuery("/api/company/people/", params)),

  createPerson: (payload: Partial<Person>) =>
    request<Person>("/api/company/people/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updatePerson: (id: string, payload: Partial<Person>) =>
    request<Person>(`/api/company/people/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listOrgUnits: (params?: QueryParams) => request<ListResponse<OrgUnit>>(withQuery("/api/company/org-units/", params)),

  createOrgUnit: (payload: Partial<OrgUnit>) =>
    request<OrgUnit>("/api/company/org-units/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateOrgUnit: (id: string, payload: Partial<OrgUnit>) =>
    request<OrgUnit>(`/api/company/org-units/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
