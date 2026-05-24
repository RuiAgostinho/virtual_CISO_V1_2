/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileCheck2,
  GitBranch,
  Layers3,
  Loader2,
  Network,
  Pencil,
  Plus,
  PlayCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { governanceApi, type GovernanceAction, type GovernanceException, type MechanismImplementationReadiness } from "@/lib/governanceApi";
import { mappingReviewApi, type MappingRecord, type TraceabilityPayload } from "@/lib/mappingReviewApi";
import {
  GovernanceBadge as Badge,
  GovernanceEmptyState as EmptyState,
  GovernanceInfoCard as InfoCard,
  GovernanceSectionCard as SectionCard,
} from "@/components/governance/GovernancePrimitives";

type MechanismRecord = Record<string, any>;
type MechanismWorkspaceTab = "overview" | "plan" | "controls" | "evidence" | "impact" | "audit";
const technicalType = "T\u00e9cnico";

const mechanismTypes = [
  { value: technicalType, label: "Tecnico" },
  { value: "Processo", label: "Processo" },
  { value: "Pessoas", label: "Pessoas" },
  { value: "Fornecedor", label: "Fornecedor" },
];

type MechanismEditForm = {
  title: string;
  description: string;
  mechanism_type: string;
  tags: string;
};

type TaskForm = {
  title: string;
  description: string;
  owner: string;
  priority: "low" | "medium" | "high" | "critical";
  due_date: string;
  estimated_effort_hours: string;
  required_roles: string;
  required_materials: string;
  evidence_required: boolean;
  expected_evidence: string;
  dependency_notes: string;
};

function asArray<T = any>(payload: any): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.results || [];
}

function compactText(value?: string | null, fallback = "-") {
  return value && value.trim() ? value : fallback;
}

function mechanismTitle(mechanism: MechanismRecord | null) {
  return mechanism?.title || mechanism?.name || "Mecanismo";
}

function mechanismTypeLabel(type?: string) {
  if (!type) return "Sem tipo";
  if (type === technicalType) return "Tecnico";
  return type;
}

function mechanismTypeTone(type?: string) {
  if (type === technicalType || type === "Tecnico") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "Processo") return "border-amber-100 bg-amber-50 text-amber-700";
  if (type === "Pessoas") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (type === "Fornecedor") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function mechanismTags(mechanism: MechanismRecord | null) {
  return Array.isArray(mechanism?.tags) ? mechanism.tags.filter(Boolean).map(String) : [];
}

function mechanismEditForm(mechanism: MechanismRecord): MechanismEditForm {
  return {
    title: mechanism.title || mechanism.name || "",
    description: mechanism.description || "",
    mechanism_type: mechanism.mechanism_type || technicalType,
    tags: mechanismTags(mechanism).join(", "),
  };
}

function progressTone(value: number) {
  if (value >= 90) return "bg-emerald-500";
  if (value >= 70) return "bg-cyan-500";
  if (value >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function implementationLabel(status?: string) {
  const labels: Record<string, string> = {
    not_implemented: "Nao implementado",
    planned: "Planeado",
    partially_implemented: "Parcialmente implementado",
    implemented: "Implementado",
    implemented_evidenced: "Implementado e evidenciado",
    not_applicable: "Nao aplicavel",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending_review: "Pending review",
    approved: "Approved",
    rejected: "Rejected",
    deprecated: "Deprecated",
    non_compliant: "Nao conforme",
    partially_compliant: "Parcialmente conforme",
    mostly_compliant: "Maioritariamente conforme",
    compliant: "Conforme",
    not_assessed: "Nao avaliado",
    not_applicable: "Nao aplicavel",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusTone(status?: string) {
  if (["approved", "valid", "implemented", "implemented_evidenced", "compliant"].includes(status || "")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["pending_review", "planned", "partially_implemented", "mostly_compliant"].includes(status || "")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["rejected", "not_implemented", "non_compliant", "partially_compliant"].includes(status || "")) {
    return "border-red-100 bg-red-50 text-red-700";
  }
  if (["deprecated", "expired", "not_assessed", "not_applicable"].includes(status || "")) {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function actionStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    open: "Aberta",
    in_progress: "Em curso",
    blocked: "Bloqueada",
    done: "Concluida",
    deferred: "Adiada",
    cancelled: "Cancelada",
  };
  return labels[status || ""] || status || "Sem estado";
}

function actionStatusTone(status?: string) {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "in_progress") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (status === "blocked") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deferred") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "cancelled") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function readinessLabel(status?: string) {
  const labels: Record<string, string> = {
    not_planned: "Sem plano",
    planned: "Planeado",
    in_progress: "Em implementacao",
    ready_for_implemented: "Pronto para implementado",
    ready_for_evidenced: "Pronto para evidenciado",
  };
  return labels[status || ""] || status || "Sem leitura";
}

function readinessTone(status?: string) {
  if (status === "ready_for_evidenced") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "ready_for_implemented") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (status === "in_progress" || status === "planned") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function exceptionTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    policy_exception: "Excecao a politica",
    control_exception: "Excecao a controlo",
    risk_acceptance: "Aceitacao de risco",
    implementation_delay: "Adiamento",
    compensating_control: "Controlo compensatorio",
  };
  return labels[type || ""] || type || "Excecao";
}

function entityLabel(item: any) {
  if (!item) return "-";
  if (item.framework_code && item.code && item.title) return `${item.framework_code}:${item.code} - ${item.title}`;
  if (item.code && item.title) return `${item.code} - ${item.title}`;
  if (item.name && item.version) return `${item.name} ${item.version}`;
  return item.title || item.name || item.code || item.id || "-";
}

function relationshipItems(traceability: TraceabilityPayload | null, key: string) {
  return asArray(traceability?.relationships?.[key]);
}

function scoreValue(result?: any) {
  const score = result?.score ?? result?.result?.score ?? result?.details?.score;
  if (score === null || score === undefined || score === "") return "-";
  const parsed = Number(score);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(score);
}

function scoreStatus(result?: any) {
  return result?.status ?? result?.result?.status ?? "not_assessed";
}

function scoreForControl(result: any, controlId: string) {
  const candidates = [
    ...asArray(result?.details?.internal_controls),
    ...asArray(result?.internal_controls),
    ...asArray(result?.scores?.internal_controls),
  ];
  return candidates.find((item) => String(item.id || item.internal_control || item.target_id) === String(controlId));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function friendlyErrorMessage(err: any, fallback: string) {
  const message = String(err?.message || "");
  if (!message || message.includes("<!DOCTYPE") || message.includes("<html")) return fallback;
  return message;
}

function ImplementationProgressPanel({
  progress,
  onAddTask,
  onGeneratePlan,
  generating,
}: {
  progress: any;
  onAddTask: () => void;
  onGeneratePlan: () => void;
  generating: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Implementacao operacional</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Plano de implementacao</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
            Calculada a partir das tarefas reais deste mecanismo. A barra sobe quando as tarefas sao marcadas como concluidas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={onAddTask}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Adicionar tarefa
          </button>
          <button
            type="button"
            onClick={onGeneratePlan}
            disabled={generating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            {generating ? "A gerar..." : "Gerar tarefas com IA"}
          </button>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-4xl font-black text-slate-950">{progress.total > 0 ? `${progress.percentage}%` : "-"}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {progress.done} de {progress.total} tarefas concluidas
          </p>
        </div>
        <div className="grid gap-2 text-right text-xs font-bold uppercase tracking-wide text-slate-400 sm:grid-cols-3 sm:text-left">
          <span>{progress.inProgress} em curso</span>
          <span>{progress.blocked} bloqueadas</span>
          <span>{progress.estimatedHours}h estimadas</span>
        </div>
      </div>
      <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${progress.total > 0 ? progressTone(progress.percentage) : "bg-slate-300"}`}
          style={{ width: `${progress.total > 0 ? progress.percentage : 0}%` }}
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(progress.counts).map(([status, count]) => (
          <div key={status} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <Badge className={actionStatusTone(status)}>{actionStatusLabel(status)}</Badge>
            <p className="mt-2 text-2xl font-black text-slate-950">{String(count)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RelationshipList({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
        <Badge className="border-slate-200 bg-white text-slate-500">{items.length}</Badge>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.slice(0, 7).map((item, index) => (
            <div key={item.id || `${title}-${index}`} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
              <p className="text-sm font-bold text-slate-950">{entityLabel(item)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {item.status || item.document_type || item.control_domain || item.framework_name || "Relacionado"}
              </p>
            </div>
          ))}
          {items.length > 7 && <p className="text-xs font-semibold text-slate-500">+{items.length - 7} adicionais via API.</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function MechanismControlsPanel({
  links,
  frameworkCounts,
  score,
  mappingReviewHref = "/governance/mapping-review",
}: {
  links: any[];
  frameworkCounts: Record<string, number>;
  score: any;
  mappingReviewHref?: string;
}) {
  return (
    <SectionCard
      title="Controlos internos suportados"
      icon={ShieldCheck}
      action={(
        <Link to={mappingReviewHref} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
          <GitBranch className="h-4 w-4" />
          Mapping Review
        </Link>
      )}
    >
      {links.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">InternalControl</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Relacao</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Peso</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Obrigatorio</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Implementacao</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Validacao</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Frameworks</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Score</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {links.map((link) => {
                const controlId = String(link.internal_control || "");
                const controlScore = scoreForControl(score, controlId);
                return (
                  <tr key={link.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-950">{link.internal_control_code || controlId}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{link.internal_control_title || "-"}</p>
                      {link.internal_control_domain && <Badge className="mt-2 border-slate-200 bg-slate-50 text-slate-500">{link.internal_control_domain}</Badge>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{link.relationship_type_display || link.relationship_type || "-"}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{link.contribution_weight ?? "-"}%</td>
                    <td className="px-4 py-3">
                      <Badge className={link.mandatory ? "border-red-100 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                        {link.mandatory ? "Mandatory" : "Optional"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusTone(link.implementation_status)}>{link.implementation_status_display || implementationLabel(link.implementation_status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusTone(link.validation_status)}>{link.validation_status_display || statusLabel(link.validation_status)}</Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{frameworkCounts[controlId] || "-"}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{scoreValue(controlScore)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <a href={`/api/governance/traceability/internal-control/${controlId}/`} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Trace
                        </a>
                        <Link to={`/governance/mapping-review?internalControl=${controlId}`} className="inline-flex items-center gap-1 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100">
                          <GitBranch className="h-3.5 w-3.5" />
                          Mappings
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Este mecanismo ainda nao esta associado a controlos internos." />
      )}
    </SectionCard>
  );
}

function MechanismEvidencePanel({
  links,
  actionLoading,
  mappingReviewHref = "/governance/mapping-review",
  onApprove,
  onReject,
  onDeprecated,
}: {
  links: any[];
  actionLoading: string | null;
  mappingReviewHref?: string;
  onApprove: (link: any) => void;
  onReject: (link: any) => void;
  onDeprecated: (link: any) => void;
}) {
  return (
    <SectionCard
      title="Evidencias associadas"
      icon={FileCheck2}
      action={(
        <Link to={mappingReviewHref} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
          <GitBranch className="h-4 w-4" />
          Mapping Review
        </Link>
      )}
    >
      {links.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Evidencia</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Estado</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Validade</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Link</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Confianca</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {links.map((link) => (
                <tr key={link.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/governance/evidence/${link.evidence_item}`} className="font-bold text-slate-950 hover:text-indigo-700">
                      {link.evidence_title || link.evidence_item}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{compactText(link.rationale, "Sem rationale.")}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{link.evidence_type || "-"}</td>
                  <td className="px-4 py-3">
                    <Badge className={statusTone(link.evidence_status)}>{statusLabel(link.evidence_status)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={link.evidence_is_expired ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}>
                      {link.evidence_is_expired ? "Expirada" : "Ativa"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={statusTone(link.validation_status)}>{link.validation_status_display || statusLabel(link.validation_status)}</Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">{link.confidence_score ?? "-"}%</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={actionLoading === link.id}
                        onClick={() => onApprove(link)}
                        className="rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700 disabled:opacity-50"
                      >
                        Aprovar
                      </button>
                      <button
                        disabled={actionLoading === link.id}
                        onClick={() => onReject(link)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold uppercase text-red-700 disabled:opacity-50"
                      >
                        Rejeitar
                      </button>
                      <button
                        disabled={actionLoading === link.id}
                        onClick={() => onDeprecated(link)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-600 disabled:opacity-50"
                      >
                        Deprecated
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Este mecanismo ainda nao tem EvidenceItems associados." />
      )}
    </SectionCard>
  );
}

function MechanismImpactPanel({ traceability, score }: { traceability: TraceabilityPayload | null; score: any }) {
  const policies = relationshipItems(traceability, "policies");
  const documents = relationshipItems(traceability, "governance_documents");
  const frameworkControls = relationshipItems(traceability, "framework_controls");
  const frameworks = relationshipItems(traceability, "frameworks");
  const gaps = asArray(traceability?.gaps).concat(asArray(score?.gaps)).slice(0, 10);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <RelationshipList title="Policies impactadas" items={policies} empty="Sem politicas impactadas." />
      <RelationshipList title="Documentos impactados" items={documents} empty="Sem documentos impactados." />
      <RelationshipList title="Framework controls" items={frameworkControls} empty="Sem controlos externos impactados." />
      <RelationshipList title="Frameworks" items={frameworks} empty="Sem frameworks impactadas." />
      <div className="xl:col-span-2 rounded-xl border border-amber-100 bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900">Gaps e avisos</h3>
          <Badge className="border-amber-200 bg-white text-amber-700">{gaps.length}</Badge>
        </div>
        {gaps.length > 0 ? (
          <div className="mt-3 space-y-2">
            {gaps.map((gap: any, index: number) => (
              <div key={`${gap.type || "gap"}-${index}`} className="rounded-lg border border-amber-100 bg-white px-3 py-3">
                <p className="text-sm font-bold text-amber-950">{gap.type || gap.title || "Gap"}</p>
                <p className="mt-1 text-xs font-semibold text-amber-700">{gap.description || gap.recommendation || JSON.stringify(gap)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-amber-700">Sem gaps devolvidos pela traceability ou scoring.</p>
        )}
      </div>
    </div>
  );
}

function splitLines(value?: string | null) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function MechanismTasksPanel({
  actions,
  loadingAction,
  onAddTask,
  onGeneratePlan,
  onStatus,
  generating,
}: {
  actions: GovernanceAction[];
  loadingAction: string | null;
  onAddTask: () => void;
  onGeneratePlan: () => void;
  onStatus: (action: GovernanceAction, status: "in_progress" | "done" | "blocked" | "deferred" | "cancelled") => void;
  generating: boolean;
}) {
  return (
    <SectionCard
      title="Tarefas de implementacao"
      icon={ClipboardList}
      action={(
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddTask}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Tarefa
          </button>
          <button
            type="button"
            onClick={onGeneratePlan}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            IA
          </button>
        </div>
      )}
    >
      {actions.length > 0 ? (
        <div className="space-y-4">
          {actions.map((action) => {
            const roles = splitLines(action.required_roles);
            const materials = splitLines(action.required_materials);
            const isLoading = loadingAction === action.id;
            return (
              <article key={action.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-indigo-100 hover:bg-white hover:shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={actionStatusTone(action.status)}>{actionStatusLabel(action.status)}</Badge>
                      <Badge className={statusTone(action.priority)}>{action.priority_display || action.priority}</Badge>
                      {action.ai_generated && <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">IA</Badge>}
                      {action.evidence_required && <Badge className="border-emerald-100 bg-emerald-50 text-emerald-700">Exige evidencia</Badge>}
                    </div>
                    <Link
                      to={`/governance/tasks/${action.id}`}
                      className="mt-3 inline-flex max-w-full items-center gap-2 text-base font-black text-slate-950 hover:text-indigo-700"
                    >
                      <span className="truncate">{action.title}</span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                    <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600">
                      {compactText(action.description || action.recommendation, "Sem descricao operacional.")}
                    </p>
                  </div>
                  <div className="grid gap-2 text-xs font-bold uppercase tracking-wide text-slate-400 sm:grid-cols-3 lg:min-w-[320px]">
                    <span><Clock3 className="mb-1 h-4 w-4 text-slate-400" />{action.estimated_effort_hours || "-"} h</span>
                    <span>Prazo<br />{formatDate(action.due_date)}</span>
                    <span>Owner<br />{action.owner || "-"}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">RH necessario</p>
                    <p className="mt-2 whitespace-pre-line text-xs font-semibold text-slate-600">{roles.join("\n") || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recursos materiais</p>
                    <p className="mt-2 whitespace-pre-line text-xs font-semibold text-slate-600">{materials.join("\n") || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidencia esperada</p>
                    <p className="mt-2 whitespace-pre-line text-xs font-semibold text-slate-600">{compactText(action.expected_evidence)}</p>
                  </div>
                </div>

                {action.dependency_notes && (
                  <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    Dependencias: {action.dependency_notes}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/governance/tasks/${action.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                  >
                    <Pencil className="h-4 w-4" />
                    Abrir detalhe
                  </Link>
                  {action.status === "open" && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onStatus(action, "in_progress")}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-cyan-700 disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4" />
                      Iniciar
                    </button>
                  )}
                  {action.status !== "done" && action.status !== "cancelled" && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onStatus(action, "done")}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Concluir
                    </button>
                  )}
                  {action.status !== "blocked" && action.status !== "done" && action.status !== "cancelled" && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onStatus(action, "blocked")}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-700 disabled:opacity-50"
                    >
                      Bloquear
                    </button>
                  )}
                  {action.status !== "cancelled" && action.status !== "done" && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onStatus(action, "cancelled")}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-indigo-600" />
          <p className="mt-3 text-sm font-bold text-slate-900">Ainda nao existem tarefas de implementacao para este mecanismo.</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Podes criar tarefas manualmente ou gerar um plano recomendado para estimar trabalho, RH, recursos materiais e evidencias.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function ImplementationReadinessPanel({
  readiness,
  applying,
  onApply,
}: {
  readiness: MechanismImplementationReadiness | null;
  applying: boolean;
  onApply: () => void;
}) {
  if (!readiness) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-500">Nao foi possivel calcular a prontidao operacional deste mecanismo.</p>
      </section>
    );
  }

  const taskProgress = Number(readiness.tasks.progress_percentage ?? (readiness.tasks.total > 0 ? Math.round((readiness.tasks.done / readiness.tasks.total) * 100) : 0));

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={readinessTone(readiness.readiness_status)}>{readinessLabel(readiness.readiness_status)}</Badge>
            {readiness.recommended_status && (
              <Badge className={statusTone(readiness.recommended_status)}>
                Recomendado: {implementationLabel(readiness.recommended_status)}
              </Badge>
            )}
            {readiness.requires_human_validation && (
              <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">Validação humana obrigatória</Badge>
            )}
          </div>
          <h2 className="mt-3 text-xl font-black text-slate-950">Validação para score factual</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
            O sistema usa o progresso das tarefas reais deste mecanismo e a evidência válida aprovada para propor um estado operacional. A proposta fica sempre pendente até o CISO a validar.
          </p>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={!readiness.can_apply || applying}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Validar e aplicar
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-indigo-800">Sinal operacional pelas tarefas</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-indigo-900">
              {readiness.tasks.done} de {readiness.tasks.total} tarefas ativas concluídas. Fonte: {readiness.recommendation_source || "governance_actions"}.
            </p>
          </div>
          <p className="text-3xl font-black text-indigo-950">{taskProgress}%</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
          <div className={`h-full rounded-full ${progressTone(taskProgress)}`} style={{ width: `${taskProgress}%` }} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progresso</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{taskProgress}%</p>
          <p className="text-xs font-semibold text-slate-500">pelas tarefas</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tarefas</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{readiness.tasks.done}/{readiness.tasks.total}</p>
          <p className="text-xs font-semibold text-slate-500">concluídas</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidência válida</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{readiness.evidence.valid_approved}</p>
          <p className="text-xs font-semibold text-slate-500">EvidenceLinks aprovados</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Controlos a atualizar</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{readiness.applicable_count}</p>
          <p className="text-xs font-semibold text-slate-500">associações InternalControlMechanism</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Porque recomenda isto</p>
          {readiness.reasons.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-emerald-800">
              {readiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm font-semibold text-emerald-800">Sem razões adicionais.</p>
          )}
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-amber-800">O que ainda bloqueia</p>
          {readiness.blockers.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-amber-800">
              {readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm font-semibold text-amber-800">Sem bloqueios detetados.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function MechanismDetail() {
  const { id } = useParams();
  const [mechanism, setMechanism] = useState<MechanismRecord | null>(null);
  const [internalControls, setInternalControls] = useState<any[]>([]);
  const [evidenceLinks, setEvidenceLinks] = useState<any[]>([]);
  const [traceability, setTraceability] = useState<TraceabilityPayload | null>(null);
  const [score, setScore] = useState<any>(null);
  const [governanceExceptions, setGovernanceExceptions] = useState<GovernanceException[]>([]);
  const [implementationActions, setImplementationActions] = useState<GovernanceAction[]>([]);
  const [implementationReadiness, setImplementationReadiness] = useState<MechanismImplementationReadiness | null>(null);
  const [frameworkCounts, setFrameworkCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<MechanismWorkspaceTab>("overview");
  const [editingMechanism, setEditingMechanism] = useState(false);
  const [editForm, setEditForm] = useState<MechanismEditForm>({
    title: "",
    description: "",
    mechanism_type: technicalType,
    tags: "",
  });
  const [savingMechanism, setSavingMechanism] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [applyingRecommendation, setApplyingRecommendation] = useState(false);
  const [planningMessage, setPlanningMessage] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: "",
    description: "",
    owner: "",
    priority: "medium",
    due_date: "",
    estimated_effort_hours: "",
    required_roles: "",
    required_materials: "",
    evidence_required: true,
    expected_evidence: "",
    dependency_notes: "",
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setLoadWarnings([]);
    try {
      const warnings: string[] = [];
      const loadOptional = async <T,>(message: string, fallback: T, request: Promise<T>): Promise<T> => {
        try {
          return await request;
        } catch (err) {
          console.warn(message, err);
          warnings.push(message);
          return fallback;
        }
      };

      const mechanismData = await mappingReviewApi.getMechanism(id);
      const [controlsData, evidenceData, traceabilityData, scoreData, exceptionsData, actionData, readinessData] = await Promise.all([
        loadOptional<any[]>("Nao foi possivel carregar os controlos internos associados.", [], mappingReviewApi.getMechanismInternalControls(id)),
        loadOptional<any[]>("Nao foi possivel carregar as evidencias associadas.", [], mappingReviewApi.getMechanismEvidence(id)),
        loadOptional<TraceabilityPayload | null>("Nao foi possivel carregar a rastreabilidade do mecanismo.", null, mappingReviewApi.getMechanismTraceability(id, {
          mode: "official",
          include_inactive: true,
          include_evidence: true,
          include_gaps: true,
          include_scores: true,
          max_depth: 3,
        })),
        loadOptional<any>("Nao foi possivel carregar o score de conformidade.", null, mappingReviewApi.getMechanismComplianceScore(id, { mode: "official", include_details: true, include_gaps: true })),
        loadOptional<any>("Nao foi possivel carregar excecoes associadas.", { results: [] }, governanceApi.listGovernanceExceptions({ target_type: "mechanism", target_id: id, page_size: 50 })),
        loadOptional<GovernanceAction[]>("Nao foi possivel carregar as tarefas de implementacao.", [], governanceApi.listMechanismImplementationActions(id)),
        loadOptional<MechanismImplementationReadiness | null>("Nao foi possivel calcular a prontidao operacional.", null, governanceApi.getMechanismImplementationReadiness(id)),
      ]);

      const controlLinks = asArray(controlsData);
      const counts: Record<string, number> = {};
      let frameworkCountWarning = false;
      await Promise.all(controlLinks.map(async (link: any) => {
        if (!link.internal_control) return;
        try {
          const mappings = await mappingReviewApi.listMappings("internal_control_framework_mapping", {
            internal_control: link.internal_control,
            validation_status: "approved",
            page_size: 200,
          });
          const frameworks = new Set(mappings.map((mapping: MappingRecord) => mapping.raw?.framework_code || mapping.raw?.framework_name || String(mapping.targetLabel || "").split(":")[0]).filter(Boolean));
          counts[String(link.internal_control)] = frameworks.size;
        } catch {
          frameworkCountWarning = true;
          counts[String(link.internal_control)] = 0;
        }
      }));
      if (frameworkCountWarning) warnings.push("Nao foi possivel calcular frameworks associadas a alguns controlos.");

      setMechanism(mechanismData);
      setEditForm(mechanismEditForm(mechanismData));
      setInternalControls(controlLinks);
      setEvidenceLinks(asArray(evidenceData));
      setTraceability(traceabilityData);
      setScore(scoreData);
      setGovernanceExceptions(asArray<GovernanceException>(exceptionsData).filter((item) => !["rejected", "revoked"].includes(item.approval_status)));
      setImplementationActions(asArray<GovernanceAction>(actionData));
      setImplementationReadiness(readinessData);
      setFrameworkCounts(counts);
      setLoadWarnings(warnings);
    } catch (err: any) {
      console.error(err);
      setMechanism(null);
      setInternalControls([]);
      setEvidenceLinks([]);
      setTraceability(null);
      setScore(null);
      setGovernanceExceptions([]);
      setImplementationActions([]);
      setImplementationReadiness(null);
      setFrameworkCounts({});
      setLoadWarnings([]);
      setError(friendlyErrorMessage(err, "Nao foi possivel carregar o mecanismo. Verifica se o backend esta ativo e se as migracoes foram aplicadas."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (link: any) => {
    setActionLoading(link.id);
    setActionError(null);
    try {
      await mappingReviewApi.approveEvidenceLink(link.id);
      await load();
    } catch (err: any) {
      setActionError(err?.message || "Nao foi possivel aprovar a evidencia.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (link: any) => {
    const rationale = window.prompt("Indica a rationale para rejeitar este EvidenceLink:");
    if (!rationale?.trim()) return;
    setActionLoading(link.id);
    setActionError(null);
    try {
      await mappingReviewApi.rejectEvidenceLink(link.id, rationale.trim());
      await load();
    } catch (err: any) {
      setActionError(err?.message || "Nao foi possivel rejeitar a evidencia.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeprecated = async (link: any) => {
    if (!window.confirm("Marcar este EvidenceLink como deprecated?")) return;
    setActionLoading(link.id);
    setActionError(null);
    try {
      await mappingReviewApi.markEvidenceLinkDeprecated(link.id);
      await load();
    } catch (err: any) {
      setActionError(err?.message || "Nao foi possivel marcar como deprecated.");
    } finally {
      setActionLoading(null);
    }
  };

  const openEditMechanism = () => {
    if (!mechanism) return;
    setEditForm(mechanismEditForm(mechanism));
    setEditError(null);
    setEditingMechanism(true);
  };

  const saveMechanism = async () => {
    if (!id) return;
    if (!editForm.title.trim()) {
      setEditError("O titulo do mecanismo e obrigatorio.");
      return;
    }

    setSavingMechanism(true);
    setEditError(null);
    try {
      const updated = await mappingReviewApi.updateMechanism(id, {
        title: editForm.title.trim(),
        description: editForm.description,
        mechanism_type: editForm.mechanism_type || technicalType,
        tags: editForm.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setMechanism(updated);
      setEditForm(mechanismEditForm(updated));
      setEditingMechanism(false);
      await load();
    } catch (err: any) {
      setEditError(friendlyErrorMessage(err, "Nao foi possivel guardar o mecanismo."));
    } finally {
      setSavingMechanism(false);
    }
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: "",
      description: "",
      owner: "",
      priority: "medium",
      due_date: "",
      estimated_effort_hours: "",
      required_roles: "",
      required_materials: "",
      evidence_required: true,
      expected_evidence: "",
      dependency_notes: "",
    });
  };

  const openTaskForm = () => {
    resetTaskForm();
    setActionError(null);
    setTaskFormOpen(true);
  };

  const saveTask = async () => {
    if (!id) return;
    if (!taskForm.title.trim()) {
      setActionError("O titulo da tarefa e obrigatorio.");
      return;
    }

    setSavingTask(true);
    setActionError(null);
    try {
      await governanceApi.createMechanismImplementationAction(id, {
        action_type: taskForm.evidence_required ? "collect_evidence" : "implement_mechanism",
        title: taskForm.title.trim(),
        description: taskForm.description,
        recommendation: taskForm.description,
        owner: taskForm.owner,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
        estimated_effort_hours: taskForm.estimated_effort_hours || null,
        required_roles: taskForm.required_roles,
        required_materials: taskForm.required_materials,
        evidence_required: taskForm.evidence_required,
        expected_evidence: taskForm.expected_evidence,
        dependency_notes: taskForm.dependency_notes,
      });
      setTaskFormOpen(false);
      resetTaskForm();
      await load();
    } catch (err: any) {
      setActionError(friendlyErrorMessage(err, "Nao foi possivel criar a tarefa."));
    } finally {
      setSavingTask(false);
    }
  };

  const generateImplementationActions = async () => {
    if (!id) return;
    setPlanningLoading(true);
    setActionError(null);
    setPlanningMessage(null);
    try {
      const result = await governanceApi.generateMechanismImplementationActions(id);
      setPlanningMessage(`${result.created} tarefa(s) criadas e ${result.updated} atualizada(s) para este mecanismo.`);
      setActiveWorkspaceTab("plan");
      await load();
    } catch (err: any) {
      setActionError(friendlyErrorMessage(err, "Nao foi possivel gerar tarefas para este mecanismo."));
    } finally {
      setPlanningLoading(false);
    }
  };

  const updateActionStatus = async (action: GovernanceAction, status: "in_progress" | "done" | "blocked" | "deferred" | "cancelled") => {
    setActionLoading(action.id);
    setActionError(null);
    try {
      if (status === "in_progress") await governanceApi.startGovernanceAction(action.id);
      if (status === "done") await governanceApi.completeGovernanceAction(action.id);
      if (status === "blocked") await governanceApi.blockGovernanceAction(action.id, "Bloqueada no detalhe do mecanismo.");
      if (status === "deferred") await governanceApi.deferGovernanceAction(action.id, "Adiada no detalhe do mecanismo.");
      if (status === "cancelled") await governanceApi.cancelGovernanceAction(action.id, "Cancelada no detalhe do mecanismo.");
      await load();
    } catch (err: any) {
      setActionError(friendlyErrorMessage(err, "Nao foi possivel atualizar a tarefa."));
    } finally {
      setActionLoading(null);
    }
  };

  const applyImplementationRecommendation = async () => {
    if (!id || !implementationReadiness?.can_apply) return;
    if (!window.confirm("Validar e aplicar o estado recomendado aos controlos internos associados a este mecanismo?")) return;

    setApplyingRecommendation(true);
    setActionError(null);
    setPlanningMessage(null);
    try {
      const result = await governanceApi.applyMechanismImplementationRecommendation(
        id,
        undefined,
        "Estado operacional validado pelo CISO com base no progresso das tarefas de implementacao."
      );
      const recommended = implementationLabel(result.readiness.recommended_status || "");
      setPlanningMessage(`${result.updated} associacao(oes) atualizada(s) para ${recommended}.`);
      await load();
    } catch (err: any) {
      setActionError(friendlyErrorMessage(err, "Nao foi possivel aplicar a recomendacao de estado."));
    } finally {
      setApplyingRecommendation(false);
    }
  };

  const metrics = useMemo(() => ({
    controls: internalControls.length,
    mandatory: internalControls.filter((item) => item.mandatory).length,
    evidence: evidenceLinks.length,
    frameworks: relationshipItems(traceability, "frameworks").length,
    actions: implementationActions.length,
  }), [evidenceLinks.length, implementationActions.length, internalControls, traceability]);

  const implementationProgress = useMemo(() => {
    const counts: Record<string, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      deferred: 0,
      cancelled: 0,
    };
    let completedWeight = 0;
    let totalWeight = 0;
    let estimatedHours = 0;

    implementationActions.forEach((action) => {
      const status = String(action.status || "open");
      counts[status] = (counts[status] || 0) + 1;
      if (status === "cancelled") return;
      const effort = Number(action.estimated_effort_hours || 0);
      const weight = Number.isFinite(effort) && effort > 0 ? effort : 1;
      totalWeight += weight;
      estimatedHours += Number.isFinite(effort) ? effort : 0;
      if (status === "done") completedWeight += weight;
    });

    return {
      percentage: totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0,
      total: implementationActions.filter((action) => action.status !== "cancelled").length,
      done: counts.done || 0,
      inProgress: counts.in_progress || 0,
      blocked: counts.blocked || 0,
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      counts,
    };
  }, [implementationActions]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-indigo-600" />
        <span className="text-sm font-bold uppercase tracking-wide">A carregar mecanismo...</span>
      </div>
    );
  }

  if (error || !mechanism) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-bold">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar mecanismo
          </div>
          <p className="mt-2 text-sm font-medium">{error || "Mecanismo nao encontrado."}</p>
          <Link to="/governance/mechanisms" className="mt-4 inline-flex rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  const workspaceTabs: Array<{
    id: MechanismWorkspaceTab;
    label: string;
    description: string;
    badge: string;
    icon: any;
  }> = [
    {
      id: "overview",
      label: "Visao geral",
      description: "Estado, ownership, score e indicadores principais.",
      badge: scoreValue(score),
      icon: Wrench,
    },
    {
      id: "plan",
      label: "Plano",
      description: "Tarefas, esforco, recursos e progresso real.",
      badge: `${metrics.actions} tarefas`,
      icon: ClipboardList,
    },
    {
      id: "controls",
      label: "Controlos internos",
      description: "Controlos suportados, peso, obrigatoriedade e estado.",
      badge: `${metrics.controls} controlos`,
      icon: ShieldCheck,
    },
    {
      id: "evidence",
      label: "Evidencias",
      description: "Evidencias esperadas ou reais ligadas ao mecanismo.",
      badge: `${metrics.evidence} links`,
      icon: FileCheck2,
    },
    {
      id: "impact",
      label: "Impacto",
      description: "Politicas, documentos, frameworks e gaps impactados.",
      badge: `${metrics.frameworks} frameworks`,
      icon: Network,
    },
    {
      id: "audit",
      label: "Auditoria",
      description: "Excecoes, risco aceite e atalhos tecnicos.",
      badge: `${governanceExceptions.length} excecoes`,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <Link to="/governance/mechanisms" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-700">
        <ArrowLeft className="h-4 w-4" />
        Voltar aos mecanismos
      </Link>

      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={mechanismTypeTone(mechanism.mechanism_type)}>{mechanismTypeLabel(mechanism.mechanism_type)}</Badge>
              {Array.isArray(mechanism.tags) && mechanism.tags.slice(0, 5).map((tag: string) => (
                <Badge key={tag} className="border-slate-200 bg-slate-50 text-slate-500">{tag}</Badge>
              ))}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{mechanismTitle(mechanism)}</h1>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {compactText(mechanism.description, "Sem descricao registada.")}
            </p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</p>
                <p className="font-bold text-slate-800">{mechanismTypeLabel(mechanism.mechanism_type)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tags</p>
                <p className="font-bold text-slate-800">{mechanismTags(mechanism).length || "-"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Atualizado</p>
                <p className="font-bold text-slate-800">{formatDate(mechanism.updated_at)}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={openEditMechanism} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700">
              <Pencil className="h-4 w-4" />
              Editar mecanismo
            </button>
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link to="/governance/mechanisms/wizard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <Wrench className="h-4 w-4" />
              Criar mecanismo
            </Link>
          </div>
        </div>
      </header>

      <ImplementationProgressPanel
        progress={implementationProgress}
        onAddTask={openTaskForm}
        onGeneratePlan={generateImplementationActions}
        generating={planningLoading}
      />

      <ImplementationReadinessPanel
        readiness={implementationReadiness}
        applying={applyingRecommendation}
        onApply={applyImplementationRecommendation}
      />

      {activeWorkspaceTab === "audit" && governanceExceptions.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Excecoes ou aceitacoes de risco neste mecanismo
              </div>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-amber-900">
                Este mecanismo tem decisoes formais associadas. A implementacao continua visivel no score factual, e a excecao explica o desvio aceite.
              </p>
            </div>
            <Link
              to="/governance/exceptions"
              className="inline-flex items-center justify-center rounded-xl bg-amber-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-amber-800"
            >
              Ver excecoes
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {governanceExceptions.slice(0, 4).map((exception) => (
              <div key={exception.id} className="rounded-xl border border-amber-100 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusTone(exception.approval_status)}>{exception.approval_status}</Badge>
                  <Badge className="border-amber-100 bg-amber-50 text-amber-700">{exceptionTypeLabel(exception.exception_type)}</Badge>
                </div>
                <div className="mt-2 font-bold text-slate-950">{exception.title}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Validade: {formatDate(exception.valid_until)} · impacto score: {exception.score_impact ?? 0} pp
                </div>
                {exception.compensating_control_description ? (
                  <div className="mt-2 text-xs font-semibold leading-relaxed text-amber-800">
                    Compensatorio: {exception.compensating_control_description}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {actionError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {actionError}
        </div>
      )}

      {planningMessage && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {planningMessage}
        </div>
      )}

      {loadWarnings.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          <div className="mb-1 font-bold">Alguns dados complementares nao foram carregados.</div>
          <ul className="list-disc space-y-1 pl-5">
            {loadWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <nav className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm lg:grid-cols-6" aria-label="Workspace do mecanismo">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeWorkspaceTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveWorkspaceTab(tab.id)}
              className={`rounded-xl border p-4 text-left transition ${
                selected ? "border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-indigo-100 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <Icon className={`h-5 w-5 ${selected ? "text-indigo-700" : "text-slate-400"}`} />
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  selected ? "border-indigo-100 bg-white text-indigo-700" : "border-slate-200 bg-white text-slate-500"
                }`}>
                  {tab.badge}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold">{tab.label}</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{tab.description}</p>
            </button>
          );
        })}
      </nav>

      {activeWorkspaceTab === "overview" && (
        <>
          <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <InfoCard icon={ShieldCheck} label="Controlos internos" value={metrics.controls} />
            <InfoCard icon={AlertTriangle} label="Mandatory" value={metrics.mandatory} tone="text-red-600" />
            <InfoCard icon={FileCheck2} label="Evidencias" value={metrics.evidence} tone="text-cyan-600" />
            <InfoCard icon={Layers3} label="Frameworks" value={metrics.frameworks} tone="text-emerald-600" />
            <InfoCard icon={Wrench} label="Implementacao" value={implementationProgress.total > 0 ? `${implementationProgress.percentage}%` : "-"} tone="text-amber-600" />
            <InfoCard icon={CheckCircle2} label={statusLabel(scoreStatus(score))} value={scoreValue(score)} tone="text-indigo-700" />
          </section>

          <SectionCard title="Resumo operacional" icon={Wrench}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{mechanismTypeLabel(mechanism.mechanism_type)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tags</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{mechanismTags(mechanism).join(", ") || "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Criado</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(mechanism.created_at)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Atualizado</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(mechanism.updated_at)}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Descricao</p>
              <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-700">
                {compactText(mechanism.description, "Sem descricao registada.")}
              </p>
            </div>
          </SectionCard>
        </>
      )}

      {activeWorkspaceTab === "plan" && (
        <MechanismTasksPanel
          actions={implementationActions}
          loadingAction={actionLoading}
          onAddTask={openTaskForm}
          onGeneratePlan={generateImplementationActions}
          onStatus={updateActionStatus}
          generating={planningLoading}
        />
      )}

      {activeWorkspaceTab === "controls" && (
        <MechanismControlsPanel
          links={internalControls}
          frameworkCounts={frameworkCounts}
          score={score}
          mappingReviewHref={`/governance/mapping-review?mechanism=${id}`}
        />
      )}

      {activeWorkspaceTab === "evidence" && (
        <MechanismEvidencePanel
          links={evidenceLinks}
          actionLoading={actionLoading}
          mappingReviewHref={`/governance/mapping-review?mechanism=${id}`}
          onApprove={handleApprove}
          onReject={handleReject}
          onDeprecated={handleDeprecated}
        />
      )}

      {activeWorkspaceTab === "impact" && (
        <SectionCard title="Impacto e rastreabilidade" icon={Network}>
          <MechanismImpactPanel traceability={traceability} score={score} />
        </SectionCard>
      )}

      {activeWorkspaceTab === "audit" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Estado para auditoria" icon={CheckCircle2}>
            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard icon={CheckCircle2} label={statusLabel(scoreStatus(score))} value={scoreValue(score)} tone="text-indigo-700" />
              <InfoCard icon={AlertTriangle} label="Excecoes" value={governanceExceptions.length} tone="text-amber-600" />
              <InfoCard icon={FileCheck2} label="Evidencias" value={metrics.evidence} tone="text-cyan-600" />
            </div>
          </SectionCard>

          <SectionCard title="Links rapidos" icon={ExternalLink}>
            <div className="space-y-3">
              <a href={`/api/governance/traceability/mechanism/${id}/`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Traceability API
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href={`/api/governance/compliance-propagation/mechanism/${id}/`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Compliance API
                <ExternalLink className="h-4 w-4" />
              </a>
              <Link to={`/governance/mapping-review?mechanism=${id}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Mapping Review
                <GitBranch className="h-4 w-4" />
              </Link>
            </div>
          </SectionCard>
        </div>
      )}

      {taskFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Plano de implementacao</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Adicionar tarefa</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                  Regista uma tarefa operacional para implementar este mecanismo, com esforco, RH, recursos materiais e evidencia esperada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTaskFormOpen(false)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 hover:text-slate-900"
                aria-label="Fechar tarefa"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-[1fr_200px_180px]">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Titulo</span>
                  <input
                    value={taskForm.title}
                    onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Prioridade</span>
                  <select
                    value={taskForm.priority}
                    onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value as TaskForm["priority"] }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Critica</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Prazo</span>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(event) => setTaskForm((current) => ({ ...current, due_date: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Descricao</span>
                <textarea
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Owner</span>
                  <input
                    value={taskForm.owner}
                    onChange={(event) => setTaskForm((current) => ({ ...current, owner: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Esforco estimado (h)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={taskForm.estimated_effort_hours}
                    onChange={(event) => setTaskForm((current) => ({ ...current, estimated_effort_hours: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="mt-8 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={taskForm.evidence_required}
                    onChange={(event) => setTaskForm((current) => ({ ...current, evidence_required: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  Exige evidencia
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">RH necessario</span>
                  <textarea
                    value={taskForm.required_roles}
                    onChange={(event) => setTaskForm((current) => ({ ...current, required_roles: event.target.value }))}
                    rows={4}
                    placeholder="Um por linha"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Recursos materiais</span>
                  <textarea
                    value={taskForm.required_materials}
                    onChange={(event) => setTaskForm((current) => ({ ...current, required_materials: event.target.value }))}
                    rows={4}
                    placeholder="Um por linha"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Evidencia esperada</span>
                  <textarea
                    value={taskForm.expected_evidence}
                    onChange={(event) => setTaskForm((current) => ({ ...current, expected_evidence: event.target.value }))}
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Dependencias</span>
                  <textarea
                    value={taskForm.dependency_notes}
                    onChange={(event) => setTaskForm((current) => ({ ...current, dependency_notes: event.target.value }))}
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 p-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setTaskFormOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveTask}
                disabled={savingTask}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Save className="h-4 w-4" />
                {savingTask ? "A guardar..." : "Guardar tarefa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingMechanism && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Catalogo de mecanismos</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Editar mecanismo</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                  Edita apenas os dados do catalogo reutilizavel. O estado de implementacao continua a ser gerido nas associacoes aos controlos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMechanism(false)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 hover:text-slate-900"
                aria-label="Fechar edicao"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-6">
              {editError && (
                <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {editError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Titulo</span>
                  <input
                    value={editForm.title}
                    onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</span>
                  <select
                    value={editForm.mechanism_type}
                    onChange={(event) => setEditForm((current) => ({ ...current, mechanism_type: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  >
                    {mechanismTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Descricao</span>
                <textarea
                  value={editForm.description}
                  onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                  rows={7}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Tags</span>
                <input
                  value={editForm.tags}
                  onChange={(event) => setEditForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="Separadas por virgula. Ex: IAM, acesso, preventivo"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 p-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditingMechanism(false)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveMechanism}
                disabled={savingMechanism}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Save className="h-4 w-4" />
                {savingMechanism ? "A guardar..." : "Guardar mecanismo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
