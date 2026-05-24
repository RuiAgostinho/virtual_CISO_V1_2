/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
} from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";
import { mappingReviewApi, type MappingRecord, type SearchOption } from "@/lib/mappingReviewApi";

type Applicability = "mandatory" | "recommended" | "not_applicable";

type PolicyGeneralForm = {
  code: string;
  title: string;
  version: string;
  owner: string;
  scope: string;
  purpose: string;
  status: string;
  approval_date: string;
  review_date: string;
};

type PolicyDomain = {
  id: string;
  code: string;
  label: string;
  description: string;
  searchHint: string;
  documents: Array<{ type: string; title: string; purpose: string }>;
};

type SelectedControl = {
  option: SearchOption;
  applicability: Applicability;
  rationale: string;
  impacts: MappingRecord[];
  impactLoading: boolean;
  impactError?: string;
};

const steps = [
  "Dados gerais",
  "Dominio",
  "Controlos internos",
  "Frameworks impactadas",
  "Documentos sugeridos",
  "Revisao final",
];

const statusOptions = [
  { value: "draft", label: "Rascunho" },
  { value: "active", label: "Ativa" },
  { value: "review", label: "Em revisao" },
  { value: "obsolete", label: "Obsoleta" },
];

const applicabilityOptions: Array<{ value: Applicability; label: string }> = [
  { value: "mandatory", label: "Obrigatorio" },
  { value: "recommended", label: "Recomendado" },
  { value: "not_applicable", label: "Nao aplicavel" },
];

const policyDomains: PolicyDomain[] = [
  {
    id: "access_control",
    code: "AC",
    label: "Controlo de acessos",
    description: "Identidade, autenticacao, autorizacao, privilegios e revisao periodica de acessos.",
    searchHint: "acesso autenticacao identidade privilegiado mfa",
    documents: [
      { type: "Norma", title: "Norma de Gestao de Acessos", purpose: "Traduz a politica em regras minimas de autenticacao, autorizacao e privilegios." },
      { type: "Procedimento", title: "Procedimento de Revisao de Acessos", purpose: "Define periodicidade, evidencias e responsaveis pela revisao." },
      { type: "Runbook", title: "Runbook de Exportacao de Evidencia de Acessos", purpose: "Operacionaliza a recolha de logs, listas de utilizadores e aprovacoes." },
      { type: "Procedimento", title: "Procedimento de Offboarding", purpose: "Garante revogacao atempada de acessos em saidas e mudancas de funcao." },
    ],
  },
  {
    id: "vulnerability_management",
    code: "VM",
    label: "Gestao de vulnerabilidades",
    description: "Inventario de exposicoes, priorizacao, tratamento, excecoes e verificacao de correcao.",
    searchHint: "vulnerabilidade patch remediacao cve scan",
    documents: [
      { type: "Norma", title: "Norma de Gestao de Vulnerabilidades", purpose: "Define severidades, prazos de correcao e regras de excecao." },
      { type: "Procedimento", title: "Procedimento de Triagem de Vulnerabilidades", purpose: "Organiza analise, priorizacao e atribuicao de responsaveis." },
      { type: "Runbook", title: "Runbook de Validacao de Remediacao", purpose: "Padroniza recolha de evidencias apos patch ou mitigacao." },
    ],
  },
  {
    id: "business_continuity",
    code: "BC",
    label: "Continuidade de negocio",
    description: "Resiliencia, recuperacao, backups, testes e continuidade de processos criticos.",
    searchHint: "continuidade backup recuperacao disaster recovery resiliencia",
    documents: [
      { type: "Norma", title: "Norma de Continuidade e Recuperacao", purpose: "Define RTO, RPO, criticidade e requisitos minimos de recuperacao." },
      { type: "Procedimento", title: "Procedimento de Teste de Backups", purpose: "Define amostras, frequencia e criterios de aceitacao." },
      { type: "Runbook", title: "Runbook de Recuperacao de Servico Critico", purpose: "Guia a execucao operacional de recuperacao em incidente." },
    ],
  },
  {
    id: "incident_management",
    code: "IR",
    label: "Gestao de incidentes",
    description: "Preparacao, deteccao, resposta, comunicacao, licoes aprendidas e reporte.",
    searchHint: "incidente resposta deteccao triagem comunicacao",
    documents: [
      { type: "Procedimento", title: "Procedimento de Resposta a Incidentes", purpose: "Define papeis, escalacao, comunicacao e criterios de severidade." },
      { type: "Guideline", title: "Guia de Classificacao de Incidentes", purpose: "Ajuda a distinguir eventos, incidentes e crises." },
      { type: "Runbook", title: "Runbook de Contencao Inicial", purpose: "Suporta a primeira resposta tecnica antes da erradicacao." },
    ],
  },
  {
    id: "network_security",
    code: "NS",
    label: "Seguranca de redes",
    description: "Segmentacao, controlo de trafego, administracao segura e monitorizacao de rede.",
    searchHint: "rede firewall segmentacao trafego vpn",
    documents: [
      { type: "Norma", title: "Norma de Segmentacao de Rede", purpose: "Define zonas, regras minimas e criterios de exposicao." },
      { type: "Procedimento", title: "Procedimento de Alteracao de Regras de Firewall", purpose: "Garante aprovacao, revisao e evidencia das alteracoes." },
      { type: "Runbook", title: "Runbook de Validacao de Exposicao de Rede", purpose: "Apoia testes periodicos de portas, servicos e acessos externos." },
    ],
  },
  {
    id: "data_protection",
    code: "DP",
    label: "Protecao de dados",
    description: "Tratamento, classificacao, minimizacao, retencao, privacidade e cifragem.",
    searchHint: "dados privacidade gdpr cifragem retencao",
    documents: [
      { type: "Norma", title: "Norma de Protecao e Tratamento de Dados", purpose: "Define requisitos por tipo de dado e contexto de tratamento." },
      { type: "Guideline", title: "Guia de Minimizacao e Retencao", purpose: "Ajuda equipas a reduzir dados tratados e armazenados." },
      { type: "Procedimento", title: "Procedimento de Pedido de Evidencia de Privacidade", purpose: "Organiza recolha de registos e aprovacoes." },
    ],
  },
  {
    id: "supplier_management",
    code: "SUP",
    label: "Gestao de fornecedores",
    description: "Due diligence, requisitos contratuais, monitorizacao e gestao de terceiros.",
    searchHint: "fornecedor terceiro contrato due diligence",
    documents: [
      { type: "Norma", title: "Norma de Seguranca para Fornecedores", purpose: "Define requisitos minimos por criticidade do fornecedor." },
      { type: "Procedimento", title: "Procedimento de Avaliacao de Terceiros", purpose: "Define questionarios, evidencias e aprovacao de risco." },
      { type: "Guideline", title: "Guia de Clausulas de Ciberseguranca", purpose: "Apoia compras e juridico na contratualizacao." },
    ],
  },
  {
    id: "logging_monitoring",
    code: "LOG",
    label: "Logging e monitorizacao",
    description: "Registos, alertas, SIEM, retencao, integridade e revisao de eventos.",
    searchHint: "logging monitorizacao siem alerta evento",
    documents: [
      { type: "Norma", title: "Norma de Logging e Monitorizacao", purpose: "Define fontes, eventos minimos, retencao e integridade." },
      { type: "Procedimento", title: "Procedimento de Revisao de Alertas", purpose: "Define triagem, escalacao e fecho de alertas." },
      { type: "Runbook", title: "Runbook de Exportacao de Logs", purpose: "Padroniza a recolha de logs como evidencia." },
    ],
  },
  {
    id: "asset_management",
    code: "AM",
    label: "Gestao de ativos",
    description: "Inventario, ownership, classificacao, ciclo de vida e dependencia de ativos.",
    searchHint: "ativo inventario classificacao owner ciclo de vida",
    documents: [
      { type: "Norma", title: "Norma de Inventario e Classificacao de Ativos", purpose: "Define informacao minima, ownership e criticidade." },
      { type: "Procedimento", title: "Procedimento de Atualizacao do Inventario", purpose: "Define frequencia, origem de dados e validacao." },
      { type: "Guideline", title: "Guia de Classificacao de Ativos", purpose: "Apoia equipas na classificacao uniforme dos ativos." },
    ],
  },
  {
    id: "information_classification",
    code: "IC",
    label: "Classificacao da informacao",
    description: "Niveis de classificacao, manuseamento, armazenamento, partilha e destruicao.",
    searchHint: "classificacao informacao confidencial manuseamento partilha",
    documents: [
      { type: "Norma", title: "Norma de Classificacao da Informacao", purpose: "Define niveis, criterios e requisitos de protecao." },
      { type: "Guideline", title: "Guia de Manuseamento de Informacao", purpose: "Ajuda utilizadores a aplicar a classificacao no dia a dia." },
      { type: "Procedimento", title: "Procedimento de Destruicao Segura", purpose: "Define evidencias e aprovacao para descarte." },
    ],
  },
  {
    id: "other",
    code: "GEN",
    label: "Outro",
    description: "Dominio personalizado ou transversal ainda nao classificado.",
    searchHint: "",
    documents: [
      { type: "Norma", title: "Norma operacional subordinada", purpose: "Detalha requisitos minimos derivados da politica." },
      { type: "Procedimento", title: "Procedimento de execucao", purpose: "Define tarefas, responsaveis e evidencias." },
      { type: "Runbook", title: "Runbook operacional", purpose: "Organiza passos tecnicos repetiveis." },
    ],
  },
];

function sanitizeCodePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

function buildPolicyCode(title: string, domain: PolicyDomain, seed: string) {
  const titlePart = sanitizeCodePart(title).split("-").filter(Boolean).slice(0, 3).join("-");
  return ["POL", domain.code, titlePart || new Date().getFullYear(), seed].filter(Boolean).join("-");
}

function statusTone(status?: string) {
  if (status === "approved" || status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review" || status === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "rejected" || status === "obsolete") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending_review: "Pendente",
    approved: "Aprovado",
    rejected: "Rejeitado",
    deprecated: "Deprecated",
    active: "Ativa",
    review: "Em revisao",
    obsolete: "Obsoleta",
  };
  return labels[status || ""] || status || "Sem estado";
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

function isInactiveMapping(mapping: MappingRecord) {
  return mapping.validation_status === "rejected" || mapping.validation_status === "deprecated";
}

function formatNumber(value?: string | number) {
  if (value === undefined || value === null || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(value);
}

function getApiErrorMessage(err: any, fallback: string) {
  if (typeof err?.message === "string" && err.message) return err.message;
  if (typeof err?.detail === "string") return err.detail;
  return fallback;
}

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="grid min-w-[920px] grid-cols-6 gap-2">
        {steps.map((step, index) => {
          const active = index === currentStep;
          const done = index < currentStep;
          return (
            <div
              key={step}
              className={`rounded-xl border px-3 py-3 ${
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

function InternalControlSearch({
  domain,
  selectedIds,
  onAdd,
}: {
  domain: PolicyDomain;
  selectedIds: Set<string>;
  onAdd: (option: SearchOption) => void;
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
        const search = query.trim() || domain.searchHint || domain.label;
        const results = await mappingReviewApi.searchInternalControls(search, { page_size: 25 });
        if (!controller.signal.aborted) {
          setOptions(results.filter((option) => !selectedIds.has(String(option.id))));
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(err, "Nao foi possivel pesquisar controlos internos."));
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
  }, [domain, query, selectedIds]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
          <Search className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-950">Pesquisar controlos internos</h2>
          <p className="text-xs font-semibold text-slate-500">A pesquisa usa codigo, titulo, descricao e o dominio selecionado.</p>
        </div>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Pesquisar em ${domain.label.toLowerCase()}...`}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {loading && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            A procurar controlos...
          </div>
        )}

        {!loading && options.map((option) => (
          <button
            type="button"
            key={option.id}
            onClick={() => onAdd(option)}
            className="w-full rounded-xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">{option.label}</p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{option.description || "Sem descricao disponivel."}</p>
                {option.meta && (
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{option.meta}</p>
                )}
              </div>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-indigo-700 ring-1 ring-indigo-100">
                <Plus className="h-4 w-4" />
              </span>
            </div>
          </button>
        ))}

        {!loading && options.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Sem controlos encontrados para a pesquisa atual.
          </div>
        )}
      </div>
    </div>
  );
}

export default function PolicyWizard() {
  const codeSeed = useMemo(() => Date.now().toString().slice(-5), []);
  const [currentStep, setCurrentStep] = useState(0);
  const [autoCode, setAutoCode] = useState(true);
  const [domainId, setDomainId] = useState("access_control");
  const [form, setForm] = useState<PolicyGeneralForm>({
    code: "",
    title: "",
    version: "1.0",
    owner: "",
    scope: "",
    purpose: "",
    status: "draft",
    approval_date: "",
    review_date: "",
  });
  const [selectedControls, setSelectedControls] = useState<SelectedControl[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdPolicy, setCreatedPolicy] = useState<any | null>(null);
  const [associationErrors, setAssociationErrors] = useState<string[]>([]);

  const selectedDomain = useMemo(
    () => policyDomains.find((domain) => domain.id === domainId) || policyDomains[0],
    [domainId]
  );

  useEffect(() => {
    if (!autoCode) return;
    setForm((current) => ({
      ...current,
      code: buildPolicyCode(current.title, selectedDomain, codeSeed),
    }));
  }, [autoCode, codeSeed, selectedDomain, form.title]);

  const selectedIds = useMemo(
    () => new Set(selectedControls.map((control) => String(control.option.id))),
    [selectedControls]
  );

  const activeImpactMappings = useMemo(
    () => selectedControls.flatMap((control) => control.impacts.filter((mapping) => !isInactiveMapping(mapping))),
    [selectedControls]
  );

  const approvedImpacts = useMemo(
    () => activeImpactMappings.filter((mapping) => mapping.validation_status === "approved"),
    [activeImpactMappings]
  );

  const pendingImpacts = useMemo(
    () => activeImpactMappings.filter((mapping) => mapping.validation_status === "pending_review"),
    [activeImpactMappings]
  );

  const impactedFrameworks = useMemo(() => {
    const frameworks = activeImpactMappings.map((mapping) => ({
      id: String(mapping.raw?.framework || mapping.raw?.framework_code || mapping.id),
      name: mapping.raw?.framework_name || mapping.raw?.framework_code || "Framework",
      code: mapping.raw?.framework_code || "",
    }));
    return uniqueBy(frameworks, (framework) => framework.id);
  }, [activeImpactMappings]);

  const unmappedControls = useMemo(
    () => selectedControls.filter((control) => !control.impactLoading && control.impacts.filter((mapping) => !isInactiveMapping(mapping)).length === 0),
    [selectedControls]
  );

  const documentSuggestions = useMemo(() => {
    const suffix = form.title.trim() ? ` - ${form.title.trim()}` : "";
    return selectedDomain.documents.map((document) => ({
      ...document,
      title: document.title.includes("subordinada") ? `${document.title}${suffix}` : document.title,
    }));
  }, [form.title, selectedDomain]);

  const reviewGaps = useMemo(() => {
    const gaps: Array<{ type: string; severity: string; description: string }> = [];
    if (selectedControls.length === 0) {
      gaps.push({ type: "policy_without_internal_controls", severity: "high", description: "A politica ainda nao tem controlos internos selecionados." });
    }
    unmappedControls.forEach((control) => {
      gaps.push({
        type: "internal_control_without_framework_mapping",
        severity: "medium",
        description: `${control.option.label} nao tem mapeamentos ativos para frameworks.`,
      });
    });
    if (pendingImpacts.length > 0) {
      gaps.push({
        type: "pending_framework_mappings",
        severity: "medium",
        description: `${pendingImpacts.length} mapeamento(s) de framework ainda aguardam validacao humana.`,
      });
    }
    return gaps;
  }, [pendingImpacts.length, selectedControls.length, unmappedControls]);

  const updateControl = (id: string, patch: Partial<SelectedControl>) => {
    setSelectedControls((current) => current.map((control) => (
      String(control.option.id) === id ? { ...control, ...patch } : control
    )));
  };

  const loadControlImpacts = async (id: string) => {
    updateControl(id, { impactLoading: true, impactError: undefined });
    try {
      const impacts = await mappingReviewApi.listMappings("internal_control_framework_mapping", {
        internal_control: id,
        page_size: 500,
      });
      updateControl(id, { impacts, impactLoading: false });
    } catch (err: any) {
      updateControl(id, {
        impacts: [],
        impactLoading: false,
        impactError: getApiErrorMessage(err, "Nao foi possivel carregar frameworks impactadas."),
      });
    }
  };

  const addControl = (option: SearchOption) => {
    if (selectedIds.has(String(option.id))) return;
    const rationale = `Associacao criada no Policy Wizard para o dominio ${selectedDomain.label}.`;
    setSelectedControls((current) => [
      ...current,
      {
        option,
        applicability: "mandatory",
        rationale,
        impacts: [],
        impactLoading: true,
      },
    ]);
    void loadControlImpacts(String(option.id));
  };

  const removeControl = (id: string) => {
    setSelectedControls((current) => current.filter((control) => String(control.option.id) !== id));
  };

  const validateStep = (step: number) => {
    if (step === 0) {
      if (!form.title.trim()) return "Indica o titulo da politica.";
      if (!form.version.trim()) return "Indica a versao da politica.";
      if (!form.code.trim()) return "Confirma o codigo tecnico da politica.";
    }
    if (step === 1 && !domainId) return "Seleciona o dominio da politica.";
    if (step === 2 && selectedControls.length === 0) return "Seleciona pelo menos um controlo interno.";
    return null;
  };

  const goNext = () => {
    const error = validateStep(currentStep);
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

  const createPolicy = async (forceDraft = false) => {
    const firstError = validateStep(0) || validateStep(1) || validateStep(2);
    if (firstError) {
      setValidationError(firstError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setAssociationErrors([]);

    const relatedFrameworks = uniqueBy(
      activeImpactMappings
        .map((mapping) => mapping.raw?.framework)
        .filter((frameworkId) => frameworkId !== undefined && frameworkId !== null)
        .map((frameworkId) => String(frameworkId)),
      (frameworkId) => frameworkId
    );

    const payload = {
      code: form.code.trim(),
      title: form.title.trim(),
      version: form.version.trim(),
      owner: form.owner.trim(),
      scope: form.scope.trim(),
      objective: form.purpose.trim(),
      description: `Dominio da politica: ${selectedDomain.label}.\n\nCriada atraves do Policy Wizard para associacao a controlos internos.`,
      status: forceDraft ? "draft" : form.status,
      approval_date: form.approval_date || null,
      review_date: form.review_date || null,
      next_review_date: null,
      owner_person: null,
      owner_org_unit: null,
      accountable_person: null,
      related_frameworks: relatedFrameworks,
    };

    try {
      const saved = await governanceApi.createPolicy(payload);
      const errors: string[] = [];

      for (const control of selectedControls) {
        try {
          await mappingReviewApi.createPolicyInternalControl({
            policy: saved.id,
            internal_control: control.option.id,
            applicability: control.applicability,
            rationale: control.rationale.trim() || `Associacao criada no Policy Wizard para o dominio ${selectedDomain.label}.`,
            confidence_score: 100,
          });
        } catch (err: any) {
          errors.push(`${control.option.label}: ${getApiErrorMessage(err, "falha ao criar associacao")}`);
        }
      }

      setAssociationErrors(errors);
      setCreatedPolicy(saved);
      setValidationError(null);
      setSaveError(null);
    } catch (err: any) {
      setSaveError(getApiErrorMessage(err, "Nao foi possivel criar a politica."));
    } finally {
      setSaving(false);
    }
  };

  if (createdPolicy) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-6 pb-16">
        <section className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Politica criada</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{createdPolicy.title || form.title}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                A politica foi criada e o wizard tentou associar {selectedControls.length} controlo(s) interno(s) como mapeamentos draft para revisao.
              </p>
              {associationErrors.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  <p className="font-bold">Politica criada, mas algumas associacoes precisam de revisao:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {associationErrors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={`/governance/policies/${createdPolicy.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                  <FileText className="h-4 w-4" />
                  Abrir politica
                </Link>
                <Link to="/governance/mapping-review" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                  <GitBranch className="h-4 w-4" />
                  Mapping Review
                </Link>
                <a href={`/api/governance/traceability/policy/${createdPolicy.id}/?include_scores=true&include_gaps=true`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700">
                  <ShieldCheck className="h-4 w-4" />
                  Traceability API
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedPolicy(null);
                    setCurrentStep(0);
                    setSelectedControls([]);
                    setAutoCode(true);
                    setForm({
                      code: buildPolicyCode("", selectedDomain, Date.now().toString().slice(-5)),
                      title: "",
                      version: "1.0",
                      owner: "",
                      scope: "",
                      purpose: "",
                      status: "draft",
                      approval_date: "",
                      review_date: "",
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700"
                >
                  Criar outra politica
                </button>
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
        <Link to="/governance/policies" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar a politicas
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Policy Wizard</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Criar politica com controlos internos</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                Guia a criacao da politica, associa controlos internos e mostra impacto em frameworks antes de concluir.
              </p>
            </div>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{selectedControls.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-2xl font-bold text-slate-950">{impactedFrameworks.length}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
            </div>
          </div>
        </div>
      </header>

      <Stepper currentStep={currentStep} />

      {(validationError || saveError) && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {validationError || saveError}
          </div>
        </div>
      )}

      {currentStep === 0 && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Codigo</span>
              <input
                value={form.code}
                onChange={(event) => {
                  setAutoCode(false);
                  setForm((current) => ({ ...current, code: event.target.value }));
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="POL-AC-001"
              />
              <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={autoCode}
                  onChange={(event) => setAutoCode(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Codigo automatico
              </label>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Titulo *</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="Politica de Controlo de Acessos"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
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
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Data de aprovacao</span>
              <input
                type="date"
                value={form.approval_date}
                onChange={(event) => setForm((current) => ({ ...current, approval_date: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Data de revisao</span>
              <input
                type="date"
                value={form.review_date}
                onChange={(event) => setForm((current) => ({ ...current, review_date: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner</span>
              <input
                value={form.owner}
                onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="CISO, IT Manager, DPO..."
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ambito</span>
              <textarea
                value={form.scope}
                onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))}
                className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="Sistemas, equipas, processos e ativos abrangidos."
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Proposito</span>
            <textarea
              value={form.purpose}
              onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
              className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder="Objetivo de governacao, risco ou conformidade que esta politica pretende garantir."
            />
          </label>
        </section>
      )}

      {currentStep === 1 && (
        <section className="grid gap-4 lg:grid-cols-3">
          {policyDomains.map((domain) => {
            const selected = domain.id === domainId;
            return (
              <button
                type="button"
                key={domain.id}
                onClick={() => setDomainId(domain.id)}
                className={`rounded-2xl border p-5 text-left transition ${
                  selected ? "border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm" : "border-slate-100 bg-white text-slate-700 hover:border-indigo-100 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${selected ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                    {domain.code}
                  </span>
                  {selected && <CheckCircle2 className="h-5 w-5 text-indigo-700" />}
                </div>
                <h2 className="mt-4 text-base font-bold">{domain.label}</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{domain.description}</p>
              </button>
            );
          })}
        </section>
      )}

      {currentStep === 2 && (
        <div className="grid gap-6 xl:grid-cols-[430px_1fr]">
          <InternalControlSearch domain={selectedDomain} selectedIds={selectedIds} onAdd={addControl} />
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-950">Controlos selecionados</h2>
                <p className="text-xs font-semibold text-slate-500">Define applicability e rationale antes de criar a politica.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {selectedControls.length} selecionado(s)
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {selectedControls.map((control) => (
                <div key={control.option.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">{control.option.label}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{control.option.description || "Sem descricao."}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                          {control.option.raw?.control_domain || control.option.meta || "Sem dominio"}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                          {control.option.raw?.criticality || "Criticidade n/d"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeControl(String(control.option.id))}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Applicability</span>
                      <select
                        value={control.applicability}
                        onChange={(event) => updateControl(String(control.option.id), { applicability: event.target.value as Applicability })}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                      >
                        {applicabilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Rationale</span>
                      <input
                        value={control.rationale}
                        onChange={(event) => updateControl(String(control.option.id), { rationale: event.target.value })}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        placeholder="Justificacao da associacao a esta politica"
                      />
                    </label>
                  </div>
                </div>
              ))}

              {selectedControls.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                  Seleciona controlos internos no painel de pesquisa.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {currentStep === 3 && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-indigo-700" />
              <div>
                <h2 className="text-base font-bold text-slate-950">Frameworks impactadas</h2>
                <p className="text-xs font-semibold text-slate-500">Baseado nos mapeamentos InternalControl - FrameworkControl ja existentes.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {selectedControls.map((control) => {
                const activeMappings = control.impacts.filter((mapping) => !isInactiveMapping(mapping));
                return (
                  <div key={control.option.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-950">{control.option.label}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{control.option.raw?.control_domain || "Dominio n/d"}</p>
                      </div>
                      {control.impactLoading && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          A carregar
                        </span>
                      )}
                    </div>

                    {control.impactError && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                        {control.impactError}
                      </div>
                    )}

                    {!control.impactLoading && activeMappings.length === 0 && (
                      <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-800">
                        Este controlo interno ainda nao tem mapeamentos ativos para frameworks.
                      </div>
                    )}

                    {activeMappings.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 bg-white">
                        <div className="grid grid-cols-[1.2fr_1fr_130px_120px] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          <span>Framework control</span>
                          <span>Relacao</span>
                          <span>Cobertura</span>
                          <span>Estado</span>
                        </div>
                        {activeMappings.map((mapping) => (
                          <div key={mapping.id} className="grid grid-cols-[1.2fr_1fr_130px_120px] gap-3 border-b border-slate-100 px-3 py-3 text-xs last:border-b-0">
                            <span className="font-bold text-slate-800">{mapping.targetLabel}</span>
                            <span className="font-semibold text-slate-500">{mapping.relationship_type || "-"}</span>
                            <span className="font-semibold text-slate-500">{formatNumber(mapping.coverage_percentage)}</span>
                            <span className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(mapping.validation_status)}`}>
                              {statusLabel(mapping.validation_status)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Resumo</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-800">{approvedImpacts.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">Approved</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-amber-800">{pendingImpacts.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">Pending</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-slate-950">{impactedFrameworks.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
                </div>
                <div className="rounded-xl bg-rose-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-rose-800">{unmappedControls.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-rose-700">Sem mapping</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
              <div className="mt-3 space-y-2">
                {impactedFrameworks.map((framework) => (
                  <div key={framework.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-sm font-bold text-slate-900">{framework.name}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{framework.code || "Framework"}</p>
                  </div>
                ))}
                {impactedFrameworks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-sm font-semibold text-slate-500">
                    Nenhuma framework impactada ainda.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {currentStep === 4 && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Documentos subordinados sugeridos</h2>
              <p className="text-xs font-semibold text-slate-500">
                Esta fase apenas prepara a estrutura para um futuro GovernanceDocumentWizard.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {documentSuggestions.map((document) => (
              <div key={`${document.type}-${document.title}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">
                  {document.type}
                </span>
                <h3 className="mt-4 text-sm font-bold text-slate-950">{document.title}</h3>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{document.purpose}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {currentStep === 5 && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Resumo da politica</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">{form.title || "Sem titulo"}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Codigo</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{form.code || "-"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Versao</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{form.version || "-"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estado</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{statusLabel(form.status)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Dominio</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{selectedDomain.label}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ambito</p>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">{form.scope || "Nao definido."}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Proposito</p>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">{form.purpose || "Nao definido."}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Controlos internos</p>
              <div className="mt-3 space-y-2">
                {selectedControls.map((control) => (
                  <div key={control.option.id} className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-bold text-slate-900">{control.option.label}</p>
                      <span className="w-fit rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                        {control.applicability}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{control.rationale || "Sem rationale."}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Impacto estimado</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-slate-950">{selectedControls.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-slate-950">{impactedFrameworks.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-800">{approvedImpacts.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">Approved</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-3 py-3 text-center">
                  <p className="text-2xl font-bold text-amber-800">{pendingImpacts.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">Pending</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gaps detetados</p>
              <div className="mt-3 space-y-2">
                {reviewGaps.map((gap) => (
                  <div key={`${gap.type}-${gap.description}`} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{gap.type} - {gap.severity}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-900">{gap.description}</p>
                  </div>
                ))}
                {reviewGaps.length === 0 && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800">
                    Sem gaps imediatos na selecao atual.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      <footer className="sticky bottom-0 z-20 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs font-semibold text-slate-500">
            Passo {currentStep + 1} de {steps.length}: <span className="font-bold text-slate-900">{steps[currentStep]}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/governance/policies" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              Cancelar
            </Link>
            <button
              type="button"
              onClick={goBack}
              disabled={currentStep === 0 || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>
            {currentStep < steps.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Seguinte
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => createPolicy(true)}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Guardar draft
                </button>
                <button
                  type="button"
                  onClick={() => createPolicy(false)}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Criar politica
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
