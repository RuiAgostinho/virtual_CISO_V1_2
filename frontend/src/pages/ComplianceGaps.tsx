import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Filter,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
} from "lucide-react";
import {
  governanceApi,
  type ComplianceGapRecord,
  type ComplianceSummary,
  type FrameworkScore,
} from "@/lib/governanceApi";

function asArray<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getPaginatedCount(data: any) {
  if (Array.isArray(data)) return data.length;
  return Number(data?.count || data?.results?.length || 0);
}

function progressWidth(count: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.min(100, Math.max(0, (count / total) * 100))}%`;
}

function formatPercent(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return `${parsed.toFixed(parsed % 1 === 0 ? 0 : 1)}%`;
}

function statusLabel(status: ComplianceGapRecord["status"]) {
  if (status === "IMPLEMENTED") return "Implementado";
  if (status === "PARTIAL") return "Parcial";
  return "Em falta";
}

function statusClass(status: ComplianceGapRecord["status"]) {
  if (status === "IMPLEMENTED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PARTIAL") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function statusDot(status: ComplianceGapRecord["status"]) {
  if (status === "IMPLEMENTED") return "bg-emerald-500";
  if (status === "PARTIAL") return "bg-amber-500";
  return "bg-red-500";
}

function scoreClass(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function evidenceNeed(gap: ComplianceGapRecord) {
  if (gap.status === "IMPLEMENTED") {
    return "Manter evidencias atualizadas e rever no proximo ciclo de conformidade.";
  }
  if (gap.evidence_count > 0) {
    return "Validar se as evidencias existentes cobrem o controlo e fechar findings abertos.";
  }
  return "Associar pelo menos uma evidencia rastreavel: politica, procedimento, configuracao, relatorio, ticket ou export de sistema.";
}

function nextAction(gap: ComplianceGapRecord) {
  if (gap.status === "IMPLEMENTED") {
    return "Confirmar que o controlo continua aplicavel e manter monitorizacao.";
  }
  if (gap.status === "PARTIAL") {
    return "Completar a evidencia em falta, rever findings e reexecutar o motor de conformidade.";
  }
  return "Criar ou associar um mecanismo de implementacao, recolher evidencia minima e reavaliar o controlo.";
}

function assistantPrompt(gap: ComplianceGapRecord) {
  return [
    `Como fecho este gap de conformidade?`,
    `Framework: ${gap.framework_code} ${gap.framework_version}`,
    `Controlo: ${gap.control_code} - ${gap.control_title}`,
    `Estado atual: ${statusLabel(gap.status)}`,
    `Evidencias registadas: ${gap.evidence_count}`,
    `Notas: ${gap.notes || "Sem notas"}`,
  ].join("\n");
}

function firstItemLabel(page: number, pageSize: number, totalItems: number) {
  if (totalItems === 0) return 0;
  return (page - 1) * pageSize + 1;
}

function lastItemLabel(page: number, pageSize: number, currentCount: number, totalItems: number) {
  if (totalItems === 0) return 0;
  return Math.min(totalItems, firstItemLabel(page, pageSize, totalItems) + currentCount - 1);
}

export default function ComplianceGaps() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [frameworkScores, setFrameworkScores] = useState<FrameworkScore[]>([]);
  const [gaps, setGaps] = useState<ComplianceGapRecord[]>([]);
  const [totalGaps, setTotalGaps] = useState(0);
  const [selectedGap, setSelectedGap] = useState<ComplianceGapRecord | null>(null);
  const [selectedFramework, setSelectedFramework] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);

  const measuredFrameworks = useMemo(
    () => frameworkScores.filter((framework) => framework.total_controls > 0),
    [frameworkScores]
  );
  const unconfiguredFrameworks = useMemo(
    () => frameworkScores.filter((framework) => framework.total_controls === 0),
    [frameworkScores]
  );

  const selectedFrameworkScore = useMemo(
    () => frameworkScores.find((framework) => framework.framework_id === selectedFramework) || null,
    [frameworkScores, selectedFramework]
  );

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const gapParams: Record<string, any> = {
        page,
        page_size: pageSize,
        ordering: "status_rank,evidence_count",
      };
      if (selectedFramework) gapParams.framework = selectedFramework;
      if (statusFilter) gapParams.status = statusFilter;
      if (searchTerm.trim()) gapParams.search = searchTerm.trim();

      const summaryParams = selectedFramework ? { framework: selectedFramework } : undefined;
      const [summaryRes, gapsRes, mappingRes] = await Promise.all([
        governanceApi.getComplianceSummary(summaryParams),
        governanceApi.listComplianceGaps(gapParams),
        governanceApi.getControlMappingOverview(),
      ]);

      const nextGaps = asArray<ComplianceGapRecord>(gapsRes);
      setSummary(summaryRes);
      setGaps(nextGaps);
      setTotalGaps(getPaginatedCount(gapsRes));
      setFrameworkScores(mappingRes.framework_scores || []);
      setSelectedGap((current) => {
        if (current && nextGaps.some((gap) => gap.id === current.id)) return current;
        return nextGaps[0] || null;
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao carregar dados de conformidade.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedFramework, statusFilter, searchTerm, page, pageSize]);

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      setError(null);
      setAnalysisMessage(null);

      const result = await governanceApi.analyzeComplianceGaps();
      setAnalysisMessage(
        `Analise concluida: ${result.results.total_controls} controlos avaliados em ${result.results.total_frameworks} framework(s).`
      );
      await loadData(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao recalcular o motor de conformidade.");
    } finally {
      setAnalyzing(false);
    }
  };

  const resetFilters = () => {
    setSelectedFramework("");
    setStatusFilter("");
    setSearchTerm("");
    setPage(1);
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center p-6 text-slate-400">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <span className="text-sm font-bold uppercase tracking-widest">A carregar motor de conformidade...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-3xl border border-red-100 bg-red-50 p-6 text-red-600">
          <ShieldAlert className="mb-4 h-12 w-12" />
          <h2 className="mb-2 text-xl font-black">Erro de comunicacao</h2>
          <p className="text-sm font-medium">{error}</p>
          <button
            onClick={() => loadData()}
            className="mt-6 rounded-xl bg-red-600 px-6 py-2 font-bold text-white shadow-lg transition-all hover:bg-red-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!summary || (summary.total === 0 && measuredFrameworks.length === 0)) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-slate-50 p-12 text-center text-slate-500">
          <LayoutDashboard className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-2xl font-black text-slate-900">Nenhum dado disponivel</h2>
          <p className="text-sm">
            O Compliance Gap Engine ainda nao avaliou nenhuma framework ou nao existem controlos ativos na plataforma.
          </p>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="mt-6 flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white shadow-lg transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analyzing ? <RefreshCw size={16} className="animate-spin" /> : <Activity size={16} />}
            {analyzing ? "A recalcular..." : "Executar analise"}
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalGaps / pageSize));

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-6 pb-20 md:p-8">
      <header className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Motor de analise de desvios
            </span>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950">Compliance gaps</h1>
              <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-500">
                Painel operacional para transformar controlos em falta em mecanismos, evidencias e decisoes rastreaveis.
              </p>
            </div>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            {analyzing ? "A recalcular..." : "Recalcular motor"}
          </button>
        </div>
      </header>

      {analysisMessage && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
          {analysisMessage}
        </div>
      )}

      {unconfiguredFrameworks.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-600">
          {unconfiguredFrameworks.length} framework(s) estao registadas mas sem controlos importados. Nao sao interpretadas como nao conformidade.
        </div>
      )}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {selectedFrameworkScore ? `${selectedFrameworkScore.framework_code} ${selectedFrameworkScore.version || ""}` : "Conformidade global"}
              </p>
              <div className="mt-4 flex items-end gap-3">
                <span className={`text-6xl font-black tracking-tight ${summary.score >= 80 ? "text-emerald-400" : summary.score >= 50 ? "text-amber-300" : "text-red-400"}`}>
                  {formatPercent(summary.score)}
                </span>
                <span className="pb-3 text-xs font-bold uppercase tracking-widest text-slate-500">score</span>
              </div>
            </div>
            <ShieldCheck className="h-12 w-12 text-slate-700" />
          </div>

          <p className="mt-5 max-w-lg text-sm font-medium leading-relaxed text-slate-400">
            Calculado com base em {summary.total} controlo(s) avaliados. A leitura distingue controlos em falta, parciais e implementados.
          </p>

          <div className="mt-6">
            <div className="mb-2 flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
              <span>Desvio</span>
              <span>Conformidade</span>
            </div>
            <div className="flex h-4 overflow-hidden rounded-full bg-slate-800">
              <div className="bg-red-500" style={{ width: progressWidth(summary.missing, summary.total) }} />
              <div className="bg-amber-400" style={{ width: progressWidth(summary.partial, summary.total) }} />
              <div className="bg-emerald-500" style={{ width: progressWidth(summary.implemented, summary.total) }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard icon={<ShieldAlert size={20} />} tone="red" label="Em falta" value={summary.missing} text="Sem evidencia suficiente para demonstrar implementacao." />
          <MetricCard icon={<ShieldHalf size={20} />} tone="amber" label="Parciais" value={summary.partial} text="Com suporte incompleto ou findings ainda ativos." />
          <MetricCard icon={<ShieldCheck size={20} />} tone="emerald" label="Implementados" value={summary.implemented} text="Suportados por evidencia e sem findings ativos." />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Frameworks avaliadas</p>
          <h2 className="text-xl font-black text-slate-950">Score operacional por referencial</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {measuredFrameworks.map((framework) => (
            <button
              key={framework.framework_id}
              type="button"
              onClick={() => {
                setSelectedFramework(framework.framework_id);
                setPage(1);
              }}
              className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md ${
                selectedFramework === framework.framework_id ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {framework.framework_code} {framework.version ? `| ${framework.version}` : ""}
                  </p>
                  <h3 className="mt-2 truncate text-base font-black text-slate-950" title={framework.framework_name}>
                    {framework.framework_name}
                  </h3>
                </div>
                <span className={`shrink-0 text-3xl font-black tracking-tight ${scoreClass(framework.score)}`}>
                  {formatPercent(framework.score)}
                </span>
              </div>
              <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-red-500" style={{ width: progressWidth(framework.missing, framework.total_controls) }} />
                <div className="bg-amber-400" style={{ width: progressWidth(framework.partial, framework.total_controls) }} />
                <div className="bg-emerald-500" style={{ width: progressWidth(framework.implemented, framework.total_controls) }} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Falta" value={framework.missing} />
                <MiniStat label="Parcial" value={framework.partial} />
                <MiniStat label="Evid." value={framework.evidence_count} />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fila de trabalho</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Gaps a tratar</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_auto] xl:w-[820px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Pesquisar por controlo..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <select
              value={selectedFramework}
              onChange={(event) => {
                setSelectedFramework(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Todas as frameworks</option>
              {measuredFrameworks.map((framework) => (
                <option key={framework.framework_id} value={framework.framework_id}>
                  {framework.framework_code} {framework.version}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950"
            >
              <Filter className="h-4 w-4" />
              Limpar
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { value: "", label: "Todos" },
            { value: "MISSING", label: "Em falta" },
            { value: "PARTIAL", label: "Parciais" },
            { value: "IMPLEMENTED", label: "Implementados" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setStatusFilter(item.value);
                setPage(1);
              }}
              className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${
                statusFilter === item.value
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-3">
          {gaps.length === 0 ? (
            <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <h3 className="mt-4 text-lg font-black text-slate-950">Sem gaps para os filtros atuais</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">Ajuste os filtros ou reexecute a analise de conformidade.</p>
            </div>
          ) : (
            gaps.map((gap) => (
              <button
                key={gap.id}
                type="button"
                onClick={() => setSelectedGap(gap)}
                className={`w-full rounded-2xl border bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md ${
                  selectedGap?.id === gap.id ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(gap.status)}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(gap.status)}`} />
                        {statusLabel(gap.status)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {gap.framework_code} {gap.framework_version}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-black text-slate-950">
                      {gap.control_code} - {gap.control_title}
                    </h3>
                    <p className="mt-2 line-clamp-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">
                      {gap.notes || "Sem notas de avaliacao registadas."}
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-2 lg:w-[260px]">
                    <MiniStat label="Evid." value={gap.evidence_count} />
                    <MiniStat label="Conf." value={Math.round(Number(gap.confidence_score || 0) * 100)} />
                    <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400">
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}

          <PaginationControls
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            totalItems={totalGaps}
            currentCount={gaps.length}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />
        </div>

        <GapActionPanel gap={selectedGap} />
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  text,
}: {
  icon: ReactNode;
  tone: "red" | "amber" | "emerald";
  label: string;
  value: number;
  text: string;
}) {
  const tones = {
    red: "border-red-100 bg-red-50 text-red-600",
    amber: "border-amber-100 bg-amber-50 text-amber-600",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-600",
  };
  const textTones = {
    red: "text-red-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
        <span className="text-3xl font-black tracking-tighter text-slate-900">{value}</span>
      </div>
      <h3 className={`text-sm font-black uppercase tracking-widest ${textTones[tone]}`}>{label}</h3>
      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function PaginationControls({
  page,
  pageSize,
  totalPages,
  totalItems,
  currentCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  currentCount: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <p className="text-xs font-bold text-slate-500">
        A mostrar {firstItemLabel(page, pageSize, totalItems)}-{lastItemLabel(page, pageSize, currentCount, totalItems)} de {totalItems} gap(s).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          Por pagina
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Pagina anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[110px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-xs font-black uppercase tracking-widest text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Pagina seguinte"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function GapActionPanel({ gap }: { gap: ComplianceGapRecord | null }) {
  if (!gap) {
    return (
      <aside className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <ListChecks className="h-10 w-10 text-slate-300" />
        <h3 className="mt-4 text-lg font-black text-slate-950">Selecione um gap</h3>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
          Ao selecionar um controlo, o painel mostra a evidencia minima, a proxima acao e um prompt preparado para o Virtual CISO.
        </p>
      </aside>
    );
  }

  return (
    <aside className="sticky top-6 self-start rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Plano de acao do gap</p>
          <h3 className="mt-2 text-xl font-black leading-tight text-slate-950">{gap.control_code}</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(gap.status)}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot(gap.status)}`} />
          {statusLabel(gap.status)}
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">{gap.control_title}</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniStat label="Evidencias" value={gap.evidence_count} />
        <MiniStat label="Confianca" value={Math.round(Number(gap.confidence_score || 0) * 100)} />
      </div>

      <div className="mt-6 space-y-4">
        <ActionStep
          icon={<FileCheck2 className="h-4 w-4" />}
          label="Evidencia minima"
          text={evidenceNeed(gap)}
        />
        <ActionStep
          icon={<ListChecks className="h-4 w-4" />}
          label="Proxima acao"
          text={nextAction(gap)}
        />
      </div>

      {gap.notes && (
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notas do motor</p>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{gap.notes}</p>
        </div>
      )}

      <Link
        to={`/ciso-assistant?q=${encodeURIComponent(assistantPrompt(gap))}`}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-indigo-700"
      >
        <MessageCircle className="h-4 w-4" />
        Perguntar ao Virtual CISO
      </Link>
    </aside>
  );
}

function ActionStep({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">{text}</p>
      </div>
    </div>
  );
}