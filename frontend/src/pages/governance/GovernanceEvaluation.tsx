import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  GitBranch,
  Layers3,
  Loader2,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import { governanceApi, type GovernanceEvaluationOverview } from "@/lib/governanceApi";

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}

function asArray(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat("pt-PT").format(asNumber(value));
}

function formatPercent(value: unknown) {
  return `${Math.round(asNumber(value))}%`;
}

function formatSeconds(value: unknown) {
  if (value === null || value === undefined || value === "") return "sem dados";
  const seconds = asNumber(value);
  if (!seconds) return "0s";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatDateTime(value: unknown) {
  const text = asText(value, "");
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("pt-PT");
}

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Erro desconhecido");
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <Icon className={`mb-7 h-5 w-5 ${tone}`} />
      <div className="text-3xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">{label}</div>
      {helper ? <div className="mt-3 text-xs font-bold leading-5 text-slate-500">{helper}</div> : null}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ElementType;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div>
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-indigo-600" />
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
          </div>
          {subtitle ? <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-28 items-center justify-center gap-3 px-6 py-8 text-sm font-semibold text-slate-500">
      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      {children}
    </div>
  );
}

function ProgressBar({ value, tone = "bg-indigo-600" }: { value: unknown; tone?: string }) {
  const percentage = Math.max(0, Math.min(100, asNumber(value)));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${percentage}%` }} />
    </div>
  );
}

function StatusPill({ children, tone = "bg-slate-100 text-slate-600" }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${tone}`}>
      {children}
    </span>
  );
}

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

export default function GovernanceEvaluation() {
  const [data, setData] = useState<GovernanceEvaluationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await governanceApi.getGovernanceEvaluationOverview();
      setData(payload);
    } catch (err) {
      setError(apiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assistant = asRecord(data?.assistant);
  const timing = asRecord(assistant.timing);
  const assistantSources = asRecord(assistant.sources);
  const rag = asRecord(data?.rag);
  const traceabilityTotals = asRecord(asRecord(data?.traceability).totals);
  const mappings = asRecord(data?.mappings);
  const gaps = asRecord(data?.gaps);

  const modelRows = useMemo(() => asArray(assistant.models), [assistant.models]);
  const slowestRows = useMemo(() => asArray(assistant.slowest_interactions), [assistant.slowest_interactions]);
  const sourceRows = useMemo(() => asArray(assistantSources.by_source_type), [assistantSources.by_source_type]);
  const ragSourceRows = useMemo(() => asArray(rag.by_source_type), [rag.by_source_type]);
  const frameworkRows = useMemo(() => asArray(data?.frameworks?.items), [data?.frameworks?.items]);
  const policyRows = useMemo(() => asArray(data?.policies?.items), [data?.policies?.items]);
  const gapSeverityRows = useMemo(() => asArray(gaps.by_severity), [gaps.by_severity]);
  const gapTypeRows = useMemo(() => asArray(gaps.by_type), [gaps.by_type]);
  const openGapRows = useMemo(() => asArray(gaps.sample_open_gaps), [gaps.sample_open_gaps]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-indigo-600">Avaliacao da dissertacao</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Painel de avaliacao do Virtual CISO</h1>
            <p className="mt-2 max-w-5xl text-sm font-semibold leading-6 text-slate-600">
              Indicadores reais para demonstrar desempenho do LLM local, uso de fontes RAG, coverage por framework,
              scoring, rastreabilidade e evolucao de gaps. Sem dados ficticios no frontend.
            </p>
            {data?.generated_at ? (
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                Atualizado em {formatDateTime(data.generated_at)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
            <Link
              to="/recommendation-history"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-3 text-sm font-black uppercase tracking-wide text-indigo-700 transition hover:bg-indigo-100"
            >
              <Brain className="h-4 w-4" />
              Historico IA
            </Link>
            <Link
              to="/admin/rag"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-indigo-700"
            >
              <Database className="h-4 w-4" />
              Base RAG
            </Link>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold leading-6 text-red-700">
          Nao foi possivel carregar os indicadores reais: {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500 shadow-sm">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-600" />
          A calcular indicadores a partir da base de dados...
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              icon={Clock}
              label="Tempo medio IA"
              value={formatSeconds(timing.average_seconds)}
              helper={`${formatNumber(timing.samples)} amostras com duracao registada`}
              tone="text-indigo-600"
            />
            <MetricCard
              icon={Bot}
              label="Interacoes IA"
              value={formatNumber(assistant.total_interactions)}
              helper={`${formatPercent(assistant.rag_rate)} com RAG`}
              tone="text-violet-600"
            />
            <MetricCard
              icon={SearchCheck}
              label="Fontes por resposta RAG"
              value={formatNumber(assistantSources.average_sources_per_rag_interaction)}
              helper={`${formatNumber(assistantSources.total_sources_used)} fontes citadas`}
              tone="text-emerald-600"
            />
            <MetricCard
              icon={Database}
              label="Coverage embeddings"
              value={formatPercent(rag.embedding_coverage)}
              helper={`${formatNumber(rag.embedded_chunks)} / ${formatNumber(rag.total_chunks)} chunks`}
              tone="text-slate-600"
            />
            <MetricCard
              icon={ShieldCheck}
              label="Coverage frameworks"
              value={formatPercent(data.frameworks.average_coverage)}
              helper={`${formatNumber(data.frameworks.total_frameworks)} frameworks`}
              tone="text-emerald-600"
            />
            <MetricCard
              icon={AlertTriangle}
              label="Gaps atuais"
              value={formatNumber(gaps.current_total)}
              helper={`${formatNumber(gaps.completed_gap_related_actions)} acoes de gap concluidas`}
              tone="text-orange-600"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
            <Panel
              title="Desempenho do LLM local"
              subtitle="Mede o tempo total observado no endpoint IA: recuperacao de contexto, prompt e chamada ao LLM local."
              icon={Clock}
            >
              <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                <KeyValue label="Amostras" value={formatNumber(timing.samples)} />
                <KeyValue label="Media" value={formatSeconds(timing.average_seconds)} />
                <KeyValue label="Minimo" value={formatSeconds(timing.min_seconds)} />
                <KeyValue label="Maximo" value={formatSeconds(timing.max_seconds)} />
              </div>

              <div className="border-t border-slate-100 px-6 py-5">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">Modelos usados</h3>
                {modelRows.length ? (
                  <div className="mt-4 space-y-3">
                    {modelRows.map((row) => (
                      <div key={asText(row.model)} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black uppercase text-slate-950">{asText(row.model)}</div>
                            <div className="mt-1 text-xs font-bold text-slate-500">{formatNumber(row.total)} interacoes</div>
                          </div>
                          <div className="text-right text-sm font-black text-slate-950">
                            {formatSeconds(row.average_seconds)}
                            <div className="text-[10px] font-black uppercase text-slate-400">media</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>Ainda nao existem interacoes IA registadas.</EmptyState>
                )}
              </div>
            </Panel>

            <Panel
              title="RAG e fontes usadas"
              subtitle="Mostra quantas fontes foram usadas pelo assistente e o estado atual dos chunks/embeddings."
              icon={Database}
            >
              <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                <KeyValue label="Chunks" value={formatNumber(rag.total_chunks)} />
                <KeyValue label="Com embedding" value={formatNumber(rag.embedded_chunks)} />
                <KeyValue label="Sem embedding" value={formatNumber(rag.missing_embeddings)} />
                <KeyValue label="Coverage" value={formatPercent(rag.embedding_coverage)} />
              </div>

              <div className="grid gap-6 border-t border-slate-100 p-6 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">Fontes citadas pela IA</h3>
                  {sourceRows.length ? (
                    <div className="mt-4 space-y-2">
                      {sourceRows.map((row) => (
                        <div key={asText(row.source_type)} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                          <span className="text-sm font-black text-slate-700">{asText(row.source_type)}</span>
                          <span className="text-sm font-black text-slate-950">{formatNumber(row.count)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>Ainda nao ha fontes RAG citadas em respostas.</EmptyState>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">Chunks por tipo de fonte</h3>
                  {ragSourceRows.length ? (
                    <div className="mt-4 space-y-2">
                      {ragSourceRows.map((row) => (
                        <div key={asText(row.source_type)} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                          <span className="text-sm font-black text-slate-700">{asText(row.source_type)}</span>
                          <span className="text-sm font-black text-slate-950">{formatNumber(row.count)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>Ainda nao ha chunks RAG indexados.</EmptyState>
                  )}
                </div>
              </div>
            </Panel>
          </div>

          <Panel
            title="Coverage e score por framework"
            subtitle="Score oficial calculado por propagacao; coverage indica controlos externos avaliados ou cobertos."
            icon={BarChart3}
          >
            {frameworkRows.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 text-left">Framework</th>
                      <th className="px-5 py-3 text-right">Score</th>
                      <th className="px-5 py-3 text-right">Coverage</th>
                      <th className="px-5 py-3 text-right">Avaliados</th>
                      <th className="px-5 py-3 text-right">Gaps</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {frameworkRows.map((row) => (
                      <tr key={asText(row.id)} className="bg-white">
                        <td className="px-5 py-4">
                          <div className="font-black text-slate-950">{asText(row.label, asText(row.code))}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">{asText(row.name)}</div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="font-black text-slate-950">{formatPercent(row.score)}</div>
                          <div className="mt-2"><ProgressBar value={row.score} tone="bg-emerald-600" /></div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="font-black text-slate-950">{formatPercent(row.coverage)}</div>
                          <div className="mt-2"><ProgressBar value={row.coverage} /></div>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-slate-600">
                          {formatNumber(row.assessed_controls)} / {formatNumber(row.total_controls)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <StatusPill tone={asNumber(row.gaps_count) ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}>
                            {formatNumber(row.gaps_count)}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Ainda nao existem frameworks para avaliar.</EmptyState>
            )}
          </Panel>

          <Panel
            title="Score por politica"
            subtitle="Score oficial das politicas baseado nos controlos internos e mecanismos associados."
            icon={FileText}
          >
            {policyRows.length ? (
              <div className="divide-y divide-slate-100">
                {policyRows.map((row) => (
                  <Link key={asText(row.id)} to={`/governance/policies/${asText(row.id)}`} className="block px-6 py-4 hover:bg-slate-50">
                    <div className="grid gap-4 lg:grid-cols-[1fr_160px_130px_80px] lg:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-black text-slate-950">
                          {asText(row.code)} - {asText(row.title)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <StatusPill>{asText(row.status)}</StatusPill>
                          <StatusPill tone="bg-indigo-50 text-indigo-700">{asText(row.compliance_status)}</StatusPill>
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-right text-sm font-black text-slate-950">{formatPercent(row.score)}</div>
                        <ProgressBar value={row.score} tone="bg-emerald-600" />
                      </div>
                      <div className="text-right text-xs font-black uppercase tracking-wide text-slate-400">
                        {formatNumber(row.gaps_count)} gaps
                      </div>
                      <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState>Ainda nao existem politicas para avaliar.</EmptyState>
            )}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel
              title="Rastreabilidade e mappings"
              subtitle="Totais de entidades e estado das relacoes transversais."
              icon={GitBranch}
            >
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <KeyValue label="Politicas" value={formatNumber(traceabilityTotals.policies)} />
                <KeyValue label="Documentos" value={formatNumber(traceabilityTotals.governance_documents)} />
                <KeyValue label="Controlos internos" value={formatNumber(traceabilityTotals.internal_controls)} />
                <KeyValue label="Mecanismos" value={formatNumber(traceabilityTotals.mechanisms)} />
                <KeyValue label="Evidencias" value={formatNumber(traceabilityTotals.evidence_items)} />
                <KeyValue label="Frameworks" value={formatNumber(traceabilityTotals.frameworks)} />
              </div>
              <div className="grid gap-3 border-t border-slate-100 p-6 sm:grid-cols-2 lg:grid-cols-5">
                {["approved", "pending_review", "draft", "rejected", "deprecated"].map((status) => (
                  <div key={status} className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xl font-black text-slate-950">{formatNumber(mappings[status])}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{status}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Gaps resolvidos e em aberto"
              subtitle="Indicadores para demonstrar melhoria: gaps atuais, acoes concluidas e lacunas por severidade."
              icon={Layers3}
            >
              <div className="grid gap-4 p-6 sm:grid-cols-3">
                <KeyValue label="Gaps atuais" value={formatNumber(gaps.current_total)} />
                <KeyValue label="Gaps legacy implementados" value={formatNumber(gaps.resolved_legacy_compliance_gaps)} />
                <KeyValue label="Acoes concluidas" value={formatNumber(gaps.completed_governance_actions)} />
              </div>
              <div className="grid gap-6 border-t border-slate-100 p-6 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">Por severidade</h3>
                  {gapSeverityRows.length ? (
                    <div className="mt-4 space-y-2">
                      {gapSeverityRows.map((row) => (
                        <div key={asText(row.severity)} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                          <span className="text-sm font-black text-slate-700">{asText(row.severity)}</span>
                          <span className="text-sm font-black text-slate-950">{formatNumber(row.count)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>Sem gaps oficiais atuais.</EmptyState>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-400">Por tipo</h3>
                  {gapTypeRows.length ? (
                    <div className="mt-4 space-y-2">
                      {gapTypeRows.map((row) => (
                        <div key={asText(row.type)} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                          <span className="min-w-0 truncate text-sm font-black text-slate-700">{asText(row.type)}</span>
                          <span className="text-sm font-black text-slate-950">{formatNumber(row.count)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>Sem tipos de gap para apresentar.</EmptyState>
                  )}
                </div>
              </div>
            </Panel>
          </div>

          <Panel
            title="Interacoes IA mais lentas"
            subtitle="Apoia a discussao da dissertacao sobre limitacoes de LLM local e recursos computacionais."
            icon={AlertTriangle}
          >
            {slowestRows.length ? (
              <div className="divide-y divide-slate-100">
                {slowestRows.map((row) => (
                  <div key={asText(row.id)} className="grid gap-4 px-6 py-4 lg:grid-cols-[1fr_160px_120px_160px] lg:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-950">{asText(row.question)}</div>
                      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                        {asText(row.task_type)} - {formatDateTime(row.created_at)}
                      </div>
                    </div>
                    <div className="text-sm font-black uppercase text-slate-700">{asText(row.model_used)}</div>
                    <div className="text-sm font-black text-slate-950">{formatSeconds(row.duration_seconds)}</div>
                    <div className="text-sm font-bold text-slate-500">{formatNumber(row.sources_count)} fontes usadas</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>Ainda nao ha tempos registados. As novas interacoes IA passam a guardar esta metrica.</EmptyState>
            )}
          </Panel>

          <Panel
            title="Amostra de gaps atuais"
            subtitle="Lista curta devolvida pelo motor de conformidade por propagacao."
            icon={AlertTriangle}
          >
            {openGapRows.length ? (
              <div className="grid gap-3 p-6 lg:grid-cols-2">
                {openGapRows.map((row, index) => (
                  <div key={`${asText(row.type)}-${index}`} className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone="bg-white text-orange-700">{asText(row.severity, "gap")}</StatusPill>
                      <StatusPill tone="bg-white text-slate-700">{asText(row.type)}</StatusPill>
                    </div>
                    <p className="mt-3 text-sm font-bold leading-6 text-orange-950">
                      {asText(row.description, asText(row.recommendation, "Gap sem descricao"))}
                    </p>
                    {row.recommendation ? (
                      <p className="mt-2 text-sm font-semibold leading-6 text-orange-800">{asText(row.recommendation)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>Sem gaps oficiais devolvidos pelo motor.</EmptyState>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
