/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
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
  Trash2,
  Wrench,
} from "lucide-react";
import { mappingReviewApi, type MappingRecord, type SearchOption, type TraceabilityPayload } from "@/lib/mappingReviewApi";

type WizardMode = "existing" | "new";
type RelationshipType = "primary" | "supporting" | "compensating" | "preventive" | "detective" | "corrective";
type ImplementationStatus =
  | "not_implemented"
  | "planned"
  | "partially_implemented"
  | "implemented"
  | "implemented_evidenced"
  | "not_applicable";
type SearchKind = "mechanism" | "internal_control" | "evidence_item";

type NewMechanismForm = {
  title: string;
  description: string;
  mechanism_type: string;
};

type SelectedControl = {
  option: SearchOption;
  relationship_type: RelationshipType;
  contribution_weight: number;
  mandatory: boolean;
  implementation_status: ImplementationStatus;
  rationale: string;
  confidence_score: number;
  traceability?: TraceabilityPayload | null;
  existingLinks: MappingRecord[];
  loading: boolean;
  error?: string;
};

type SelectedEvidence = {
  option: SearchOption;
  rationale: string;
};

const technicalType = "T\u00e9cnico";

const mechanismTypes = [
  { value: technicalType, label: "Tecnico" },
  { value: "Processo", label: "Processo" },
  { value: "Pessoas", label: "Pessoas" },
  { value: "Fornecedor", label: "Fornecedor" },
];

const relationshipTypes: Array<{ value: RelationshipType; label: string }> = [
  { value: "primary", label: "Primary" },
  { value: "supporting", label: "Supporting" },
  { value: "compensating", label: "Compensating" },
  { value: "preventive", label: "Preventive" },
  { value: "detective", label: "Detective" },
  { value: "corrective", label: "Corrective" },
];

const implementationStatuses: Array<{ value: ImplementationStatus; label: string; score: string }> = [
  { value: "not_implemented", label: "Nao implementado", score: "0%" },
  { value: "planned", label: "Planeado", score: "20%" },
  { value: "partially_implemented", label: "Parcialmente implementado", score: "40%" },
  { value: "implemented", label: "Implementado", score: "70%" },
  { value: "implemented_evidenced", label: "Implementado e evidenciado", score: "100% com evidencia validada" },
  { value: "not_applicable", label: "Nao aplicavel", score: "Excluido" },
];

const mechanismExamples = ["MFA", "RBAC", "PAM", "IAM", "SIEM", "EDR/XDR", "WAF", "backups", "gestao de vulnerabilidades", "encriptacao", "segmentacao de rede", "revisao periodica de acessos", "offboarding", "logging centralizado"];

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

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function statusTone(status?: string) {
  if (status === "approved" || status === "valid" || status === "implemented" || status === "implemented_evidenced") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review" || status === "planned" || status === "partially_implemented") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "rejected" || status === "not_implemented") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated" || status === "expired" || status === "not_applicable") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function implementationLabel(value?: string) {
  return implementationStatuses.find((status) => status.value === value)?.label || value || "Sem estado";
}

function scoreValue(score?: any) {
  const raw = score?.score ?? score?.official?.score ?? score?.result?.score;
  if (raw === undefined || raw === null || raw === "") return "-";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(raw);
}

function entityLabel(item: any) {
  if (!item) return "-";
  if (item.code && item.title) return `${item.code} - ${item.title}`;
  if (item.framework_code && item.code && item.title) return `${item.framework_code}:${item.code} - ${item.title}`;
  if (item.name && item.version) return `${item.name} ${item.version}`;
  return item.title || item.name || item.code || item.id || "-";
}

function validApprovedEvidence(link: MappingRecord | any) {
  const raw = link.raw || link;
  return (
    (link.validation_status || raw.validation_status) === "approved"
    && (raw.evidence_status === "valid" || raw.evidence_item?.status === "valid")
    && !raw.evidence_is_expired
    && !raw.evidence_item?.is_expired
  );
}

function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
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
              className={`min-w-[165px] rounded-xl border px-3 py-3 ${
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
  kind,
  selected,
  onSelect,
  placeholder,
}: {
  kind: SearchKind;
  selected?: SearchOption | null;
  onSelect: (option: SearchOption | null) => void;
  placeholder: string;
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
        if (kind === "mechanism") results = await mappingReviewApi.searchMechanisms(query);
        if (kind === "internal_control") results = await mappingReviewApi.searchInternalControls(query, { page_size: 25 });
        if (kind === "evidence_item") results = await mappingReviewApi.searchEvidenceItems(query);
        if (!controller.signal.aborted) setOptions(results);
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(err, "Nao foi possivel pesquisar."));
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
  }, [kind, query]);

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
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          {error && <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>}
          <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
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
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{option.description || option.meta || "Sem descricao."}</p>
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

export default function MechanismWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<WizardMode>("existing");
  const [selectedMechanism, setSelectedMechanism] = useState<SearchOption | null>(null);
  const [newMechanism, setNewMechanism] = useState<NewMechanismForm>({
    title: "",
    description: "",
    mechanism_type: technicalType,
  });
  const [selectedControls, setSelectedControls] = useState<SelectedControl[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<SelectedEvidence[]>([]);
  const [existingEvidenceLinks, setExistingEvidenceLinks] = useState<MappingRecord[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdMechanism, setCreatedMechanism] = useState<any | null>(null);
  const [creationWarnings, setCreationWarnings] = useState<string[]>([]);
  const contextLoadRequestedRef = useRef<Set<string>>(new Set());

  const steps = ["Mecanismo", "Controlos internos", "Evidencias", "Impacto", "Revisao"];
  const currentStepId = ["mechanism", "controls", "evidence", "impact", "review"][currentStep];

  const mechanismId = selectedMechanism?.id;
  const selectedControlIds = useMemo(() => new Set(selectedControls.map((control) => String(control.option.id))), [selectedControls]);
  const selectedEvidenceIds = useMemo(() => new Set(selectedEvidence.map((item) => String(item.option.id))), [selectedEvidence]);
  const hasValidApprovedEvidence = existingEvidenceLinks.some(validApprovedEvidence);

  const impact = useMemo(() => {
    const frameworks = selectedControls.flatMap((control) => unwrap(control.traceability?.relationships?.frameworks));
    const frameworkControls = selectedControls.flatMap((control) => unwrap(control.traceability?.relationships?.framework_controls));
    const policies = selectedControls.flatMap((control) => unwrap(control.traceability?.relationships?.policies));
    const documents = selectedControls.flatMap((control) => unwrap(control.traceability?.relationships?.governance_documents));
    return {
      frameworks: uniqueBy(frameworks, (item) => String(item.id)),
      frameworkControls: uniqueBy(frameworkControls, (item) => String(item.id)),
      policies: uniqueBy(policies, (item) => String(item.id)),
      documents: uniqueBy(documents, (item) => String(item.id)),
    };
  }, [selectedControls]);

  const warnings = useMemo(() => {
    const items: string[] = [];
    selectedControls.forEach((control) => {
      if (!control.rationale.trim()) items.push(`${control.option.label}: rationale obrigatorio.`);
      if (control.contribution_weight < 0 || control.contribution_weight > 100) items.push(`${control.option.label}: peso tem de ficar entre 0 e 100.`);
      if (control.existingLinks.length > 0) items.push(`${control.option.label}: este mecanismo ja esta associado ao controlo.`);
      if (control.mandatory && control.implementation_status === "not_implemented") items.push(`${control.option.label}: obrigatorio e nao implementado vai gerar gap.`);
      if (control.implementation_status === "implemented_evidenced" && !hasValidApprovedEvidence) {
        items.push(`${control.option.label}: marcado como implementado e evidenciado sem evidencia valida aprovada.`);
      }
    });
    return items;
  }, [hasValidApprovedEvidence, selectedControls]);

  const updateControl = useCallback((id: string, patch: Partial<SelectedControl>) => {
    setSelectedControls((current) => current.map((control) => (
      String(control.option.id) === id ? { ...control, ...patch } : control
    )));
  }, []);

  const loadControlContext = useCallback(async (id: string, currentMechanismId?: string) => {
    updateControl(id, { loading: true, error: undefined });
    try {
      const [traceability, existingLinks] = await Promise.all([
        mappingReviewApi.getInternalControlTraceability(id, {
          mode: "official",
          include_evidence: true,
          include_gaps: true,
          include_scores: true,
          max_depth: 3,
        }).catch(() => null),
        currentMechanismId
          ? mappingReviewApi.listMappings("internal_control_mechanism", {
            internal_control: id,
            mechanism: currentMechanismId,
            page_size: 100,
          }).catch(() => [])
          : Promise.resolve([]),
      ]);

      updateControl(id, {
        traceability,
        existingLinks,
        loading: false,
      });
    } catch (err: any) {
      updateControl(id, {
        traceability: null,
        existingLinks: [],
        loading: false,
        error: getApiErrorMessage(err, "Nao foi possivel carregar impacto do controlo."),
      });
    }
  }, [updateControl]);

  useEffect(() => {
    selectedControls.forEach((control) => {
      const key = `${control.option.id}:${mechanismId || "new"}`;
      if (!control.loading || contextLoadRequestedRef.current.has(key)) return;
      contextLoadRequestedRef.current.add(key);
      void loadControlContext(String(control.option.id), mechanismId);
    });
  }, [loadControlContext, mechanismId, selectedControls]);

  useEffect(() => {
    contextLoadRequestedRef.current.clear();
    setSelectedControls((current) => current.map((control) => ({ ...control, loading: true })));
  }, [mechanismId]);

  useEffect(() => {
    const loadEvidence = async () => {
      if (!mechanismId) {
        setExistingEvidenceLinks([]);
        return;
      }
      setLoadingEvidence(true);
      try {
        const links = await mappingReviewApi.listMappings("evidence_link", {
          target_type: "mechanism",
          target_id: mechanismId,
          page_size: 500,
        });
        setExistingEvidenceLinks(links);
      } catch {
        setExistingEvidenceLinks([]);
      } finally {
        setLoadingEvidence(false);
      }
    };
    void loadEvidence();
  }, [mechanismId]);

  const addControl = (option: SearchOption) => {
    if (selectedControlIds.has(String(option.id))) return;
    const control: SelectedControl = {
      option,
      relationship_type: "primary",
      contribution_weight: 100,
      mandatory: true,
      implementation_status: "planned",
      rationale: "Associacao criada no MechanismWizard para operacionalizar o controlo interno.",
      confidence_score: 100,
      traceability: null,
      existingLinks: [],
      loading: true,
    };
    setSelectedControls((current) => [...current, control]);
  };

  const removeControl = (id: string) => {
    setSelectedControls((current) => current.filter((control) => String(control.option.id) !== id));
  };

  const addEvidence = (option: SearchOption) => {
    if (selectedEvidenceIds.has(String(option.id))) return;
    setSelectedEvidence((current) => [
      ...current,
      {
        option,
        rationale: "Evidencia associada ao mecanismo atraves do MechanismWizard.",
      },
    ]);
  };

  const removeEvidence = (id: string) => {
    setSelectedEvidence((current) => current.filter((item) => String(item.option.id) !== id));
  };

  const updateEvidence = (id: string, rationale: string) => {
    setSelectedEvidence((current) => current.map((item) => (
      String(item.option.id) === id ? { ...item, rationale } : item
    )));
  };

  const validateCurrentStep = (stepId: string) => {
    if (stepId === "mechanism") {
      if (mode === "existing" && !selectedMechanism) return "Seleciona um mecanismo existente ou muda para criar novo.";
      if (mode === "new" && !newMechanism.title.trim()) return "Indica o nome/titulo do novo mecanismo.";
    }
    if (stepId === "controls") {
      if (selectedControls.length === 0) return "Seleciona pelo menos um controlo interno.";
      const invalidWeight = selectedControls.find((control) => control.contribution_weight < 0 || control.contribution_weight > 100);
      if (invalidWeight) return `${invalidWeight.option.label}: contribution_weight tem de estar entre 0 e 100.`;
      const missingRationale = selectedControls.find((control) => !control.rationale.trim());
      if (missingRationale) return `${missingRationale.option.label}: rationale e obrigatorio.`;
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
    const firstError = validateCurrentStep("mechanism") || validateCurrentStep("controls");
    if (firstError) {
      setValidationError(firstError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setCreationWarnings([]);

    try {
      const mechanism = mode === "new"
        ? await mappingReviewApi.createMechanism({
          title: newMechanism.title.trim(),
          description: newMechanism.description.trim(),
          mechanism_type: newMechanism.mechanism_type,
        })
        : selectedMechanism?.raw || selectedMechanism;

      const savedMechanismId = String(mechanism.id || selectedMechanism?.id);
      const warningsOut: string[] = [];

      for (const control of selectedControls) {
        try {
          await mappingReviewApi.createInternalControlMechanism({
            internal_control: control.option.id,
            mechanism: savedMechanismId,
            relationship_type: control.relationship_type,
            contribution_weight: control.contribution_weight,
            mandatory: control.mandatory,
            implementation_status: control.implementation_status,
            rationale: control.rationale.trim(),
            confidence_score: control.confidence_score,
          });
        } catch (err: any) {
          warningsOut.push(`${control.option.label}: ${getApiErrorMessage(err, "falha ao criar associacao")}`);
        }
      }

      for (const evidence of selectedEvidence) {
        try {
          await mappingReviewApi.createEvidenceLink({
            evidence_item: evidence.option.id,
            target_type: "mechanism",
            target_id: savedMechanismId,
            link_type: "evidences",
            rationale: evidence.rationale.trim() || "Evidencia associada ao mecanismo.",
            confidence_score: 100,
          });
        } catch (err: any) {
          warningsOut.push(`${evidence.option.label}: ${getApiErrorMessage(err, "falha ao criar EvidenceLink")}`);
        }
      }

      setCreationWarnings(warningsOut);
      setCreatedMechanism({ ...mechanism, id: savedMechanismId, title: mechanism.title || selectedMechanism?.label });
      setValidationError(null);
    } catch (err: any) {
      setSaveError(getApiErrorMessage(err, "Nao foi possivel concluir o wizard."));
    } finally {
      setSaving(false);
    }
  };

  if (createdMechanism) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-6 pb-16">
        <section className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Mecanismo processado</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{createdMechanism.title}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                O mecanismo ficou associado aos controlos internos selecionados. As associacoes nascem em draft para revisao humana.
              </p>
              {creationWarnings.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  <p className="font-bold">Concluido com avisos:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {creationWarnings.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/governance/mapping-review" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                  <GitBranch className="h-4 w-4" />
                  Mapping Review
                </Link>
                <a href={`/api/governance/traceability/mechanism/${createdMechanism.id}/?include_scores=true&include_gaps=true&include_evidence=true`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                  <Network className="h-4 w-4" />
                  Traceability API
                </a>
                {selectedEvidence.length === 0 && !hasValidApprovedEvidence && (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                    <FileCheck2 className="h-4 w-4" />
                    EvidenceWizard futuro
                  </span>
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
        <Link to="/governance/mechanisms" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar a mecanismos
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <Wrench className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Mechanism Wizard</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Criar mecanismo reutilizavel</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                Cria ou reutiliza mecanismos, associa-os a controlos internos e define o estado operacional para scoring por propagacao.
              </p>
            </div>
          </div>
          <div className="grid min-w-[260px] grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{selectedControls.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{impact.frameworks.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{selectedEvidence.length + existingEvidenceLinks.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Evidencias</p>
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

      {currentStepId === "mechanism" && (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">Origem do mecanismo</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Reutiliza a biblioteca existente ou cria um mecanismo novo.</p>
            <div className="mt-4 space-y-2">
              {[
                { value: "existing", label: "Selecionar existente" },
                { value: "new", label: "Criar novo" },
              ].map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setMode(option.value as WizardMode)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-bold ${
                    mode === option.value ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-indigo-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Exemplos</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {mechanismExamples.slice(0, 12).map((example) => (
                  <span key={example} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {example}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            {mode === "existing" ? (
              <>
                <h2 className="mb-3 text-base font-bold text-slate-950">Selecionar mecanismo existente</h2>
                <SearchPicker kind="mechanism" selected={selectedMechanism} onSelect={setSelectedMechanism} placeholder="Pesquisar por nome, titulo ou descricao..." />
              </>
            ) : (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-slate-950">Novo mecanismo</h2>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome / titulo *</span>
                  <input
                    value={newMechanism.title}
                    onChange={(event) => setNewMechanism((current) => ({ ...current, title: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="MFA"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tipo</span>
                  <select
                    value={newMechanism.mechanism_type}
                    onChange={(event) => setNewMechanism((current) => ({ ...current, mechanism_type: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  >
                    {mechanismTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descricao</span>
                  <textarea
                    value={newMechanism.description}
                    onChange={(event) => setNewMechanism((current) => ({ ...current, description: event.target.value }))}
                    className="mt-2 min-h-36 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Descreve como o mecanismo opera e que risco ajuda a reduzir."
                  />
                </label>
              </div>
            )}
          </section>
        </div>
      )}

      {currentStepId === "controls" && (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-slate-950">Pesquisar controlos internos</h2>
            <SearchPicker kind="internal_control" selected={null} onSelect={(option) => option && addControl(option)} placeholder="Pesquisar por codigo, titulo, descricao ou dominio..." />
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-950">Associacoes InternalControlMechanism</h2>
                <p className="text-xs font-semibold text-slate-500">Define estado operacional, peso, obrigatoriedade e rationale por controlo.</p>
              </div>
              <Badge className="border-slate-200 bg-slate-50 text-slate-500">{selectedControls.length} selecionado(s)</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {selectedControls.map((control) => (
                <div key={control.option.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">{control.option.label}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{control.option.description || control.option.meta || "Sem descricao."}</p>
                      {control.loading && <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar impacto</p>}
                      {control.error && <p className="mt-2 text-xs font-bold text-amber-700">{control.error}</p>}
                      {control.existingLinks.length > 0 && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                          Este mecanismo ja tem {control.existingLinks.length} associacao(oes) com este controlo.
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => removeControl(String(control.option.id))} className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Relationship type</span>
                      <select value={control.relationship_type} onChange={(event) => updateControl(String(control.option.id), { relationship_type: event.target.value as RelationshipType })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                        {relationshipTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Implementation status</span>
                      <select value={control.implementation_status} onChange={(event) => updateControl(String(control.option.id), { implementation_status: event.target.value as ImplementationStatus })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                        {implementationStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Contribution weight</span>
                      <input type="number" min={0} max={100} value={control.contribution_weight} onChange={(event) => updateControl(String(control.option.id), { contribution_weight: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Confidence score</span>
                      <input type="number" min={0} max={100} value={control.confidence_score} onChange={(event) => updateControl(String(control.option.id), { confidence_score: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 xl:mt-6">
                      <input type="checkbox" checked={control.mandatory} onChange={(event) => updateControl(String(control.option.id), { mandatory: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                      Obrigatorio
                    </label>
                  </div>

                  <label className="mt-3 block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Rationale *</span>
                    <input value={control.rationale} onChange={(event) => updateControl(String(control.option.id), { rationale: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                </div>
              ))}
              {selectedControls.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                  Seleciona pelo menos um controlo interno para criar associacoes.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {currentStepId === "evidence" && (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-slate-950">Associar EvidenceItem</h2>
            <SearchPicker kind="evidence_item" selected={null} onSelect={(option) => option && addEvidence(option)} placeholder="Pesquisar evidencia por titulo, fonte ou referencia..." />
            <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-500">
              EvidenceLinks criadas pelo wizard ficam em draft. Para contarem oficialmente no score, devem ser aprovadas no Mapping Review.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-950">Evidencias relacionadas</h2>
                <p className="text-xs font-semibold text-slate-500">Existentes no mecanismo e novas ligacoes propostas.</p>
              </div>
              {loadingEvidence && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>

            <div className="mt-4 space-y-3">
              {existingEvidenceLinks.map((link) => (
                <div key={link.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-950">{link.sourceLabel}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{link.raw?.evidence_type || "EvidenceItem"} - {link.raw?.evidence_status || "status n/d"}</p>
                    </div>
                    <Badge className={statusTone(link.validation_status)}>{link.validation_status}</Badge>
                  </div>
                </div>
              ))}

              {selectedEvidence.map((item) => (
                <div key={item.option.id} className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-indigo-950">{item.option.label}</p>
                      <p className="mt-1 text-xs font-semibold text-indigo-700">{item.option.description || item.option.meta || "EvidenceItem selecionada."}</p>
                    </div>
                    <button type="button" onClick={() => removeEvidence(String(item.option.id))} className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </button>
                  </div>
                  <label className="mt-3 block">
                    <span className="text-xs font-bold uppercase tracking-wide text-indigo-700">Rationale</span>
                    <input value={item.rationale} onChange={(event) => updateEvidence(String(item.option.id), event.target.value)} className="mt-2 w-full rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                </div>
              ))}

              {existingEvidenceLinks.length === 0 && selectedEvidence.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                  Sem evidencias associadas neste momento.
                </div>
              )}
            </div>

            {selectedControls.some((control) => control.implementation_status === "implemented_evidenced") && !hasValidApprovedEvidence && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Este mecanismo esta marcado como implementado e evidenciado, mas ainda nao existe evidencia valida aprovada.
              </div>
            )}
          </section>
        </div>
      )}

      {currentStepId === "impact" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Network className="h-5 w-5 text-indigo-700" />
              <div>
                <h2 className="text-base font-bold text-slate-950">Impacto estrutural</h2>
                <p className="text-xs font-semibold text-slate-500">Calculado a partir da Traceability API dos controlos internos selecionados.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ImpactList title="Frameworks impactadas" items={impact.frameworks} />
              <ImpactList title="Framework controls" items={impact.frameworkControls} />
              <ImpactList title="Policies impactadas" items={impact.policies} />
              <ImpactList title="Governance documents" items={impact.documents} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">Scores atuais</h2>
            <div className="mt-4 space-y-3">
              {selectedControls.map((control) => (
                <div key={control.option.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-950">{control.option.label}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="border-emerald-100 bg-emerald-50 text-emerald-700">official {scoreValue(control.traceability?.scores?.official)}</Badge>
                    <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">simulation {scoreValue(control.traceability?.scores?.simulation)}</Badge>
                    <Badge className={statusTone(control.implementation_status)}>{implementationLabel(control.implementation_status)}</Badge>
                  </div>
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
              <h2 className="text-base font-bold text-slate-950">Revisao final</h2>
              <p className="text-xs font-semibold text-slate-500">Confirma o mecanismo, associacoes, evidencias e avisos antes de concluir.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <SummaryTile label="Mecanismo" value={mode === "new" ? newMechanism.title || "-" : selectedMechanism?.label || "-"} />
            <SummaryTile label="Controlos" value={selectedControls.length} />
            <SummaryTile label="Evidencias novas" value={selectedEvidence.length} />
            <SummaryTile label="Frameworks" value={impact.frameworks.length} />
          </div>

          <div className="mt-5 space-y-3">
            {selectedControls.map((control) => (
              <div key={control.option.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{control.option.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{control.rationale}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusTone(control.implementation_status)}>{implementationLabel(control.implementation_status)}</Badge>
                    <Badge className="border-slate-200 bg-white text-slate-500">peso {control.contribution_weight}%</Badge>
                    {control.mandatory && <Badge className="border-amber-200 bg-amber-50 text-amber-700">mandatory</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              <p className="font-bold">Avisos:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <footer className="sticky bottom-0 z-20 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs font-semibold text-slate-500">
            Passo {currentStep + 1} de {steps.length}: <span className="font-bold text-slate-900">{steps[currentStep]}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/governance/mechanisms" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
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
                Concluir
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
        <Badge className="border-slate-200 bg-white text-slate-500">{items.length}</Badge>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.slice(0, 6).map((item) => (
            <div key={item.id || entityLabel(item)} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
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
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
