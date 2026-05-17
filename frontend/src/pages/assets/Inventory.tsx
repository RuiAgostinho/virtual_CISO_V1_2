import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Database, Plus, RefreshCw, Search, Server, ShieldAlert } from "lucide-react";
import { riskApi, type Asset } from "@/lib/riskApi";
import { AssetFormModal } from "@/components/ui/AssetFormModal";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function toneForCriticality(value?: string) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function Inventory() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listAssets({ page_size: 500, search, source });
      setAssets(unwrap<Asset>(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o inventario.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    const critical = assets.filter((asset) => asset.criticality === "Critical" || asset.criticality === "High").length;
    const withVulns = assets.filter((asset) => Number(asset.vulnerabilities_count || 0) > 0).length;
    const discovered = assets.filter((asset) => asset.source === "wazuh" || asset.source === "discovery").length;
    return { critical, withVulns, discovered };
  }, [assets]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestao de ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Inventario de ativos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Ativos manuais, descobertos e sincronizados, com criticidade, exposicao e vulnerabilidades associadas.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Novo ativo
            </button>
            <button
              onClick={load}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Database className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{assets.length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ativos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.critical}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Criticos ou altos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.withVulns}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Com vulnerabilidades</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Server className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.discovered}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Descobertos</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome, IP, dono ou processo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todas as origens</option>
            <option value="manual">Manual</option>
            <option value="wazuh">Wazuh</option>
            <option value="discovery">Discovery</option>
          </select>
          <button onClick={load} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700">
            Filtrar
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {loading ? "A carregar..." : `${assets.length} ativos encontrados`}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {assets.map((asset) => (
            <Link key={asset.id} to={`/assets/inventory/${asset.id}`} className="block p-5 transition-colors hover:bg-slate-50">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${toneForCriticality(asset.criticality)}`}>
                      {asset.criticality || "Sem criticidade"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {asset.source || "manual"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-base font-bold text-slate-950">{asset.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {asset.type_name || asset.category_name || "Sem categoria"} {asset.wazuh_ip ? `- ${asset.wazuh_ip}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[360px]">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-bold text-slate-950">{asset.vulnerabilities_count || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Vulns</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-bold text-slate-950">{asset.controls_count || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-bold text-slate-950">{asset.exposure || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Exposicao</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {!loading && assets.length === 0 && (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">Sem ativos para os filtros atuais.</div>
          )}
        </div>
      </section>

      <AssetFormModal open={formOpen} mode="create" onClose={() => setFormOpen(false)} onSaved={load} />
    </div>
  );
}
