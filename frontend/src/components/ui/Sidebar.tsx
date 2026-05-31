/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Blocks,
  Book,
  BookOpen,
  Bot,
  Brain,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileCheck,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  Network,
  Rocket,
  Scale,
  Settings,
  ShieldAlert,
  Sliders,
  Target,
  TrendingDown,
  Wrench,
} from "lucide-react";

export type Role = "admin" | "user" | "ciso";

export interface NavItem {
  title: string;
  path?: string;
  icon?: React.ElementType;
  roles?: Role[];
  children?: NavItem[];
  badge?: string;
  disabled?: boolean;
  accent?: boolean;
  header?: boolean;
  exact?: boolean;
}

export interface NavGroup {
  title: string;
  icon: React.ElementType;
  roles?: Role[];
  items: NavItem[];
}

export const sidebarData: NavGroup[] = [
  {
    title: "Painel",
    icon: Rocket,
    items: [
      { title: "Mission Control", path: "/mission-control?mode=program", icon: LayoutDashboard, accent: true },
      { title: "Configuração inicial", path: "/onboarding", icon: Rocket },
    ],
  },
  {
    title: "Dados da Organização",
    icon: Building2,
    items: [
      { title: "Perfil institucional", path: "/admin/institution", icon: Building2 },
      { title: "Contexto organizacional", path: "/governance/organization", icon: Building2 },
      { title: "Responsabilidades", path: "/governance/responsibilities", icon: ClipboardCheck },
      { title: "Missão e objetivos", path: "/governance/mission", icon: Target },
      { title: "Stakeholders", path: "/governance/stakeholders", icon: Network },
      { title: "Localizações", path: "/assets/locations", icon: Network },
      { title: "Contexto regulatório", path: "/governance/regulatory", icon: Scale },
    ],
  },
  {
    title: "Ativos",
    icon: Database,
    items: [
      { title: "Entrada de ativos", path: "/assets/onboarding", icon: ClipboardCheck, accent: true },
      { title: "Inventário de ativos", path: "/assets/inventory", icon: Database },
      { title: "Modelo de classificação", path: "/assets/model", icon: Sliders },
      { title: "Software instalado", path: "/assets/software", icon: Database },
      { title: "Ambientes", path: "/assets/environments", icon: Blocks },
      { title: "Infraestruturas", path: "/assets/infrastructures", icon: Network },
      {
        title: "Descoberta e redes",
        icon: Network,
        children: [
          { title: "Redes", path: "/networks" },
          { title: "Mapa de rede", path: "/networks/map" },
          { title: "Scanner de descoberta", path: "/assets/discovery" },
        ],
      },
    ],
  },
  {
    title: "Gestão de Risco",
    icon: ShieldAlert,
    items: [
      { title: "Prioridade de risco", path: "/risks/dashboard", icon: LayoutDashboard },
      { title: "Registo de riscos", path: "/risks/inventory", icon: AlertTriangle },
      { title: "Matriz de risco", path: "/risks/matrix", icon: Sliders },
      { title: "Priorização contextual", path: "/risks/prioritization", icon: Target },
      { title: "Vulnerabilidades", path: "/vulnerabilities", icon: ShieldAlert },
      { title: "Aceitação de risco", path: "/governance/exceptions", icon: ShieldAlert },
    ],
  },
  {
    title: "Governação",
    icon: Scale,
    items: [
      { title: "Políticas", path: "/governance/policies", icon: FileText, accent: true },
      { title: "Tarefas", path: "/governance/tasks", icon: ClipboardList },
      { title: "Decisões", path: "/decision-records", icon: FileCheck },
      { title: "Plano de ações", path: "/governance/action-plan", icon: ClipboardCheck },
      {
        title: "Criar políticas",
        icon: ClipboardCheck,
        children: [
          { title: "Criar política", path: "/governance/policies/wizard" },
          { title: "Gerar políticas base", path: "/governance/wizard" },
        ],
      },
      { title: "Regulamentos técnicos", path: "/governance/technical-regulations", icon: BookOpen },
      { title: "Procedimentos", path: "/governance/procedures", icon: ClipboardCheck },
    ],
  },
  {
    title: "Compliance",
    icon: ClipboardCheck,
    items: [
      { title: "Frameworks e postura", path: "/catalogs/frameworks", icon: Book, accent: true },
      { title: "Rastreabilidade", path: "/governance/traceability", icon: GitBranch },
      { title: "Score multi-framework", path: "/compliance-mapping", icon: Target },
      { title: "Avaliações de controlos", path: "/maturity", icon: FileCheck },
      { title: "Gaps / findings", path: "/compliance-gaps", icon: TrendingDown },
      { title: "Drift de conformidade", path: "/governance/drift", icon: TrendingDown },
    ],
  },
  {
    title: "Catálogos e Mappings",
    icon: GitBranch,
    items: [
      { title: "Controlos externos", path: "/controls", icon: CheckCircle },
      { title: "Mecanismos", path: "/governance/mechanisms", icon: Wrench },
      { title: "Evidências", path: "/governance/evidence", icon: FileCheck },
      { title: "Documentos", path: "/governance/documents", icon: BookOpen },
      { title: "Risco residual", path: "/governance/residual-risk-mappings", icon: ShieldAlert },
      { title: "Revisão de mapeamentos", path: "/governance/mapping-review", icon: GitBranch, accent: true },
      { title: "Mapear frameworks", path: "/governance/framework-mapping/wizard", icon: Network },
      {
        title: "Criar catálogo",
        icon: ClipboardCheck,
        children: [
          { title: "Criar mecanismo", path: "/governance/mechanisms/wizard" },
          { title: "Criar evidência", path: "/governance/evidence/wizard" },
          { title: "Criar documento", path: "/governance/documents/wizard" },
        ],
      },
    ],
  },
  {
    title: "IA do Virtual CISO",
    icon: Brain,
    items: [
      { title: "Assistente CISO", path: "/ciso-assistant", icon: Bot, accent: true },
      { title: "Histórico de recomendações", path: "/recommendation-history", icon: History },
      { title: "Avaliação da dissertação", path: "/governance/evaluation", icon: Activity },
    ],
  },
  {
    title: "Integrações",
    icon: Blocks,
    items: [
      { title: "SIEM / Wazuh", path: "/admin/integrations/wazuh", icon: Blocks },
      { title: "NIST NVD", path: "/admin/integrations/nist", icon: Database },
      { title: "EPSS", path: "/admin/integrations/epss", icon: TrendingDown },
      { title: "Nmap", path: "/admin/integrations/nmap", icon: Network },
    ],
  },
  {
    title: "Administração",
    icon: Settings,
    items: [
      { title: "Utilizadores", path: "/admin/users", icon: Settings },
      { title: "Perfis e permissões", path: "/admin/roles", icon: ShieldAlert },
      { title: "Parâmetros da plataforma", path: "/admin/settings", icon: Sliders },
      { title: "Tipos de ativo", path: "/admin/asset-types", icon: Database },
      { title: "RAG / Base de Conhecimento", path: "/admin/rag", icon: Brain },
      { title: "Logs de auditoria", path: "/admin/logs", icon: FileCheck },
    ],
  },
];

const isNavItemActive = (item: NavItem, currentUrl: string) => {
  if (!item.path) return false;
  const [currentPath] = currentUrl.split("?");
  if (item.path.includes("?")) return currentUrl === item.path;
  if (item.exact) return currentUrl === item.path;
  return currentPath === item.path || currentPath.startsWith(`${item.path}/`);
};

const hasActiveDescendant = (item: NavItem, currentUrl: string): boolean => {
  return !!item.children?.some((child) => isNavItemActive(child, currentUrl) || hasActiveDescendant(child, currentUrl));
};

const isGroupActive = (group: NavGroup, currentUrl: string) => {
  return group.items.some((item) => isNavItemActive(item, currentUrl) || hasActiveDescendant(item, currentUrl));
};

const SidebarSubItem: React.FC<{ item: NavItem; currentUrl: string }> = ({ item, currentUrl }) => {
  const active = isNavItemActive(item, currentUrl);

  if (item.disabled) {
    return (
      <div
        aria-disabled="true"
        className="group flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-400"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
        <span className="truncate">{item.title}</span>
        {item.badge && (
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
            {item.badge}
          </span>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path || "#"}
      className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-200 ${
        active
          ? "bg-indigo-600 font-bold text-white shadow-sm ring-1 ring-indigo-500/20"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-slate-300 group-hover:bg-slate-500"}`} />
      <span className="truncate">{item.title}</span>
      {item.badge && (
        <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
          {item.badge}
        </span>
      )}
    </NavLink>
  );
};

const SidebarItem: React.FC<{
  item: NavItem;
  currentUrl: string;
  isOpen?: boolean;
  onToggle?: () => void;
}> = ({ item, currentUrl, isOpen = false, onToggle }) => {
  if (item.header) {
    return (
      <div className="border-t border-slate-100 px-2.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 first:border-t-0 first:pt-1">
        {item.title}
      </div>
    );
  }

  const hasActiveChild = hasActiveDescendant(item, currentUrl);
  const active = isNavItemActive(item, currentUrl);
  const highlighted = active || hasActiveChild;
  const Icon = item.icon;

  if (item.children) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-all duration-200 ${
            highlighted
              ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon && (
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${highlighted ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="truncate font-bold">{item.title}</span>
          </span>
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
          )}
        </button>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="ml-4 mt-1.5 flex flex-col space-y-1 border-l border-slate-200 pl-2">
            {item.children.map((child, idx) => (
              <SidebarSubItem key={idx} item={child} currentUrl={currentUrl} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (item.disabled) {
    return (
      <div
        aria-disabled="true"
        className="group relative flex w-full cursor-not-allowed items-center gap-2 rounded-xl px-2.5 py-2 text-xs text-slate-400"
      >
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="truncate font-semibold">{item.title}</span>
        {item.badge && (
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
            {item.badge}
          </span>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path || "#"}
      className={`group relative flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-all duration-200 ${
        active
          ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/20"
          : item.accent
            ? "text-indigo-700 hover:bg-indigo-50"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {Icon && (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            active
              ? "bg-white/15 text-white"
              : item.accent
                ? "bg-indigo-50 text-indigo-700"
                : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-900"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="truncate font-bold">{item.title}</span>
      {item.badge && (
        <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
          {item.badge}
        </span>
      )}
    </NavLink>
  );
};

const SidebarGroup: React.FC<{
  group: NavGroup;
  currentUrl: string;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ group, currentUrl, isOpen, onToggle }) => {
  const active = isGroupActive(group, currentUrl);
  const activeDropdownIndex = group.items.findIndex((item) => hasActiveDescendant(item, currentUrl));
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(activeDropdownIndex >= 0 ? activeDropdownIndex : null);
  const Icon = group.icon;

  useEffect(() => {
    if (isOpen && activeDropdownIndex >= 0) setOpenItemIndex(activeDropdownIndex);
  }, [activeDropdownIndex, isOpen]);

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 transition-all duration-200 ${
          active
            ? "bg-slate-100 text-slate-950 ring-1 ring-slate-200"
            : isOpen
              ? "bg-slate-100 text-slate-950"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white text-indigo-700 shadow-sm" : isOpen ? "bg-white text-indigo-700 shadow-sm" : "bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-slate-900"}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-xs font-bold tracking-tight">{group.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 opacity-60 transition-transform" />
          )}
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="ml-3 mt-1.5 flex flex-col space-y-1 border-l border-slate-200 pl-2 pr-0.5">
          {group.items.map((item, idx) => (
            <SidebarItem
              key={idx}
              item={item}
              currentUrl={currentUrl}
              isOpen={openItemIndex === idx}
              onToggle={() => setOpenItemIndex((current) => (current === idx ? null : idx))}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export interface SidebarProps {
  userRole?: Role;
  className?: string;
  open?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ userRole = "ciso", className = "", open = false, onClose }) => {
  const location = useLocation();
  const currentUrl = `${location.pathname}${location.search}`;

  const filteredData = useMemo(() => {
    return sidebarData.filter((group) => !group.roles || group.roles.includes(userRole));
  }, [userRole]);

  const activeGroupIndex = filteredData.findIndex((group) => isGroupActive(group, currentUrl));
  const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeGroupIndex >= 0) setOpenGroupIndex(activeGroupIndex);
  }, [activeGroupIndex]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="fixed inset-x-0 bottom-0 top-16 z-40 bg-slate-950/30 lg:hidden"
        />
      )}
      <aside
        className={`${
          open ? "fixed left-0 top-16 z-50 flex h-[calc(100vh-4rem)] w-72" : "hidden"
        } flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-xl lg:sticky lg:top-16 lg:z-30 lg:flex lg:h-[calc(100vh-4rem)] lg:w-64 lg:shadow-sm ${className}`}
      >
        <div className="flex-1 overflow-y-auto px-2.5 py-3 scrollbar-thin scrollbar-thumb-slate-200">
          <nav className="space-y-1">
            {filteredData.map((group, idx) => (
              <SidebarGroup
                key={group.title}
                group={group}
                currentUrl={currentUrl}
                isOpen={openGroupIndex === idx}
                onToggle={() => setOpenGroupIndex((current) => (current === idx ? null : idx))}
              />
            ))}
          </nav>
        </div>

        <div className="shrink-0 border-t border-slate-100 p-2">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-500/10">
              CISO
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-bold text-slate-900">Workspace</span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{userRole}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
