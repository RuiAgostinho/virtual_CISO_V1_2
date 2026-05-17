import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Save, Scale } from "lucide-react";
import { riskApi } from "@/lib/riskApi";

const DEFAULT_WEIGHTS = {
  weight_cia: 0.3,
  weight_exposure: 0.25,
  weight_value: 0.25,
  weight_dependency: 0.2,
};

type WeightKey = keyof typeof DEFAULT_WEIGHTS;

const WEIGHT_FIELDS: { key: WeightKey; label: string; hint: string; symbol: string }[] = [
  { key: "weight_cia", label: "CIA — confidencialidade / integridade / disponibilidade", hint: "Peso da média da tríade CIA do ativo", symbol: "CIA" },
  { key: "weight_exposure", label: "Exposição", hint: "Peso da exposição a redes não confiáveis", symbol: "Exposição" },
  { key: "weight_value", label: "Valor de negócio", hint: "Peso do valor do ativo para a organização", symbol: "Valor" },
  { key: "weight_dependency", label: "Dependência", hint: "Peso da dependência de/para outros ativos", symbol: "Dependência" },
];

const BANDS = [
  { label: "Baixo", range: "< 2.5", tone: "bg-slate-100 text-slate-600" },
  { label: "Médio", range: "2.5 – 3.5", tone: "bg-amber-100 text-amber-700" },
  { label: "Alto", range: "3.5 – 4.5", tone: "bg-orange-100 text-orange-700" },
  { label: "Crítico", range: "≥ 4.5", tone: "bg-red-100 text-red-700" },
];

function bandLabel(score: number) {
  if (score >= 4.5) return "Crítico";
  if (score >= 3.5) return "Alto";
  if (score >= 2.5) return "Médio";
  return "Baixo";
}

export default function ClassificationModel() {
  const [configId, setConfigId] = useState<number | null>(null);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg: any = await riskApi.getRiskConfig();
      setConfigId(cfg.id);
      setWeights({
        weight_cia: Number(cfg.weight_cia),
        weight_exposure: Number(cfg.weight_exposure),
        weight_value: Number(cfg.weight_value),
        weight_dependency: Number(cfg.weight_dependency),
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar o modelo de classificação.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sum = useMemo(() => Object.values(weights).reduce((acc, w) => acc + Number(w), 0), [weights]);
  const sumOk = Math.abs(sum - 1) < 0.001;

  // Exemplo concreto: ativo com CIA 4, Exposição 3, Valor 4, Dependência 2.
  const exampleScore = useMemo(
    () =>
      4 * weights.weight_cia +
      3 * weights.weight_exposure +
      4 * weights.weight_value +
      2 * weights.weight_dependency,
    [weights],
  );

  const setWeight = (key: WeightKey, value: number) => {
    setWeights((w) => ({ ...w, [key]: value }));
    setMessage(null);
  };

  const normalize = () => {
    if (sum <= 0) return;
    setWeights((w) => ({
      weight_cia: w.weight_cia / sum,
      weight_exposure: w.weight_exposure / sum,
      weight_value: w.weight_value / sum,
      weight_dependency: w.weight_dependency / sum,
    }));
    setMessage(null);
  };

  const reset = () => {
    setWeights({ ...DEFAULT_WEIGHTS });
    setMessage(null);
  };

  const save = async () => {
    if (configId == null) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await riskApi.updateRiskConfig(configId, weights);
      setMessage("Modelo de classificação guardado. Aplica-se a partir dos próximos cálculos de criticidade.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível guardar o modelo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestão de ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Modelo de classificação</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Define como a criticidade de cada ativo é calculada — o peso de cada dimensão no modelo ponderado.
              Parametrizável à tolerância ao risco da organização.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}
      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 shadow-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400 shadow-sm">
          A carregar...
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Scale className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Como funciona</h2>
            </div>
            <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">
              Cada ativo tem quatro dimensões avaliadas de 1 a 5. O <strong>score ponderado</strong> resulta da soma
              de cada dimensão multiplicada pelo seu peso:
            </p>
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm font-bold text-slate-700">
              Score = CIA × {weights.weight_cia.toFixed(2)} + Exposição × {weights.weight_exposure.toFixed(2)} + Valor
              × {weights.weight_value.toFixed(2)} + Dependência × {weights.weight_dependency.toFixed(2)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BANDS.map((band) => (
                <div key={band.label} className={`rounded-xl px-3 py-2 text-center ${band.tone}`}>
                  <p className="text-xs font-bold uppercase tracking-wide">{band.label}</p>
                  <p className="text-[10px] font-semibold opacity-80">{band.range}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Pesos das dimensões</h2>
            <div className="mt-4 space-y-3">
              {WEIGHT_FIELDS.map((field) => (
                <div key={field.key} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{field.label}</p>
                      <p className="text-[11px] font-medium text-slate-500">{field.hint}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-bold tabular-nums text-indigo-700 ring-1 ring-slate-200">
                      {weights[field.key].toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[field.key]}
                    onChange={(e) => setWeight(field.key, Number(e.target.value))}
                    className="mt-3 w-full accent-indigo-600"
                  />
                </div>
              ))}
            </div>

            <div
              className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                sumOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <span
                className={`text-xs font-bold uppercase tracking-wide ${sumOk ? "text-emerald-700" : "text-amber-700"}`}
              >
                Soma dos pesos
              </span>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold tabular-nums ${sumOk ? "text-emerald-700" : "text-amber-700"}`}>
                  {sum.toFixed(2)}
                </span>
                {!sumOk && (
                  <button
                    onClick={normalize}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-amber-700"
                  >
                    Normalizar para 1.00
                  </button>
                )}
              </div>
            </div>
            {!sumOk && (
              <p className="mt-2 text-[11px] font-medium text-amber-700">
                Recomenda-se que os pesos somem 1.00 — assim a escala do score (1 a 5) mantém-se coerente com as
                bandas de criticidade.
              </p>
            )}

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Exemplo</p>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Um ativo com CIA 4, Exposição 3, Valor 4, Dependência 2 →{" "}
                <strong className="text-slate-900">score {exampleScore.toFixed(2)}</strong> →{" "}
                <strong className="text-indigo-700">{bandLabel(exampleScore)}</strong>
              </p>
            </div>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-medium text-slate-500">
              Os pesos aplicam-se aos próximos cálculos; ativos já classificados mantêm a criticidade até serem
              novamente guardados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={reset}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Repor por omissão
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar modelo
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
