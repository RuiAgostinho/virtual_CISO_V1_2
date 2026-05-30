/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  FileCheck,
  FileSearch,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  governanceApi,
  type FrameworkControlRecord,
  type FrameworkRecord,
  type FrameworkSectionRecord,
  type PaginatedResponse,
} from "@/lib/governanceApi";
import { mappingReviewApi, type TraceabilityPayload } from "@/lib/mappingReviewApi";

type FrameworkScorePayload = {
  score?: number;
  status?: string;
  coverage?: number;
  details?: {
    coverage?: number;
    evaluated_controls?: number;
    total_controls?: number;
  };
  gaps?: any[];
};

type AnyRecord = Record<string, any>;

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getTotal<T>(data: T[] | PaginatedResponse<T> | null | undefined, fallback: number) {
  return Array.isArray(data) ? fallback : data?.count ?? fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function asArray<T = AnyRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function formatPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${Math.round(numeric)}%`;
}

function scoreTone(score: unknown) {
  const numeric = Number(score);
  if (numeric >= 80) return "text-emerald-600";
  if (numeric >= 50) return "text-amber-600";
  return "text-red-600";
}

function statusLabel(status?: string) {
  if (status === "active") return "Ativo";
  if (status === "deprecated") return "Descontinuado";
  return status || "Sem estado";
}

function controlLabel(control: FrameworkControlRecord | AnyRecord) {
  return [control.framework_code, control.code].filter(Boolean).join(":") || control.code || "-";
}

function sectionLabel(section: FrameworkSectionRecord) {
  return [section.code, section.name].filter(Boolean).join(" - ") || "Sem secção";
}

function mappingCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function displayLabel(item: AnyRecord | null | undefined) {
  if (!item) return "-";
  return [item.code || item.framework_code, item.title || item.name || item.label].filter(Boolean).join(" - ") || item.id || "-";
}

function getChains(traceability: TraceabilityPayload | null) {
  const active = traceability?.active_mappings || {};
  const evidence = traceability?.evidence || {};
  const frameworkMappings = asArray(active.framework_mappings);
  const mechanismLinks = asArray(active.internal_control_mechanisms);
  const evidenceLinks = asArray(evidence.links);

  return frameworkMappings.slice(0, 16).map((mapping) => {
    const internalControl = mapping.internal_control;
    const externalControl = mapping.framework_control;
    const internalControlId = String(internalControl?.id || "");
    const mechanisms = mechanismLinks
      .filter((link) => String(link.internal_control?.id || "") === internalControlId)
      .map((link) => ({ ...link.mechanism, implementation_status: link.implementation_status, mandatory: link.mandatory }));
    const mechanismIds = new Set(mechanisms.map((item) => String(item.id)));
    const chainEvidence = evidenceLinks
      .filter((link) => {
        const targetId = String(link.target_id || "");
        return targetId === internalControlId || mechanismIds.has(targetId);
      })
      .map((link) => link.evidence_item);

    return {
      id: mapping.id,
      externalControl,
      internalControl,
      mechanisms,
      evidence: chainEvidence,
      coverage: mapping.coverage_percentage,
      relationshipType: mapping.relationship_type,
    };
  });
}

export default function FrameworkControlsCatalog() {
  const { id } = useParams<{ id: string }>();
  const [framework, setFramework] = useState<FrameworkRecord | null>(null);
  const [controls, setControls] = useState<FrameworkControlRecord[]>([]);
  const [sections, setSections] = useState<FrameworkSectionRecord[]>([]);
  const [score, setScore] = useState<FrameworkScorePayload | null>(null);
  const [traceability, setTraceability] = useState<TraceabilityPayload | null>(null);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mandatoryFilter, setMandatoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalControls, setTotalControls] = useState(0);
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingControls, setLoadingControls] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!id) return;
    setLoadingContext(true);
    setError(null);
    try {
      const [frameworkData, sectionsData, scoreData, traceabilityData] = await Promise.all([
        governanceApi.getFramework(id),
        governanceApi.getFrameworkSections(id),
        mappingReviewApi.getFrameworkScore(id, { mode: "official", include_details: true, include_gaps: true }).catch(() => null),
        mappingReviewApi.getFrameworkTraceability(id, {
          mode: "official",
          include_inactive: true,
          include_evidence: true,
          include_scores: true,
          include_gaps: true,
          max_depth: 3,
        }).catch(() => null),
      ]);
      setFramework(frameworkData);
      setSections(sectionsData);
      setScore(scoreData as FrameworkScorePayload | null);
      setTraceability(traceabilityData);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar a framework."));
    } finally {
      setLoadingContext(false);
    }
  }, [id]);

  const loadControls = useCallback(async () => {
    if (!id) return;
    setLoadingControls(true);
    setError(null);
    try {
      const data = await governanceApi.listControls({
        framework: id,
        page,
        page_size: pageSize,
        ordering: "code",
        search: search.trim() || undefined,
        section: sectionFilter || undefined,
        status: statusFilter || undefined,
        is_mandatory: mandatoryFilter || undefined,
      });
      const items = unwrap<FrameworkControlRecord>(data);
      setControls(items);
      setTotalControls(getTotal<FrameworkControlRecord>(data, items.length));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar os controlos da framework."));
    } finally {
      setLoadingControls(false);
    }
  }, [id, mandatoryFilter, page, pageSize, search, sectionFilter, statusFilter]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    void loadControls();
  }, [loadControls]);

  const relationships = traceability?.relationships || {};
  const activeMappings = traceability?.active_mappings || {};
  const officialScore = (traceability?.scores?.official as AnyRecord | undefined) || score;
  const simulationScore = traceability?.scores?.simulation as AnyRecord | undefined;
  const chains = useMemo(() => getChains(traceability), [traceability]);

  const metrics = useMemo(() => {
    const approvedFrameworkMappings = asArray(activeMappings.framework_mappings);
    return {
      total: totalControls,
      active: controls.filter((control) => control.status === "active").length,
      mandatory: controls.filter((control) => control.is_mandatory).length,
      mapped: controls.filter((control) => mappingCount(control.internal_mappings_count) > 0).length,
      internalControls: asArray(relationships.internal_controls).length,
      mechanisms: asArray(relationships.mechanisms).length,
      evidence: asArray(traceability?.evidence?.items).length,
      gaps: asArray(traceability?.gaps).length,
      approvedMappings: approvedFrameworkMappings.length,
    };
  }, [activeMappings.framework_mappings, controls, relationships.internal_controls, relationships.mechanisms, totalControls, traceability]);

  const totalPages = Math.max(1, Math.ceil(totalControls / pageSize));
  const loading = loadingContext || loadingControls;

  const resetPage = () => setPage(1);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link
              to="/catalogs/frameworks"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar às frameworks
            </Link>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Framework viva</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {framework ? `${framework.code} ${framework.version || ""}` : "Postura da framework"}
            </h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {framework?.name || "Framework externa"} ligada aos controlos internos, mecanismos, evidências, gaps e score oficial da organização.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/governance/traceability?type=framework&id=${id || ""}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100"
            >
              <GitBranch className="h-4 w-4" />
              Abrir rastreabilidade
            </Link>
            <button
              type="button"
              onClick={() => {
                void loadContext();
                void loadControls();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <MetricCard icon={FileSearch} label="Score oficial" value={formatPercent(officialScore?.score ?? officialScore?.coverage)} tone={scoreTone(officialScore?.score ?? officialScore?.coverage)} />
        <MetricCard icon={Activity} label="Score simulação" value={formatPercent(simulationScore?.score ?? simulationScore?.coverage)} tone="text-indigo-700" />
        <MetricCard icon={BookOpen} label="Controlos" value={metrics.total} />
        <MetricCard icon={GitBranch} label="Mappings aprovados" value={metrics.approvedMappings} tone="text-emerald-600" />
        <MetricCard icon={ShieldCheck} label="Controlos internos" value={metrics.internalControls} tone="text-indigo-700" />
        <MetricCard icon={Wrench} label="Mecanismos" value={metrics.mechanisms} tone="text-amber-600" />
        <MetricCard icon={FileCheck} label="Evidências" value={metrics.evidence} tone="text-sky-600" />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cadeia de conformidade</p>
            <h2 className="text-lg font-bold text-slate-950">Controlo externo para controlo interno para mecanismo para evidência</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {metrics.gaps} gap(s)
          </span>
        </div>

        {loadingContext ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm font-bold uppercase tracking-wide text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar rastreabilidade...
          </div>
        ) : chains.length === 0 ? (
          <div className="p-8 text-sm font-semibold text-slate-500">
            Esta framework ainda não tem mapeamentos aprovados para desenhar a cadeia de impacto.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {chains.map((chain) => (
              <article key={chain.id || `${chain.externalControl?.id}-${chain.internalControl?.id}`} className="p-5">
                <div className="grid gap-3 xl:grid-cols-[1.2fr_40px_1.2fr_40px_1fr_40px_1fr] xl:items-stretch">
                  <TraceNode title="Controlo externo" href={`/governance/traceability?type=framework_control&id=${chain.externalControl?.id || ""}`} label={displayLabel(chain.externalControl)} badge={chain.relationshipType} />
                  <FlowArrow />
                  <TraceNode title="Controlo interno" href={`/governance/mapping-review?internalControl=${chain.internalControl?.id || ""}`} label={displayLabel(chain.internalControl)} badge={`${Number(chain.coverage || 0).toFixed(0)}% cobertura`} />
                  <FlowArrow />
                  <TraceCollection title="Mecanismos" items={chain.mechanisms} pathPrefix="/governance/mechanisms" empty="Sem mecanismo ligado." />
                  <FlowArrow />
                  <TraceCollection title="Evidências" items={chain.evidence} pathPrefix="/governance/evidence" empty="Sem evidência ligada." />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {asArray(traceability?.gaps).length > 0 && (
        <section className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-sm font-bold uppercase tracking-wide">Lacunas prioritárias nesta framework</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {asArray(traceability?.gaps).slice(0, 6).map((gap, index) => (
              <div key={`${gap.type || "gap"}-${gap.target_id || index}`} className="rounded-xl border border-red-100 bg-white/70 p-4 text-sm font-semibold text-red-800">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-500">{gap.type || "gap"} - {gap.severity || "sem severidade"}</p>
                <p className="mt-1">{gap.message || gap.recommendation || "Gap sem descrição."}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_240px_180px_180px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Pesquisar por código, título, descrição ou secção..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            />
          </label>
          <select
            value={sectionFilter}
            onChange={(event) => {
              setSectionFilter(event.target.value);
              resetPage();
            }}
            className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="">Todas as secções</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>{sectionLabel(section)}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              resetPage();
            }}
            className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="">Todos os estados</option>
            <option value="active">Ativos</option>
            <option value="deprecated">Descontinuados</option>
          </select>
          <select
            value={mandatoryFilter}
            onChange={(event) => {
              setMandatoryFilter(event.target.value);
              resetPage();
            }}
            className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="">Obrigatoriedade</option>
            <option value="true">Obrigatórios</option>
            <option value="false">Não obrigatórios</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Controlos externos</p>
            <h2 className="text-lg font-bold text-slate-950">{totalControls} controlos encontrados</h2>
          </div>
          <p className="max-w-2xl text-xs font-semibold text-slate-500">
            Cada controlo externo deve chegar a controlos internos, mecanismos e evidência validada.
          </p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">
            A carregar controlos da framework...
          </div>
        ) : controls.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">
              Não existem controlos para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {controls.map((control) => {
              const section = [control.section_code, control.section_name].filter(Boolean).join(" - ") || "Sem secção";
              const approvedMappings = mappingCount(control.approved_internal_mappings_count);
              const totalMappings = mappingCount(control.internal_mappings_count);
              const nonApprovedMappings = Math.max(0, totalMappings - approvedMappings);
              return (
                <article key={String(control.id)} className="grid gap-4 p-5 hover:bg-slate-50/70 xl:grid-cols-[1fr_300px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
                        {controlLabel(control)}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">
                        Controlo externo
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {section}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {statusLabel(control.status)}
                      </span>
                      {control.is_mandatory && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-100">
                          Obrigatório
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-950">{control.title || "Sem título"}</h3>
                    <p className="mt-2 max-w-5xl text-sm font-medium leading-relaxed text-slate-600">
                      {control.description || "Sem descrição registada."}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mapeamentos internos</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {totalMappings === 0 ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700 ring-1 ring-red-100">
                          Sem mapping
                        </span>
                      ) : (
                        <>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
                            Aprovados: {approvedMappings}
                          </span>
                          {nonApprovedMappings > 0 && (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-100">
                              Por validar: {nonApprovedMappings}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="mt-4 grid gap-2">
                      <Link
                        to={`/governance/traceability?type=framework_control&id=${control.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
                      >
                        <GitBranch className="h-4 w-4" />
                        Ver cadeia
                      </Link>
                      <Link
                        to={`/governance/mapping-review?frameworkControl=${control.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Rever mappings
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={totalControls}
        totalPages={totalPages}
        currentCount={controls.length}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "text-indigo-700",
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden items-center justify-center xl:flex">
      <ArrowRight className="h-5 w-5 text-slate-300" />
    </div>
  );
}

function TraceNode({ title, label, href, badge }: { title: string; label: string; href?: string; badge?: string }) {
  const content = (
    <div className="min-h-28 rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</span>
        {badge && (
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm font-bold leading-snug text-slate-950">{label}</p>
    </div>
  );
  return href ? <Link to={href}>{content}</Link> : content;
}

function TraceCollection({ title, items, pathPrefix, empty }: { title: string; items: AnyRecord[]; pathPrefix: string; empty: string }) {
  return (
    <div className="min-h-28 rounded-xl border border-slate-100 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-slate-400">{empty}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {items.slice(0, 4).map((item) => (
            <Link
              key={item.id || displayLabel(item)}
              to={`${pathPrefix}/${item.id}`}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
            >
              <span className="line-clamp-2">{displayLabel(item)}</span>
            </Link>
          ))}
          {items.length > 4 && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">+{items.length - 4} adicionais</span>
          )}
        </div>
      )}
    </div>
  );
}

function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  currentCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  currentCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = totalItems === 0 ? 0 : Math.min(totalItems, firstItem + currentCount - 1);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm md:flex-row md:items-center md:justify-between">
      <span>
        A mostrar {firstItem}-{lastItem} de {totalItems} controlo(s).
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase tracking-wide text-slate-600"
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="px-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Seguinte
        </button>
      </div>
    </div>
  );
}
