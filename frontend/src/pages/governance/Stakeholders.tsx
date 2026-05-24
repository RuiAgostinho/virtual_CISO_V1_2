import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, ShieldAlert, Target, RefreshCw, UserPlus, Briefcase, Network } from "lucide-react";
import { governanceApi, type PaginatedResponse, type Stakeholder } from "@/lib/governanceApi";

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function typeLabel(type?: string) {
  const labels: Record<string, string> = {
    Internal: "Interno",
    External: "Externo",
    Regulator: "Regulador",
    Supplier: "Fornecedor",
    Partner: "Parceiro",
  };
  return labels[type || ""] || type || "Desconhecido";
}

function typeTone(type?: string) {
  if (type === "Internal") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "Regulator") return "border-red-200 bg-red-50 text-red-700";
  if (type === "External") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "Supplier") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "Partner") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export default function Stakeholders() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.listStakeholders({ page_size: 500 });
      setStakeholders(unwrap<Stakeholder>(data));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar as partes interessadas."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => ({
    total: stakeholders.length,
    internal: stakeholders.filter((s) => s.stakeholder_type === "Internal").length,
    external: stakeholders.filter((s) => s.stakeholder_type !== "Internal" && s.stakeholder_type !== "Regulator").length,
    regulators: stakeholders.filter((s) => s.stakeholder_type === "Regulator").length,
  }), [stakeholders]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Contexto Organizacional</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Partes Interessadas</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Gestão de entidades que afetam ou são afetadas pelo Sistema de Gestão de Segurança da Informação, os seus requisitos e a sua influência na postura de risco.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors opacity-50 cursor-not-allowed" title="Funcionalidade em desenvolvimento">
              <UserPlus className="h-4 w-4" />
              Nova Parte Interessada
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Users className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total Identificado</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Briefcase className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.internal}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Internos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Network className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.external}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Externos (Fornecedores/Parceiros)</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.regulators}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Reguladores</p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar...</div>
        ) : stakeholders.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhuma parte interessada definida.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Entidade</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Tipo</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Responsabilidade</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Relevância de Segurança</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Processos Críticos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stakeholders.map((sh) => (
                  <tr key={sh.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-950">{sh.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{sh.contact || "Sem contacto"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${typeTone(sh.stakeholder_type)}`}>
                        {typeLabel(sh.stakeholder_type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {sh.responsibility || <span className="text-slate-300 italic">Não definida</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium max-w-xs truncate" title={sh.security_relevance || ""}>
                      {sh.security_relevance || <span className="text-slate-300 italic">N/A</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium max-w-xs truncate" title={sh.critical_process_relation || ""}>
                      {sh.critical_process_relation || <span className="text-slate-300 italic">N/A</span>}
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
