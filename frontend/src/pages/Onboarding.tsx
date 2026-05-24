import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Gauge,
  Globe2,
  ListChecks,
  Network,
  Rocket,
  Save,
  Scale,
  ShieldCheck,
  Target,
} from "lucide-react";
import { companyApi, type CompanyProfile, type OnboardingAction } from "@/lib/companyApi";

type OnboardingForm = {
  legal_name: string;
  org_type: "Public" | "Private" | "ThirdSector";
  sector: string;
  employee_count: string;
  city: string;
  country: string;
  goals: string[];
  technical_scope: string[];
  internet_exposure: "none" | "limited" | "significant";
  critical_services: string;
  sensitive_data: string[];
  frameworks: string[];
  risk_appetite: "conservative" | "balanced" | "tolerant";
  scan_scope: string;
};

type StepKey = "organization" | "priorities" | "scope" | "frameworks" | "plan";
type InternetExposure = OnboardingForm["internet_exposure"];

const steps: { key: StepKey; title: string; icon: React.ElementType }[] = [
  { key: "organization", title: "Organização", icon: Building2 },
  { key: "priorities", title: "Prioridades", icon: Target },
  { key: "scope", title: "Âmbito técnico", icon: Network },
  { key: "frameworks", title: "Frameworks", icon: Scale },
  { key: "plan", title: "Plano inicial", icon: ListChecks },
];

const goalOptions = [
  { id: "vulnerability_management", label: "Gestão de vulnerabilidades", detail: "Priorizar exposição, EPSS e criticidade dos ativos." },
  { id: "compliance_readiness", label: "Conformidade regulatória", detail: "Acompanhar NIS2, ISO, NIST e QNRC por score." },
  { id: "asset_visibility", label: "Visibilidade de ativos", detail: "Inventário, descoberta e classificação dos sistemas." },
  { id: "evidence_management", label: "Gestão de evidências", detail: "Ligar mecanismos, controlos e provas de implementação." },
  { id: "executive_reporting", label: "Reporte executivo", detail: "Obter leitura curta para gestão de topo." },
  { id: "risk_decisions", label: "Decisões de risco", detail: "Registar aceitação, mitigação e justificação." },
];

const scopeOptions = [
  { id: "internet_facing", label: "Serviços expostos à Internet" },
  { id: "internal_network", label: "Rede interna" },
  { id: "endpoints", label: "Postos de trabalho" },
  { id: "servers", label: "Servidores" },
  { id: "cloud", label: "Cloud / SaaS" },
  { id: "suppliers", label: "Fornecedores críticos" },
];

const dataOptions = [
  { id: "personal_data", label: "Dados pessoais" },
  { id: "financial_data", label: "Dados financeiros" },
  { id: "health_data", label: "Dados de saúde" },
  { id: "citizen_services", label: "Serviços ao cidadão" },
  { id: "operational_data", label: "Dados operacionais" },
];

const frameworkOptions = [
  { id: "nis2", label: "NIS2 / DL 125/2025" },
  { id: "iso27001", label: "ISO/IEC 27001" },
  { id: "iso27002", label: "ISO/IEC 27002" },
  { id: "nist_csf", label: "NIST CSF" },
  { id: "qnrc", label: "QNRC / CNCS" },
];

const riskAppetiteOptions = [
  { id: "conservative", label: "Conservador", detail: "Prioriza exposição externa, ativos críticos e evidência formal." },
  { id: "balanced", label: "Equilibrado", detail: "Equilibra risco técnico, contexto do ativo e esforço de remediação." },
  { id: "tolerant", label: "Tolerante", detail: "Foca primeiro risco material e decisões com impacto operacional." },
] as const;

const emptyForm: OnboardingForm = {
  legal_name: "",
  org_type: "Private",
  sector: "",
  employee_count: "",
  city: "",
  country: "Portugal",
  goals: ["vulnerability_management", "asset_visibility", "compliance_readiness"],
  technical_scope: ["internet_facing", "internal_network", "servers"],
  internet_exposure: "limited",
  critical_services: "",
  sensitive_data: ["personal_data"],
  frameworks: ["nis2", "iso27002", "nist_csf"],
  risk_appetite: "balanced",
  scan_scope: "",
};

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function stringArrayOrFallback(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.map(String) : fallback;
}

function isInternetExposure(value: unknown): value is InternetExposure {
  return value === "none" || value === "limited" || value === "significant";
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function buildRecommendedActions(form: OnboardingForm): OnboardingAction[] {
  const actions: OnboardingAction[] = [
    {
      id: "review_assets",
      title: "Validar inventário de ativos",
      detail: "Confirmar ativos críticos, donos de negócio e exposição.",
      path: "/assets/inventory",
      priority: "high",
    },
  ];

  if (form.technical_scope.includes("internet_facing") || form.scan_scope.trim()) {
    actions.push({
      id: "configure_discovery",
      title: "Configurar descoberta Nmap",
      detail: "Definir redes autorizadas e iniciar descoberta controlada.",
      path: "/admin/integrations/nmap",
      priority: "high",
    });
  }

  if (form.goals.includes("vulnerability_management")) {
    actions.push({
      id: "open_prioritization",
      title: "Abrir fila de vulnerabilidades",
      detail: "Analisar o top de prioridades com contexto organizacional.",
      path: "/risks/prioritization",
      priority: "high",
    });
  }

  if (form.goals.includes("compliance_readiness") || form.frameworks.length > 0) {
    actions.push({
      id: "run_compliance",
      title: "Recalcular gaps de conformidade",
      detail: "Obter score por framework e controlos sem evidência.",
      path: "/compliance-gaps",
      priority: "medium",
    });
  }

  if (form.goals.includes("evidence_management")) {
    actions.push({
      id: "review_mechanisms",
      title: "Rever mecanismos de controlo",
      detail: "Ligar mecanismos existentes às frameworks selecionadas.",
      path: "/governance/mechanisms",
      priority: "medium",
    });
  }

  actions.push({
    id: "executive_dashboard",
    title: "Abrir dashboard executivo",
    detail: "Ver postura global para reporte e decisão.",
    path: "/mission-control?mode=executive",
    priority: "low",
  });

  return actions.slice(0, 5);
}

function getProfileForm(profile: CompanyProfile): OnboardingForm {
  const answers = profile.onboarding_answers || {};

  return {
    ...emptyForm,
    legal_name: profile.legal_name || "",
    org_type: profile.org_type || "Private",
    sector: profile.sector || "",
    employee_count: profile.employee_count ? String(profile.employee_count) : "",
    city: profile.city || "",
    country: profile.country || "Portugal",
    goals: profile.primary_security_goals?.length ? profile.primary_security_goals : emptyForm.goals,
    technical_scope: stringArrayOrFallback(answers.technical_scope, emptyForm.technical_scope),
    internet_exposure: isInternetExposure(answers.internet_exposure) ? answers.internet_exposure : emptyForm.internet_exposure,
    critical_services: profile.critical_services || "",
    sensitive_data: stringArrayOrFallback(answers.sensitive_data, emptyForm.sensitive_data),
    frameworks: profile.preferred_frameworks?.length ? profile.preferred_frameworks : emptyForm.frameworks,
    risk_appetite: profile.risk_appetite || "balanced",
    scan_scope: stringOrEmpty(answers.scan_scope),
  };
}

function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="grid gap-2 md:grid-cols-5">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = index === currentStep;
        const complete = index < currentStep;

        return (
          <button
            key={step.key}
            type="button"
            className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition-all ${
              active
                ? "border-slate-950 bg-slate-950 text-white"
                : complete
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs font-bold">{step.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChoiceButton({
  selected,
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-20 rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-indigo-300 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{title}</p>
          {detail && <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>}
        </div>
        {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600" />}
      </div>
    </button>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState<OnboardingForm>(emptyForm);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = useMemo(() => buildRecommendedActions(form), [form]);
  const completion = Math.round(((currentStep + 1) / steps.length) * 100);

  useEffect(() => {
    let mounted = true;

    companyApi.getProfile()
      .then((data) => {
        if (!mounted) return;
        setProfile(data);
        setForm(getProfileForm(data));
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setError("Não foi possível carregar o contexto da organização.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateForm = (patch: Partial<OnboardingForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const save = async (complete = false) => {
    setSaving(true);
    setError(null);

    try {
      const employeeCount = Number.parseInt(form.employee_count, 10);
      const payload: Partial<CompanyProfile> = {
        legal_name: form.legal_name || "A sua Instituição",
        org_type: form.org_type,
        sector: form.sector,
        employee_count: Number.isFinite(employeeCount) ? employeeCount : null,
        city: form.city,
        country: form.country || "Portugal",
        critical_services: form.critical_services,
        security_objectives: form.goals
          .map((goal) => goalOptions.find((option) => option.id === goal)?.label || goal)
          .join("\n"),
        primary_security_goals: form.goals,
        preferred_frameworks: form.frameworks,
        risk_appetite: form.risk_appetite,
        onboarding_answers: {
          technical_scope: form.technical_scope,
          internet_exposure: form.internet_exposure,
          sensitive_data: form.sensitive_data,
          scan_scope: form.scan_scope,
        },
        onboarding_recommended_actions: actions,
        onboarding_completed_at: complete ? new Date().toISOString() : profile?.onboarding_completed_at || null,
      };

      const updated = await companyApi.updateProfile(payload);
      setProfile(updated);
      setForm(getProfileForm(updated));

      if (complete) navigate("/mission-control?mode=operational");
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível guardar a configuração inicial."));
    } finally {
      setSaving(false);
    }
  };

  const canContinue = currentStep < steps.length - 1;

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 pb-16">
        <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="h-[520px] rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <Rocket className="h-3.5 w-3.5" />
              Configuração inicial
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Assistente de onboarding do CISO</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                Defina o contexto mínimo para a plataforma priorizar risco, conformidade e ações operacionais.
              </p>
            </div>
          </div>
          <div className="min-w-40 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progresso</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${completion}%` }} />
              </div>
              <span className="text-sm font-bold text-slate-950">{completion}%</span>
            </div>
          </div>
        </div>
      </header>

      <StepProgress currentStep={currentStep} />

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        {currentStep === 0 && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 1</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Perfil da organização</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput label="Nome da organização" value={form.legal_name} onChange={(value) => updateForm({ legal_name: value })} />
              <TextInput label="Setor de atividade" value={form.sector} onChange={(value) => updateForm({ sector: value })} placeholder="Ex: Administração pública, saúde, serviços digitais" />
              <TextInput label="Número de colaboradores" value={form.employee_count} onChange={(value) => updateForm({ employee_count: value })} type="number" />
              <TextInput label="Cidade" value={form.city} onChange={(value) => updateForm({ city: value })} />
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo de organização</span>
                <select
                  value={form.org_type}
                  onChange={(event) => updateForm({ org_type: event.target.value as OnboardingForm["org_type"] })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="Private">Privada</option>
                  <option value="Public">Pública</option>
                  <option value="ThirdSector">Terceiro setor</option>
                </select>
              </label>
              <TextInput label="País" value={form.country} onChange={(value) => updateForm({ country: value })} />
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 2</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Prioridades do CISO</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {goalOptions.map((option) => (
                <ChoiceButton
                  key={option.id}
                  selected={form.goals.includes(option.id)}
                  title={option.label}
                  detail={option.detail}
                  onClick={() => updateForm({ goals: toggleValue(form.goals, option.id) })}
                />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {riskAppetiteOptions.map((option) => (
                <ChoiceButton
                  key={option.id}
                  selected={form.risk_appetite === option.id}
                  title={option.label}
                  detail={option.detail}
                  onClick={() => updateForm({ risk_appetite: option.id })}
                />
              ))}
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 3</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Âmbito técnico e exposição</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {scopeOptions.map((option) => (
                <ChoiceButton
                  key={option.id}
                  selected={form.technical_scope.includes(option.id)}
                  title={option.label}
                  onClick={() => updateForm({ technical_scope: toggleValue(form.technical_scope, option.id) })}
                />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <ChoiceButton selected={form.internet_exposure === "none"} title="Sem exposição conhecida" onClick={() => updateForm({ internet_exposure: "none" })} />
              <ChoiceButton selected={form.internet_exposure === "limited"} title="Exposição limitada" onClick={() => updateForm({ internet_exposure: "limited" })} />
              <ChoiceButton selected={form.internet_exposure === "significant"} title="Exposição relevante" onClick={() => updateForm({ internet_exposure: "significant" })} />
            </div>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Serviços críticos</span>
              <textarea
                value={form.critical_services}
                onChange={(event) => updateForm({ critical_services: event.target.value })}
                rows={4}
                placeholder="Ex: portal de munícipes, faturação, autenticação central, ERP, email institucional"
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <TextInput
              label="Redes ou intervalos a descobrir"
              value={form.scan_scope}
              onChange={(value) => updateForm({ scan_scope: value })}
              placeholder="Ex: 10.0.0.0/24, 172.16.10.0/24"
            />
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 4</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Frameworks e dados sensíveis</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {frameworkOptions.map((option) => (
                <ChoiceButton
                  key={option.id}
                  selected={form.frameworks.includes(option.id)}
                  title={option.label}
                  onClick={() => updateForm({ frameworks: toggleValue(form.frameworks, option.id) })}
                />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {dataOptions.map((option) => (
                <ChoiceButton
                  key={option.id}
                  selected={form.sensitive_data.includes(option.id)}
                  title={option.label}
                  onClick={() => updateForm({ sensitive_data: toggleValue(form.sensitive_data, option.id) })}
                />
              ))}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 5</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Plano inicial recomendado</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Gauge className="h-5 w-5 text-indigo-600" />
                <p className="mt-3 text-sm font-bold text-slate-950">Apetite ao risco</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {riskAppetiteOptions.find((option) => option.id === form.risk_appetite)?.label}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 text-sm font-bold text-slate-950">Frameworks ativas</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{form.frameworks.length} selecionadas</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Globe2 className="h-5 w-5 text-orange-600" />
                <p className="mt-3 text-sm font-bold text-slate-950">Exposição</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {form.internet_exposure === "significant" ? "Relevante" : form.internet_exposure === "limited" ? "Limitada" : "Sem exposição conhecida"}
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {actions.map((action) => (
                <Link key={action.id} to={action.path} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        action.priority === "high"
                          ? "bg-red-50 text-red-700"
                          : action.priority === "medium"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {action.priority === "high" ? "Alta" : action.priority === "medium" ? "Média" : "Baixa"}
                      </span>
                      <p className="text-sm font-bold text-slate-950">{action.title}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{action.detail}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
            disabled={currentStep === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "A guardar..." : "Guardar progresso"}
            </button>

            {canContinue ? (
              <button
                type="button"
                onClick={() => setCurrentStep((step) => Math.min(steps.length - 1, step + 1))}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700"
              >
                Continuar <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-800 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                {saving ? "A finalizar..." : "Finalizar onboarding"}
              </button>
            )}
          </div>
        </div>
      </section>

      {profile?.onboarding_completed_at && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          Onboarding concluído em {new Date(profile.onboarding_completed_at).toLocaleString("pt-PT")}.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link to="/governance/organization" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
          <Database className="h-4 w-4" />
          Dados da organização
        </Link>
        <Link to="/mission-control?mode=operational" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
          <Rocket className="h-4 w-4" />
          Dashboard operacional
        </Link>
      </div>
    </div>
  );
}
