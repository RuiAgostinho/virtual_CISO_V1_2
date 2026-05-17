import { useEffect, useState } from "react";
import { Server, RefreshCw, Plus, Target } from "lucide-react";
import { riskApi, type AssetLookup } from "@/lib/riskApi";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

export default function Environments() {
  const [environments, setEnvironments] = useState<AssetLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listAssetEnvironments();
      setEnvironments(unwrap<AssetLookup>(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar os ambientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestão de Ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Ambientes Lógicos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Gestão de ambientes (Produção, Staging, Desenvolvimento, etc) para categorização de risco e exposição.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors opacity-50 cursor-not-allowed" title="Funcionalidade em desenvolvimento">
              <Plus className="h-4 w-4" />
              Novo Ambiente
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar...</div>
        ) : environments.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhum ambiente definido.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Ambiente</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {environments.map((env) => (
                  <tr key={env.id || env.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Server className="h-4 w-4 text-slate-400" />
                        <span className="font-semibold text-slate-950">{env.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {env.description || <span className="text-slate-300 italic">Sem descrição</span>}
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
