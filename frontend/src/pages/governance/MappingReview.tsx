/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileSearch,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  mappingReviewApi,
  type MappingKind,
  type MappingRecord,
  type SearchOption,
  type TraceabilityPayload,
  type ValidationStatus,
} from "@/lib/mappingReviewApi";
import {
  GovernanceEmptyState,
  MappingSourceBadge as SourceBadge,
  MappingStatusBadge as StatusBadge,
} from "@/components/governance/GovernancePrimitives";
import {
  mappingSourceLabel as sourceLabel,
  mappingStatusLabel as statusLabel,
} from "@/components/governance/governanceMappingLabels";

type MatrixKind = MappingKind | "framework_internal_control";

type Filters = {
  validation_status: string;
  mapping_source: string;
  domain: string;
  framework: string;
  frameworkControl: string;
  policy: string;
  document: string;
  internalControl: string;
  mechanism: string;
  evidence: string;
  search: string;
  includeInactive: boolean;
};

const mappingKinds: Array<{ key: MatrixKind; label: string; description: string }> = [
  { key: "policy_internal_control", label: "Politica interna x Controlo interno", description: "Politicas POL ligadas ao catalogo IC." },
  { key: "governance_document_control", label: "Documento interno x Controlo interno", description: "Documentos DOC e controlos IC." },
  { key: "internal_control_framework_mapping", label: "Controlo interno x Controlo externo", description: "IC mapeado para requisitos EXT de frameworks." },
  { key: "internal_control_mechanism", label: "Controlo interno x Mecanismo", description: "IC suportado por mecanismo reutilizável." },
  { key: "evidence_link", label: "Evidência x entidades", description: "Evidências reutilizadas por contexto." },
  { key: "framework_internal_control", label: "Framework externa x Controlo interno", description: "Vista inversa por framework externa." },
];

const editableKinds: MappingKind[] = [
  "policy_internal_control",
  "governance_document_control",
  "internal_control_framework_mapping",
  "internal_control_mechanism",
  "evidence_link",
];

type EvidenceTargetType =
  | "internal_control"
  | "mechanism"
  | "governance_document"
  | "runbook_step"
  | "framework_control"
  | "policy"
  | "risk"
  | "asset"
  | "vulnerability"
  | "finding"
  | "improvement_action";

type AutocompleteEntityType =
  | "policy"
  | "governance_document"
  | "internal_control"
  | "framework"
  | "framework_control"
  | "mechanism"
  | "evidence_item"
  | "runbook_step"
  | "risk"
  | "asset"
  | "vulnerability"
  | "finding"
  | "improvement_action";

const evidenceTargetOptions: Array<{ value: EvidenceTargetType; label: string }> = [
  { value: "internal_control", label: "Internal control" },
  { value: "mechanism", label: "Mecanismo" },
  { value: "governance_document", label: "Governance document" },
  { value: "runbook_step", label: "Runbook step" },
  { value: "framework_control", label: "Controlo externo" },
  { value: "policy", label: "Política" },
  { value: "risk", label: "Risk" },
  { value: "asset", label: "Asset" },
  { value: "vulnerability", label: "Vulnerability" },
  { value: "finding", label: "Finding" },
  { value: "improvement_action", label: "Improvement action" },
];

const emptyFilters: Filters = {
  validation_status: "",
  mapping_source: "",
  domain: "",
  framework: "",
  frameworkControl: "",
  policy: "",
  document: "",
  internalControl: "",
  mechanism: "",
  evidence: "",
  search: "",
  includeInactive: false,
};

function entityTypeLabel(type: AutocompleteEntityType) {
  const labels: Record<AutocompleteEntityType, string> = {
    policy: "Politica interna",
    governance_document: "Documento interno",
    internal_control: "Controlo interno IC",
    framework: "Framework externa",
    framework_control: "Controlo externo EXT",
    mechanism: "Mecanismo",
    evidence_item: "Evidência",
    runbook_step: "Runbook step",
    risk: "Risco",
    asset: "Ativo",
    vulnerability: "Vulnerabilidade",
    finding: "Finding",
    improvement_action: "Acao de melhoria",
  };
  return labels[type];
}

function mappingEntityTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    policy: "POL · política interna",
    governance_document: "DOC · documento interno",
    internal_control: "IC · controlo interno",
    framework: "FW · framework externa",
    framework_control: "EXT · controlo externo",
    mechanism: "MEC · mecanismo",
    evidence_item: "EV · evidência",
    runbook_step: "RUN · runbook step",
  };
  return labels[type || ""] || type || "-";
}

function searchEntityOptions(type: AutocompleteEntityType, query: string, context?: { frameworkId?: string }) {
  if (type === "policy") return mappingReviewApi.searchPolicies(query);
  if (type === "governance_document") return mappingReviewApi.searchGovernanceDocuments(query);
  if (type === "internal_control") return mappingReviewApi.searchInternalControls(query);
  if (type === "framework") return mappingReviewApi.searchFrameworks(query);
  if (type === "framework_control") return mappingReviewApi.searchFrameworkControls(query, context?.frameworkId);
  if (type === "mechanism") return mappingReviewApi.searchMechanisms(query);
  if (type === "evidence_item") return mappingReviewApi.searchEvidenceItems(query);
  if (type === "runbook_step") return mappingReviewApi.searchRunbookSteps(query);
  if (type === "risk") return mappingReviewApi.searchRisks(query);
  if (type === "asset") return mappingReviewApi.searchAssets(query);
  if (type === "vulnerability") return mappingReviewApi.searchVulnerabilities(query);
  if (type === "finding") return mappingReviewApi.searchFindings(query);
  return mappingReviewApi.searchImprovementActions(query);
}

function targetTypeToEntityType(type: EvidenceTargetType): AutocompleteEntityType {
  return type;
}

function friendlyErrorMessage(err: any, fallback: string) {
  const message = String(err?.message || "");
  if (!message || message.includes("<!DOCTYPE") || message.includes("<html")) return fallback;
  try {
    const parsed = JSON.parse(message);
    if (parsed?.detail) return String(parsed.detail);
    const firstValue = Object.values(parsed || {})[0];
    if (Array.isArray(firstValue) && firstValue.length > 0) return String(firstValue[0]);
    if (firstValue) return String(firstValue);
  } catch {
    // Keep the original plain-text message below.
  }
  return message || fallback;
}

function metricFromOverview(overview: TraceabilityPayload | null, key: string) {
  return Number(overview?.totals?.[key] || 0);
}

function KpiTile({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: ElementType;
  tone: "slate" | "indigo" | "emerald" | "amber" | "red" | "cyan";
}) {
  const tones = {
    slate: "border-slate-100 bg-slate-50 text-slate-600",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
    cyan: "border-cyan-100 bg-cyan-50 text-cyan-700",
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 min-h-8 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function MappingReviewDashboard({
  overview,
  mappings,
  gaps,
}: {
  overview: TraceabilityPayload | null;
  mappings: MappingRecord[];
  gaps: any[];
}) {
  const statusCount = (status: ValidationStatus) => mappings.filter((item) => item.validation_status === status).length;
  const overviewOrLocal = (overviewKey: string, status: ValidationStatus) => {
    const overviewValue = metricFromOverview(overview, overviewKey);
    return overviewValue || statusCount(status);
  };
  const noRationale = mappings.filter((item) => !item.rationale?.trim()).length;
  const lowConfidence = mappings.filter((item) => Number(item.confidence_score || 0) > 0 && Number(item.confidence_score) < 50).length;
  const mechanismWithoutEvidence = overview?.relationships?.mechanisms_without_evidence?.length || 0;
  const internalWithoutMechanisms = overview?.relationships?.internal_controls_without_mechanisms?.length || 0;
  const expiredEvidence = overview?.relationships?.expired_evidence?.length || 0;
  const frameworkLowCoverage = gaps.filter((gap) => gap.type === "framework_low_coverage").length;
  const internalWithoutFramework = gaps.filter((gap) => gap.type === "internal_control_without_framework_mapping").length;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Aprovados" value={overviewOrLocal("mappings_approved", "approved")} detail="Mapeamentos validados para uso oficial." icon={CheckCircle2} tone="emerald" />
        <KpiTile label="Pendentes de revisão" value={overviewOrLocal("mappings_pending_review", "pending_review")} detail="Fila de validação humana." icon={ClipboardCheck} tone="amber" />
        <KpiTile label="Rejeitados" value={overviewOrLocal("mappings_rejected", "rejected")} detail="Mapeamentos rejeitados, fora do cálculo." icon={XCircle} tone="red" />
        <KpiTile label="Descontinuados" value={overviewOrLocal("mappings_deprecated", "deprecated")} detail="Mapeamentos descontinuados." icon={Trash2} tone="slate" />
        <KpiTile label="Rascunhos" value={overviewOrLocal("mappings_draft", "draft")} detail="Ainda sem validação formal." icon={Pencil} tone="indigo" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiTile label="Sem justificação" value={noRationale} detail="Precisam de justificação." icon={FileSearch} tone="amber" />
        <KpiTile label="Baixa confiança" value={lowConfidence} detail="Confiança abaixo de 50%." icon={AlertTriangle} tone="red" />
        <KpiTile label="Mecanismos sem evidência" value={mechanismWithoutEvidence} detail="Implementação sem suporte documental." icon={Link2} tone="amber" />
        <KpiTile label="Controlos sem mecanismo" value={internalWithoutMechanisms} detail="Controlo interno sem implementação." icon={Network} tone="red" />
        <KpiTile label="Sem framework mapping" value={internalWithoutFramework} detail="Sem impacto externo rastreavel." icon={Layers3} tone="cyan" />
        <KpiTile label="Evidências expiradas" value={expiredEvidence} detail="Não contam para score oficial." icon={AlertTriangle} tone="red" />
      </div>

      {frameworkLowCoverage > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Existem {frameworkLowCoverage} frameworks com baixa cobertura. Revê os mapeamentos Controlo interno x Controlo externo.
        </div>
      )}
    </section>
  );
}

function MappingFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const update = (key: keyof Filters, value: string | boolean) => onChange({ ...filters, [key]: value });

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros da matriz
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Estado
          <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" value={filters.validation_status} onChange={(event) => update("validation_status", event.target.value)}>
            <option value="">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="pending_review">Pendente de revisão</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Rejeitado</option>
            <option value="deprecated">Descontinuado</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Origem
          <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" value={filters.mapping_source} onChange={(event) => update("mapping_source", event.target.value)}>
            <option value="">Todas</option>
            <option value="manual">Manual</option>
            <option value="migrated">Migrated</option>
            <option value="imported">Imported</option>
            <option value="ai_suggested">AI suggested</option>
            <option value="rule_based">Rule based</option>
            <option value="template">Template</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Domínio
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.domain} onChange={(event) => update("domain", event.target.value)} placeholder="Governance" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Framework
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.framework} onChange={(event) => update("framework", event.target.value)} placeholder="ISO, NIST..." />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Controlo externo EXT
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.frameworkControl} onChange={(event) => update("frameworkControl", event.target.value)} placeholder="ID ou código" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Política
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.policy} onChange={(event) => update("policy", event.target.value)} placeholder="POL-..." />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Documento
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.document} onChange={(event) => update("document", event.target.value)} placeholder="ID ou título" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Controlo interno IC
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.internalControl} onChange={(event) => update("internalControl", event.target.value)} placeholder="IC-..." />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Mecanismo
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.mechanism} onChange={(event) => update("mechanism", event.target.value)} placeholder="MFA, backup..." />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Evidência
          <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={filters.evidence} onChange={(event) => update("evidence", event.target.value)} placeholder="ID ou título" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500 md:col-span-2">
          Pesquisa
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold text-slate-700" value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Código, título, justificação..." />
          </div>
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <input type="checkbox" checked={filters.includeInactive} onChange={(event) => update("includeInactive", event.target.checked)} />
        Incluir rejeitados/descontinuados na matriz
      </label>
    </div>
  );
}

function MappingMatrixView({
  activeKind,
  onKindChange,
  mappings,
  filters,
  onFiltersChange,
  onOpen,
  onApprove,
  onReject,
  onDeprecate,
  contextActive = false,
  mappingCounts,
}: {
  activeKind: MatrixKind;
  onKindChange: (kind: MatrixKind) => void;
  mappings: MappingRecord[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  onOpen: (mapping: MappingRecord) => void;
  onApprove: (mapping: MappingRecord) => void;
  onReject: (mapping: MappingRecord) => void;
  onDeprecate: (mapping: MappingRecord) => void;
  contextActive?: boolean;
  mappingCounts: Record<MatrixKind, number>;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {mappingKinds.map((kind) => (
          <button
            key={kind.key}
            type="button"
            onClick={() => onKindChange(kind.key)}
            className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
              activeKind === kind.key
                ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50"
            }`}
          >
            <span className="flex items-center justify-between gap-3">
              <span>{kind.label}</span>
              <span className={`rounded-md px-2 py-0.5 text-[10px] ${activeKind === kind.key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                {mappingCounts[kind.key] || 0}
              </span>
            </span>
            <span className={`mt-1 block text-[10px] ${activeKind === kind.key ? "text-indigo-100" : "text-slate-400"}`}>{kind.description}</span>
          </button>
        ))}
      </div>

      <MappingFilters filters={filters} onChange={onFiltersChange} />

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">Matriz de mapeamentos</h2>
            <p className="text-xs font-semibold text-slate-500">{mappings.length} mapeamentos visiveis</p>
          </div>
        </div>
        {mappings.length === 0 ? (
          <MappingEmptyNotice
            title="Sem mapeamentos"
            detail={contextActive ? "Não foram encontrados mapeamentos para o contexto selecionado. Podes trocar a matriz ou limpar filtros." : "Ajusta os filtros ou cria um novo mapeamento."}
          />
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Origem mapping</th>
                  <th className="px-4 py-3">Relação</th>
                  <th className="px-4 py-3">Confiança</th>
                  <th className="px-4 py-3">Peso/Cobertura</th>
                  <th className="px-4 py-3">Justificação</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.slice(0, 300).map((mapping) => {
                  const inverted = activeKind === "framework_internal_control";
                  const sourceType = inverted ? mapping.targetType : mapping.sourceType;
                  const sourceLabel = inverted ? mapping.targetLabel : mapping.sourceLabel;
                  const targetType = inverted ? mapping.sourceType : mapping.targetType;
                  const targetLabel = inverted ? mapping.sourceLabel : mapping.targetLabel;

                  return (
                  <tr key={`${mapping.kind}-${mapping.id}`} className={mapping.validation_status === "rejected" || mapping.validation_status === "deprecated" ? "bg-slate-50 text-slate-500" : "bg-white"}>
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{mappingEntityTypeLabel(sourceType)}</div>
                      <div className="truncate font-bold text-slate-900">{sourceLabel}</div>
                    </td>
                    <td className="max-w-[300px] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{mappingEntityTypeLabel(targetType)}</div>
                      <div className="truncate font-semibold text-slate-700">{targetLabel}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={mapping.validation_status} /></td>
                    <td className="px-4 py-3"><SourceBadge source={mapping.mapping_source} /></td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{mapping.relationship_type || mapping.link_type || mapping.purpose || mapping.applicability || "-"}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700">{mapping.confidence_score ?? "-"}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700">{mapping.coverage_percentage ?? mapping.contribution_weight ?? "-"}</td>
                    <td className="max-w-[280px] px-4 py-3 text-xs font-medium text-slate-500">
                      <span className="line-clamp-2">{mapping.rationale || "Sem justificação"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                      <button type="button" title="Abrir detalhe" onClick={() => onOpen(mapping)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Aprovar" onClick={() => onApprove(mapping)} className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-600 px-2 text-white hover:bg-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Rejeitar" onClick={() => onReject(mapping)} className="inline-flex h-8 items-center justify-center rounded-lg bg-red-600 px-2 text-white hover:bg-red-700">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Descontinuar" onClick={() => onDeprecate(mapping)} className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 px-2 text-slate-600 hover:bg-slate-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function PendingMappingsQueue({
  mappings,
  onOpen,
  onApprove,
  onReject,
}: {
  mappings: MappingRecord[];
  onOpen: (mapping: MappingRecord) => void;
  onApprove: (mapping: MappingRecord) => void;
  onReject: (mapping: MappingRecord) => void;
}) {
  const grouped = useMemo(() => {
    return editableKinds.map((kind) => ({
      kind,
      items: mappings.filter((item) => item.kind === kind && item.validation_status === "pending_review"),
    }));
  }, [mappings]);

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">Fila de mapeamentos pendentes</h2>
          <p className="text-xs font-semibold text-slate-500">Validação humana agrupada por tipo de mapeamento.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        {grouped.map((group) => (
          <div key={group.kind} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{group.kind.replaceAll("_", " ")}</span>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-700">{group.items.length}</span>
            </div>
            <div className="space-y-2">
              {group.items.slice(0, 4).map((mapping) => (
                <div key={mapping.id} className="rounded-lg bg-white p-2 shadow-sm">
                  <button type="button" onClick={() => onOpen(mapping)} className="block w-full text-left text-xs font-bold text-slate-800">
                    <span className="line-clamp-1">{mapping.sourceLabel}</span>
                    <span className="line-clamp-1 text-slate-500">{mapping.targetLabel}</span>
                  </button>
                  <div className="mt-2 flex gap-1">
                    <button type="button" onClick={() => onApprove(mapping)} className="inline-flex h-7 flex-1 items-center justify-center rounded-md bg-emerald-600 text-white">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => onReject(mapping)} className="inline-flex h-7 flex-1 items-center justify-center rounded-md bg-red-600 text-white">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {group.items.length === 0 && <div className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-400">Sem pendentes.</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValidationGatePanel({
  mappings,
  onSelect,
}: {
  mappings: MappingRecord[];
  onSelect: (kind: MappingKind, status: ValidationStatus) => void;
}) {
  const rows = editableKinds.map((kind) => {
    const items = mappings.filter((mapping) => mapping.kind === kind);
    const draft = items.filter((mapping) => mapping.validation_status === "draft").length;
    const pending = items.filter((mapping) => mapping.validation_status === "pending_review").length;
    const approved = items.filter((mapping) => mapping.validation_status === "approved").length;
    return { kind, draft, pending, approved, total: items.length };
  });
  const draftTotal = rows.reduce((sum, row) => sum + row.draft, 0);
  const pendingTotal = rows.reduce((sum, row) => sum + row.pending, 0);
  const approvedTotal = rows.reduce((sum, row) => sum + row.approved, 0);

  return (
    <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Etapa explícita de validação
          </div>
          <h2 className="text-base font-bold text-amber-950">Validar mapeamentos antes do score oficial</h2>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-amber-800">
            Os assistentes criam ligações em rascunho para preservar a validação humana. Para o score oficial ser defensável, revê a justificação, confiança, cobertura/peso e aprova ou rejeita os mapeamentos críticos antes de consultar scoring e rastreabilidade.
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-900">
            Fluxo recomendado: criar entidades {"->"} validar mapeamentos {"->"} recalcular/consultar score {"->"} confirmar rastreabilidade.
          </p>
        </div>

        <div className="grid min-w-[280px] grid-cols-3 gap-2">
          <MiniFact label="Rascunho" value={draftTotal} />
          <MiniFact label="Pendentes" value={pendingTotal} />
          <MiniFact label="Aprovados" value={approvedTotal} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-amber-100 bg-white">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-amber-50 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            <tr>
              <th className="px-4 py-3">Tipo de mapping</th>
              <th className="px-4 py-3">Rascunho</th>
              <th className="px-4 py-3">Pendente de revisão</th>
              <th className="px-4 py-3">Aprovados</th>
              <th className="px-4 py-3">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-50">
            {rows.map((row) => (
              <tr key={row.kind}>
                <td className="px-4 py-3 font-bold text-slate-900">{matrixKindLabel(row.kind)}</td>
                <td className="px-4 py-3 font-bold text-slate-700">{row.draft}</td>
                <td className="px-4 py-3 font-bold text-slate-700">{row.pending}</td>
                <td className="px-4 py-3 font-bold text-slate-700">{row.approved}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(row.kind, "draft")}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-amber-200 hover:bg-amber-50"
                    >
                      Ver draft
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelect(row.kind, "pending_review")}
                      className="rounded-lg border border-amber-200 bg-amber-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-amber-900 hover:bg-amber-200"
                    >
                      Validar pendentes
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MappingDetailDrawer({
  mapping,
  saving,
  onClose,
  onSave,
  onApprove,
  onReject,
  onDeprecate,
}: {
  mapping: MappingRecord | null;
  saving: boolean;
  onClose: () => void;
  onSave: (mapping: MappingRecord, patch: Record<string, any>) => void;
  onApprove: (mapping: MappingRecord) => void;
  onReject: (mapping: MappingRecord) => void;
  onDeprecate: (mapping: MappingRecord) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [rejectRationale, setRejectRationale] = useState("");
  const [traceTarget, setTraceTarget] = useState<"source" | "target">("target");

  useEffect(() => {
    if (!mapping) return;
    setForm({
      rationale: mapping.rationale || "",
      confidence_score: mapping.confidence_score ?? "",
      relationship_type: mapping.relationship_type || "",
      coverage_percentage: mapping.coverage_percentage ?? "",
      contribution_weight: mapping.contribution_weight ?? "",
      mandatory: Boolean(mapping.mandatory),
      implementation_status: mapping.implementation_status || "",
      link_type: mapping.link_type || "",
      purpose: mapping.purpose || "",
      applicability: mapping.applicability || "",
    });
    setRejectRationale("");
    setTraceTarget("target");
  }, [mapping]);

  if (!mapping) return null;

  const savePatch: Record<string, any> = {
    rationale: form.rationale,
    confidence_score: form.confidence_score,
  };
  if (mapping.kind === "internal_control_framework_mapping") {
    savePatch.relationship_type = form.relationship_type;
    savePatch.coverage_percentage = form.coverage_percentage;
  }
  if (mapping.kind === "internal_control_mechanism") {
    savePatch.relationship_type = form.relationship_type;
    savePatch.contribution_weight = form.contribution_weight;
    savePatch.mandatory = form.mandatory;
    savePatch.implementation_status = form.implementation_status;
  }
  if (mapping.kind === "evidence_link") {
    savePatch.link_type = form.link_type;
  }
  if (mapping.kind === "governance_document_control") {
    savePatch.purpose = form.purpose;
  }
  if (mapping.kind === "policy_internal_control") {
    savePatch.applicability = form.applicability;
  }

  const selectedTraceType = traceTarget === "source" ? mapping.sourceType : mapping.targetType;
  const selectedTraceId = traceTarget === "source" ? mapping.sourceId : mapping.targetId;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Fechar detalhe" />
      <aside className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <StatusBadge status={mapping.validation_status} />
              <SourceBadge source={mapping.mapping_source} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950">{mapping.sourceLabel}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{mapping.targetLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-slate-500 lg:col-span-2">
              Justificação
              <textarea className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" value={form.rationale || ""} onChange={(event) => setForm({ ...form, rationale: event.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-500">
              Nível de confiança
              <input type="number" min={0} max={100} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={form.confidence_score ?? ""} onChange={(event) => setForm({ ...form, confidence_score: event.target.value })} />
            </label>
            {mapping.relationship_type !== undefined && (
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Relationship type
                <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={form.relationship_type || ""} onChange={(event) => setForm({ ...form, relationship_type: event.target.value })} />
              </label>
            )}
            {mapping.applicability !== undefined && (
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Applicability
                <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" value={form.applicability || ""} onChange={(event) => setForm({ ...form, applicability: event.target.value })}>
                  <option value="mandatory">Mandatory</option>
                  <option value="recommended">Recommended</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              </label>
            )}
            {mapping.purpose !== undefined && (
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Purpose
                <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" value={form.purpose || ""} onChange={(event) => setForm({ ...form, purpose: event.target.value })}>
                  <option value="defines">Defines</option>
                  <option value="implements">Implements</option>
                  <option value="operationalizes">Operationalizes</option>
                  <option value="evidences">Evidência</option>
                </select>
              </label>
            )}
            {mapping.link_type !== undefined && (
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Tipo de ligação
                <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" value={form.link_type || ""} onChange={(event) => setForm({ ...form, link_type: event.target.value })}>
                  <option value="evidences">Evidência</option>
                  <option value="supports">Supports</option>
                  <option value="validates">Valida</option>
                  <option value="demonstrates">Demonstrates</option>
                  <option value="mitigates">Mitigates</option>
                  <option value="justifies">Justifica</option>
                  <option value="produced_by">Produzida por</option>
                  <option value="required_by">Exigida por</option>
                </select>
              </label>
            )}
            {mapping.coverage_percentage !== undefined && (
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Coverage percentage
                <input type="number" min={0} max={100} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={form.coverage_percentage ?? ""} onChange={(event) => setForm({ ...form, coverage_percentage: event.target.value })} />
              </label>
            )}
            {mapping.contribution_weight !== undefined && (
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Contribution weight
                <input type="number" min={0} max={100} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700" value={form.contribution_weight ?? ""} onChange={(event) => setForm({ ...form, contribution_weight: event.target.value })} />
              </label>
            )}
            {mapping.implementation_status !== undefined && (
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Estado de implementação
                <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" value={form.implementation_status || ""} onChange={(event) => setForm({ ...form, implementation_status: event.target.value })}>
                  <option value="not_implemented">Não implementado</option>
                  <option value="planned">Planned</option>
                  <option value="partially_implemented">Partially implemented</option>
                  <option value="implemented">Implemented</option>
                  <option value="implemented_evidenced">Implementado e evidenciado</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              </label>
            )}
            {mapping.mandatory !== undefined && (
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <input type="checkbox" checked={Boolean(form.mandatory)} onChange={(event) => setForm({ ...form, mandatory: event.target.checked })} />
                Mecanismo obrigatório
              </label>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Auditoria</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs font-semibold text-slate-600 md:grid-cols-3">
              <div>Criado por: {mapping.created_by_username || "-"}</div>
              <div>Atualizado por: {mapping.updated_by_username || "-"}</div>
              <div>Validado por: {mapping.validated_by_username || "-"}</div>
              <div className="md:col-span-3">Validado em: {mapping.validated_at || "-"}</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Traceability relacionada</h3>
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button type="button" onClick={() => setTraceTarget("source")} className={`rounded-lg px-3 py-1 text-xs font-bold ${traceTarget === "source" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Origem</button>
                <button type="button" onClick={() => setTraceTarget("target")} className={`rounded-lg px-3 py-1 text-xs font-bold ${traceTarget === "target" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Destino</button>
              </div>
            </div>
            <TraceabilityPanel targetType={selectedTraceType} targetId={selectedTraceId || ""} compact />
          </div>

          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-red-700">Rejeição</h3>
            <div className="mt-2 flex gap-2">
              <input className="h-10 flex-1 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-900" value={rejectRationale} onChange={(event) => setRejectRationale(event.target.value)} placeholder="Justificação obrigatória para rejeitar" />
              <button type="button" disabled={!rejectRationale.trim() || saving} onClick={() => onReject({ ...mapping, rationale: rejectRationale })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40">
                <XCircle className="h-4 w-4" />
                Rejeitar
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={() => onSave(mapping, savePatch)} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Guardar
          </button>
          <button type="button" onClick={() => onApprove(mapping)} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">
            <ShieldCheck className="h-4 w-4" />
            Aprovar
          </button>
          <button type="button" onClick={() => onDeprecate(mapping)} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />
            Descontinuar
          </button>
        </div>
      </aside>
    </div>
  );
}

function EntityAutocomplete({
  label,
  entityType,
  value,
  onChange,
  placeholder,
  disabled = false,
  helper,
  context,
}: {
  label: string;
  entityType: AutocompleteEntityType;
  value: SearchOption | null;
  onChange: (option: SearchOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  helper?: string;
  context?: { frameworkId?: string };
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameworkContextId = context?.frameworkId;

  useEffect(() => {
    setQuery(value?.label || "");
  }, [value?.id, value?.label]);

  useEffect(() => {
    if (!open || disabled) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      searchEntityOptions(entityType, query, { frameworkId: frameworkContextId })
        .then((items) => {
          if (active) setOptions(items);
        })
        .catch((err: any) => {
          if (active) {
            setOptions([]);
            setError(err?.message || "Erro ao pesquisar.");
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query, open, disabled, entityType, frameworkContextId]);

  return (
    <div className="relative space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-slate-500">{label}</label>
        {value && (
          <span className="max-w-[240px] truncate text-[10px] font-semibold text-slate-400" title={value.id}>
            ID {value.id}
          </span>
        )}
      </div>
      <div className={`flex h-11 items-center rounded-xl border bg-white ${disabled ? "border-slate-100 bg-slate-50" : "border-slate-200 focus-within:border-indigo-400"}`}>
        <Search className="ml-3 h-4 w-4 text-slate-400" />
        <input
          className="h-full min-w-0 flex-1 rounded-xl bg-transparent px-2 text-sm font-semibold text-slate-800 outline-none disabled:text-slate-400"
          value={query}
          disabled={disabled}
          placeholder={placeholder || `Pesquisar ${entityTypeLabel(entityType)}`}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value) onChange(null);
            setOpen(true);
          }}
        />
        {loading && <Loader2 className="mr-3 h-4 w-4 animate-spin text-slate-400" />}
        {value && !loading && (
          <button
            type="button"
            className="mr-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(true);
            }}
            title="Limpar seleção"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {helper && <p className="text-[11px] font-semibold text-slate-400">{helper}</p>}
      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {error && <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
          {!error && loading && <div className="p-3 text-xs font-semibold text-slate-500">A pesquisar...</div>}
          {!error && !loading && options.length === 0 && (
            <div className="p-3 text-xs font-semibold text-slate-400">Sem resultados para esta pesquisa.</div>
          )}
          {!error && !loading && options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-indigo-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setQuery(option.label);
                setOpen(false);
              }}
            >
              <div className="line-clamp-1 text-sm font-bold text-slate-900">{option.label}</div>
              {(option.meta || option.description) && (
                <div className="mt-0.5 line-clamp-1 text-xs font-semibold text-slate-500">
                  {[option.meta, option.description].filter(Boolean).join(" - ")}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateMappingModal({
  open,
  saving,
  onClose,
  onCreate,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (kind: MappingKind, payload: Record<string, any>) => void;
}) {
  const [kind, setKind] = useState<MappingKind>("policy_internal_control");
  const [source, setSource] = useState<SearchOption | null>(null);
  const [target, setTarget] = useState<SearchOption | null>(null);
  const [framework, setFramework] = useState<SearchOption | null>(null);
  const [targetType, setTargetType] = useState<EvidenceTargetType>("mechanism");
  const [applicability, setApplicability] = useState("mandatory");
  const [purpose, setPurpose] = useState("defines");
  const [relationshipType, setRelationshipType] = useState("equivalent");
  const [coverage, setCoverage] = useState("100");
  const [contribution, setContribution] = useState("100");
  const [mandatory, setMandatory] = useState(true);
  const [implementationStatus, setImplementationStatus] = useState("not_implemented");
  const [linkType, setLinkType] = useState("evidences");
  const [rationale, setRationale] = useState("");
  const [confidence, setConfidence] = useState("50");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setSource(null);
    setTarget(null);
    setFramework(null);
    setSubmitError(null);
    if (kind === "evidence_link") setTargetType("mechanism");
    if (kind === "governance_document_control") setPurpose("defines");
    if (kind === "policy_internal_control") setApplicability("mandatory");
    if (kind === "internal_control_framework_mapping") setRelationshipType("equivalent");
    if (kind === "internal_control_mechanism") setRelationshipType("primary");
  }, [kind]);

  useEffect(() => {
    setTarget(null);
  }, [framework?.id, targetType]);

  if (!open) return null;

  const sourceEntity: AutocompleteEntityType =
    kind === "policy_internal_control" ? "policy" :
    kind === "governance_document_control" ? "governance_document" :
    kind === "evidence_link" ? "evidence_item" :
    "internal_control";

  const targetEntity: AutocompleteEntityType =
    kind === "policy_internal_control" || kind === "governance_document_control" ? "internal_control" :
    kind === "internal_control_framework_mapping" ? "framework_control" :
    kind === "internal_control_mechanism" ? "mechanism" :
    targetTypeToEntityType(targetType);

  const targetHelper = kind === "internal_control_framework_mapping" && !framework
    ? "Seleciona primeiro a framework para filtrar os controlos externos."
    : undefined;

  const buildPayload = () => {
    if (!source) return { error: "Seleciona a entidade de origem." };
    if (kind === "internal_control_framework_mapping" && !framework) return { error: "Seleciona a framework." };
    if (!target) return { error: "Seleciona a entidade de destino." };
    if (!rationale.trim()) return { error: "Indica uma justificação para o mapeamento." };

    if (kind === "policy_internal_control") {
      return {
        policy: source.id,
        internal_control: target.id,
        applicability,
        rationale,
        confidence_score: confidence,
      };
    }
    if (kind === "governance_document_control") {
      return {
        document: source.id,
        internal_control: target.id,
        purpose,
        rationale,
        confidence_score: confidence,
      };
    }
    if (kind === "internal_control_framework_mapping") {
      return {
        internal_control: source.id,
        framework_control: target.id,
        relationship_type: relationshipType,
        coverage_percentage: coverage,
        rationale,
        confidence_score: confidence,
      };
    }
    if (kind === "internal_control_mechanism") {
      return {
        internal_control: source.id,
        mechanism: target.id,
        relationship_type: relationshipType,
        contribution_weight: contribution,
        mandatory,
        implementation_status: implementationStatus,
        rationale,
        confidence_score: confidence,
      };
    }
    return {
      evidence_item: source.id,
      target_id: target.id,
      target_type: targetType,
      link_type: linkType,
      rationale,
      confidence_score: confidence,
    };
  };

  const submit = () => {
    const payload = buildPayload();
    if ("error" in payload) {
      setSubmitError(String(payload.error));
      return;
    }
    setSubmitError(null);
    onCreate(kind, payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Novo mapeamento</h2>
            <p className="text-xs font-semibold text-slate-500">Escolhe as entidades por código, título ou descrição. O ID técnico fica visível depois da seleção.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs font-bold text-slate-500 md:col-span-2">
            Tipo
            <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value={kind} onChange={(event) => setKind(event.target.value as MappingKind)}>
              {editableKinds.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
          </label>

          <EntityAutocomplete
            label={entityTypeLabel(sourceEntity)}
            entityType={sourceEntity}
            value={source}
            onChange={setSource}
          />

          {kind === "internal_control_framework_mapping" && (
            <EntityAutocomplete
              label="Framework"
              entityType="framework"
              value={framework}
              onChange={setFramework}
              helper="A lista de controlos externos fica filtrada por esta framework."
            />
          )}

          {kind === "evidence_link" && (
            <label className="space-y-1 text-xs font-bold text-slate-500">
              Tipo de alvo
              <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value={targetType} onChange={(event) => setTargetType(event.target.value as EvidenceTargetType)}>
                {evidenceTargetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}

          <EntityAutocomplete
            label={entityTypeLabel(targetEntity)}
            entityType={targetEntity}
            value={target}
            onChange={setTarget}
            disabled={kind === "internal_control_framework_mapping" && !framework}
            helper={targetHelper}
            context={{ frameworkId: framework?.id }}
          />

          {kind === "policy_internal_control" && (
            <label className="space-y-1 text-xs font-bold text-slate-500">
              Applicability
              <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value={applicability} onChange={(event) => setApplicability(event.target.value)}>
                <option value="mandatory">Mandatory</option>
                <option value="recommended">Recommended</option>
                <option value="not_applicable">Not applicable</option>
              </select>
            </label>
          )}

          {kind === "governance_document_control" && (
            <label className="space-y-1 text-xs font-bold text-slate-500">
              Purpose
              <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                <option value="defines">Defines</option>
                <option value="implements">Implements</option>
                <option value="operationalizes">Operationalizes</option>
                <option value="evidences">Evidência</option>
              </select>
            </label>
          )}

          {(kind === "internal_control_framework_mapping" || kind === "internal_control_mechanism") && (
            <label className="space-y-1 text-xs font-bold text-slate-500">
              Relationship type
              <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)}>
                {kind === "internal_control_framework_mapping" ? (
                  <>
                    <option value="equivalent">Equivalent</option>
                    <option value="partial">Partial</option>
                    <option value="supports">Supports</option>
                    <option value="overlaps">Overlaps</option>
                    <option value="derived">Derived</option>
                  </>
                ) : (
                  <>
                    <option value="primary">Primary</option>
                    <option value="supporting">Supporting</option>
                    <option value="compensating">Compensating</option>
                    <option value="preventive">Preventive</option>
                    <option value="detective">Detective</option>
                    <option value="corrective">Corrective</option>
                  </>
                )}
              </select>
            </label>
          )}

          {kind === "internal_control_framework_mapping" && (
            <label className="space-y-1 text-xs font-bold text-slate-500">
              Coverage percentage
              <input type="number" min={0} max={100} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold" value={coverage} onChange={(event) => setCoverage(event.target.value)} />
            </label>
          )}

          {kind === "internal_control_mechanism" && (
            <>
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Contribution weight
                <input type="number" min={0} max={100} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold" value={contribution} onChange={(event) => setContribution(event.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-bold text-slate-500">
                Estado de implementação
                <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value={implementationStatus} onChange={(event) => setImplementationStatus(event.target.value)}>
                  <option value="not_implemented">Não implementado</option>
                  <option value="planned">Planned</option>
                  <option value="partially_implemented">Partially implemented</option>
                  <option value="implemented">Implemented</option>
                  <option value="implemented_evidenced">Implementado e evidenciado</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <input type="checkbox" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} />
                Mecanismo obrigatório
              </label>
            </>
          )}

          {kind === "evidence_link" && (
            <label className="space-y-1 text-xs font-bold text-slate-500">
              Tipo de ligação
              <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value={linkType} onChange={(event) => setLinkType(event.target.value)}>
                <option value="evidences">Evidência</option>
                <option value="supports">Supports</option>
                <option value="validates">Valida</option>
                <option value="demonstrates">Demonstrates</option>
                <option value="mitigates">Mitigates</option>
                <option value="justifies">Justifica</option>
                <option value="produced_by">Produzida por</option>
                <option value="required_by">Exigida por</option>
              </select>
            </label>
          )}

          <label className="space-y-1 text-xs font-bold text-slate-500">
            Nível de confiança
            <input type="number" min={0} max={100} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold" value={confidence} onChange={(event) => setConfidence(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-bold text-slate-500 md:col-span-2">
            Justificação
            <textarea className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" value={rationale} onChange={(event) => setRationale(event.target.value)} />
          </label>
        </div>
        {submitError && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">{submitError}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancelar</button>
          <button type="button" disabled={saving} onClick={submit} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

function TraceabilityPanel({
  targetType,
  targetId,
  compact = false,
}: {
  targetType: string;
  targetId: string;
  compact?: boolean;
}) {
  const [payload, setPayload] = useState<TraceabilityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetType || !targetId) return;
    let active = true;
    setLoading(true);
    setError(null);
    mappingReviewApi.getTraceability(targetType, targetId, {
      mode: "official",
      include_inactive: true,
      include_evidence: true,
      include_scores: true,
      include_gaps: true,
      max_depth: compact ? 2 : 3,
    })
      .then((data) => {
        if (active) setPayload(data);
      })
      .catch((err: any) => {
        if (active) setError(friendlyErrorMessage(err, "Erro ao carregar rastreabilidade."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [targetType, targetId, compact]);

  if (!targetType || !targetId) return <MappingEmptyNotice title="Sem entidade" detail="Seleciona uma origem ou destino com ID." />;
  if (loading) return <LoadingState label="A carregar rastreabilidade" />;
  if (error) return <ErrorState message={error} />;
  if (!payload) return <MappingEmptyNotice title="Sem rastreabilidade" detail="Não existem dados para mostrar." />;

  const relationships = payload.relationships || {};
  const scoreText = payload.scores?.official ? `${payload.scores.official.score}%` : "-";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MiniFact label="Raiz" value={payload.root?.type || targetType} />
        <MiniFact label="Score oficial" value={scoreText} />
        <MiniFact label="Evidências" value={payload.evidence?.items?.length || 0} />
        <MiniFact label="Gaps" value={payload.gaps?.length || 0} />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {Object.entries(relationships).slice(0, compact ? 6 : 12).map(([key, value]) => (
          <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{key.replaceAll("_", " ")}</div>
            <div className="mt-1 text-sm font-bold text-slate-800">
              {Array.isArray(value) ? value.length : value ? "1" : "0"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function MappingEmptyNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <GovernanceEmptyState>
      <FileSearch className="mb-3 h-8 w-8 text-slate-300" />
      <div className="text-sm font-bold text-slate-700">{title}</div>
      <div className="mt-1 max-w-sm text-xs font-semibold text-slate-400">{detail}</div>
    </GovernanceEmptyState>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center gap-2 text-sm font-bold text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
      {message}
    </div>
  );
}

type ContextFilterChip = {
  label: string;
  value: string;
};

type StringFilterKey = Exclude<keyof Filters, "includeInactive">;

function matrixKindLabel(kind?: MatrixKind) {
  return mappingKinds.find((item) => item.key === kind)?.label || kind || "";
}

function matrixKindFromQuery(value: string | null): MatrixKind | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
  const aliases: Record<string, MatrixKind> = {
    policy: "policy_internal_control",
    policy_internal_control: "policy_internal_control",
    document: "governance_document_control",
    governance_document: "governance_document_control",
    governance_document_control: "governance_document_control",
    internal_control: "internal_control_mechanism",
    internal_control_mechanism: "internal_control_mechanism",
    mechanism: "internal_control_mechanism",
    evidence: "evidence_link",
    evidence_item: "evidence_link",
    evidence_link: "evidence_link",
    framework: "framework_internal_control",
    framework_internal_control: "framework_internal_control",
    framework_control: "internal_control_framework_mapping",
    internal_control_framework_mapping: "internal_control_framework_mapping",
  };
  return aliases[normalized];
}

function defaultKindFromContext(params: URLSearchParams): MatrixKind | undefined {
  if (params.get("policy")) return "policy_internal_control";
  if (params.get("document")) return "governance_document_control";
  if (params.get("evidence")) return "evidence_link";
  if (params.get("mechanism")) return "internal_control_mechanism";
  if (params.get("frameworkControl")) return "internal_control_framework_mapping";
  if (params.get("framework")) return "framework_internal_control";
  if (params.get("internalControl")) return "internal_control_mechanism";
  return undefined;
}

function buildMappingReviewContext(params: URLSearchParams) {
  const filters: Filters = { ...emptyFilters };
  const chips: ContextFilterChip[] = [];
  const assign = (param: string, filterKey: StringFilterKey, label: string) => {
    const value = params.get(param)?.trim();
    if (!value) return;
    filters[filterKey] = value;
    chips.push({ label, value });
  };

  assign("policy", "policy", "Política");
  assign("document", "document", "Documento");
  assign("internalControl", "internalControl", "Controlo interno IC");
  assign("mechanism", "mechanism", "Mecanismo");
  assign("evidence", "evidence", "Evidência");
  assign("framework", "framework", "Framework");
  assign("frameworkControl", "frameworkControl", "Controlo externo EXT");

  const status = params.get("status")?.trim();
  if (status) {
    filters.validation_status = status;
    filters.includeInactive = ["rejected", "deprecated"].includes(status);
    chips.push({ label: "Estado", value: statusLabel(status) });
  }

  const source = params.get("source")?.trim();
  if (source) {
    filters.mapping_source = source;
    chips.push({ label: "Origem", value: sourceLabel(source) });
  }

  const activeKind = matrixKindFromQuery(params.get("type")) || defaultKindFromContext(params);
  if (params.get("type") && activeKind) {
    chips.push({ label: "Matriz", value: matrixKindLabel(activeKind) });
  }

  return {
    activeKind,
    chips,
    filters,
    hasContext: chips.length > 0,
    signature: params.toString(),
  };
}

function MappingContextBanner({
  chips,
  onClear,
}: {
  chips: ContextFilterChip[];
  onClear: () => void;
}) {
  return (
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-bold text-indigo-950">Filtros aplicados a partir do contexto</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span key={`${chip.label}-${chip.value}`} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700">
                <span className="text-indigo-400">{chip.label}</span>
                {chip.value}
              </span>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClear} className="inline-flex h-10 items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 hover:bg-indigo-100">
          Limpar filtros
        </button>
      </div>
    </section>
  );
}

function normalizedText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function looksLikeTechnicalIdentifier(value: string) {
  return /^\d+$/.test(value) || /^[0-9a-f]{8,}-[0-9a-f-]+$/i.test(value);
}

function matchesContextValue(value: string, candidates: unknown[], haystack: string) {
  const normalized = normalizedText(value);
  if (!normalized) return true;
  if (candidates.some((candidate) => normalizedText(candidate) === normalized)) return true;
  return !looksLikeTechnicalIdentifier(normalized) && haystack.includes(normalized);
}

function evidenceTarget(mapping: MappingRecord, targetType: string) {
  return mapping.kind === "evidence_link" && mapping.targetType === targetType ? mapping.targetId : undefined;
}

function matchesContextFilters(mapping: MappingRecord, filters: Filters, haystack: string) {
  const raw = mapping.raw || {};

  if (filters.policy && !matchesContextValue(filters.policy, [
    mapping.kind === "policy_internal_control" ? mapping.sourceId : undefined,
    evidenceTarget(mapping, "policy"),
    raw.policy,
    raw.policy_id,
    raw.legacy_policy,
  ], haystack)) return false;

  if (filters.document && !matchesContextValue(filters.document, [
    mapping.kind === "governance_document_control" ? mapping.sourceId : undefined,
    evidenceTarget(mapping, "governance_document"),
    raw.document,
    raw.document_id,
    raw.governance_document,
    raw.governance_document_id,
  ], haystack)) return false;

  if (filters.internalControl && !matchesContextValue(filters.internalControl, [
    mapping.sourceType === "internal_control" ? mapping.sourceId : undefined,
    mapping.targetType === "internal_control" ? mapping.targetId : undefined,
    evidenceTarget(mapping, "internal_control"),
    raw.internal_control,
    raw.internal_control_id,
  ], haystack)) return false;

  if (filters.mechanism && !matchesContextValue(filters.mechanism, [
    mapping.sourceType === "mechanism" ? mapping.sourceId : undefined,
    mapping.targetType === "mechanism" ? mapping.targetId : undefined,
    evidenceTarget(mapping, "mechanism"),
    raw.mechanism,
    raw.mechanism_id,
  ], haystack)) return false;

  if (filters.evidence && !matchesContextValue(filters.evidence, [
    mapping.sourceType === "evidence_item" ? mapping.sourceId : undefined,
    raw.evidence_item,
    raw.evidence_item_id,
    raw.evidence,
    raw.evidence_id,
  ], haystack)) return false;

  if (filters.framework && !matchesContextValue(filters.framework, [
    raw.framework,
    raw.framework_id,
    raw.framework_code,
    raw.framework_name,
  ], haystack)) return false;

  if (filters.frameworkControl && !matchesContextValue(filters.frameworkControl, [
    mapping.sourceType === "framework_control" ? mapping.sourceId : undefined,
    mapping.targetType === "framework_control" ? mapping.targetId : undefined,
    evidenceTarget(mapping, "framework_control"),
    raw.framework_control,
    raw.framework_control_id,
    raw.control,
    raw.control_id,
    raw.framework_control_code,
  ], haystack)) return false;

  return true;
}

function filterMappings(mappings: MappingRecord[], kind: MatrixKind, filters: Filters) {
  const kindFiltered = kind === "framework_internal_control"
    ? mappings.filter((item) => item.kind === "internal_control_framework_mapping")
    : mappings.filter((item) => item.kind === kind);
  const search = filters.search.trim().toLowerCase();

  return kindFiltered.filter((mapping) => {
    if (!filters.includeInactive && ["rejected", "deprecated"].includes(mapping.validation_status)) return false;
    if (filters.validation_status && mapping.validation_status !== filters.validation_status) return false;
    if (filters.mapping_source && mapping.mapping_source !== filters.mapping_source) return false;

    const haystack = [
      mapping.sourceLabel,
      mapping.targetLabel,
      mapping.rationale,
      mapping.relationship_type,
      mapping.link_type,
      mapping.purpose,
      mapping.applicability,
      mapping.raw?.internal_control_domain,
      mapping.raw?.framework_code,
      mapping.raw?.framework_name,
      mapping.raw?.policy_code,
      mapping.raw?.policy_title,
      mapping.raw?.mechanism_title,
      JSON.stringify(mapping.raw || {}),
    ].filter(Boolean).join(" ").toLowerCase();

    if (filters.domain && !haystack.includes(filters.domain.toLowerCase())) return false;
    if (!matchesContextFilters(mapping, filters, haystack)) return false;
    if (search && !haystack.includes(search)) return false;

    return true;
  });
}

export default function MappingReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamText = searchParams.toString();
  const contextState = useMemo(() => buildMappingReviewContext(new URLSearchParams(searchParamText)), [searchParamText]);
  const [mappings, setMappings] = useState<MappingRecord[]>([]);
  const [overview, setOverview] = useState<TraceabilityPayload | null>(null);
  const [gaps, setGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [activeKind, setActiveKind] = useState<MatrixKind>("policy_internal_control");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedMapping, setSelectedMapping] = useState<MappingRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const includeInactiveRequested = filters.includeInactive || contextState.filters.includeInactive;
  const mappingLoadParams = useMemo(
    () => ({
      page_size: 1000,
      include_inactive: includeInactiveRequested,
      active_internal_controls: !includeInactiveRequested,
    }),
    [includeInactiveRequested]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadWarnings([]);
    try {
      const warnings: string[] = [];
      const loadOptional = async <T,>(label: string, fallback: T, request: Promise<T>): Promise<T> => {
        try {
          return await request;
        } catch (err) {
          console.warn(label, err);
          warnings.push(label);
          return fallback;
        }
      };

      const mappingBatches = await Promise.all(
        editableKinds.map((kind) =>
          loadOptional<MappingRecord[]>(
            `Não foi possível carregar ${matrixKindLabel(kind)}.`,
            [],
            mappingReviewApi.listMappings(kind, mappingLoadParams)
          )
        )
      );

      const allMappings = mappingBatches.flat();
      setMappings(allMappings);
      setOverview(null);
      setGaps([]);
      setLoadWarnings(warnings);

      if (warnings.length > 0 && allMappings.length === 0) {
        setError("Não foi possível carregar dados de mapeamento. Verifica o backend e as migrações/bootstrap da camada de governação.");
      } else {
        const firstKindWithData = mappingKinds.find((kind) => {
          if (kind.key === "framework_internal_control") {
            return allMappings.some((mapping) => mapping.kind === "internal_control_framework_mapping");
          }
          return allMappings.some((mapping) => mapping.kind === kind.key);
        });
        if (!contextState.hasContext && firstKindWithData) {
          setActiveKind((current) => {
            const currentHasData = current === "framework_internal_control"
              ? allMappings.some((mapping) => mapping.kind === "internal_control_framework_mapping")
              : allMappings.some((mapping) => mapping.kind === current);
            return currentHasData ? current : firstKindWithData.key;
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(friendlyErrorMessage(err, "Não foi possível carregar a matriz de mapeamentos."));
    } finally {
      setLoading(false);
    }
  }, [contextState.hasContext, mappingLoadParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadAdvancedData = useCallback(async () => {
    setAdvancedLoading(true);
    setLoadWarnings((current) => current.filter((warning) => !warning.includes("overview") && !warning.includes("gaps")));
    try {
      const [overviewData, gapData] = await Promise.all([
        mappingReviewApi.getOverview({ mode: "official", include_inactive: includeInactiveRequested }),
        mappingReviewApi.getPropagationGaps({ mode: "official" }),
      ]);
      setOverview(overviewData);
      setGaps(gapData.gaps || []);
    } catch (err) {
      console.warn("advanced mapping review data", err);
      setLoadWarnings((current) => [
        ...current,
        "Não foi possível carregar KPIs avançados de rastreabilidade/gaps. A matriz principal está disponível.",
      ]);
    } finally {
      setAdvancedLoading(false);
    }
  }, [includeInactiveRequested]);

  useEffect(() => {
    if (!contextState.hasContext) return;
    setFilters(contextState.filters);
    if (contextState.activeKind) setActiveKind(contextState.activeKind);
  }, [contextState.activeKind, contextState.filters, contextState.hasContext, contextState.signature]);

  const clearContextFilters = () => {
    setSearchParams({});
    setFilters(emptyFilters);
    setActiveKind("policy_internal_control");
  };

  const visibleMappings = useMemo(
    () => filterMappings(mappings, activeKind, filters),
    [mappings, activeKind, filters]
  );

  const mappingCounts = useMemo(() => {
    const counts = {} as Record<MatrixKind, number>;
    mappingKinds.forEach((kind) => {
      counts[kind.key] = kind.key === "framework_internal_control"
        ? mappings.filter((mapping) => mapping.kind === "internal_control_framework_mapping").length
        : mappings.filter((mapping) => mapping.kind === kind.key).length;
    });
    return counts;
  }, [mappings]);

  const updateLocalMapping = (id: string, kind: MappingKind, patch: Partial<MappingRecord>) => {
    setMappings((current) => current.map((item) => item.id === id && item.kind === kind ? { ...item, ...patch, raw: { ...item.raw, ...patch } } : item));
    setSelectedMapping((current) => current && current.id === id && current.kind === kind ? { ...current, ...patch, raw: { ...current.raw, ...patch } } : current);
  };

  const handleSave = async (mapping: MappingRecord, patch: Record<string, any>) => {
    setSaving(true);
    try {
      await mappingReviewApi.updateMapping(mapping.kind, mapping.id, patch);
      updateLocalMapping(mapping.id, mapping.kind, patch);
    } catch (err: any) {
      alert(friendlyErrorMessage(err, "Erro ao guardar."));
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (mapping: MappingRecord) => {
    if (!window.confirm("Confirmas a aprovacao deste mapeamento?")) return;
    setSaving(true);
    try {
      await mappingReviewApi.approveMapping(mapping.kind, mapping.id);
      updateLocalMapping(mapping.id, mapping.kind, { validation_status: "approved" });
    } catch (err: any) {
      alert(friendlyErrorMessage(err, "Erro ao aprovar."));
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (mapping: MappingRecord) => {
    const rationale = mapping.rationale?.trim();
    if (!rationale) {
      alert("A rejeição exige justificação.");
      return;
    }
    setSaving(true);
    try {
      await mappingReviewApi.rejectMapping(mapping.kind, mapping.id, rationale);
      updateLocalMapping(mapping.id, mapping.kind, { validation_status: "rejected", rationale });
    } catch (err: any) {
      alert(friendlyErrorMessage(err, "Erro ao rejeitar."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeprecate = async (mapping: MappingRecord) => {
    if (!window.confirm("Confirmas marcar este mapeamento como descontinuado?")) return;
    setSaving(true);
    try {
      await mappingReviewApi.deprecateMapping(mapping.kind, mapping.id);
      updateLocalMapping(mapping.id, mapping.kind, { validation_status: "deprecated" });
    } catch (err: any) {
      alert(friendlyErrorMessage(err, "Erro ao marcar como descontinuado."));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (kind: MappingKind, payload: Record<string, any>) => {
    setSaving(true);
    try {
      await mappingReviewApi.createMapping(kind, payload);
      const refreshedMappings = await mappingReviewApi.listMappings(kind, mappingLoadParams);
      setMappings((current) => [
        ...current.filter((item) => item.kind !== kind),
        ...refreshedMappings,
      ]);
      setActiveKind(kind);
      setCreateOpen(false);
    } catch (err: any) {
      alert(friendlyErrorMessage(err, "Erro ao criar mapeamento."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10"><LoadingState label="A carregar revisão de mapeamentos" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-20">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
            <GitBranch className="h-3.5 w-3.5" />
            Rastreabilidade de governação
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Revisão de mapeamentos</h1>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
            Revisa mapeamentos entre políticas, documentos, controlos internos, mecanismos, evidências e frameworks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadData} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
          <button type="button" onClick={loadAdvancedData} disabled={advancedLoading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
            {advancedLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            KPIs avancados
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">
            <Plus className="h-4 w-4" />
            Novo mapeamento
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {loadWarnings.length > 0 && (
        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 shadow-sm">
          <div className="font-bold">Alguns dados complementares não foram carregados.</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {loadWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      )}

      {contextState.hasContext && <MappingContextBanner chips={contextState.chips} onClear={clearContextFilters} />}

      <MappingReviewDashboard overview={overview} mappings={mappings} gaps={gaps} />

      <ValidationGatePanel
        mappings={mappings}
        onSelect={(kind, status) => {
          setActiveKind(kind);
          setFilters((current) => ({
            ...current,
            validation_status: status,
            includeInactive: ["rejected", "deprecated"].includes(status),
          }));
        }}
      />

      <PendingMappingsQueue
        mappings={mappings}
        onOpen={setSelectedMapping}
        onApprove={handleApprove}
        onReject={(mapping) => setSelectedMapping(mapping)}
      />

      <MappingMatrixView
        activeKind={activeKind}
        onKindChange={setActiveKind}
        mappings={visibleMappings}
        filters={filters}
        onFiltersChange={setFilters}
        onOpen={setSelectedMapping}
        onApprove={handleApprove}
        onReject={setSelectedMapping}
        onDeprecate={handleDeprecate}
        contextActive={contextState.hasContext}
        mappingCounts={mappingCounts}
      />

      <MappingDetailDrawer
        mapping={selectedMapping}
        saving={saving}
        onClose={() => setSelectedMapping(null)}
        onSave={handleSave}
        onApprove={handleApprove}
        onReject={handleReject}
        onDeprecate={handleDeprecate}
      />

      <CreateMappingModal
        open={createOpen}
        saving={saving}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
