import { type ElementType, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Target,
} from "lucide-react";
import { riskApi, type Asset, type AssetVulnerability, type PrioritizedVulnerability } from "@/lib/riskApi";
import { governanceApi, type ComplianceSummary, type DecisionRecord } from "@/lib/governanceApi";
import { chatApi, type AssistantHistoryEntry } from "@/lib/chatApi";
import CisoDecisionFlow from "@/components/ui/CisoDecisionFlow";
import { buildVulnerabilityOccurrenceUrl } from "@/lib/cisoNavigation";

type LoadState = {
  assets: Asset[];
  occurrences: AssetVulnerability[];
  priorities: PrioritizedVulnerability[];
  compliance: ComplianceSummary | null;
  decisions: DecisionRecord[];
  recommendations: AssistantHistoryEntry[];
};

const emptyState: LoadState = {
  assets: [],
  occurrences: [],
  priorities: [],
  compliance: null,
  decisions: [],
  recommendations: [],
};

const severityLabel: Record<string, string> = {
  Critical: "Critica",
  High: "Alta",
  Medium: "Media",
  Low: "Baixa",
};

const decisionLabel: Record<string, string> = {
  accepted: "Aceite",
  rejected: "Rejeitada",
  deferred: "Diferida",
  mitigate: "Mitigar",
  transferred: "Transferida",
  converted_to_action: "Convertida em acao",
};

const taskTypeLabel: Record<string, string> = {
  vulnerability_prioritization: "Priorizacao",
  structured_query: "Consulta estruturada",
  control_mapping: "Mapeamento de controlos",
  executive_advisory: "Apoio executivo",
  general_qa: "Conhecimento geral",
};

function recommendationPriorityScore(item: AssistantHistoryEntry) {
  const confidence = typeof item.confidence === "number" ? item.confidence : 0;
  const taskWeight =
    item.task_type === "vulnerability_prioritization"
      ? 200
      : item.task_type === "executive_advisory"
        ? 120
        : item.task_type === "control_mapping"
          ? 90
          : 40;
  const ragWeight = item.used_rag ? 15 : 0;

  return taskWeight + ragWeight + Math.round(confidence * 100);
}

function recommendationFocus(item: AssistantHistoryEntry) {
  const confidence = typeof item.confidence === "number" ? item.confidence : 0;

  if (item.task_type === "vulnerability_prioritization") {
    return {
      label: "Prioridade imediata",
      className: "border-red-100 bg-red-50 text-red-700",
    };
  }
  if (confidence >= 0.8) {
    return {
      label: "Alta confianca",
      className: "border-emerald-100 bg-emerald-50 text-emerald-700",
    };
  }
  if (item.used_rag) {
    return {
      label: "Com suporte documental",
      className: "border-indigo-100 bg-indigo-50 text-indigo-700",
    };
  }
  return {
    label: "Analise geral",
    className: "border-slate-200 bg-slate-100 text-slate-600",
  };
}

function scoreTone(value: number) {
  if (value >= 80) return "text-red-600";
  if (value >= 60) return "text-orange-600";
  if (value >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function KpiCard({
  label,
  value,
  detail,
  tone = "slate",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "slate" | "red" | "amber" | "emerald" | "indigo";
  icon: ElementType;
}) {
  const toneClass = {
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-20 animate-pulse rounded-3xl bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-96 animate-pulse rounded-3xl bg-slate-100 lg:col-span-2" />
        <div className="h-96 animate-pulse rounded-3xl bg-slate-100" />
      </div>
    </div>
  );
}

function RecommendationList({
  items,
  emptyMessage,
}: {
  items: AssistantHistoryEntry[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      {items
        .slice()
        .sort((a, b) => recommendationPriorityScore(b) - recommendationPriorityScore(a))
        .map((item) => {
          const focus = recommendationFocus(item);
          return (
        <Link
          key={item.id}
          to={`/recommendation-history?id=${encodeURIComponent(item.id)}`}
          className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/60"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {taskTypeLabel[item.task_type || ""] || item.task_type || "Assistente"}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {new Date(item.created_at).toLocaleDateString("pt-PT")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${focus.className}`}>
              {focus.label}
            </span>
            {typeof item.confidence === "number" && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Confianca {Math.round(item.confidence * 100)}%
              </span>
            )}
          </div>
          <p className="mt-3 line-clamp-2 text-sm font-bold text-slate-900">{item.question}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">
              {item.used_rag ? "Com RAG" : "Sem RAG"}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600">
              Rever <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>
          );
        })}
    </>
  );
}

function AssistantDecisionList({
  items,
  emptyMessage,
}: {
  items: DecisionRecord[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      {items.map((decision) => (
        <Link
          key={decision.id}
          to={`/decision-records?id=${encodeURIComponent(decision.id)}`}
          className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/60"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {decisionLabel[decision.decision] || decision.decision}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {decision.decided_at ? new Date(decision.decided_at).toLocaleDateString("pt-PT") : "--"}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-900">{decision.title}</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{decision.justification}</p>
        </Link>
      ))}
    </>
  );
}

function LatestDecisionList({ items }: { items: DecisionRecord[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
        Ainda nao existem decisoes humanas registadas.
      </p>
    );
  }

  return (
    <>
      {items.map((decision) => (
        <div key={decision.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {decisionLabel[decision.decision] || decision.decision}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {decision.decided_at ? new Date(decision.decided_at).toLocaleDateString("pt-PT") : "--"}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-900">{decision.title}</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{decision.justification}</p>
        </div>
      ))}
    </>
  );
}

export default function MissionControl() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<LoadState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestedMode = searchParams.get("mode");
  const savedMode = localStorage.getItem("view_mode");
  const dashboardMode =
    requestedMode === "executive" || requestedMode === "operational"
      ? requestedMode
      : savedMode === "executive"
        ? "executive"
        : "operational";

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetsRes, occRes, prioritiesRes, complianceRes, decisionsRes, recommendationsRes] = await Promise.allSettled([
        riskApi.listAssets({ page_size: 10000 }),
        riskApi.listVulnerabilityOccurrences({ page_size: 100000 }),
        riskApi.listPrioritizedVulnerabilities({ limit: 6 }),
        governanceApi.getComplianceSummary(),
        governanceApi.listDecisionRecords({ page_size: 5, ordering: "-decided_at" }),
        chatApi.listHistory({ page_size: 5, converted: false }),
      ]);

      setData({
        assets: assetsRes.status === "fulfilled" ? assetsRes.value.results || [] : [],
        occurrences: occRes.status === "fulfilled" ? occRes.value.results || [] : [],
        priorities: prioritiesRes.status === "fulfilled" ? prioritiesRes.value || [] : [],
        compliance: complianceRes.status === "fulfilled" ? complianceRes.value : null,
        decisions: decisionsRes.status === "fulfilled" ? decisionsRes.value.results || [] : [],
        recommendations: recommendationsRes.status === "fulfilled" ? recommendationsRes.value.results || [] : [],
      });
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o painel do CISO.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const metrics = useMemo(() => {
    const active = data.occurrences.filter((item) => item.status === "Open" || item.status === "In remediation");
    const critical = active.filter((item) => item.severity === "Critical").length;
    const high = active.filter((item) => item.severity === "High").length;
    const acceptedOrClosed = data.occurrences.filter((item) =>
      ["Resolved", "Mitigated", "Accepted risk", "False positive"].includes(item.status)
    ).length;
    const assistantDecisions = data.decisions.filter((item) => item.decision_type === "assistant_recommendation");

    return {
      active,
      critical,
      high,
      acceptedOrClosed,
      topPriority: data.priorities[0],
      complianceScore: data.compliance?.score ?? 0,
      missingControls: data.compliance?.missing ?? 0,
      assistantDecisions,
      pendingRecommendations: data.recommendations.length,
    };
  }, [data]);

  if (loading) return <LoadingPanel />;

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-bold">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar o painel
          </div>
          <p className="mt-2 text-sm font-medium">{error}</p>
          <button onClick={loadData} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (dashboardMode === "executive") {
    const urgentCount = metrics.critical + metrics.high;
    const executiveTone =
      metrics.complianceScore < 50 || metrics.critical > 0 ? "red" : urgentCount > 0 ? "amber" : "emerald";

    return (
      <div className="mx-auto max-w-[1400px] space-y-8 pb-16">
        <header className="overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-950 p-7 text-white shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-100">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard executivo
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Postura de ciberseguranca</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-300">
                  Visao sintetica para decisao estrategica: risco atual, conformidade, exposicao e decisoes que exigem
                  atencao do CISO.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/mission-control?mode=operational"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-950 transition-all hover:bg-indigo-50"
              >
                Ver painel operacional <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </div>
          {lastUpdated && (
            <p className="mt-5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Ultima atualizacao: {lastUpdated.toLocaleString("pt-PT")}
            </p>
          )}
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Estado executivo"
            value={executiveTone === "red" ? "Atencao" : executiveTone === "amber" ? "Vigilancia" : "Controlado"}
            detail={`${urgentCount} vulnerabilidades criticas/altas exigem acompanhamento executivo.`}
            tone={executiveTone}
            icon={ShieldAlert}
          />
          <KpiCard
            label="Conformidade global"
            value={`${Math.round(metrics.complianceScore)}%`}
            detail={`${metrics.missingControls} controlos ainda sem evidencia suficiente.`}
            tone={metrics.complianceScore < 50 ? "red" : metrics.complianceScore < 80 ? "amber" : "emerald"}
            icon={ClipboardCheck}
          />
          <KpiCard
            label="Ativos no perimetro"
            value={data.assets.length}
            detail="Base inventariada usada para contexto de exposicao e criticidade."
            tone="indigo"
            icon={Gauge}
          />
          <KpiCard
            label="Recomendacoes por validar"
            value={metrics.pendingRecommendations}
            detail={`${metrics.assistantDecisions.length} decisoes ja nasceram do assistente.`}
            tone={metrics.pendingRecommendations > 0 ? "amber" : "slate"}
            icon={Bot}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm xl:col-span-2">
            <div className="flex flex-col gap-2 border-b border-slate-100 pb-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Leitura executiva</p>
              <h2 className="text-xl font-bold text-slate-950">Resumo para decisao</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-500">Risco prioritario</p>
                <p className="mt-3 text-3xl font-bold text-red-600">{metrics.critical}</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-red-700">
                  Vulnerabilidades criticas ainda ativas.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Exposicao relevante</p>
                <p className="mt-3 text-3xl font-bold text-amber-600">{metrics.high}</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-700">
                  Vulnerabilidades altas a acompanhar.
                </p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Fila ativa</p>
                <p className="mt-3 text-3xl font-bold text-indigo-700">{metrics.active.length}</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-indigo-800">
                  Ocorrencias abertas ou em remediacao.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Proxima decisao recomendada
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-slate-950">
                    {metrics.topPriority ? `${metrics.topPriority.cve_id} em ${metrics.topPriority.asset.name}` : "Sem decisao urgente"}
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                    {metrics.topPriority
                      ? metrics.topPriority.priority_summary
                      : "Nao existem ocorrencias abertas com dados suficientes para produzir uma recomendacao prioritaria."}
                  </p>
                </div>
                {metrics.topPriority && (
                  <Link
                    to={buildVulnerabilityOccurrenceUrl({
                      assetId: metrics.topPriority.asset.id,
                      cveId: metrics.topPriority.cve_id,
                      focus: true,
                    })}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
                  >
                    Abrir decisao <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Assistente</p>
                  <h2 className="text-xl font-bold text-slate-950">Recomendacoes por converter</h2>
                </div>
                <Bot className="h-5 w-5 text-slate-300" />
              </div>
              <div className="mt-5 space-y-3">
                <RecommendationList
                  items={data.recommendations}
                  emptyMessage="Nao existem recomendacoes pendentes para validacao humana."
                />
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Governacao</p>
                  <h2 className="text-xl font-bold text-slate-950">Decisoes vindas do assistente</h2>
                </div>
                <FileCheck2 className="h-5 w-5 text-slate-300" />
              </div>
              <div className="mt-5 space-y-3">
                <AssistantDecisionList
                  items={metrics.assistantDecisions}
                  emptyMessage="Ainda nao existem decisoes formalizadas a partir do assistente."
                />
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Governacao</p>
                  <h2 className="text-xl font-bold text-slate-950">Ultimas decisoes</h2>
                </div>
                <FileCheck2 className="h-5 w-5 text-slate-300" />
              </div>
              <div className="mt-5 space-y-3">
                <LatestDecisionList items={data.decisions} />
              </div>
            </div>
          </aside>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-16">
      <header className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard operacional
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Decisoes prioritarias de hoje</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">
                Visao consolidada de risco, vulnerabilidades, conformidade e decisoes humanas registadas.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/risks/prioritization"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-slate-700"
            >
              Abrir fila priorizada <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={buildVulnerabilityOccurrenceUrl({ status: "Open" })}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-700"
            >
              Ocorrencias abertas
            </Link>
            <Link
              to="/mission-control?mode=executive"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950"
            >
              Visao executiva
            </Link>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
        {lastUpdated && (
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Ultima atualizacao: {lastUpdated.toLocaleString("pt-PT")}
          </p>
        )}
      </header>

      <CisoDecisionFlow current="overview" />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Vulnerabilidades ativas"
          value={metrics.active.length}
          detail={`${metrics.critical} criticas e ${metrics.high} altas ainda exigem acompanhamento.`}
          tone={metrics.critical > 0 ? "red" : metrics.high > 0 ? "amber" : "emerald"}
          icon={ShieldAlert}
        />
        <KpiCard
          label="Ativos inventariados"
          value={data.assets.length}
          detail="Base de contexto usada para criticidade, exposicao e dependencias."
          tone="indigo"
          icon={Gauge}
        />
        <KpiCard
          label="Conformidade global"
          value={`${Math.round(metrics.complianceScore)}%`}
          detail={`${metrics.missingControls} controlos sem evidencia suficiente.`}
          tone={metrics.complianceScore < 50 ? "red" : metrics.complianceScore < 80 ? "amber" : "emerald"}
          icon={ClipboardCheck}
        />
        <KpiCard
          label="Decisoes fechadas"
          value={metrics.acceptedOrClosed}
          detail="Ocorrencias resolvidas, mitigadas, aceites ou classificadas como falso positivo."
          tone="emerald"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Recomendacoes por validar"
          value={metrics.pendingRecommendations}
          detail={`${metrics.assistantDecisions.length} decisoes ja vieram do assistente para governacao formal.`}
          tone={metrics.pendingRecommendations > 0 ? "amber" : "slate"}
          icon={Bot}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Fila de decisao</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Itens ordenados pelo motor de priorizacao contextual.
              </p>
            </div>
            <Link to="/risks/prioritization" className="text-xs font-bold uppercase tracking-wide text-indigo-600 hover:text-indigo-800">
              Abrir priorizacao
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {data.priorities.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                Nao existem ocorrencias abertas com dados suficientes para priorizacao.
              </div>
            ) : (
              data.priorities.map((item) => (
                <div key={`${item.asset.id}-${item.vulnerability_id}-${item.rank}`} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-xl bg-white px-3 py-1 text-xs font-bold text-slate-950">#{item.rank}</span>
                        <span className="rounded-xl border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                          {severityLabel[item.severity] || item.severity}
                        </span>
                        <span className="rounded-xl bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {item.cve_id}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-bold text-slate-950">{item.asset.name}</h3>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">{item.priority_summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.risk_reasons.slice(0, 2).map((reason) => (
                          <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-center">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Prioridade</span>
                        <span className={`text-2xl font-bold ${scoreTone(item.priority_score)}`}>{Math.round(item.priority_score)}</span>
                      </div>
                      <Link
                        to={buildVulnerabilityOccurrenceUrl({
                          assetId: item.asset.id,
                          cveId: item.cve_id,
                          focus: true,
                        })}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition-all hover:bg-indigo-700"
                        title="Abrir ocorrencia"
                      >
                        <ArrowRight className="h-5 w-5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Acoes rapidas</h2>
            <div className="mt-5 grid gap-3">
              <Link to={buildVulnerabilityOccurrenceUrl({ status: "Open" })} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
                Ocorrencias abertas <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/compliance-gaps" className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
                Desvios de conformidade <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/ciso-assistant" className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
                Assistente Virtual CISO <Bot className="h-4 w-4" />
              </Link>
              <Link to="/onboarding" className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
                Configuracao inicial <Rocket className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">Recomendacoes por converter</h2>
              <Bot className="h-5 w-5 text-slate-300" />
            </div>
            <div className="mt-5 space-y-3">
              <RecommendationList
                items={data.recommendations}
                emptyMessage="Nao existem recomendacoes pendentes neste momento."
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">Decisoes vindas do assistente</h2>
              <FileCheck2 className="h-5 w-5 text-slate-300" />
            </div>
            <div className="mt-5 space-y-3">
              <AssistantDecisionList
                items={metrics.assistantDecisions}
                emptyMessage="Ainda nao ha decisoes convertidas a partir de recomendacoes."
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">Ultimas decisoes</h2>
              <FileCheck2 className="h-5 w-5 text-slate-300" />
            </div>
            <div className="mt-5 space-y-3">
              <LatestDecisionList items={data.decisions} />
            </div>
          </div>
        </aside>
      </section>

      {metrics.topPriority && (
        <section className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-indigo-950">Proxima decisao recomendada</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-indigo-800">
                  {metrics.topPriority.cve_id} em {metrics.topPriority.asset.name}: {metrics.topPriority.priority_summary}
                </p>
              </div>
            </div>
            <Link
              to={buildVulnerabilityOccurrenceUrl({
                assetId: metrics.topPriority.asset.id,
                cveId: metrics.topPriority.cve_id,
                focus: true,
              })}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
            >
              Abrir ocorrencia <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
