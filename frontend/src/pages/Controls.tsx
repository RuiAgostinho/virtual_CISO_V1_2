import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, RefreshCw, Search, Target, AlertTriangle, CheckCircle2 } from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

export default function Controls() {
  const [searchParams, setSearchParams] = useSearchParams();
  const frameworkId = searchParams.get("framework") || undefined;
  
  const [controls, setControls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.getControls(frameworkId);
      setControls(unwrap(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar os controlos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [frameworkId]);

  const filteredControls = useMemo(() => {
    if (!search) return controls;
    const lowerSearch = search.toLowerCase();
    return controls.filter(
      (c) =>
        c.code?.toLowerCase().includes(lowerSearch) ||
        c.title?.toLowerCase().includes(lowerSearch)
    );
  }, [controls, search]);

  const metrics = useMemo(() => {
    return {
      total: controls.length,
      mandatory: controls.filter(c => c.is_mandatory).length,
      active: controls.filter(c => c.status === "active").length,
    };
  }, [controls]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Avaliação de Conformidade</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Catálogo de Controlos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Visualização detalhada dos controlos de segurança aplicáveis, organizados por framework.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de Controlos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.mandatory}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Obrigatórios</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.active}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ativos</p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
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
              placeholder="Pesquisar por código ou título..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar controlos...</div>
        ) : filteredControls.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhum controlo encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Framework / Código</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs w-1/2">Título e Descrição</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Estado</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs text-center">Obrigatório</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs text-center">Mecanismos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredControls.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-slate-400 mb-1">{c.framework?.name || "Desconhecida"}</div>
                      <div className="font-bold text-slate-950 bg-slate-100 px-2 py-1 rounded-lg inline-block">{c.code}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-950 mb-1">{c.title}</div>
                      <div className="text-xs text-slate-500 line-clamp-2" title={c.description}>{c.description || "Sem descrição"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        c.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}>
                        {c.status === "active" ? "Ativo" : c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {c.is_mandatory ? (
                        <span className="inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Sim</span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Não</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                        {c.mechanisms_count || 0}
                      </span>
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
