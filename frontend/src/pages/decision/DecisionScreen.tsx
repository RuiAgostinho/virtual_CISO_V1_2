import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  FileCheck2,
  RefreshCw,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  decisionApi,
  scoreTone,
  statusBadgeTone,
  type AIRecommendation,
  type AvailableAction,
  type ComplianceChainEntry,
  type DecisionCode,
  type DecisionContextResponse,
  type DimensionScore,
  type HistoryEvent,
} from "@/lib/decisionApi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TONE_BAR: Record<ReturnType<typeof scoreTone>, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

const TONE_TEXT: Record<ReturnType<typeof scoreTone>, string> = {
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  orange: "text-orange-600",
  red: "text-red-600",
};

const TONE_BG: Record<ReturnType<typeof scoreTone>, string> = {
  emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
  amber: "bg-amber-50 border-amber-100 text-amber-700",
  orange: "bg-orange-50 border-orange-100 text-orange-700",
  red: "bg-red-50 border-red-100 text-red-700",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-100",
  high: "bg-orange-50 text-orange-700 border-orange-100",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  low: "bg-slate-50 text-slate-600 border-slate-100",
};

const MECHANISM_STATUS_TONE: Record<string, string> = {
  Implementado: "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Em implementação": "bg-amber-50 text-amber-700 border-amber-100",
  "Não iniciado": "bg-red-50 text-red-700 border-red-100",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-PT");
  } catch {
    return iso;
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-PT");
  } catch {
    return iso;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-32 rounded-3xl bg-slate-100 animate-pulse" />
      <div className="h-64 rounded-3xl bg-slate-100 animate-pulse" />
      <div className="h-48 rounded-3xl bg-slate-100 animate-pulse" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-8">
      <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
        <div className="flex items-center gap-3 font-bold">
          <AlertTriangle className="h-5 w-5" />
          Erro ao carregar o ecrã de decisão
        </div>
        <p className="mt-2 text-sm font-medium">{message}</p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
        >
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      </div>
    </div>
  );
}

function HeaderSection({ data, onReload }: { data: DecisionContextResponse; onReload: () => void }) {
  const tone = scoreTone(data.score.global_score);
  const occ = data.occurrence;
  return (
    <header className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link
            to="/risks/prioritization"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar à fila priorizada
          </Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Ecrã de decisão · CVE {occ.vulnerability.cve_id}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              {occ.vulnerability.cve_id} em {occ.asset.name}
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Primeira deteção {formatDateTime(occ.first_detected)} · Última observação {formatDateTime(occ.last_seen)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeTone(occ.status)}`}
            >
              <Clock className="h-3.5 w-3.5" /> {occ.status}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              Severidade {occ.vulnerability.severity}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              Ativo {occ.asset.criticality}
            </span>
            {occ.vulnerability.is_in_kev && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                CISA KEV
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className={`rounded-2xl border px-5 py-4 text-right ${TONE_BG[tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Prioridade</p>
            <p className={`mt-1 text-4xl font-bold ${TONE_TEXT[tone]}`}>
              {Math.round(data.score.global_score)}
              <span className="text-sm font-semibold text-slate-500">/100</span>
            </p>
            <p className="mt-1 text-xs font-bold">{data.score.classification_label}</p>
          </div>
          <button
            onClick={onReload}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recalcular
          </button>
        </div>
      </div>
    </header>
  );
}

function ScorePanel({ data }: { data: DecisionContextResponse }) {
  const tone = scoreTone(data.score.global_score);
  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">A. Score multidimensional</p>
        <h2 className="text-xl font-bold text-slate-950">Decomposição por dimensão</h2>
        <p className="text-xs font-semibold text-slate-500">
          Classificação <span className={TONE_TEXT[tone]}>{data.score.classification_label}</span> (banda{" "}
          {data.score.classification_band}) · Ação recomendada: <strong>{data.score.recommended_action}</strong>{" "}
          · Calculado em {formatDateTime(data.score.computed_at)}
        </p>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Dimensão</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3 w-72">Normalizado</th>
              <th className="px-4 py-3 text-right">Peso</th>
              <th className="px-4 py-3 text-right">Contribuição</th>
              <th className="px-4 py-3">Fonte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.score.dimensions.map((d) => (
              <ScoreDimensionRow key={d.code} dimension={d} />
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">
                Total ponderado
              </td>
              <td className="px-4 py-3 text-right text-base font-bold text-slate-900">
                {data.score.global_score.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-500">/100</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ScoreDimensionRow({ dimension }: { dimension: DimensionScore }) {
  const tone = scoreTone(dimension.normalized_score);
  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-4 py-3 font-semibold text-slate-800">{dimension.label}</td>
      <td className="px-4 py-3 text-slate-600">{dimension.raw_value}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${TONE_BAR[tone]}`}
              style={{ width: `${Math.max(2, Math.min(100, dimension.normalized_score))}%` }}
            />
          </div>
          <span className={`min-w-[3.5rem] text-right text-sm font-bold ${TONE_TEXT[tone]}`}>
            {dimension.normalized_score.toFixed(0)}
          </span>
        </div>
        <p className="mt-1 text-[11px] font-medium text-slate-500">{dimension.explanation}</p>
      </td>
      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
        {(dimension.weight * 100).toFixed(0)}%
      </td>
      <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{dimension.contribution.toFixed(2)}</td>
      <td className="px-4 py-3 text-xs font-semibold text-slate-500">{dimension.source}</td>
    </tr>
  );
}

function ComplianceChainSection({ entries }: { entries: ComplianceChainEntry[] }) {
  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">B. Cadeia de rastreabilidade</p>
        <h2 className="text-xl font-bold text-slate-950">Controlos aplicáveis e mecanismos</h2>
      </div>
      {entries.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
          Nenhum controlo associado a este ativo ou vulnerabilidade ainda. Para que a cadeia se preencha, liga
          controlos relevantes em <Link to="/controls" className="text-indigo-600 underline">Controlos</Link> ou em{" "}
          <Link to="/governance/mechanisms" className="text-indigo-600 underline">Mecanismos</Link>.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <ComplianceChainCard key={entry.control.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

function ComplianceChainCard({ entry }: { entry: ComplianceChainEntry }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">
            {entry.framework.code} {entry.framework.version}
          </p>
          <h3 className="mt-1 text-sm font-bold text-slate-950">
            {entry.control.code} · {entry.control.title}
          </h3>
          {entry.control.is_mandatory && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
              Obrigatório
            </span>
          )}
        </div>
        {entry.assessment ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">
            Maturidade {entry.assessment.maturity_level}/5
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            Sem avaliação
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Mecanismos ({entry.mechanisms.length})
        </p>
        {entry.mechanisms.length === 0 ? (
          <p className="mt-2 text-xs font-medium text-slate-500">Sem mecanismos associados.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {entry.mechanisms.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate font-semibold text-slate-800">{m.title}</span>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    MECHANISM_STATUS_TONE[m.status] || "bg-slate-50 text-slate-600 border-slate-100"
                  }`}
                >
                  {m.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
        <div className="rounded-lg bg-white px-2 py-2">
          <p className="text-slate-400">Findings</p>
          <p className="mt-0.5 text-base text-slate-900">{entry.findings.length}</p>
        </div>
        <div className="rounded-lg bg-white px-2 py-2">
          <p className="text-slate-400">Gaps</p>
          <p className="mt-0.5 text-base text-slate-900">{entry.compliance_gaps.length}</p>
        </div>
        <div className="rounded-lg bg-white px-2 py-2">
          <p className="text-slate-400">Evidência</p>
          <p className="mt-0.5 text-base text-slate-900">{entry.assessment?.evidence_count ?? 0}</p>
        </div>
      </div>
    </article>
  );
}

function FindingsSection({ entries }: { entries: ComplianceChainEntry[] }) {
  const findings = entries.flatMap((e) => e.findings.filter((f) => f.status === "open"));
  const gaps = entries.flatMap((e) =>
    e.compliance_gaps.filter((g) => g.status === "MISSING" || g.status === "PARTIAL"),
  );
  if (findings.length === 0 && gaps.length === 0) {
    return null;
  }
  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">D. Findings e gaps em aberto</p>
        <h2 className="text-xl font-bold text-slate-950">
          {findings.length} finding(s) formais · {gaps.length} gap(s) auto-detetados
        </h2>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Findings formais</p>
          {findings.length === 0 ? (
            <p className="mt-2 text-sm font-medium text-slate-500">Nenhum finding formal em aberto.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {findings.map((f) => (
                <li key={f.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-800">{f.title}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SEVERITY_TONE[f.severity] || ""}`}>
                      {f.severity}
                    </span>
                  </div>
                  {f.reference && <p className="mt-1 text-xs font-semibold text-slate-500">{f.reference}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Gaps auto-detetados</p>
          {gaps.length === 0 ? (
            <p className="mt-2 text-sm font-medium text-slate-500">Nenhum gap auto-detetado em aberto.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {gaps.map((g) => (
                <li key={g.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-800">
                      {g.framework_code} · {g.status === "MISSING" ? "Em falta" : "Parcial"}
                    </p>
                    {typeof g.confidence_score === "number" && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        Confiança {Math.round(g.confidence_score * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Evidência: {g.evidence_count} · Avaliado {formatDate(g.last_evaluated)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function AIRecommendationSection({
  recommendation,
  loading,
  error,
  onGenerate,
}: {
  recommendation: AIRecommendation | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-indigo-100 bg-indigo-50/40 p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-indigo-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">C. Recomendação do Virtual CISO</p>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950">
            <Bot className="h-5 w-5 text-indigo-600" /> Análise assistida por IA
          </h2>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "A gerar..." : recommendation ? "Regenerar" : "Gerar recomendação"}
        </button>
      </div>

      {loading && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-indigo-100 bg-white p-5 text-sm font-semibold text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
          A consultar o RAG híbrido e o modelo de linguagem local…
        </div>
      )}

      {!loading && error && (
        <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && !recommendation && (
        <div className="mt-5 rounded-xl border border-dashed border-indigo-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 shrink-0 text-indigo-500" />
            <div>
              <p className="text-sm font-bold text-slate-800">Recomendação ainda não gerada.</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Carrega em "Gerar recomendação" para combinar o score, a cadeia GRC e o conhecimento
                documental (RAG híbrido) numa análise assistida por IA.
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && recommendation && !recommendation.available && (
        <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-800">Serviço de IA indisponível</p>
          <p className="mt-1 text-xs font-medium text-amber-700">
            {recommendation.unavailable_reason || "Não foi possível contactar o modelo de linguagem."}{" "}
            Decide com base nos dados estruturados acima.
          </p>
        </div>
      )}

      {!loading && recommendation && recommendation.available && (
        <div className="mt-5 space-y-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{recommendation.text}</p>
          {recommendation.sources.length > 0 && (
            <div className="rounded-xl border border-indigo-100 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Fontes ({recommendation.sources.length})
              </p>
              <ul className="mt-2 space-y-1.5">
                {recommendation.sources.map((s) => (
                  <li key={s.index} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
                      [{s.index}]
                    </span>
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-800">{s.label}</span>
                      <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">
                        {s.kind === "structured" ? "estruturado" : "RAG"}
                      </span>
                      <span className="block text-slate-500">
                        {s.ref} · {s.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs font-semibold text-slate-500">
            Modelo: {recommendation.model_used} · Gerada em {formatDateTime(recommendation.generated_at)}
          </p>
        </div>
      )}
    </section>
  );
}

function HistorySection({ events }: { events: HistoryEvent[] }) {
  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">E. Histórico desta ocorrência</p>
        <h2 className="text-xl font-bold text-slate-950">Eventos e decisões ({events.length})</h2>
      </div>
      {events.length === 0 ? (
        <p className="mt-5 text-sm font-medium text-slate-500">Sem eventos registados.</p>
      ) : (
        <ol className="mt-5 space-y-3">
          {events.map((e, idx) => (
            <li key={`${e.timestamp}-${idx}`} className="flex gap-3">
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                {e.type === "decision" ? (
                  <FileCheck2 className="h-3.5 w-3.5 text-indigo-700" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-indigo-700" />
                )}
              </div>
              <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-slate-800">{e.title}</p>
                  <span className="shrink-0 text-[10px] font-bold text-slate-400">
                    {formatDateTime(e.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">por {e.actor}</p>
                {e.details && <p className="mt-1 text-sm font-medium text-slate-600">{e.details}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface DecisionFormState {
  decisionCode: DecisionCode | "";
  justification: string;
  transferTo: string;
  dueDate: string;
}

function DecisionBar({
  actions,
  form,
  setForm,
  onSubmit,
  submitting,
  errors,
  successMsg,
}: {
  actions: AvailableAction[];
  form: DecisionFormState;
  setForm: (f: DecisionFormState) => void;
  onSubmit: () => void;
  submitting: boolean;
  errors: Record<string, string>;
  successMsg: string | null;
}) {
  const selectedAction = useMemo(
    () => actions.find((a) => a.code === form.decisionCode) || null,
    [actions, form.decisionCode],
  );
  const showTransferTo = form.decisionCode === "transferred";
  const showDueDate =
    form.decisionCode === "mitigate" || form.decisionCode === "deferred" || form.decisionCode === "transferred";

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">F. Decisão</p>
            <h2 className="text-lg font-bold text-slate-950">Escolhe a decisão a registar</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {actions.map((a) => {
                const active = form.decisionCode === a.code;
                return (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => setForm({ ...form, decisionCode: a.code })}
                    className={`rounded-xl border px-3 py-3 text-left text-xs transition-all ${
                      active
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                    }`}
                  >
                    <p className="font-bold">{a.label}</p>
                    <p className={`mt-1 text-[11px] leading-relaxed ${active ? "text-white/80" : "text-slate-500"}`}>
                      {a.description}
                    </p>
                  </button>
                );
              })}
            </div>
            {errors.decision_code && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-700">
                <XCircle className="h-3.5 w-3.5" /> {errors.decision_code}
              </p>
            )}
          </div>

          <div className="flex w-full max-w-md flex-col gap-3">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Justificação (obrigatória)
            </label>
            <textarea
              value={form.justification}
              onChange={(e) => setForm({ ...form, justification: e.target.value })}
              placeholder="Mínimo 10 caracteres. Inclui o racional que justifica a decisão face à evidência."
              className="min-h-[5rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {errors.justification && (
              <p className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                <XCircle className="h-3.5 w-3.5" /> {errors.justification}
              </p>
            )}
            {showTransferTo && (
              <input
                type="text"
                value={form.transferTo}
                onChange={(e) => setForm({ ...form, transferTo: e.target.value })}
                placeholder="Equipa / responsável de destino"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            )}
            {showDueDate && (
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || !selectedAction || !form.justification}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "A registar..." : "Registar decisão"}
              <CheckCircle2 className="h-4 w-4" />
            </button>
            {successMsg && (
              <p className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> {successMsg}
              </p>
            )}
          </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DecisionScreen() {
  const { occurrenceId } = useParams<{ occurrenceId: string }>();
  const [data, setData] = useState<DecisionContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<DecisionFormState>({
    decisionCode: "",
    justification: "",
    transferTo: "",
    dueDate: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [aiRec, setAiRec] = useState<AIRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!occurrenceId) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = await decisionApi.getContext(occurrenceId);
      setData(ctx);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar o contexto desta ocorrência."));
    } finally {
      setLoading(false);
    }
  }, [occurrenceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!occurrenceId || !data) return;
    if (!form.decisionCode) {
      setErrors({ decision_code: "Seleciona uma decisão." });
      return;
    }
    setSubmitting(true);
    setErrors({});
    setSuccessMsg(null);
    try {
      const res = await decisionApi.register(occurrenceId, {
        decision_code: form.decisionCode,
        justification: form.justification,
        transfer_to: form.transferTo || undefined,
        due_date: form.dueDate || undefined,
      });
      setSuccessMsg(
        `Decisão registada. Estado da ocorrência agora: ${res.occurrence_status}.`,
      );
      setForm({ decisionCode: "", justification: "", transferTo: "", dueDate: "" });
      await load();
    } catch (err: unknown) {
      // Backend returns 400 with body { errors: { field: msg } }.
      // request() throws Error(responseBodyText) so we parse defensively.
      let parsedErrors: Record<string, string> | null = null;
      try {
        const parsed = JSON.parse(getErrorMessage(err, ""));
        if (parsed && typeof parsed === "object" && parsed.errors) {
          parsedErrors = parsed.errors as Record<string, string>;
        }
      } catch {
        // not JSON
      }
      if (parsedErrors) {
        setErrors(parsedErrors);
      } else {
        setErrors({ decision_code: getErrorMessage(err, "Erro inesperado ao registar.") });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const generateRecommendation = async () => {
    if (!occurrenceId) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const rec = await decisionApi.recommend(occurrenceId);
      setAiRec(rec);
    } catch (err: unknown) {
      setAiError(getErrorMessage(err, "Não foi possível gerar a recomendação."));
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-10">
      <HeaderSection data={data} onReload={load} />
      <ScorePanel data={data} />
      <ComplianceChainSection entries={data.compliance_chain} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AIRecommendationSection
          recommendation={aiRec}
          loading={aiLoading}
          error={aiError}
          onGenerate={generateRecommendation}
        />
        <FindingsSection entries={data.compliance_chain} />
      </div>
      <HistorySection events={data.decision_history} />
      <DecisionBar
        actions={data.available_actions}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        submitting={submitting}
        errors={errors}
        successMsg={successMsg}
      />
    </div>
  );
}
