import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, Bug, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { riskApi, type Software } from "@/lib/riskApi";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function severityTone(severity?: string) {
  if (severity === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (severity === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (severity === "Low") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function SoftwareInventory() {
  const [items, setItems] = useState<Software[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [softwareData, statsData] = await Promise.all([
        riskApi.listSoftware({ page_size: 500, search }),
        riskApi.getSoftwareStats().catch(() => null),
      ]);
      setItems(unwrap<Software>(softwareData));
      setStats(statsData);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o inventario de software.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    const vulnerable = items.filter((item) => Number(item.vulnerabilities_count || 0) > 0).length;
    const critical = items.filter((item) => item.max_severity === "Critical" || item.max_severity === "High").length;
    const assets = items.reduce((sum, item) => sum + Number(item.assets_count || 0), 0);
    return {
      total: stats?.total ?? items.length,
      vulnerable: stats?.with_vulnerabilities ?? vulnerable,
      critical: stats?.critical_or_high ?? critical,
      assets: stats?.assets_count ?? assets,
    };
  }, [items, stats]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Gestao de ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Inventario de software</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Software consolidado por versao, fabricante, ativos afetados e exposicao a vulnerabilidades.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-cyan-200 hover:text-cyan-700"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Boxes className="h-5 w-5 text-cyan-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pacotes</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Bug className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.vulnerable}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Com CVE</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldAlert className="h-5 w-5 text-orange-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.critical}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Criticos ou altos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.assets}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Instalacoes</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") load();
              }}
              className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-50"
              placeholder="Pesquisar por nome, versao ou fabricante"
            />
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-cyan-900"
          >
            <Search className="h-4 w-4" />
            Filtrar
          </button>
        </div>

        {error && <div className="m-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">A carregar software...</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">Sem software registado.</div>
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                to={`/assets/software/${item.id}`}
                className="grid gap-4 p-5 transition hover:bg-slate-50 lg:grid-cols-[1.4fr_1fr_.7fr_.7fr]"
              >
                <div>
                  <p className="text-base font-bold text-slate-950">{item.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {[item.vendor, item.version, item.architecture].filter(Boolean).join(" / ") || "Sem fabricante ou versao"}
                  </p>
                </div>
                <div className="text-sm font-semibold text-slate-600">
                  <span className="text-slate-400">Origem</span>
                  <p className="mt-1 font-bold text-slate-800">{item.source || "manual"}</p>
                </div>
                <div className="text-sm font-semibold text-slate-600">
                  <span className="text-slate-400">Ativos</span>
                  <p className="mt-1 font-bold text-slate-800">{item.assets_count || 0}</p>
                </div>
                <div className="flex items-center justify-start lg:justify-end">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${severityTone(item.max_severity)}`}>
                    {item.max_severity || "None"}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
