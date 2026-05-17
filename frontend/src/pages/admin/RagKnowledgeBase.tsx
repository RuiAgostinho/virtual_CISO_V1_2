import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  RefreshCw,
  Layers,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  History,
  ShieldAlert,
  X,
  Trash2,
  FileWarning,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { ragApi, type RagOverview, type RagRunMode } from "@/lib/ragApi";

const TYPE_LABELS_PT: Record<string, string> = {
  policy: "Políticas",
  asset: "Ativos",
  vulnerability: "Vulnerabilidades",
  control: "Controlos",
  mechanism: "Mecanismos",
  technical_regulation: "Normas técnicas",
  procedure: "Procedimentos",
  evidence: "Evidências",
  compliance_gap: "Compliance gaps",
  general: "Conhecimento geral",
};

function typeLabel(sourceType: string, fallback: string) {
  return TYPE_LABELS_PT[sourceType] || fallback || sourceType;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

function fmtDuration(secs: number | null) {
  if (secs == null) return "—";
  if (secs < 60) return `${secs.toFixed(0)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

function modeLabel(mode: string) {
  return mode === "full" ? "Completa" : "Incremental";
}

function statusLabel(status: string) {
  if (status === "running") return "Em execução";
  if (status === "success") return "Concluída";
  if (status === "failed") return "Falhada";
  return status;
}

function statusTone(status: string) {
  if (status === "running") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export default function RagKnowledgeBase() {
  const { user } = useAuth();
  const isAdmin = !!(user?.is_superuser || user?.is_staff);

  const [overview, setOverview] = useState<RagOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [confirmFullOpen, setConfirmFullOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await ragApi.getOverview();
      setOverview(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar o estado da base de conhecimento RAG.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    load(true);
  }, [isAdmin, load]);

  const currentRun = overview?.current_run ?? null;
  const isRunning = !!currentRun;

  // While a run is active, poll so the UI shows live progress without blocking.
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => load(false), 3000);
    return () => clearInterval(timer);
  }, [isRunning, load]);

  const triggerReindex = async (mode: RagRunMode) => {
    setTriggering(true);
    setActionMessage(null);
    try {
      await ragApi.reindex(mode);
      setActionMessage({
        type: "success",
        text:
          mode === "full"
            ? "Reindexação completa iniciada — o progresso é atualizado automaticamente."
            : "Reindexação incremental iniciada — o progresso é atualizado automaticamente.",
      });
      await load(false);
    } catch (err: any) {
      setActionMessage({
        type: "error",
        text: err?.message || "Não foi possível iniciar a reindexação.",
      });
    } finally {
      setTriggering(false);
      setConfirmFullOpen(false);
    }
  };

  const stats = overview?.stats;
  const lastRun = overview?.last_run ?? null;
  const recentRuns = overview?.recent_runs ?? [];
  const actionsDisabled = isRunning || triggering;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Administração</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">RAG / Base de Conhecimento</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Gestão da reindexação em massa da base de conhecimento RAG do Virtual CISO. A indexação incremental
              automática (via signals) continua ativa — esta página permite forçar uma reconstrução completa sem
              recorrer à linha de comandos.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      {!isAdmin ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-4 text-base font-bold text-amber-800">Acesso restrito</p>
          <p className="mt-1 text-sm font-semibold text-amber-700">
            Esta área está reservada a administradores. Contacte o gestor da plataforma se precisar de acesso.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {actionMessage && (
            <div
              className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-bold shadow-sm ${
                actionMessage.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {actionMessage.type === "success" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0" />
              )}
              {actionMessage.text}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400 shadow-sm">
              A carregar...
            </div>
          ) : (
            <>
              {currentRun && (
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-700" />
                      <div>
                        <p className="text-sm font-bold text-indigo-900">
                          Reindexação {modeLabel(currentRun.mode).toLowerCase()} em execução
                        </p>
                        <p className="text-xs font-semibold text-indigo-600">
                          Iniciada {fmtDateTime(currentRun.started_at)}
                          {currentRun.triggered_by ? ` · por ${currentRun.triggered_by}` : ""}
                          {` · ${Object.keys(currentRun.counts_by_type || {}).length}/9 tipos processados`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <RunStat label="Processados" value={currentRun.total_processed} tone="text-indigo-700" />
                      <RunStat label="Criados" value={currentRun.chunks_created} tone="text-emerald-600" />
                      <RunStat label="Atualizados" value={currentRun.chunks_updated} tone="text-blue-600" />
                      <RunStat label="Erros" value={currentRun.chunks_failed} tone="text-red-600" />
                    </div>
                  </div>
                </section>
              )}

              <section className="grid gap-4 md:grid-cols-4">
                <StatCard icon={<Layers className="h-5 w-5 text-indigo-700" />} value={stats?.total_chunks ?? 0} label="Total de chunks" />
                <StatCard icon={<Zap className="h-5 w-5 text-emerald-600" />} value={stats?.embedded_chunks ?? 0} label="Com embedding" />
                <StatCard
                  icon={<FileWarning className="h-5 w-5 text-amber-600" />}
                  value={stats?.missing_embedding ?? 0}
                  label="Sem embedding"
                  warn={(stats?.missing_embedding ?? 0) > 0}
                />
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <History className="h-5 w-5 text-slate-500" />
                  <p className="mt-3 text-sm font-bold text-slate-950">{fmtDateTime(lastRun?.finished_at ?? null)}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Última ingestão</p>
                  {lastRun && (
                    <span
                      className={`mt-2 inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(
                        lastRun.status,
                      )}`}
                    >
                      {statusLabel(lastRun.status)}
                    </span>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Chunks por tipo de entidade</h2>
                {stats && stats.by_type.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {stats.by_type.map((row) => (
                      <div key={row.source_type} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                        <p className="text-2xl font-bold text-slate-950">{row.count}</p>
                        <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {typeLabel(row.source_type, row.label)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-semibold text-slate-400">Nenhum chunk indexado.</p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Ações de reindexação</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-5">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-indigo-700" />
                      <p className="text-sm font-bold text-slate-950">Reindexação incremental</p>
                    </div>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                      Reprocessa todas as entidades sem apagar a base. Cria chunks em falta e atualiza os existentes.
                      Não remove chunks órfãos.
                    </p>
                    <button
                      onClick={() => triggerReindex("incremental")}
                      disabled={actionsDisabled}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Reindexação incremental
                    </button>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
                    <div className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4 text-amber-700" />
                      <p className="text-sm font-bold text-slate-950">Reindexação completa</p>
                    </div>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                      Apaga <strong>todos</strong> os chunks e reconstrói a base do zero. Remove chunks órfãos mas é
                      mais demorada. Requer confirmação.
                    </p>
                    <button
                      onClick={() => setConfirmFullOpen(true)}
                      disabled={actionsDisabled}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Reindexação completa
                    </button>
                  </div>
                </div>
                {isRunning && (
                  <p className="mt-3 text-xs font-semibold text-indigo-600">
                    Já existe uma reindexação em curso — aguarde a conclusão para iniciar outra.
                  </p>
                )}
              </section>

              {lastRun && (
                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Última execução</h2>
                    <span
                      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(
                        lastRun.status,
                      )}`}
                    >
                      {modeLabel(lastRun.mode)} · {statusLabel(lastRun.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <RunStat label="Criados" value={lastRun.chunks_created} tone="text-emerald-600" />
                    <RunStat label="Atualizados" value={lastRun.chunks_updated} tone="text-blue-600" />
                    <RunStat label="Removidos" value={lastRun.chunks_removed} tone="text-slate-600" />
                    <RunStat label="Erros" value={lastRun.chunks_failed} tone="text-red-600" />
                    <RunStat label="Processados" value={lastRun.total_processed} tone="text-slate-900" />
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{fmtDuration(lastRun.duration_seconds)}</p>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Duração</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs font-semibold text-slate-500">
                    Iniciada {fmtDateTime(lastRun.started_at)} · Concluída {fmtDateTime(lastRun.finished_at)}
                    {lastRun.triggered_by ? ` · por ${lastRun.triggered_by}` : ""}
                  </p>
                  {lastRun.error_message && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                      {lastRun.error_message}
                    </div>
                  )}
                  {lastRun.error_detail && (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-medium text-slate-600">
                      {lastRun.error_detail}
                    </pre>
                  )}
                </section>
              )}

              <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-6">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Histórico de execuções</h2>
                </div>
                {recentRuns.length === 0 ? (
                  <p className="p-8 text-center text-sm font-semibold text-slate-400">Sem execuções registadas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50">
                        <tr>
                          {["Início", "Modo", "Estado", "Duração", "Criados", "Atualizados", "Removidos", "Erros", "Utilizador"].map(
                            (h) => (
                              <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recentRuns.map((run) => (
                          <tr key={run.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-semibold text-slate-700">{fmtDateTime(run.started_at)}</td>
                            <td className="px-4 py-3 font-medium text-slate-600">{modeLabel(run.mode)}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(
                                  run.status,
                                )}`}
                              >
                                {statusLabel(run.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-600">{fmtDuration(run.duration_seconds)}</td>
                            <td className="px-4 py-3 font-medium text-emerald-600">{run.chunks_created}</td>
                            <td className="px-4 py-3 font-medium text-blue-600">{run.chunks_updated}</td>
                            <td className="px-4 py-3 font-medium text-slate-600">{run.chunks_removed}</td>
                            <td className={`px-4 py-3 font-medium ${run.chunks_failed > 0 ? "text-red-600" : "text-slate-400"}`}>
                              {run.chunks_failed}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-600">{run.triggered_by || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {confirmFullOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => !triggering && setConfirmFullOpen(false)}
          />
          <section className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Confirmação necessária</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">Reindexação completa</h2>
              </div>
              <button
                type="button"
                onClick={() => !triggering && setConfirmFullOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="space-y-3 px-6 py-5">
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">
                  Esta ação apaga <strong>todos</strong> os chunks RAG e reconstrói a base do zero. Durante a
                  reconstrução, a pesquisa semântica pode devolver resultados incompletos. O processo pode demorar
                  vários minutos.
                </p>
              </div>
              <p className="text-sm font-medium text-slate-600">Tem a certeza de que pretende continuar?</p>
            </div>
            <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirmFullOpen(false)}
                disabled={triggering}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => triggerReindex("full")}
                disabled={triggering}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirmar reindexação completa
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  warn,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${warn ? "border-amber-200" : "border-slate-100"}`}>
      {icon}
      <p className={`mt-3 text-3xl font-bold ${warn ? "text-amber-700" : "text-slate-950"}`}>{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function RunStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
