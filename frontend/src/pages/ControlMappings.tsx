import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Target,
} from "lucide-react";
import {
  governanceApi,
  type ControlMappingOverview,
  type ControlMappingRecord,
  type FrameworkScore,
} from "@/lib/governanceApi";

function asArray<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getPaginatedCount(data: any) {
  if (Array.isArray(data)) return data.length;
  return Number(data?.count || data?.results?.length || 0);
}

function formatPercent(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return `${parsed.toFixed(parsed % 1 === 0 ? 0 : 1)}%`;
}

function progressWidth(count: number, total: number) {
  if (!total) return "0%";
  return `${Math.min(100, Math.max(0, (count / total) * 100))}%`;
}

function mappingTypeLabel(type: ControlMappingRecord["mapping_type"]) {
  if (type === "equivalent") return "Equivalente";
  if (type === "partial") return "Parcial";
  if (type === "supports") return "Suporta";
  return "Conflito";
}

function mappingTypeClass(type: ControlMappingRecord["mapping_type"]) {
  if (type === "equivalent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "supports") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function scoreClass(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-700">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function FrameworkScoreCard({ item }: { item: FrameworkScore }) {
  const hasControls = item.total_controls > 0;

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {item.framework_code} {item.version ? `| ${item.version}` : ""}
          </p>
          <h3 className="mt-2 truncate text-base font-bold text-slate-950" title={item.framework_name}>
            {item.framework_name}
          </h3>
        </div>
        <span className={`shrink-0 text-3xl font-bold tracking-tight ${scoreClass(item.score)}`}>
          {formatPercent(item.score)}
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
          <span>Desvio</span>
          <span>Conformidade</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-red-500" style={{ width: progressWidth(item.missing, item.total_controls) }} />
          <div className="bg-amber-400" style={{ width: progressWidth(item.partial, item.total_controls) }} />
          <div className="bg-emerald-500" style={{ width: progressWidth(item.implemented, item.total_controls) }} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Controlos" value={item.total_controls} />
        <MiniStat label="Mapeados" value={item.mapped_controls} />
        <MiniStat label="Evidencias" value={item.evidence_count} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cobertura de mapeamento</p>
          <p className="text-sm font-bold text-slate-900">{formatPercent(item.mapping_coverage)}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${item.mapping_coverage}%` }} />
        </div>
        {!hasControls && (
          <p className="mt-3 text-xs font-semibold text-slate-500">Framework sem controlos importados.</p>
        )}
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function PaginationControls({
  page,
  pageSize,
  totalItems,
  currentCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  currentCount: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const lastItem = totalItems === 0 ? 0 : Math.min(totalItems, firstItem + currentCount - 1);
  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <p className="text-xs font-bold text-slate-500">
        A mostrar {firstItem}-{lastItem} de {totalItems} mapeamento(s).
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          Por página
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {[25, 50, 100, 250].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!canGoBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[110px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!canGoForward}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Página seguinte"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ControlMappings() {
  const [overview, setOverview] = useState<ControlMappingOverview | null>(null);
  const [mappings, setMappings] = useState<ControlMappingRecord[]>([]);
  const [totalMappings, setTotalMappings] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceFramework, setSourceFramework] = useState("");
  const [targetFramework, setTargetFramework] = useState("");
  const [mappingType, setMappingType] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const frameworks = useMemo(() => overview?.framework_scores || [], [overview]);
  const scoredFrameworks = useMemo(
    () => frameworks.filter((framework) => framework.total_controls > 0),
    [frameworks]
  );

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const params: Record<string, any> = {
        page,
        page_size: pageSize,
        ordering: "-confidence",
      };
      if (sourceFramework) params.source_framework = sourceFramework;
      if (targetFramework) params.target_framework = targetFramework;
      if (mappingType) params.mapping_type = mappingType;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const [overviewRes, mappingsRes] = await Promise.all([
        governanceApi.getControlMappingOverview(),
        governanceApi.listControlMappings(params),
      ]);

      setOverview(overviewRes);
      setMappings(asArray<ControlMappingRecord>(mappingsRes));
      setTotalMappings(getPaginatedCount(mappingsRes));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao carregar o mapeamento de controlos.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [sourceFramework, targetFramework, mappingType, searchTerm, page, pageSize]);

  const rebuildMappings = async () => {
    try {
      setWorking(true);
      setMessage(null);
      const result = await governanceApi.rebuildControlMappings(1);
      setMessage(
        `Mapeamento atualizado: ${result.results.created_mappings} mapeamentos automáticos criados e ${result.results.skipped_existing_mappings} preservados.`
      );
      await loadData(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao atualizar o mapeamento.");
    } finally {
      setWorking(false);
    }
  };

  const recalculateScores = async () => {
    try {
      setWorking(true);
      setMessage(null);
      const result = await governanceApi.analyzeComplianceGaps();
      setMessage(
        `Scores recalculados: ${result.results.total_controls} controlos avaliados em ${result.results.total_frameworks} framework(s).`
      );
      await loadData(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao recalcular scores por framework.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <span className="text-sm font-bold uppercase tracking-wide">A carregar mapeamento...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-bold">
            <ShieldAlert className="h-5 w-5" />
            Erro ao carregar mapeamento
          </div>
          <p className="mt-2 text-sm font-medium">{error}</p>
          <button onClick={() => loadData()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const summary = overview?.mapping_summary;

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 pb-16">
      <header className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <Network className="h-3.5 w-3.5" />
              Mapeamento multi-framework
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Score por framework e mapeamento de controlos</h1>
              <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-500">
                Relaciona controlos de diferentes frameworks através dos mecanismos partilhados e calcula a postura de conformidade por referencial.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={recalculateScores}
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950 disabled:opacity-50"
            >
              <Activity className={working ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Recalcular scores
            </button>
            <button
              onClick={rebuildMappings}
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={working ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Atualizar mapeamento
            </button>
          </div>
        </div>
      </header>

      {message && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Mapeamentos"
          value={summary?.total_mappings || 0}
          detail="Relações controlo-controlo disponíveis para análise cruzada."
          icon={<Network className="h-5 w-5" />}
        />
        <SummaryCard
          label="Equivalentes"
          value={summary?.equivalent || 0}
          detail="Controlos com alinhamento forte por mecanismos comuns."
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <SummaryCard
          label="Parciais"
          value={summary?.partial || 0}
          detail="Controlos relacionados, mas com cobertura incompleta."
          icon={<ShieldHalf className="h-5 w-5" />}
        />
        <SummaryCard
          label="Controlos mapeados"
          value={summary?.mapped_controls || 0}
          detail={`${summary?.frameworks || 0} framework(s) ativas no repositório.`}
          icon={<Target className="h-5 w-5" />}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score por framework</p>
          <h2 className="text-xl font-bold text-slate-950">Postura de conformidade por referencial</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {(scoredFrameworks.length ? scoredFrameworks : frameworks).map((item) => (
            <FrameworkScoreCard key={item.framework_id} item={item} />
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pesquisa operacional</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Controlos relacionados entre frameworks</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:w-[920px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Pesquisar controlo..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <select
              value={sourceFramework}
              onChange={(event) => {
                setSourceFramework(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Framework origem</option>
              {frameworks.map((framework) => (
                <option key={framework.framework_id} value={framework.framework_id}>
                  {framework.framework_name}
                </option>
              ))}
            </select>
            <select
              value={targetFramework}
              onChange={(event) => {
                setTargetFramework(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Framework destino</option>
              {frameworks.map((framework) => (
                <option key={framework.framework_id} value={framework.framework_id}>
                  {framework.framework_name}
                </option>
              ))}
            </select>
            <select
              value={mappingType}
              onChange={(event) => {
                setMappingType(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Tipo de relação</option>
              <option value="equivalent">Equivalente</option>
              <option value="partial">Parcial</option>
              <option value="supports">Suporta</option>
              <option value="conflicts">Conflito</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Matriz de rastreabilidade</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">Mapeamentos inferidos e preservados</h3>
            </div>
            <p className="text-xs font-semibold text-slate-500">A mostrar {mappings.length} relação(ões).</p>
          </div>
        </div>

        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalItems={totalMappings}
          currentCount={mappings.length}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
        />

        {mappings.length === 0 ? (
          <div className="p-10 text-center">
            <Network className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-bold text-slate-900">Sem relações para os filtros atuais</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Ajuste os filtros ou atualize o mapeamento automático.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="p-4 pl-6">Origem</th>
                  <th className="p-4">Relação</th>
                  <th className="p-4">Destino</th>
                  <th className="p-4">Confiança</th>
                  <th className="p-4">Justificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {mappings.map((mapping) => (
                  <tr key={mapping.id} className="transition-colors hover:bg-slate-50">
                    <td className="min-w-[260px] p-4 pl-6 align-top">
                      <ControlCell
                        framework={mapping.source_framework_name}
                        code={mapping.source_control_code}
                        title={mapping.source_control_title}
                      />
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${mappingTypeClass(mapping.mapping_type)}`}>
                          {mappingTypeLabel(mapping.mapping_type)}
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </div>
                    </td>
                    <td className="min-w-[260px] p-4 align-top">
                      <ControlCell
                        framework={mapping.target_framework_name}
                        code={mapping.target_control_code}
                        title={mapping.target_control_title}
                      />
                    </td>
                    <td className="whitespace-nowrap p-4 align-top">
                      <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {Math.round(Number(mapping.confidence || 0) * 100)}%
                      </span>
                    </td>
                    <td className="min-w-[360px] p-4 align-top">
                      <p className="max-w-xl text-xs font-semibold leading-relaxed text-slate-500">
                        {mapping.rationale || "Sem justificação registada."}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mappings.length > 0 && (
          <PaginationControls
            page={page}
            pageSize={pageSize}
            totalItems={totalMappings}
            currentCount={mappings.length}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />
        )}
      </section>
    </div>
  );
}

function ControlCell({ framework, code, title }: { framework: string; code: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{framework}</p>
      <p className="mt-1 font-mono text-xs font-bold text-slate-950">{code}</p>
      <p className="mt-1 max-w-sm font-semibold leading-relaxed text-slate-600">{title}</p>
    </div>
  );
}