import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ListChecks,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
} from "lucide-react";
import { riskApi, type PaginatedResponse, type Risk } from "@/lib/riskApi";

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function levelTone(level?: string) {
  if (level === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (level === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (level === "low" || level === "very_low") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scoreTone(score?: number | string | null) {
  const value = Number(score || 0);
  if (value >= 80) return "text-red-600";
  if (value >= 60) return "text-orange-600";
  if (value >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function statusTone(status?: string) {
  if (status === "open") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "in_progress") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "mitigated") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "accepted") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatScore(value?: number | string | null) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return Math.round(numeric).toLocaleString("pt-PT");
}

function formatDecimal(value?: number | string | null) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat("pt-PT", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
  }).format(numeric);
}

function riskTitle(risk: Risk) {
  return risk.title || risk.asset_name || "Risco sem ativo";
}

function riskSubtitle(risk: Risk) {
  const parts = [
    risk.vulnerability_cve || "Risco contextual",
    risk.vulnerability_title,
    risk.asset_name && risk.title ? risk.asset_name : "",
  ].filter(Boolean);
  return parts.join(" - ");
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
      <p className={`mt-4 text-3xl font-bold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function ScoreCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-h-[74px] rounded-xl bg-slate-50 px-4 py-3 text-center">
      <p className={`truncate text-2xl font-bold tracking-tight ${tone || "text-slate-950"}`} title={value}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function RiskRow({ risk }: { risk: Risk }) {
  const score = formatScore(risk.risk_score ?? risk.score);
  const subtitle = riskSubtitle(risk);

  return (
    <Link to={`/risks/${risk.id}`} className="block px-5 py-4 transition-colors hover:bg-slate-50">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px_24px] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${levelTone(risk.risk_level)}`}>
              {risk.risk_level_display || risk.risk_level}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(risk.status)}`}>
              {risk.status_display || risk.status}
            </span>
            {risk.asset_criticality && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Ativo {risk.asset_criticality}
              </span>
            )}
          </div>
          <h2 className="mt-3 truncate text-base font-bold text-slate-950">{riskTitle(risk)}</h2>
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-relaxed text-slate-500">
            {subtitle || "Sem vulnerabilidade associada."}
          </p>
          {risk.ai_explanation && (
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-slate-400">{risk.ai_explanation}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <ScoreCell label="Score" value={score} tone={scoreTone(risk.risk_score ?? risk.score)} />
          <ScoreCell label="Prob." value={formatDecimal(risk.likelihood)} />
          <ScoreCell label="Impacto" value={formatDecimal(risk.impact)} />
        </div>

        <ArrowRight className="hidden h-4 w-4 text-slate-300 xl:block" />
      </div>
    </Link>
  );
}

export default function RiskList() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listRisks({ page_size: 500, search, status });
      setRisks(unwrap<Risk>(data));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel carregar os riscos."));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => ({
    total: risks.length,
    open: risks.filter((risk) => risk.status === "open").length,
    high: risks.filter((risk) => risk.risk_level === "critical" || risk.risk_level === "high").length,
    inProgress: risks.filter((risk) => risk.status === "in_progress").length,
    accepted: risks.filter((risk) => risk.status === "accepted").length,
  }), [risks]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-700">Gestao de risco</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Inventario de riscos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Registo operacional dos riscos por ativo, vulnerabilidade, probabilidade e impacto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-red-200 hover:text-red-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<ListChecks className="h-5 w-5" />} label="Total" value={metrics.total} detail="Riscos no registo atual." />
        <MetricCard icon={<Target className="h-5 w-5" />} label="Em aberto" value={metrics.open} detail="Ainda sem fecho formal." tone={metrics.open ? "text-blue-600" : "text-emerald-600"} />
        <MetricCard icon={<ShieldAlert className="h-5 w-5" />} label="Criticos ou altos" value={metrics.high} detail="Prioridade de tratamento." tone={metrics.high ? "text-red-600" : "text-emerald-600"} />
        <MetricCard icon={<Clock3 className="h-5 w-5" />} label="Em tratamento" value={metrics.inProgress} detail="Com mitigacao em curso." tone="text-indigo-600" />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Aceites" value={metrics.accepted} detail="Aceitacao formal registada." tone="text-amber-600" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por ativo, CVE ou explicacao..."
              className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-14 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          >
            <option value="">Todos os estados</option>
            <option value="open">Em aberto</option>
            <option value="in_progress">Em tratamento</option>
            <option value="mitigated">Mitigado</option>
            <option value="accepted">Aceite</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-14 items-center justify-center rounded-xl bg-slate-950 px-6 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-700"
          >
            Filtrar
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_420px_24px] xl:items-center">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {loading ? "A carregar..." : `${risks.length} riscos encontrados`}
          </p>
          <div className="hidden grid-cols-3 gap-3 text-center xl:grid">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Probabilidade</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {loading && risks.length === 0 ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            risks.map((risk) => <RiskRow key={risk.id} risk={risk} />)
          )}
          {!loading && risks.length === 0 && (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">Sem riscos para os filtros atuais.</div>
          )}
        </div>
      </section>
    </div>
  );
}
