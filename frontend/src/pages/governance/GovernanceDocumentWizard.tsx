/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  FileText,
  GitBranch,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { mappingReviewApi, type MappingRecord, type SearchOption } from "@/lib/mappingReviewApi";

type DocumentType = "policy" | "standard" | "procedure" | "guideline" | "technical_regulation" | "runbook";
type DocumentStatus = "draft" | "under_review" | "approved" | "published" | "deprecated" | "archived";
type ControlPurpose = "defines" | "implements" | "operationalizes" | "evidences";
type ParentMode = "none" | "policy" | "document";
type SearchKind = "policy" | "governance_document" | "internal_control";

type DocumentForm = {
  document_type: DocumentType;
  title: string;
  version: string;
  owner: string;
  scope: string;
  purpose: string;
  content: string;
  status: DocumentStatus;
  approval_date: string;
  review_date: string;
};

type SelectedControl = {
  option: SearchOption;
  purpose: ControlPurpose;
  rationale: string;
  frameworkMappings: MappingRecord[];
  mechanismMappings: MappingRecord[];
  mechanismEvidenceCounts: Record<string, number>;
  loading: boolean;
  error?: string;
};

type RunbookStepDraft = {
  localId: string;
  step_number: number;
  title: string;
  description: string;
  expected_output: string;
  evidence_required: boolean;
};

const documentTypes: Array<{ value: DocumentType; label: string; description: string; recommendedParent: string }> = [
  { value: "policy", label: "Documento de politica", description: "Apenas cria o documento de governance do tipo policy; nao cria a politica operacional nem o onboarding.", recommendedParent: "Para politicas novas, usa o PolicyWizard." },
  { value: "standard", label: "Norma", description: "Regras minimas e criterios que concretizam uma politica.", recommendedParent: "Normalmente subordinada a uma politica." },
  { value: "procedure", label: "Procedimento", description: "Sequencia de atividades, responsaveis e evidencias.", recommendedParent: "Normalmente subordinado a uma norma." },
  { value: "guideline", label: "Guideline", description: "Orientacao pratica para apoiar decisoes e execucao.", recommendedParent: "Pode apoiar uma politica, norma ou procedimento." },
  { value: "technical_regulation", label: "Regulamento tecnico", description: "Regras tecnicas obrigatorias para sistemas, plataformas ou operacoes.", recommendedParent: "Pode ser independente ou subordinado a uma norma." },
  { value: "runbook", label: "Runbook", description: "Passos operacionais repetiveis com outputs e evidencias.", recommendedParent: "Normalmente subordinado a um procedimento." },
];

const statusOptions: Array<{ value: DocumentStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Em revisao" },
  { value: "approved", label: "Aprovado" },
  { value: "published", label: "Publicado" },
  { value: "deprecated", label: "Deprecated" },
  { value: "archived", label: "Arquivado" },
];

const purposeOptions: Array<{ value: ControlPurpose; label: string }> = [
  { value: "defines", label: "Define" },
  { value: "implements", label: "Implementa" },
  { value: "operationalizes", label: "Operacionaliza" },
  { value: "evidences", label: "Evidencia" },
];

const expectedEvidenceSuggestions = [
  "Relatorio de execucao",
  "Screenshot de configuracao",
  "Ticket de aprovacao",
  "Exportacao tecnica",
  "Log SIEM",
  "Ata ou registo de decisao",
  "Checklist assinada",
  "Resultado de teste",
];

function defaultPurposeForType(type: DocumentType): ControlPurpose {
  if (type === "policy") return "defines";
  if (type === "runbook") return "operationalizes";
  if (type === "guideline") return "implements";
  return "implements";
}

function isDocumentType(value?: string | null): value is DocumentType {
  return documentTypes.some((item) => item.value === value);
}

function suggestedChildType(parentType?: string | null): DocumentType | null {
  if (parentType === "policy") return "standard";
  if (parentType === "standard") return "procedure";
  if (parentType === "procedure") return "runbook";
  return null;
}

function governanceDocumentOption(document: any): SearchOption {
  return {
    id: String(document.id),
    label: `${document.title || document.id}${document.version ? ` v${document.version}` : ""}`,
    description: document.purpose || document.scope || document.content || document.status,
    meta: document.document_type || document.status,
    raw: document,
  };
}

function policyOption(policy: any): SearchOption {
  const code = policy.code ? `${policy.code} - ` : "";
  return {
    id: String(policy.id),
    label: `${code}${policy.title || policy.id}`,
    description: policy.description || policy.scope || policy.status,
    meta: policy.status || policy.owner,
    raw: policy,
  };
}

function inheritedControlOption(link: any): SearchOption | null {
  const id = link.internal_control || link.internal_control_id;
  if (!id) return null;
  const label = link.internal_control_code
    ? `${link.internal_control_code} - ${link.internal_control_title || ""}`.trim()
    : link.internal_control_title || String(id);
  return {
    id: String(id),
    label,
    description: link.internal_control_domain || link.rationale || "Controlo herdado do documento pai.",
    meta: link.purpose || link.validation_status,
    raw: {
      id,
      code: link.internal_control_code,
      title: link.internal_control_title,
      control_domain: link.internal_control_domain,
      source_link: link,
    },
  };
}

function statusTone(status?: string) {
  if (status === "approved" || status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review" || status === "under_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "rejected") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated" || status === "archived") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function labelForStatus(status?: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    under_review: "Em revisao",
    approved: "Aprovado",
    published: "Publicado",
    deprecated: "Deprecated",
    archived: "Arquivado",
    pending_review: "Pendente",
    rejected: "Rejeitado",
  };
  return labels[status || ""] || status || "Sem estado";
}

function labelForDocumentType(type?: string) {
  return documentTypes.find((item) => item.value === type)?.label || type || "Documento";
}

function getApiErrorMessage(err: any, fallback: string) {
  if (typeof err?.message === "string" && err.message) return err.message;
  if (typeof err?.detail === "string") return err.detail;
  return fallback;
}

function isInactiveMapping(mapping: MappingRecord) {
  return mapping.validation_status === "rejected" || mapping.validation_status === "deprecated";
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

function formatNumber(value?: string | number) {
  if (value === undefined || value === null || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(value);
}

function hierarchyWarning(type: DocumentType, parentMode: ParentMode, parentDocument?: SearchOption | null) {
  if (type === "policy") return "Para politicas novas, o PolicyWizard cria tambem associacoes Policy -> InternalControl.";
  if (parentMode === "none") {
    if (type === "standard") return "Uma norma normalmente fica subordinada a uma politica.";
    if (type === "procedure") return "Um procedimento normalmente fica subordinado a uma norma.";
    if (type === "runbook") return "Um runbook normalmente fica subordinado a um procedimento.";
    return "";
  }
  if (parentMode === "policy") {
    if (type === "procedure" || type === "runbook") return "Esta ligacao e permitida, mas normalmente este documento teria uma norma ou procedimento como documento pai.";
    return "";
  }
  const parentType = parentDocument?.raw?.document_type;
  if (parentType === "runbook") return "Runbooks normalmente nao tem documentos subordinados. Podes continuar, mas valida se a hierarquia faz sentido.";
  if (type === "standard" && parentType !== "policy") return "Uma norma costuma ter policy como contexto. Se o documento pai nao for policy, valida a hierarquia.";
  if (type === "procedure" && parentType !== "standard") return "Um procedimento costuma ter uma norma como documento pai.";
  if (type === "runbook" && parentType !== "procedure") return "Um runbook costuma ter um procedimento como documento pai.";
  return "";
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
        if (kind === "policy") results = await mappingReviewApi.searchPolicies(query);
        if (kind === "governance_document") results = await mappingReviewApi.searchGovernanceDocuments(query);
        if (kind === "internal_control") results = await mappingReviewApi.searchInternalControls(query, { page_size: 25 });
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
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100 hover:text-red-700"
            >
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

export default function GovernanceDocumentWizard() {
  const [searchParams] = useSearchParams();
  const prefillAppliedRef = useRef("");
  const contextLoadRequestedRef = useRef<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState(0);
  const [parentMode, setParentMode] = useState<ParentMode>("none");
  const [parentPolicy, setParentPolicy] = useState<SearchOption | null>(null);
  const [parentDocument, setParentDocument] = useState<SearchOption | null>(null);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [form, setForm] = useState<DocumentForm>({
    document_type: "standard",
    title: "",
    version: "1.0",
    owner: "",
    scope: "",
    purpose: "",
    content: "",
    status: "draft",
    approval_date: "",
    review_date: "",
  });
  const [selectedControls, setSelectedControls] = useState<SelectedControl[]>([]);
  const [runbookSteps, setRunbookSteps] = useState<RunbookStepDraft[]>([]);
  const [evidenceInput, setEvidenceInput] = useState("");
  const [expectedEvidence, setExpectedEvidence] = useState<string[]>(["Relatorio de execucao", "Ticket de aprovacao"]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdDocument, setCreatedDocument] = useState<any | null>(null);
  const [creationWarnings, setCreationWarnings] = useState<string[]>([]);
  const parentDocumentParam = searchParams.get("parentDocument");
  const documentTypeParam = searchParams.get("documentType");
  const policyParam = searchParams.get("policy");

  const wizardStepDefs = useMemo(() => {
    const base = [
      { id: "type", label: "Tipo" },
      { id: "parent", label: "Documento pai" },
      { id: "details", label: "Dados gerais" },
      { id: "controls", label: "Controlos" },
      { id: "mechanisms", label: "Mecanismos" },
    ];
    if (form.document_type === "runbook") base.push({ id: "runbook_steps", label: "Runbook steps" });
    base.push({ id: "evidence", label: "Evidencias" }, { id: "review", label: "Revisao" });
    return base;
  }, [form.document_type]);

  useEffect(() => {
    setCurrentStep((step) => Math.min(step, wizardStepDefs.length - 1));
  }, [wizardStepDefs.length]);

  useEffect(() => {
    const defaultPurpose = defaultPurposeForType(form.document_type);
    setSelectedControls((current) => current.map((control) => ({ ...control, purpose: defaultPurpose })));
    if (form.document_type === "runbook") {
      setRunbookSteps((current) => current.length > 0 ? current : [
        {
          localId: crypto.randomUUID(),
          step_number: 1,
          title: "Executar atividade",
          description: "",
          expected_output: "",
          evidence_required: true,
        },
      ]);
    }
  }, [form.document_type]);

  useEffect(() => {
    const key = `${parentDocumentParam || ""}|${documentTypeParam || ""}|${policyParam || ""}`;
    if (!parentDocumentParam && !documentTypeParam && !policyParam) return;
    if (prefillAppliedRef.current === key) return;
    prefillAppliedRef.current = key;

    let cancelled = false;

    const applyPrefill = async () => {
      setPrefillError(null);
      setPrefillNotice("A preparar o wizard com o contexto recebido...");
      const explicitType = isDocumentType(documentTypeParam) ? documentTypeParam : null;
      const notices: string[] = [];

      if (explicitType) {
        setForm((current) => ({ ...current, document_type: explicitType }));
        notices.push(`Tipo documental definido pela ligacao: ${labelForDocumentType(explicitType)}.`);
      }

      try {
        if (parentDocumentParam) {
          const parent = await mappingReviewApi.getGovernanceDocument(parentDocumentParam);
          if (cancelled) return;

          const suggestedType = explicitType || suggestedChildType(parent.document_type);
          setParentMode("document");
          setParentDocument(governanceDocumentOption(parent));

          if (suggestedType) {
            setForm((current) => ({ ...current, document_type: suggestedType }));
            notices.push(`Tipo sugerido a partir do documento pai: ${labelForDocumentType(suggestedType)}.`);
          }

          if (parent.document_type === "runbook") {
            notices.push("O documento pai e um runbook; valida a hierarquia porque runbooks normalmente nao tem subordinados.");
          }

          const inheritedPurpose = defaultPurposeForType(suggestedType || explicitType || "standard");
          const controlPayload: any = await mappingReviewApi.getGovernanceDocumentInternalControls(parentDocumentParam).catch(() => []);
          if (cancelled) return;

          const inheritedControls = (Array.isArray(controlPayload) ? controlPayload : controlPayload?.results || [])
            .map((link: any) => {
              const option = inheritedControlOption(link);
              if (!option) return null;
              contextLoadRequestedRef.current.delete(String(option.id));
              return {
                option,
                purpose: inheritedPurpose,
                rationale: `Associacao sugerida por heranca do documento pai ${parent.title || parent.id}.`,
                frameworkMappings: [],
                mechanismMappings: [],
                mechanismEvidenceCounts: {},
                loading: true,
              } as SelectedControl;
            })
            .filter(Boolean) as SelectedControl[];

          if (inheritedControls.length > 0) {
            setSelectedControls((current) => uniqueBy([...current, ...inheritedControls], (control) => String(control.option.id)));
            notices.push(`${inheritedControls.length} controlo(s) interno(s) herdado(s) como sugestao inicial.`);
          } else {
            notices.push("O documento pai nao tem controlos internos ativos para herdar.");
          }
        } else if (policyParam) {
          const policy = await mappingReviewApi.getPolicy(policyParam);
          if (cancelled) return;
          setParentMode("policy");
          setParentPolicy(policyOption(policy));
          notices.push("Policy recebida por URL e pre-selecionada como contexto legacy.");
        }

        if (!cancelled) {
          setPrefillNotice(notices.join(" ") || "Contexto recebido por URL aplicado ao wizard.");
        }
      } catch (err: any) {
        if (!cancelled) {
          setPrefillNotice(null);
          setPrefillError(getApiErrorMessage(err, "Nao foi possivel carregar o contexto recebido por URL."));
        }
      }
    };

    void applyPrefill();

    return () => {
      cancelled = true;
    };
  }, [documentTypeParam, parentDocumentParam, policyParam]);

  const selectedIds = useMemo(
    () => new Set(selectedControls.map((control) => String(control.option.id))),
    [selectedControls]
  );

  const activeFrameworkMappings = useMemo(
    () => selectedControls.flatMap((control) => control.frameworkMappings.filter((mapping) => !isInactiveMapping(mapping))),
    [selectedControls]
  );

  const impactedFrameworks = useMemo(() => {
    const frameworks = activeFrameworkMappings.map((mapping) => ({
      id: String(mapping.raw?.framework || mapping.raw?.framework_code || mapping.id),
      name: mapping.raw?.framework_name || mapping.raw?.framework_code || "Framework",
      code: mapping.raw?.framework_code || "",
    }));
    return uniqueBy(frameworks, (framework) => framework.id);
  }, [activeFrameworkMappings]);

  const allMechanisms = useMemo(
    () => selectedControls.flatMap((control) => control.mechanismMappings.filter((mapping) => !isInactiveMapping(mapping))),
    [selectedControls]
  );

  const warning = hierarchyWarning(form.document_type, parentMode, parentDocument);

  const basicGaps = useMemo(() => {
    const gaps: Array<{ type: string; severity: string; description: string }> = [];
    selectedControls.forEach((control) => {
      const activeMechanisms = control.mechanismMappings.filter((mapping) => !isInactiveMapping(mapping));
      const activeFrameworks = control.frameworkMappings.filter((mapping) => !isInactiveMapping(mapping));
      if (activeMechanisms.length === 0) {
        gaps.push({ type: "internal_control_without_mechanisms", severity: "medium", description: `${control.option.label} nao tem mecanismos ativos associados.` });
      }
      if (activeFrameworks.length === 0) {
        gaps.push({ type: "internal_control_without_framework_mapping", severity: "medium", description: `${control.option.label} nao tem mapeamento ativo para frameworks.` });
      }
      activeMechanisms.forEach((mechanism) => {
        const status = mechanism.implementation_status;
        const mandatory = mechanism.mandatory;
        const evidenceCount = control.mechanismEvidenceCounts[String(mechanism.targetId || mechanism.raw?.mechanism || mechanism.id)] || 0;
        if (mandatory && status === "not_implemented") {
          gaps.push({ type: "mandatory_mechanism_not_implemented", severity: "high", description: `${mechanism.targetLabel} e obrigatorio mas nao esta implementado.` });
        }
        if (status === "implemented_evidenced" && evidenceCount === 0) {
          gaps.push({ type: "mechanism_without_approved_evidence", severity: "medium", description: `${mechanism.targetLabel} pede evidencia, mas nao foram encontradas evidencias approved.` });
        }
      });
    });
    return gaps;
  }, [selectedControls]);

  const updateControl = useCallback((id: string, patch: Partial<SelectedControl>) => {
    setSelectedControls((current) => current.map((control) => (
      String(control.option.id) === id ? { ...control, ...patch } : control
    )));
  }, []);

  const loadControlContext = useCallback(async (id: string) => {
    updateControl(id, { loading: true, error: undefined });
    try {
      const [frameworkMappings, mechanismMappings] = await Promise.all([
        mappingReviewApi.listMappings("internal_control_framework_mapping", { internal_control: id, page_size: 500 }),
        mappingReviewApi.listMappings("internal_control_mechanism", { internal_control: id, page_size: 500 }),
      ]);

      const uniqueMechanismIds = uniqueBy(
        mechanismMappings
          .map((mapping) => String(mapping.targetId || mapping.raw?.mechanism || ""))
          .filter(Boolean),
        (mechanismId) => mechanismId
      );
      const evidenceEntries = await Promise.all(
        uniqueMechanismIds.map(async (mechanismId) => {
          try {
            const links = await mappingReviewApi.listMappings("evidence_link", {
              target_type: "mechanism",
              target_id: mechanismId,
              page_size: 100,
            });
            const count = links.filter((link) => link.validation_status === "approved").length;
            return [mechanismId, count] as const;
          } catch {
            return [mechanismId, 0] as const;
          }
        })
      );

      updateControl(id, {
        frameworkMappings,
        mechanismMappings,
        mechanismEvidenceCounts: Object.fromEntries(evidenceEntries),
        loading: false,
      });
    } catch (err: any) {
      updateControl(id, {
        frameworkMappings: [],
        mechanismMappings: [],
        mechanismEvidenceCounts: {},
        loading: false,
        error: getApiErrorMessage(err, "Nao foi possivel carregar contexto do controlo."),
      });
    }
  }, [updateControl]);

  useEffect(() => {
    selectedControls.forEach((control) => {
      const id = String(control.option.id);
      if (!control.loading || contextLoadRequestedRef.current.has(id)) return;
      contextLoadRequestedRef.current.add(id);
      void loadControlContext(id);
    });
  }, [loadControlContext, selectedControls]);

  const addControl = (option: SearchOption) => {
    if (selectedIds.has(String(option.id))) return;
    contextLoadRequestedRef.current.delete(String(option.id));
    const control: SelectedControl = {
      option,
      purpose: defaultPurposeForType(form.document_type),
      rationale: `Associacao criada no GovernanceDocumentWizard para ${labelForDocumentType(form.document_type)}.`,
      frameworkMappings: [],
      mechanismMappings: [],
      mechanismEvidenceCounts: {},
      loading: true,
    };
    setSelectedControls((current) => [...current, control]);
  };

  const removeControl = (id: string) => {
    contextLoadRequestedRef.current.delete(id);
    setSelectedControls((current) => current.filter((control) => String(control.option.id) !== id));
  };

  const addRunbookStep = () => {
    setRunbookSteps((current) => [
      ...current,
      {
        localId: crypto.randomUUID(),
        step_number: current.length + 1,
        title: "",
        description: "",
        expected_output: "",
        evidence_required: false,
      },
    ]);
  };

  const updateRunbookStep = (localId: string, patch: Partial<RunbookStepDraft>) => {
    setRunbookSteps((current) => current.map((step) => (
      step.localId === localId ? { ...step, ...patch } : step
    )));
  };

  const reorderRunbookStep = (localId: string, direction: -1 | 1) => {
    setRunbookSteps((current) => {
      const index = current.findIndex((step) => step.localId === localId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy.map((step, idx) => ({ ...step, step_number: idx + 1 }));
    });
  };

  const removeRunbookStep = (localId: string) => {
    setRunbookSteps((current) => current.filter((step) => step.localId !== localId).map((step, idx) => ({ ...step, step_number: idx + 1 })));
  };

  const addExpectedEvidence = (value: string) => {
    const text = value.trim();
    if (!text) return;
    setExpectedEvidence((current) => current.includes(text) ? current : [...current, text]);
    setEvidenceInput("");
  };

  const validateCurrentStep = (stepId: string) => {
    if (stepId === "type" && !form.document_type) return "Seleciona o tipo de documento.";
    if (stepId === "details") {
      if (!form.title.trim()) return "Indica o titulo do documento.";
      if (!form.version.trim()) return "Indica a versao do documento.";
    }
    if (stepId === "runbook_steps" && form.document_type === "runbook") {
      if (runbookSteps.length === 0) return "Adiciona pelo menos um passo ao runbook.";
      if (runbookSteps.some((step) => !step.title.trim())) return "Todos os passos do runbook precisam de titulo.";
    }
    return null;
  };

  const goNext = () => {
    const stepId = wizardStepDefs[currentStep].id;
    const error = validateCurrentStep(stepId);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setCurrentStep((step) => Math.min(step + 1, wizardStepDefs.length - 1));
  };

  const goBack = () => {
    setValidationError(null);
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const createDocument = async (forceDraft = false) => {
    const firstError = validateCurrentStep("type") || validateCurrentStep("details") || validateCurrentStep("runbook_steps");
    if (firstError) {
      setValidationError(firstError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setCreationWarnings([]);

    const expectedEvidenceSection = expectedEvidence.length
      ? `\n\nEvidencias esperadas:\n${expectedEvidence.map((item) => `- ${item}`).join("\n")}`
      : "";

    const payload = {
      title: form.title.trim(),
      document_type: form.document_type,
      version: form.version.trim(),
      status: forceDraft ? "draft" : form.status,
      owner: form.owner.trim(),
      parent_document: parentMode === "document" ? parentDocument?.id || null : null,
      scope: form.scope.trim(),
      purpose: form.purpose.trim(),
      content: `${form.content.trim()}${expectedEvidenceSection}`.trim(),
      approval_date: form.approval_date || null,
      review_date: form.review_date || null,
      legacy_policy: parentMode === "policy" ? parentPolicy?.id || null : null,
      legacy_technical_regulation: null,
      legacy_procedure: null,
      is_active: true,
    };

    try {
      const saved = await mappingReviewApi.createGovernanceDocument(payload);
      const warnings: string[] = [];

      for (const control of selectedControls) {
        try {
          await mappingReviewApi.createGovernanceDocumentControl({
            document: saved.id,
            internal_control: control.option.id,
            purpose: control.purpose,
            rationale: control.rationale.trim() || `Associacao criada no GovernanceDocumentWizard para ${labelForDocumentType(form.document_type)}.`,
            confidence_score: 100,
          });
        } catch (err: any) {
          warnings.push(`${control.option.label}: ${getApiErrorMessage(err, "falha ao criar associacao")}`);
        }
      }

      if (form.document_type === "runbook") {
        for (const [index, step] of runbookSteps.entries()) {
          try {
            await mappingReviewApi.createRunbookStep({
              runbook: saved.id,
              step_number: index + 1,
              title: step.title.trim(),
              description: step.description.trim(),
              expected_output: step.expected_output.trim(),
              evidence_required: step.evidence_required,
            });
          } catch (err: any) {
            warnings.push(`Passo ${index + 1}: ${getApiErrorMessage(err, "falha ao criar passo")}`);
          }
        }
      }

      setCreationWarnings(warnings);
      setCreatedDocument(saved);
      setValidationError(null);
    } catch (err: any) {
      setSaveError(getApiErrorMessage(err, "Nao foi possivel criar o documento."));
    } finally {
      setSaving(false);
    }
  };

  const currentStepId = wizardStepDefs[currentStep].id;
  const stepLabels = wizardStepDefs.map((step) => step.label);

  if (createdDocument) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-6 pb-16">
        <section className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Documento criado</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{createdDocument.title || form.title}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                O documento foi criado e foram processadas as associacoes a controlos internos e passos de runbook aplicaveis.
              </p>
              {creationWarnings.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  <p className="font-bold">Criado com avisos:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {creationWarnings.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={`/governance/documents/${createdDocument.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                  <FileText className="h-4 w-4" />
                  Abrir documento
                </Link>
                <Link to="/governance/mapping-review" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                  <GitBranch className="h-4 w-4" />
                  Mapping Review
                </Link>
                <a href={`/api/governance/traceability/governance-document/${createdDocument.id}/?include_scores=true&include_gaps=true`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                  <ShieldCheck className="h-4 w-4" />
                  Traceability API
                </a>
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
        <Link to="/governance" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar a governance
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governance Document Wizard</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Criar documento de governance</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                Cria normas, procedimentos, guidelines, regulamentos tecnicos e runbooks ligados a controlos internos.
              </p>
            </div>
          </div>
          <div className="grid min-w-[260px] grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{selectedControls.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{allMechanisms.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Mecanismos</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{impactedFrameworks.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
            </div>
          </div>
        </div>
      </header>

      <WizardStepper steps={stepLabels} currentStep={currentStep} />

      {prefillNotice && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{prefillNotice}</span>
          </div>
        </div>
      )}

      {prefillError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{prefillError}</span>
          </div>
        </div>
      )}

      {(validationError || saveError) && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {validationError || saveError}
          </div>
        </div>
      )}

      {currentStepId === "type" && (
        <section className="grid gap-4 lg:grid-cols-3">
          {documentTypes.map((type) => {
            const selected = form.document_type === type.value;
            return (
              <button
                type="button"
                key={type.value}
                onClick={() => setForm((current) => ({ ...current, document_type: type.value }))}
                className={`rounded-2xl border p-5 text-left transition ${
                  selected ? "border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm" : "border-slate-100 bg-white text-slate-700 hover:border-indigo-100 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${selected ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                    {type.value}
                  </span>
                  {selected && <CheckCircle2 className="h-5 w-5 text-indigo-700" />}
                </div>
                <h2 className="mt-4 text-base font-bold">{type.label}</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{type.description}</p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">{type.recommendedParent}</p>
              </button>
            );
          })}
          {form.document_type === "policy" && (
            <div className="lg:col-span-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Este fluxo cria apenas um GovernanceDocument do tipo policy. Para criar uma politica operacional com owner, capitulos, controlos internos e onboarding, usa o <Link to="/governance/policies/wizard" className="font-bold underline">PolicyWizard</Link>.
            </div>
          )}
        </section>
      )}

      {currentStepId === "parent" && (
        <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">Relacao hierarquica</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Escolhe se o documento nasce independente, ligado a uma policy legacy ou subordinado a outro GovernanceDocument.</p>
            <div className="mt-4 space-y-2">
              {[
                { value: "none", label: "Sem relacao" },
                { value: "policy", label: "Policy existente" },
                { value: "document", label: "GovernanceDocument pai" },
              ].map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setParentMode(option.value as ParentMode)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-bold ${
                    parentMode === option.value ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-indigo-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            {parentMode === "none" && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                O documento sera criado sem parent_document nem legacy_policy.
              </div>
            )}
            {parentMode === "policy" && (
              <>
                <h2 className="mb-3 text-base font-bold text-slate-950">Selecionar policy existente</h2>
                <SearchPicker kind="policy" selected={parentPolicy} onSelect={setParentPolicy} placeholder="Pesquisar politica por codigo ou titulo..." />
              </>
            )}
            {parentMode === "document" && (
              <>
                <h2 className="mb-3 text-base font-bold text-slate-950">Selecionar GovernanceDocument pai</h2>
                <SearchPicker kind="governance_document" selected={parentDocument} onSelect={setParentDocument} placeholder="Pesquisar documento por titulo..." />
              </>
            )}
            {warning && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {warning}
              </div>
            )}
          </div>
        </section>
      )}

      {currentStepId === "details" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_160px_220px]">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Titulo *</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="Norma de Gestao de Acessos"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Versao *</span>
              <input
                value={form.version}
                onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as DocumentStatus }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner</span>
              <input value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Data de aprovacao</span>
              <input type="date" value={form.approval_date} onChange={(event) => setForm((current) => ({ ...current, approval_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Data de revisao</span>
              <input type="date" value={form.review_date} onChange={(event) => setForm((current) => ({ ...current, review_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ambito</span>
              <textarea value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))} className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Proposito</span>
              <textarea value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Conteudo</span>
            <textarea value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} className="mt-2 min-h-44 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
          </label>
        </section>
      )}

      {currentStepId === "controls" && (
        <div className="grid gap-6 xl:grid-cols-[430px_1fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-slate-950">Pesquisar controlos internos</h2>
            <SearchPicker kind="internal_control" selected={null} onSelect={(option) => option && addControl(option)} placeholder="Pesquisar por codigo, titulo ou descricao..." />
          </section>
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-950">Controlos associados</h2>
                <p className="text-xs font-semibold text-slate-500">Define o papel do documento em cada controlo interno.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{selectedControls.length} selecionado(s)</span>
            </div>
            <div className="mt-4 space-y-3">
              {selectedControls.map((control) => (
                <div key={control.option.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">{control.option.label}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{control.option.description || "Sem descricao."}</p>
                      {control.loading && <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar contexto</p>}
                      {control.error && <p className="mt-2 text-xs font-bold text-amber-700">{control.error}</p>}
                    </div>
                    <button type="button" onClick={() => removeControl(String(control.option.id))} className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Purpose</span>
                      <select value={control.purpose} onChange={(event) => updateControl(String(control.option.id), { purpose: event.target.value as ControlPurpose })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                        {purposeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Rationale</span>
                      <input value={control.rationale} onChange={(event) => updateControl(String(control.option.id), { rationale: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                    </label>
                  </div>
                </div>
              ))}
              {selectedControls.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                  O documento pode ser criado sem controlos, mas a traceability sera mais fraca.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {currentStepId === "mechanisms" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Wrench className="h-5 w-5 text-indigo-700" />
              <div>
                <h2 className="text-base font-bold text-slate-950">Mecanismos relacionados</h2>
                <p className="text-xs font-semibold text-slate-500">Lidos a partir dos controlos internos selecionados. A criacao ou correcao fica no Mapping Review.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {selectedControls.map((control) => {
                const activeMechanisms = control.mechanismMappings.filter((mapping) => !isInactiveMapping(mapping));
                return (
                  <div key={control.option.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-950">{control.option.label}</p>
                    {activeMechanisms.length === 0 ? (
                      <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-800">
                        Sem mecanismos ativos associados.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {activeMechanisms.map((mapping) => {
                          const mechanismId = String(mapping.targetId || mapping.raw?.mechanism || mapping.id);
                          const evidenceCount = control.mechanismEvidenceCounts[mechanismId] || 0;
                          return (
                            <div key={mapping.id} className="rounded-xl bg-white px-3 py-3 ring-1 ring-slate-100">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <p className="text-sm font-bold text-slate-900">{mapping.targetLabel}</p>
                                <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(mapping.validation_status)}`}>
                                  {labelForStatus(mapping.validation_status)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">status: {mapping.implementation_status || "n/d"}</span>
                                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">peso: {formatNumber(mapping.contribution_weight)}</span>
                                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{mapping.mandatory ? "mandatory" : "optional"}</span>
                                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">evidencias approved: {evidenceCount}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {selectedControls.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                  Seleciona controlos internos para ver mecanismos relacionados.
                </div>
              )}
            </div>
          </section>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gaps basicos</p>
              <div className="mt-3 space-y-2">
                {basicGaps.map((gap) => (
                  <div key={`${gap.type}-${gap.description}`} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{gap.type} - {gap.severity}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-900">{gap.description}</p>
                  </div>
                ))}
                {basicGaps.length === 0 && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800">
                    Sem gaps imediatos na selecao atual.
                  </div>
                )}
              </div>
            </div>
            <Link to="/governance/mapping-review" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <GitBranch className="h-4 w-4" />
              Ir para Mapping Review
            </Link>
          </aside>
        </div>
      )}

      {currentStepId === "runbook_steps" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950">Runbook steps</h2>
              <p className="text-xs font-semibold text-slate-500">Os numeros sao normalizados pela ordem visual ao criar o documento.</p>
            </div>
            <button type="button" onClick={addRunbookStep} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <Plus className="h-4 w-4" />
              Adicionar passo
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {runbookSteps.map((step, index) => (
              <div key={step.localId} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-xs font-black text-indigo-700 ring-1 ring-indigo-100">{index + 1}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => reorderRunbookStep(step.localId, -1)} disabled={index === 0} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => reorderRunbookStep(step.localId, 1)} disabled={index === runbookSteps.length - 1} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeRunbookStep(step.localId)} className="rounded-lg border border-red-100 bg-white p-2 text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Titulo *</span>
                    <input value={step.title} onChange={(event) => updateRunbookStep(step.localId, { title: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <label className="mt-8 flex items-center gap-2 text-sm font-bold text-slate-600">
                    <input type="checkbox" checked={step.evidence_required} onChange={(event) => updateRunbookStep(step.localId, { evidence_required: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    Exige evidencia
                  </label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descricao</span>
                    <textarea value={step.description} onChange={(event) => updateRunbookStep(step.localId, { description: event.target.value })} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Output esperado</span>
                    <textarea value={step.expected_output} onChange={(event) => updateRunbookStep(step.localId, { expected_output: event.target.value })} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {currentStepId === "evidence" && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Evidencias esperadas</h2>
              <p className="text-xs font-semibold text-slate-500">Lista textual guardada no conteudo do documento. EvidenceItem fica para um wizard futuro.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {expectedEvidenceSuggestions.map((item) => (
              <button key={item} type="button" onClick={() => addExpectedEvidence(item)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
                + {item}
              </button>
            ))}
          </div>
          <div className="mt-5 flex gap-3">
            <input value={evidenceInput} onChange={(event) => setEvidenceInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addExpectedEvidence(evidenceInput); } }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="Adicionar evidencia esperada..." />
            <button type="button" onClick={() => addExpectedEvidence(evidenceInput)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {expectedEvidence.map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 ring-1 ring-indigo-100">
                {item}
                <button type="button" onClick={() => setExpectedEvidence((current) => current.filter((entry) => entry !== item))} className="text-indigo-500 hover:text-red-700">x</button>
              </span>
            ))}
            {expectedEvidence.length === 0 && <p className="text-sm font-semibold text-slate-500">Sem evidencias esperadas definidas.</p>}
          </div>
        </section>
      )}

      {currentStepId === "review" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Resumo do documento</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">{form.title || "Sem titulo"}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo</p><p className="mt-1 text-sm font-bold text-slate-900">{labelForDocumentType(form.document_type)}</p></div>
                <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Versao</p><p className="mt-1 text-sm font-bold text-slate-900">{form.version}</p></div>
                <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estado</p><p className="mt-1 text-sm font-bold text-slate-900">{labelForStatus(form.status)}</p></div>
                <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner</p><p className="mt-1 text-sm font-bold text-slate-900">{form.owner || "-"}</p></div>
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Parent</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {parentMode === "none" && "Sem parent"}
                  {parentMode === "policy" && (parentPolicy?.label || "Policy nao selecionada")}
                  {parentMode === "document" && (parentDocument?.label || "Documento pai nao selecionado")}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Controlos internos</p>
              <div className="mt-3 space-y-2">
                {selectedControls.map((control) => (
                  <div key={control.option.id} className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-bold text-slate-900">{control.option.label}</p>
                      <span className="w-fit rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">{control.purpose}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{control.rationale || "Sem rationale."}</p>
                  </div>
                ))}
                {selectedControls.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">Sem controlos associados.</p>}
              </div>
            </div>
            {form.document_type === "runbook" && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Runbook steps</p>
                <div className="mt-3 space-y-2">
                  {runbookSteps.map((step, index) => (
                    <div key={step.localId} className="rounded-xl bg-slate-50 px-4 py-3">
                      <p className="text-sm font-bold text-slate-900">{index + 1}. {step.title || "Sem titulo"}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{step.expected_output || "Sem output esperado."}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Impacto</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center"><p className="text-2xl font-bold text-slate-950">{selectedControls.length}</p><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Controlos</p></div>
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center"><p className="text-2xl font-bold text-slate-950">{allMechanisms.length}</p><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Mecanismos</p></div>
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center"><p className="text-2xl font-bold text-slate-950">{impactedFrameworks.length}</p><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p></div>
                <div className="rounded-xl bg-amber-50 px-3 py-3 text-center"><p className="text-2xl font-bold text-amber-800">{basicGaps.length}</p><p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">Gaps</p></div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evidencias esperadas</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {expectedEvidence.map((item) => <span key={item} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">{item}</span>)}
                {expectedEvidence.length === 0 && <p className="text-sm font-semibold text-slate-500">Sem evidencias definidas.</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Frameworks impactadas</p>
              <div className="mt-3 space-y-2">
                {impactedFrameworks.map((framework) => (
                  <div key={framework.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-sm font-bold text-slate-900">{framework.name}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{framework.code || "Framework"}</p>
                  </div>
                ))}
                {impactedFrameworks.length === 0 && <p className="text-sm font-semibold text-slate-500">Nenhuma framework impactada ainda.</p>}
              </div>
            </div>
          </aside>
        </div>
      )}

      <footer className="sticky bottom-0 z-20 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs font-semibold text-slate-500">
            Passo {currentStep + 1} de {wizardStepDefs.length}: <span className="font-bold text-slate-900">{wizardStepDefs[currentStep].label}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/governance" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              Cancelar
            </Link>
            <button type="button" onClick={goBack} disabled={currentStep === 0 || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>
            {currentStep < wizardStepDefs.length - 1 ? (
              <button type="button" onClick={goNext} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                Seguinte
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button type="button" onClick={() => createDocument(true)} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Guardar draft
                </button>
                <button type="button" onClick={() => createDocument(false)} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Criar documento
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
