import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Flag,
  Goal,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import { companyApi, type CompanyProfile, type RiskAppetite } from "@/lib/companyApi";

const FRAMEWORK_LABELS: Record<string, string> = {
  dl125_2025: "DL 125/2025",
  nis2: "NIS2",
  iso27001: "ISO/IEC 27001",
  iso27002: "ISO/IEC 27002",
  nist_csf: "NIST CSF",
  qnrcs: "QNRC/CNCS",
};

const GOAL_LABELS: Record<string, string> = {
  institutional_governance: "Governação institucional",
  compliance_readiness: "Prontidão de conformidade",
  risk_reduction: "Redução de risco",
  evidence_management: "Gestão de evidências",
};

function textToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToText(value?: string[]) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function displayList(value?: string[], labels: Record<string, string> = {}) {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.map((item) => labels[item] || item);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function riskAppetiteLabel(value?: string | null) {
  if (value === "conservative") return "Conservador";
  if (value === "balanced") return "Equilibrado";
  if (value === "tolerant") return "Tolerante";
  return "-";
}

function completion(profile: CompanyProfile | null) {
  const fields = [
    profile?.mission,
    profile?.vision,
    profile?.strategic_objectives,
    profile?.security_objectives,
    profile?.critical_services,
    profile?.risk_appetite,
    profile?.primary_security_goals?.length,
    profile?.preferred_frameworks?.length,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-950 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function TagList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <span key={item} className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm font-semibold text-slate-400">Ainda não definido.</span>
        )}
      </div>
    </div>
  );
}

export default function MissionObjectives() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState<CompanyProfile | null>(null);
  const [goalsText, setGoalsText] = useState("");
  const [frameworksText, setFrameworksText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await companyApi.getProfile();
      setProfile(data);
      setForm(data);
      setGoalsText(listToText(data.primary_security_goals));
      setFrameworksText(listToText(data.preferred_frameworks));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar missão e objetivos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completionScore = useMemo(() => completion(profile), [profile]);

  const updateField = <K extends keyof CompanyProfile>(field: K, value: CompanyProfile[K]) => {
    setForm((current) => current ? { ...current, [field]: value } : current);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await companyApi.updateProfile({
        mission: form.mission || "",
        vision: form.vision || "",
        strategic_objectives: form.strategic_objectives || "",
        security_objectives: form.security_objectives || "",
        critical_services: form.critical_services || "",
        risk_appetite: form.risk_appetite || "balanced",
        primary_security_goals: textToList(goalsText),
        preferred_frameworks: textToList(frameworksText),
      });
      setProfile(updated);
      setForm(updated);
      setGoalsText(listToText(updated.primary_security_goals));
      setFrameworksText(listToText(updated.preferred_frameworks));
      setMessage("Missão e objetivos guardados.");
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível guardar missão e objetivos."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar missão e objetivos...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Dados da organização</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Missão e objetivos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Define a direção estratégica que alimenta a governação, a gestão de risco, a conformidade e as recomendações do Virtual CISO.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={save}
              disabled={saving || !form}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:bg-slate-300"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Flag} label="Organização" value={profile?.legal_name || "-"} tone="text-indigo-700" />
        <MetricCard icon={CheckCircle2} label="Completude" value={`${completionScore}%`} tone={completionScore >= 80 ? "text-emerald-600" : "text-amber-600"} />
        <MetricCard icon={ShieldCheck} label="Apetite ao risco" value={riskAppetiteLabel(profile?.risk_appetite)} tone="text-emerald-600" />
        <MetricCard icon={FileText} label="Frameworks" value={profile?.preferred_frameworks?.length || 0} tone="text-cyan-700" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.78fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-bold text-slate-950">Direção estratégica</h2>
          </div>
          <div className="mt-5 space-y-5">
            <TextAreaField
              label="Missão"
              value={form?.mission || ""}
              onChange={(value) => updateField("mission", value)}
              placeholder="Descreve a razão de existir da organização e os serviços ou funções críticas que suporta."
            />
            <TextAreaField
              label="Visão"
              value={form?.vision || ""}
              onChange={(value) => updateField("vision", value)}
              placeholder="Descreve o estado futuro pretendido para a organização e para a sua maturidade de segurança."
            />
            <TextAreaField
              label="Objetivos estratégicos"
              value={form?.strategic_objectives || ""}
              onChange={(value) => updateField("strategic_objectives", value)}
              placeholder="Lista os objetivos estratégicos relevantes para governação, continuidade, risco e conformidade."
              rows={6}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-950">Objetivos de segurança</h2>
            </div>
            <div className="mt-5 space-y-5">
              <TextAreaField
                label="Objetivos de segurança da informação"
                value={form?.security_objectives || ""}
                onChange={(value) => updateField("security_objectives", value)}
                placeholder="Ex.: proteger serviços críticos, reduzir risco residual, cumprir DL 125/2025, manter evidência auditável."
                rows={6}
              />
              <TextAreaField
                label="Serviços críticos"
                value={form?.critical_services || ""}
                onChange={(value) => updateField("critical_services", value)}
                placeholder="Identifica serviços críticos ou essenciais suportados pela organização."
                rows={4}
              />
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Apetite ao risco</span>
                <select
                  value={form?.risk_appetite || "balanced"}
                  onChange={(event) => updateField("risk_appetite", event.target.value as RiskAppetite)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="conservative">Conservador</option>
                  <option value="balanced">Equilibrado</option>
                  <option value="tolerant">Tolerante</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Eixos e referenciais</h2>
            </div>
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Objetivos principais, separados por vírgula
                </span>
                <input
                  value={goalsText}
                  onChange={(event) => setGoalsText(event.target.value)}
                  placeholder="Ex.: institutional_governance, compliance_readiness, risk_reduction"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <TagList title="Objetivos principais" items={displayList(textToList(goalsText), GOAL_LABELS)} />

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Frameworks preferenciais, separadas por vírgula
                </span>
                <input
                  value={frameworksText}
                  onChange={(event) => setFrameworksText(event.target.value)}
                  placeholder="Ex.: dl125_2025, nis2, iso27001, nist_csf"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <TagList title="Referenciais" items={displayList(textToList(frameworksText), FRAMEWORK_LABELS)} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Goal className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Como estes dados são usados</h2>
            </div>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              A missão e os objetivos contextualizam recomendações IA, priorização de risco, políticas, controlos internos,
              seleção de mecanismos e demonstração de conformidade. Quanto mais claros forem, mais defensável fica a tomada de decisão.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/governance/policies"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              Políticas
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/mission-control?mode=operational"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
            >
              Mission Control
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
