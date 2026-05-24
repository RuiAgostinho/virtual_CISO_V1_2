import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  Globe2,
  Loader2,
  Network,
  RotateCcw,
  Save,
  Scale,
  Shield,
} from "lucide-react";
import { riskApi, type RiskConfig } from "@/lib/riskApi";

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

const CLASSIFICATION_GLOSSARY = [
  {
    title: "Confidencialidade",
    icon: Shield,
    tone: "bg-indigo-600",
    levels: [
      { value: 5, label: "Ultra", detail: "Exposição causa dano legal, reputacional ou financeiro catastrófico." },
      { value: 4, label: "Alto", detail: "Informação estratégica, dano financeiro ou imagem elevada." },
      { value: 3, label: "Médio", detail: "Documentos internos com acesso restrito a equipas." },
      { value: 2, label: "Baixo", detail: "Dados internos sem sensibilidade; uso corporativo." },
      { value: 1, label: "Público", detail: "Livre acesso, sem restrição de confidencialidade." },
    ],
  },
  {
    title: "Integridade",
    icon: Database,
    tone: "bg-orange-600",
    levels: [
      { value: 5, label: "Crítico", detail: "Corrupção de dados causa falha total irreversível." },
      { value: 4, label: "Grave", detail: "Erros graves em decisões ou prejuízo em faturação." },
      { value: 3, label: "Operacional", detail: "Erros remediáveis, mas com custo e atrasos." },
      { value: 2, label: "Residual", detail: "Transtorno cosmético, com validação e correção simples." },
      { value: 1, label: "Mínimo", detail: "Integridade irrelevante para a função do ativo." },
    ],
  },
  {
    title: "Disponibilidade",
    icon: Activity,
    tone: "bg-emerald-600",
    levels: [
      { value: 5, label: "24/7 vital", detail: "Indispensável; segundos de paragem causam prejuízo total." },
      { value: 4, label: "Core", detail: "Paragem afeta faturação, operação ou canais principais." },
      { value: 3, label: "Laboral", detail: "Indispensável em horário útil, com tolerância de horas." },
      { value: 2, label: "Suporte", detail: "Pode ficar offline 24h sem impacto relevante no negócio." },
      { value: 1, label: "Opcional", detail: "Reposição por conveniência quando existirem recursos." },
    ],
  },
  {
    title: "Exposição",
    icon: Globe2,
    tone: "bg-rose-600",
    levels: [
      { value: 5, label: "Público", detail: "Exposto na Internet sem firewall, DMZ ou controlo equivalente." },
      { value: 4, label: "Filtrado", detail: "Acesso via VPN, gateway autenticado ou regras restritivas." },
      { value: 3, label: "Interno", detail: "Acessível apenas via redes corporativas locais." },
      { value: 2, label: "Isolado", detail: "Sem acesso externo; apenas interfaces locais." },
      { value: 1, label: "Air-gapped", detail: "Isolamento físico total, sem conectividade." },
    ],
  },
  {
    title: "Valor de negócio",
    icon: BriefcaseBusiness,
    tone: "bg-amber-500",
    levels: [
      { value: 5, label: "Faturação", detail: "Ativo gera a maior parte do lucro ou receita direta." },
      { value: 4, label: "Estratégico", detail: "Fundamental para competitividade, operação ou decisão." },
      { value: 3, label: "Produtivo", detail: "Necessário para a produtividade diária interna." },
      { value: 2, label: "Apoio", detail: "Suporta processos secundários ou administrativos." },
      { value: 1, label: "Legado", detail: "Ativo de teste ou sem valor direto atual." },
    ],
  },
  {
    title: "Dependência",
    icon: Network,
    tone: "bg-slate-600",
    levels: [
      { value: 5, label: "Pilar", detail: "Toda a infraestrutura ou serviço crítico falha se este ativo falhar." },
      { value: 4, label: "Core", detail: "Vários serviços fundamentais dependem dele." },
      { value: 3, label: "Local", detail: "Impacto em fluxos de trabalho ou equipas locais." },
      { value: 2, label: "Terminal", detail: "Ativo final; ninguém depende dele funcionalmente." },
      { value: 1, label: "Isolado", detail: "Ativo único; falha não afeta outros sistemas." },
    ],
  },
];

function bandLabel(score: number) {
  if (score >= 4.5) return "Crítico";
  if (score >= 3.5) return "Alto";
  if (score >= 2.5) return "Médio";
  return "Baixo";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ClassificationModel() {
  const [configId, setConfigId] = useState<number | null>(null);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg: RiskConfig = await riskApi.getRiskConfig();
      setConfigId(cfg.id);
      setWeights({
        weight_cia: Number(cfg.weight_cia),
        weight_exposure: Number(cfg.weight_exposure),
        weight_value: Number(cfg.weight_value),
        weight_dependency: Number(cfg.weight_dependency),
      });
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar o modelo de classificação."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível guardar o modelo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
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
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <Scale className="h-4 w-4" />
              Fórmula
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
              <BookOpen className="h-4 w-4" />
              Glossário
            </span>
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
              Cada ativo é classificado de 1 a 5 nas seis dimensões operacionais abaixo. No cálculo da criticidade,
              Confidencialidade, Integridade e Disponibilidade formam a média CIA; depois essa média é combinada com
              Exposição, Valor de negócio e Dependência.
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

          <section className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {CLASSIFICATION_GLOSSARY.map((dimension) => {
              const Icon = dimension.icon;
              return (
                <article key={dimension.title} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <div className={`flex items-center justify-between px-5 py-4 text-white ${dimension.tone}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                        <Icon className="h-5 w-5" />
                      </span>
                      <h2 className="text-sm font-bold uppercase tracking-wide">{dimension.title}</h2>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">1 a 5</span>
                  </div>
                  <div className="divide-y divide-slate-100 px-5 py-2">
                    {dimension.levels.map((level) => (
                      <div key={`${dimension.title}-${level.value}`} className="grid grid-cols-[2.25rem_1fr] gap-3 py-3">
                        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white">
                          {level.value}
                        </span>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-800">{level.label}</p>
                          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-500">{level.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
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
