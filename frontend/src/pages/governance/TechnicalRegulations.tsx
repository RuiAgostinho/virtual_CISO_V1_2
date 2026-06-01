import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileCode2, RefreshCw, Plus, Target, ShieldCheck, FileWarning, Search } from "lucide-react";
import { governanceApi, type PaginatedResponse, type TechnicalRegulation } from "@/lib/governanceApi";

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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

export default function TechnicalRegulations() {
  const [searchParams] = useSearchParams();
  const searchParam = searchParams.get("search") || "";
  const [regulations, setRegulations] = useState<TechnicalRegulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParam);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.listTechnicalRegulations();
      setRegulations(unwrap<TechnicalRegulation>(data));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar as normas técnicas."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  const filteredRegulations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return regulations;
    return regulations.filter((reg) =>
      `${reg.code || ""} ${reg.title || ""} ${reg.description || ""} ${reg.version || ""}`.toLowerCase().includes(term)
    );
  }, [regulations, search]);

  const metrics = useMemo(() => ({
    total: regulations.length,
    active: regulations.filter((r) => r.status === "active").length,
    review: regulations.filter((r) => r.status === "review").length,
  }), [regulations]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governo Documental</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Normas Técnicas</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Regras específicas e mensuráveis que detalham como as Políticas de Segurança devem ser implementadas a nível técnico.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors opacity-50 cursor-not-allowed" title="Funcionalidade em desenvolvimento">
              <Plus className="h-4 w-4" />
              Nova Norma Técnica
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileCode2 className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de Normas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.active}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Normas Ativas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileWarning className="h-5 w-5 text-amber-600" />
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
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar normas..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar...</div>
        ) : filteredRegulations.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhuma norma técnica definida.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Código / Título</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Estado</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Dono Técnico</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Próxima Revisão</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Versão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRegulations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FileCode2 className="h-4 w-4 text-indigo-400" />
                        <div>
                          <div className="font-semibold text-slate-950">{reg.code}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{reg.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(reg.status)}`}>
                        {statusLabel(reg.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {reg.technical_owner || <span className="text-slate-300 italic">Não definido</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {reg.next_review_at ? new Date(reg.next_review_at).toLocaleDateString("pt-PT") : <span className="text-slate-300 italic">Não definida</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      v{reg.version}
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
