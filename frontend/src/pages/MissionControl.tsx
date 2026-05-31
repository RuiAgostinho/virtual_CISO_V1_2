import { type ElementType, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";
import { riskApi, type Asset, type AssetVulnerability, type PrioritizedVulnerability } from "@/lib/riskApi";
import { governanceApi, type ComplianceSummary, type DecisionRecord, type GovernanceAction } from "@/lib/governanceApi";
import { chatApi, type AssistantHistoryEntry } from "@/lib/chatApi";
import { request } from "@/lib/api";
import CisoDecisionFlow from "@/components/ui/CisoDecisionFlow";
import { buildVulnerabilityOccurrenceUrl } from "@/lib/cisoNavigation";

type WorkbenchSeverity = "critical" | "high" | "medium" | "low" | "info";

type WorkbenchItem = {
  id: string;
  category: string;
  severity: WorkbenchSeverity;
  title: string;
  description: string;
  count: number;
  href: string;
  action_label: string;
};

type ProgramWorkItem = WorkbenchItem & {
  stage: string;
  stage_label: string;
  stage_order: number;
  decision_rationale?: string;
  traceability_target?: {
    type: string;
    id: string;
    label?: string;
  } | null;
  traceability_href?: string;
};

type WorkbenchPayload = {
  generated_at: string;
  metrics: {
    total_attention: number;
    critical_categories: number;
    high_categories: number;
    pending_review: number;
    controls_without_mechanisms: number;
    expired_evidence: number;
    active_exceptions: number;
  };
  work_items: WorkbenchItem[];
};

type ProgramStageStatus = "not_started" | "in_progress" | "attention" | "complete";

type ProgramStage = {
  id: string;
  order: number;
  label: string;
  summary: string;
  href: string;
  threshold: number;
  completeness: number;
  status: ProgramStageStatus;
  attention_count: number;
  severity: WorkbenchSeverity;
  blocking: boolean;
  work_item_ids: string[];
  primary_href: string;
  primary_action_label: string;
};

type ProgramFrameworkRef = {
  id: string;
  code: string;
  name: string;
  version?: string | null;
};

type ProgramFrameworkMaturity = {
  framework: ProgramFrameworkRef;
  total_controls: number;
  total_assessments: number;
  controls_without_assessment: number;
  implemented: number;
  partial: number;
  planned: number;
  not_started: number;
  score: number;
  completeness: number;
  attention_count: number;
  has_attention: boolean;
};

type ProgramOverview = {
  generated_at: string;
  risk_appetite: string;
  current_focus: ProgramStage | null;
  next_action: ProgramWorkItem | null;
  next_actions: ProgramWorkItem[];
  stages: ProgramStage[];
  work_items: ProgramWorkItem[];
  signals: {
    assets?: {
      total_assets?: number;
      official_assets?: number;
      onboarding_assets?: number;
      pending_findings?: number;
      without_owner?: number;
      without_type?: number;
      without_valid_classification?: number;
    };
    risk?: {
      active_occurrences?: number;
      critical_high?: number;
      critical?: number;
      high?: number;
    };
    maturity?: {
      total_controls?: number;
      total_assessments?: number;
      controls_without_assessment?: number;
      not_started?: number;
      score?: number;
      frameworks?: ProgramFrameworkMaturity[];
      frameworks_with_attention?: number;
      worst_framework?: ProgramFrameworkMaturity | null;
    };
    drift?: {
      total_events?: number;
      critical?: number;
      high?: number;
      control_regressions?: number;
      asset_exposure_regressions?: number;
      new_vulnerabilities?: number;
    };
  };
};

type LoadState = {
  assets: Asset[];
  occurrences: AssetVulnerability[];
  priorities: PrioritizedVulnerability[];
  compliance: ComplianceSummary | null;
  decisions: DecisionRecord[];
  mechanismActions: GovernanceAction[];
  recommendations: AssistantHistoryEntry[];
  policyAdviceRecommendations: AssistantHistoryEntry[];
  residualRisk: Record<string, unknown> | null;
  governanceWorkbench: WorkbenchPayload | null;
  programOverview: ProgramOverview | null;
};

type MissionMetrics = {
  active: AssetVulnerability[];
  critical: number;
  high: number;
  acceptedOrClosed: number;
  topPriority?: PrioritizedVulnerability;
  complianceScore: number;
  missingControls: number;
  assistantDecisions: DecisionRecord[];
  pendingRecommendations: number;
  pendingPolicyAdvice: number;
  generalRecommendations: AssistantHistoryEntry[];
  openMechanismActions: GovernanceAction[];
  overdueMechanismActions: GovernanceAction[];
  dueSoonMechanismActions: GovernanceAction[];
  blockedMechanismActions: GovernanceAction[];
  residualRiskLinks: number;
  residualRiskOfficialLinks: number;
  residualRiskPending: number;
};

const emptyState: LoadState = {
  assets: [],
  occurrences: [],
  priorities: [],
  compliance: null,
  decisions: [],
  mechanismActions: [],
  recommendations: [],
  policyAdviceRecommendations: [],
  residualRisk: null,
  governanceWorkbench: null,
  programOverview: null,
};

const severityLabel: Record<string, string> = {
  Critical: "Critica",
  High: "Alta",
  Medium: "Media",
  Low: "Baixa",
};

const decisionLabel: Record<string, string> = {
  accepted: "Aceite",
  rejected: "Rejeitada",
  deferred: "Diferida",
  mitigate: "Mitigar",
  transferred: "Transferida",
  converted_to_action: "Convertida em acao",
};

const taskTypeLabel: Record<string, string> = {
  vulnerability_prioritization: "Priorizacao",
  structured_query: "Consulta estruturada",
  control_mapping: "Mapeamento de controlos",
  executive_advisory: "Apoio executivo",
  general_qa: "Conhecimento geral",
};

const actionStatusLabel: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em curso",
  blocked: "Bloqueada",
  done: "Concluida",
  deferred: "Adiada",
  cancelled: "Cancelada",
};

const actionPriorityLabel: Record<string, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  critical: "Critica",
};

const residualTargetLabel: Record<string, string> = {
  risk: "Riscos",
  asset: "Ativos",
  vulnerability: "Vulnerabilidades",
  asset_vulnerability: "Ocorrencias",
};

const residualSourceLabel: Record<string, string> = {
  internal_control: "Controlos internos",
  mechanism: "Mecanismos",
  internal_control_mechanism: "Mecanismos por controlo",
  policy: "Politicas",
  governance_document: "Documentos",
};

const workbenchSeverityLabel: Record<WorkbenchSeverity, string> = {
  critical: "Critico",
  high: "Alto",
  medium: "Medio",
  low: "Baixo",
  info: "Info",
};

const workbenchSeverityTone: Record<WorkbenchSeverity, string> = {
  critical: "border-red-100 bg-red-50 text-red-700",
  high: "border-orange-100 bg-orange-50 text-orange-700",
  medium: "border-amber-100 bg-amber-50 text-amber-700",
  low: "border-sky-100 bg-sky-50 text-sky-700",
  info: "border-slate-200 bg-white text-slate-600",
};

const programStatusLabel: Record<ProgramStageStatus, string> = {
  not_started: "Por iniciar",
  in_progress: "Em curso",
  attention: "Atenção",
  complete: "Concluída",
};

const programStatusTone: Record<ProgramStageStatus, string> = {
  not_started: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-sky-100 bg-sky-50 text-sky-700",
  attention: "border-amber-100 bg-amber-50 text-amber-700",
  complete: "border-emerald-100 bg-emerald-50 text-emerald-700",
};

function asCount(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function actionStatusTone(status?: string) {
  if (status === "blocked") return "border-red-100 bg-red-50 text-red-700";
  if (status === "in_progress") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  if (status === "deferred") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-600";
}

function actionPriorityTone(priority?: string) {
  if (priority === "critical") return "border-red-100 bg-red-50 text-red-700";
  if (priority === "high") return "border-orange-100 bg-orange-50 text-orange-700";
  if (priority === "medium") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-600";
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
  if (days === 1) return "Amanhã";
  return `Daqui a ${days} dias`;
}

function isPolicyAdviceRecommendation(item: AssistantHistoryEntry) {
  return item.filters_json?.context === "policy_advice";
}

function recommendationContextBadge(item: AssistantHistoryEntry) {
  if (item.filters_json?.context === "policy_advice") {
    if (item.filters_json?.advice_mode === "auditability") return "Gaps de politica";
    if (item.filters_json?.advice_mode === "coverage") return "Cobertura politica";
    if (item.filters_json?.advice_mode === "draft_text") return "Redacao politica";
    return "Analise de politica";
  }
  return null;
}

function recommendationPriorityScore(item: AssistantHistoryEntry) {
  const confidence = typeof item.confidence === "number" ? item.confidence : 0;
  const taskWeight =
    item.task_type === "vulnerability_prioritization"
      ? 200
      : item.task_type === "executive_advisory"
        ? 120
        : item.task_type === "control_mapping"
          ? 90
          : 40;
  const ragWeight = item.used_rag ? 15 : 0;

  return taskWeight + ragWeight + Math.round(confidence * 100);
}

function recommendationFocus(item: AssistantHistoryEntry) {
  const confidence = typeof item.confidence === "number" ? item.confidence : 0;

  if (item.task_type === "vulnerability_prioritization") {
    return {
      label: "Prioridade imediata",
      className: "border-red-100 bg-red-50 text-red-700",
    };
  }
  if (confidence >= 0.8) {
    return {
      label: "Alta confianca",
      className: "border-emerald-100 bg-emerald-50 text-emerald-700",
    };
  }
  if (item.used_rag) {
    return {
      label: "Com suporte documental",
      className: "border-indigo-100 bg-indigo-50 text-indigo-700",
    };
  }
  return {
    label: "Analise geral",
    className: "border-slate-200 bg-slate-100 text-slate-600",
  };
}

function scoreTone(value: number) {
  if (value >= 80) return "text-red-600";
  if (value >= 60) return "text-orange-600";
  if (value >= 40) return "text-amber-600";
  return "text-emerald-600";
}

function formatCount(value?: number) {
  return new Intl.NumberFormat("pt-PT").format(Number(value || 0));
}

function formatPercent(value?: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function KpiCard({
  label,
  value,
  detail,
  tone = "slate",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "slate" | "red" | "amber" | "emerald" | "indigo";
  icon: ElementType;
}) {
  const toneClass = {
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function ResidualRiskOverviewPanel({ overview }: { overview: Record<string, unknown> | null }) {
  const totalLinks = asCount(overview?.total_links);
  const activeLinks = asCount(overview?.active_links);
  const approved = asCount(overview?.approved);
  const pending = asCount(overview?.pending_review);
  const draft = asCount(overview?.draft);
  const rejected = asCount(overview?.rejected);
  const deprecated = asCount(overview?.deprecated);
  const targetEntries = Object.entries(overview?.targets || {})
    .filter(([, value]) => asCount(value) > 0)
    .sort((a, b) => asCount(b[1]) - asCount(a[1]));
  const sourceEntries = Object.entries(overview?.sources || {})
    .filter(([, value]) => asCount(value) > 0)
    .sort((a, b) => asCount(b[1]) - asCount(a[1]));

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risco residual integrado
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-950">Impacto da governacao no risco</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
            Ligacoes reais da BD entre controlos, mecanismos, politicas ou documentos e riscos/ativos/vulnerabilidades. Estes dados alimentam a projecao de risco residual sem alterar o motor antigo.
          </p>
        </div>
        <Link
          to="/governance/residual-risk-mappings"
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-emerald-200 hover:text-emerald-700"
        >
          Rever mappings <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {totalLinks === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
          Ainda nao existem ligacoes formais entre governacao e risco residual. Quando forem criadas na BD, este painel passa a mostrar que controlos e mecanismos reduzem que riscos.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Mappings oficiais</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{approved}</p>
              <p className="mt-1 text-xs font-semibold text-emerald-800">{activeLinks} ligacoes ativas no modo oficial.</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Por validar</p>
              <p className="mt-2 text-3xl font-bold text-amber-700">{pending + draft}</p>
              <p className="mt-1 text-xs font-semibold text-amber-800">{pending} pending review e {draft} em draft.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Inativos</p>
              <p className="mt-2 text-3xl font-bold text-slate-700">{rejected + deprecated}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{rejected} rejeitados e {deprecated} deprecated.</p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Total registado</p>
              <p className="mt-2 text-3xl font-bold text-indigo-700">{totalLinks}</p>
              <p className="mt-1 text-xs font-semibold text-indigo-800">Rastreabilidade risco-governacao.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Alvos impactados</p>
              <div className="mt-3 space-y-2">
                {targetEntries.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-500">Sem alvos ativos no modo oficial.</p>
                ) : targetEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                    <span className="text-xs font-bold text-slate-700">{residualTargetLabel[key] || key}</span>
                    <span className="text-sm font-bold text-slate-950">{asCount(value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Origem da mitigacao</p>
              <div className="mt-3 space-y-2">
                {sourceEntries.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-500">Sem fontes ativas no modo oficial.</p>
                ) : sourceEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                    <span className="text-xs font-bold text-slate-700">{residualSourceLabel[key] || key}</span>
                    <span className="text-sm font-bold text-slate-950">{asCount(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FrameworkMaturityStrip({ maturity }: { maturity?: ProgramOverview["signals"]["maturity"] }) {
  const frameworks = (maturity?.frameworks || [])
    .filter((item) => item.total_controls > 0)
    .sort((a, b) => b.attention_count - a.attention_count || a.score - b.score)
    .slice(0, 4);

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase text-sky-700">
            <FileCheck2 className="h-3.5 w-3.5" />
            Avaliação transversal
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-950">Postura por framework</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
            A etapa Avaliar olha para todas as frameworks em âmbito e prioriza as que ainda têm controlos por avaliar,
            avaliações por iniciar ou score abaixo do limiar saudável.
          </p>
        </div>
        <Link
          to="/maturity"
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase text-slate-600 hover:border-sky-200 hover:text-sky-700"
        >
          Abrir maturidade <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {frameworks.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
          Ainda não existem frameworks com controlos ativos para avaliar.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {frameworks.map((item) => {
            const score = Math.round(Number(item.score || 0));
            const scoreTone =
              score >= 80
                ? "text-emerald-700"
                : score >= 50
                  ? "text-amber-700"
                  : "text-red-700";
            return (
              <Link
                key={item.framework.id}
                to={`/maturity?framework=${item.framework.id}`}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-sky-200 hover:bg-sky-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">
                      {item.framework.code} {item.framework.version || ""}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.framework.name}</p>
                  </div>
                  <span className={`text-2xl font-bold ${scoreTone}`}>{score}%</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={score >= 80 ? "h-full bg-emerald-500" : score >= 50 ? "h-full bg-amber-500" : "h-full bg-red-500"}
                    style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                  <span>{formatCount(item.total_controls)} controlos</span>
                  <span>{formatCount(item.controls_without_assessment)} sem avaliação</span>
                  <span>{formatCount(item.not_started)} por iniciar</span>
                  <span>{formatCount(item.attention_count)} em atenção</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProgramStageRibbon({
  payload,
  selectedStageId,
  onSelectStage,
}: {
  payload: ProgramOverview | null;
  selectedStageId: string | null;
  onSelectStage: (stageId: string) => void;
}) {
  if (!payload) {
    return (
      <section className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
        A espinha de programa ainda não ficou disponível nesta leitura. A vista operacional continua acessível.
      </section>
    );
  }

  const focusId = payload.current_focus?.id;

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase text-indigo-700">
            <Rocket className="h-3.5 w-3.5" />
            Ciclo de programa do CISO
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-950">Fio condutor de trabalho</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
            Cada etapa é calculada a partir dos dados reais: entrada de ativos, postura por framework, risco, evidência,
            exceções e decisões. A etapa destacada é a próxima melhor área de foco.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase text-slate-400">Foco atual</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{payload.current_focus?.label || "Programa controlado"}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {payload.next_action ? payload.next_action.title : "Sem ações pendentes com prioridade."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {payload.stages.map((stage) => {
          const isFocus = stage.id === focusId;
          const isSelected = stage.id === selectedStageId;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelectStage(stage.id)}
              className={`group block rounded-2xl border p-4 text-left transition-all ${
                isSelected
                  ? "border-indigo-200 bg-indigo-50 shadow-sm"
                  : isFocus
                    ? "border-amber-200 bg-amber-50 shadow-sm"
                  : stage.status === "complete"
                    ? "border-emerald-100 bg-white hover:border-emerald-200"
                    : "border-slate-100 bg-slate-50 hover:border-indigo-200 hover:bg-indigo-50/60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Etapa {stage.order}</p>
                  <h3 className="mt-1 text-sm font-bold text-slate-950">{stage.label}</h3>
                </div>
                {isSelected ? (
                  <Target className="h-5 w-5 text-indigo-600" />
                ) : stage.status === "complete" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : isFocus ? (
                  <Target className="h-5 w-5 text-amber-600" />
                ) : (
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${programStatusTone[stage.status]}`}>
                    {programStatusLabel[stage.status]}
                  </span>
                )}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full ${
                    isSelected ? "bg-indigo-600" : stage.status === "complete" ? "bg-emerald-500" : isFocus ? "bg-amber-500" : "bg-amber-500"
                  }`}
                  style={{ width: formatPercent(stage.completeness) }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700">{formatPercent(stage.completeness)}</span>
                <span className="text-xs font-semibold text-slate-500">
                  {stage.attention_count > 0 ? `${formatCount(stage.attention_count)} item(ns)` : "Sem bloqueios"}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{stage.summary}</p>
              {(isSelected || isFocus) && (
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
                  {isSelected ? "Ações filtradas abaixo" : stage.primary_action_label}
                  {isFocus && !isSelected && <ArrowRight className="h-3.5 w-3.5" />}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProgramActionQueue({
  payload,
  selectedStageId,
  onClearStage,
}: {
  payload: ProgramOverview | null;
  selectedStageId: string | null;
  onClearStage: () => void;
}) {
  const allActions = payload?.next_actions || [];
  const selectedStage = payload?.stages.find((stage) => stage.id === selectedStageId) || null;
  const actions = selectedStageId ? allActions.filter((item) => item.stage === selectedStageId) : allActions;
  const nextAction = actions[0] || (selectedStageId ? null : payload?.next_action);

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">
            <Sparkles className="h-3.5 w-3.5" />
            Próxima melhor ação
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-950">Sequência de trabalho</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
            {selectedStage
              ? `A mostrar ações da etapa ${selectedStage.label}.`
              : "A lista é ordenada por etapa bloqueante, severidade e volume. Cada ação abre a página certa já no ponto de trabalho."}
          </p>
        </div>
        {(nextAction || selectedStage) && (
          <div className="flex flex-wrap gap-2">
            {selectedStage && (
              <button
                type="button"
                onClick={onClearStage}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
              >
                Ver todas
              </button>
            )}
            {nextAction && (
              <Link
                to={nextAction.href}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase text-white hover:bg-indigo-700"
              >
                Começar pelo mais crítico <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}
      </div>

      {!payload ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
          A sequência de programa não ficou disponível nesta leitura.
        </p>
      ) : actions.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-sm font-bold text-emerald-800">
          {selectedStage
            ? `A etapa ${selectedStage.label} não tem ações bloqueantes neste momento.`
            : "Sem ações bloqueantes neste momento. Mantém a vigilância em drift e evidências."}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {actions.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/60 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                    {item.stage_label}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${workbenchSeverityTone[item.severity]}`}>
                    {workbenchSeverityLabel[item.severity] || item.severity}
                  </span>
                </div>
                <h3 className="mt-3 line-clamp-1 text-sm font-bold text-slate-950">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{item.description}</p>
                {item.decision_rationale && (
                  <p className="mt-3 rounded-xl border border-white bg-white px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600">
                    <span className="font-bold text-slate-900">Porquê: </span>
                    {item.decision_rationale}
                    {item.traceability_target?.label && (
                      <span className="mt-2 block text-[11px] font-bold text-indigo-700">
                        Exemplo rastreável: {item.traceability_target.label}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-3 md:min-w-48">
                <div>
                  <p className="text-2xl font-bold text-slate-950">{formatCount(item.count)}</p>
                  <p className="text-[10px] font-bold uppercase text-slate-400">registos</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={item.href}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-indigo-700"
                  >
                    {item.action_label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  {item.traceability_href && (
                    <Link
                      to={item.traceability_href}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                    >
                      {item.traceability_target ? "Ver cadeia" : "Ver porquê"}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GovernanceAttentionQueue({ payload }: { payload: WorkbenchPayload | null }) {
  const items = payload?.work_items || [];
  const orderedItems = items.slice().sort((a, b) => {
    const severityWeight: Record<WorkbenchSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (severityWeight[a.severity] ?? 5) - (severityWeight[b.severity] ?? 5);
  });

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Dashboard de decisao GRC
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-950">Fila de atencao do CISO</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
            Lacunas calculadas diretamente da BD: mappings por validar, controlos sem mecanismos, evidencias vencidas,
            excecoes e documentos que afetam a rastreabilidade da postura.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Atencao</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{formatCount(payload?.metrics.total_attention)}</p>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">Por validar</p>
            <p className="mt-1 text-2xl font-bold text-orange-700">{formatCount(payload?.metrics.pending_review)}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Sem mecanismo</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{formatCount(payload?.metrics.controls_without_mechanisms)}</p>
          </div>
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-600">Evid. vencidas</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{formatCount(payload?.metrics.expired_evidence)}</p>
          </div>
        </div>
      </div>

      {!payload ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
          A fila de governação não ficou disponível nesta leitura. O restante Mission Control continua operacional.
        </div>
      ) : orderedItems.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-sm font-bold text-emerald-800">
          Sem lacunas operacionais relevantes para decisão neste momento.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {orderedItems.slice(0, 8).map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/60 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${workbenchSeverityTone[item.severity]}`}>
                    {workbenchSeverityLabel[item.severity] || item.severity}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {item.category}
                  </span>
                </div>
                <h3 className="mt-3 line-clamp-1 text-sm font-bold text-slate-950">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{item.description}</p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 md:min-w-44">
                <div>
                  <p className="text-2xl font-bold text-slate-950">{formatCount(item.count)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">registos</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-indigo-600 group-hover:text-indigo-800">
                  {item.action_label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-20 animate-pulse rounded-3xl bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-96 animate-pulse rounded-3xl bg-slate-100 lg:col-span-2" />
        <div className="h-96 animate-pulse rounded-3xl bg-slate-100" />
      </div>
    </div>
  );
}

function RecommendationList({
  items,
  emptyMessage,
}: {
  items: AssistantHistoryEntry[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      {items
        .slice()
        .sort((a, b) => recommendationPriorityScore(b) - recommendationPriorityScore(a))
        .map((item) => {
          const focus = recommendationFocus(item);
          return (
        <Link
          key={item.id}
          to={`/recommendation-history?id=${encodeURIComponent(item.id)}`}
          className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/60"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {taskTypeLabel[item.task_type || ""] || item.task_type || "Assistente"}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {new Date(item.created_at).toLocaleDateString("pt-PT")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {recommendationContextBadge(item) && (
              <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                {recommendationContextBadge(item)}
              </span>
            )}
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${focus.className}`}>
              {focus.label}
            </span>
            {typeof item.confidence === "number" && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Confianca {Math.round(item.confidence * 100)}%
              </span>
            )}
          </div>
          <p className="mt-3 line-clamp-2 text-sm font-bold text-slate-900">{item.question}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">
              {item.used_rag ? "Com RAG" : "Sem RAG"}
              {item.filters_json?.policy_id ? " | politica ligada" : ""}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600">
              Rever <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>
          );
        })}
    </>
  );
}

function AssistantDecisionList({
  items,
  emptyMessage,
}: {
  items: DecisionRecord[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      {items.map((decision) => (
        <Link
          key={decision.id}
          to={`/decision-records?id=${encodeURIComponent(decision.id)}`}
          className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/60"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {decisionLabel[decision.decision] || decision.decision}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {decision.decided_at ? new Date(decision.decided_at).toLocaleDateString("pt-PT") : "--"}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-900">{decision.title}</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{decision.justification}</p>
        </Link>
      ))}
    </>
  );
}

function LatestDecisionList({ items }: { items: DecisionRecord[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
        Ainda nao existem decisoes humanas registadas.
      </p>
    );
  }

  return (
    <>
      {items.map((decision) => (
        <div key={decision.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {decisionLabel[decision.decision] || decision.decision}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {decision.decided_at ? new Date(decision.decided_at).toLocaleDateString("pt-PT") : "--"}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-900">{decision.title}</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{decision.justification}</p>
        </div>
      ))}
    </>
  );
}

function MechanismActionList({
  items,
  generating,
  onGenerate,
}: {
  items: GovernanceAction[];
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
            <Wrench className="h-3.5 w-3.5" />
            Implementacao de mecanismos
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-950">Tarefas e prazos dos mecanismos</h2>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
            Tarefas reais gravadas na BD e mapeadas ao mecanismo por target_type=mechanism. Estas tarefas alimentam o estado operacional usado no score.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
          Gerar tarefas em falta
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-bold text-slate-900">Ainda nao existem tarefas ativas mapeadas a mecanismos.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Usa o botao para criar um plano operacional inicial por mecanismo, sem inventar dados no frontend.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {items.slice(0, 8).map((action) => {
            const days = daysUntil(action.due_date);
            const isLate = typeof days === "number" && days < 0;
            return (
              <Link
                key={action.id}
                to={action.target_id ? `/governance/mechanisms/${action.target_id}` : "/governance/action-plan"}
                className={`block rounded-2xl border p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/50 ${
                  isLate ? "border-red-100 bg-red-50/60" : "border-slate-100 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${actionPriorityTone(action.priority)}`}>
                    {actionPriorityLabel[action.priority] || action.priority}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${actionStatusTone(action.status)}`}>
                    {actionStatusLabel[action.status] || action.status}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    isLate ? "bg-red-600 text-white" : "bg-white text-slate-500"
                  }`}>
                    {dueLabel(action.due_date)}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-bold text-slate-950">{action.title}</p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">
                  {action.target_label || "Mecanismo sem label"} {action.owner ? `| Owner: ${action.owner}` : ""}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Prazo: {action.due_date ? new Date(`${action.due_date}T00:00:00`).toLocaleDateString("pt-PT") : "--"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600">
                    Abrir mecanismo <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DecisionSupportSidebar({
  data,
  metrics,
  mode,
}: {
  data: LoadState;
  metrics: MissionMetrics;
  mode: "executive" | "operational";
}) {
  const compact = mode === "operational";
  const titleClass = compact ? "text-lg" : "text-xl";
  const cardHeaderClass = compact
    ? "flex items-center justify-between gap-3"
    : "flex items-center justify-between gap-3 border-b border-slate-100 pb-5";
  const cardBodyClass = compact ? "mt-5 space-y-3" : "mt-5 space-y-3";

  return (
    <aside className="space-y-6">
      {compact && (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Acoes rapidas</h2>
          <div className="mt-5 grid gap-3">
            <Link to={buildVulnerabilityOccurrenceUrl({ status: "Open" })} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
              Ocorrencias abertas <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/compliance-gaps" className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
              Desvios de conformidade <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/ciso-assistant" className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
              Assistente Virtual CISO <Bot className="h-4 w-4" />
            </Link>
            <Link to="/onboarding" className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
              Configuracao inicial <Rocket className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-[2rem] border border-violet-100 bg-violet-50 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-violet-100 pb-5">
          <div>
            {!compact && <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">Politicas</p>}
            <h2 className={`${titleClass} font-bold text-slate-950`}>Gaps IA por validar</h2>
          </div>
          <Sparkles className="h-5 w-5 text-violet-500" />
        </div>
        <div className={cardBodyClass}>
          <RecommendationList
            items={data.policyAdviceRecommendations}
            emptyMessage="Nao existem analises IA de politicas pendentes."
          />
        </div>
        <Link
          to="/recommendation-history?context=policy_advice"
          className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700 hover:text-violet-900"
        >
          {compact ? "Ver historico" : "Ver historico de analises"} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className={cardHeaderClass}>
          <div>
            {!compact && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Assistente</p>}
            <h2 className={`${titleClass} font-bold text-slate-950`}>Recomendacoes por converter</h2>
          </div>
          <Bot className="h-5 w-5 text-slate-300" />
        </div>
        <div className={cardBodyClass}>
          <RecommendationList
            items={metrics.generalRecommendations}
            emptyMessage={compact ? "Nao existem recomendacoes pendentes neste momento." : "Nao existem recomendacoes pendentes para validacao humana."}
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className={cardHeaderClass}>
          <div>
            {!compact && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Governacao</p>}
            <h2 className={`${titleClass} font-bold text-slate-950`}>Decisoes vindas do assistente</h2>
          </div>
          <FileCheck2 className="h-5 w-5 text-slate-300" />
        </div>
        <div className={cardBodyClass}>
          <AssistantDecisionList
            items={metrics.assistantDecisions}
            emptyMessage={compact ? "Ainda nao ha decisoes convertidas a partir de recomendacoes." : "Ainda nao existem decisoes formalizadas a partir do assistente."}
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className={cardHeaderClass}>
          <div>
            {!compact && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Governacao</p>}
            <h2 className={`${titleClass} font-bold text-slate-950`}>Ultimas decisoes</h2>
          </div>
          <FileCheck2 className="h-5 w-5 text-slate-300" />
        </div>
        <div className={cardBodyClass}>
          <LatestDecisionList items={data.decisions} />
        </div>
      </div>
    </aside>
  );
}

function GovernanceRiskPanels({
  data,
  metrics,
  generatingMechanismTasks,
  onGenerateMechanismTasks,
}: {
  data: LoadState;
  metrics: MissionMetrics;
  generatingMechanismTasks: boolean;
  onGenerateMechanismTasks: () => void;
}) {
  return (
    <>
      <ResidualRiskOverviewPanel overview={data.residualRisk} />
      <GovernanceAttentionQueue payload={data.governanceWorkbench} />
      <MechanismActionList
        items={metrics.openMechanismActions}
        generating={generatingMechanismTasks}
        onGenerate={onGenerateMechanismTasks}
      />
    </>
  );
}

export default function MissionControl() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<LoadState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [generatingMechanismTasks, setGeneratingMechanismTasks] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedProgramStage, setSelectedProgramStage] = useState<string | null>(null);
  const requestedMode = searchParams.get("mode");
  const dashboardMode =
    requestedMode === "program" || requestedMode === "executive" || requestedMode === "operational"
      ? requestedMode
      : "program";

  useEffect(() => {
    localStorage.setItem("view_mode", dashboardMode);
  }, [dashboardMode]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        assetsRes,
        occRes,
        prioritiesRes,
        complianceRes,
        decisionsRes,
        mechanismActionsRes,
        recommendationsRes,
        policyAdviceRes,
        residualRiskRes,
        workbenchRes,
        programRes,
      ] = await Promise.allSettled([
        riskApi.listAssets({ page_size: 10000 }),
        riskApi.listVulnerabilityOccurrences({ page_size: 100000 }),
        riskApi.listPrioritizedVulnerabilities({ limit: 6 }),
        governanceApi.getComplianceSummary(),
        governanceApi.listDecisionRecords({ page_size: 5, ordering: "-decided_at" }),
        governanceApi.listGovernanceActions({ target_type: "mechanism", page_size: 1000, ordering: "due_date" }),
        chatApi.listHistory({ page_size: 10, converted: false }),
        chatApi.listHistory({ page_size: 5, converted: false, context: "policy_advice" }),
        governanceApi.getResidualRiskOverview("official"),
        request<WorkbenchPayload>("/api/governance/workbench/overview/"),
        request<ProgramOverview>("/api/governance/program/overview/"),
      ]);

      setData({
        assets: assetsRes.status === "fulfilled" ? assetsRes.value.results || [] : [],
        occurrences: occRes.status === "fulfilled" ? occRes.value.results || [] : [],
        priorities: prioritiesRes.status === "fulfilled" ? prioritiesRes.value || [] : [],
        compliance: complianceRes.status === "fulfilled" ? complianceRes.value : null,
        decisions: decisionsRes.status === "fulfilled" ? decisionsRes.value.results || [] : [],
        mechanismActions: mechanismActionsRes.status === "fulfilled" ? mechanismActionsRes.value.results || [] : [],
        recommendations: recommendationsRes.status === "fulfilled" ? recommendationsRes.value.results || [] : [],
        policyAdviceRecommendations: policyAdviceRes.status === "fulfilled" ? policyAdviceRes.value.results || [] : [],
        residualRisk: residualRiskRes.status === "fulfilled" ? (residualRiskRes.value as Record<string, unknown>) : null,
        governanceWorkbench: workbenchRes.status === "fulfilled" ? workbenchRes.value : null,
        programOverview: programRes.status === "fulfilled" ? programRes.value : null,
      });
      setLastUpdated(new Date());
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar o painel do CISO.");
    } finally {
      setLoading(false);
    }
  };

  const generateMechanismTasks = async () => {
    setGeneratingMechanismTasks(true);
    setTaskMessage(null);
    setError(null);
    try {
      const result = await governanceApi.generateMechanismTasks("CISO");
      setTaskMessage(`${result.created} tarefa(s) criadas, ${result.updated} atualizada(s) e ${result.skipped} mecanismo(s)/tarefa(s) ignorados por ja terem plano ativo.`);
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Nao foi possivel gerar tarefas para os mecanismos.");
    } finally {
      setGeneratingMechanismTasks(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const metrics = useMemo<MissionMetrics>(() => {
    const active = data.occurrences.filter((item) => item.status === "Open" || item.status === "In remediation");
    const critical = active.filter((item) => item.severity === "Critical").length;
    const high = active.filter((item) => item.severity === "High").length;
    const acceptedOrClosed = data.occurrences.filter((item) =>
      ["Resolved", "Mitigated", "Accepted risk", "False positive"].includes(item.status)
    ).length;
    const assistantDecisions = data.decisions.filter((item) => item.decision_type === "assistant_recommendation");
    const generalRecommendations = data.recommendations.filter((item) => !isPolicyAdviceRecommendation(item));
    const openMechanismActions = data.mechanismActions
      .filter((item) => !["done", "cancelled"].includes(item.status))
      .slice()
      .sort((a, b) => {
        const aDue = a.due_date ? new Date(`${a.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_date ? new Date(`${b.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;
        const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (priorityWeight[a.priority] ?? 4) - (priorityWeight[b.priority] ?? 4);
      });
    const overdueMechanismActions = openMechanismActions.filter((item) => {
      const days = daysUntil(item.due_date);
      return typeof days === "number" && days < 0;
    });
    const dueSoonMechanismActions = openMechanismActions.filter((item) => {
      const days = daysUntil(item.due_date);
      return typeof days === "number" && days >= 0 && days <= 7;
    });
    const residualRiskLinks = asCount(data.residualRisk?.total_links);
    const residualRiskOfficialLinks = asCount(data.residualRisk?.approved);
    const residualRiskPending = asCount(data.residualRisk?.pending_review) + asCount(data.residualRisk?.draft);

    return {
      active,
      critical,
      high,
      acceptedOrClosed,
      topPriority: data.priorities[0],
      complianceScore: data.compliance?.score ?? 0,
      missingControls: data.compliance?.missing ?? 0,
      assistantDecisions,
      pendingRecommendations: generalRecommendations.length,
      pendingPolicyAdvice: data.policyAdviceRecommendations.length,
      generalRecommendations,
      openMechanismActions,
      overdueMechanismActions,
      dueSoonMechanismActions,
      blockedMechanismActions: openMechanismActions.filter((item) => item.status === "blocked"),
      residualRiskLinks,
      residualRiskOfficialLinks,
      residualRiskPending,
    };
  }, [data]);

  useEffect(() => {
    if (!data.programOverview) return;
    if (selectedProgramStage === "all") return;
    const selectedStillExists = data.programOverview.stages.some((stage) => stage.id === selectedProgramStage);
    if (!selectedStillExists) {
      setSelectedProgramStage(data.programOverview.current_focus?.id || null);
    }
  }, [data.programOverview, selectedProgramStage]);

  if (loading) return <LoadingPanel />;

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-bold">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar o painel
          </div>
          <p className="mt-2 text-sm font-medium">{error}</p>
          <button onClick={loadData} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (dashboardMode === "program") {
    const program = data.programOverview;
    const completedStages = program?.stages.filter((stage) => stage.status === "complete").length || 0;
    const stageCount = program?.stages.length || 8;
    const assetSignal = program?.signals.assets;
    const riskSignal = program?.signals.risk;
    const maturitySignal = program?.signals.maturity;
    const driftSignal = program?.signals.drift;
    const activeProgramStage = selectedProgramStage === "all" ? null : selectedProgramStage;
    const worstFramework = maturitySignal?.worst_framework || null;
    const frameworksWithAttention = maturitySignal?.frameworks_with_attention || 0;
    const maturityDetail = worstFramework
      ? `${frameworksWithAttention} frameworks com atenção. Pior foco: ${worstFramework.framework.code} ${worstFramework.framework.version || ""} com ${Math.round(worstFramework.score || 0)}%.`
      : `${maturitySignal?.controls_without_assessment || 0} controlos sem avaliação e ${maturitySignal?.not_started || 0} por iniciar.`;

    return (
      <div className="mx-auto max-w-[1400px] space-y-8 pb-16">
        <header className="overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-950 p-7 text-white shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase text-indigo-100">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Home do programa
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Fio condutor do CISO</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-300">
                  A app deixa de ser um conjunto de salas soltas: calcula a etapa atual, a ação seguinte e o motivo
                  operacional com base nos dados reais da organização.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/mission-control?mode=executive"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-bold uppercase text-slate-950 transition-all hover:bg-indigo-50"
              >
                Lente executiva <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/mission-control?mode=operational"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase text-white transition-all hover:bg-white/10"
              >
                Lente operacional
              </Link>
              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase text-white transition-all hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </div>
          {lastUpdated && (
            <p className="mt-5 text-[10px] font-bold uppercase text-slate-400">
              Última atualização: {lastUpdated.toLocaleString("pt-PT")}
            </p>
          )}
        </header>

        {taskMessage && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            {taskMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label="Foco atual"
            value={program?.current_focus?.label || "A calcular"}
            detail={program?.next_action?.title || "Sem ação bloqueante neste momento."}
            tone={program?.current_focus?.status === "attention" ? "amber" : "indigo"}
            icon={Target}
          />
          <KpiCard
            label="Etapas concluídas"
            value={`${completedStages}/${stageCount}`}
            detail="Progresso da rubrica do programa, não apenas KPIs isolados."
            tone={completedStages === stageCount ? "emerald" : "slate"}
            icon={CheckCircle2}
          />
          <KpiCard
            label="Ativos por integrar"
            value={assetSignal?.onboarding_assets || 0}
            detail={`${assetSignal?.without_owner || 0} sem responsável, ${assetSignal?.without_type || 0} sem tipo e ${assetSignal?.without_valid_classification || 0} sem classificação validada.`}
            tone={(assetSignal?.onboarding_assets || 0) > 0 ? "amber" : "emerald"}
            icon={Gauge}
          />
          <KpiCard
            label="Risco a priorizar"
            value={riskSignal?.critical_high || 0}
            detail={`${riskSignal?.critical || 0} críticas e ${riskSignal?.high || 0} altas em aberto ou remediação.`}
            tone={(riskSignal?.critical || 0) > 0 ? "red" : (riskSignal?.high || 0) > 0 ? "amber" : "emerald"}
            icon={ShieldAlert}
          />
          <KpiCard
            label="Maturidade"
            value={`${Math.round(maturitySignal?.score || 0)}%`}
            detail={maturityDetail}
            tone={frameworksWithAttention > 0 ? "amber" : (maturitySignal?.score || 0) >= 80 ? "emerald" : "slate"}
            icon={FileCheck2}
          />
          <KpiCard
            label="Drift"
            value={driftSignal?.total_events || 0}
            detail={`${driftSignal?.control_regressions || 0} regressões de controlo, ${driftSignal?.new_vulnerabilities || 0} vulnerabilidades novas.`}
            tone={(driftSignal?.critical || 0) > 0 ? "red" : (driftSignal?.high || 0) > 0 ? "amber" : (driftSignal?.total_events || 0) > 0 ? "slate" : "emerald"}
            icon={AlertTriangle}
          />
        </section>

        <FrameworkMaturityStrip maturity={maturitySignal} />

        <ProgramStageRibbon
          payload={program}
          selectedStageId={activeProgramStage}
          onSelectStage={setSelectedProgramStage}
        />

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ProgramActionQueue
              payload={program}
              selectedStageId={activeProgramStage}
              onClearStage={() => setSelectedProgramStage("all")}
            />
          </div>
          <DecisionSupportSidebar data={data} metrics={metrics} mode="operational" />
        </section>

        <GovernanceRiskPanels
          data={data}
          metrics={metrics}
          generatingMechanismTasks={generatingMechanismTasks}
          onGenerateMechanismTasks={generateMechanismTasks}
        />
      </div>
    );
  }

  if (dashboardMode === "executive") {
    const urgentCount = metrics.critical + metrics.high;
    const executiveTone =
      metrics.complianceScore < 50 || metrics.critical > 0 ? "red" : urgentCount > 0 ? "amber" : "emerald";

    return (
      <div className="mx-auto max-w-[1400px] space-y-8 pb-16">
        <header className="overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-950 p-7 text-white shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-100">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Densidade executiva
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Postura de cibersegurança</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-300">
                  Visão sintética para decisão estratégica: risco atual, conformidade, exposição e decisões que exigem
                  atenção do CISO.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/mission-control?mode=operational"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-950 transition-all hover:bg-indigo-50"
              >
                Densidade operacional <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </div>
          {lastUpdated && (
            <p className="mt-5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Última atualização: {lastUpdated.toLocaleString("pt-PT")}
            </p>
          )}
        </header>

        {taskMessage && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            {taskMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label="Estado executivo"
            value={executiveTone === "red" ? "Atencao" : executiveTone === "amber" ? "Vigilancia" : "Controlado"}
            detail={`${urgentCount} vulnerabilidades criticas/altas exigem acompanhamento executivo.`}
            tone={executiveTone}
            icon={ShieldAlert}
          />
          <KpiCard
            label="Conformidade global"
            value={`${Math.round(metrics.complianceScore)}%`}
            detail={`${metrics.missingControls} controlos ainda sem evidencia suficiente.`}
            tone={metrics.complianceScore < 50 ? "red" : metrics.complianceScore < 80 ? "amber" : "emerald"}
            icon={ClipboardCheck}
          />
          <KpiCard
            label="Ativos no perimetro"
            value={data.assets.length}
            detail="Base inventariada usada para contexto de exposicao e criticidade."
            tone="indigo"
            icon={Gauge}
          />
          <KpiCard
            label="Recomendacoes IA por validar"
            value={metrics.pendingRecommendations + metrics.pendingPolicyAdvice}
            detail={`${metrics.pendingPolicyAdvice} analises de politica/gaps e ${metrics.assistantDecisions.length} decisoes vindas do assistente.`}
            tone={metrics.pendingRecommendations + metrics.pendingPolicyAdvice > 0 ? "amber" : "slate"}
            icon={Bot}
          />
          <KpiCard
            label="Tarefas de mecanismos"
            value={metrics.openMechanismActions.length}
            detail={`${metrics.overdueMechanismActions.length} em atraso e ${metrics.dueSoonMechanismActions.length} com prazo nos proximos 7 dias.`}
            tone={metrics.overdueMechanismActions.length > 0 ? "red" : metrics.dueSoonMechanismActions.length > 0 ? "amber" : "emerald"}
            icon={Wrench}
          />
          <KpiCard
            label="Risco residual"
            value={metrics.residualRiskOfficialLinks}
            detail={`${metrics.residualRiskLinks} ligacoes registadas e ${metrics.residualRiskPending} por validacao.`}
            tone={metrics.residualRiskPending > 0 ? "amber" : metrics.residualRiskOfficialLinks > 0 ? "emerald" : "slate"}
            icon={ShieldAlert}
          />
        </section>

        <GovernanceRiskPanels
          data={data}
          metrics={metrics}
          generatingMechanismTasks={generatingMechanismTasks}
          onGenerateMechanismTasks={generateMechanismTasks}
        />

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm xl:col-span-2">
            <div className="flex flex-col gap-2 border-b border-slate-100 pb-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Leitura executiva</p>
              <h2 className="text-xl font-bold text-slate-950">Resumo para decisao</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-500">Risco prioritario</p>
                <p className="mt-3 text-3xl font-bold text-red-600">{metrics.critical}</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-red-700">
                  Vulnerabilidades criticas ainda ativas.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Exposicao relevante</p>
                <p className="mt-3 text-3xl font-bold text-amber-600">{metrics.high}</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-700">
                  Vulnerabilidades altas a acompanhar.
                </p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Fila ativa</p>
                <p className="mt-3 text-3xl font-bold text-indigo-700">{metrics.active.length}</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-indigo-800">
                  Ocorrencias abertas ou em remediacao.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Proxima decisao recomendada
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-slate-950">
                    {metrics.topPriority ? `${metrics.topPriority.cve_id} em ${metrics.topPriority.asset.name}` : "Sem decisao urgente"}
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                    {metrics.topPriority
                      ? metrics.topPriority.priority_summary
                      : "Nao existem ocorrencias abertas com dados suficientes para produzir uma recomendacao prioritaria."}
                  </p>
                </div>
                {metrics.topPriority && (
                  <Link
                    to={buildVulnerabilityOccurrenceUrl({
                      assetId: metrics.topPriority.asset.id,
                      cveId: metrics.topPriority.cve_id,
                      focus: true,
                    })}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
                  >
                    Abrir decisao <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          <DecisionSupportSidebar data={data} metrics={metrics} mode="executive" />
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-16">
      <header className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard operacional
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Decisões prioritárias de hoje</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">
                Visão consolidada de risco, vulnerabilidades, conformidade e decisões humanas registadas.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/risks/prioritization"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-slate-700"
            >
              Abrir fila priorizada <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={buildVulnerabilityOccurrenceUrl({ status: "Open" })}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-700"
            >
              Ocorrências abertas
            </Link>
            <Link
              to="/mission-control?mode=executive"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950"
            >
              Densidade executiva
            </Link>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
        {lastUpdated && (
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Última atualização: {lastUpdated.toLocaleString("pt-PT")}
          </p>
        )}
      </header>

      <CisoDecisionFlow current="overview" />

      {taskMessage && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          {taskMessage}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label="Vulnerabilidades ativas"
          value={metrics.active.length}
          detail={`${metrics.critical} criticas e ${metrics.high} altas ainda exigem acompanhamento.`}
          tone={metrics.critical > 0 ? "red" : metrics.high > 0 ? "amber" : "emerald"}
          icon={ShieldAlert}
        />
        <KpiCard
          label="Ativos inventariados"
          value={data.assets.length}
          detail="Base de contexto usada para criticidade, exposicao e dependencias."
          tone="indigo"
          icon={Gauge}
        />
        <KpiCard
          label="Conformidade global"
          value={`${Math.round(metrics.complianceScore)}%`}
          detail={`${metrics.missingControls} controlos sem evidencia suficiente.`}
          tone={metrics.complianceScore < 50 ? "red" : metrics.complianceScore < 80 ? "amber" : "emerald"}
          icon={ClipboardCheck}
        />
        <KpiCard
          label="Decisoes fechadas"
          value={metrics.acceptedOrClosed}
          detail="Ocorrencias resolvidas, mitigadas, aceites ou classificadas como falso positivo."
          tone="emerald"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Recomendacoes IA por validar"
          value={metrics.pendingRecommendations + metrics.pendingPolicyAdvice}
          detail={`${metrics.pendingPolicyAdvice} analises de politica/gaps e ${metrics.assistantDecisions.length} decisoes ja formalizadas.`}
          tone={metrics.pendingRecommendations + metrics.pendingPolicyAdvice > 0 ? "amber" : "slate"}
          icon={Bot}
        />
        <KpiCard
          label="Tarefas de mecanismos"
          value={metrics.openMechanismActions.length}
          detail={`${metrics.overdueMechanismActions.length} atrasadas, ${metrics.dueSoonMechanismActions.length} com prazo curto e ${metrics.blockedMechanismActions.length} bloqueadas.`}
          tone={metrics.overdueMechanismActions.length > 0 ? "red" : metrics.dueSoonMechanismActions.length > 0 ? "amber" : "emerald"}
          icon={Wrench}
        />
      </section>

      <GovernanceRiskPanels
        data={data}
        metrics={metrics}
        generatingMechanismTasks={generatingMechanismTasks}
        onGenerateMechanismTasks={generateMechanismTasks}
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Fila de decisao</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Itens ordenados pelo motor de priorizacao contextual.
              </p>
            </div>
            <Link to="/risks/prioritization" className="text-xs font-bold uppercase tracking-wide text-indigo-600 hover:text-indigo-800">
              Abrir priorizacao
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {data.priorities.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                Nao existem ocorrencias abertas com dados suficientes para priorizacao.
              </div>
            ) : (
              data.priorities.map((item) => (
                <div key={`${item.asset.id}-${item.vulnerability_id}-${item.rank}`} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-xl bg-white px-3 py-1 text-xs font-bold text-slate-950">#{item.rank}</span>
                        <span className="rounded-xl border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                          {severityLabel[item.severity] || item.severity}
                        </span>
                        <span className="rounded-xl bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {item.cve_id}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-bold text-slate-950">{item.asset.name}</h3>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">{item.priority_summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.risk_reasons.slice(0, 2).map((reason) => (
                          <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-center">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Prioridade</span>
                        <span className={`text-2xl font-bold ${scoreTone(item.priority_score)}`}>{Math.round(item.priority_score)}</span>
                      </div>
                      <Link
                        to={buildVulnerabilityOccurrenceUrl({
                          assetId: item.asset.id,
                          cveId: item.cve_id,
                          focus: true,
                        })}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition-all hover:bg-indigo-700"
                        title="Abrir ocorrencia"
                      >
                        <ArrowRight className="h-5 w-5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DecisionSupportSidebar data={data} metrics={metrics} mode="operational" />
      </section>

      {metrics.topPriority && (
        <section className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-indigo-950">Proxima decisao recomendada</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-indigo-800">
                  {metrics.topPriority.cve_id} em {metrics.topPriority.asset.name}: {metrics.topPriority.priority_summary}
                </p>
              </div>
            </div>
            <Link
              to={buildVulnerabilityOccurrenceUrl({
                assetId: metrics.topPriority.asset.id,
                cveId: metrics.topPriority.cve_id,
                focus: true,
              })}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
            >
              Abrir ocorrencia <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
