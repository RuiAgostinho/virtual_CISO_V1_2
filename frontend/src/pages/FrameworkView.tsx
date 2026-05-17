import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, RefreshCw, Layers, ShieldCheck, FileText, Activity } from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

export default function FrameworkView() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.getFrameworks();
      setFrameworks(unwrap(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar as frameworks.");
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
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Avaliação de Conformidade</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Frameworks de Referência</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Gestão e visualização das frameworks de segurança e conformidade suportadas pela plataforma (ex: ISO 27001, NIST CSF).
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

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400 shadow-sm">
          A carregar frameworks...
        </div>
      ) : frameworks.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhuma framework configurada.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {frameworks.map((fw) => (
            <div key={fw.id} className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-950">{fw.code}</h3>
                    <p className="text-xs font-medium text-slate-500">v{fw.version}</p>
                  </div>
                </div>
                {fw.is_active ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Ativa</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Inativa</span>
                )}
              </div>
              
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900">{fw.name}</h4>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{fw.description || "Sem descrição disponível."}</p>
              </div>

              <div className="mt-6 flex items-center gap-4 border-t border-slate-100 pt-4">
                <Link
                  to={`/governance/controls?framework=${fw.id}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-indigo-700 transition-colors hover:bg-indigo-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Ver Controlos
                </Link>
                <Link
                  to={`/governance/assessments?framework=${fw.id}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
                >
                  <Activity className="h-4 w-4" />
                  Avaliação
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
