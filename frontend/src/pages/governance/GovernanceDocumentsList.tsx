/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, FilePlus2, FileText, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { mappingReviewApi } from "@/lib/mappingReviewApi";

type DocumentRecord = Record<string, any>;

const documentTypes = [
  { value: "", label: "Todos os tipos" },
  { value: "policy", label: "Policy" },
  { value: "standard", label: "Norma" },
  { value: "procedure", label: "Procedimento" },
  { value: "guideline", label: "Guideline" },
  { value: "technical_regulation", label: "Regulamento tecnico" },
  { value: "runbook", label: "Runbook" },
];

const statuses = [
  { value: "", label: "Todos os estados" },
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Em revisao" },
  { value: "approved", label: "Aprovado" },
  { value: "published", label: "Publicado" },
  { value: "deprecated", label: "Deprecated" },
  { value: "archived", label: "Arquivado" },
];

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function documentTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    policy: "Policy",
    standard: "Norma",
    procedure: "Procedimento",
    guideline: "Guideline",
    technical_regulation: "Regulamento tecnico",
    runbook: "Runbook",
  };
  return labels[type || ""] || type || "Documento";
}

function documentTypeTone(type?: string) {
  if (type === "policy") return "border-slate-200 bg-slate-50 text-slate-700";
  if (type === "standard") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "procedure") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  if (type === "runbook") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (type === "technical_regulation") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-violet-100 bg-violet-50 text-violet-700";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    under_review: "Em revisao",
    approved: "Aprovado",
    published: "Publicado",
    deprecated: "Deprecated",
    archived: "Arquivado",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusTone(status?: string) {
  if (status === "approved" || status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "under_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "deprecated" || status === "archived") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function parentLabel(document: DocumentRecord) {
  if (document.parent_document_title) return document.parent_document_title;
  if (document.legacy_policy_title) return `${document.legacy_policy_code || "Policy"} - ${document.legacy_policy_title}`;
  return "-";
}

export default function GovernanceDocumentsList() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    document_type: "",
    status: "",
    owner: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await mappingReviewApi.listGovernanceDocuments({
        page_size: 500,
        search: filters.search,
        document_type: filters.document_type,
        status: filters.status,
        owner__icontains: filters.owner,
      });
      setDocuments(unwrap<DocumentRecord>(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar documentos de governance.");
    } finally {
      setLoading(false);
    }
  }, [filters.document_type, filters.owner, filters.search, filters.status]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => ({
    total: documents.length,
    published: documents.filter((document) => document.status === "published" || document.status === "approved").length,
    runbooks: documents.filter((document) => document.document_type === "runbook").length,
    review: documents.filter((document) => document.status === "under_review").length,
  }), [documents]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governo documental</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Documentos de governance</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Consulte politicas, normas, procedimentos, guidelines, regulamentos tecnicos e runbooks ligados a controlos internos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link to="/governance/documents/wizard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <FilePlus2 className="h-4 w-4" />
              Criar documento
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileText className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Documentos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.published}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Aprovados/publicados</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <BookOpen className="h-5 w-5 text-cyan-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.runbooks}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Runbooks</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.review}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Em revisao</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") load();
              }}
              placeholder="Pesquisar por titulo, ambito, proposito ou conteudo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select value={filters.document_type} onChange={(event) => setFilters((current) => ({ ...current, document_type: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
            {documentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
            {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <input value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))} placeholder="Owner" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
          <button onClick={load} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
            Filtrar
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {loading ? "A carregar..." : `${documents.length} documento(s) encontrados`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Titulo</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Versao</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Estado</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Owner</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Documento pai</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Revisao</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && documents.map((document) => (
                <tr key={document.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link to={`/governance/documents/${document.id}`} className="font-bold text-slate-950 hover:text-indigo-700">
                      {document.title}
                    </Link>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{document.purpose || document.scope || document.content || "Sem resumo."}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${documentTypeTone(document.document_type)}`}>
                      {documentTypeLabel(document.document_type)}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-600">v{document.version || "1.0"}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(document.status)}`}>
                      {statusLabel(document.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-600">{document.owner || "-"}</td>
                  <td className="px-5 py-4 font-semibold text-slate-600">{parentLabel(document)}</td>
                  <td className="px-5 py-4 font-semibold text-slate-600">{formatDate(document.review_date)}</td>
                  <td className="px-5 py-4">
                    <Link to={`/governance/documents/${document.id}`} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar documentos...</div>}
        {!loading && documents.length === 0 && (
          <div className="p-12 text-center text-sm font-semibold text-slate-500">
            Sem documentos para os filtros atuais.
          </div>
        )}
      </section>
    </div>
  );
}
