import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  FileCheck,
  FileText,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  Wrench,
} from "lucide-react";
import {
  GovernanceEmptyState,
  GovernanceMetricCard,
  GovernancePanel,
  GovernanceStatusPill,
} from "@/components/governance/GovernancePrimitives";
import { request } from "@/lib/api";

type WorkbenchSeverity = "critical" | "high" | "medium" | "low" | "info";
type WorkbenchCategory = "validation" | "documents" | "controls" | "mechanisms" | "evidence" | "exceptions" | "scores";

type WorkbenchItem = {
  id: string;
  category: WorkbenchCategory;
  severity: WorkbenchSeverity;
  title: string;
  description: string;
  count: number;
  href: string;
  action_label: string;
};

type PolicySummary = {
  id: string;
  code: string;
  title: string;
  owner?: string;
  status?: string;
  review_date?: string | null;
};

type InternalControlSummary = {
  id: string;
  code: string;
  title: string;
  control_domain?: string;
  criticality?: string;
  status?: string;
};

type MechanismSummary = {
  id: string;
  title: string;
  mechanism_type?: string;
  description?: string;
};

type EvidenceSummary = {
  id: string;
  title: string;
  evidence_type?: string;
  status?: string;
  valid_until?: string | null;
  expired?: boolean;
};

type DocumentSummary = {
  id: string;
  title: string;
  document_type?: string;
  status?: string;
  owner?: string;
  review_date?: string | null;
};

type GovernanceExceptionSummary = {
  id: string;
  title: string;
  exception_type?: string;
  approval_status?: string;
  target_type?: string;
  target_id?: string;
  target_label?: string;
  valid_until?: string | null;
  owner?: string;
  score_impact?: number;
};

type FrameworkCoverage = {
  framework: {
    id: string;
    code: string;
    name: string;
    version?: string;
  };
  total_controls: number;
  mapped_controls: number;
  coverage: number;
};

type OperationalGap = {
  type: string;
  severity: WorkbenchSeverity;
  count: number;
  description: string;
  recommendation: string;
};

type WorkbenchPayload = {
  generated_at: string;
  totals: {
    policies: number;
    governance_documents: number;
    internal_controls: number;
    mechanisms: number;
    evidence_items: number;
    frameworks: number;
    mappings_approved: number;
    mappings_pending_review: number;
    mappings_draft: number;
    mappings_rejected: number;
    mappings_deprecated: number;
    governance_exceptions_active: number;
    governance_exceptions_pending: number;
    governance_exceptions_expired: number;
    governance_exceptions_expiring: number;
  };
  metrics: {
    total_attention: number;
    critical_categories: number;
    high_categories: number;
    pending_review: number;
    controls_without_mechanisms: number;
    expired_evidence: number;
    active_exceptions: number;
    expired_exceptions: number;
  };
  work_items: WorkbenchItem[];
  lists: {
    policies_without_controls: PolicySummary[];
    controls_without_framework: InternalControlSummary[];
    controls_without_mechanisms: InternalControlSummary[];
    mechanisms_without_evidence: MechanismSummary[];
    expired_evidence: EvidenceSummary[];
    overdue_documents: DocumentSummary[];
    governance_exceptions: GovernanceExceptionSummary[];
  };
  framework_coverage: FrameworkCoverage[];
  gaps: OperationalGap[];
};

const categoryLabel: Record<WorkbenchCategory | "all", string> = {
  all: "Tudo",
  validation: "Validação",
  documents: "Documentos",
  controls: "Controlos",
  mechanisms: "Mecanismos",
  evidence: "Evidências",
  exceptions: "Excecoes",
  scores: "Scores",
};

const severityTone: Record<WorkbenchSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
  info: "border-slate-200 bg-slate-50 text-slate-600",
};

function formatNumber(value?: number) {
  return new Intl.NumberFormat("pt-PT").format(Number(value || 0));
}

function formatPercent(value?: number) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Erro desconhecido");
}

function StatusTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <div className={`text-2xl font-black ${tone}`}>{formatNumber(value)}</div>
      <div className="mt-1 text-xs font-black uppercase text-slate-400">{label}</div>
    </div>
  );
}

function WorkbenchSectionCard({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: ElementType;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <GovernancePanel
      title={title}
      icon={Icon}
      bodyClassName="p-6"
      action={<GovernanceStatusPill>{formatNumber(count)}</GovernanceStatusPill>}
    >
      {children}
    </GovernancePanel>
  );
}

function RecordList<T>({
  records,
  total,
  empty,
  render,
}: {
  records: T[];
  total: number;
  empty: string;
  render: (record: T) => ReactNode;
}) {
  if (total === 0) {
    return <GovernanceEmptyState>{empty}</GovernanceEmptyState>;
  }

  return (
    <div className="space-y-3">
      {records.map(render)}
      {total > records.length ? (
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-400">
          A mostrar {records.length} de {formatNumber(total)} registos.
        </div>
      ) : null}
    </div>
  );
}

function WorkItemRow({ item }: { item: WorkbenchItem }) {
  return (
    <div className="grid gap-4 border-t border-slate-100 px-6 py-5 md:grid-cols-[auto_1fr_auto_auto] md:items-center">
      <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase ${severityTone[item.severity]}`}>
        {item.severity}
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-black text-slate-950">{item.title}</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-500">
            {categoryLabel[item.category]}
          </span>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-600">{item.description}</p>
      </div>
      <div className="text-right">
        <div className="text-2xl font-black text-slate-950">{formatNumber(item.count)}</div>
        <div className="text-[10px] font-black uppercase text-slate-400">registos</div>
      </div>
      <Link
        to={item.href}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black uppercase text-white transition hover:bg-indigo-700"
      >
        {item.action_label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function InlineRecord({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="block rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-indigo-200 hover:bg-indigo-50"
    >
      <div className="font-black text-slate-950">{title}</div>
      {subtitle ? <div className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</div> : null}
    </Link>
  );
}

export default function GovernanceWorkbench() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<WorkbenchCategory | "all">("all");

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await request<WorkbenchPayload>("/api/governance/workbench/overview/");
      setPayload(data);
    } catch (err) {
      setError(apiErrorMessage(err));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkbench();
  }, [loadWorkbench]);

  const visibleWorkItems = useMemo(() => {
    if (!payload) return [];
    if (activeCategory === "all") return payload.work_items;
    return payload.work_items.filter((item) => item.category === activeCategory);
  }, [activeCategory, payload]);

  const countFor = useCallback(
    (id: string) => payload?.work_items.find((item) => item.id === id)?.count ?? 0,
    [payload]
  );

  const categoryButtons: Array<WorkbenchCategory | "all"> = [
    "all",
    "validation",
    "documents",
    "controls",
    "mechanisms",
    "evidence",
    "exceptions",
    "scores",
  ];

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-indigo-700">Governação operacional</div>
            <h1 className="mt-3 text-3xl font-black text-slate-950">Governance Workbench</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Fila de trabalho do CISO calculada diretamente a partir da base de dados: validação de mappings,
              políticas, controlos, mecanismos, evidências e cobertura por framework.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadWorkbench()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black uppercase text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
            <Link
              to="/governance/mapping-review"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-5 py-3 text-sm font-black uppercase text-indigo-700 transition hover:bg-indigo-100"
            >
              <GitBranch className="h-4 w-4" />
              Validar mappings
            </Link>
            <Link
              to="/governance/action-plan"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-5 py-3 text-sm font-black uppercase text-emerald-700 transition hover:bg-emerald-100"
            >
              <ClipboardList className="h-4 w-4" />
              Plano de acoes
            </Link>
            <Link
              to="/governance/policies/wizard"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black uppercase text-white transition hover:bg-indigo-700"
            >
              <FileText className="h-4 w-4" />
              Criar política
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
          Não foi possível carregar a Workbench a partir da BD: {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <GovernanceMetricCard
          icon={ClipboardList}
          label="Itens de atenção"
          value={loading && !payload ? "..." : formatNumber(payload?.metrics.total_attention)}
          tone="text-indigo-600"
        />
        <GovernanceMetricCard
          icon={ShieldAlert}
          label="Críticos"
          value={loading && !payload ? "..." : formatNumber(payload?.metrics.critical_categories)}
          tone="text-red-600"
        />
        <GovernanceMetricCard
          icon={AlertTriangle}
          label="Altos"
          value={loading && !payload ? "..." : formatNumber(payload?.metrics.high_categories)}
          tone="text-orange-600"
        />
        <GovernanceMetricCard
          icon={GitBranch}
          label="Pending review"
          value={loading && !payload ? "..." : formatNumber(payload?.metrics.pending_review)}
          tone="text-orange-500"
        />
        <GovernanceMetricCard
          icon={Wrench}
          label="Controlos sem mecanismos"
          value={loading && !payload ? "..." : formatNumber(payload?.metrics.controls_without_mechanisms)}
          tone="text-slate-600"
        />
        <GovernanceMetricCard
          icon={FileCheck}
          label="Evidências expiradas"
          value={loading && !payload ? "..." : formatNumber(payload?.metrics.expired_evidence)}
          tone="text-rose-600"
        />
        <GovernanceMetricCard
          icon={ShieldAlert}
          label="Excecoes ativas"
          value={loading && !payload ? "..." : formatNumber(payload?.metrics.active_exceptions)}
          tone="text-amber-600"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">Fila de trabalho do CISO</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Prioridade calculada a partir de validação, documentação, mecanismos, evidências e scoring.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categoryButtons.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-xl border px-4 py-2 text-xs font-black uppercase transition ${
                    activeCategory === category
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"
                  }`}
                >
                  {categoryLabel[category]}
                </button>
              ))}
            </div>
          </div>

          {loading && !payload ? (
            <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-semibold text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              A carregar dados reais da base de dados...
            </div>
          ) : visibleWorkItems.length ? (
            <div>
              {visibleWorkItems.map((item) => (
                <WorkItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <GovernanceEmptyState>Não existem itens nesta categoria.</GovernanceEmptyState>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Estado dos mappings</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Separação entre relações oficiais, trabalho em curso e relações inativas.
                </p>
              </div>
              <GitBranch className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatusTile label="Approved" value={payload?.totals.mappings_approved ?? 0} tone="text-emerald-600" />
              <StatusTile label="Pending" value={payload?.totals.mappings_pending_review ?? 0} tone="text-orange-600" />
              <StatusTile label="Draft" value={payload?.totals.mappings_draft ?? 0} tone="text-indigo-600" />
              <StatusTile label="Rejected" value={payload?.totals.mappings_rejected ?? 0} tone="text-red-600" />
              <StatusTile label="Deprecated" value={payload?.totals.mappings_deprecated ?? 0} tone="text-slate-500" />
              <StatusTile label="Frameworks" value={payload?.totals.frameworks ?? 0} tone="text-slate-950" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Coverage por framework</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Percentagem de controlos externos com mapping aprovado para controlos internos.
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            {payload?.framework_coverage.length ? (
              <div className="space-y-3">
                {payload.framework_coverage.map((item) => (
                  <div key={item.framework.id} className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-black text-slate-950">
                          {item.framework.code} {item.framework.version}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">{item.framework.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-slate-950">{formatPercent(item.coverage)}</div>
                        <div className="text-[10px] font-black uppercase text-slate-400">
                          {formatNumber(item.mapped_controls)}/{formatNumber(item.total_controls)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-indigo-600"
                        style={{ width: `${Math.max(0, Math.min(100, item.coverage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <GovernanceEmptyState>Sem frameworks ativas para apresentar.</GovernanceEmptyState>
            )}
          </section>
        </div>
      </div>

      {payload ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <WorkbenchSectionCard
            icon={FileText}
            title="Políticas sem controlos"
            count={countFor("policies_without_controls")}
          >
            <RecordList
              records={payload.lists.policies_without_controls}
              total={countFor("policies_without_controls")}
              empty="Todas as políticas têm controlos internos associados."
              render={(policy) => (
                <InlineRecord
                  key={policy.id}
                  href={`/governance/policies/${policy.id}`}
                  title={`${policy.code} - ${policy.title}`}
                  subtitle={`Owner: ${policy.owner || "sem owner"} · Estado: ${policy.status || "-"}`}
                />
              )}
            />
          </WorkbenchSectionCard>

          <WorkbenchSectionCard
            icon={Target}
            title="Controlos sem framework oficial"
            count={countFor("controls_without_framework")}
          >
            <RecordList
              records={payload.lists.controls_without_framework}
              total={countFor("controls_without_framework")}
              empty="Todos os controlos internos ativos têm mapping aprovado para frameworks."
              render={(control) => (
                <InlineRecord
                  key={control.id}
                  href={`/governance/mapping-review?internalControl=${control.id}&type=internal_control_framework_mapping`}
                  title={`${control.code} - ${control.title}`}
                  subtitle={`${control.control_domain || "Sem domínio"} · ${control.criticality || "Sem criticidade"}`}
                />
              )}
            />
          </WorkbenchSectionCard>

          <WorkbenchSectionCard
            icon={Wrench}
            title="Mecanismos sem evidência"
            count={countFor("mechanisms_without_evidence")}
          >
            <RecordList
              records={payload.lists.mechanisms_without_evidence}
              total={countFor("mechanisms_without_evidence")}
              empty="Todos os mecanismos têm evidência real válida e aprovada."
              render={(mechanism) => (
                <InlineRecord
                  key={mechanism.id}
                  href={`/governance/mechanisms/${mechanism.id}`}
                  title={mechanism.title}
                  subtitle={mechanism.mechanism_type || mechanism.description || "Sem tipo definido"}
                />
              )}
            />
          </WorkbenchSectionCard>

          <WorkbenchSectionCard icon={FileCheck} title="Evidências expiradas" count={countFor("expired_evidence")}>
            <RecordList
              records={payload.lists.expired_evidence}
              total={countFor("expired_evidence")}
              empty="Sem evidências expiradas."
              render={(evidence) => (
                <InlineRecord
                  key={evidence.id}
                  href={`/governance/evidence/${evidence.id}`}
                  title={evidence.title}
                  subtitle={`${evidence.evidence_type || "Tipo não definido"} · validade: ${formatDate(evidence.valid_until)}`}
                />
              )}
            />
          </WorkbenchSectionCard>

          <WorkbenchSectionCard icon={FileText} title="Documentos com revisão vencida" count={countFor("overdue_documents")}>
            <RecordList
              records={payload.lists.overdue_documents}
              total={countFor("overdue_documents")}
              empty="Sem documentos com revisão vencida."
              render={(document) => (
                <InlineRecord
                  key={document.id}
                  href={`/governance/documents/${document.id}`}
                  title={document.title}
                  subtitle={`${document.document_type || "Documento"} · revisão: ${formatDate(document.review_date)}`}
                />
              )}
            />
          </WorkbenchSectionCard>

          <WorkbenchSectionCard
            icon={ShieldAlert}
            title="Excecoes e risco aceite"
            count={
              countFor("pending_exceptions")
              + countFor("expired_exceptions")
              + countFor("expiring_exceptions")
            }
          >
            <RecordList
              records={payload.lists.governance_exceptions}
              total={
                countFor("pending_exceptions")
                + countFor("expired_exceptions")
                + countFor("expiring_exceptions")
              }
              empty="Sem excecoes pendentes, expiradas ou a expirar."
              render={(item) => (
                <InlineRecord
                  key={item.id}
                  href="/governance/exceptions"
                  title={item.title}
                  subtitle={`${item.approval_status || "-"} · ${item.target_label || item.target_id || "-"} · validade: ${formatDate(item.valid_until)}`}
                />
              )}
            />
          </WorkbenchSectionCard>

          <WorkbenchSectionCard icon={ShieldAlert} title="Gaps operacionais" count={payload.gaps.length}>
            {payload.gaps.length ? (
              <div className="space-y-3">
                {payload.gaps.map((gap) => (
                  <div key={gap.type} className={`rounded-xl border p-4 ${severityTone[gap.severity]}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-black">{gap.description}</div>
                        <div className="mt-1 text-sm font-semibold opacity-80">{gap.recommendation}</div>
                      </div>
                      <span className="text-xl font-black">{formatNumber(gap.count)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <GovernanceEmptyState>Sem gaps operacionais devolvidos pela BD.</GovernanceEmptyState>
            )}
          </WorkbenchSectionCard>
        </div>
      ) : null}

      {payload ? (
        <div className="text-right text-xs font-semibold text-slate-400">
          Última atualização: {new Date(payload.generated_at).toLocaleString("pt-PT")}
        </div>
      ) : null}
    </div>
  );
}
