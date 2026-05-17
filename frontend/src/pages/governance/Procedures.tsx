import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw, Plus, Target, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { governanceApi, type Procedure } from "@/lib/governanceApi";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    active: "Ativo",
    review: "Em Revisão",
    obsolete: "Obsoleto",
  };
  return labels[status || ""] || status || "Desconhecido";
}

function statusTone(status?: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "obsolete") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

export default function Procedures() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.listProcedures();
      setProcedures(unwrap<Procedure>(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar os procedimentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => ({
    total: procedures.length,
    active: procedures.filter((p) => p.status === "active").length,
    review: procedures.filter((p) => p.status === "review").length,
  }), [procedures]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governo Documental</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Procedimentos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Instruções passo-a-passo detalhadas para a execução de tarefas específicas de segurança e operação.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors opacity-50 cursor-not-allowed" title="Funcionalidade em desenvolvimento">
              <Plus className="h-4 w-4" />
              Novo Procedimento
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ClipboardList className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de Procedimentos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.active}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Procedimentos Ativos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.review}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Em Revisão</p>
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
              placeholder="Pesquisar procedimentos..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar...</div>
        ) : procedures.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhum procedimento definido.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Código / Título</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Estado</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Dono</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Periodicidade</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Próxima Execução/Revisão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {procedures.map((proc) => (
                  <tr key={proc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <ClipboardList className="h-4 w-4 text-indigo-400" />
                        <div>
                          <div className="font-semibold text-slate-950">{proc.code}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{proc.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(proc.status)}`}>
                        {statusLabel(proc.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {proc.owner || <span className="text-slate-300 italic">Não definido</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {proc.periodicity || <span className="text-slate-300 italic">N/A</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {proc.next_review_at ? new Date(proc.next_review_at).toLocaleDateString("pt-PT") : <span className="text-slate-300 italic">Não definida</span>}
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
