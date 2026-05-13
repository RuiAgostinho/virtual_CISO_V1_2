import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw, Search, ShieldAlert, Target } from "lucide-react";
import { riskApi, type Risk } from "@/lib/riskApi";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function levelTone(level?: string) {
  if (level === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (level === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function RiskList() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listRisks({ page_size: 500, search, status });
      setRisks(unwrap<Risk>(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar os riscos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => ({
    open: risks.filter((risk) => risk.status === "open").length,
    high: risks.filter((risk) => risk.risk_level === "critical" || risk.risk_level === "high").length,
    accepted: risks.filter((risk) => risk.status === "accepted").length,
  }), [risks]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Gestao de risco</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Inventario de riscos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Riscos calculados por ativo, vulnerabilidade, impacto e probabilidade, prontos para tratamento ou aceitacao formal.
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-red-700">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Target className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-black text-slate-950">{metrics.open}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Em aberto</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-black text-slate-950">{metrics.high}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Criticos ou altos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-black text-slate-950">{metrics.accepted}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Aceites</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por ativo, CVE ou explicacao..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100">
            <option value="">Todos os estados</option>
            <option value="open">Em aberto</option>
            <option value="in_progress">Em tratamento</option>
            <option value="mitigated">Mitigado</option>
            <option value="accepted">Aceite</option>
          </select>
          <button onClick={load} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700">
            Filtrar
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            {loading ? "A carregar..." : `${risks.length} riscos encontrados`}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {risks.map((risk) => (
            <Link key={risk.id} to={`/risks/${risk.id}`} className="block p-5 transition-colors hover:bg-slate-50">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${levelTone(risk.risk_level)}`}>
                      {risk.risk_level_display || risk.risk_level}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {risk.status_display || risk.status}
                    </span>
                  </div>
                  <h2 className="mt-3 text-base font-black text-slate-950">{risk.asset_name || "Ativo sem nome"}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {risk.vulnerability_cve || "Risco contextual"} {risk.vulnerability_title ? `- ${risk.vulnerability_title}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[360px]">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-black text-slate-950">{Math.round(Number(risk.risk_score || 0))}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Score</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-black text-slate-950">{risk.likelihood}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Prob.</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-black text-slate-950">{risk.impact}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Impacto</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {!loading && risks.length === 0 && (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">Sem riscos para os filtros atuais.</div>
          )}
        </div>
      </section>
    </div>
  );
}
