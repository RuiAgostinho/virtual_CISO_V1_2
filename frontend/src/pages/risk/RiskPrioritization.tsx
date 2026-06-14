import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileCheck2,
  FlaskConical,
  GitBranch,
  Scale,
  ShieldCheck,
  ShieldAlert,
  Target,
  Wrench,
  Zap,
} from "lucide-react";
import CisoDecisionFlow from "@/components/ui/CisoDecisionFlow";
import { buildDecisionUrl } from "@/lib/decisionApi";
import { riskApi, type PrioritizedVulnerability, type VulnerabilityModelExplanation } from "@/lib/riskApi";

type ModelMode = "explainable_weighted" | "xgboost_experimental" | "xgboost_shap";
type TimeScope = "7d" | "all";

const severityStyles: Record<string, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-orange-50 text-orange-700 border-orange-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-blue-50 text-blue-700 border-blue-200",
};

function scoreTone(score: number) {
  if (score >= 80) return "text-red-600";
  if (score >= 60) return "text-orange-600";
  if (score >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function barTone(score: number) {
  if (score >= 80) return "bg-red-600";
  if (score >= 60) return "bg-orange-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-emerald-500";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-2xl font-bold ${scoreTone(value)}`}>{Math.round(value)}</span>
    </div>
  );
}

function ReasonList({ title, reasons, icon }: { title: string; reasons: string[]; icon: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {reasons.map((reason) => (
          <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
            {reason}
          </span>
        ))}
      </div>
    </div>
  );
}

function ContributionBreakdown({ item, compact = false }: { item: PrioritizedVulnerability; compact?: boolean }) {
  const factors = [...(item.contribution_breakdown || [])]
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, compact ? 5 : 11);
  if (!factors.length) return null;
  const max = Math.max(...factors.map((factor) => factor.contribution), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <Scale className="h-3.5 w-3.5" />
        Porque está nesta posição
      </div>
      <div className="space-y-2">
        {factors.map((factor) => (
          <div key={factor.code} className="grid gap-2 md:grid-cols-[180px_1fr_54px] md:items-center">
            <div>
              <p className="text-xs font-bold text-slate-800">{factor.label}</p>
              <p className="text-[11px] font-semibold text-slate-400">{factor.raw_value}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${barTone(factor.normalized_score)}`}
                style={{ width: `${Math.max(3, (factor.contribution / max) * 100)}%` }}
              />
            </div>
            <p className="text-right text-xs font-bold text-slate-700">{factor.contribution.toFixed(1)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataQuality({ item }: { item: PrioritizedVulnerability }) {
  const quality = item.data_quality || {};
  const entries = [
    ["CVSS", quality.has_cvss],
    ["EPSS", quality.has_epss],
    ["KEV", quality.has_kev_check],
    ["NVD", quality.has_nvd],
    ["Mitigação", quality.has_mitigation],
    ["Evidência", quality.has_valid_evidence],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([label, ok]) => (
        <span
          key={String(label)}
          className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
            ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function formatStatus(value?: string) {
  return (value || "nao definido").replace(/_/g, " ");
}

function modelModeLabel(mode?: string) {
  if (mode === "xgboost_shap") return "XGBoost+SHAP servido";
  if (mode === "xgboost_experimental") return "XGBoost+SHAP preparado, não servido";
  return "Modelo ponderado oficial";
}

function compactNumber(value?: number) {
  return Number.isFinite(value) ? Math.round(Number(value)) : 0;
}

function TraceabilityList<T>({
  empty,
  items,
  renderItem,
}: {
  empty: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-3 text-xs font-semibold text-slate-400">
        {empty}
      </p>
    );
  }
  return <div className="space-y-2">{items.map(renderItem)}</div>;
}

function GovernanceTraceabilityPanel({ item, compact = false }: { item: PrioritizedVulnerability; compact?: boolean }) {
  const governance = item.governance_context || {};
  const controls = governance.internal_control_items || [];
  const mechanisms = governance.mechanism_items || [];
  const evidences = governance.evidence_items || [];
  const frameworks = governance.framework_items || [];
  const gaps = [
    governance.missing_controls ? "Sem controlo interno associado ao ativo/vulnerabilidade" : "",
    governance.missing_mechanisms ? "Controlos sem mecanismos aprovados" : "",
    governance.missing_evidence ? "Sem evidencia real valida" : "",
  ].filter(Boolean);
  const mappingUrl = `/governance/residual-risk-mappings?target_type=asset_vulnerability&target_id=${encodeURIComponent(item.occurrence_id)}`;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
            <GitBranch className="h-4 w-4" />
            Rastreabilidade governance do caso de uso 1
          </div>
          <p className="mt-1 text-xs font-semibold text-indigo-900">
            Ativo - vulnerabilidade - controlos internos - mecanismos - evidencias - frameworks.
          </p>
        </div>
        <Link
          to={mappingUrl}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
        >
          Mapear mitigacao <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "lg:grid-cols-2" : "xl:grid-cols-4"}`}>
        <div className="rounded-xl border border-white bg-white/80 p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            1. Exposicao
          </div>
          <p className="mt-2 text-sm font-bold text-slate-950">{item.asset.name}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {item.cve_id} · {item.severity} · exposicao {item.asset.exposure_level}
          </p>
        </div>

        <div className="rounded-xl border border-white bg-white/80 p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            2. Controlos internos
          </div>
          <TraceabilityList
            empty="Ainda nao ha controlos internos ligados."
            items={controls.slice(0, compact ? 2 : 4)}
            renderItem={(control) => (
              <Link
                key={control.id}
                to={`/governance/mapping-review?internalControl=${encodeURIComponent(control.id)}`}
                className="block rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
              >
                <span className="block font-bold text-slate-900">{control.code || "IC"} · {control.title || "Controlo interno"}</span>
                <span>{control.domain || "Sem dominio"} · {control.criticality || "sem criticidade"}</span>
              </Link>
            )}
          />
        </div>

        <div className="rounded-xl border border-white bg-white/80 p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Wrench className="h-3.5 w-3.5" />
            3. Mecanismos
          </div>
          <TraceabilityList
            empty="Ainda nao ha mecanismos aprovados."
            items={mechanisms.slice(0, compact ? 2 : 4)}
            renderItem={(mechanism) => (
              <Link
                key={mechanism.id}
                to={`/governance/mechanisms/${encodeURIComponent(mechanism.id)}`}
                className="block rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
              >
                <span className="block font-bold text-slate-900">{mechanism.title || "Mecanismo"}</span>
                <span>{formatStatus(mechanism.implementation_status)} · peso {compactNumber(mechanism.contribution_weight)}%</span>
              </Link>
            )}
          />
        </div>

        <div className="rounded-xl border border-white bg-white/80 p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <FileCheck2 className="h-3.5 w-3.5" />
            4. Evidencia e frameworks
          </div>
          <TraceabilityList
            empty="Sem evidencia real valida."
            items={evidences.slice(0, compact ? 1 : 3)}
            renderItem={(evidence) => (
              <Link
                key={evidence.id}
                to={`/governance/evidence/${encodeURIComponent(evidence.id)}`}
                className="block rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
              >
                <span className="block font-bold text-slate-900">{evidence.title || "Evidencia"}</span>
                <span>{evidence.status || "sem estado"} · confianca {compactNumber(evidence.confidence_level)}%</span>
              </Link>
            )}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {frameworks.slice(0, compact ? 3 : 6).map((framework) => (
              <span key={`${framework.framework}-${framework.control_code}`} className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                {framework.framework || "FW"}:{framework.control_code || "controlo"}
              </span>
            ))}
            {!frameworks.length && (
              <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Sem framework aprovado
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            {governance.residual_label || "Sem mitigacao residual validada"}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            {governance.regulatory_label || "Sem relevancia normativa calculada"}
          </span>
        </div>
        {gaps.length > 0 && (
          <p className="text-xs font-bold text-amber-700">
            Lacunas: {gaps.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function ComparisonNote({ item }: { item: PrioritizedVulnerability }) {
  const comparison = item.comparison_group;
  if (!comparison?.enabled) {
    return (
      <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
        {comparison?.reason || "Sem grupo de comparação por CVSS igual."}
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-800">
      <p className="font-bold">
        CVSS igual a {comparison.cvss_score}: posição {comparison.position_in_same_cvss} em {comparison.same_cvss_count}.
      </p>
      <p className="mt-1">
        Top do grupo: {comparison.top_same_cvss?.cve_id} em {comparison.top_same_cvss?.asset_name} com prioridade{" "}
        {Math.round(comparison.top_same_cvss?.priority_score || 0)}.
      </p>
      <p className="mt-1">{comparison.explanation}</p>
    </div>
  );
}

export default function RiskPrioritization() {
  const [searchParams] = useSearchParams();
  const occurrenceId = searchParams.get("occurrence");
  const [items, setItems] = useState<PrioritizedVulnerability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ModelMode>("explainable_weighted");
  const [timeScope, setTimeScope] = useState<TimeScope>("all");
  const [modelExplanation, setModelExplanation] = useState<VulnerabilityModelExplanation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  const loadPrioritization = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await riskApi.listPrioritizedVulnerabilities({
        limit: 10,
        mode,
        ...(occurrenceId ? { occurrence_id: occurrenceId } : {}),
        ...(!occurrenceId && timeScope === "7d" ? { detected_since_days: 7 } : {}),
      });
      setItems(response);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar a priorização."));
    } finally {
      setLoading(false);
    }
  }, [mode, occurrenceId, timeScope]);

  useEffect(() => {
    void loadPrioritization();
  }, [loadPrioritization]);

  const openModelExplanation = async (item: PrioritizedVulnerability) => {
    setExplanationLoading(true);
    setExplanationError(null);
    setModelExplanation(null);
    try {
      const response = await riskApi.getVulnerabilityModelExplanation(item.occurrence_id, mode);
      setModelExplanation(response);
    } catch (err) {
      setExplanationError(getErrorMessage(err, "Não foi possível carregar a explicação auditável do modelo."));
    } finally {
      setExplanationLoading(false);
    }
  };

  const stats = useMemo(() => {
    const avgPriority = items.length ? items.reduce((acc, item) => acc + item.priority_score, 0) / items.length : 0;
    const kevCount = items.filter((item) => (item.risk_breakdown.exploit_availability || 0) > 0).length;
    const comparisons = items.filter((item) => item.comparison_group?.enabled).length;
    return { avgPriority, kevCount, comparisons };
  }, [items]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 p-8">
        <div className="h-12 w-96 animate-pulse rounded-xl bg-slate-100" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-72 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-bold">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar priorização
          </div>
          <p className="mt-2 text-sm font-medium">{error}</p>
          <button onClick={() => void loadPrioritization()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const topItems = items.slice(0, 3);
  const queueItems = items.slice(3);
  const modelNote = items[0]?.model_note;
  const weeklyScope = !occurrenceId && timeScope === "7d";
  const emptyCopy = occurrenceId
    ? {
        title: "Ocorrencia nao encontrada na fila de priorizacao",
        body: "A ocorrencia selecionada nao esta aberta ou ja nao corresponde aos filtros de priorizacao.",
      }
    : weeklyScope
      ? {
          title: "Sem vulnerabilidades novas esta semana",
          body: "Existem vulnerabilidades abertas, mas nenhuma foi detetada nos ultimos 7 dias.",
        }
      : {
          title: "Sem vulnerabilidades abertas para priorizar",
          body: "O motor nao encontrou ocorrencias abertas para construir a fila de remediacao.",
        };
  const shadowModel = items[0]?.experimental_model?.shadow_mode as
    | { enabled?: boolean; model_version?: string; priority_score?: number; served_priority_score?: number; delta?: number; reason?: string }
    | undefined;

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 p-8 pb-20">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-indigo-600">
              <Zap className="h-4 w-4 fill-indigo-600" />
              Priorização contextual
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950">Por onde começo?</h1>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              Top 10 calculado com CVSS, EPSS, CISA KEV, criticidade, exposição, valor de negócio, dependência,
              mecanismos, evidência, relevância normativa e risco residual.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ModelMode)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500"
            >
              <option value="explainable_weighted">Modelo ponderado oficial</option>
              <option value="xgboost_experimental">XGBoost+SHAP preparado (não servido)</option>
              <option value="xgboost_shap">XGBoost+SHAP interno governado</option>
            </select>
            <select
              value={timeScope}
              onChange={(event) => setTimeScope(event.target.value as TimeScope)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500"
            >
              <option value="all">Todas as abertas</option>
              <option value="7d">Novas esta semana</option>
            </select>
            <button
              onClick={() => void loadPrioritization()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
            >
              Atualizar
            </button>
          </div>
        </div>
      </header>

      {modelNote && (
        <div className={`rounded-2xl border p-5 text-sm font-semibold shadow-sm ${mode === "explainable_weighted" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <div className="flex items-start gap-3">
            {mode === "explainable_weighted" ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <FlaskConical className="mt-0.5 h-5 w-5" />}
            <p>{modelNote}</p>
          </div>
        </div>
      )}

      {shadowModel?.enabled && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm font-semibold text-indigo-800 shadow-sm">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 h-5 w-5" />
            <p>
              Shadow mode ativo: XGBoost+SHAP {shadowModel.model_version} calculou prioridade{" "}
              {Math.round(shadowModel.priority_score || 0)} para o primeiro item, com desvio{" "}
              {Number(shadowModel.delta || 0).toFixed(1)} face ao modelo servido.
            </p>
          </div>
        </div>
      )}

      {occurrenceId && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-sm font-semibold text-indigo-800 shadow-sm">
          Fonte aberta a partir do assistente: a lista está filtrada para a ocorrência selecionada.
          <Link to="/risks/prioritization" className="ml-3 font-bold underline underline-offset-4">
            Ver fila completa
          </Link>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ScorePill label="Itens avaliados" value={items.length} />
        <ScorePill label="Média prioridade" value={stats.avgPriority} />
        <ScorePill label="CISA KEV no Top 10" value={stats.kevCount} />
        <ScorePill label="Comparações CVSS" value={stats.comparisons} />
      </section>

      <CisoDecisionFlow current="prioritization" />

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Fluxo demonstravel do Use Case 1</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              A pagina mostra o ranking e a cadeia de decisao que o CISO precisa para justificar a prioridade.
            </p>
          </div>
          <div className="grid gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid-cols-5">
            {["Ativo", "Vulnerabilidade", "Risco", "Governance", "Acao"].map((step, index) => (
              <div key={step} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="mr-2 text-indigo-600">{index + 1}</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <h2 className="text-2xl font-bold text-slate-900">{emptyCopy.title}</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            {emptyCopy.body}
          </p>
          {weeklyScope && (
            <button
              type="button"
              onClick={() => setTimeScope("all")}
              className="mt-5 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"
            >
              Ver todas as abertas
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {topItems.map((item, index) => (
              <article key={`${item.asset.id}-${item.vulnerability_id}-${item.rank}`} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold ${index === 0 ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"}`}>
                    #{item.rank}
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Prioridade</span>
                    <span className={`text-3xl font-bold ${scoreTone(item.priority_score)}`}>{Math.round(item.priority_score)}</span>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${severityStyles[item.severity] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      {item.severity}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {item.cve_id}
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-bold leading-tight text-slate-950">{item.asset.name}</h2>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{item.priority_summary}</p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <ScorePill label="Risco" value={item.risk_score} />
                  <ScorePill label="Remediação" value={item.remediation_score} />
                </div>

                <div className="mt-5">
                  <ContributionBreakdown item={item} compact />
                </div>

                <p className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                  {item.recommended_action}
                </p>

                <div className="mt-5">
                  <GovernanceTraceabilityPanel item={item} compact />
                </div>

                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void openModelExplanation(item)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-[10px] font-bold uppercase tracking-wide text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-100"
                  >
                    Explicação auditável <Scale className="h-4 w-4" />
                  </button>
                  <Link
                    to={buildDecisionUrl(item.occurrence_id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-4 text-[10px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"
                  >
                    Abrir decisão <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
              <Target className="h-5 w-5" />
              Fila de remediação priorizada
            </h3>

            {[...topItems, ...queueItems].map((item) => (
              <article key={`queue-${item.occurrence_id}`} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="grid gap-6 xl:grid-cols-[80px_1fr_320px]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-50 text-xl font-bold text-slate-900">
                    #{item.rank}
                  </div>
                  <div className="space-y-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${severityStyles[item.severity] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {item.severity}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {item.cve_id}
                        </span>
                        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                          {modelModeLabel(item.model_mode)}
                        </span>
                      </div>
                      <h4 className="mt-3 text-lg font-bold text-slate-950">{item.asset.name}</h4>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{item.priority_summary}</p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <ReasonList title="Fatores de risco" reasons={item.risk_reasons} icon={<BarChart3 className="h-3.5 w-3.5" />} />
                      <ReasonList title="Fatores de remediação" reasons={item.remediation_reasons} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
                    </div>

                    <ContributionBreakdown item={item} />
                    <ComparisonNote item={item} />
                    <GovernanceTraceabilityPanel item={item} />
                  </div>

                  <aside className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <ScorePill label="Prioridade" value={item.priority_score} />
                      <ScorePill label="Risco" value={item.risk_score} />
                      <ScorePill label="Rem." value={item.remediation_score} />
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Qualidade dos dados</p>
                      <DataQuality item={item} />
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ação recomendada</p>
                      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{item.recommended_action}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openModelExplanation(item)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-100"
                    >
                      Explicação auditável <Scale className="h-4 w-4" />
                    </button>
                    <Link
                      to={buildDecisionUrl(item.occurrence_id)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-700"
                    >
                      Abrir decisão <ArrowRight className="h-4 w-4" />
                    </Link>
                  </aside>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {(explanationLoading || explanationError || modelExplanation) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Evidência auditável do modelo</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">
                  {modelExplanation?.vulnerability.cve_id || "A carregar explicação"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {modelExplanation?.asset.name || "A recolher score, features e contexto de governação."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModelExplanation(null);
                  setExplanationError(null);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
              >
                Fechar
              </button>
            </div>

            {explanationLoading && (
              <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-8 text-center text-sm font-bold uppercase text-slate-400">
                A carregar explicação...
              </div>
            )}

            {explanationError && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {explanationError}
              </div>
            )}

            {modelExplanation && !explanationLoading && (
              <div className="mt-6 space-y-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <ScorePill label="Prioridade" value={modelExplanation.scores.priority_score} />
                  <ScorePill label="Risco" value={modelExplanation.scores.risk_score} />
                  <ScorePill label="Remediação" value={modelExplanation.scores.remediation_score} />
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Modelo servido</span>
                    <span className="mt-2 block text-sm font-bold text-slate-900">{modelModeLabel(modelExplanation.model.served_mode)}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm font-semibold text-indigo-800">
                  {modelExplanation.audit.statement}
                </div>

                <div className="rounded-xl border border-slate-100 bg-white p-4">
                  <ContributionBreakdown
                    item={{
                      contribution_breakdown: modelExplanation.contribution_breakdown,
                    } as PrioritizedVulnerability}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nota do modelo</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">{modelExplanation.model.model_note}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rastreio</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      Target {modelExplanation.audit.target_type}:{modelExplanation.audit.target_id}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Gerado em {modelExplanation.audit.generated_at ? new Date(modelExplanation.audit.generated_at).toLocaleString("pt-PT") : "n/d"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Clock className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-indigo-950">Nota para a dissertação</h3>
            <p className="mt-2 max-w-5xl text-sm font-semibold leading-relaxed text-indigo-800">
              O modo oficial desta demo usa um modelo multidimensional ponderado e explicável. O EPSS é o sinal
              preditivo externo ativo. O XGBoost+SHAP interno está preparado e governado, mas ainda não deve ser
              apresentado como modelo servido enquanto não existir histórico suficiente de vulnerabilidades, decisões,
              remediações e incidentes para treino robusto.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
