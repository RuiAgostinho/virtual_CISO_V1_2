import { useCallback, useEffect, useMemo, useState, type ElementType, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  RefreshCw,
  Save,
  ShieldAlert,
  Target,
  Zap,
} from "lucide-react";
import { riskApi, type Risk } from "@/lib/riskApi";
import { governanceApi, type ResidualRiskImpact } from "@/lib/governanceApi";

type TreatmentForm = {
  treatment_type: "mitigate" | "transfer" | "accept" | "avoid";
  action: string;
  responsible: string;
  due_date: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
};

const emptyTreatment: TreatmentForm = {
  treatment_type: "mitigate",
  action: "",
  responsible: "",
  due_date: "",
  status: "planned",
};

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-PT");
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function levelTone(level?: string) {
  if (level === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (level === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (level === "low") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scoreTone(score: number) {
  if (score >= 80) return "text-red-600";
  if (score >= 60) return "text-orange-600";
  if (score >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function statusTone(status?: string) {
  if (status === "open") return "border-red-100 bg-red-50 text-red-700";
  if (status === "in_progress") return "border-blue-100 bg-blue-50 text-blue-700";
  if (status === "mitigated") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "accepted") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function mappingTone(status?: string) {
  if (status === "approved") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "border-amber-100 bg-amber-50 text-amber-700";
  if (status === "draft") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (status === "rejected") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function residualLevelTone(level?: string) {
  if (level === "critical") return "text-red-600";
  if (level === "high") return "text-orange-600";
  if (level === "medium") return "text-amber-600";
  return "text-emerald-600";
}

const residualSourceLabel: Record<string, string> = {
  internal_control: "Controlo interno",
  mechanism: "Mecanismo",
  internal_control_mechanism: "Mecanismo por controlo",
  policy: "Politica",
  governance_document: "Documento",
};

const residualRelationshipLabel: Record<string, string> = {
  mitigates: "Mitiga",
  reduces_likelihood: "Reduz probabilidade",
  reduces_impact: "Reduz impacto",
  detects: "Deteta",
  prevents: "Previne",
  compensates: "Compensa",
  monitors: "Monitoriza",
};

function displayNumber(value?: number | string | null) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toFixed(parsed % 1 === 0 ? 0 : 1);
}

function Metric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className="h-5 w-5 text-slate-700" />
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function ResidualRiskProjection({
  official,
  simulation,
  loading,
  error,
  riskId,
}: {
  official: ResidualRiskImpact | null;
  simulation: ResidualRiskImpact | null;
  loading: boolean;
  error: string | null;
  riskId?: string;
}) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
        {error}
      </section>
    );
  }

  if (!official?.found) {
    return null;
  }

  const officialLinks = official.links_used || [];
  const inactiveLinks = official.inactive_links || [];
  const simulationLinks = simulation?.links_used || [];
  const baseScore = Number(official.base_score || 0);
  const adjustedScore = Number(official.adjusted_residual_score || 0);
  const reduction = Number(official.governance_reduction_percentage || 0);
  const simulationAdjusted = Number(simulation?.adjusted_residual_score ?? adjustedScore);
  const hasSimulationDifference = Math.abs(simulationAdjusted - adjustedScore) > 0.1 || simulationLinks.length !== officialLinks.length;
  const baseWidth = Math.max(4, Math.min(100, baseScore));
  const adjustedWidth = Math.max(4, Math.min(100, adjustedScore));
  const mappingsHref = riskId
    ? `/governance/residual-risk-mappings?target_type=risk&target_id=${encodeURIComponent(riskId)}`
    : "/governance/residual-risk-mappings";

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Risco residual por governacao</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Score base vs score residual estimado</h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
              Leitura calculada pela nova camada de governacao. O score original do motor antigo fica intacto; esta projecao mostra a reducao explicada por controlos e mecanismos aprovados.
            </p>
          </div>
        </div>
        <Link
          to={mappingsHref}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
        >
          Rever mappings <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score base</p>
              <p className={`mt-2 text-3xl font-bold ${scoreTone(baseScore)}`}>{displayNumber(baseScore)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Reducao governacao</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{displayNumber(reduction)}%</p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Residual oficial</p>
              <p className={`mt-2 text-3xl font-bold ${residualLevelTone(official.adjusted_level)}`}>{displayNumber(adjustedScore)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <span>Antes da governacao</span>
              <span>{displayNumber(baseScore)}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-red-500" style={{ width: `${baseWidth}%` }} />
            </div>
            <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <span>Depois dos mappings oficiais</span>
              <span>{displayNumber(adjustedScore)}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${adjustedWidth}%` }} />
            </div>
            {hasSimulationDifference && (
              <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Em simulacao, incluindo pending_review, o score residual estimado fica em {displayNumber(simulationAdjusted)}.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mappings usados no calculo</p>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {officialLinks.length} oficiais
            </span>
          </div>
          {officialLinks.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
              Ainda nao existem mappings aprovados a ligar este risco, ativo ou vulnerabilidade a controlos/mecanismos de governacao.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {officialLinks.slice(0, 5).map((link) => (
                <div key={String(link.id)} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${mappingTone(String(link.validation_status))}`}>
                      {String(link.validation_status)}
                    </span>
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      -{displayNumber(link.effective_reduction_percentage)}%
                    </span>
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {displayNumber(link.implementation_factor)}% implementacao
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-950">
                    {residualSourceLabel[String(link.source_type)] || String(link.source_type)}: {link.source?.label || link.source_id}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                    {residualRelationshipLabel[String(link.relationship_type)] || String(link.relationship_type)} com eficacia {displayNumber(link.effectiveness_percentage)}% e impacto residual {displayNumber(link.residual_impact_percentage)}%.
                  </p>
                  {link.rationale && (
                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{String(link.rationale)}</p>
                  )}
                </div>
              ))}
              {officialLinks.length > 5 && (
                <p className="text-xs font-semibold text-slate-500">Mais {officialLinks.length - 5} mapping(s) oficiais usados no calculo.</p>
              )}
            </div>
          )}
          {inactiveLinks.length > 0 && (
            <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
              Existem {inactiveLinks.length} mappings inativos rejeitados/deprecated guardados para auditoria, mas excluidos do score.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function RiskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [risk, setRisk] = useState<Risk | null>(null);
  const [officialResidual, setOfficialResidual] = useState<ResidualRiskImpact | null>(null);
  const [simulationResidual, setSimulationResidual] = useState<ResidualRiskImpact | null>(null);
  const [form, setForm] = useState<TreatmentForm>(emptyTreatment);
  const [loading, setLoading] = useState(true);
  const [residualLoading, setResidualLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [residualError, setResidualError] = useState<string | null>(null);

  const loadResidualRisk = useCallback(async (riskId: string) => {
    setResidualLoading(true);
    setResidualError(null);
    try {
      const [officialRes, simulationRes] = await Promise.allSettled([
        governanceApi.getResidualRiskForRisk(riskId, "official", true),
        governanceApi.getResidualRiskForRisk(riskId, "simulation", false),
      ]);
      setOfficialResidual(officialRes.status === "fulfilled" ? officialRes.value : null);
      setSimulationResidual(simulationRes.status === "fulfilled" ? simulationRes.value : null);
      if (officialRes.status === "rejected") {
        setResidualError("Nao foi possivel carregar a leitura de risco residual.");
      }
    } catch (err: unknown) {
      console.error(err);
      setResidualError(errorMessage(err, "Nao foi possivel carregar a leitura de risco residual."));
    } finally {
      setResidualLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setRisk(await riskApi.getRisk(id));
      await loadResidualRisk(id);
    } catch (err: unknown) {
      console.error(err);
      setError(errorMessage(err, "Nao foi possivel carregar o risco."));
    } finally {
      setLoading(false);
    }
  }, [id, loadResidualRisk]);

  useEffect(() => {
    load();
  }, [load]);

  const score = Number(risk?.risk_score || risk?.score || 0);
  const factors = useMemo(() => risk?.factors || [], [risk?.factors]);
  const treatments = risk?.treatments || [];
  const factorTotal = useMemo(
    () => factors.reduce((sum, item) => sum + Number(item.contribution || 0), 0),
    [factors]
  );

  const recalculate = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      setRisk(await riskApi.recalculateRisk(id));
      await loadResidualRisk(id);
      setMessage("Risco recalculado com sucesso.");
    } catch (err: unknown) {
      console.error(err);
      setError(errorMessage(err, "Nao foi possivel recalcular o risco."));
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (status: Risk["status"]) => {
    if (!id) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await riskApi.request<Risk>(`/api/risk/risks/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setRisk(updated);
      setMessage("Estado do risco atualizado.");
    } catch (err: unknown) {
      console.error(err);
      setError(errorMessage(err, "Nao foi possivel atualizar o estado."));
    } finally {
      setSaving(false);
    }
  };

  const createTreatment = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !form.action.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await riskApi.createTreatment({
        risk: id,
        treatment_type: form.treatment_type,
        action: form.action.trim(),
        responsible: form.responsible.trim(),
        due_date: form.due_date || undefined,
        status: form.status,
      });
      setForm(emptyTreatment);
      setMessage("Tratamento adicionado.");
      await load();
    } catch (err: unknown) {
      console.error(err);
      setError(errorMessage(err, "Nao foi possivel criar o tratamento."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar risco...</div>;
  }

  if (error && !risk) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-red-100 bg-red-50 p-8 text-red-700">
        <div className="flex items-center gap-3 font-bold">
          <AlertTriangle className="h-5 w-5" />
          Erro ao carregar risco
        </div>
        <p className="mt-2 text-sm font-semibold">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
          Voltar
        </button>
      </div>
    );
  }

  if (!risk) return null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-red-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${levelTone(risk.risk_level)}`}>
                {risk.risk_level_display || risk.risk_level}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(risk.status)}`}>
                {risk.status_display || risk.status}
              </span>
              {risk.vulnerability_cve && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {risk.vulnerability_cve}
                </span>
              )}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              {risk.title || risk.asset_name || "Risco sem titulo"}
            </h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {risk.vulnerability_title || risk.ai_explanation || "Risco contextual calculado pelo motor de risco."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-red-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button onClick={recalculate} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-800 disabled:bg-slate-300">
              <Zap className="h-4 w-4" />
              {saving ? "A processar..." : "Recalcular"}
            </button>
          </div>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={ShieldAlert} label="Score" value={<span className={scoreTone(score)}>{Math.round(score)}</span>} />
        <Metric icon={Activity} label="Probabilidade" value={risk.likelihood} />
        <Metric icon={Target} label="Impacto" value={risk.impact} />
        <Metric icon={ClipboardList} label="Tratamentos" value={treatments.length} />
      </section>

      <ResidualRiskProjection
        official={officialResidual}
        simulation={simulationResidual}
        loading={residualLoading}
        error={residualError}
        riskId={id}
      />

      <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold text-slate-950">Contexto do risco</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ativo</p>
              <Link to={`/assets/inventory/${risk.asset}`} className="mt-1 block text-sm font-bold text-indigo-700 hover:text-indigo-900">
                {risk.asset_name || risk.asset}
              </Link>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Criticidade do ativo</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{risk.asset_criticality || "-"}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vulnerabilidade</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{risk.vulnerability_cve || "-"}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">CVSS</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{risk.vulnerability_cvss || "-"}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Criado</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{formatDate(risk.created_at)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Atualizado</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{formatDate(risk.updated_at)}</p>
            </div>
          </div>
          {risk.ai_explanation && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-400">Explicacao IA</p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-red-800">{risk.ai_explanation}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-950">Decisao operacional</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["open", "Em aberto"],
              ["in_progress", "Em tratamento"],
              ["mitigated", "Mitigado"],
              ["accepted", "Aceite"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => updateStatus(value as Risk["status"])}
                disabled={saving}
                className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-wide transition ${
                  risk.status === value ? statusTone(value) : "border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:text-red-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Fatores de calculo</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {factors.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">Sem fatores registados.</div>
            ) : factors.map((factor) => (
              <div key={factor.id} className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-950">{factor.name}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{factor.value}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-950">{Number(factor.contribution || 0).toFixed(1)}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">contrib.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {factors.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700">
              Contribuicao total: {factorTotal.toFixed(1)}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-bold text-slate-950">Adicionar tratamento</h2>
          </div>
          <form onSubmit={createTreatment} className="mt-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={form.treatment_type}
                onChange={(event) => setForm((current) => ({ ...current, treatment_type: event.target.value as TreatmentForm["treatment_type"] }))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="mitigate">Mitigar</option>
                <option value="transfer">Transferir</option>
                <option value="accept">Aceitar</option>
                <option value="avoid">Evitar</option>
              </select>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as TreatmentForm["status"] }))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="planned">Planeado</option>
                <option value="in_progress">Em curso</option>
                <option value="completed">Concluido</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            <textarea
              value={form.action}
              onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))}
              className="min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              placeholder="Acao de tratamento, evidencia esperada ou racional da aceitacao..."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={form.responsible}
                onChange={(event) => setForm((current) => ({ ...current, responsible: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                placeholder="Responsavel"
              />
              <input
                type="date"
                value={form.due_date}
                onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !form.action.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Save className="h-4 w-4" />
              Guardar tratamento
            </button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Plano de tratamento</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {treatments.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-400">Sem tratamentos registados.</div>
          ) : treatments.map((treatment) => (
            <div key={treatment.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                      {treatment.treatment_type_display || treatment.treatment_type}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {treatment.status_display || treatment.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">{treatment.action}</p>
                </div>
                <div className="grid gap-2 text-sm sm:min-w-[260px] sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Responsavel</p>
                    <p className="font-bold text-slate-700">{treatment.responsible || "-"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Prazo</p>
                    <p className="font-bold text-slate-700">{treatment.due_date ? new Date(treatment.due_date).toLocaleDateString("pt-PT") : "-"}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
