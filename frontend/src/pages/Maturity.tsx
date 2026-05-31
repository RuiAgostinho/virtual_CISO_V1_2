import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Flag,
  ListChecks,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  governanceApi,
  type AssessmentEvidence,
  type AssessmentRecommendation,
  type AssessmentSummary,
  type ControlAssessmentRecord,
  type ControlAssessmentStatus,
  type FrameworkScore,
  type PaginatedResponse,
  type QueryParams,
} from "@/lib/governanceApi";

function asArray<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getPaginatedCount<T>(data: T[] | PaginatedResponse<T> | null | undefined) {
  if (Array.isArray(data)) return data.length;
  return Number(data?.count || data?.results?.length || 0);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatPercent(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return `${parsed.toFixed(parsed % 1 === 0 ? 0 : 1)}%`;
}

function statusLabel(status: ControlAssessmentStatus) {
  const labels: Record<ControlAssessmentStatus, string> = {
    not_started: "Nao iniciado",
    planned: "Planeado",
    partial: "Parcial",
    implemented: "Implementado",
    optimized: "Otimizado",
  };
  return labels[status] || status;
}

function statusClass(status: ControlAssessmentStatus) {
  if (status === "implemented" || status === "optimized") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "planned") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function gapClass(status?: ControlAssessmentRecord["gap_status"]) {
  if (status === "IMPLEMENTED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PARTIAL") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "MISSING") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function gapLabel(status?: ControlAssessmentRecord["gap_status"]) {
  if (status === "IMPLEMENTED") return "Gap fechado";
  if (status === "PARTIAL") return "Gap parcial";
  if (status === "MISSING") return "Gap em falta";
  return "Sem gap";
}

function assessmentPrompt(item: ControlAssessmentRecord) {
  return [
    "Ajuda-me a preparar a avaliacao deste controlo.",
    `Framework: ${item.framework_code} ${item.framework_version}`,
    `Controlo: ${item.control_code} - ${item.control_title}`,
    `Estado da avaliacao: ${statusLabel(item.implementation_status)}`,
    `Nivel de maturidade: ${item.maturity_level}`,
    `Eficacia: ${formatPercent(Number(item.effectiveness) * 100)}`,
    `Evidencias: ${item.evidence_count}`,
    `Findings abertos: ${item.open_finding_count}`,
    `Notas: ${item.notes || "Sem notas"}`,
  ].join("\n");
}

function progressWidth(count: number, total: number) {
  if (!total) return "0%";
  return `${Math.min(100, Math.max(0, (count / total) * 100))}%`;
}

export default function Maturity() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [frameworkScores, setFrameworkScores] = useState<FrameworkScore[]>([]);
  const [selectedFramework, setSelectedFramework] = useState(() => searchParams.get("framework") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("implementation_status") || "");
  const [gapFilter, setGapFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [summary, setSummary] = useState<AssessmentSummary | null>(null);
  const [assessments, setAssessments] = useState<ControlAssessmentRecord[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<ControlAssessmentRecord | null>(null);
  const [totalAssessments, setTotalAssessments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const measuredFrameworks = useMemo(
    () => frameworkScores.filter((framework) => framework.total_controls > 0),
    [frameworkScores]
  );
  const selectedFrameworkScore = useMemo(
    () => frameworkScores.find((framework) => framework.framework_id === selectedFramework) || null,
    [frameworkScores, selectedFramework]
  );

  const loadMeta = useCallback(async () => {
    const overview = await governanceApi.getControlMappingOverview();
    const frameworks = overview.framework_scores || [];
    setFrameworkScores(frameworks);
    setSelectedFramework((current) => {
      if (current) return current;
      const first = frameworks.find((framework) => framework.total_controls > 0);
      return first?.framework_id || "";
    });
  }, []);

  const loadAssessments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const params: QueryParams = {
        page,
        page_size: pageSize,
        ordering: "control__code",
      };
      const summaryParams: QueryParams = {};
      if (selectedFramework) {
        params.framework = selectedFramework;
        summaryParams.framework = selectedFramework;
      }
      if (statusFilter) params.implementation_status = statusFilter;
      if (gapFilter) params.gap_status = gapFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const [summaryRes, assessmentsRes] = await Promise.all([
        governanceApi.getControlAssessmentSummary(summaryParams),
        governanceApi.listControlAssessments(params),
      ]);

      const nextAssessments = asArray<ControlAssessmentRecord>(assessmentsRes);
      setSummary(summaryRes);
      setAssessments(nextAssessments);
      setTotalAssessments(getPaginatedCount(assessmentsRes));
      setSelectedAssessment((current) => {
        const refreshedCurrent = current ? nextAssessments.find((item) => item.id === current.id) : null;
        if (refreshedCurrent) return refreshedCurrent;
        return nextAssessments[0] || null;
      });
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Falha ao carregar avaliacoes de conformidade."));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [gapFilter, page, pageSize, searchTerm, selectedFramework, statusFilter]);

  useEffect(() => {
    loadMeta().catch((err: unknown) => {
      console.error(err);
      setError(getErrorMessage(err, "Falha ao carregar frameworks."));
      setLoading(false);
    });
  }, [loadMeta]);

  useEffect(() => {
    void loadAssessments();
  }, [loadAssessments]);

  const bootstrapAssessments = async () => {
    if (!selectedFramework) return;
    try {
      setWorking(true);
      setMessage(null);
      const result = await governanceApi.bootstrapControlAssessments({
        framework: selectedFramework,
        profile_type: "baseline",
        maturity_model: "Virtual CISO",
      });
      setMessage(
        `Avaliação inicializada: ${result.created} novas avaliacao(oes), ${result.existing} existentes.`
      );
      await loadAssessments(false);
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Falha ao inicializar avaliacoes."));
    } finally {
      setWorking(false);
    }
  };

  const updateAssessment = async (id: string, payload: Partial<ControlAssessmentRecord>) => {
    try {
      setWorking(true);
      const updated = await governanceApi.updateControlAssessment(id, payload);
      setAssessments((current) => current.map((item) => (item.id === id ? updated : item)));
      setSelectedAssessment(updated);
      setMessage("Avaliação atualizada e gap recalculado.");
      await loadAssessments(false);
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Falha ao atualizar avaliacao."));
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <span className="text-sm font-bold uppercase tracking-wide">A carregar avaliacoes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-bold">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar avaliacoes
          </div>
          <p className="mt-2 text-sm font-medium">{error}</p>
          <button onClick={() => void loadAssessments()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const hasAssessments = (summary?.total || 0) > 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-6 pb-20 md:p-8">
      <header className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Validacao humana de conformidade
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Avaliações de conformidade</h1>
              <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-500">
                Confirma o estado dos controlos, associa evidencias, regista findings e transforma gaps em plano de acao.
              </p>
            </div>
          </div>
          <button
            onClick={bootstrapAssessments}
            disabled={working || !selectedFramework}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Inicializar framework
          </button>
        </div>
      </header>

      {message && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {selectedFrameworkScore ? `${selectedFrameworkScore.framework_code} ${selectedFrameworkScore.version || ""}` : "Todas as frameworks"}
              </p>
              <div className="mt-4 flex items-end gap-3">
                <span className={`text-6xl font-bold tracking-tight ${
                  (summary?.score || 0) >= 80 ? "text-emerald-400" : (summary?.score || 0) >= 50 ? "text-amber-300" : "text-red-400"
                }`}>
                  {formatPercent(summary?.score || 0)}
                </span>
                <span className="pb-3 text-xs font-bold uppercase tracking-wide text-slate-500">score de avaliacao</span>
              </div>
            </div>
            <ShieldCheck className="h-12 w-12 text-slate-700" />
          </div>

          <p className="mt-5 max-w-lg text-sm font-medium leading-relaxed text-slate-400">
            Score calculado pela avaliacao humana: implementado/otimizado conta a 100%, parcial a 50% e planeado a 25%.
          </p>

          <div className="mt-6">
            <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span>Nao iniciado</span>
              <span>Implementado</span>
            </div>
            <div className="flex h-4 overflow-hidden rounded-full bg-slate-800">
              <div className="bg-slate-500" style={{ width: progressWidth(summary?.not_started || 0, summary?.total || 0) }} />
              <div className="bg-blue-500" style={{ width: progressWidth(summary?.planned || 0, summary?.total || 0) }} />
              <div className="bg-amber-400" style={{ width: progressWidth(summary?.partial || 0, summary?.total || 0) }} />
              <div className="bg-emerald-500" style={{ width: progressWidth(summary?.implemented || 0, summary?.total || 0) }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard icon={<ListChecks />} tone="slate" label="Controlos" value={summary?.total || 0} text="No ciclo de avaliacao selecionado." />
          <MetricCard icon={<FileCheck2 />} tone="indigo" label="Com evidencia" value={summary?.with_evidence || 0} text="Controlos suportados por evidencias formais." />
          <MetricCard icon={<Flag />} tone="red" label="Findings abertos" value={summary?.with_open_findings || 0} text="Controlos com desvios ainda ativos." />
          <MetricCard icon={<Activity />} tone="amber" label="Acoes abertas" value={summary?.actions_open || 0} text="Planos de melhoria por concluir." />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Escopo da avaliacao</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Framework, estado e pesquisa</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_1.4fr] xl:w-[980px]">
            <select
              value={selectedFramework}
              onChange={(event) => {
                const nextFramework = event.target.value;
                setSelectedFramework(nextFramework);
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (nextFramework) {
                    next.set("framework", nextFramework);
                  } else {
                    next.delete("framework");
                  }
                  return next;
                });
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
            <select
              value={statusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value;
                setStatusFilter(nextStatus);
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (selectedFramework) {
                    next.set("framework", selectedFramework);
                  }
                  if (nextStatus) {
                    next.set("implementation_status", nextStatus);
                  } else {
                    next.delete("implementation_status");
                  }
                  return next;
                });
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Todos os estados</option>
              <option value="not_started">Nao iniciado</option>
              <option value="planned">Planeado</option>
              <option value="partial">Parcial</option>
              <option value="implemented">Implementado</option>
              <option value="optimized">Otimizado</option>
            </select>
            <select
              value={gapFilter}
              onChange={(event) => {
                setGapFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Todos os gaps</option>
              <option value="MISSING">Gap em falta</option>
              <option value="PARTIAL">Gap parcial</option>
              <option value="IMPLEMENTED">Gap fechado</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Pesquisar por codigo, titulo ou avaliador..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>
      </section>

      {!hasAssessments ? (
        <section className="rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <Sparkles className="mx-auto h-12 w-12 text-indigo-400" />
          <h3 className="mt-4 text-lg font-bold text-slate-950">Ainda nao ha avaliacoes para este escopo</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
            Inicialize a framework para criar uma avaliacao baseline para cada controlo. Depois pode validar estados, anexar evidencias e abrir findings.
          </p>
          <button
            type="button"
            onClick={bootstrapAssessments}
            disabled={working || !selectedFramework}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700 disabled:opacity-60"
          >
            {working ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar avaliacoes baseline
          </button>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-3">
            {assessments.map((assessment) => (
              <button
                key={assessment.id}
                type="button"
                onClick={() => setSelectedAssessment(assessment)}
                className={`w-full rounded-2xl border bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-md ${
                  selectedAssessment?.id === assessment.id ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(assessment.implementation_status)}`}>
                        {statusLabel(assessment.implementation_status)}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${gapClass(assessment.gap_status)}`}>
                        {gapLabel(assessment.gap_status)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {assessment.framework_code} {assessment.framework_version}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-950">
                      {assessment.control_code} - {assessment.control_title}
                    </h3>
                    <p className="mt-2 line-clamp-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">
                      {assessment.notes || assessment.control_description || "Sem notas de avaliacao."}
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-4 gap-2 lg:w-[330px]">
                    <MiniStat label="Mat." value={assessment.maturity_level} />
                    <MiniStat label="Evid." value={assessment.evidence_count} />
                    <MiniStat label="Find." value={assessment.open_finding_count} />
                    <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400">
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </button>
            ))}

            <PaginationControls
              page={page}
              pageSize={pageSize}
              totalPages={Math.max(1, Math.ceil(totalAssessments / pageSize))}
              totalItems={totalAssessments}
              currentCount={assessments.length}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
            />
          </div>

          <AssessmentDetailPanel
            assessment={selectedAssessment}
            working={working}
            onUpdate={updateAssessment}
            onReload={() => loadAssessments(false)}
          />
        </section>
      )}
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
  tone: "slate" | "indigo" | "emerald" | "amber" | "red";
  label: string;
  value: number;
  text: string;
}) {
  const tones = {
    slate: "border-slate-100 bg-slate-50 text-slate-600",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
        <span className="text-3xl font-bold tracking-tighter text-slate-900">{value}</span>
      </div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{label}</h3>
      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
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
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = totalItems === 0 ? 0 : Math.min(totalItems, firstItem + currentCount - 1);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <p className="text-xs font-bold text-slate-500">
        A mostrar {firstItem}-{lastItem} de {totalItems} avaliacao(oes).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          Por pagina
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Pagina anterior</span>
          {"<"}
        </button>
        <span className="min-w-[110px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-600">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Pagina seguinte</span>
          {">"}
        </button>
      </div>
    </div>
  );
}

function AssessmentDetailPanel({
  assessment,
  working,
  onUpdate,
  onReload,
}: {
  assessment: ControlAssessmentRecord | null;
  working: boolean;
  onUpdate: (id: string, payload: Partial<ControlAssessmentRecord>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [assessedBy, setAssessedBy] = useState("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState<AssessmentEvidence["evidence_type"]>("policy");
  const [findingTitle, setFindingTitle] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [busyLocal, setBusyLocal] = useState(false);
  const [recommendation, setRecommendation] = useState<AssessmentRecommendation | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);

  useEffect(() => {
    setNotes(assessment?.notes || "");
    setAssessedBy(assessment?.assessed_by || "");
    setEvidenceTitle("");
    setFindingTitle("");
    setActionTitle("");
  }, [assessment?.assessed_by, assessment?.id, assessment?.notes]);

  useEffect(() => {
    setRecommendation(null);
    setRecommendationError(null);
  }, [
    assessment?.id,
    assessment?.evidence_count,
    assessment?.finding_count,
    assessment?.action_count,
    assessment?.implementation_status,
  ]);

  if (!assessment) {
    return (
      <aside className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <ClipboardCheck className="h-10 w-10 text-slate-300" />
        <h3 className="mt-4 text-lg font-bold text-slate-950">Selecione uma avaliacao</h3>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
          O detalhe permite validar estado, registar evidencia, abrir findings e preparar a pergunta ao Virtual CISO.
        </p>
      </aside>
    );
  }

  const createEvidence = async () => {
    if (!evidenceTitle.trim()) return;
    setBusyLocal(true);
    try {
      await governanceApi.createAssessmentEvidence({
        assessment: assessment.id,
        title: evidenceTitle.trim(),
        evidence_type: evidenceType,
      });
      await onReload();
      setEvidenceTitle("");
    } finally {
      setBusyLocal(false);
    }
  };

  const createFinding = async () => {
    if (!findingTitle.trim()) return;
    setBusyLocal(true);
    try {
      await governanceApi.createAssessmentFinding({
        assessment: assessment.id,
        title: findingTitle.trim(),
        description: findingTitle.trim(),
        severity: "medium",
        status: "open",
      });
      await onReload();
      setFindingTitle("");
    } finally {
      setBusyLocal(false);
    }
  };

  const createAction = async () => {
    if (!actionTitle.trim()) return;
    setBusyLocal(true);
    try {
      await governanceApi.createImprovementAction({
        assessment: assessment.id,
        title: actionTitle.trim(),
        plan: actionTitle.trim(),
        status: "open",
      });
      await onReload();
      setActionTitle("");
    } finally {
      setBusyLocal(false);
    }
  };

  const loadRecommendation = async () => {
    if (!assessment) return;
    setLoadingRecommendation(true);
    setRecommendationError(null);
    try {
      const result = await governanceApi.getControlAssessmentRecommendation(assessment.id);
      setRecommendation(result);
    } catch (err: unknown) {
      console.error(err);
      setRecommendationError(getErrorMessage(err, "Falha ao gerar sugestao."));
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const applySuggestedStatus = async () => {
    if (!assessment || !recommendation) return;
    await onUpdate(assessment.id, { implementation_status: recommendation.suggested_status });
    setRecommendation(null);
  };

  return (
    <aside className="sticky top-6 self-start rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Validacao do controlo</p>
          <h3 className="mt-2 text-xl font-bold leading-tight text-slate-950">{assessment.control_code}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(assessment.implementation_status)}`}>
          {statusLabel(assessment.implementation_status)}
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">{assessment.control_title}</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MiniStat label="Evid." value={assessment.evidence_count} />
        <MiniStat label="Find." value={assessment.open_finding_count} />
        <MiniStat label="Acoes" value={assessment.open_action_count} />
      </div>

      <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Assistente de avaliacao</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
              Sugestao baseada nas evidencias, findings, mecanismos e gap atual.
            </p>
          </div>
          <button
            type="button"
            onClick={loadRecommendation}
            disabled={loadingRecommendation || working || busyLocal}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
          >
            {loadingRecommendation ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Sugerir
          </button>
        </div>

        {recommendationError && (
          <p className="mt-3 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-600">
            {recommendationError}
          </p>
        )}

        {recommendation && (
          <div className="mt-4 space-y-4 rounded-2xl border border-white bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(recommendation.suggested_status)}`}>
                {recommendation.suggested_status_label}
              </span>
              <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Confianca {Math.round(recommendation.confidence * 100)}%
              </span>
            </div>
            <p className="text-sm font-semibold leading-relaxed text-slate-700">{recommendation.executive_summary}</p>

            <div className="grid grid-cols-2 gap-2">
              {recommendation.traceability.map((item) => (
                <MiniStat key={item.label} label={item.label} value={item.value ?? 0} />
              ))}
            </div>

            <RecommendationList title="Porque" items={recommendation.rationale} />
            <RecommendationList title="Em falta" items={recommendation.missing_evidence} empty="Sem lacunas críticas identificadas." />
            <RecommendationList title="Proximas acoes" items={recommendation.next_actions} />

            <button
              type="button"
              onClick={applySuggestedStatus}
              disabled={working || recommendation.suggested_status === assessment.implementation_status}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
            >
              <CheckCircle2 className="h-4 w-4" />
              Aplicar estado sugerido
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estado</span>
          <select
            value={assessment.implementation_status}
            onChange={(event) => onUpdate(assessment.id, { implementation_status: event.target.value as ControlAssessmentStatus })}
            disabled={working}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="not_started">Nao iniciado</option>
            <option value="planned">Planeado</option>
            <option value="partial">Parcial</option>
            <option value="implemented">Implementado</option>
            <option value="optimized">Otimizado</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Notas do avaliador</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="Registe a justificacao da avaliacao..."
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Avaliado por</span>
          <input
            value={assessedBy}
            onChange={(event) => setAssessedBy(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="Nome ou equipa"
          />
        </label>

        <button
          type="button"
          onClick={() => onUpdate(assessment.id, { notes, assessed_by: assessedBy })}
          disabled={working}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700 disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" />
          Guardar avaliacao
        </button>
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <QuickAdd
          icon={<FileCheck2 className="h-4 w-4" />}
          label="Adicionar evidencia"
          value={evidenceTitle}
          onChange={setEvidenceTitle}
          placeholder="Ex.: Politica aprovada, ticket, log..."
          extra={
            <select
              value={evidenceType}
              onChange={(event) => setEvidenceType(event.target.value as AssessmentEvidence["evidence_type"])}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              <option value="policy">Politica</option>
              <option value="procedure">Procedimento</option>
              <option value="log">Log</option>
              <option value="ticket">Ticket</option>
              <option value="config">Configuração</option>
              <option value="screenshot">Screenshot</option>
            </select>
          }
          disabled={busyLocal}
          onSubmit={createEvidence}
        />
        <QuickAdd
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Abrir finding"
          value={findingTitle}
          onChange={setFindingTitle}
          placeholder="Ex.: Falta evidencia técnica de MFA"
          disabled={busyLocal}
          onSubmit={createFinding}
        />
        <QuickAdd
          icon={<Flag className="h-4 w-4" />}
          label="Criar acao de melhoria"
          value={actionTitle}
          onChange={setActionTitle}
          placeholder="Ex.: Recolher export de configuracao"
          disabled={busyLocal}
          onSubmit={createAction}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white">
        <DetailList title="Evidencias" empty="Sem evidencias registadas." items={assessment.evidence.map((item) => item.title)} />
        <DetailList title="Findings" empty="Sem findings registados." items={assessment.findings.map((item) => `${item.title} (${item.status})`)} />
        <DetailList title="Acoes" empty="Sem acoes registadas." items={assessment.actions.map((item) => `${item.title} (${item.status})`)} />
      </div>

      <Link
        to={`/ciso-assistant?q=${encodeURIComponent(assessmentPrompt(assessment))}`}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700"
      >
        <MessageCircle className="h-4 w-4" />
        Pedir apoio ao Virtual CISO
      </Link>
    </aside>
  );
}

function QuickAdd({
  icon,
  label,
  value,
  onChange,
  placeholder,
  extra,
  disabled,
  onSubmit,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  extra?: ReactNode;
  disabled?: boolean;
  onSubmit: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        {extra}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function RecommendationList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs font-semibold text-slate-400">{empty || "Sem itens."}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="border-b border-slate-100 p-4 last:border-b-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.slice(0, 4).map((item, index) => (
            <li key={`${item}-${index}`} className="text-xs font-semibold leading-relaxed text-slate-600">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
