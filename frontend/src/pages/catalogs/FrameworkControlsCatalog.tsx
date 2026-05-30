import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  GitBranch,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  governanceApi,
  type FrameworkControlRecord,
  type FrameworkRecord,
  type FrameworkSectionRecord,
  type PaginatedResponse,
} from "@/lib/governanceApi";
import { mappingReviewApi } from "@/lib/mappingReviewApi";

type FrameworkScorePayload = {
  score?: number;
  status?: string;
  coverage?: number;
  details?: {
    coverage?: number;
    evaluated_controls?: number;
    total_controls?: number;
  };
};

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getTotal<T>(data: T[] | PaginatedResponse<T> | null | undefined, fallback: number) {
  return Array.isArray(data) ? fallback : data?.count ?? fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${Math.round(numeric)}%`;
}

function statusLabel(status?: string) {
  if (status === "active") return "Ativo";
  if (status === "deprecated") return "Descontinuado";
  return status || "Sem estado";
}

function controlLabel(control: FrameworkControlRecord) {
  return [control.framework_code, control.code].filter(Boolean).join(":");
}

function sectionLabel(section: FrameworkSectionRecord) {
  return [section.code, section.name].filter(Boolean).join(" - ") || "Sem secção";
}

function mappingCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

export default function FrameworkControlsCatalog() {
  const { id } = useParams<{ id: string }>();
  const [framework, setFramework] = useState<FrameworkRecord | null>(null);
  const [controls, setControls] = useState<FrameworkControlRecord[]>([]);
  const [sections, setSections] = useState<FrameworkSectionRecord[]>([]);
  const [score, setScore] = useState<FrameworkScorePayload | null>(null);
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
      const [frameworkData, sectionsData, scoreData] = await Promise.all([
        governanceApi.getFramework(id),
        governanceApi.getFrameworkSections(id),
        mappingReviewApi.getFrameworkScore(id, { mode: "official", include_details: true }).catch(() => null),
      ]);
      setFramework(frameworkData);
      setSections(sectionsData);
      setScore(scoreData as FrameworkScorePayload | null);
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

  const metrics = useMemo(() => {
    return {
      total: totalControls,
      active: controls.filter((control) => control.status === "active").length,
      mandatory: controls.filter((control) => control.is_mandatory).length,
      mapped: controls.filter((control) => mappingCount(control.internal_mappings_count) > 0).length,
      sections: sections.length,
    };
  }, [controls, sections.length, totalControls]);

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
              Voltar ao catálogo
            </Link>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Catálogo externo</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {framework ? `${framework.code} ${framework.version || ""}` : "Controlos da framework"}
            </h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {framework?.name || "Lista de controlos externos importados."} Estes controlos são uma camada de
              referência: a implementação continua centrada nos controlos internos e nos respetivos mapeamentos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/governance/mapping-review?framework=${id || ""}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100"
            >
              <GitBranch className="h-4 w-4" />
              Ver mapeamentos
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={BookOpen} label="Controlos" value={metrics.total} />
        <MetricCard icon={CheckCircle2} label="Ativos nesta página" value={metrics.active} tone="text-emerald-600" />
        <MetricCard icon={ShieldCheck} label="Obrigatórios nesta página" value={metrics.mandatory} tone="text-amber-600" />
        <MetricCard icon={Layers} label="Secções" value={metrics.sections} tone="text-sky-600" />
        <MetricCard icon={GitBranch} label="Com mapping nesta página" value={metrics.mapped} tone="text-indigo-700" />
        <MetricCard
          icon={FileSearch}
          label="Score oficial"
          value={formatPercent(score?.score ?? score?.details?.coverage)}
          tone="text-slate-900"
        />
      </section>

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
            Usa esta página para consultar o catálogo da framework. Para demonstrar conformidade, valida os mapeamentos
            para controlos internos.
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
                <article key={String(control.id)} className="grid gap-4 p-5 hover:bg-slate-50/70 xl:grid-cols-[1fr_280px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
                        {controlLabel(control) || control.code || "Sem código"}
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
                    {control.implementation_guidance && (
                      <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3 text-xs font-semibold leading-relaxed text-slate-500">
                        <span className="font-bold uppercase tracking-wide text-slate-400">Orientação: </span>
                        {control.implementation_guidance}
                      </div>
                    )}
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
                        to={`/governance/mapping-review?frameworkControl=${control.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
                      >
                        <GitBranch className="h-4 w-4" />
                        Rever mappings
                      </Link>
                      <Link
                        to="/governance/framework-mapping/wizard"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Criar mapping
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
