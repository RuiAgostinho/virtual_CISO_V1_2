/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileCheck2, FilePlus2, Link2, Pencil, RefreshCw, Save, Search, ShieldCheck, Timer, Workflow, X } from "lucide-react";
import { GovernanceBadge } from "@/components/governance/GovernancePrimitives";
import { mappingReviewApi } from "@/lib/mappingReviewApi";

type EvidenceRecord = Record<string, any>;
type RequirementRecord = Record<string, any>;
type MechanismEvidenceOverviewPayload = Record<string, any>;

const emptyRequirementForm = {
  title: "",
  description: "",
  evidence_type: "report",
  priority: "medium",
  rationale: "",
  mechanism_type: "",
  control_domain: "",
  keywords: "",
  is_active: true,
};

const evidenceTypes = [
  { value: "", label: "Todos os tipos" },
  { value: "report", label: "Relatório" },
  { value: "screenshot", label: "Captura de ecrã" },
  { value: "ticket", label: "Ticket" },
  { value: "log", label: "Log" },
  { value: "audit_report", label: "Relatório de auditoria" },
  { value: "configuration_export", label: "Exportação de configuração" },
  { value: "meeting_minutes", label: "Ata de reunião" },
  { value: "approval_record", label: "Registo de aprovação" },
  { value: "vulnerability_scan", label: "Análise de vulnerabilidades" },
  { value: "siem_alert", label: "Alerta SIEM" },
  { value: "manual_attestation", label: "Declaração manual" },
  { value: "other", label: "Outro" },
];

const statuses = [
  { value: "", label: "Todos os estados" },
  { value: "draft", label: "Rascunho" },
  { value: "pending_review", label: "Pendente de revisão" },
  { value: "valid", label: "Válida" },
  { value: "expired", label: "Expirada" },
  { value: "rejected", label: "Rejeitada" },
  { value: "deprecated", label: "Descontinuada" },
];

const priorities = [
  { value: "", label: "Todas as prioridades" },
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

const requirementScopes = [
  { value: "", label: "Todos os âmbitos" },
  { value: "specific", label: "Ligados a mecanismo" },
  { value: "template", label: "Modelos globais" },
];

const validityFilters = [
  { value: "", label: "Toda a validade" },
  { value: "valid", label: "Válida" },
  { value: "expired", label: "Expirada" },
  { value: "none", label: "Sem validade definida" },
];

const mechanismEvidenceStatuses = [
  { value: "", label: "Todos os mecanismos" },
  { value: "missing_real", label: "Sem evidência real" },
  { value: "missing_valid", label: "Sem evidência válida" },
  { value: "pending_review", label: "Com validação pendente" },
  { value: "expired", label: "Com evidência expirada" },
  { value: "ready", label: "Com evidência válida" },
];

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function evidenceTypeLabel(type?: string) {
  const labels = Object.fromEntries(evidenceTypes.map((item) => [item.value, item.label]));
  return labels[type || ""] || type || "Evidência";
}

function evidenceTypeTone(type?: string) {
  if (type === "audit_report" || type === "report") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "configuration_export" || type === "log" || type === "siem_alert") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  if (type === "vulnerability_scan") return "border-red-100 bg-red-50 text-red-700";
  if (type === "approval_record" || type === "manual_attestation") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (type === "ticket") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    pending_review: "Pendente de revisão",
    valid: "Válida",
    expired: "Expirada",
    rejected: "Rejeitada",
    deprecated: "Descontinuada",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusTone(status?: string) {
  if (status === "valid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired" || status === "rejected" || status === "deprecated") return "border-red-100 bg-red-50 text-red-700";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function priorityLabel(priority?: string) {
  const labels = Object.fromEntries(priorities.map((item) => [item.value, item.label]));
  return labels[priority || ""] || priority || "Média";
}

function priorityTone(priority?: string) {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-700";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function mechanismLabel(mechanism: any) {
  return [mechanism?.code, mechanism?.title || mechanism?.name].filter(Boolean).join(" - ") || mechanism?.title || mechanism?.name || "Mecanismo";
}

function keywordArray(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isExpired(evidence: EvidenceRecord) {
  if (evidence.is_expired !== undefined) return Boolean(evidence.is_expired);
  if (!evidence.valid_until) return false;
  const validUntil = new Date(evidence.valid_until);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return validUntil < today;
}

function validityLabel(evidence: EvidenceRecord) {
  if (!evidence.valid_until) return "Sem validade";
  return isExpired(evidence) ? "Expirada" : "Válida";
}

function validityTone(evidence: EvidenceRecord) {
  if (!evidence.valid_until) return "border-slate-200 bg-slate-50 text-slate-500";
  return isExpired(evidence)
    ? "border-red-100 bg-red-50 text-red-700"
    : "border-emerald-100 bg-emerald-50 text-emerald-700";
}

function scoreTone(score?: number) {
  const value = Number(score || 0);
  if (value >= 90) return "text-emerald-700";
  if (value >= 70) return "text-cyan-700";
  if (value >= 40) return "text-amber-700";
  return "text-red-700";
}

function scoreBarTone(score?: number) {
  const value = Number(score || 0);
  if (value >= 90) return "bg-emerald-600";
  if (value >= 70) return "bg-cyan-600";
  if (value >= 40) return "bg-amber-500";
  return "bg-red-600";
}

function implementationLabel(status?: string) {
  const labels: Record<string, string> = {
    not_implemented: "Não implementado",
    planned: "Planeado",
    partially_implemented: "Parcial",
    implemented: "Implementado",
    implemented_evidenced: "Implementado e evidenciado",
    not_applicable: "Não aplicável",
  };
  return labels[status || ""] || status || "Sem estado";
}

function MechanismEvidenceOverview({
  payload,
  loading,
  filters,
  onFiltersChange,
  onRefresh,
}: {
  payload: MechanismEvidenceOverviewPayload | null;
  loading: boolean;
  filters: Record<string, string>;
  onFiltersChange: (filters: Record<string, string>) => void;
  onRefresh: () => void;
}) {
  const metrics = payload?.metrics || {};
  const rows = unwrap<any>(payload?.results || []);

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Workflow className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.mechanisms ?? 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Link2 className="h-5 w-5 text-cyan-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.expected_evidence ?? 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipos esperados</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileCheck2 className="h-5 w-5 text-slate-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.actual_evidence ?? 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evidências reais</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.valid_actual_evidence ?? 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Válidas oficiais</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.mechanisms_without_valid_evidence ?? 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Sem prova válida</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Timer className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.expired_evidence ?? 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Expiradas</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1fr_220px_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRefresh();
              }}
              placeholder="Pesquisar por mecanismo, descrição ou tipo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={filters.evidence_status}
            onChange={(event) => onFiltersChange({ ...filters, evidence_status: event.target.value })}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            {mechanismEvidenceStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <input
            value={filters.mechanism_type}
            onChange={(event) => onFiltersChange({ ...filters, mechanism_type: event.target.value })}
            placeholder="Tipo de mecanismo"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
          <button onClick={onRefresh} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
            Filtrar
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {loading ? "A carregar..." : `${rows.length} mecanismo(s) analisado(s)`}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              A conformidade oficial exige evidência real válida e ligação de evidência aprovada. Os tipos esperados orientam a recolha, mas não provam por si só.
            </p>
          </div>
          <GovernanceBadge className="border-indigo-100 bg-indigo-50 text-indigo-700">
            Score médio {metrics.average_official_score ?? 0}%
          </GovernanceBadge>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar matriz por mecanismo...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm font-semibold text-slate-500">
            Sem mecanismos para os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <article key={row.mechanism.id} className="p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <GovernanceBadge className="border-slate-200 bg-slate-50 text-slate-700">{row.mechanism.mechanism_type || "Mecanismo"}</GovernanceBadge>
                      <GovernanceBadge className={row.valid_actual_evidence_count > 0 ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"}>
                        {row.valid_actual_evidence_count > 0 ? "Com evidência válida" : "Sem evidência válida"}
                      </GovernanceBadge>
                      {row.pending_review_count > 0 && <GovernanceBadge className="border-amber-100 bg-amber-50 text-amber-700">{row.pending_review_count} pendentes de revisão</GovernanceBadge>}
                      {row.expired_evidence_count > 0 && <GovernanceBadge className="border-red-100 bg-red-50 text-red-700">{row.expired_evidence_count} expiradas</GovernanceBadge>}
                    </div>
                    <Link to={row.mechanism.href} className="mt-3 block text-xl font-bold text-slate-950 hover:text-indigo-700">
                      {row.mechanism.title}
                    </Link>
                    <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
                      {row.mechanism.description || "Sem descrição."}
                    </p>
                  </div>
                  <div className="grid min-w-[260px] gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score oficial</p>
                        <p className={`mt-1 text-3xl font-bold ${scoreTone(row.official_score)}`}>{row.official_score ?? 0}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Simulação</p>
                        <p className="mt-1 text-xl font-bold text-slate-700">{row.simulation_score ?? 0}%</p>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className={`h-full rounded-full ${scoreBarTone(row.official_score)}`} style={{ width: `${Math.max(0, Math.min(100, Number(row.official_score || 0)))}%` }} />
                    </div>
                    <Link to={`/governance/mapping-review?mechanism=${row.mechanism.id}`} className="inline-flex justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
                      Ver mappings
                    </Link>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-800">Evidência esperada</h3>
                      <GovernanceBadge className="border-emerald-100 bg-white text-emerald-700">{row.expected_evidence_count}</GovernanceBadge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {row.expected_evidence.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-emerald-200 bg-white px-3 py-4 text-sm font-semibold text-emerald-800">
                          Sem tipos de evidência esperada definidos.
                        </p>
                      ) : row.expected_evidence.map((item: any) => (
                        <div key={item.id} className="rounded-xl border border-emerald-100 bg-white p-3">
                          <p className="text-sm font-bold text-slate-950">{item.title}</p>
                          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{item.description || item.rationale || "Tipo esperado."}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <GovernanceBadge className={evidenceTypeTone(item.evidence_type)}>{evidenceTypeLabel(item.evidence_type)}</GovernanceBadge>
                            <GovernanceBadge className={priorityTone(item.priority)}>{priorityLabel(item.priority)}</GovernanceBadge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-800">Evidência real recolhida</h3>
                      <GovernanceBadge className="border-indigo-100 bg-white text-indigo-700">{row.actual_evidence_count}</GovernanceBadge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {row.actual_evidence.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-indigo-200 bg-white px-3 py-4 text-sm font-semibold text-indigo-800">
                          Ainda não existe evidência real associada ao mecanismo.
                        </p>
                      ) : row.actual_evidence.map((item: any) => (
                        <Link key={item.id} to={item.href} className="block rounded-xl border border-indigo-100 bg-white p-3 hover:border-indigo-200">
                          <p className="text-sm font-bold text-slate-950">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{item.description || item.source || item.external_reference || "Evidência recolhida."}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <GovernanceBadge className={evidenceTypeTone(item.evidence_type)}>{evidenceTypeLabel(item.evidence_type)}</GovernanceBadge>
                            <GovernanceBadge className={statusTone(item.evidence_status)}>{statusLabel(item.evidence_status)}</GovernanceBadge>
                            <GovernanceBadge className={statusTone(item.validation_status)}>{statusLabel(item.validation_status)}</GovernanceBadge>
                            <GovernanceBadge className={item.expired ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}>
                              {item.expired ? "Expirada" : item.valid_until ? `Válida até ${formatDate(item.valid_until)}` : "Sem prazo"}
                            </GovernanceBadge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Mecanismo no contexto</h3>
                      <GovernanceBadge className="border-slate-200 bg-white text-slate-600">{row.context_count}</GovernanceBadge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {row.score_contexts.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm font-semibold text-slate-500">
                          Sem controlos internos associados.
                        </p>
                      ) : row.score_contexts.map((context: any, index: number) => (
                        <div key={context.context_id || `${row.mechanism.id}-${index}`} className="rounded-xl border border-slate-100 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-slate-950">{context.internal_control_code || "Sem contexto"} {context.internal_control_title ? `- ${context.internal_control_title}` : ""}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">{implementationLabel(context.implementation_status)}</p>
                            </div>
                            <span className={`text-sm font-bold ${scoreTone(context.score)}`}>{context.score ?? 0}%</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {context.mandatory && <GovernanceBadge className="border-amber-100 bg-amber-50 text-amber-700">Obrigatorio</GovernanceBadge>}
                            {context.validation_status && <GovernanceBadge className={statusTone(context.validation_status)}>{statusLabel(context.validation_status)}</GovernanceBadge>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {row.gaps.length > 0 && (
                      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Avisos</p>
                        <ul className="mt-2 space-y-2">
                          {row.gaps.slice(0, 3).map((gap: any, index: number) => (
                            <li key={`${row.mechanism.id}-gap-${index}`} className="text-xs font-semibold leading-relaxed text-amber-900">
                              {gap.description || gap.recommendation || gap.type}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function EvidenceItemsList() {
  const [activeTab, setActiveTab] = useState<"mechanisms" | "requirements" | "items">("mechanisms");
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [mechanisms, setMechanisms] = useState<any[]>([]);
  const [mechanismOverview, setMechanismOverview] = useState<MechanismEvidenceOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [requirementsLoading, setRequirementsLoading] = useState(true);
  const [mechanismOverviewLoading, setMechanismOverviewLoading] = useState(true);
  const [savingRequirement, setSavingRequirement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requirementMessage, setRequirementMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    evidence_type: "",
    status: "",
    owner: "",
    validity: "",
  });
  const [requirementFilters, setRequirementFilters] = useState({
    search: "",
    evidence_type: "",
    priority: "",
    scope: "",
    mechanism: "",
  });
  const [mechanismOverviewFilters, setMechanismOverviewFilters] = useState({
    search: "",
    mechanism_type: "",
    evidence_status: "",
  });
  const [requirementForm, setRequirementForm] = useState(emptyRequirementForm);
  const [selectedMechanismIds, setSelectedMechanismIds] = useState<string[]>([]);
  const [mechanismSearch, setMechanismSearch] = useState("");
  const [editingRequirement, setEditingRequirement] = useState<RequirementRecord | null>(null);

  const filteredItems = useMemo(() => {
    if (!filters.validity) return items;
    return items.filter((item) => {
      if (filters.validity === "none") return !item.valid_until;
      if (filters.validity === "expired") return isExpired(item);
      return Boolean(item.valid_until) && !isExpired(item);
    });
  }, [filters.validity, items]);

  const loadMechanismOverview = useCallback(async () => {
    setMechanismOverviewLoading(true);
    setError(null);
    try {
      const data = await mappingReviewApi.getMechanismEvidenceOverview({
        page_size: 300,
        search: mechanismOverviewFilters.search,
        mechanism_type: mechanismOverviewFilters.mechanism_type,
        evidence_status: mechanismOverviewFilters.evidence_status,
      });
      setMechanismOverview(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar evidências por mecanismo.");
    } finally {
      setMechanismOverviewLoading(false);
    }
  }, [mechanismOverviewFilters.evidence_status, mechanismOverviewFilters.mechanism_type, mechanismOverviewFilters.search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await mappingReviewApi.listEvidenceItems({
        page_size: 500,
        search: filters.search,
        evidence_type: filters.evidence_type,
        status: filters.status,
        owner__icontains: filters.owner,
        ordering: "title",
      });
      setItems(unwrap<EvidenceRecord>(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar evidências.");
    } finally {
      setLoading(false);
    }
  }, [filters.evidence_type, filters.owner, filters.search, filters.status]);

  const loadRequirements = useCallback(async () => {
    setRequirementsLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        page_size: 500,
        search: requirementFilters.search,
        evidence_type: requirementFilters.evidence_type,
        priority: requirementFilters.priority,
        ordering: "priority,title",
      };
      if (requirementFilters.scope === "specific") params.mechanism__isnull = false;
      if (requirementFilters.scope === "template") params.mechanism__isnull = true;
      if (requirementFilters.mechanism) params.mechanism = requirementFilters.mechanism;

      const [requirementsData, mechanismsData] = await Promise.all([
        mappingReviewApi.listMechanismEvidenceRequirements(params),
        mappingReviewApi.listMechanisms({ page_size: 1000, ordering: "title" }),
      ]);
      setRequirements(unwrap<RequirementRecord>(requirementsData));
      setMechanisms(unwrap<any>(mechanismsData));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar tipos de evidência esperada.");
    } finally {
      setRequirementsLoading(false);
    }
  }, [requirementFilters.evidence_type, requirementFilters.mechanism, requirementFilters.priority, requirementFilters.scope, requirementFilters.search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRequirements();
  }, [loadRequirements]);

  useEffect(() => {
    loadMechanismOverview();
  }, [loadMechanismOverview]);

  const resetRequirementForm = () => {
    setRequirementForm(emptyRequirementForm);
    setSelectedMechanismIds([]);
    setMechanismSearch("");
    setEditingRequirement(null);
  };

  const editRequirement = (requirement: RequirementRecord) => {
    setEditingRequirement(requirement);
    setRequirementForm({
      title: requirement.title || "",
      description: requirement.description || "",
      evidence_type: requirement.evidence_type || "report",
      priority: requirement.priority || "medium",
      rationale: requirement.rationale || "",
      mechanism_type: requirement.mechanism_type || "",
      control_domain: requirement.control_domain || "",
      keywords: Array.isArray(requirement.keywords) ? requirement.keywords.join(", ") : "",
      is_active: requirement.is_active !== false,
    });
    setSelectedMechanismIds(requirement.mechanism ? [String(requirement.mechanism)] : []);
    setActiveTab("requirements");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveRequirement = async () => {
    if (!requirementForm.title.trim()) {
      setError("Indica o título do tipo de evidência esperada.");
      return;
    }

    setSavingRequirement(true);
    setError(null);
    setRequirementMessage(null);
    try {
      const basePayload = {
        title: requirementForm.title.trim(),
        description: requirementForm.description.trim(),
        evidence_type: requirementForm.evidence_type,
        priority: requirementForm.priority,
        source: "manual",
        rationale: requirementForm.rationale.trim(),
        mechanism_type: requirementForm.mechanism_type.trim(),
        control_domain: requirementForm.control_domain.trim(),
        keywords: keywordArray(requirementForm.keywords),
        is_active: requirementForm.is_active,
      };

      if (editingRequirement) {
        await mappingReviewApi.updateMechanismEvidenceRequirement(String(editingRequirement.id), {
          ...basePayload,
          mechanism: selectedMechanismIds[0] || null,
        });
        setRequirementMessage("Tipo de evidência esperado atualizado.");
      } else {
        const targets = selectedMechanismIds.length ? selectedMechanismIds : [null];
        await Promise.all(targets.map((mechanismId) =>
          mappingReviewApi.createMechanismEvidenceRequirement({
            ...basePayload,
            mechanism: mechanismId,
          })
        ));
        setRequirementMessage(
          selectedMechanismIds.length > 1
            ? `Tipo de evidência criado para ${selectedMechanismIds.length} mecanismos.`
            : "Tipo de evidência esperado criado."
        );
      }

      resetRequirementForm();
      await loadRequirements();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível guardar o tipo de evidência esperada.");
    } finally {
      setSavingRequirement(false);
    }
  };

  const toggleRequirementActive = async (requirement: RequirementRecord) => {
    setSavingRequirement(true);
    setError(null);
    try {
      await mappingReviewApi.updateMechanismEvidenceRequirement(String(requirement.id), {
        is_active: !requirement.is_active,
      });
      await loadRequirements();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível alterar o estado do tipo de evidência.");
    } finally {
      setSavingRequirement(false);
    }
  };

  const metrics = useMemo(() => ({
    total: items.length,
    valid: items.filter((item) => item.status === "valid" && !isExpired(item)).length,
    expired: items.filter((item) => isExpired(item) || item.status === "expired").length,
    linked: items.filter((item) => Number(item.active_links_count || item.links_count || 0) > 0).length,
  }), [items]);

  const requirementMetrics = useMemo(() => ({
    total: requirements.length,
    mechanismSpecific: requirements.filter((item) => item.mechanism).length,
    templates: requirements.filter((item) => !item.mechanism).length,
    inactive: requirements.filter((item) => item.is_active === false).length,
  }), [requirements]);

  const filteredMechanisms = useMemo(() => {
    const query = mechanismSearch.trim().toLowerCase();
    return mechanisms
      .filter((mechanism) => {
        if (!query) return true;
        const haystack = [mechanism.title, mechanism.name, mechanism.description, mechanism.mechanism_type].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [mechanismSearch, mechanisms]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Catálogo de evidências</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Evidências</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Gere os tipos de evidência que cada mecanismo deve exigir e consulte as evidências reais recolhidas.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={activeTab === "mechanisms" ? loadMechanismOverview : activeTab === "requirements" ? loadRequirements : load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            {activeTab !== "requirements" && (
              <Link to="/governance/evidence/wizard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                <FilePlus2 className="h-4 w-4" />
                Criar evidência
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm md:grid-cols-3">
        <button
          type="button"
          onClick={() => setActiveTab("mechanisms")}
          className={`rounded-xl px-4 py-4 text-left transition ${activeTab === "mechanisms" ? "bg-indigo-700 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"}`}
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <Workflow className="h-4 w-4" />
            Por mecanismo
          </span>
          <span className="mt-1 block text-xs font-semibold opacity-80">Cruza evidência esperada, evidência real e impacto no score.</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requirements")}
          className={`rounded-xl px-4 py-4 text-left transition ${activeTab === "requirements" ? "bg-indigo-700 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"}`}
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <Link2 className="h-4 w-4" />
            Tipos esperados
          </span>
          <span className="mt-1 block text-xs font-semibold opacity-80">O que deve ser recolhido para provar cada mecanismo.</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("items")}
          className={`rounded-xl px-4 py-4 text-left transition ${activeTab === "items" ? "bg-indigo-700 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"}`}
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <FileCheck2 className="h-4 w-4" />
            Evidências recolhidas
          </span>
          <span className="mt-1 block text-xs font-semibold opacity-80">Ficheiros, logs, fotografias, tickets e referências reais.</span>
        </button>
      </section>

      {activeTab === "mechanisms" ? (
        <MechanismEvidenceOverview
          payload={mechanismOverview}
          loading={mechanismOverviewLoading}
          filters={mechanismOverviewFilters}
          onFiltersChange={(nextFilters) => setMechanismOverviewFilters({
            search: nextFilters.search || "",
            mechanism_type: nextFilters.mechanism_type || "",
            evidence_status: nextFilters.evidence_status || "",
          })}
          onRefresh={loadMechanismOverview}
        />
      ) : activeTab === "requirements" ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <Link2 className="h-5 w-5 text-indigo-700" />
              <p className="mt-3 text-3xl font-bold text-slate-950">{requirementMetrics.total}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipos esperados</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <Workflow className="h-5 w-5 text-cyan-600" />
              <p className="mt-3 text-3xl font-bold text-slate-950">{requirementMetrics.mechanismSpecific}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ligados a mecanismo</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <FileCheck2 className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-3xl font-bold text-slate-950">{requirementMetrics.templates}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Templates globais</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <p className="mt-3 text-3xl font-bold text-slate-950">{requirementMetrics.inactive}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Inativos</p>
            </div>
          </section>

          {requirementMessage && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {requirementMessage}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                    {editingRequirement ? "Editar tipo esperado" : "Novo tipo esperado"}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">Tipo de evidência</h2>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                    Define o que o CISO deve recolher para comprovar um mecanismo.
                  </p>
                </div>
                {editingRequirement && (
                  <button type="button" onClick={resetRequirementForm} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Título</label>
                  <input
                    value={requirementForm.title}
                    onChange={(event) => setRequirementForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Ex.: Log de backup executado com sucesso"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Descrição / instrução de recolha</label>
                  <textarea
                    value={requirementForm.description}
                    onChange={(event) => setRequirementForm((current) => ({ ...current, description: event.target.value }))}
                    rows={4}
                    placeholder="Explica que prova deve ser recolhida, onde obter e o que deve demonstrar."
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</label>
                    <select
                      value={requirementForm.evidence_type}
                      onChange={(event) => setRequirementForm((current) => ({ ...current, evidence_type: event.target.value }))}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    >
                      {evidenceTypes.filter((type) => type.value).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Prioridade</label>
                    <select
                      value={requirementForm.priority}
                      onChange={(event) => setRequirementForm((current) => ({ ...current, priority: event.target.value }))}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    >
                      {priorities.filter((priority) => priority.value).map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipo de mecanismo</label>
                    <input
                      value={requirementForm.mechanism_type}
                      onChange={(event) => setRequirementForm((current) => ({ ...current, mechanism_type: event.target.value }))}
                      placeholder="technical, procedural..."
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Domínio de controlo</label>
                    <input
                      value={requirementForm.control_domain}
                      onChange={(event) => setRequirementForm((current) => ({ ...current, control_domain: event.target.value }))}
                      placeholder="Acessos, backups, governance..."
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Keywords</label>
                  <input
                    value={requirementForm.keywords}
                    onChange={(event) => setRequirementForm((current) => ({ ...current, keywords: event.target.value }))}
                    placeholder="backup, log, restauracao"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Justificação</label>
                  <textarea
                    value={requirementForm.rationale}
                    onChange={(event) => setRequirementForm((current) => ({ ...current, rationale: event.target.value }))}
                    rows={3}
                    placeholder="Porque é que esta evidência é necessária para este mecanismo?"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={requirementForm.is_active}
                    onChange={(event) => setRequirementForm((current) => ({ ...current, is_active: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Ativo no catalogo
                </label>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Associar a mecanismos</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                    Sem mecanismos selecionados, o tipo fica como modelo global reutilizável.
                  </p>
                  <input
                    value={mechanismSearch}
                    onChange={(event) => setMechanismSearch(event.target.value)}
                    placeholder="Pesquisar mecanismo..."
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {filteredMechanisms.map((mechanism) => {
                      const mechanismId = String(mechanism.id);
                      const checked = selectedMechanismIds.includes(mechanismId);
                      return (
                        <label key={mechanismId} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition ${checked ? "border-indigo-200 bg-indigo-50" : "border-slate-100 bg-white hover:border-slate-200"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => setSelectedMechanismIds((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, mechanismId]))
                                : current.filter((id) => id !== mechanismId)
                            )}
                            className="mt-1 h-4 w-4 rounded border-slate-300"
                          />
                          <span>
                            <span className="block font-bold text-slate-900">{mechanismLabel(mechanism)}</span>
                            <span className="mt-1 line-clamp-2 block text-xs font-semibold text-slate-500">{mechanism.description || mechanism.mechanism_type || "Sem descrição."}</span>
                          </span>
                        </label>
                      );
                    })}
                    {!filteredMechanisms.length && (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm font-semibold text-slate-400">
                        Sem mecanismos para esta pesquisa.
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveRequirement}
                  disabled={savingRequirement || !requirementForm.title.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {editingRequirement ? "Guardar alterações" : "Criar tipo esperado"}
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="grid gap-3 xl:grid-cols-[1fr_180px_170px_170px_220px_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={requirementFilters.search}
                      onChange={(event) => setRequirementFilters((current) => ({ ...current, search: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadRequirements();
                      }}
                      placeholder="Pesquisar por título, instrução, mecanismo..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <select value={requirementFilters.evidence_type} onChange={(event) => setRequirementFilters((current) => ({ ...current, evidence_type: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                    {evidenceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <select value={requirementFilters.priority} onChange={(event) => setRequirementFilters((current) => ({ ...current, priority: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                    {priorities.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                  </select>
                  <select value={requirementFilters.scope} onChange={(event) => setRequirementFilters((current) => ({ ...current, scope: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                    {requirementScopes.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
                  </select>
                  <select value={requirementFilters.mechanism} onChange={(event) => setRequirementFilters((current) => ({ ...current, mechanism: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                    <option value="">Todos os mecanismos</option>
                    {mechanisms.map((mechanism) => <option key={mechanism.id} value={mechanism.id}>{mechanismLabel(mechanism)}</option>)}
                  </select>
                  <button onClick={loadRequirements} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                    Filtrar
                  </button>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    {requirementsLoading ? "A carregar..." : `${requirements.length} tipo(s) esperado(s)`}
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {!requirementsLoading && requirements.map((requirement) => (
                    <article key={requirement.id} className="p-5 hover:bg-slate-50">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <GovernanceBadge className={evidenceTypeTone(requirement.evidence_type)}>{evidenceTypeLabel(requirement.evidence_type)}</GovernanceBadge>
                            <GovernanceBadge className={priorityTone(requirement.priority)}>{priorityLabel(requirement.priority)}</GovernanceBadge>
                            <GovernanceBadge className={requirement.is_active === false ? "border-slate-200 bg-slate-50 text-slate-500" : "border-emerald-100 bg-emerald-50 text-emerald-700"}>
                              {requirement.is_active === false ? "Inativo" : "Ativo"}
                            </GovernanceBadge>
                            <GovernanceBadge className={requirement.mechanism ? "border-cyan-100 bg-cyan-50 text-cyan-700" : "border-indigo-100 bg-indigo-50 text-indigo-700"}>
                              {requirement.mechanism ? "Mecanismo" : "Template"}
                            </GovernanceBadge>
                          </div>
                          <h3 className="mt-3 text-lg font-bold text-slate-950">{requirement.title}</h3>
                          <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                            {requirement.description || requirement.rationale || "Sem instrução de recolha."}
                          </p>
                          <div className="mt-3 grid gap-3 text-xs font-semibold text-slate-500 md:grid-cols-2">
                            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Mecanismo</span>
                              <span className="mt-1 block text-slate-700">{requirement.mechanism_title || "Modelo global"}</span>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Domínio / palavras-chave</span>
                              <span className="mt-1 block text-slate-700">
                                {[requirement.control_domain, Array.isArray(requirement.keywords) ? requirement.keywords.join(", ") : ""].filter(Boolean).join(" - ") || "-"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => editRequirement(requirement)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRequirementActive(requirement)}
                            disabled={savingRequirement}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
                          >
                            {requirement.is_active === false ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                            {requirement.is_active === false ? "Ativar" : "Inativar"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {requirementsLoading && <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar tipos esperados...</div>}
                {!requirementsLoading && requirements.length === 0 && (
                  <div className="p-12 text-center text-sm font-semibold text-slate-500">
                    Sem tipos de evidência esperada para os filtros atuais.
                  </div>
                )}
              </section>
            </div>
          </section>
        </>
      ) : (
        <>
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileCheck2 className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evidências</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.valid}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Válidas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.expired}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Expiradas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Workflow className="h-5 w-5 text-cyan-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.linked}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Com ligações</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1fr_220px_220px_220px_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") load();
              }}
              placeholder="Pesquisar por título, descrição, fonte ou referência..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select value={filters.evidence_type} onChange={(event) => setFilters((current) => ({ ...current, evidence_type: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
            {evidenceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
            {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select value={filters.validity} onChange={(event) => setFilters((current) => ({ ...current, validity: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
            {validityFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
          <input value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))} placeholder="Responsável" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
          <button onClick={load} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
            Filtrar
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {loading ? "A carregar..." : `${filteredItems.length} evidência(s) encontradas`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Título</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Estado</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Fonte</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Validade</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Confianca</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Responsável</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link to={`/governance/evidence/${item.id}`} className="font-bold text-slate-950 hover:text-indigo-700">
                      {item.title}
                    </Link>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.description || item.external_reference || "Sem descrição."}</p>
                  </td>
                  <td className="px-5 py-4">
                    <GovernanceBadge className={evidenceTypeTone(item.evidence_type)}>{evidenceTypeLabel(item.evidence_type)}</GovernanceBadge>
                  </td>
                  <td className="px-5 py-4">
                    <GovernanceBadge className={statusTone(item.status)}>{statusLabel(item.status)}</GovernanceBadge>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-600">
                    <div className="flex flex-col gap-1">
                      <span className="line-clamp-1">{item.file ? (item.original_filename || "Ficheiro anexado") : (item.source || item.external_reference || "-")}</span>
                      {item.file && (
                        <GovernanceBadge className="w-fit border-indigo-100 bg-indigo-50 text-indigo-700">
                          Ficheiro auditável
                        </GovernanceBadge>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      <GovernanceBadge className={validityTone(item)}>{validityLabel(item)}</GovernanceBadge>
                      <span className="text-xs font-semibold text-slate-500">{formatDate(item.valid_until)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, Number(item.confidence_level || 0)))}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-600">{item.confidence_level ?? 0}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-600">{item.owner || "-"}</td>
                  <td className="px-5 py-4">
                    <Link to={`/governance/evidence/${item.id}`} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar evidências...</div>}
        {!loading && filteredItems.length === 0 && (
          <div className="p-12 text-center text-sm font-semibold text-slate-500">
            Sem evidências para os filtros atuais.
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3 text-sm font-semibold text-slate-600">
          <Timer className="mt-0.5 h-4 w-4 text-slate-400" />
          <p>
            A validade é calculada no frontend para facilitar filtros rápidos. O backend continua a devolver os campos oficiais
            <span className="font-bold text-slate-800"> valid_until</span>, <span className="font-bold text-slate-800">is_expired</span> e
            <span className="font-bold text-slate-800"> is_score_eligible</span>.
          </p>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
