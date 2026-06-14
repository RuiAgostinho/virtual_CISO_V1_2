import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  governanceApi,
  type ComplianceDriftEvent,
  type ComplianceDriftOverview,
} from "@/lib/governanceApi";

const severityTone: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

function isPositiveEvent(event: ComplianceDriftEvent) {
  return event.type === "control_improvement" || event.type === "asset_exposure_improvement";
}

function formatDate(value?: string | null) {
  if (!value) return "Sem baseline";
  return new Date(value).toLocaleString("pt-PT");
}

function textValue(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "text-slate-950",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-indigo-600">
        {icon}
      </div>
      <div className={`mt-5 text-3xl font-bold tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-400">
      {message}
    </div>
  );
}

function eventTitle(event: ComplianceDriftEvent) {
  if (event.type === "control_regression") {
    return `${textValue(event.framework && typeof event.framework === "object" ? (event.framework as { code?: unknown }).code : "")}:${textValue(event.control_code)} - ${textValue(event.control_title)}`;
  }
  if (event.type === "control_improvement") {
    return `${textValue(event.framework && typeof event.framework === "object" ? (event.framework as { code?: unknown }).code : "")}:${textValue(event.control_code)} - ${textValue(event.control_title)}`;
  }
  if (event.type === "asset_exposure_regression") {
    return textValue(event.asset_name, "Ativo sem nome");
  }
  if (event.type === "asset_exposure_improvement") {
    return textValue(event.asset_name, "Ativo sem nome");
  }
  if (event.type === "new_vulnerability") {
    return `${textValue(event.cve_id)} - ${textValue(event.asset_name)}`;
  }
  if (event.type === "framework_mapping_gap") {
    return `${textValue(event.framework && typeof event.framework === "object" ? (event.framework as { code?: unknown }).code : "")}:${textValue(event.control_code)} - ${textValue(event.control_title)}`;
  }
  return textValue(event.type, "Evento de drift");
}

function eventDescription(event: ComplianceDriftEvent) {
  if (event.type === "control_regression") {
    const previous = event.previous as { implementation_status?: string; risk_residual?: number } | undefined;
    const current = event.current as { implementation_status?: string; risk_residual?: number } | undefined;
    return `Estado ${textValue(previous?.implementation_status)} -> ${textValue(current?.implementation_status)}; risco residual ${textValue(previous?.risk_residual)} -> ${textValue(current?.risk_residual)}.`;
  }
  if (event.type === "control_improvement") {
    const previous = event.previous as { implementation_status?: string; risk_residual?: number; effectiveness?: number } | undefined;
    const current = event.current as { implementation_status?: string; risk_residual?: number; effectiveness?: number } | undefined;
    return `Estado ${textValue(previous?.implementation_status)} -> ${textValue(current?.implementation_status)}; efetividade ${textValue(previous?.effectiveness)} -> ${textValue(current?.effectiveness)}; risco residual ${textValue(previous?.risk_residual)} -> ${textValue(current?.risk_residual)}.`;
  }
  if (event.type === "asset_exposure_regression") {
    const ports = Array.isArray(event.new_ports) ? event.new_ports.join(", ") : "";
    return ports ? `Novas portas expostas: ${ports}.` : "Score de exposicao aumentou face ao snapshot anterior.";
  }
  if (event.type === "asset_exposure_improvement") {
    const ports = Array.isArray(event.closed_ports) ? event.closed_ports.join(", ") : "";
    return ports ? `Portas fechadas: ${ports}.` : "Score de exposicao reduziu face ao snapshot anterior.";
  }
  if (event.type === "new_vulnerability") {
    return `CVSS ${textValue(event.cvss_score)}; EPSS ${textValue(event.epss_score)}; estado ${textValue(event.status)}.`;
  }
  if (event.type === "framework_mapping_gap") {
    return "Controlo externo ainda sem mapping aprovado para o catalogo interno.";
  }
  return textValue(event.recommendation, "Evento calculado a partir da base de dados.");
}

function EventList({ title, description, events }: { title: string; description: string; events: ComplianceDriftEvent[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
      </div>
      <div className="p-5">
        {events.length === 0 ? (
          <EmptyState message="Sem eventos deste tipo." />
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((event, index) => (
              <div key={`${event.type}-${index}`} className="py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${isPositiveEvent(event) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : severityTone[event.severity] || severityTone.low}`}>
                        {isPositiveEvent(event) ? "melhoria" : event.severity}
                      </span>
                      {typeof event.impact_score === "number" && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                          {isPositiveEvent(event) ? "Beneficio" : "Impacto"} {Math.round(event.impact_score)}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-sm font-bold text-slate-950">{eventTitle(event)}</h3>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{eventDescription(event)}</p>
                    {event.recommendation && (
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-indigo-700">{event.recommendation}</p>
                    )}
                  </div>
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 lg:block" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function ComplianceDrift() {
  const [data, setData] = useState<ComplianceDriftOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [creatingDemoImprovement, setCreatingDemoImprovement] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await governanceApi.getComplianceDriftOverview());
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel carregar a deteccao de drift a partir da base de dados.");
    } finally {
      setLoading(false);
    }
  };

  const createSnapshot = async () => {
    setSavingSnapshot(true);
    setMessage("");
    setError("");
    try {
      const result = await governanceApi.createComplianceDriftSnapshot("Snapshot manual do CISO", "audit");
      setMessage(`Snapshot criado com ${result.created} avaliacoes capturadas.`);
      await load();
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel criar snapshot de postura.");
    } finally {
      setSavingSnapshot(false);
    }
  };

  const createDemoRegression = async () => {
    const confirmed = window.confirm(
      "Esta ação cria um cenário de demonstração na BD: guarda um snapshot anterior e degrada uma avaliação de controlo para que o drift seja detetado. Queres continuar?"
    );
    if (!confirmed) return;

    setCreatingDemo(true);
    setMessage("");
    setError("");
    try {
      const result = await governanceApi.createComplianceDriftDemoRegression();
      if (!result.created) {
        setError(result.message || "Não foi possível criar cenário demo.");
        return;
      }
      const controlLabel = [result.framework?.code, result.control_code].filter(Boolean).join(":");
      setMessage(`${result.message} ${controlLabel ? `Controlo afetado: ${controlLabel}.` : ""}`);
      await load();
    } catch (err) {
      console.error(err);
      setError("Não foi possível criar o cenário de regressão a partir do frontend.");
    } finally {
      setCreatingDemo(false);
    }
  };

  const createDemoImprovement = async () => {
    const confirmed = window.confirm(
      "Esta acao cria um cenario de demonstracao na BD: guarda um snapshot anterior fraco e melhora uma avaliacao de controlo para que o drift positivo seja detetado. Queres continuar?"
    );
    if (!confirmed) return;

    setCreatingDemoImprovement(true);
    setMessage("");
    setError("");
    try {
      const result = await governanceApi.createComplianceDriftDemoImprovement();
      if (!result.created) {
        setError(result.message || "Nao foi possivel criar cenario demo de melhoria.");
        return;
      }
      const controlLabel = [result.framework?.code, result.control_code].filter(Boolean).join(":");
      setMessage(`${result.message} ${controlLabel ? `Controlo afetado: ${controlLabel}.` : ""}`);
      await load();
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel criar o cenario de melhoria a partir do frontend.");
    } finally {
      setCreatingDemoImprovement(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const metrics = data?.metrics;
  const negativeEvents = metrics?.negative_events ?? (
    (metrics?.control_regressions || 0)
    + (metrics?.asset_exposure_regressions || 0)
    + (metrics?.new_vulnerabilities || 0)
  );
  const positiveEvents = metrics?.positive_events ?? (
    (metrics?.control_improvements || 0)
    + (metrics?.asset_exposure_improvements || 0)
  );
  const driftEvents = useMemo(
    () => [
      ...(data?.control_regressions || []),
      ...(data?.control_improvements || []),
      ...(data?.asset_exposure_regressions || []),
      ...(data?.asset_exposure_improvements || []),
      ...(data?.new_vulnerabilities || []),
    ],
    [data]
  );

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[1700px] space-y-6 p-6 pb-20">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (!data || !metrics) {
    return (
      <div className="mx-auto max-w-[1200px] p-6">
        <EmptyState message={error || "Sem dados de drift disponiveis."} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6 pb-20">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Conformidade continua</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Drift de postura</h1>
            <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-500">
              Compara a ultima fotografia auditavel com o estado atual para detetar degradacao, melhorias
              e vulnerabilidades novas, mantendo gaps de mapping como contexto de cobertura.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={createSnapshot}
              disabled={savingSnapshot}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              {savingSnapshot ? "A capturar..." : "Criar snapshot"}
            </button>
            <button
              type="button"
              onClick={createDemoRegression}
              disabled={creatingDemo}
              className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-orange-700 hover:border-orange-300 hover:bg-orange-100 disabled:opacity-60"
            >
              <PlayCircle className="h-4 w-4" />
              {creatingDemo ? "A simular..." : "Demo regressao"}
            </button>
            <button
              type="button"
              onClick={createDemoImprovement}
              disabled={creatingDemoImprovement}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-60"
            >
              <TrendingUp className="h-4 w-4" />
              {creatingDemoImprovement ? "A simular..." : "Demo melhoria"}
            </button>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
          Baseline: {formatDate(data.baseline.captured_at)} · Snapshots de controlos: {data.baseline.snapshots} · Gerado em {formatDate(data.generated_at)}
        </div>
      </header>

      {message && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
        <p className="text-sm font-bold text-indigo-950">{data.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.recommendations.map((recommendation) => (
            <span key={recommendation} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700">
              {recommendation}
            </span>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Camera className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-950">1. Criar fotografia auditável</h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
            Captura o estado atual das avaliações de controlos para servir de baseline comparável.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <PlayCircle className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-950">2. Simular ou provocar alteração</h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
            Para defesa, os cenarios demo criam uma regressao ou uma melhoria controlada. Em operacao real, a alteracao vem de avaliacoes, scans ou vulnerabilidades novas.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-950">3. Rever drift</h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
            A pagina recalcula eventos negativos, melhorias, severidade, recomendacoes e links para priorizacao ou validacao de mappings.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard icon={<ShieldAlert className="h-5 w-5" />} label="Eventos" value={metrics.total_events} detail="Mudancas materiais face ao baseline." tone={negativeEvents ? "text-red-600" : positiveEvents ? "text-emerald-600" : "text-slate-950"} />
        <MetricCard icon={<TrendingDown className="h-5 w-5" />} label="Risco" value={negativeEvents} detail="Eventos que exigem priorizacao." tone={negativeEvents ? "text-red-600" : "text-emerald-600"} />
        <MetricCard icon={<TrendingUp className="h-5 w-5" />} label="Melhorias" value={positiveEvents} detail="Drift positivo validavel." tone="text-emerald-600" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Criticos" value={metrics.critical} detail="Regressoes com maior relevancia normativa." tone="text-red-600" />
        <MetricCard icon={<TrendingDown className="h-5 w-5" />} label="Controlos" value={metrics.control_regressions} detail={`${metrics.control_improvements || 0} melhorias de controlo.`} tone="text-orange-600" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Exposicao" value={metrics.asset_exposure_regressions} detail={`${metrics.asset_exposure_improvements || 0} reducoes de exposicao.`} tone="text-amber-600" />
        <MetricCard icon={<ShieldAlert className="h-5 w-5" />} label="Vulnerabilidades" value={metrics.new_vulnerabilities} detail="Ocorrencias recentes desde baseline." tone="text-red-600" />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Mappings" value={metrics.framework_mapping_gaps} detail="Controlos externos sem mapping oficial." tone="text-indigo-600" />
      </section>

      {driftEvents.length === 0 && (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-sm font-bold text-emerald-800">
          Nao ha drift material detetado. Para uma defesa mais forte, cria um snapshot antes da auditoria e volta a comparar depois de alteracoes reais ou simuladas.
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <EventList
          title="Regressoes de controlos"
          description="Alteracoes de estado, efetividade ou risco residual face ao snapshot anterior."
          events={data.control_regressions}
        />
        <EventList
          title="Melhorias de controlos"
          description="Estado, efetividade ou risco residual melhoraram face ao snapshot anterior."
          events={data.control_improvements || []}
        />
        <EventList
          title="Aumento de exposicao"
          description="Comparacao entre os dois ultimos snapshots tecnicos por ativo."
          events={data.asset_exposure_regressions}
        />
        <EventList
          title="Reducao de exposicao"
          description="Portas fechadas ou score tecnico menor face ao snapshot anterior."
          events={data.asset_exposure_improvements || []}
        />
        <EventList
          title="Vulnerabilidades novas"
          description="Ocorrencias abertas desde a baseline usada para comparacao."
          events={data.new_vulnerabilities}
        />
        <EventList
          title="Gaps de mapping normativo"
          description="Controlos externos relevantes ainda sem mapping aprovado para controlos internos."
          events={data.framework_mapping_gaps}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Link to="/risks/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
          Painel de risco
        </Link>
        <Link to="/governance/mapping-review" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800">
          Validar mappings <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
