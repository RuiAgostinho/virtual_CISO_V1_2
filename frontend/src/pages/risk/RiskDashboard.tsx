import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Database,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingDown,
  UserRoundX,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  riskApi,
  type CisoRiskPanelAsset,
  type CisoRiskPanelOccurrence,
  type CisoRiskPanelPayload,
} from "@/lib/riskApi";

const SCORE_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#4f46e5", "#10b981"];

function formatNumber(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-PT");
}

function formatScore(value?: number | null) {
  return Math.round(Number(value || 0)).toString();
}

function scoreTone(value?: number | null) {
  const score = Number(value || 0);
  if (score >= 80) return "text-red-600";
  if (score >= 60) return "text-orange-600";
  if (score >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-400">
      {message}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "text-slate-900",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-indigo-600">
          {icon}
        </div>
      </div>
      <div className={`mt-5 text-3xl font-bold tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function AssetList({ items, empty }: { items: CisoRiskPanelAsset[]; empty: string }) {
  if (items.length === 0) return <EmptyState message={empty} />;
  return (
    <div className="divide-y divide-slate-100">
      {items.map((asset) => (
        <Link key={asset.id} to={`/assets/inventory/${asset.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950">{asset.name}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Criticidade {asset.criticality || "-"} · Exposicao {asset.exposure || "-"} · Owner {asset.owner || "por atribuir"}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
        </Link>
      ))}
    </div>
  );
}

function OccurrenceList({ items, empty }: { items: CisoRiskPanelOccurrence[]; empty: string }) {
  if (items.length === 0) return <EmptyState message={empty} />;
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <Link key={item.id} to={`/risks/prioritization`} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-950">{item.cve_id}</p>
              {item.is_in_kev && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">KEV</span>}
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {item.asset_name} · {item.asset_criticality || "-"} · CVSS {item.cvss_score ?? "-"} · visto {formatDate(item.last_seen)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
        </Link>
      ))}
    </div>
  );
}

function AttentionList({ items }: { items: CisoRiskPanelOccurrence[] }) {
  if (items.length === 0) return <EmptyState message="Sem vulnerabilidades abertas para priorizar." />;
  return (
    <div className="space-y-3">
      {items.slice(0, 5).map((item) => (
        <Link
          key={item.id}
          to="/risks/prioritization"
          className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-indigo-200 hover:bg-indigo-50/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Fila rapida de atencao</p>
              <h3 className="mt-1 truncate text-base font-bold text-slate-950">{item.cve_id}</h3>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-500">
                {item.asset_name} · {item.priority_reason || "Ordenado por sinais de risco na BD."}
              </p>
            </div>
            <div className={`text-2xl font-bold ${scoreTone(item.attention_score)}`}>{formatScore(item.attention_score)}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {description && <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function RiskDashboard() {
  const [data, setData] = useState<CisoRiskPanelPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await riskApi.getCisoRiskPanel());
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel carregar o painel de risco a partir da base de dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const domainChart = useMemo(() => data?.top_risks_by_domain || [], [data?.top_risks_by_domain]);
  const evolution = useMemo(() => data?.temporal_evolution || [], [data?.temporal_evolution]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-6 p-6 pb-20">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1200px] p-6">
        <EmptyState message={error || "Sem dados de risco disponiveis."} />
      </div>
    );
  }

  const metrics = data.metrics;

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-6 pb-20">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Painel CISO de ativos e risco</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Estado real da exposicao e risco residual</h1>
            <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-500">
              Indicadores calculados a partir da BD: inventario, classificacao, vulnerabilidades, KEV, mitigacao,
              ligações governance e score residual.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link
              to="/governance/drift"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <TrendingDown className="h-4 w-4" />
              Ver drift
            </Link>
            <Link
              to="/risks/prioritization"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800"
            >
              <Target className="h-4 w-4" />
              Priorizar vulnerabilidades
            </Link>
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gerado em {new Date(data.generated_at).toLocaleString("pt-PT")}
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={<Database className="h-5 w-5" />} label="Ativos" value={formatNumber(metrics.total_assets)} detail="Total no inventario." />
        <MetricCard icon={<ShieldAlert className="h-5 w-5" />} label="Criticos expostos" value={formatNumber(metrics.critical_exposed_assets)} detail="Ativos criticos/altos com exposicao elevada." tone="text-red-600" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Vulns criticas" value={formatNumber(metrics.critical_vulnerabilities_on_critical_assets)} detail="Criticas em ativos criticos/altos." tone="text-orange-600" />
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="CISA KEV abertas" value={formatNumber(metrics.kev_open)} detail="Exploracao conhecida ainda aberta." tone="text-red-600" />
        <MetricCard icon={<UserRoundX className="h-5 w-5" />} label="Sem owner" value={formatNumber(metrics.assets_without_owner)} detail="Ativos sem owner tecnico/negocio." tone="text-amber-600" />
        <MetricCard icon={<TrendingDown className="h-5 w-5" />} label="Reducao governance" value={`${formatScore(metrics.governance_reduction_average)}%`} detail="Reducao media estimada no risco residual." tone="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PanelSection title="Risco inerente vs residual" description="O residual considera ligações governance aprovadas e score factual dos controlos/mecanismos/evidencias.">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Inerente medio</p>
              <p className={`mt-2 text-3xl font-bold ${scoreTone(metrics.inherent_risk_average)}`}>{formatScore(metrics.inherent_risk_average)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Residual medio</p>
              <p className={`mt-2 text-3xl font-bold ${scoreTone(metrics.residual_risk_average)}`}>{formatScore(metrics.residual_risk_average)}</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ligacoes governance aprovadas</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(data.governance.approved_risk_links)}</p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Ativos: {formatNumber(data.governance.assets_with_governance_links)} · Vulnerabilidades: {formatNumber(data.governance.vulnerabilities_with_governance_links)} · Ocorrencias: {formatNumber(data.governance.occurrences_with_governance_links)}
            </p>
          </div>
        </PanelSection>

        <PanelSection title="Top 5 prioridades" description="Fila rapida por KEV, CVSS, EPSS, criticidade e exposicao. A explicacao completa fica na pagina de priorizacao.">
          <AttentionList items={data.lists.top_prioritized_vulnerabilities} />
        </PanelSection>

        <PanelSection title="Vulnerabilidades sem mitigacao" description="Casos onde a BD ainda nao tem mitigacao registada.">
          <OccurrenceList items={data.lists.vulnerabilities_without_mitigation} empty="Todas as vulnerabilidades abertas têm mitigacao registada." />
        </PanelSection>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PanelSection title="Ativos criticos expostos">
          <AssetList items={data.lists.critical_exposed_assets} empty="Sem ativos criticos expostos registados." />
        </PanelSection>
        <PanelSection title="Vulnerabilidades KEV abertas">
          <OccurrenceList items={data.lists.kev_open} empty="Sem CISA KEV abertas." />
        </PanelSection>
        <PanelSection title="Ativos sem classificacao validada">
          <AssetList items={data.lists.assets_without_classification} empty="Todos os ativos têm classificacao validada." />
        </PanelSection>
        <PanelSection title="Ativos sem owner">
          <AssetList items={data.lists.assets_without_owner} empty="Todos os ativos têm owner registado." />
        </PanelSection>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PanelSection title="Top riscos por dominio" description="Dominios derivados dos InternalControls ligados aos riscos.">
          {domainChart.length === 0 ? (
            <EmptyState message="Sem dominios ligados a riscos por GovernanceRiskLink aprovado." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={domainChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="domain" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip />
                  <Bar dataKey="average_inherent_score" radius={[8, 8, 0, 0]}>
                    {domainChart.map((_entry, index) => <Cell key={index} fill={SCORE_COLORS[index % SCORE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </PanelSection>

        <PanelSection title="Evolucao temporal" description="Dados agrupados por mes a partir dos registos de risco existentes.">
          {evolution.length === 0 ? (
            <EmptyState message="Sem historico temporal de riscos na base de dados." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="average_inherent_score" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="max_score" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </PanelSection>
      </div>

      <PanelSection title="Como este painel fecha o ciclo de governação">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            ["Ativo", "Classificacao, owner, exposicao e dependencias."],
            ["Vulnerabilidade", "CVSS, EPSS, KEV, mitigacao e ocorrencia no ativo."],
            ["Governance", "InternalControls, mecanismos e evidencias aprovadas."],
            ["Risco residual", "Reducao explicavel que influencia prioridade e decisao."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl bg-slate-50 p-4">
              <Activity className="h-5 w-5 text-indigo-600" />
              <p className="mt-3 text-sm font-bold text-slate-950">{title}</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <div className="flex justify-end">
        <Link to="/governance/residual-risk-mappings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
          <BarChart3 className="h-4 w-4" />
          Ver mappings de risco residual
        </Link>
      </div>
    </div>
  );
}
