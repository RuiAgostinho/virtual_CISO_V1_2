import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Boxes, Database, Plus, RefreshCw, Search, Server, ShieldAlert } from "lucide-react";
import { riskApi, type Asset, type AssetCategory, type PaginatedResponse, type Software, type SoftwareStats } from "@/lib/riskApi";
import { AssetFormModal } from "@/components/ui/AssetFormModal";

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toneForCriticality(value?: string) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [softwarePreview, setSoftwarePreview] = useState<Software[]>([]);
  const [softwareStats, setSoftwareStats] = useState<SoftwareStats | null>(null);
  const [softwareLoading, setSoftwareLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page_size: 500 };
      if (search.trim()) params.search = search.trim();
      if (source) params.source = source;
      if (category) params.category = category;
      const data = await riskApi.listAssets(params);
      setAssets(unwrap<Asset>(data));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel carregar o inventario."));
    } finally {
      setLoading(false);
    }
  }, [category, search, source]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let mounted = true;
    setSoftwareLoading(true);
    Promise.all([
      riskApi.listSoftware({ page_size: 8, ordering: "name" }).then((data) => unwrap<Software>(data)),
      riskApi.getSoftwareStats().catch((): SoftwareStats | null => null),
    ])
      .then(([softwareData, statsData]) => {
        if (!mounted) return;
        setSoftwarePreview(softwareData);
        setSoftwareStats(statsData);
      })
      .catch(() => {
        if (!mounted) return;
        setSoftwarePreview([]);
        setSoftwareStats(null);
      })
      .finally(() => {
        if (mounted) setSoftwareLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    riskApi
      .listAssetCategories({ page_size: 100 })
      .then((data) => setCategories(unwrap<AssetCategory>(data)))
      .catch(() => setCategories([]));
  }, []);

  const handleCategoryChange = (nextCategory: string) => {
    setCategory(nextCategory);
    const nextParams = new URLSearchParams(searchParams);
    if (nextCategory) {
      nextParams.set("category", nextCategory);
    } else {
      nextParams.delete("category");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const metrics = useMemo(() => {
    const critical = assets.filter((asset) => asset.criticality === "Critical" || asset.criticality === "High").length;
    const withVulns = assets.filter((asset) => Number(asset.vulnerabilities_count || 0) > 0).length;
    const discovered = assets.filter((asset) => asset.source === "wazuh" || asset.source === "discovery").length;
    return { critical, withVulns, discovered };
  }, [assets]);

  const softwareMetric = softwareStats?.total_software ?? softwareStats?.total ?? softwarePreview.length;

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
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-5">
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
        <Link to="/assets/software" className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50">
          <Boxes className="h-5 w-5 text-cyan-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{softwareLoading ? "..." : softwareMetric}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Software instalado</p>
        </Link>
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
          <button onClick={() => void load()} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700">
            Filtrar
          </button>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo de ativo</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleCategoryChange("")}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                category
                  ? "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                  : "border-indigo-600 bg-indigo-600 text-white"
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(String(cat.id))}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  String(category) === String(cat.id)
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
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

      <section className="overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-cyan-50 bg-cyan-50/50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Software instalado</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              O software é inventariado numa tabela própria e ligado aos ativos onde foi detetado.
            </p>
          </div>
          <Link
            to="/assets/software"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-cyan-900"
          >
            Ver lista completa
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {softwareLoading ? (
            <div className="p-8 text-center text-sm font-bold text-slate-400">A carregar software instalado...</div>
          ) : softwarePreview.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-400">Sem software registado.</div>
          ) : (
            softwarePreview.map((item) => (
              <Link
                key={item.id}
                to={`/assets/software/${item.id}`}
                className="grid gap-4 p-5 transition-colors hover:bg-cyan-50/40 lg:grid-cols-[1.3fr_1fr_.5fr]"
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
                <div className="text-sm font-semibold text-slate-600 lg:text-right">
                  <span className="text-slate-400">Ativos</span>
                  <p className="mt-1 font-bold text-slate-800">{item.assets_count || 0}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <AssetFormModal open={formOpen} mode="create" onClose={() => setFormOpen(false)} onSaved={() => void load()} />
    </div>
  );
}
