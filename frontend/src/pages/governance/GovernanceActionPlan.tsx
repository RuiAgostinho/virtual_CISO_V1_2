import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Save,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import {
  governanceApi,
  type GovernanceAction,
  type GovernanceActionPriority,
  type GovernanceActionStatus,
  type GovernanceActionType,
} from "@/lib/governanceApi";

type ActionDraft = {
  owner: string;
  priority: GovernanceActionPriority;
  due_date: string;
};

type FilterValue<T extends string> = T | "all";

const actionTypeLabels: Record<GovernanceActionType, string> = {
  correct_policy: "Corrigir politica",
  map_control: "Mapear controlo",
  implement_mechanism: "Implementar mecanismo",
  collect_evidence: "Recolher evidencia",
  review_document: "Rever documento",
  approve_mapping: "Aprovar mapping",
  update_framework: "Atualizar framework",
  review_exception: "Rever excecao",
  review_score: "Rever score",
  other: "Outra acao",
};

const priorityLabels: Record<GovernanceActionPriority, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  critical: "Critica",
};

const statusLabels: Record<GovernanceActionStatus, string> = {
  open: "Aberta",
  in_progress: "Em curso",
  blocked: "Bloqueada",
  done: "Concluida",
  deferred: "Adiada",
  cancelled: "Cancelada",
};

const priorityTone: Record<GovernanceActionPriority, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

const statusTone: Record<GovernanceActionStatus, string> = {
  open: "border-indigo-200 bg-indigo-50 text-indigo-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  blocked: "border-red-200 bg-red-50 text-red-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  deferred: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

const workbenchLinks: Record<string, string> = {
  pending_mappings: "/governance/mapping-review?status=pending_review",
  draft_mappings: "/governance/mapping-review?status=draft",
  missing_rationale: "/governance/mapping-review",
  policies_without_owner: "/governance/policies",
  policies_without_controls: "/governance/policies",
  documents_without_controls: "/governance/documents",
  overdue_documents: "/governance/documents",
  controls_without_mechanisms: "/governance/mapping-review?type=internal_control_mechanism",
  controls_without_framework: "/governance/mapping-review?type=internal_control_framework_mapping",
  mechanisms_without_evidence: "/governance/evidence",
  expired_evidence: "/governance/evidence",
  pending_exceptions: "/governance/exceptions",
  expired_exceptions: "/governance/exceptions",
  expiring_exceptions: "/governance/exceptions",
  low_confidence_mappings: "/governance/mapping-review",
  low_coverage_frameworks: "/governance/framework-mapping/wizard",
};

function normalize<T>(payload: { results?: T[] } | T[]): T[] {
  return Array.isArray(payload) ? payload : payload.results || [];
}

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Erro desconhecido");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function isClosed(action: GovernanceAction) {
  return action.status === "done" || action.status === "cancelled";
}

function Badge({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase ${className}`}>
      {children}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className={`mb-5 h-5 w-5 ${tone}`} />
      <div className="text-3xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-black uppercase text-slate-400">{label}</div>
    </div>
  );
}

export default function GovernanceActionPlan() {
  const [actions, setActions] = useState<GovernanceAction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ActionDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterValue<GovernanceActionStatus>>("all");
  const [priorityFilter, setPriorityFilter] = useState<FilterValue<GovernanceActionPriority>>("all");
  const [typeFilter, setTypeFilter] = useState<FilterValue<GovernanceActionType>>("all");

  const loadActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.listGovernanceActions({ page_size: 300, ordering: "due_date" });
      const rows = normalize(data);
      setActions(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((action) => [
            action.id,
            {
              owner: action.owner || "",
              priority: action.priority,
              due_date: action.due_date || "",
            },
          ])
        )
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  const filteredActions = useMemo(() => {
    return actions.filter((action) => {
      const statusOk = statusFilter === "all" || action.status === statusFilter;
      const priorityOk = priorityFilter === "all" || action.priority === priorityFilter;
      const typeOk = typeFilter === "all" || action.action_type === typeFilter;
      return statusOk && priorityOk && typeOk;
    });
  }, [actions, priorityFilter, statusFilter, typeFilter]);

  const metrics = useMemo(() => {
    const active = actions.filter((action) => !isClosed(action));
    const highRisk = active.filter((action) => action.priority === "critical" || action.priority === "high").length;
    const overdue = active.filter((action) => action.is_overdue).length;
    const blocked = active.filter((action) => action.status === "blocked").length;
    const done = actions.filter((action) => action.status === "done").length;
    return { active: active.length, highRisk, overdue, blocked, done };
  }, [actions]);

  async function generateFromWorkbench() {
    const owner = window.prompt("Owner por defeito para novas acoes", "CISO") || "CISO";
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await governanceApi.generateGovernanceActionsFromWorkbench(owner);
      setNotice(`Plano atualizado: ${result.created} acoes criadas, ${result.updated} atualizadas, ${result.skipped} ignoradas.`);
      await loadActions();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function saveAction(action: GovernanceAction) {
    const draft = drafts[action.id];
    if (!draft) return;
    setSaving(action.id);
    setError(null);
    try {
      await governanceApi.updateGovernanceAction(action.id, {
        owner: draft.owner,
        priority: draft.priority,
        due_date: draft.due_date || null,
      });
      await loadActions();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function transitionAction(action: GovernanceAction, transition: "start" | "complete" | "block" | "defer" | "cancel") {
    const note = transition === "complete" ? window.prompt("Nota de conclusao", "") || "" : "";
    setSaving(action.id);
    setError(null);
    try {
      if (transition === "start") {
        await governanceApi.startGovernanceAction(action.id);
      } else if (transition === "complete") {
        await governanceApi.completeGovernanceAction(action.id, note);
      } else if (transition === "block") {
        const blockNote = window.prompt("Motivo do bloqueio", "") || "";
        await governanceApi.blockGovernanceAction(action.id, blockNote);
      } else if (transition === "defer") {
        const deferNote = window.prompt("Motivo do adiamento", "") || "";
        await governanceApi.deferGovernanceAction(action.id, deferNote);
      } else {
        const cancelNote = window.prompt("Motivo do cancelamento", "") || "";
        await governanceApi.cancelGovernanceAction(action.id, cancelNote);
      }
      await loadActions();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  function updateDraft(id: string, patch: Partial<ActionDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-indigo-700">Governação operacional</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Plano de ações de governação</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Transforma gaps, recomendações, exceções, scores e mappings pendentes em trabalho formal com owner,
              prioridade, prazo e estado.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadActions()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase text-slate-700"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void generateFromWorkbench()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black uppercase text-white hover:bg-indigo-700 disabled:opacity-60"
              disabled={generating}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Gerar da Workbench
            </button>
            <Link
              to="/governance/workbench"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black uppercase text-white"
            >
              Ver Workbench
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          {notice}
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={ClipboardList} label="Abertas" value={metrics.active} tone="text-indigo-600" />
        <MetricCard icon={ShieldAlert} label="Altas/criticas" value={metrics.highRisk} tone="text-red-600" />
        <MetricCard icon={AlertTriangle} label="Vencidas" value={metrics.overdue} tone="text-orange-600" />
        <MetricCard icon={PauseCircle} label="Bloqueadas" value={metrics.blocked} tone="text-amber-600" />
        <MetricCard icon={CheckCircle2} label="Concluidas" value={metrics.done} tone="text-emerald-600" />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as FilterValue<GovernanceActionStatus>)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900"
          >
            <option value="all">Todos os estados</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as FilterValue<GovernanceActionPriority>)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900"
          >
            <option value="all">Todas as prioridades</option>
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as FilterValue<GovernanceActionType>)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900"
          >
            <option value="all">Todos os tipos de ação</option>
            {Object.entries(actionTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-xl font-black text-slate-950">Ações</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Apenas são geradas a partir de informação real da BD. Usa a Workbench para atualizar a origem.
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            A carregar plano de ações...
          </div>
        ) : filteredActions.length ? (
          <div className="divide-y divide-slate-100">
            {filteredActions.map((action) => {
              const draft = drafts[action.id] || { owner: action.owner || "", priority: action.priority, due_date: action.due_date || "" };
              const contextHref = action.source_type === "workbench" ? workbenchLinks[action.source_key] : "";
              return (
                <article key={action.id} className="p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Badge className={priorityTone[action.priority]}>{priorityLabels[action.priority]}</Badge>
                        <Badge className={statusTone[action.status]}>{statusLabels[action.status]}</Badge>
                        {action.is_overdue ? <Badge className="border-red-200 bg-red-50 text-red-700">Vencida</Badge> : null}
                      </div>
                      <h3 className="text-lg font-black text-slate-950">{action.title}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{action.description}</p>
                      {action.recommendation ? (
                        <p className="mt-2 text-sm font-bold leading-6 text-indigo-700">{action.recommendation}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-black uppercase text-slate-400">
                        <span>{actionTypeLabels[action.action_type]}</span>
                        <span>Fonte: {action.source_type}</span>
                        {action.target_label || action.target_id ? <span>Alvo: {action.target_label || action.target_id}</span> : null}
                      </div>
                    </div>

                    <div className="grid w-full gap-3 xl:w-[520px] xl:grid-cols-[1fr_150px_160px_auto]">
                      <input
                        value={draft.owner}
                        onChange={(event) => updateDraft(action.id, { owner: event.target.value })}
                        placeholder="Owner"
                        className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900"
                      />
                      <select
                        value={draft.priority}
                        onChange={(event) => updateDraft(action.id, { priority: event.target.value as GovernanceActionPriority })}
                        className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900"
                      >
                        {Object.entries(priorityLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={draft.due_date}
                        onChange={(event) => updateDraft(action.id, { due_date: event.target.value })}
                        className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => void saveAction(action)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                        disabled={saving === action.id}
                      >
                        {saving === action.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Guardar
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {!isClosed(action) && action.status !== "in_progress" ? (
                      <button
                        type="button"
                        onClick={() => void transitionAction(action, "start")}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black uppercase text-white"
                      >
                        <PlayCircle className="h-4 w-4" />
                        Iniciar
                      </button>
                    ) : null}
                    {!isClosed(action) ? (
                      <button
                        type="button"
                        onClick={() => void transitionAction(action, "complete")}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black uppercase text-white"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Concluir
                      </button>
                    ) : null}
                    {!isClosed(action) ? (
                      <button
                        type="button"
                        onClick={() => void transitionAction(action, "block")}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black uppercase text-red-700"
                      >
                        <ShieldAlert className="h-4 w-4" />
                        Bloquear
                      </button>
                    ) : null}
                    {!isClosed(action) ? (
                      <button
                        type="button"
                        onClick={() => void transitionAction(action, "defer")}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black uppercase text-amber-700"
                      >
                        <PauseCircle className="h-4 w-4" />
                        Adiar
                      </button>
                    ) : null}
                    {!isClosed(action) ? (
                      <button
                        type="button"
                        onClick={() => void transitionAction(action, "cancel")}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase text-slate-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar
                      </button>
                    ) : null}
                    {contextHref ? (
                      <Link
                        to={contextHref}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                      >
                        Abrir contexto
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <span className="ml-auto self-center text-xs font-black uppercase text-slate-400">
                      Prazo: {formatDate(action.due_date)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center text-center text-sm font-semibold text-slate-500">
            Sem ações para os filtros atuais. Gera o plano a partir da Workbench para transformar gaps reais em trabalho formal.
          </div>
        )}
      </section>
    </div>
  );
}
