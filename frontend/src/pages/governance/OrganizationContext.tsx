import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Globe2, RefreshCw, Save, ShieldAlert, Target, Users } from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";

type OrganizationRecord = Record<string, any>;

const arrayToText = (value: any) => Array.isArray(value) ? value.join(", ") : value || "";
const textToArray = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function nullableNumber(value: string) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function orgTypeLabel(value?: string) {
  const labels: Record<string, string> = {
    Public: "Publica",
    Private: "Privada",
    ThirdSector: "Terceiro setor",
  };
  return labels[value || ""] || value || "-";
}

function Metric({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-2xl font-bold text-slate-950">{value || "-"}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

export default function OrganizationContext() {
  const [profile, setProfile] = useState<OrganizationRecord | null>(null);
  const [form, setForm] = useState<OrganizationRecord>({});
  const [goalsText, setGoalsText] = useState("");
  const [frameworksText, setFrameworksText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.getOrganizationContext();
      setProfile(data);
      setForm(data || {});
      setGoalsText(arrayToText(data?.primary_security_goals));
      setFrameworksText(arrayToText(data?.preferred_frameworks));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o contexto organizacional.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const completion = useMemo(() => {
    const fields = [
      form.legal_name,
      form.sector,
      form.org_type,
      form.geographic_scope,
      form.critical_services,
      form.mission,
      form.security_objectives,
      goalsText,
      frameworksText,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [form, goalsText, frameworksText]);

  const updateField = (field: string, value: any) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (!profile?.id) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      ...form,
      employee_count: nullableNumber(String(form.employee_count ?? "")),
      annual_revenue: form.annual_revenue === "" || form.annual_revenue === undefined ? null : form.annual_revenue,
      primary_security_goals: textToArray(goalsText),
      preferred_frameworks: textToArray(frameworksText),
    };

    try {
      const updated = await governanceApi.updateOrganizationContext(profile.id, payload);
      setProfile(updated);
      setForm(updated || {});
      setGoalsText(arrayToText(updated?.primary_security_goals));
      setFrameworksText(arrayToText(updated?.preferred_frameworks));
      setMessage("Contexto organizacional atualizado.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel guardar o contexto.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar contexto organizacional...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Contexto de negocio</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Contexto organizacional</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Perfil da organizacao usado para governanca, analise NIS2, priorizacao de risco e recomendacoes do Virtual CISO.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:bg-slate-300">
              <Save className="h-4 w-4" />
              {saving ? "A guardar..." : "Guardar"}
            </button>
          </div>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={Building2} label="Organizacao" value={form.legal_name} tone="text-indigo-700" />
        <Metric icon={Globe2} label="Ambito" value={form.geographic_scope || form.country} tone="text-cyan-700" />
        <Metric icon={Users} label="Dimensao" value={form.employee_count ? `${form.employee_count} pessoas` : orgTypeLabel(form.org_type)} tone="text-slate-700" />
        <Metric icon={CheckCircle2} label="Completude" value={`${completion}%`} tone="text-emerald-600" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.8fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-bold text-slate-950">Identidade da organizacao</h2>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome legal</span>
              <input value={form.legal_name || ""} onChange={(event) => updateField("legal_name", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">NIF</span>
              <input value={form.tax_id || ""} onChange={(event) => updateField("tax_id", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Setor</span>
              <input value={form.sector || ""} onChange={(event) => updateField("sector", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tipo</span>
              <select value={form.org_type || "Private"} onChange={(event) => updateField("org_type", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                <option value="Private">Privada</option>
                <option value="Public">Publica</option>
                <option value="ThirdSector">Terceiro setor</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ambito geografico</span>
              <input value={form.geographic_scope || ""} onChange={(event) => updateField("geographic_scope", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Pais</span>
              <input value={form.country || ""} onChange={(event) => updateField("country", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cidade</span>
              <input value={form.city || ""} onChange={(event) => updateField("city", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Colaboradores</span>
              <input type="number" value={form.employee_count || ""} onChange={(event) => updateField("employee_count", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Receita anual</span>
              <input value={form.annual_revenue || ""} onChange={(event) => updateField("annual_revenue", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-bold text-slate-950">Contactos</h2>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Website</span>
              <input value={form.website || ""} onChange={(event) => updateField("website", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email principal</span>
              <input value={form.main_email || ""} onChange={(event) => updateField("main_email", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Telefone principal</span>
              <input value={form.main_phone || ""} onChange={(event) => updateField("main_phone", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
            </label>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-950">Direcao estrategica</h2>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Missao</span>
              <textarea value={form.mission || ""} onChange={(event) => updateField("mission", event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Visão</span>
              <textarea value={form.vision || ""} onChange={(event) => updateField("vision", event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Objetivos estrategicos</span>
              <textarea value={form.strategic_objectives || ""} onChange={(event) => updateField("strategic_objectives", event.target.value)} className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold text-slate-950">Contexto de seguranca</h2>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Servicos criticos</span>
              <textarea value={form.critical_services || ""} onChange={(event) => updateField("critical_services", event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Objetivos de seguranca</span>
              <textarea value={form.security_objectives || ""} onChange={(event) => updateField("security_objectives", event.target.value)} className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Apetite de risco</span>
              <select value={form.risk_appetite || "balanced"} onChange={(event) => updateField("risk_appetite", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100">
                <option value="conservative">Conservador</option>
                <option value="balanced">Equilibrado</option>
                <option value="tolerant">Tolerante</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Preferencias do programa</h2>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Objetivos principais</span>
              <textarea value={goalsText} onChange={(event) => setGoalsText(event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="Separar por virgulas" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Frameworks preferidas</span>
              <textarea value={frameworksText} onChange={(event) => setFrameworksText(event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="ISO 27001, NIS2, CIS Controls" />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Notas</h2>
          <textarea value={form.notes || ""} onChange={(event) => updateField("notes", event.target.value)} className="mt-5 min-h-[220px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
        </div>
      </section>
    </div>
  );
}
