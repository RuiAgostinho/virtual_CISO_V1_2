import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bot,
  CheckCircle2,
  Database,
  FileCheck2,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  chatApi,
  type AssistantHistoryEntry,
  type ChatSource,
} from "@/lib/chatApi";

function sourceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    structured_query: "Consulta estruturada",
    vulnerability_prioritization: "Priorização",
    policy: "Política",
    asset: "Ativo",
    vulnerability: "Vulnerabilidade",
    control: "Controlo",
    mechanism: "Mecanismo",
    technical_regulation: "Regulamento técnico",
    procedure: "Procedimento",
    evidence: "Evidência",
    compliance_gap: "Gap de conformidade",
    general: "Conhecimento",
    internal: "Fonte interna",
  };
  return labels[type] || type;
}

function taskTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    structured_query: "Consulta estruturada",
    vulnerability_prioritization: "Priorização",
    control_mapping: "Mapeamento de controlos",
    evidence_drafting: "Evidência",
    executive_advisory: "Aconselhamento executivo",
    risk_analysis: "Análise de risco",
    technical_implementation: "Implementação técnica",
    general_qa: "Pergunta geral",
  };
  return type ? labels[type] || type : "Sem classificação";
}

function confidenceLabel(confidence?: number | null) {
  if (confidence === undefined || confidence === null || Number.isNaN(Number(confidence))) return null;
  return `${Math.round(Number(confidence) * 100)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sem data";
  try {
    return new Date(value).toLocaleString("pt-PT");
  } catch {
    return value;
  }
}

function preview(text: string, max = 240) {
  const clean = (text || "").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

function sourceIcon(type: string) {
  if (type === "structured_query") return <Database className="h-3.5 w-3.5" />;
  if (type === "vulnerability_prioritization") return <ShieldCheck className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

function sourceScore(score?: number | null) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const value = Number(score);
  if (value <= 1) return value.toFixed(2);
  return Math.round(value).toString();
}

function decisionLabel(value: string) {
  const labels: Record<string, string> = {
    accepted: "Aceite",
    rejected: "Rejeitada",
    deferred: "Adiada",
    mitigate: "Mitigar",
    transferred: "Transferida",
    converted_to_action: "Convertida em ação",
  };
  return labels[value] || value;
}

function SourceCard({ source }: { source: ChatSource }) {
  const score = sourceScore(source.score);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
            {sourceIcon(source.source_type)}
            {sourceTypeLabel(source.source_type)}
          </div>
          <h4 className="truncate text-xs font-bold text-slate-900">{source.title || "Fonte sem título"}</h4>
        </div>
        {score && (
          <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
            {score}
          </span>
        )}
      </div>
      {source.source_ref && (
        <p className="mt-1 truncate font-mono text-[10px] font-bold text-slate-400">{source.source_ref}</p>
      )}
      {source.content_excerpt && (
        <p className="mt-2 line-clamp-3 text-xs font-medium leading-relaxed text-slate-600">
          {source.content_excerpt}
        </p>
      )}
    </div>
  );
}

type ConvertForm = {
  decision_code: string;
  justification: string;
  title: string;
};

const initialConvertForm: ConvertForm = {
  decision_code: "converted_to_action",
  justification: "",
  title: "",
};

export default function RecommendationHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<AssistantHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ragOnly, setRagOnly] = useState(false);
  const [convertedFilter, setConvertedFilter] = useState<"all" | "converted" | "pending">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState<ConvertForm>(initialConvertForm);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null);

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const converted =
        convertedFilter === "all"
          ? undefined
          : convertedFilter === "converted";
      const data = await chatApi.listHistory({
        page_size: 100,
        search: search.trim(),
        rag_only: ragOnly,
        ...(converted !== undefined ? { converted } : {}),
      });
      const items = data.results || [];
      const desiredId = searchParams.get("id");
      setEntries(items);
      setSelectedId((current) => {
        if (desiredId && items.some((item) => item.id === desiredId)) return desiredId;
        return current && items.some((item) => item.id === current) ? current : items[0]?.id || null;
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar o histórico persistente do assistente.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const desiredId = searchParams.get("id");
    if (desiredId && entries.some((item) => item.id === desiredId)) {
      setSelectedId(desiredId);
    }
  }, [entries, searchParams]);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) || null,
    [entries, selectedId],
  );

  const metrics = useMemo(() => {
    const total = entries.length;
    const withRag = entries.filter((entry) => entry.used_rag).length;
    const structured = entries.filter((entry) => entry.task_type === "structured_query").length;
    const withSources = entries.filter((entry) => (entry.sources_json || []).length > 0).length;
    return { total, withRag, structured, withSources };
  }, [entries]);

  useEffect(() => {
    setConvertForm((current) => ({
      ...current,
      title: selected?.question?.slice(0, 255) || "",
    }));
    setConvertError(null);
    setConvertSuccess(null);
  }, [selectedId]);

  const removeSelected = async () => {
    if (!selected) return;
    await chatApi.deleteHistoryEntry(selected.id);
    await load(false);
  };

  const convertSelected = async () => {
    if (!selected) return;
    if (!convertForm.justification.trim() || convertForm.justification.trim().length < 10) {
      setConvertError("A justificação deve ter pelo menos 10 caracteres.");
      return;
    }

    setConvertBusy(true);
    setConvertError(null);
    setConvertSuccess(null);
    try {
      const result = await chatApi.convertRecommendation(selected.id, {
        decision_code: convertForm.decision_code,
        justification: convertForm.justification.trim(),
        title: convertForm.title.trim() || selected.question.slice(0, 255),
      });
      setConvertSuccess(`Recomendação convertida em decisão formal: ${result.decision_display}.`);
      setConvertForm(initialConvertForm);
      await load(false);
    } catch (err: any) {
      console.error(err);
      setConvertError(err?.message || "Não foi possível converter a recomendação em decisão.");
    } finally {
      setConvertBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">IA do Virtual CISO</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Histórico de recomendações</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Histórico persistente do assistente, partilhável entre utilizadores, com trilho auditável e ponte para decisão formal.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link
              to="/ciso-assistant"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
            >
              <Bot className="h-4 w-4" />
              Abrir assistente
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Bot className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Respostas guardadas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.withRag}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Com RAG</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Database className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.structured}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Consultas estruturadas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileText className="h-5 w-5 text-sky-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.withSources}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Com fontes visíveis</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por pergunta, resposta, tipo de tarefa ou modelo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={ragOnly}
              onChange={(event) => setRagOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Só com RAG
          </label>
          <select
            value={convertedFilter}
            onChange={(event) => setConvertedFilter(event.target.value as "all" | "converted" | "pending")}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="all">Todas</option>
            <option value="converted">Já convertidas</option>
            <option value="pending">Por converter</option>
          </select>
          <button
            onClick={() => load()}
            className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
          >
            Filtrar
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {loading ? "A carregar..." : `${entries.length} recomendações listadas`}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSelectedId(entry.id);
                  setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set("id", entry.id);
                    return next;
                  }, { replace: true });
                }}
                className={`w-full px-5 py-4 text-left transition-colors ${
                  entry.id === selected?.id ? "bg-indigo-50/70" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {taskTypeLabel(entry.task_type)}
                    </span>
                    {entry.model_used && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {entry.model_used}
                      </span>
                    )}
                    <span className={entry.used_rag ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"}>
                      {entry.used_rag ? `RAG: ${(entry.sources_json || []).length} fontes` : "Sem RAG"}
                    </span>
                    {confidenceLabel(entry.confidence) && (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                        Confiança: {confidenceLabel(entry.confidence)}
                      </span>
                    )}
                    {entry.converted_decision_id && (
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                        Convertida em decisão
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{entry.question}</p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                      {preview(entry.answer)}
                    </p>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-400">
                    {formatDateTime(entry.created_at)} {entry.created_by ? `· ${entry.created_by}` : ""}
                  </p>
                </div>
              </button>
            ))}
            {!loading && entries.length === 0 && (
              <div className="p-10 text-center text-sm font-semibold text-slate-500">
                Ainda não existem recomendações persistidas para os filtros atuais.
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          {!selected ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center text-slate-400">
              <Sparkles className="mb-4 h-12 w-12" />
              <p className="text-sm font-semibold">Seleciona uma recomendação para ver o detalhe.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3 border-b border-slate-100 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {taskTypeLabel(selected.task_type)}
                  </span>
                  {selected.model_used && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {selected.model_used}
                    </span>
                  )}
                  <span className={selected.used_rag ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"}>
                    {selected.used_rag ? `RAG ativo (${(selected.sources_json || []).length} fontes)` : "Sem RAG"}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pergunta original</p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{selected.question}</h2>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {formatDateTime(selected.created_at)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Resposta do assistente</p>
                <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-medium leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {selected.answer}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Confiança</p>
                  <p className="mt-2 text-lg font-bold text-slate-950">{confidenceLabel(selected.confidence) || "—"}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fontes</p>
                  <p className="mt-2 text-lg font-bold text-slate-950">{(selected.sources_json || []).length}</p>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fontes utilizadas</p>
                </div>
                {(selected.sources_json || []).length === 0 ? (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                    Esta resposta não trouxe fontes explícitas.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {(selected.sources_json || []).map((source, index) => (
                      <SourceCard key={`${source.source_ref}-${index}`} source={source} />
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-slate-500" />
                  <p className="text-sm font-bold text-slate-900">Converter em decisão formal</p>
                </div>
                {selected.converted_decision_id && (
                  <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
                    Esta recomendação já foi convertida numa decisão formal.
                  </div>
                )}
                <div className="space-y-3">
                  <select
                    value={convertForm.decision_code}
                    onChange={(event) => setConvertForm((current) => ({ ...current, decision_code: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="converted_to_action">{decisionLabel("converted_to_action")}</option>
                    <option value="mitigate">{decisionLabel("mitigate")}</option>
                    <option value="accepted">{decisionLabel("accepted")}</option>
                    <option value="deferred">{decisionLabel("deferred")}</option>
                    <option value="transferred">{decisionLabel("transferred")}</option>
                    <option value="rejected">{decisionLabel("rejected")}</option>
                  </select>
                  <input
                    type="text"
                    value={convertForm.title}
                    onChange={(event) => setConvertForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Título da decisão"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                  <textarea
                    value={convertForm.justification}
                    onChange={(event) => setConvertForm((current) => ({ ...current, justification: event.target.value }))}
                    placeholder="Justificação da decisão formal com base nesta recomendação..."
                    className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                  {convertError && (
                    <p className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                      <XCircle className="h-3.5 w-3.5" />
                      {convertError}
                    </p>
                  )}
                  {convertSuccess && (
                    <p className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {convertSuccess}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={convertSelected}
                    disabled={convertBusy || Boolean(selected.converted_decision_id)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <FileCheck2 className="h-4 w-4" />
                    {convertBusy ? "A converter..." : "Criar decisão formal"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {selected.converted_decision_id && (
                  <Link
                    to={`/decision-records?id=${encodeURIComponent(selected.converted_decision_id)}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700"
                  >
                    <FileCheck2 className="h-4 w-4" />
                    Ver decisão formal
                  </Link>
                )}
                <Link
                  to={`/ciso-assistant?q=${encodeURIComponent(selected.question)}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                >
                  <Bot className="h-4 w-4" />
                  Reabrir no assistente
                </Link>
                <button
                  type="button"
                  onClick={removeSelected}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </button>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
