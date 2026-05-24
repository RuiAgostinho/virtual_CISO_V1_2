import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import { governanceApi, type DecisionRecord, type DecisionValue } from "@/lib/governanceApi";
import { buildDecisionUrl } from "@/lib/decisionApi";

function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return (data as { results?: T[] } | null)?.results || [];
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sem registo temporal";
  try {
    return new Date(value).toLocaleString("pt-PT");
  } catch {
    return value;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem prazo";
  try {
    return new Date(value).toLocaleDateString("pt-PT");
  } catch {
    return value;
  }
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function decisionLabel(value: DecisionValue) {
  switch (value) {
    case "accepted":
      return "Aceite";
    case "mitigate":
      return "Mitigar";
    case "deferred":
      return "Adiada";
    case "transferred":
      return "Transferida";
    case "converted_to_action":
      return "Convertida em ação";
    case "rejected":
      return "Rejeitada";
    default:
      return titleCase(value);
  }
}

function decisionTone(value: DecisionValue) {
  switch (value) {
    case "accepted":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "mitigate":
      return "border-red-200 bg-red-50 text-red-700";
    case "deferred":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "transferred":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "converted_to_action":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "rejected":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function decisionIcon(value: DecisionValue) {
  switch (value) {
    case "accepted":
      return CheckCircle2;
    case "mitigate":
      return ShieldAlert;
    case "deferred":
      return Clock3;
    case "transferred":
      return ArrowRight;
    case "converted_to_action":
      return FileCheck2;
    case "rejected":
      return Filter;
    default:
      return FileCheck2;
  }
}

function extractScore(record: DecisionRecord) {
  const raw = Number(record.score_snapshot?.global_score ?? record.score_snapshot?.score ?? 0);
  return Number.isFinite(raw) ? Math.round(raw) : null;
}

function extractRecommendedAction(record: DecisionRecord) {
  return record.score_snapshot?.recommended_action || record.score_snapshot?.recommendedAction || null;
}

function extractSourcesCount(record: DecisionRecord) {
  return Array.isArray(record.source_snapshot) ? record.source_snapshot.length : 0;
}

function preview(text: string, fallback: string) {
  const trimmed = (text || "").trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= 220) return trimmed;
  return `${trimmed.slice(0, 220).trim()}...`;
}

function scoreTone(score: number | null) {
  if (score === null) return "text-slate-400";
  if (score >= 81) return "text-red-600";
  if (score >= 61) return "text-orange-600";
  if (score >= 41) return "text-amber-600";
  return "text-emerald-600";
}

function canOpenDecision(record: DecisionRecord) {
  return record.decision_type === "vulnerability" && record.target_id;
}

export default function DecisionRecords() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page_size: 100,
        ordering: "-decided_at,-created_at",
      };
      if (search.trim()) params.search = search.trim();
      if (decisionFilter) params.decision = decisionFilter;
      if (typeFilter) params.decision_type = typeFilter;

      const data = await governanceApi.listDecisionRecords(params);
      const items = asArray<DecisionRecord>(data);
      const desiredId = searchParams.get("id");
      setRecords(items);
      setSelectedId((current) => {
        if (desiredId && items.some((item) => item.id === desiredId)) return desiredId;
        return current && items.some((item) => item.id === current) ? current : items[0]?.id || null;
      });
    } catch (err: unknown) {
      console.error(err);
      setError(errorMessage(err, "Não foi possível carregar as decisões registadas."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const desiredId = searchParams.get("id");
    if (desiredId && records.some((item) => item.id === desiredId)) {
      setSelectedId(desiredId);
    }
  }, [records, searchParams]);

  const metrics = useMemo(() => {
    const total = records.length;
    const openMitigation = records.filter((record) => record.decision === "mitigate" || record.decision === "converted_to_action").length;
    const accepted = records.filter((record) => record.decision === "accepted").length;
    const assistantLinked = records.filter((record) => extractSourcesCount(record) > 0 || record.decision_type === "assistant_recommendation").length;
    return { total, openMitigation, accepted, assistantLinked };
  }, [records]);

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) || null,
    [records, selectedId],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">IA do Virtual CISO</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Decisões registadas</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Repositório auditável das decisões tomadas sobre vulnerabilidades, risco e recomendações,
              com justificação, score contextual e rastos de suporte.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileCheck2 className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de decisões</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.openMitigation}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Mitigar / ação</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.accepted}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Risco aceite</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.assistantLinked}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Com suporte IA / fontes</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por decisão, justificação, actor..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={decisionFilter}
            onChange={(event) => setDecisionFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todas as decisões</option>
            <option value="mitigate">Mitigar</option>
            <option value="accepted">Aceite</option>
            <option value="deferred">Adiada</option>
            <option value="transferred">Transferida</option>
            <option value="converted_to_action">Convertida em ação</option>
            <option value="rejected">Rejeitada</option>
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todos os alvos</option>
            <option value="vulnerability">Vulnerabilidade</option>
            <option value="risk">Risco</option>
            <option value="compliance_gap">Compliance gap</option>
            <option value="assistant_recommendation">Recomendação do assistente</option>
          </select>
          <button
            onClick={load}
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {loading ? "A carregar..." : `${records.length} decisões encontradas`}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {records.map((record) => {
              const Icon = decisionIcon(record.decision);
              const active = record.id === selectedId;
              const score = extractScore(record);
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(record.id);
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("id", record.id);
                      return next;
                    }, { replace: true });
                  }}
                  className={`w-full px-5 py-4 text-left transition-colors ${
                    active ? "bg-indigo-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${decisionTone(record.decision)}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {record.decision_display || decisionLabel(record.decision)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {record.decision_type_display || titleCase(record.decision_type)}
                        </span>
                      </div>
                      <h2 className="mt-3 text-base font-bold text-slate-950">{record.title || "Decisão sem título"}</h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {record.due_date ? `Prazo: ${formatDate(record.due_date)} · ` : ""}
                        {preview(record.justification, "Sem justificação registada.")}
                      </p>
                    </div>
                    <div className="grid min-w-[240px] grid-cols-3 gap-3 text-center">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className={`text-lg font-bold ${scoreTone(score)}`}>{score ?? "—"}</p>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Score</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-sm font-bold text-slate-950">{extractSourcesCount(record)}</p>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Fontes</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="truncate text-sm font-bold text-slate-950">{record.responsible || record.decided_by || "system"}</p>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Resp.</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!loading && records.length === 0 && (
              <div className="p-10 text-center text-sm font-semibold text-slate-500">
                Ainda não existem decisões registadas para os filtros atuais.
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          {!selected ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center text-slate-400">
              <FileCheck2 className="mb-4 h-12 w-12" />
              <p className="text-sm font-semibold">Seleciona uma decisão para ver o detalhe.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3 border-b border-slate-100 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${decisionTone(selected.decision)}`}>
                    {selected.decision_display || decisionLabel(selected.decision)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {selected.decision_type_display || titleCase(selected.decision_type)}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Decisão selecionada</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{selected.title || "Sem título"}</h2>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                    {selected.recommendation?.trim()
                      ? preview(selected.recommendation, "Sem recomendação associada.")
                      : "Sem recomendação associada."}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ResponsÃ¡vel</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                    <UserRound className="h-4 w-4 text-slate-400" />
                    {selected.responsible || selected.decided_by || "system"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Prazo</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Clock3 className="h-4 w-4 text-slate-400" />
                    {formatDate(selected.due_date)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Registada por</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                    <UserRound className="h-4 w-4 text-slate-400" />
                    {selected.decided_by || "system"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data da decisão</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Clock3 className="h-4 w-4 text-slate-400" />
                    {formatDateTime(selected.decided_at || selected.created_at)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score no momento</p>
                  <p className={`mt-2 text-2xl font-bold ${scoreTone(extractScore(selected))}`}>
                    {extractScore(selected) ?? "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fontes usadas</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{extractSourcesCount(selected)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Justificação</p>
                  <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                    {selected.justification || "Sem justificação registada."}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Racional / contexto</p>
                  <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                    {selected.rationale?.trim()
                      ? selected.rationale
                      : "Sem racional complementar registado nesta decisão."}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto em risco</p>
                    <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                      {selected.risk_impact?.trim() || "Sem impacto em risco registado."}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto em conformidade</p>
                    <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                      {selected.compliance_impact?.trim() || "Sem impacto em conformidade registado."}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">EvidÃªncia associada</p>
                    <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                      {selected.evidence_reference?.trim() || "Sem evidÃªncia associada."}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">AÃ§Ã£o associada</p>
                    <p className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                      {selected.action_reference?.trim() || "Sem aÃ§Ã£o associada."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Snapshot contextual</p>
                </div>
                <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ação recomendada</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {extractRecommendedAction(selected) || "Não disponível"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Alvo</p>
                    <p className="mt-1 break-all text-sm font-bold text-slate-900">{selected.target_id}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {canOpenDecision(selected) && (
                  <Link
                    to={buildDecisionUrl(selected.target_id)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Abrir ecrã de decisão
                  </Link>
                )}
                {selected.decision_type === "assistant_recommendation" && selected.target_id && (
                  <Link
                    to={`/recommendation-history?id=${encodeURIComponent(selected.target_id)}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                  >
                    <Sparkles className="h-4 w-4" />
                    Ver recomendação de origem
                  </Link>
                )}
                <Link
                  to="/ciso-assistant"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                >
                  <Bot className="h-4 w-4" />
                  Voltar ao assistente
                </Link>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
