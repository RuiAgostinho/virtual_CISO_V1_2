import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, BookOpen, GitBranch, Layers, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { governanceApi, type FrameworkRecord, type FrameworkScore, type PaginatedResponse } from "@/lib/governanceApi";

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

function scoreTone(score: unknown) {
  const numeric = Number(score);
  if (numeric >= 80) return "text-emerald-600";
  if (numeric >= 50) return "text-amber-600";
  return "text-red-600";
}

function progressWidth(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.min(100, Math.max(0, (value / total) * 100))}%`;
}

export default function FrameworkView() {
  const [searchParams] = useSearchParams();
  const searchFromUrl = searchParams.get("search") || "";
  const [frameworks, setFrameworks] = useState<FrameworkRecord[]>([]);
  const [frameworkScores, setFrameworkScores] = useState<FrameworkScore[]>([]);
  const [search, setSearch] = useState(searchFromUrl);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalFrameworks, setTotalFrameworks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, overview] = await Promise.all([
        governanceApi.getFrameworks({
          page,
          page_size: pageSize,
          ordering: "code",
          search: search.trim() || undefined,
        }),
        governanceApi.getControlMappingOverview().catch(() => null),
      ]);
      const items = unwrap<FrameworkRecord>(data);
      setFrameworks(items);
      setTotalFrameworks(getTotal<FrameworkRecord>(data, items.length));
      setFrameworkScores(overview?.framework_scores || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar as frameworks."));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearch(searchFromUrl);
    setPage(1);
  }, [searchFromUrl]);

  const scoreByFramework = useMemo(() => {
    return new Map(frameworkScores.map((score) => [String(score.framework_id), score]));
  }, [frameworkScores]);

  const metrics = useMemo(() => {
    const scored = frameworkScores.filter((framework) => Number.isFinite(Number(framework.score)));
    return {
      total: totalFrameworks,
      active: frameworks.filter((framework) => framework.is_active !== false).length,
      controls: frameworks.reduce((sum, framework) => sum + Number(framework.controls_count || 0), 0),
      sections: frameworks.reduce((sum, framework) => sum + Number(framework.sections_count || 0), 0),
      averageScore: scored.length
        ? scored.reduce((sum, framework) => sum + Number(framework.score || 0), 0) / scored.length
        : undefined,
    };
  }, [frameworkScores, frameworks, totalFrameworks]);

  const totalPages = Math.max(1, Math.ceil(totalFrameworks / pageSize));

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Compliance e rastreabilidade</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Frameworks e postura organizacional</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              Porta de entrada para a postura por referencial: score, cobertura, controlos em falta,
              mecanismos e evidências que sustentam cada conclusão.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={BookOpen} label="Frameworks" value={metrics.total} />
        <MetricCard icon={ShieldCheck} label="Ativas nesta página" value={metrics.active} tone="text-emerald-600" />
        <MetricCard icon={Layers} label="Controlos nesta página" value={metrics.controls} tone="text-indigo-700" />
        <MetricCard icon={Activity} label="Secções nesta página" value={metrics.sections} tone="text-sky-600" />
        <MetricCard icon={GitBranch} label="Score médio" value={formatPercent(metrics.averageScore)} tone="text-amber-600" />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Pesquisar por código, nome, versão ou entidade publicadora..."
            className="h-12 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          />
        </label>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400 shadow-sm">
          A carregar frameworks...
        </div>
      ) : frameworks.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">
            Nenhuma framework encontrada.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {frameworks.map((framework) => (
              <FrameworkPostureCard
                key={framework.id}
                framework={framework}
                score={scoreByFramework.get(String(framework.id))}
              />
            ))}
          </div>
          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalItems={totalFrameworks}
            totalPages={totalPages}
            currentCount={frameworks.length}
            onPageChange={setPage}
            onPageSizeChange={(value) => {
              setPageSize(value);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}

function FrameworkPostureCard({ framework, score }: { framework: FrameworkRecord; score?: FrameworkScore }) {
  const totalControls = Number(score?.total_controls || framework.controls_count || 0);
  const mappedControls = Number(score?.mapped_controls || 0);
  const missing = Number(score?.missing || 0);
  const partial = Number(score?.partial || 0);
  const implemented = Number(score?.implemented || 0);
  const mappingCoverage = score?.mapping_coverage ?? (totalControls ? (mappedControls / totalControls) * 100 : undefined);

  return (
    <article className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-bold text-slate-950">{framework.code}</h3>
            <p className="text-xs font-medium text-slate-500">v{framework.version || "-"}</p>
          </div>
        </div>
        {framework.is_active !== false ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Ativa
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Inativa
          </span>
        )}
      </div>

      <div className="flex-1">
        <h4 className="font-semibold text-slate-900">{framework.name}</h4>
        <p className="mt-2 line-clamp-3 text-sm text-slate-500">
          {framework.description || "Sem descrição disponível."}
        </p>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Postura oficial</p>
              <p className={`mt-1 text-3xl font-bold ${scoreTone(score?.score)}`}>{formatPercent(score?.score)}</p>
            </div>
            <div className="text-right text-xs font-bold text-slate-500">
              <p>{mappedControls}/{totalControls} mapeados</p>
              <p>{formatPercent(mappingCoverage)} cobertura</p>
            </div>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white">
            <div className="bg-red-500" style={{ width: progressWidth(missing, totalControls) }} />
            <div className="bg-amber-400" style={{ width: progressWidth(partial, totalControls) }} />
            <div className="bg-emerald-500" style={{ width: progressWidth(implemented, totalControls) }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <span>Falta {missing}</span>
            <span>Parcial {partial}</span>
            <span>Ok {implemented}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-bold text-slate-950">{framework.controls_count ?? "-"}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-bold text-slate-950">{framework.sections_count ?? "-"}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Secções</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-lg font-bold text-slate-950">{score?.evidence_count ?? "-"}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidências</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
        <Link
          to={`/catalogs/frameworks/${framework.id}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"
        >
          <ShieldCheck className="h-4 w-4" />
          Ver postura
        </Link>
        <Link
          to={`/governance/traceability?type=framework&id=${framework.id}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
        >
          <GitBranch className="h-4 w-4" />
          Rastrear
        </Link>
      </div>
    </article>
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
        A mostrar {firstItem}-{lastItem} de {totalItems} framework(s).
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase tracking-wide text-slate-600"
        >
          {[6, 12, 24, 48].map((size) => (
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
