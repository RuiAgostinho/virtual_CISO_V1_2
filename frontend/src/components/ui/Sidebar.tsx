import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { riskApi } from "@/lib/riskApi";
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
  Database,
  FileCheck,
  FileText,
  History,
  LayoutDashboard,
  MoreHorizontal,
  Network,
  Plug,
  Rocket,
  Scale,
  Search,
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
  badge?: string;       // small label, e.g. "Em breve"
  disabled?: boolean;   // renders as non-clickable
  accent?: boolean;     // visual emphasis (Mecanismos — destaque central da tese)
  header?: boolean;     // renders as a non-interactive section label, not a link
}

export interface NavGroup {
  title: string;
  icon: React.ElementType;
  roles?: Role[];
  items: NavItem[];
}

export const sidebarData: NavGroup[] = [
  // 1. Painel — overview e decisão diária.
  {
    title: "Painel",
    icon: Rocket,
    items: [
      { title: "Dashboard executivo", path: "/mission-control?mode=executive", icon: LayoutDashboard },
      { title: "Painel operacional", path: "/mission-control?mode=operational", icon: Activity },
      { title: "Configuração inicial", path: "/onboarding", icon: Rocket },
    ],
  },
  // 2. Risco e Ativos — junta gestão de ativos + gestão de risco (resolve a fragmentação 2.10.1).
  // Dividido visualmente em "Ativos" e "Risco" com cabeçalhos de secção, sem aumentar a profundidade.
  {
    title: "Risco e Ativos",
    icon: ShieldAlert,
    items: [
      { title: "Ativos", header: true },
      { title: "Inventário de ativos", path: "/assets/inventory", icon: Database }, // categorias injetadas dinamicamente
      { title: "Classificação de ativos", path: "/assets/classification", icon: Target },
      { title: "Modelo de classificação", path: "/assets/model", icon: Sliders },
      {
        title: "Redes e descoberta",
        icon: Network,
        children: [
          { title: "Redes", path: "/networks" },
          { title: "Mapa de rede", path: "/networks/map" },
          { title: "Scanner de Descoberta", path: "/assets/discovery" },
        ],
      },
      { title: "Risco", header: true },
      { title: "Dashboard de risco", path: "/risks/dashboard", icon: LayoutDashboard },
      { title: "Inventário de riscos", path: "/risks/inventory", icon: AlertTriangle },
      { title: "Priorização contextual", path: "/risks/prioritization", icon: Target },
      { title: "Vulnerabilidades", path: "/vulnerabilities", icon: ShieldAlert },
    ],
  },
  // 3. Conformidade — Mecanismos com destaque (contribuição central da tese).
  {
    title: "Conformidade",
    icon: ClipboardCheck,
    items: [
      {
        title: "Frameworks",
        icon: Book,
        children: [
          { title: "ISO/IEC 27001", path: "/compliance?fw=iso27001" },
          { title: "NIST CSF", path: "/compliance?fw=nist" },
          { title: "NIS2 / DL 125/2025", path: "/compliance?fw=nis2" },
          { title: "QNCS", path: "/compliance?fw=qncs" },
        ],
      },
      { title: "Controlos", path: "/controls", icon: CheckCircle },
      { title: "Mecanismos de implementação", path: "/governance/mechanisms", icon: Wrench, accent: true },
      { title: "Mapeamento", path: "/compliance-mapping", icon: Network },
      { title: "Avaliações", path: "/maturity", icon: FileCheck },
      { title: "Compliance gaps / Findings", path: "/compliance-gaps", icon: TrendingDown },
    ],
  },
  // 4. Governação — orientação estratégica.
  {
    title: "Governação",
    icon: Scale,
    items: [
      { title: "Dashboard de governação", path: "/governance", icon: LayoutDashboard },
      { title: "Wizard de governance", path: "/governance/wizard", icon: ClipboardCheck, accent: true },
      {
        title: "Contexto organizacional",
        icon: Building2,
        children: [
          { title: "Dados da organização", path: "/governance/organization" },
          { title: "Organograma e responsabilidades", path: "/governance/responsibilities" },
          { title: "Missão e objetivos", path: "/governance/mission" },
          { title: "Partes interessadas", path: "/governance/stakeholders" },
        ],
      },
      { title: "Contexto regulatório", path: "/governance/regulatory", icon: Scale },
      { title: "Políticas", path: "/governance/policies", icon: FileText },
      { title: "Regulamentos técnicos", path: "/governance/technical-regulations", icon: BookOpen },
      { title: "Procedimentos", path: "/governance/procedures", icon: ClipboardCheck },
    ],
  },
  // 5. IA do Virtual CISO — placeholders antecipam o ecrã de Decisão.
  {
    title: "IA do Virtual CISO",
    icon: Brain,
    items: [
      { title: "Assistente", path: "/ciso-assistant", icon: Bot },
      { title: "Histórico de recomendações", path: "/recommendation-history", icon: History },
      { title: "Decisões registadas", path: "/decision-records", icon: FileCheck },
    ],
  },
  // 6. Mais — Integrações + Administração (uso esporádico).
  {
    title: "Mais",
    icon: MoreHorizontal,
    items: [
      {
        title: "Integrações",
        icon: Blocks,
        children: [
          { title: "SIEM (Wazuh)", path: "/admin/integrations/wazuh" },
          { title: "NIST NVD", path: "/admin/integrations/nist" },
          { title: "EPSS", path: "/admin/integrations/epss" },
          { title: "Nmap", path: "/admin/integrations/nmap" },
          { title: "Sincronizações", path: "/admin/integrations" },
        ],
      },
      {
        title: "Administração",
        icon: Settings,
        roles: ["admin"],
        children: [
          { title: "Utilizadores", path: "/admin/users" },
          { title: "Perfis e permissões", path: "/admin/roles" },
          { title: "RAG / Base de Conhecimento", path: "/admin/rag" },
          { title: "Configurações", path: "/admin/settings" },
          { title: "Logs de auditoria", path: "/admin/logs" },
        ],
      },
    ],
  },
];

const isNavItemActive = (item: NavItem, currentUrl: string) => {
  if (!item.path) return false;
  const [currentPath] = currentUrl.split("?");
  if (item.path.includes("?")) return currentUrl === item.path;
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
            ? "bg-indigo-50/60 text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-50"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {Icon && (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            active
              ? "bg-white/15 text-white"
              : item.accent
                ? "bg-white text-indigo-700 ring-1 ring-indigo-200"
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
            ? "bg-slate-950 text-white shadow-sm"
            : isOpen
            ? "bg-slate-100 text-slate-950"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white/15 text-white" : isOpen ? "bg-white text-indigo-700 shadow-sm" : "bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-slate-900"}`}>
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

export const Sidebar: React.FC<SidebarProps> = ({ userRole = "ciso", className = "", open: _open = false, onClose: _onClose }) => {
  const location = useLocation();
  const [categories, setCategories] = useState<any[]>([]);
  const currentUrl = `${location.pathname}${location.search}`;

  useEffect(() => {
    riskApi.listAssetCategories()
      .then(res => {
        const data = Array.isArray(res) ? res : res.results || [];
        setCategories(data);
      })
      .catch((err) => console.error("Erro ao carregar categorias na sidebar:", err));
  }, []);

  const filteredData = useMemo(() => {
    return sidebarData
      .filter((group) => !group.roles || group.roles.includes(userRole))
      .map((group) => {
        if (group.title !== "Risco e Ativos") return group;

        return {
          ...group,
          items: group.items.map((item) => {
            if (item.title !== "Inventário de ativos") return item;

            return {
              ...item,
              path: undefined,
              children: [
                { title: "Geral", path: "/assets/inventory" },
                ...categories.map((cat) => ({
                  title: cat.name,
                  path: cat.name === "Software" || cat.name === "Software Inventory"
                    ? "/assets/software"
                    : `/assets/inventory?category=${cat.id}`,
                })),
              ],
            };
          }),
        };
      });
  }, [userRole, categories]);

  const activeGroupIndex = filteredData.findIndex((group) => isGroupActive(group, currentUrl));
  const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeGroupIndex >= 0) setOpenGroupIndex(activeGroupIndex);
  }, [activeGroupIndex]);

  return (
    <aside
      className={`sticky top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm lg:flex ${className}`}
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
  );
};

export default Sidebar;
