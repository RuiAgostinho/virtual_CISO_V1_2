import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";

type PolicyRecord = Record<string, any>;

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
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

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{value || "-"}</p>
    </div>
  );
}

function SectionTree({ sections }: { sections: any[] }) {
  if (!sections?.length) {
    return <div className="p-8 text-center text-sm font-bold text-slate-400">Sem secoes estruturadas.</div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {sections.map((section) => (
        <article key={section.id} className="p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Secao {section.order}</p>
          <h3 className="mt-1 text-base font-black text-slate-950">{section.title}</h3>
          {section.content && <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600">{section.content}</p>}
          {section.subsections?.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 border-slate-100 pl-4">
              {section.subsections.map((sub: any) => (
                <div key={sub.id}>
                  <p className="text-sm font-black text-slate-900">{sub.title}</p>
                  {sub.content && <p className="mt-1 whitespace-pre-line text-xs font-semibold leading-relaxed text-slate-500">{sub.content}</p>}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export default function PolicyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setPolicy(await governanceApi.getPolicy(id));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar a politica.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const loadRecommendations = async () => {
    if (!id) return;
    setRecommending(true);
    setError(null);
    try {
      setRecommendations(await governanceApi.getAIRecommendations(id));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel gerar recomendacoes.");
    } finally {
      setRecommending(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-black uppercase tracking-widest text-slate-400">A carregar politica...</div>;
  }

  if (error && !policy) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-red-100 bg-red-50 p-8 text-red-700">
        <div className="flex items-center gap-3 font-black">
          <AlertTriangle className="h-5 w-5" />
          Erro ao carregar politica
        </div>
        <p className="mt-2 text-sm font-semibold">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
          Voltar
        </button>
      </div>
    );
  }

  if (!policy) return null;

  const controls = policy.policy_controls || [];
  const sections = policy.sections || [];
  const score = Math.round(Number(policy.compliance_score || 0));
  const recommendationItems = Array.isArray(recommendations?.recommendations)
    ? recommendations.recommendations
    : Array.isArray(recommendations?.results)
      ? recommendations.results
      : [];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${statusTone(policy.status)}`}>
                {statusLabel(policy.status)}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                {policy.code || "SEM-CODIGO"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                v{policy.version || "1.0"}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">{policy.title}</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {policy.description || policy.objective || "Politica sem descricao operacional registada."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button onClick={loadRecommendations} disabled={recommending} className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-100 disabled:opacity-60">
              <Sparkles className="h-4 w-4" />
              {recommending ? "A analisar..." : "Recomendar controlos"}
            </button>
            <Link to={`/governance/policies/${policy.id}/edit`} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-800">
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <BookOpen className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-black text-slate-950">{controls.length}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Controlos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ClipboardCheck className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-black text-slate-950">{policy.mechanism_count || 0}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Mecanismos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-black text-slate-950">{score}%</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Conformidade</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileCheck2 className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-black text-slate-950">{formatDate(policy.next_review_date)}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Proxima revisao</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Metadados</h2>
          <div className="mt-5 grid gap-3">
            <Field label="Owner" value={policy.owner} />
            <Field label="Aprovacao" value={formatDate(policy.approval_date)} />
            <Field label="Ultima revisao" value={formatDate(policy.review_date)} />
            <Field label="Proxima revisao" value={formatDate(policy.next_review_date)} />
            <Field label="Ambito" value={policy.scope} />
            <Field label="Objetivo" value={policy.objective} />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Estrutura documental</h2>
          </div>
          <SectionTree sections={sections} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Controlos e mecanismos</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {controls.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-400">Sem controlos associados.</div>
          ) : controls.map((policyControl: any) => (
            <article key={policyControl.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-mono text-xs font-black uppercase tracking-widest text-indigo-700">
                    {policyControl.control_details?.code || "CTRL"}
                  </p>
                  <h3 className="mt-1 text-base font-black text-slate-950">{policyControl.control_details?.title || "Controlo"}</h3>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">{policyControl.rationale || policyControl.control_details?.description || "Sem racional."}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center sm:min-w-[220px]">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-lg font-black text-slate-950">{policyControl.mechanism_count || 0}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Mecanismos</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-lg font-black text-slate-950">{Math.round(Number(policyControl.implementation_score || 0))}%</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Score</p>
                  </div>
                </div>
              </div>
              {policyControl.mechanisms?.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {policyControl.mechanisms.map((mechanism: any) => (
                    <div key={mechanism.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-black text-slate-900">{mechanism.name}</p>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {mechanism.implementation_status}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-500">{mechanism.description || "Sem descricao."}</p>
                      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Evidencias validas: {mechanism.valid_evidence_count || 0}/{mechanism.evidence_count || 0}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {recommendations && (
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-black text-indigo-950">Recomendacoes do assistente</h2>
          </div>
          <div className="mt-4 space-y-3">
            {recommendationItems.length === 0 ? (
              <pre className="overflow-auto rounded-xl bg-white p-4 text-xs font-semibold text-slate-700">{JSON.stringify(recommendations, null, 2)}</pre>
            ) : recommendationItems.map((item: any, index: number) => (
              <div key={item.id || index} className="rounded-xl border border-indigo-100 bg-white p-4">
                <p className="font-black text-slate-950">{item.title || item.control_title || item.code || `Recomendacao ${index + 1}`}</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">{item.rationale || item.reason || item.description || JSON.stringify(item)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
