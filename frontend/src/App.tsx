import React, { Suspense } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { companyApi } from "@/lib/companyApi";

import AppShell from "@/components/ui/AppShell";

// Lazy Loaded Páginas
const MissionControl = React.lazy(() => import("@/pages/MissionControl"));
const Onboarding = React.lazy(() => import("@/pages/Onboarding"));
const Maturity = React.lazy(() => import("@/pages/Maturity"));
const Vulnerabilities = React.lazy(() => import("@/pages/Vulnerabilities"));
const Controls = React.lazy(() => import("@/pages/Controls"));
const FrameworkView = React.lazy(() => import("@/pages/FrameworkView"));
const FrameworkControlsCatalog = React.lazy(() => import("@/pages/catalogs/FrameworkControlsCatalog"));
const Institution = React.lazy(() => import("@/pages/admin/Institution"));
const AdminUsers = React.lazy(() => import("@/pages/admin/Users"));
const AdminRoles = React.lazy(() => import("@/pages/admin/Roles"));
const AdminAssetTypes = React.lazy(() => import("@/pages/admin/AssetTypes"));
const AdminSettings = React.lazy(() => import("@/pages/admin/Settings"));
const AdminLogs = React.lazy(() => import("@/pages/admin/Logs"));
const AdminRagKnowledgeBase = React.lazy(() => import("@/pages/admin/RagKnowledgeBase"));

const Inventory = React.lazy(() => import("@/pages/assets/Inventory"));
const AssetDetail = React.lazy(() => import("@/pages/assets/AssetDetail"));
const AssetOnboarding = React.lazy(() => import("@/pages/assets/AssetOnboarding"));
const Classification = React.lazy(() => import("@/pages/assets/Classification"));
const ClassificationModel = React.lazy(() => import("@/pages/assets/ClassificationModel"));
const Discovery = React.lazy(() => import("@/pages/assets/Discovery"));
const WazuhIntegration = React.lazy(() => import("@/pages/admin/integrations/Wazuh"));
const EPSSIntegration = React.lazy(() => import("@/pages/admin/integrations/EPSS"));
const NISTIntegration = React.lazy(() => import("@/pages/admin/integrations/NIST"));
const NmapIntegration = React.lazy(() => import("@/pages/NmapSettings"));
const NetworkRanges = React.lazy(() => import("@/pages/NetworkRanges"));
const NetworkMap = React.lazy(() => import("@/pages/NetworkMap"));
const Locations = React.lazy(() => import("@/pages/assets/Locations"));
const Environments = React.lazy(() => import("@/pages/assets/Environments"));
const Infrastructures = React.lazy(() => import("@/pages/assets/Infrastructures"));
const SoftwareInventory = React.lazy(() => import("@/pages/SoftwareInventory"));
const SoftwareDetail = React.lazy(() => import("@/pages/SoftwareDetail"));
const Assistant = React.lazy(() => import("@/pages/Assistant"));
const ComplianceGaps = React.lazy(() => import("@/pages/ComplianceGaps"));
const ControlMappings = React.lazy(() => import("@/pages/ControlMappings"));
const GovernanceDashboard = React.lazy(() => import("@/pages/governance/GovernanceDashboard"));
const GovernanceEvaluation = React.lazy(() => import("@/pages/governance/GovernanceEvaluation"));
const ComplianceDrift = React.lazy(() => import("@/pages/governance/ComplianceDrift"));
const TraceabilityExplorer = React.lazy(() => import("@/pages/governance/TraceabilityExplorer"));
const GovernanceExceptions = React.lazy(() => import("@/pages/governance/GovernanceExceptions"));
const ResidualRiskMappings = React.lazy(() => import("@/pages/governance/ResidualRiskMappings"));
const GovernanceActionPlan = React.lazy(() => import("@/pages/governance/GovernanceActionPlan"));
const GovernanceTasksList = React.lazy(() => import("@/pages/governance/GovernanceTasksList"));
const GovernanceTaskDetail = React.lazy(() => import("@/pages/governance/GovernanceTaskDetail"));
const GovernanceWizard = React.lazy(() => import("@/pages/governance/GovernanceWizard"));
const GovernanceDocumentWizard = React.lazy(() => import("@/pages/governance/GovernanceDocumentWizard"));
const GovernanceDocumentsList = React.lazy(() => import("@/pages/governance/GovernanceDocumentsList"));
const GovernanceDocumentDetail = React.lazy(() => import("@/pages/governance/GovernanceDocumentDetail"));
const OrganizationContext = React.lazy(() => import("@/pages/governance/OrganizationContext"));
const OrgResponsibilities = React.lazy(() => import("@/pages/governance/OrgResponsibilities"));
const MissionObjectives = React.lazy(() => import("@/pages/governance/MissionObjectives"));
const Stakeholders = React.lazy(() => import("@/pages/governance/Stakeholders"));
const RegulatoryContext = React.lazy(() => import("@/pages/governance/RegulatoryContext"));
const MechanismsList = React.lazy(() => import("@/pages/governance/MechanismsList"));
const MechanismDetail = React.lazy(() => import("@/pages/governance/MechanismDetail"));
const MechanismWizard = React.lazy(() => import("@/pages/governance/MechanismWizard"));
const EvidenceWizard = React.lazy(() => import("@/pages/governance/EvidenceWizard"));
const EvidenceItemsList = React.lazy(() => import("@/pages/governance/EvidenceItemsList"));
const EvidenceItemDetail = React.lazy(() => import("@/pages/governance/EvidenceItemDetail"));
const FrameworkMappingWizard = React.lazy(() => import("@/pages/governance/FrameworkMappingWizard"));
const MappingReview = React.lazy(() => import("@/pages/governance/MappingReview"));
const Policies = React.lazy(() => import("@/pages/governance/Policies"));
const PolicyDetail = React.lazy(() => import("@/pages/governance/PolicyDetail"));
const PolicyForm = React.lazy(() => import("@/pages/governance/PolicyForm"));
const PolicyWizard = React.lazy(() => import("@/pages/governance/PolicyWizard"));
const TechnicalRegulations = React.lazy(() => import("@/pages/governance/TechnicalRegulations"));
const RiskDashboard = React.lazy(() => import("@/pages/risk/RiskDashboard"));
const RiskList = React.lazy(() => import("@/pages/risk/RiskList"));
const RiskDetail = React.lazy(() => import("@/pages/risk/RiskDetail"));
const RiskPrioritization = React.lazy(() => import("@/pages/risk/RiskPrioritization"));
const RiskMatrix = React.lazy(() => import("@/pages/risk/RiskMatrix"));
const Procedures = React.lazy(() => import("@/pages/governance/Procedures"));
const DecisionScreen = React.lazy(() => import("@/pages/decision/DecisionScreen"));
const DecisionRecords = React.lazy(() => import("@/pages/decision/DecisionRecords"));
const RecommendationHistory = React.lazy(() => import("@/pages/decision/RecommendationHistory"));

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [onboardingRequired, setOnboardingRequired] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let mounted = true;

    if (!user) {
      setOnboardingRequired(null);
      return () => {
        mounted = false;
      };
    }

    setOnboardingRequired(null);
    companyApi
      .getProfile()
      .then((profile) => {
        if (mounted) setOnboardingRequired(Boolean(profile.institutional_onboarding_required));
      })
      .catch(() => {
        if (mounted) setOnboardingRequired(false);
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ required?: boolean }>).detail;
      setOnboardingRequired(Boolean(detail?.required));
    };

    window.addEventListener("institutional-onboarding-required-changed", handler as EventListener);
    return () => {
      window.removeEventListener("institutional-onboarding-required-changed", handler as EventListener);
    };
  }, []);

  if (loading) return <div className="p-6">A carregar…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (onboardingRequired === null) return <div className="p-6">A preparar contexto institucional…</div>;
  if (onboardingRequired && location.pathname !== "/onboarding" && location.pathname !== "/admin/settings") {
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  return (
    <AppShell>
      <Suspense fallback={
        <div className="flex items-center justify-center p-12 text-slate-500 font-medium">
          A carregar módulo...
        </div>
      }>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Navigate to="/mission-control?mode=program" replace />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/mission-control" element={<MissionControl />} />
            <Route path="/maturity" element={<Maturity />} />
            <Route path="/risks" element={<Navigate to="/risks/dashboard" replace />} />
            <Route path="/risks/dashboard" element={<RiskDashboard />} />
            <Route path="/risks/inventory" element={<RiskList />} />
            <Route path="/risks/prioritization" element={<RiskPrioritization />} />
            <Route path="/risks/matrix" element={<RiskMatrix />} />
            <Route path="/risks/:id" element={<RiskDetail />} />
            <Route path="/decisions/:occurrenceId" element={<DecisionScreen />} />
            <Route path="/decision-records" element={<DecisionRecords />} />
            <Route path="/recommendation-history" element={<RecommendationHistory />} />
            <Route path="/vulnerabilities" element={<Vulnerabilities />} />
            <Route path="/compliance" element={<Navigate to="/catalogs/frameworks" replace />} />
            <Route path="/catalogs/frameworks" element={<FrameworkView />} />
            <Route path="/catalogs/frameworks/:id" element={<FrameworkControlsCatalog />} />
            <Route path="/compliance-mapping" element={<ControlMappings />} />
            <Route path="/compliance-gaps" element={<ComplianceGaps />} />
            <Route path="/templates" element={<Navigate to="/controls" replace />} />
            <Route path="/controls" element={<Controls />} />
            <Route path="/assets" element={<Navigate to="/assets/inventory" replace />} />
            <Route path="/assets/onboarding" element={<AssetOnboarding />} />
            <Route path="/assets/inventory" element={<Inventory />} />
            <Route path="/assets/inventory/:id" element={<AssetDetail />} />
            <Route path="/assets/classification" element={<Classification />} />
            <Route path="/assets/model" element={<ClassificationModel />} />
            <Route path="/assets/discovery" element={<Discovery />} />
            <Route path="/assets/locations" element={<Locations />} />
            <Route path="/assets/environments" element={<Environments />} />
            <Route path="/assets/infrastructures" element={<Infrastructures />} />
            <Route path="/networks/map" element={<NetworkMap />} />
            <Route path="/networks" element={<NetworkRanges />} />
            <Route path="/assets/software" element={<SoftwareInventory />} />
            <Route path="/assets/software/:id" element={<SoftwareDetail />} />
            <Route path="/ciso-assistant" element={<Assistant />} />

            {/* Governance Routes */}
            <Route path="/governance" element={<GovernanceDashboard />} />
            <Route path="/governance/workbench" element={<Navigate to="/mission-control?mode=program" replace />} />
            <Route path="/governance/health" element={<Navigate to="/catalogs/frameworks" replace />} />
            <Route path="/governance/evaluation" element={<GovernanceEvaluation />} />
            <Route path="/governance/drift" element={<ComplianceDrift />} />
            <Route path="/governance/traceability" element={<TraceabilityExplorer />} />
            <Route path="/governance/exceptions" element={<GovernanceExceptions />} />
            <Route path="/governance/residual-risk-mappings" element={<ResidualRiskMappings />} />
            <Route path="/governance/action-plan" element={<GovernanceActionPlan />} />
            <Route path="/governance/tasks" element={<GovernanceTasksList />} />
            <Route path="/governance/tasks/:id" element={<GovernanceTaskDetail />} />
            <Route path="/governance/wizard" element={<GovernanceWizard />} />
            <Route path="/governance/documents/wizard" element={<GovernanceDocumentWizard />} />
            <Route path="/governance/documents" element={<GovernanceDocumentsList />} />
            <Route path="/governance/documents/:id" element={<GovernanceDocumentDetail />} />
            <Route path="/governance/organization" element={<OrganizationContext />} />
            <Route path="/governance/responsibilities" element={<OrgResponsibilities />} />
            <Route path="/governance/mission" element={<MissionObjectives />} />
            <Route path="/governance/stakeholders" element={<Stakeholders />} />
            <Route path="/governance/regulatory" element={<RegulatoryContext />} />
            <Route path="/governance/mechanisms/wizard" element={<MechanismWizard />} />
            <Route path="/governance/evidence/wizard" element={<EvidenceWizard />} />
            <Route path="/governance/evidence" element={<EvidenceItemsList />} />
            <Route path="/governance/evidence/:id" element={<EvidenceItemDetail />} />
            <Route path="/governance/framework-mapping/wizard" element={<FrameworkMappingWizard />} />
            <Route path="/governance/mechanisms" element={<MechanismsList />} />
            <Route path="/governance/mechanisms/:id" element={<MechanismDetail />} />
            <Route path="/governance/mapping-review" element={<MappingReview />} />
            <Route path="/governance/policies" element={<Policies />} />
            <Route path="/governance/policies/wizard" element={<PolicyWizard />} />
            <Route path="/governance/policies/new" element={<Navigate to="/governance/policies/wizard" replace />} />
            <Route path="/governance/policies/:id/edit" element={<PolicyForm />} />
            <Route path="/governance/policies/:id" element={<PolicyDetail />} />
            <Route path="/governance/technical-regulations" element={<TechnicalRegulations />} />

            <Route path="/governance/procedures" element={<Procedures />} />

            {/* Administration Routes */}
            <Route path="/admin" element={<Navigate to="/admin/integrations/wazuh" replace />} />
            <Route path="/admin/integrations" element={<Navigate to="/admin/integrations/wazuh" replace />} />
            <Route path="/admin/integrations/wazuh" element={<WazuhIntegration />} />
            <Route path="/admin/integrations/epss" element={<EPSSIntegration />} />
            <Route path="/admin/integrations/nist" element={<NISTIntegration />} />
            <Route path="/admin/integrations/nmap" element={<NmapIntegration />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/roles" element={<AdminRoles />} />
            <Route path="/admin/asset-types" element={<AdminAssetTypes />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/logs" element={<AdminLogs />} />
            <Route path="/admin/rag" element={<AdminRagKnowledgeBase />} />
            <Route path="/admin/institution" element={<Institution />} />

          </Route>

          <Route path="*" element={<Navigate to="/mission-control?mode=program" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
