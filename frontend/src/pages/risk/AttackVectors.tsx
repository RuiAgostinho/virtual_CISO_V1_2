import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock3,
  Gauge,
  GitBranch,
  HelpCircle,
  Layers,
  Radar,
  RefreshCw,
  ShieldAlert,
  Target,
} from "lucide-react";
import {
  riskApi,
  type AttackVectorAsset,
  type AttackVectorLevel,
  type AttackVectorOverview,
  type AttackVectorPredictiveModel,
  type AttackVectorRisk,
  type AttackVectorVulnerability,
} from "@/lib/riskApi";

const horizonOptions = [30, 60, 90];

const levelLabel: Record<AttackVectorLevel, string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Elevado",
  critical: "Crítico",
};

const levelClass: Record<AttackVectorLevel, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

function scoreTone(score?: number | null) {
  const value = Number(score || 0);
  if (value >= 75) return "text-red-600";
  if (value >= 55) return "text-orange-600";
  if (value >= 35) return "text-amber-600";
  return "text-emerald-600";
}

function barTone(score?: number | null) {
  const value = Number(score || 0);
  if (value >= 75) return "bg-red-600";
  if (value >= 55) return "bg-orange-500";
  if (value >= 35) return "bg-amber-500";
  return "bg-emerald-500";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-PT");
}

function formatNumber(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-PT");
}

function normalizeHref(href?: string) {
  if (!href) return "/risks/attack-vectors";
  const assetMatch = href.match(/^\/assets\/([^/?#]+)/);
  if (assetMatch) return `/assets/inventory/${assetMatch[1]}`;
  return href;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-400">
      {message}
    </div>
  );
}

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone = "text-slate-950",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-indigo-600">{icon}</div>
      <div className={`mt-4 text-3xl font-bold tracking-tight ${tone}`}>{value}</div>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(Number(value || 0), 100));
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
          <span>{label}</span>
          <span>{Math.round(safe)}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barTone(safe)}`} style={{ width: `${Math.max(3, safe)}%` }} />
      </div>
    </div>
  );
}

function VectorButton({
  vector,
  active,
  onClick,
}: {
  vector: AttackVectorRisk;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active ? "border-indigo-300 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-slate-950">{vector.label}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${levelClass[vector.level]}`}>
              {levelLabel[vector.level]}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{vector.description}</p>
        </div>
        <div className={`shrink-0 text-2xl font-bold ${scoreTone(vector.score)}`}>{Math.round(vector.score)}</div>
      </div>
      <div className="mt-4 grid gap-2 text-[11px] font-bold text-slate-500 sm:grid-cols-3">
        <span>{formatNumber(vector.counts.affected_assets)} ativos</span>
        <span>{formatNumber(vector.counts.relevant_occurrences)} ocorrências</span>
        <span>{formatNumber(vector.counts.kev_occurrences)} KEV</span>
      </div>
    </button>
  );
}

function DimensionGrid({ vector }: { vector: AttackVectorRisk }) {
  const dimensions = [
    ["Probabilidade", vector.dimensions.probability, "Sinais CVSS, EPSS, KEV e serviços expostos."],
    ["Impacto", vector.dimensions.impact, "Criticidade, valor de negócio e dependências."],
    ["Exposição", vector.dimensions.exposure, "Classificação do ativo e último snapshot técnico."],
    ["Lacuna de mitigação", vector.dimensions.mitigation_gap, "Controlos, mecanismos e evidências em falta."],
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {dimensions.map(([label, value, detail]) => (
        <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <ProgressBar value={value} label={label} />
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
        </div>
      ))}
    </div>
  );
}

function MethodologyExplanation({ vector }: { vector: AttackVectorRisk }) {
  const methodology = vector.methodology;
  const explanations = methodology?.dimension_explanations || {};
  const probability = explanations.probability;
  const impact = explanations.impact;

  return (
    <Section title="Fórmula aplicada" description="A confiança é separada do score para evitar falsa precisão quando faltam dados.">
      <div className="space-y-4">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Fórmula oficial do cenário</p>
          <p className="mt-2 text-lg font-bold leading-relaxed text-slate-950">
            {methodology?.formula_pt || "Risco do cenário = √(Probabilidade × Impacto × Exposição × Lacuna de mitigação) × 100"}
          </p>
          {methodology?.formula && (
            <p className="mt-2 text-xs font-semibold text-indigo-700">Expressão técnica: {methodology.formula}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          {(vector.formula_factors || []).map((factor) => (
            <div key={factor.code} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{factor.label}</p>
              <p className={`mt-2 text-2xl font-bold ${factor.code === "confidence" ? "text-slate-950" : scoreTone(factor.value)}`}>
                {Math.round(factor.value)}%
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[probability, impact].filter(Boolean).map((item) => (
            <div key={item?.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-950">{item?.label}</p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{item?.summary}</p>
              {item?.calculation && (
                <p className="mt-3 rounded-xl bg-white px-4 py-3 text-xs font-bold leading-relaxed text-slate-600">
                  {item.calculation}
                </p>
              )}
              {!!item?.signals?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.signals.map((signal) => (
                    <span key={signal} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                      {signal}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function AssetRows({ assets }: { assets: AttackVectorAsset[] }) {
  if (!assets.length) return <EmptyState message="Sem ativos relevantes para este vetor." />;
  return (
    <div className="divide-y divide-slate-100">
      {assets.slice(0, 8).map((asset) => (
        <Link key={asset.id} to={`/assets/inventory/${asset.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950">{asset.name}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Criticidade {asset.criticality || "-"} - Exposição {asset.exposure ?? "-"} - {asset.open_relevant_occurrences} ocorrência(s)
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-sm font-bold ${scoreTone(asset.score)}`}>{Math.round(asset.score)}</span>
            <ArrowRight className="h-4 w-4 text-slate-300" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function VulnerabilityRows({ vulnerabilities }: { vulnerabilities: AttackVectorVulnerability[] }) {
  if (!vulnerabilities.length) return <EmptyState message="Sem vulnerabilidades técnicas relevantes para este vetor." />;
  return (
    <div className="divide-y divide-slate-100">
      {vulnerabilities.slice(0, 8).map((vulnerability) => (
        <Link
          key={vulnerability.id}
          to={`/vulnerabilities?search=${encodeURIComponent(vulnerability.cve_id)}`}
          className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-950">{vulnerability.cve_id}</p>
              {vulnerability.is_in_kev && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">KEV</span>}
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {vulnerability.severity || "-"} - CVSS {vulnerability.cvss_score || 0} - EPSS {Math.round((vulnerability.epss_score || 0) * 100)}% - {vulnerability.affected_assets} ativo(s)
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-sm font-bold ${scoreTone(vulnerability.score)}`}>{Math.round(vulnerability.score)}</span>
            <ArrowRight className="h-4 w-4 text-slate-300" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function PredictiveModelPanel({ model }: { model?: AttackVectorPredictiveModel }) {
  if (!model) return null;

  const readiness = model.readiness;
  const blockers = readiness?.blockers || [];
  const factors = [...(model.contribution_breakdown || [])]
    .sort((a, b) => Math.abs(b.contribution || 0) - Math.abs(a.contribution || 0))
    .slice(0, 5);
  const features = Object.entries(model.feature_vector || {})
    .sort(([, a], [, b]) => Number(b || 0) - Number(a || 0))
    .slice(0, 6);

  return (
    <Section
      title="Modelo preditivo governado"
      description="Projeção XGBoost+SHAP em modo controlado; o score oficial do cenário permanece explicável e auditável."
      action={
        <Link
          to="/admin/priority-model"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
        >
          <Brain className="h-4 w-4" />
          Configurar modelo
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Estado</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${model.enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {model.enabled ? "Shadow ativo" : "Shadow não servido"}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-slate-500">
              {model.served_mode}
            </span>
          </div>

          {model.enabled ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score shadow</p>
                <p className={`mt-1 text-2xl font-bold ${scoreTone(model.predicted_score)}`}>{Math.round(model.predicted_score || 0)}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Delta</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">
                  {Number(model.delta || 0) > 0 ? "+" : ""}{Math.round(model.delta || 0)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm font-semibold leading-relaxed text-slate-600">{model.reason}</p>
          )}

          <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800">
            {model.warning}
          </p>
          {model.model_version && (
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">
              Versão {model.model_version}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Amostras</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(readiness?.labeled_outcomes || 0)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">de {formatNumber(readiness?.required_labeled_outcomes || 0)} exigidas</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ciclos</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(readiness?.review_cycles || 0)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">de {formatNumber(readiness?.required_review_cycles || 0)} exigidos</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Artefacto</p>
              <p className={`mt-2 text-2xl font-bold ${readiness?.has_active_artifact ? "text-emerald-600" : "text-amber-600"}`}>
                {readiness?.has_active_artifact ? "OK" : "Pendente"}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">XGBoost+SHAP interno</p>
            </div>
          </div>

          {blockers.length > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Condições em falta</p>
              <div className="mt-3 space-y-2">
                {blockers.slice(0, 3).map((blocker) => (
                  <p key={blocker.code} className="text-sm font-semibold leading-relaxed text-amber-800">{blocker.message}</p>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Features mais fortes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {features.map(([code, value]) => (
                  <span key={code} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    {code} - {Math.round(Number(value || 0) * 100)}%
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Contribuições projetadas</p>
              <div className="mt-3 space-y-3">
                {factors.map((factor) => (
                  <ProgressBar key={factor.code} value={Math.abs(factor.contribution || factor.normalized_score || 0)} label={factor.label} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function DetailPanel({ vector, loading }: { vector: AttackVectorRisk | null; loading: boolean }) {
  if (loading && !vector) {
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />;
  }
  if (!vector) {
    return <EmptyState message="Seleciona um cenário para ver a explicação." />;
  }

  return (
    <div className="space-y-6">
      <Section
        title={vector.label}
        description={vector.description}
        action={
          <Link
            to={normalizeHref(vector.next_action?.href)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800"
          >
            {vector.next_action?.label || "Abrir ação"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Score do cenário</p>
            <div className="mt-2 flex items-end gap-3">
              <span className={`text-6xl font-bold tracking-tight ${scoreTone(vector.score)}`}>{Math.round(vector.score)}</span>
              <span className={`mb-2 rounded-full border px-3 py-1 text-xs font-bold uppercase ${levelClass[vector.level]}`}>
                {levelLabel[vector.level]}
              </span>
            </div>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-slate-500">{vector.next_action?.reason}</p>
            <div className="mt-5 rounded-xl border border-white bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Confiança</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{Math.round(vector.confidence.score)}%</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold uppercase text-slate-500">
                <span>Ativos {Math.round(vector.confidence.components.assets)}%</span>
                <span>Vulns {Math.round(vector.confidence.components.vulnerabilities)}%</span>
                <span>Gov {Math.round(vector.confidence.components.governance)}%</span>
              </div>
            </div>
          </div>
          <DimensionGrid vector={vector} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Racional" description="Explicação textual gerada a partir dos fatores usados no cálculo.">
          <div className="space-y-3">
            {vector.rationale.map((reason) => (
              <div key={reason} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <p className="text-sm font-semibold leading-relaxed text-slate-600">{reason}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Governança mitigadora" description="Controlos, mecanismos e evidências que reduzem ou explicam a lacuna.">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{formatNumber(vector.governance.controls_count)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mecanismos</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{formatNumber(vector.governance.mechanisms_count)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidências</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{formatNumber(vector.governance.evidence_count)}</p>
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar value={vector.governance.mitigation_coverage} label="Cobertura mitigadora" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {vector.governance.control_keywords.slice(0, 10).map((keyword) => (
              <span key={keyword} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                {keyword}
              </span>
            ))}
          </div>
        </Section>
      </div>

      <PredictiveModelPanel model={vector.predictive_model} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Ativos que explicam o cenário">
          <AssetRows assets={vector.assets || vector.top_assets || []} />
        </Section>
        <Section title="Vulnerabilidades que explicam o cenário">
          <VulnerabilityRows vulnerabilities={vector.vulnerabilities || vector.top_vulnerabilities || []} />
        </Section>
      </div>

      <MethodologyExplanation vector={vector} />
    </div>
  );
}

export default function AttackVectors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<AttackVectorOverview | null>(null);
  const [detail, setDetail] = useState<AttackVectorRisk | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  const horizon = Number(searchParams.get("horizon") || 30);
  const selectedId = searchParams.get("vector") || overview?.summary.top_vector?.id || overview?.vectors[0]?.id || "";

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError("");
    try {
      const payload = await riskApi.getAttackVectorOverview(horizon);
      setOverview(payload);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar a matriz de cenários de ameaça.");
    } finally {
      setLoadingOverview(false);
    }
  }, [horizon]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    setLoadingDetail(true);
    riskApi
      .getAttackVectorDetail(selectedId, horizon)
      .then((payload) => {
        if (mounted) setDetail(payload);
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setError("Não foi possível carregar o detalhe do cenário selecionado.");
      })
      .finally(() => {
        if (mounted) setLoadingDetail(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedId, horizon]);

  const sortedVectors = useMemo(() => overview?.vectors || [], [overview?.vectors]);
  const topVector = overview?.summary.top_vector;

  const updateParams = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => next.set(key, String(value)));
    setSearchParams(next);
  };

  if (loadingOverview && !overview) {
    return (
      <div className="mx-auto max-w-[1700px] space-y-6 p-6 pb-20">
        <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="mx-auto max-w-[1200px] p-6">
        <EmptyState message={error || "Sem dados de cenários de ameaça disponíveis."} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6 pb-20">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Gestão de risco - cenários de ameaça</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Risco prospetivo por vetor de ataque</h1>
            <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-500">
              Lente complementar ao risco por ativo, vulnerabilidade e risco residual. Cada cenário agrega exposição técnica,
              impacto organizacional, CVSS/EPSS/KEV, controlos, mecanismos e evidências.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {horizonOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => updateParams({ horizon: option })}
                  className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
                    horizon === option ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {option} dias
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadOverview}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gerado em {formatDate(overview.generated_at)} - {overview.methodology.formula_pt || overview.methodology.formula}
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Radar className="h-5 w-5" />}
          label="Vetores avaliados"
          value={formatNumber(overview.summary.total_vectors)}
          detail="Catálogo inicial de cenários transversais."
        />
        <Metric
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Críticos"
          value={formatNumber(overview.summary.critical)}
          detail="Cenários acima do limiar crítico."
          tone="text-red-600"
        />
        <Metric
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Elevados"
          value={formatNumber(overview.summary.high)}
          detail="Cenários com atenção executiva."
          tone="text-orange-600"
        />
        <Metric
          icon={<Gauge className="h-5 w-5" />}
          label="Score médio"
          value={Math.round(overview.summary.average_score)}
          detail={topVector ? `Maior foco: ${topVector.label}.` : "Sem cenário dominante."}
          tone={scoreTone(overview.summary.average_score)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Section
          title="Matriz de cenários"
          description="Seleciona um vetor para ver fatores, ativos, vulnerabilidades e mitigação."
        >
          <div className="space-y-3">
            {sortedVectors.map((vector) => (
              <VectorButton
                key={vector.id}
                vector={vector}
                active={selectedId === vector.id}
                onClick={() => updateParams({ vector: vector.id, horizon })}
              />
            ))}
          </div>
        </Section>

        <DetailPanel vector={detail} loading={loadingDetail} />
      </div>

      <Section title="Leitura executiva" description="Como interpretar esta lente sem substituir as restantes avaliações de risco.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            [<Layers className="h-5 w-5" />, "Complemento", "Não substitui o risco por ativo, vulnerabilidade ou risco residual."],
            [<Clock3 className="h-5 w-5" />, "Horizonte", "A leitura é prospetiva para 30, 60 ou 90 dias."],
            [<GitBranch className="h-5 w-5" />, "Rastreabilidade", "Cada score aponta para ativos, CVEs, mecanismos e evidências."],
            [<HelpCircle className="h-5 w-5" />, "Confiança", "O grau de confiança é separado do score para evitar falsa precisão."],
          ].map(([icon, title, text]) => (
            <div key={String(title)} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-indigo-600">{icon}</div>
              <p className="mt-3 text-sm font-bold text-slate-950">{title}</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          to="/risks/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
        >
          <BarChart3 className="h-4 w-4" />
          Painel de risco
        </Link>
        <Link
          to="/risks/prioritization"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
        >
          <Target className="h-4 w-4" />
          Priorização contextual
        </Link>
        <Link
          to="/governance/residual-risk-mappings"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800"
        >
          <Brain className="h-4 w-4" />
          Risco residual
        </Link>
      </div>
    </div>
  );
}
