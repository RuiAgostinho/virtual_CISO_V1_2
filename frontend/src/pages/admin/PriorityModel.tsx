import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Database,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import { riskApi, type PriorityModelConfig, type PriorityModelConfigMode } from "@/lib/riskApi";

const featureLabels: Record<string, string> = {
  cvss: "CVSS",
  epss: "EPSS",
  kev: "CISA KEV",
  asset_criticality: "Criticidade do ativo",
  exposure: "Exposição",
  business_value: "Valor de negócio",
  dependency: "Dependência",
  mechanism_gap: "Lacuna de mecanismos",
  evidence_gap: "Lacuna de evidência",
  regulatory_relevance: "Relevância normativa",
  residual_risk_gap: "Risco residual",
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "Ainda sem treino";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function MetricCard({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "emerald" | "amber" | "indigo" }) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase text-slate-500">{label}</div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <div className="text-sm font-bold text-slate-900">{label}</div>
        <div className="mt-1 text-sm text-slate-500">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-indigo-600" : "bg-slate-300"
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function PriorityModel() {
  const [config, setConfig] = useState<PriorityModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await riskApi.getPriorityModelConfig();
      setConfig(data);
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err, "Não foi possível carregar o modelo de priorização.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const readiness = config?.readiness;
  const blockers = readiness?.blockers ?? [];
  const xgboostReady = Boolean(readiness?.ready);
  const canUseShadowMode = Boolean(readiness?.has_active_artifact);

  const readinessSummary = readiness?.ready
    ? "Pronto para ativação governada."
    : blockers[0]?.message ?? "Ainda sem dados suficientes para ativar o modelo interno.";

  const updateConfig = (patch: Partial<PriorityModelConfig>) => {
    setConfig((current) => (current ? { ...current, ...patch } : current));
  };

  const selectMode = (mode: PriorityModelConfigMode) => {
    if (mode === "xgboost_shap" && !xgboostReady) {
      setMessage({ type: "error", text: readinessSummary });
      return;
    }
    updateConfig({ mode });
    setMessage(null);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!config?.id) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await riskApi.updatePriorityModelConfig(config.id, {
        mode: config.mode,
        feature_store_enabled: config.feature_store_enabled,
        shadow_mode_enabled: config.shadow_mode_enabled,
        min_labeled_outcomes: config.min_labeled_outcomes,
        min_review_cycles: config.min_review_cycles,
      });
      setConfig(updated);
      setMessage({ type: "success", text: "Configuração do modelo de priorização guardada." });
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err, "Erro ao guardar a configuração do modelo.") });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm font-bold uppercase text-slate-400">A carregar modelo de priorização...</div>;
  }

  if (!config || !readiness) {
    return (
      <div className="mx-auto max-w-[900px] rounded-xl border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-700">
        Não foi possível preparar o painel do modelo de priorização.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-white">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-indigo-700">Administração</p>
              <h1 className="text-2xl font-bold text-slate-950">Modelo de Priorização (IA)</h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
                EPSS é o sinal preditivo externo ativo. O estimador XGBoost+SHAP interno fica preparado para ativação quando existir histórico temporal suficiente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadConfig()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Snapshots de features" value={readiness.feature_snapshots} tone="indigo" />
        <MetricCard label="Desfechos rotulados" value={`${readiness.labeled_outcomes}/${readiness.required_labeled_outcomes}`} tone={readiness.labeled_outcomes >= readiness.required_labeled_outcomes ? "emerald" : "amber"} />
        <MetricCard label="Ciclos temporais" value={`${readiness.review_cycles}/${readiness.required_review_cycles}`} tone={readiness.review_cycles >= readiness.required_review_cycles ? "emerald" : "amber"} />
        <MetricCard label="Sinal ML ativo" value={readiness.current_ml_signal} tone="slate" />
      </section>

      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Sliders className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-950">Modo de cálculo</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => selectMode("explainable_weighted")}
                className={`rounded-xl border p-5 text-left transition-colors ${
                  config.mode === "explainable_weighted"
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-indigo-200"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-950">Ponderado explicável</div>
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Modelo oficial: score multidimensional auditável, com contribuições por feature.
                </p>
                <div className="mt-4 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700">
                  Ativo em produção
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectMode("xgboost_shap")}
                disabled={!xgboostReady}
                title={!xgboostReady ? readinessSummary : "Ativar XGBoost+SHAP interno"}
                className={`rounded-xl border p-5 text-left transition-colors disabled:cursor-not-allowed ${
                  config.mode === "xgboost_shap"
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-indigo-200 disabled:bg-slate-50 disabled:text-slate-500"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-950">XGBoost + SHAP interno</div>
                  {xgboostReady ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Lock className="h-5 w-5 text-amber-600" />}
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Estimador organizacional para aprender a função de priorização a partir dos teus desfechos.
                </p>
                <div className={`mt-4 rounded-lg px-3 py-2 text-xs font-bold ${xgboostReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {xgboostReady ? "Pronto para ativação" : "Bloqueado por prontidão"}
                </div>
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Database className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-950">Feature store</h2>
            </div>

            <div className="space-y-4">
              <ToggleRow
                label="Registar vetor de priorização"
                description="Guarda as 11 features normalizadas, score e desfecho por ocorrência."
                checked={config.feature_store_enabled}
                onChange={(checked) => updateConfig({ feature_store_enabled: checked })}
              />
              <ToggleRow
                label="Shadow mode"
                description="Comparação paralela do XGBoost+SHAP quando existir artefacto treinado."
                checked={config.shadow_mode_enabled}
                disabled={!canUseShadowMode}
                onChange={(checked) => updateConfig({ shadow_mode_enabled: checked })}
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Desfechos mínimos</span>
                <input
                  type="number"
                  min={1}
                  value={config.min_labeled_outcomes}
                  onChange={(event) => updateConfig({ min_labeled_outcomes: Number(event.target.value) })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Ciclos mínimos</span>
                <input
                  type="number"
                  min={1}
                  value={config.min_review_cycles}
                  onChange={(event) => updateConfig({ min_review_cycles: Number(event.target.value) })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                />
              </label>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              {xgboostReady ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}
              <h2 className="text-lg font-bold text-slate-950">Prontidão</h2>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600">{readinessSummary}</p>
            {blockers.length > 0 && (
              <div className="mt-4 space-y-2">
                {blockers.map((blocker) => (
                  <div key={blocker.code} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                    {blocker.message}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Artefacto e métricas</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-slate-500">Versão</dt>
                <dd className="font-bold text-slate-900">{config.active_model_version || "Sem artefacto"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-slate-500">Último treino</dt>
                <dd className="font-bold text-slate-900">{formatDate(config.trained_at)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-slate-500">AUC holdout</dt>
                <dd className="font-bold text-slate-900">{config.holdout_auc ?? "n/d"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-slate-500">Brier holdout</dt>
                <dd className="font-bold text-slate-900">{config.holdout_brier ?? "n/d"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Features usadas</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(config.features ?? readiness.supported_features).map((feature) => (
                <span key={feature} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                  {featureLabels[feature] ?? feature}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Dependências ML</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {Object.entries(readiness.dependency_status ?? {}).map(([name, installed]) => (
                <div
                  key={name}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase ${
                    installed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {name} · {installed ? "OK" : "em falta"}
                </div>
              ))}
            </div>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar configuração
          </button>
        </aside>
      </form>
    </div>
  );
}
