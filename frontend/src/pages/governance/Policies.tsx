import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, FilePlus2, FileText, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";

type PolicyRecord = Record<string, any>;

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    active: "Ativa",
    review: "Em revisao",
    obsolete: "Obsoleta",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusTone(status?: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "obsolete") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

export default function Policies() {
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.listPolicies({ page_size: 500, search, status });
      setPolicies(unwrap<PolicyRecord>(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar as politicas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => ({
    total: policies.length,
    active: policies.filter((policy) => policy.status === "active").length,
    review: policies.filter((policy) => policy.status === "review").length,
    averageScore: policies.length
      ? Math.round(policies.reduce((sum, policy) => sum + Number(policy.compliance_score || 0), 0) / policies.length)
      : 0,
  }), [policies]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Governo documental</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Politicas de seguranca</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Corpo normativo com estado, donos, controlos associados, mecanismos de implementacao e score evidenciavel.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link to="/governance/policies/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-800">
              <FilePlus2 className="h-4 w-4" />
              Nova politica
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <BookOpen className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-black text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Politicas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-black text-slate-950">{metrics.active}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ativas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-black text-slate-950">{metrics.review}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Em revisao</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileText className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-black text-slate-950">{metrics.averageScore}%</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Score medio</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") load();
              }}
              placeholder="Pesquisar por codigo, titulo ou descricao..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
            <option value="">Todos os estados</option>
            <option value="draft">Rascunho</option>
            <option value="active">Ativa</option>
            <option value="review">Em revisao</option>
            <option value="obsolete">Obsoleta</option>
          </select>
          <button onClick={load} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-800">
            Filtrar
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            {loading ? "A carregar..." : `${policies.length} politicas encontradas`}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {policies.map((policy) => (
            <Link key={policy.id} to={`/governance/policies/${policy.id}`} className="block p-5 transition-colors hover:bg-slate-50">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusTone(policy.status)}`}>
                      {statusLabel(policy.status)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {policy.code || "SEM-CODIGO"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-base font-black text-slate-950">{policy.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">{policy.description || policy.objective || "Sem descricao."}</p>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center sm:min-w-[460px]">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-black text-slate-950">{policy.control_count || 0}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Controlos</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-black text-slate-950">{policy.mechanism_count || 0}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Mecanismos</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-lg font-black text-slate-950">{Math.round(Number(policy.compliance_score || 0))}%</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Score</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-sm font-black text-slate-950">{formatDate(policy.next_review_date)}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Revisao</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {!loading && policies.length === 0 && (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">Sem politicas para os filtros atuais.</div>
          )}
        </div>
      </section>
    </div>
  );
}
