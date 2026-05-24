import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  governanceApi,
  type GovernanceAction,
  type GovernanceActionPriority,
  type GovernanceActionStatus,
  type GovernanceActionType,
} from "@/lib/governanceApi";
import {
  GovernanceBadge as Badge,
  GovernanceInfoCard as MetricCard,
} from "@/components/governance/GovernancePrimitives";

type FilterValue<T extends string> = T | "";

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

const targetTypeLabels: Record<string, string> = {
  policy: "Politica",
  internal_control: "Controlo interno",
  framework_control: "Controlo externo",
  mechanism: "Mecanismo",
  internal_control_mechanism: "Associacao controlo/mecanismo",
  governance_document: "Documento",
  evidence_item: "Evidencia",
  risk: "Risco",
  asset: "Ativo",
  vulnerability: "Vulnerabilidade",
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

const actionTypes: GovernanceActionType[] = [
  "implement_mechanism",
  "collect_evidence",
  "correct_policy",
  "map_control",
  "review_document",
  "approve_mapping",
  "update_framework",
  "review_exception",
  "review_score",
  "other",
];

const statuses: GovernanceActionStatus[] = ["open", "in_progress", "blocked", "deferred", "done", "cancelled"];
const priorities: GovernanceActionPriority[] = ["critical", "high", "medium", "low"];

function normalize<T>(payload: { results?: T[] } | T[] | null | undefined): T[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.results || [];
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-PT");
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueLabel(value?: string | null) {
  const days = daysUntil(value);
  if (days === null) return "Sem prazo";
  if (days < 0) return `${Math.abs(days)} dia(s) em atraso`;
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanha";
  return `Daqui a ${days} dias`;
}

function isClosed(action: GovernanceAction) {
  return action.status === "done" || action.status === "cancelled";
}

function targetLink(action: GovernanceAction) {
  if (!action.target_id) return "/governance/tasks";
  if (action.target_type === "mechanism") return `/governance/mechanisms/${action.target_id}`;
  if (action.target_type === "policy") return `/governance/policies/${action.target_id}`;
  if (action.target_type === "governance_document") return `/governance/documents/${action.target_id}`;
  if (action.target_type === "evidence_item") return `/governance/evidence/${action.target_id}`;
  if (action.target_type === "risk") return `/risks/${action.target_id}`;
  if (action.target_type === "asset") return `/assets/inventory/${action.target_id}`;
  return "/governance/action-plan";
}

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Erro desconhecido");
}

export default function GovernanceTasksList() {
  const [searchParams] = useSearchParams();
  const [actions, setActions] = useState<GovernanceAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: (searchParams.get("status") || "") as FilterValue<GovernanceActionStatus>,
    priority: "" as FilterValue<GovernanceActionPriority>,
    action_type: "" as FilterValue<GovernanceActionType>,
    target_type: searchParams.get("target_type") || "",
  });

  const loadActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page_size: 1000,
        ordering: "due_date",
      };
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.action_type) params.action_type = filters.action_type;
      if (filters.target_type) params.target_type = filters.target_type;

      const data = await governanceApi.listGovernanceActions(params);
      setActions(normalize<GovernanceAction>(data));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters.action_type, filters.priority, filters.search, filters.status, filters.target_type]);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  const metrics = useMemo(() => {
    const active = actions.filter((action) => !isClosed(action));
    const overdue = active.filter((action) => action.is_overdue).length;
    const dueSoon = active.filter((action) => {
      const days = daysUntil(action.due_date);
      return typeof days === "number" && days >= 0 && days <= 7;
    }).length;
    const blocked = active.filter((action) => action.status === "blocked").length;
    const mechanismActions = active.filter((action) => action.target_type === "mechanism").length;
    return { active: active.length, overdue, dueSoon, blocked, mechanismActions };
  }, [actions]);

  const orderedActions = useMemo(() => {
    const priorityWeight: Record<GovernanceActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const statusWeight: Record<GovernanceActionStatus, number> = {
      blocked: 0,
      open: 1,
      in_progress: 2,
      deferred: 3,
      done: 4,
      cancelled: 5,
    };
    return actions.slice().sort((a, b) => {
      const aDue = a.due_date ? new Date(`${a.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.due_date ? new Date(`${b.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      if (aDue !== bDue) return aDue - bDue;
      if (statusWeight[a.status] !== statusWeight[b.status]) return statusWeight[a.status] - statusWeight[b.status];
      return priorityWeight[a.priority] - priorityWeight[b.priority];
    });
  }, [actions]);

  async function transitionAction(action: GovernanceAction, transition: "start" | "complete" | "block" | "defer" | "cancel") {
    const notes =
      transition === "complete"
        ? window.prompt("Nota de conclusao", "") || ""
        : transition === "block"
          ? window.prompt("Motivo do bloqueio", "") || ""
          : "";
    setSaving(action.id);
    setError(null);
    try {
      if (transition === "start") await governanceApi.startGovernanceAction(action.id);
      if (transition === "complete") await governanceApi.completeGovernanceAction(action.id, notes);
      if (transition === "block") await governanceApi.blockGovernanceAction(action.id, notes);
      if (transition === "defer") await governanceApi.deferGovernanceAction(action.id, "Adiada a partir do catalogo de tarefas.");
      if (transition === "cancel") await governanceApi.cancelGovernanceAction(action.id, "Cancelada a partir do catalogo de tarefas.");
      await loadActions();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function generateMechanismTasks() {
    const owner = window.prompt("Owner por defeito para novas tarefas", "CISO") || "CISO";
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await governanceApi.generateMechanismTasks(owner);
      setNotice(`${result.created} tarefa(s) criadas, ${result.updated} atualizada(s) e ${result.skipped} mecanismo(s)/tarefa(s) ignorados por ja terem plano ativo.`);
      await loadActions();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Catalogo operacional</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Tarefas de governação</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              Acompanha tarefas ligadas a mecanismos, evidencias, politicas, documentos e outras entidades. Tudo vem da BD e fica rastreavel por alvo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadActions}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={generateMechanismTasks}
              disabled={generating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Gerar tarefas de mecanismos
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          {notice}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={ClipboardList} label="Ativas" value={metrics.active} detail="Tarefas abertas, em curso, bloqueadas ou adiadas." tone="text-indigo-700" />
        <MetricCard icon={AlertTriangle} label="Em atraso" value={metrics.overdue} detail="Prazos vencidos ainda sem conclusao." tone={metrics.overdue > 0 ? "text-red-600" : "text-slate-400"} />
        <MetricCard icon={ShieldAlert} label="Prazo curto" value={metrics.dueSoon} detail="Tarefas com prazo nos proximos 7 dias." tone={metrics.dueSoon > 0 ? "text-amber-600" : "text-slate-400"} />
        <MetricCard icon={XCircle} label="Bloqueadas" value={metrics.blocked} detail="Execucao impedida por dependencia ou decisao." tone={metrics.blocked > 0 ? "text-red-600" : "text-slate-400"} />
        <MetricCard icon={Wrench} label="Mecanismos" value={metrics.mechanismActions} detail="Tarefas mapeadas diretamente a mecanismos." tone="text-indigo-700" />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Pesquisar por titulo, owner, alvo ou recomendacao..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none focus:border-indigo-300 focus:bg-white"
            />
          </label>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as FilterValue<GovernanceActionStatus> }))}
            className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-300 focus:bg-white"
          >
            <option value="">Todos os estados</option>
            {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
          <select
            value={filters.priority}
            onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value as FilterValue<GovernanceActionPriority> }))}
            className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-300 focus:bg-white"
          >
            <option value="">Todas as prioridades</option>
            {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
          </select>
          <select
            value={filters.action_type}
            onChange={(event) => setFilters((current) => ({ ...current, action_type: event.target.value as FilterValue<GovernanceActionType> }))}
            className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-300 focus:bg-white"
          >
            <option value="">Todos os tipos</option>
            {actionTypes.map((type) => <option key={type} value={type}>{actionTypeLabels[type]}</option>)}
          </select>
          <select
            value={filters.target_type}
            onChange={(event) => setFilters((current) => ({ ...current, target_type: event.target.value }))}
            className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-300 focus:bg-white"
          >
            <option value="">Todos os alvos</option>
            {Object.entries(targetTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Lista de tarefas</h2>
            <p className="text-xs font-semibold text-slate-500">{orderedActions.length} tarefa(s) encontradas</p>
          </div>
          <Link to="/governance/action-plan" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
            Plano de acoes <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-slate-400">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-600" />
            <span className="text-sm font-bold uppercase tracking-wide">A carregar tarefas...</span>
          </div>
        ) : orderedActions.length === 0 ? (
          <div className="min-h-[240px] p-8 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-900">Nao existem tarefas com estes filtros.</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Ajusta filtros ou gera tarefas operacionais para mecanismos.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orderedActions.map((action) => {
              const isLate = action.is_overdue;
              return (
                <article key={action.id} className={`grid gap-4 p-5 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_auto] xl:items-center ${isLate ? "bg-red-50/40" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={priorityTone[action.priority]}>{priorityLabels[action.priority]}</Badge>
                      <Badge className={statusTone[action.status]}>{statusLabels[action.status]}</Badge>
                      <Badge className={isLate ? "border-red-200 bg-red-600 text-white" : "border-slate-200 bg-slate-50 text-slate-600"}>
                        {dueLabel(action.due_date)}
                      </Badge>
                    </div>
                    <Link
                      to={`/governance/tasks/${action.id}`}
                      className="mt-3 block text-base font-black text-slate-950 hover:text-indigo-700"
                    >
                      {action.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold leading-relaxed text-slate-500">
                      {action.description || action.recommendation || "Sem descricao registada."}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Alvo</p>
                    <Link to={targetLink(action)} className="mt-1 block text-sm font-black text-indigo-700 hover:text-indigo-900">
                      {action.target_label || action.target_id || "-"}
                    </Link>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {targetTypeLabels[action.target_type] || action.target_type || "Sem alvo"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Tipo</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{actionTypeLabels[action.action_type]}</p>
                    {action.source_type && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{action.source_type}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Owner / prazo</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{action.owner || "-"}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(action.due_date)}</p>
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                    <Link
                      to={`/governance/tasks/${action.id}`}
                      className="inline-flex items-center gap-1 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100"
                    >
                      Abrir tarefa
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    {action.status === "open" && (
                      <button
                        type="button"
                        disabled={saving === action.id}
                        onClick={() => transitionAction(action, "start")}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Iniciar
                      </button>
                    )}
                    {!isClosed(action) && (
                      <button
                        type="button"
                        disabled={saving === action.id}
                        onClick={() => transitionAction(action, "complete")}
                        className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Concluir
                      </button>
                    )}
                    {!isClosed(action) && action.status !== "blocked" && (
                      <button
                        type="button"
                        disabled={saving === action.id}
                        onClick={() => transitionAction(action, "block")}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-700 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Bloquear
                      </button>
                    )}
                    {!isClosed(action) && (
                      <button
                        type="button"
                        disabled={saving === action.id}
                        onClick={() => transitionAction(action, "defer")}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-700 disabled:opacity-50"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                        Adiar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
