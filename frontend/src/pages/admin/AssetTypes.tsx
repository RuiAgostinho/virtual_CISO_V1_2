import { useCallback, useEffect, useState, useMemo } from "react";
import { Server, Target, RefreshCw, Plus, LayoutGrid, Search, AlertCircle } from "lucide-react";
import { riskApi, type AssetCategory, type AssetType, type PaginatedResponse } from "@/lib/riskApi";

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AssetTypes() {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catsData, typesData] = await Promise.all([
        riskApi.listAssetCategories(),
        riskApi.listAssetTypes(),
      ]);
      setCategories(unwrap(catsData));
      setTypes(unwrap(typesData));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar as categorias e tipos de ativos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTypes = useMemo(() => {
    if (!search) return types;
    const lower = search.toLowerCase();
    return types.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description?.toLowerCase().includes(lower) ||
        t.category_name?.toLowerCase().includes(lower)
    );
  }, [search, types]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Administração</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Tipos de Ativos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Gestão da taxonomia de ativos do sistema, organizados por categoria (ex: Hardware, Software, Informação).
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors opacity-50 cursor-not-allowed">
              <Plus className="h-4 w-4" />
              Novo Tipo
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <LayoutGrid className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{categories.length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Categorias Base</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Server className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{types.length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipos Específicos</p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 text-sm font-semibold text-red-700 shadow-sm">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar tipos ou categorias..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar taxonomia...</div>
        ) : filteredTypes.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhum tipo de ativo encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Tipo de Ativo</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Categoria</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTypes.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Server className="h-4 w-4 text-indigo-400" />
                        <span className="font-semibold text-slate-950">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {t.category_name || "Desconhecida"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {t.description || <span className="text-slate-300 italic">Sem descrição</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
