import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { chatApi, type KnowledgeSourceDetail } from "@/lib/chatApi";

function formatPages(source: KnowledgeSourceDetail) {
  if (!source.page_start) return "Sem pagina indicada";
  if (!source.page_end || source.page_end === source.page_start) return `p. ${source.page_start}`;
  return `pp. ${source.page_start}-${source.page_end}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function KnowledgeSource() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get("ref") || "";
  const [source, setSource] = useState<KnowledgeSourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ref) {
        setSource(null);
        setError("Referencia de fonte em falta.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await chatApi.getKnowledgeSource(ref);
        if (mounted) setSource(data);
      } catch (err) {
        if (mounted) setError(getErrorMessage(err, "Nao foi possivel abrir a fonte."));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [ref]);

  const metadata = useMemo(() => source?.metadata || {}, [source]);
  const anchor = typeof metadata.anchor === "string" ? metadata.anchor : "";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-16">
      <header className="border-b border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              to="/ciso-assistant"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao assistente
            </Link>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Fonte RAG auditavel</p>
            <h1 className="mt-2 max-w-4xl text-3xl font-bold tracking-tight text-slate-950">
              {source?.title || "Fonte normativa"}
            </h1>
            {source?.citation && (
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-relaxed text-slate-600">
                {source.citation}
              </p>
            )}
          </div>

          {source?.source_file && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-700" />
                {source.source_file}
              </div>
            </div>
          )}
        </div>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm font-bold uppercase tracking-wide text-slate-400 shadow-sm">
          A abrir fonte...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      ) : source ? (
        <div className="grid gap-6 xl:grid-cols-[0.75fr_1.6fr]">
          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <ShieldCheck className="h-4 w-4 text-indigo-700" />
                Referencia
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Documento</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{source.document_label || source.framework || "Fonte"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Artigo</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {source.article_number ? `Artigo ${source.article_number}` : source.control_code || "Nao indicado"}
                  </dd>
                </div>
                {source.article_title && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Titulo</dt>
                    <dd className="mt-1 font-semibold text-slate-900">{source.article_title}</dd>
                  </div>
                )}
                {source.paragraph_display && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Paragrafo</dt>
                    <dd className="mt-1 font-semibold text-slate-900">{source.paragraph_display}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pagina</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{formatPages(source)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Referencia tecnica</dt>
                  <dd className="mt-1 break-all font-mono text-xs font-bold text-slate-500">{source.source_ref}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm font-semibold leading-relaxed text-indigo-900">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                <BookOpen className="h-4 w-4" />
                Rastreabilidade
              </div>
              Esta fonte foi recuperada diretamente da base RAG e conserva a referencia ao documento, artigo, paragrafo e pagina usados na resposta.
            </section>
          </aside>

          <main className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Excerto citado</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{source.source_type_label || source.source_label}</p>
                </div>
                {anchor && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {anchor}
                  </span>
                )}
              </div>
            </div>
            <article className="whitespace-pre-wrap px-6 py-6 text-sm font-medium leading-7 text-slate-800">
              {source.content}
            </article>
          </main>
        </div>
      ) : null}
    </div>
  );
}
