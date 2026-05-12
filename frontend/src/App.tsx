import React, { Suspense } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";

import AppShell from "@/components/ui/AppShell";

// Lazy Loaded PÃ¡ginas
const MissionControl = React.lazy(() => import("@/pages/MissionControl"));
const Onboarding = React.lazy(() => import("@/pages/Onboarding"));
const Maturity = React.lazy(() => import("@/pages/Maturity"));
const Vulnerabilities = React.lazy(() => import("@/pages/Vulnerabilities"));
const Controls = React.lazy(() => import("@/pages/Controls"));
const FrameworkView = React.lazy(() => import("@/pages/FrameworkView"));
const Institution = React.lazy(() => import("@/pages/admin/Institution"));

const Inventory = React.lazy(() => import("@/pages/assets/Inventory"));
const AssetDetail = React.lazy(() => import("@/pages/assets/AssetDetail"));
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
const OrganizationContext = React.lazy(() => import("@/pages/governance/OrganizationContext"));
const MissionObjectives = React.lazy(() => import("@/pages/governance/MissionObjectives"));
const Stakeholders = React.lazy(() => import("@/pages/governance/Stakeholders"));
const RegulatoryContext = React.lazy(() => import("@/pages/governance/RegulatoryContext"));
const Mechanisms = React.lazy(() => import("@/pages/governance/Mechanisms"));
const Policies = React.lazy(() => import("@/pages/governance/Policies"));
const PolicyDetail = React.lazy(() => import("@/pages/governance/PolicyDetail"));
const PolicyForm = React.lazy(() => import("@/pages/governance/PolicyForm"));
const TechnicalRegulations = React.lazy(() => import("@/pages/governance/TechnicalRegulations"));
const RiskDashboard = React.lazy(() => import("@/pages/risk/RiskDashboard"));
const RiskList = React.lazy(() => import("@/pages/risk/RiskList"));
const RiskDetail = React.lazy(() => import("@/pages/risk/RiskDetail"));
const RiskPrioritization = React.lazy(() => import("@/pages/risk/RiskPrioritization"));
const Procedures = React.lazy(() => import("@/pages/governance/Procedures"));

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-6">A carregarâ€¦</div>;
  if (!user) return <Navigate to="/login" replace />;

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
            <Route path="/" element={<Navigate to="/mission-control?mode=executive" replace />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/mission-control" element={<MissionControl />} />
            <Route path="/maturity" element={<Maturity />} />
            <Route path="/risks" element={<Navigate to="/risks/dashboard" replace />} />
            <Route path="/risks/dashboard" element={<RiskDashboard />} />
            <Route path="/risks/inventory" element={<RiskList />} />
            <Route path="/risks/prioritization" element={<RiskPrioritization />} />
            <Route path="/risks/:id" element={<RiskDetail />} />
            <Route path="/vulnerabilities" element={<Vulnerabilities />} />
            <Route path="/compliance" element={<FrameworkView />} />
            <Route path="/compliance-mapping" element={<ControlMappings />} />
            <Route path="/compliance-gaps" element={<ComplianceGaps />} />
            <Route path="/templates" element={<Navigate to="/controls" replace />} />
            <Route path="/controls" element={<Controls />} />
            <Route path="/assets" element={<Navigate to="/assets/inventory" replace />} />
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
            <Route path="/governance/organization" element={<OrganizationContext />} />
            <Route path="/governance/mission" element={<MissionObjectives />} />
            <Route path="/governance/stakeholders" element={<Stakeholders />} />
            <Route path="/governance/regulatory" element={<RegulatoryContext />} />
            <Route path="/governance/mechanisms" element={<Mechanisms />} />
            <Route path="/governance/policies" element={<Policies />} />
            <Route path="/governance/policies/new" element={<PolicyForm />} />
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
            <Route path="/admin/users" element={<div className="p-6">PÃ¡gina de Utilizadores (Placeholders)</div>} />
            <Route path="/admin/roles" element={<div className="p-6">PÃ¡gina de Roles & Permissions (Placeholders)</div>} />
            <Route path="/admin/asset-types" element={<div className="p-6">PÃ¡gina de Asset Types (Placeholders)</div>} />
            <Route path="/admin/settings" element={<div className="p-6">PÃ¡gina de Settings Gerais (Placeholders)</div>} />
            <Route path="/admin/logs" element={<div className="p-6">PÃ¡gina de System Logs (Placeholders)</div>} />
            <Route path="/admin/institution" element={<Institution />} />

          </Route>

          <Route path="*" element={<Navigate to="/mission-control?mode=executive" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

