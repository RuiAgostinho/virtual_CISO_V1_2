import { request } from "./api";

export type OrganizationType = "Public" | "Private" | "ThirdSector";
export type RiskAppetite = "conservative" | "balanced" | "tolerant";

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
  critical_services?: string | null;
  security_objectives?: string | null;
  primary_security_goals?: string[];
  preferred_frameworks?: string[];
  risk_appetite?: RiskAppetite | null;
  onboarding_answers?: Record<string, any>;
  onboarding_recommended_actions?: OnboardingAction[];
  onboarding_completed_at?: string | null;
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
};
