import { useCallback, useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileCheck2,
  GitBranch,
  Loader2,
  PauseCircle,
  PlayCircle,
  Save,
  ShieldAlert,
  UserRound,
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

type ActionDraft = {
  title: string;
  description: string;
  owner: string;
  priority: GovernanceActionPriority;
  due_date: string;
  estimated_effort_hours: string;
  recommendation: string;
  score_impact: string;
  required_roles: string;
  required_materials: string;
  expected_evidence: string;
  dependency_notes: string;
  notes: string;
};

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
  documents: "Documentos",
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

const priorities: GovernanceActionPriority[] = ["critical", "high", "medium", "low"];

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Erro desconhecido");
}

function isClosed(action: GovernanceAction) {
  return action.status === "done" || action.status === "cancelled";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-PT");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-PT");
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

function compactText(value?: string | number | boolean | null, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  return String(value);
}

function targetLink(action: GovernanceAction) {
  if (!action.target_id) return "";
  if (action.target_type === "mechanism") return `/governance/mechanisms/${action.target_id}`;
  if (action.target_type === "policy") return `/governance/policies/${action.target_id}`;
  if (action.target_type === "governance_document") return `/governance/documents/${action.target_id}`;
  if (action.target_type === "evidence_item") return `/governance/evidence/${action.target_id}`;
  if (action.target_type === "risk") return `/risks/${action.target_id}`;
  if (action.target_type === "asset") return `/assets/inventory/${action.target_id}`;
  return "";
}

function mappingReviewLink(action: GovernanceAction) {
  if (!action.target_id) return "";
  if (action.target_type === "mechanism") return `/governance/mapping-review?mechanism=${action.target_id}`;
  if (action.target_type === "policy") return `/governance/mapping-review?policy=${action.target_id}`;
  if (action.target_type === "governance_document") return `/governance/mapping-review?document=${action.target_id}`;
  if (action.target_type === "evidence_item") return `/governance/mapping-review?evidence=${action.target_id}`;
  if (action.target_type === "internal_control") return `/governance/mapping-review?internalControl=${action.target_id}`;
  if (action.target_type === "framework_control") return `/governance/mapping-review?frameworkControl=${action.target_id}`;
  return "";
}

function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: ElementType;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-indigo-700" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-2 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function actionToDraft(action: GovernanceAction): ActionDraft {
  return {
    title: action.title || "",
    description: action.description || "",
    owner: action.owner || "",
    priority: action.priority,
    due_date: action.due_date || "",
    estimated_effort_hours: action.estimated_effort_hours ? String(action.estimated_effort_hours) : "",
    recommendation: action.recommendation || "",
    score_impact: action.score_impact ? String(action.score_impact) : "",
    required_roles: action.required_roles || "",
    required_materials: action.required_materials || "",
    expected_evidence: action.expected_evidence || "",
    dependency_notes: action.dependency_notes || "",
    notes: action.notes || "",
  };
}

function EditTextarea({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none focus:border-indigo-300 focus:bg-white"
      />
    </label>
  );
}

export default function GovernanceTaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [action, setAction] = useState<GovernanceAction | null>(null);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAction = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.getGovernanceAction(id);
      setAction(data);
      setDraft(actionToDraft(data));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAction();
  }, [loadAction]);

  async function saveAction() {
    if (!action || !draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await governanceApi.updateGovernanceAction(action.id, {
        title: draft.title,
        description: draft.description,
        owner: draft.owner,
        priority: draft.priority,
        due_date: draft.due_date || null,
        estimated_effort_hours: draft.estimated_effort_hours || null,
        recommendation: draft.recommendation,
        score_impact: draft.score_impact,
        required_roles: draft.required_roles,
        required_materials: draft.required_materials,
        expected_evidence: draft.expected_evidence,
        dependency_notes: draft.dependency_notes,
        notes: draft.notes,
      });
      setAction(updated);
      setDraft(actionToDraft(updated));
      setNotice("Tarefa atualizada.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function transitionAction(transition: "start" | "complete" | "block" | "defer" | "cancel") {
    if (!action) return;
    const notes =
      transition === "complete"
        ? window.prompt("Nota de conclusao", "") || ""
        : transition === "block"
          ? window.prompt("Motivo do bloqueio", "") || ""
          : transition === "defer"
            ? window.prompt("Motivo do adiamento", "") || ""
            : transition === "cancel"
              ? window.prompt("Motivo do cancelamento", "") || ""
              : "";
    setStatusLoading(transition);
    setError(null);
    setNotice(null);
    try {
      let updated: GovernanceAction;
      if (transition === "start") updated = await governanceApi.startGovernanceAction(action.id);
      else if (transition === "complete") updated = await governanceApi.completeGovernanceAction(action.id, notes);
      else if (transition === "block") updated = await governanceApi.blockGovernanceAction(action.id, notes);
      else if (transition === "defer") updated = await governanceApi.deferGovernanceAction(action.id, notes);
      else updated = await governanceApi.cancelGovernanceAction(action.id, notes);
      setAction(updated);
      setDraft(actionToDraft(updated));
      setNotice("Estado da tarefa atualizado.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setStatusLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center text-slate-500">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-700" />
        <span className="text-sm font-bold uppercase tracking-wide">A carregar detalhe da tarefa...</span>
      </div>
    );
  }

  if (!action || !draft) {
    return (
      <div className="mx-auto max-w-[1100px] rounded-2xl border border-red-100 bg-red-50 p-6 text-sm font-bold text-red-700">
        {error || "Nao foi possivel carregar esta tarefa."}
      </div>
    );
  }

  const href = targetLink(action);
  const mappingHref = mappingReviewLink(action);
  const closed = isClosed(action);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusTone[action.status]}>{statusLabels[action.status]}</Badge>
              <Badge className={priorityTone[action.priority]}>{priorityLabels[action.priority]}</Badge>
              <Badge className={action.is_overdue ? "border-red-200 bg-red-600 text-white" : "border-slate-200 bg-slate-50 text-slate-600"}>
                {dueLabel(action.due_date)}
              </Badge>
              {action.ai_generated && <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">IA</Badge>}
            </div>
            <h1 className="mt-4 max-w-5xl text-3xl font-black tracking-tight text-slate-950">{action.title}</h1>
            <p className="mt-2 max-w-5xl whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600">
              {action.description || action.recommendation || "Sem descricao registada."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {!closed && action.status === "open" && (
              <button
                type="button"
                disabled={statusLoading === "start"}
                onClick={() => transitionAction("start")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
              >
                {statusLoading === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Iniciar
              </button>
            )}
            {!closed && (
              <button
                type="button"
                disabled={statusLoading === "complete"}
                onClick={() => transitionAction("complete")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
              >
                {statusLoading === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Concluir
              </button>
            )}
            {!closed && action.status !== "blocked" && (
              <button
                type="button"
                disabled={statusLoading === "block"}
                onClick={() => transitionAction("block")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-red-700 disabled:opacity-50"
              >
                {statusLoading === "block" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Bloquear
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{notice}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ClipboardList} label="Tipo" value={actionTypeLabels[action.action_type]} detail={`Fonte: ${action.source_type || "-"}`} tone="text-indigo-700" />
        <MetricCard icon={CalendarDays} label="Prazo" value={formatDate(action.due_date)} detail={dueLabel(action.due_date)} tone={action.is_overdue ? "text-red-600" : "text-amber-600"} />
        <MetricCard icon={Clock3} label="Esforco" value={compactText(action.estimated_effort_hours, "-")} detail="Horas estimadas para execucao." tone="text-cyan-600" />
        <MetricCard icon={UserRound} label="Owner" value={action.owner || "-"} detail="Responsavel pela execucao." tone="text-slate-600" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <SectionCard title="Execucao da tarefa" icon={Wrench}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px_180px_170px]">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Titulo da tarefa</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => current && { ...current, title: event.target.value })}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Owner</span>
                <input
                  value={draft.owner}
                  onChange={(event) => setDraft((current) => current && { ...current, owner: event.target.value })}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Prioridade</span>
                <select
                  value={draft.priority}
                  onChange={(event) => setDraft((current) => current && { ...current, priority: event.target.value as GovernanceActionPriority })}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white"
                >
                  {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Prazo</span>
                <input
                  type="date"
                  value={draft.due_date}
                  onChange={(event) => setDraft((current) => current && { ...current, due_date: event.target.value })}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Esforco h</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={draft.estimated_effort_hours}
                  onChange={(event) => setDraft((current) => current && { ...current, estimated_effort_hours: event.target.value })}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <EditTextarea
                label="Descricao operacional"
                value={draft.description}
                rows={8}
                placeholder="Explica o que tem de ser feito nesta tarefa."
                onChange={(value) => setDraft((current) => current && { ...current, description: value })}
              />
              <EditTextarea
                label="Notas de execucao"
                value={draft.notes}
                rows={10}
                placeholder="Regista progresso, decisoes, impedimentos, comandos executados ou observacoes de campo."
                onChange={(value) => setDraft((current) => current && { ...current, notes: value })}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveAction}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar alteracoes
              </button>
              {!closed && (
                <>
                  <button
                    type="button"
                    disabled={statusLoading === "defer"}
                    onClick={() => transitionAction("defer")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-700 disabled:opacity-50"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Adiar
                  </button>
                  <button
                    type="button"
                    disabled={statusLoading === "cancel"}
                    onClick={() => transitionAction("cancel")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Recomendacao e recursos" icon={ShieldAlert}>
            <div className="grid gap-4">
              <EditTextarea
                label="Recomendacao"
                value={draft.recommendation}
                rows={7}
                placeholder="Descreve a recomendacao de implementacao ou melhoria."
                onChange={(value) => setDraft((current) => current && { ...current, recommendation: value })}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <EditTextarea
                  label="RH necessario"
                  value={draft.required_roles}
                  rows={6}
                  placeholder="Perfis, equipas ou funcoes necessarias."
                  onChange={(value) => setDraft((current) => current && { ...current, required_roles: value })}
                />
                <EditTextarea
                  label="Recursos materiais"
                  value={draft.required_materials}
                  rows={6}
                  placeholder="Ferramentas, acessos, sistemas, documentos ou recursos tecnicos."
                  onChange={(value) => setDraft((current) => current && { ...current, required_materials: value })}
                />
                <EditTextarea
                  label="Evidencia esperada"
                  value={draft.expected_evidence}
                  rows={6}
                  placeholder="Que prova deve ser recolhida para demonstrar execucao."
                  onChange={(value) => setDraft((current) => current && { ...current, expected_evidence: value })}
                />
                <EditTextarea
                  label="Dependencias"
                  value={draft.dependency_notes}
                  rows={6}
                  placeholder="Dependencias tecnicas, organizacionais ou de terceiros."
                  onChange={(value) => setDraft((current) => current && { ...current, dependency_notes: value })}
                />
              </div>
              <EditTextarea
                label="Impacto no score"
                value={draft.score_impact}
                rows={4}
                placeholder="Explica como esta tarefa influencia maturidade, conformidade ou scoring."
                onChange={(value) => setDraft((current) => current && { ...current, score_impact: value })}
              />
            </div>
          </SectionCard>

          {(action.ai_rationale || action.ai_generated) && (
            <SectionCard title="Racional IA" icon={FileCheck2}>
              <p className="whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-700">
                {compactText(action.ai_rationale, "Tarefa marcada como gerada por IA, sem racional detalhado.")}
              </p>
            </SectionCard>
          )}
        </div>

        <aside className="space-y-6">
          <SectionCard
            title="Alvo da tarefa"
            icon={GitBranch}
            action={href && (
              <Link
                to={href}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
              >
                Abrir alvo
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
          >
            <div className="space-y-3">
              <DetailBlock label="Tipo de alvo">{targetTypeLabels[action.target_type] || action.target_type || "-"}</DetailBlock>
              <DetailBlock label="Alvo">{action.target_label || action.target_id || "-"}</DetailBlock>
              <DetailBlock label="ID tecnico">{action.target_id || "-"}</DetailBlock>
              {mappingHref && (
                <Link
                  to={mappingHref}
                  className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  Abrir Mapping Review filtrado
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Auditoria" icon={ClipboardList}>
            <div className="space-y-3">
              <DetailBlock label="Criada em">{formatDateTime(action.created_at)}</DetailBlock>
              <DetailBlock label="Atualizada em">{formatDateTime(action.updated_at)}</DetailBlock>
              <DetailBlock label="Concluida em">{formatDateTime(action.completed_at)}</DetailBlock>
              <DetailBlock label="Concluida por">{compactText(action.completed_by)}</DetailBlock>
              <DetailBlock label="Exige evidencia">{compactText(action.evidence_required)}</DetailBlock>
            </div>
          </SectionCard>

          <SectionCard title="Ligacoes formais" icon={AlertTriangle}>
            <div className="space-y-3">
              <DetailBlock label="Decisao ligada">{compactText(action.linked_decision)}</DetailBlock>
              <DetailBlock label="Excecao ligada">{compactText(action.linked_exception)}</DetailBlock>
              <DetailBlock label="Chave de origem">{compactText(action.source_key)}</DetailBlock>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
