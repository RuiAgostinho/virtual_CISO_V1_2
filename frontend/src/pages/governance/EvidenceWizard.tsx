/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  Loader2,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";
import { GovernanceBadge } from "@/components/governance/GovernancePrimitives";
import { mappingReviewApi, type SearchOption, type TraceabilityPayload } from "@/lib/mappingReviewApi";

type EvidenceType =
  | "report"
  | "screenshot"
  | "ticket"
  | "log"
  | "audit_report"
  | "configuration_export"
  | "meeting_minutes"
  | "approval_record"
  | "vulnerability_scan"
  | "siem_alert"
  | "manual_attestation"
  | "other";

type EvidenceStatus = "draft" | "pending_review" | "valid" | "expired" | "rejected" | "deprecated";
type TargetType =
  | "mechanism"
  | "internal_control"
  | "governance_document"
  | "runbook_step"
  | "framework_control"
  | "policy"
  | "risk"
  | "asset"
  | "vulnerability"
  | "finding"
  | "improvement_action";
type LinkType = "evidences" | "supports" | "validates" | "demonstrates" | "mitigates" | "justifies" | "produced_by" | "required_by";

type EvidenceForm = {
  title: string;
  description: string;
  evidence_type: EvidenceType;
  source: string;
  external_reference: string;
  collected_at: string;
  valid_until: string;
  confidence_level: number;
  status: EvidenceStatus;
  owner: string;
};

type LinkForm = {
  target_type: TargetType;
  target: SearchOption | null;
  link_type: LinkType;
  rationale: string;
  confidence_score: number;
};

const evidenceTypes: Array<{ value: EvidenceType; label: string }> = [
  { value: "report", label: "Relatório" },
  { value: "screenshot", label: "Captura de ecrã" },
  { value: "ticket", label: "Ticket" },
  { value: "log", label: "Log" },
  { value: "audit_report", label: "Relatório de auditoria" },
  { value: "configuration_export", label: "Exportação de configuração" },
  { value: "meeting_minutes", label: "Ata de reunião" },
  { value: "approval_record", label: "Registo de aprovação" },
  { value: "vulnerability_scan", label: "Análise de vulnerabilidades" },
  { value: "siem_alert", label: "SIEM alert" },
  { value: "manual_attestation", label: "Declaração manual" },
  { value: "other", label: "Outro" },
];

const statusOptions: Array<{ value: EvidenceStatus; label: string }> = [
  { value: "draft", label: "Rascunho" },
  { value: "pending_review", label: "Pendente de revisão" },
  { value: "valid", label: "Válida" },
  { value: "expired", label: "Expirada" },
  { value: "rejected", label: "Rejeitada" },
  { value: "deprecated", label: "Descontinuada" },
];

const targetTypes: Array<{ value: TargetType; label: string; description: string }> = [
  { value: "mechanism", label: "Mecanismo", description: "Evidencia um mecanismo reutilizável." },
  { value: "internal_control", label: "Controlo interno", description: "Suporta diretamente um controlo interno." },
  { value: "governance_document", label: "Documento de governação", description: "Liga a política, norma, procedimento ou runbook." },
  { value: "runbook_step", label: "Passo de runbook", description: "Prova a execução de um passo operacional." },
  { value: "framework_control", label: "Controlo externo", description: "Evidencia diretamente um controlo externo." },
  { value: "policy", label: "Política", description: "Liga a uma política legada." },
  { value: "risk", label: "Risco", description: "Justifica ou mitiga um risco." },
  { value: "asset", label: "Ativo", description: "Evidencia estado ou proteção de um ativo." },
  { value: "vulnerability", label: "Vulnerabilidade", description: "Liga a vulnerabilidade ou remediação." },
  { value: "finding", label: "Constatação", description: "Suporta uma constatação de auditoria." },
  { value: "improvement_action", label: "Ação de melhoria", description: "Prova progresso de uma ação." },
];

const linkTypes: Array<{ value: LinkType; label: string }> = [
  { value: "evidences", label: "Evidência" },
  { value: "supports", label: "Suporta" },
  { value: "validates", label: "Valida" },
  { value: "demonstrates", label: "Demonstra" },
  { value: "mitigates", label: "Mitiga" },
  { value: "justifies", label: "Justifica" },
  { value: "produced_by", label: "Produzida por" },
  { value: "required_by", label: "Requerida por" },
];

const traceabilityTargets = new Set<TargetType>(["mechanism", "internal_control", "governance_document", "framework_control", "policy"]);

function getApiErrorMessage(err: any, fallback: string) {
  if (typeof err?.message === "string" && err.message) return err.message;
  if (typeof err?.detail === "string") return err.detail;
  return fallback;
}

function unwrap<T = any>(payload: any): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.results || [];
}

function statusTone(status?: string) {
  if (status === "valid" || status === "approved" || status === "compliant") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review" || status === "draft" || status === "mostly_compliant") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired" || status === "rejected" || status === "non_compliant") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated" || status === "not_assessed") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function entityLabel(item: any) {
  if (!item) return "-";
  if (item.code && item.title) return `${item.code} - ${item.title}`;
  if (item.framework_code && item.code && item.title) return `${item.framework_code}:${item.code} - ${item.title}`;
  if (item.name && item.version) return `${item.name} ${item.version}`;
  return item.title || item.name || item.code || item.id || "-";
}

function isExpired(form: EvidenceForm) {
  if (form.status === "expired") return true;
  if (!form.valid_until) return false;
  return new Date(form.valid_until) < new Date(new Date().toDateString());
}

function targetTraceabilityType(targetType: TargetType) {
  if (targetType === "framework_control") return "framework_control";
  return targetType;
}

function WizardStepper({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex min-w-max gap-2">
        {steps.map((step, index) => {
          const active = index === currentStep;
          const done = index < currentStep;
          return (
            <div
              key={step}
              className={`min-w-[150px] rounded-xl border px-3 py-3 ${
                active
                  ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                  : done
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-slate-100 bg-slate-50 text-slate-500"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-black ${done ? "bg-emerald-600 text-white" : active ? "bg-indigo-600 text-white" : "bg-white text-slate-400"}`}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="truncate text-[10px] font-bold uppercase tracking-wide">{step}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchPicker({
  targetType,
  selected,
  onSelect,
}: {
  targetType: TargetType;
  selected?: SearchOption | null;
  onSelect: (option: SearchOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        let results: SearchOption[] = [];
        if (targetType === "mechanism") results = await mappingReviewApi.searchMechanisms(query);
        if (targetType === "internal_control") results = await mappingReviewApi.searchInternalControls(query, { page_size: 25 });
        if (targetType === "governance_document") results = await mappingReviewApi.searchGovernanceDocuments(query);
        if (targetType === "runbook_step") results = await mappingReviewApi.searchRunbookSteps(query);
        if (targetType === "framework_control") results = await mappingReviewApi.searchFrameworkControls(query);
        if (targetType === "policy") results = await mappingReviewApi.searchPolicies(query);
        if (targetType === "risk") results = await mappingReviewApi.searchRisks(query);
        if (targetType === "asset") results = await mappingReviewApi.searchAssets(query);
        if (targetType === "vulnerability") results = await mappingReviewApi.searchVulnerabilities(query);
        if (targetType === "finding") results = await mappingReviewApi.searchFindings(query);
        if (targetType === "improvement_action") results = await mappingReviewApi.searchImprovementActions(query);
        if (!controller.signal.aborted) setOptions(results);
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(err, "Pesquisa ainda não disponível nesta interface."));
          setOptions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, targetType]);

  return (
    <div>
      {selected ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-indigo-950">{selected.label}</p>
              <p className="mt-1 line-clamp-2 text-xs font-semibold text-indigo-700">{selected.description || selected.meta || "Selecionado."}</p>
            </div>
            <button type="button" onClick={() => onSelect(null)} className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100 hover:text-red-700">
              Limpar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar por código, título, nome ou descrição..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          {error && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{error}</div>}
          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {loading && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                A pesquisar...
              </div>
            )}
            {!loading && options.map((option) => (
              <button
                type="button"
                key={option.id}
                onClick={() => onSelect(option)}
                className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:border-indigo-200 hover:bg-indigo-50"
              >
                <p className="truncate text-sm font-bold text-slate-950">{option.label}</p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{option.description || option.meta || "Sem descrição."}</p>
              </button>
            ))}
            {!loading && options.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">
                Sem resultados.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function EvidenceWizard() {
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<EvidenceForm>({
    title: "",
    description: "",
    evidence_type: "report",
    source: "",
    external_reference: "",
    collected_at: "",
    valid_until: "",
    confidence_level: 80,
    status: "draft",
    owner: "",
  });
  const [linkForm, setLinkForm] = useState<LinkForm>({
    target_type: "mechanism",
    target: null,
    link_type: "evidences",
    rationale: "",
    confidence_score: 100,
  });
  const [traceability, setTraceability] = useState<TraceabilityPayload | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdEvidence, setCreatedEvidence] = useState<any | null>(null);
  const [createdLink, setCreatedLink] = useState<any | null>(null);
  const [queryPrefillApplied, setQueryPrefillApplied] = useState(false);

  const steps = ["Dados", "Referência", "Alvo", "Relação", "Impacto", "Revisão"];
  const currentStepId = ["details", "reference", "target_type", "relation", "impact", "review"][currentStep];

  useEffect(() => {
    if (queryPrefillApplied) return;

    const targetType = searchParams.get("target_type") as TargetType | null;
    const targetId = searchParams.get("target_id");
    const targetLabel = searchParams.get("target_label") || targetId || "";
    const evidenceTitle = searchParams.get("evidence_title") || "";
    const description = searchParams.get("description") || "";
    const evidenceType = searchParams.get("evidence_type") as EvidenceType | null;
    const linkType = searchParams.get("link_type") as LinkType | null;
    const rationale = searchParams.get("rationale") || description;

    if (evidenceTitle || description || evidenceType) {
      setForm((current) => ({
        ...current,
        title: evidenceTitle || current.title,
        description: description || current.description,
        evidence_type: evidenceTypes.some((item) => item.value === evidenceType) ? evidenceType! : current.evidence_type,
      }));
    }

    if (targetType && targetTypes.some((item) => item.value === targetType)) {
      setLinkForm((current) => ({
        ...current,
        target_type: targetType,
        target: targetId
          ? {
              id: targetId,
              label: targetLabel || targetId,
              description,
              meta: "pre-selecionado",
              raw: { id: targetId, title: targetLabel },
            }
          : current.target,
        link_type: linkTypes.some((item) => item.value === linkType) ? linkType! : current.link_type,
        rationale: rationale || current.rationale,
      }));
    }

    setQueryPrefillApplied(true);
  }, [queryPrefillApplied, searchParams]);

  const warnings = useMemo(() => {
    const items: string[] = [];
    if (!form.source.trim() && !form.external_reference.trim()) items.push("Fonte ou referência externa é recomendada para rastreabilidade.");
    if (isExpired(form)) items.push("Esta evidência está expirada e não contará para o score oficial.");
    if (form.status !== "valid") items.push("A evidência só conta para o score oficial quando estiver válida e não expirada.");
    items.push("A ligação de evidência será criada em rascunho e precisa de aprovação na revisão de mapeamentos para contar oficialmente.");
    return items;
  }, [form]);

  const impact = useMemo(() => {
    const relationships = traceability?.relationships || {};
    return {
      internalControls: [
        ...unwrap(relationships.internal_controls),
        ...unwrap(relationships.internal_controls_direct),
        ...unwrap(relationships.internal_controls_indirect),
      ],
      mechanisms: unwrap(relationships.mechanisms),
      policies: unwrap(relationships.policies),
      documents: unwrap(relationships.governance_documents),
      frameworks: unwrap(relationships.frameworks),
      frameworkControls: unwrap(relationships.framework_controls),
      gaps: traceability?.gaps || [],
    };
  }, [traceability]);

  useEffect(() => {
    const loadImpact = async () => {
      if (!linkForm.target) {
        setTraceability(null);
        setImpactError(null);
        return;
      }
      if (!traceabilityTargets.has(linkForm.target_type)) {
        setTraceability(null);
        setImpactError("A API de rastreabilidade ainda não está disponível para este tipo de alvo nesta interface.");
        return;
      }
      setImpactLoading(true);
      setImpactError(null);
      try {
        const payload = await mappingReviewApi.getTraceability(targetTraceabilityType(linkForm.target_type), String(linkForm.target.id), {
          mode: "official",
          include_evidence: true,
          include_gaps: true,
          include_scores: true,
          max_depth: 3,
        });
        setTraceability(payload);
      } catch (err: any) {
        setTraceability(null);
        setImpactError(getApiErrorMessage(err, "Não foi possível carregar impacto do alvo."));
      } finally {
        setImpactLoading(false);
      }
    };

    void loadImpact();
  }, [linkForm.target, linkForm.target_type]);

  const validateCurrentStep = (stepId: string) => {
    if (stepId === "details") {
      if (!form.title.trim()) return "Indica o título da evidência.";
      if (!form.evidence_type) return "Seleciona o tipo de evidência.";
      if (form.confidence_level < 0 || form.confidence_level > 100) return "O nível de confiança tem de estar entre 0 e 100.";
    }
    if (stepId === "target_type" && !linkForm.target_type) return "Seleciona o tipo de alvo.";
    if (stepId === "relation") {
      if (!linkForm.target) return "Seleciona o alvo da evidência.";
      if (!linkForm.link_type) return "Seleciona o tipo de relacao.";
      if (!linkForm.rationale.trim()) return "A justificação é obrigatória.";
      if (linkForm.confidence_score < 0 || linkForm.confidence_score > 100) return "O nível de confiança da ligação tem de estar entre 0 e 100.";
    }
    return null;
  };

  const goNext = () => {
    const error = validateCurrentStep(currentStepId);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const goBack = () => {
    setValidationError(null);
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const createAll = async () => {
    const firstError = validateCurrentStep("details") || validateCurrentStep("target_type") || validateCurrentStep("relation");
    if (firstError) {
      setValidationError(firstError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const evidence = await mappingReviewApi.createEvidenceItem({
        title: form.title.trim(),
        description: form.description.trim(),
        evidence_type: form.evidence_type,
        source: form.source.trim(),
        external_reference: form.external_reference.trim(),
        collected_at: form.collected_at || null,
        valid_until: form.valid_until || null,
        confidence_level: form.confidence_level,
        status: form.status,
        owner: form.owner.trim(),
        is_active: true,
      });

      const link = await mappingReviewApi.createEvidenceLink({
        evidence_item: evidence.id,
        target_type: linkForm.target_type,
        target_id: linkForm.target?.id,
        link_type: linkForm.link_type,
        rationale: linkForm.rationale.trim(),
        confidence_score: linkForm.confidence_score,
      });

      setCreatedEvidence(evidence);
      setCreatedLink(link);
      setValidationError(null);
    } catch (err: any) {
      setSaveError(getApiErrorMessage(err, "Não foi possível criar a evidência."));
    } finally {
      setSaving(false);
    }
  };

  if (createdEvidence) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-6 pb-16">
        <section className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Evidência criada</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{createdEvidence.title || form.title}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                A evidência foi criada e associada ao alvo selecionado. A ligação ficou em rascunho para validação humana.
              </p>
              {createdLink && (
                <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                  Link criado: {createdLink.target_label || linkForm.target?.label || linkForm.target_type}
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/governance/mapping-review" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                  <GitBranch className="h-4 w-4" />
                  Revisão de mapeamentos
                </Link>
                <a href={`/api/governance/traceability/evidence-item/${createdEvidence.id}/?include_scores=true&include_gaps=true&include_evidence=true`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                  <Network className="h-4 w-4" />
                  API de rastreabilidade
                </a>
                {linkForm.target_type === "mechanism" && (
                  <Link to="/governance/mechanisms/wizard" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                    <ShieldCheck className="h-4 w-4" />
                    Assistente de mecanismos
                  </Link>
                )}
                {linkForm.target_type === "governance_document" && linkForm.target && (
                  <Link to={`/governance/documents/${linkForm.target.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                    <FileCheck2 className="h-4 w-4" />
                    Abrir documento
                  </Link>
                )}
                {linkForm.target_type === "policy" && linkForm.target && (
                  <Link to={`/governance/policies/${linkForm.target.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                    <FileCheck2 className="h-4 w-4" />
                    Abrir policy
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <Link to="/governance/mapping-review" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar à revisão de mapeamentos
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <FileCheck2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Assistente de evidências</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Criar evidência reutilizável</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                Cria uma evidência reutilizável e associa-a a mecanismos, controlos, documentos, políticas ou outros alvos suportados.
              </p>
            </div>
          </div>
          <div className="grid min-w-[260px] grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{form.confidence_level}%</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Confiança</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{impact.frameworks.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{warnings.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Avisos</p>
            </div>
          </div>
        </div>
      </header>

      <WizardStepper steps={steps} currentStep={currentStep} />

      {(validationError || saveError) && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {validationError || saveError}
          </div>
        </div>
      )}

      {currentStepId === "details" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_240px_220px]">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Título *</span>
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="Relatório de execução MFA" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tipo *</span>
              <select value={form.evidence_type} onChange={(event) => setForm((current) => ({ ...current, evidence_type: event.target.value as EvidenceType }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                {evidenceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EvidenceStatus }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Responsável</span>
              <input value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Collected at</span>
              <input type="datetime-local" value={form.collected_at} onChange={(event) => setForm((current) => ({ ...current, collected_at: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Válida até</span>
              <input type="date" value={form.valid_until} onChange={(event) => setForm((current) => ({ ...current, valid_until: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descricao</span>
              <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-2 min-h-32 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nível de confiança</span>
              <input type="number" min={0} max={100} value={form.confidence_level} onChange={(event) => setForm((current) => ({ ...current, confidence_level: Number(event.target.value) }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
        </section>
      )}

      {currentStepId === "reference" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Fonte</span>
              <input value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="Sistema, equipa, auditoria, SIEM..." />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Referência externa</span>
              <input value={form.external_reference} onChange={(event) => setForm((current) => ({ ...current, external_reference: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="URL, ticket, caminho, referência documental..." />
            </label>
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            O upload de ficheiro existe no modelo backend, mas este assistente usa a via segura por referência manual porque o cliente atual desta aplicação cria evidências por JSON.
          </div>
        </section>
      )}

      {currentStepId === "target_type" && (
        <section className="grid gap-4 lg:grid-cols-3">
          {targetTypes.map((target) => {
            const selected = linkForm.target_type === target.value;
            return (
              <button
                type="button"
                key={target.value}
                onClick={() => setLinkForm((current) => ({ ...current, target_type: target.value, target: null }))}
                className={`rounded-2xl border p-5 text-left transition ${
                  selected ? "border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm" : "border-slate-100 bg-white text-slate-700 hover:border-indigo-100 hover:bg-slate-50"
                }`}
              >
                <p className="text-base font-bold">{target.label}</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{target.description}</p>
              </button>
            );
          })}
        </section>
      )}

      {currentStepId === "relation" && (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-slate-950">Selecionar alvo</h2>
            <SearchPicker targetType={linkForm.target_type} selected={linkForm.target} onSelect={(option) => setLinkForm((current) => ({ ...current, target: option }))} />
          </section>
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tipo de ligação *</span>
                <select value={linkForm.link_type} onChange={(event) => setLinkForm((current) => ({ ...current, link_type: event.target.value as LinkType }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                  {linkTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nível de confiança</span>
                <input type="number" min={0} max={100} value={linkForm.confidence_score} onChange={(event) => setLinkForm((current) => ({ ...current, confidence_score: Number(event.target.value) }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Justificação *</span>
              <textarea value={linkForm.rationale} onChange={(event) => setLinkForm((current) => ({ ...current, rationale: event.target.value }))} className="mt-2 min-h-32 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="Explica porque esta evidência suporta, valida ou demonstra o alvo selecionado." />
            </label>
          </section>
        </div>
      )}

      {currentStepId === "impact" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Network className="h-5 w-5 text-indigo-700" />
              <div>
                <h2 className="text-base font-bold text-slate-950">Impacto e rastreabilidade</h2>
                <p className="text-xs font-semibold text-slate-500">Usa a API de rastreabilidade quando o alvo tem rastreabilidade transversal.</p>
              </div>
            </div>
            {impactLoading && <div className="mt-5 flex items-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar impacto...</div>}
            {impactError && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{impactError}</div>}
            {!impactLoading && !impactError && (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <ImpactList title="Controlos internos" items={impact.internalControls} />
                <ImpactList title="Mecanismos" items={impact.mechanisms} />
                <ImpactList title="Políticas" items={impact.policies} />
                <ImpactList title="Documentos de governação" items={impact.documents} />
                <ImpactList title="Frameworks" items={impact.frameworks} />
                <ImpactList title="Controlos externos" items={impact.frameworkControls} />
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">Avisos de scoring</h2>
            <div className="mt-4 space-y-3">
              {warnings.map((warning) => (
                <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  {warning}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {currentStepId === "review" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-indigo-700" />
            <div>
              <h2 className="text-base font-bold text-slate-950">Revisão final</h2>
              <p className="text-xs font-semibold text-slate-500">Confirma a evidência, o alvo, a relação e os impactos antes de criar.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <SummaryTile label="Evidência" value={form.title || "-"} />
            <SummaryTile label="Tipo" value={form.evidence_type} />
            <SummaryTile label="Alvo" value={linkForm.target?.label || "-"} />
            <SummaryTile label="Confiança" value={`${form.confidence_level}%`} />
          </div>
          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Justificação</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{linkForm.rationale || "-"}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <GovernanceBadge className={statusTone(form.status)}>{form.status}</GovernanceBadge>
            <GovernanceBadge className={statusTone(isExpired(form) ? "expired" : "valid")}>{isExpired(form) ? "expirada" : "validade ok"}</GovernanceBadge>
            <GovernanceBadge className="border-indigo-100 bg-indigo-50 text-indigo-700">{linkForm.link_type}</GovernanceBadge>
          </div>
        </section>
      )}

      <footer className="sticky bottom-0 z-20 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs font-semibold text-slate-500">
            Passo {currentStep + 1} de {steps.length}: <span className="font-bold text-slate-900">{steps[currentStep]}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/governance/mapping-review" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              Cancelar
            </Link>
            <button type="button" onClick={goBack} disabled={currentStep === 0 || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>
            {currentStep < steps.length - 1 ? (
              <button type="button" onClick={goNext} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                Seguinte
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={createAll} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Criar evidência
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function ImpactList({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
        <GovernanceBadge className="border-slate-200 bg-white text-slate-500">{items.length}</GovernanceBadge>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.slice(0, 6).map((item, index) => (
            <div key={item.id || `${title}-${index}`} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
              <p className="text-sm font-bold text-slate-950">{entityLabel(item)}</p>
            </div>
          ))}
          {items.length > 6 && <p className="text-xs font-semibold text-slate-500">+{items.length - 6} adicionais via API.</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-500">Sem impacto identificado.</p>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
