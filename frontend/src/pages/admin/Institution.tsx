import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Save,
  Scale,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { companyApi, type CompanyProfile, type OnboardingAction, type OrgUnit, type Person } from "@/lib/companyApi";
import { governanceApi, type RegulatoryContextRecord } from "@/lib/governanceApi";

type InstitutionalProfile = CompanyProfile & {
  tax_id?: string | null;
  website?: string | null;
  main_email?: string | null;
  main_phone?: string | null;
  geographic_scope?: string | null;
  mission?: string | null;
  vision?: string | null;
  strategic_objectives?: string | null;
  nis2_sector?: string | null;
  nis2_subsector?: string | null;
  is_critical_provider?: boolean;
  notes?: string | null;
};

type DisplayValue = string | number | boolean | null | undefined;

function unwrap<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function orgTypeLabel(value?: string | null) {
  if (value === "Public") return "Pública";
  if (value === "Private") return "Privada";
  if (value === "ThirdSector") return "Terceiro setor";
  return value || "-";
}

function riskAppetiteLabel(value?: string | null) {
  if (value === "conservative") return "Conservador";
  if (value === "balanced") return "Equilibrado";
  if (value === "tolerant") return "Tolerante";
  return value || "-";
}

function nis2Label(value?: string | null) {
  if (value === "Essential") return "Entidade essencial";
  if (value === "Important") return "Entidade importante";
  if (value === "Out of Scope") return "Não abrangida";
  return "Por confirmar";
}

function listValue(values?: unknown[]) {
  if (!Array.isArray(values) || values.length === 0) return "-";
  return values.map(String).join(", ");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function completeness(profile: InstitutionalProfile | null, regulatory: RegulatoryContextRecord | null) {
  const fields = [
    profile?.legal_name,
    profile?.org_type,
    profile?.sector,
    profile?.country,
    profile?.city,
    profile?.critical_services,
    profile?.risk_appetite,
    profile?.primary_security_goals?.length,
    profile?.preferred_frameworks?.length,
    regulatory?.nis2_classification && regulatory.nis2_classification !== "Pending" ? regulatory.nis2_classification : null,
    regulatory?.classification_criteria,
    regulatory?.competent_authority,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function profilePatch(profile: InstitutionalProfile): Partial<CompanyProfile> {
  return {
    legal_name: profile.legal_name || "",
    tax_id: profile.tax_id || "",
    org_type: profile.org_type || "Private",
    sector: profile.sector || "",
    country: profile.country || "Portugal",
    city: profile.city || "",
    employee_count: profile.employee_count || null,
    website: profile.website || "",
    main_email: profile.main_email || "",
    main_phone: profile.main_phone || "",
    critical_services: profile.critical_services || "",
    security_objectives: profile.security_objectives || "",
    risk_appetite: profile.risk_appetite || "balanced",
    notes: profile.notes || "",
  } as Partial<CompanyProfile>;
}

function KpiCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: DisplayValue; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-2xl font-black text-slate-950">{String(value || "-")}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function InfoCard({ label, value, detail }: { label: string; value: DisplayValue; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-black text-slate-950">{String(value || "-")}</p>
      {detail && <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>}
    </div>
  );
}

function ActionLink({ title, detail, path }: { title: string; detail: string; path: string }) {
  return (
    <Link
      to={path}
      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-4 text-sm shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
    >
      <span>
        <span className="block font-black text-slate-950">{title}</span>
        <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-indigo-700" />
    </Link>
  );
}

export default function Institution() {
  const [profile, setProfile] = useState<InstitutionalProfile | null>(null);
  const [form, setForm] = useState<InstitutionalProfile | null>(null);
  const [regulatory, setRegulatory] = useState<RegulatoryContextRecord | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileData, regulatoryData, peopleData, orgUnitData] = await Promise.all([
        companyApi.getProfile(),
        governanceApi.getRegulatoryContext().catch(() => null),
        companyApi.listPeople({ page_size: 500 }).catch(() => []),
        companyApi.listOrgUnits({ page_size: 500 }).catch(() => []),
      ]);
      setProfile(profileData as InstitutionalProfile);
      setForm(profileData as InstitutionalProfile);
      setRegulatory(regulatoryData);
      setPeople(unwrap<Person>(peopleData));
      setOrgUnits(unwrap<OrgUnit>(orgUnitData));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar o perfil institucional."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const securityContacts = useMemo(
    () => people.filter((person) => person.is_security_contact || person.governance_role === "ciso"),
    [people],
  );
  const recommendedActions = profile?.onboarding_recommended_actions || [];
  const completion = completeness(profile, regulatory);

  const update = <K extends keyof InstitutionalProfile>(key: K, value: InstitutionalProfile[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await companyApi.updateProfile(profilePatch(form));
      setProfile(updated as InstitutionalProfile);
      setForm(updated as InstitutionalProfile);
      setMessage("Perfil institucional atualizado.");
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível guardar o perfil institucional."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar perfil institucional...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Dados da organização</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Perfil institucional</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Ficha central da entidade, usada pelo Virtual CISO para contexto, risco, governação, NIS2/DL 125/2025 e recomendações IA.
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
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={Building2} label="Instituição" value={profile?.legal_name} tone="text-indigo-700" />
        <KpiCard icon={Scale} label="NIS2 / DL 125/2025" value={nis2Label(regulatory?.nis2_classification)} tone="text-amber-600" />
        <KpiCard icon={Users} label="Contactos segurança" value={securityContacts.length} tone="text-emerald-600" />
        <KpiCard icon={CheckCircle2} label="Completude" value={`${completion}%`} tone={completion >= 80 ? "text-emerald-600" : "text-amber-600"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-bold text-slate-950">Identificação</h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome legal</span>
              <input
                value={form?.legal_name || ""}
                onChange={(event) => update("legal_name", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">NIF</span>
              <input
                value={form?.tax_id || ""}
                onChange={(event) => update("tax_id", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tipo de entidade</span>
              <select
                value={form?.org_type || "Private"}
                onChange={(event) => update("org_type", event.target.value as InstitutionalProfile["org_type"])}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="Public">Pública</option>
                <option value="Private">Privada</option>
                <option value="ThirdSector">Terceiro setor</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Setor</span>
              <input
                value={form?.sector || ""}
                onChange={(event) => update("sector", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Apetite ao risco</span>
              <select
                value={form?.risk_appetite || "balanced"}
                onChange={(event) => update("risk_appetite", event.target.value as InstitutionalProfile["risk_appetite"])}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="conservative">Conservador</option>
                <option value="balanced">Equilibrado</option>
                <option value="tolerant">Tolerante</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">País</span>
              <input
                value={form?.country || ""}
                onChange={(event) => update("country", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cidade</span>
              <input
                value={form?.city || ""}
                onChange={(event) => update("city", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Colaboradores</span>
              <input
                type="number"
                value={form?.employee_count || ""}
                onChange={(event) => update("employee_count", event.target.value ? Number(event.target.value) : null)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Website</span>
              <input
                value={form?.website || ""}
                onChange={(event) => update("website", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email principal</span>
              <input
                value={form?.main_email || ""}
                onChange={(event) => update("main_email", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Telefone principal</span>
              <input
                value={form?.main_phone || ""}
                onChange={(event) => update("main_phone", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Scale className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-bold text-slate-950">Enquadramento regulatório</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Classificação NIS2" value={nis2Label(regulatory?.nis2_classification)} />
              <InfoCard label="Autoridade competente" value={regulatory?.competent_authority || "CNCS"} />
              <InfoCard label="Tipo de entidade" value={orgTypeLabel(profile?.org_type)} />
              <InfoCard label="Apetite ao risco" value={riskAppetiteLabel(profile?.risk_appetite)} />
              <InfoCard label="Última revisão" value={formatDate(regulatory?.last_reviewed_at)} />
              <InfoCard label="Onboarding" value={profile?.onboarding_completed_at ? "Concluído" : "Por concluir"} />
            </div>
            <div className="mt-4">
              <ActionLink
                title="Rever contexto regulatório"
                detail="Editar classificação NIS2, autoridade competente e obrigações aplicáveis."
                path="/governance/regulatory"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-950">Responsáveis</h2>
            </div>
            <div className="mt-5 space-y-3">
              {securityContacts.slice(0, 4).map((person) => (
                <div key={person.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="font-black text-slate-950">{person.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {[person.governance_role_display || person.role, person.email].filter(Boolean).join(" · ") || "Contacto sem função definida"}
                  </p>
                </div>
              ))}
              {securityContacts.length === 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  Ainda não existem contactos de segurança definidos.
                </div>
              )}
              <ActionLink
                title="Gerir responsabilidades"
                detail={`${people.length} pessoas e ${orgUnits.length} unidades orgânicas registadas.`}
                path="/governance/responsibilities"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-bold text-slate-950">Segurança e serviços críticos</h2>
          </div>
          <div className="mt-5 space-y-4">
            <InfoCard label="Serviços críticos" value={profile?.critical_services || "-"} />
            <InfoCard label="Objetivos de segurança" value={profile?.security_objectives || "-"} />
            <InfoCard label="Frameworks preferenciais" value={listValue(profile?.preferred_frameworks)} />
            <InfoCard label="Objetivos principais" value={listValue(profile?.primary_security_goals)} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-bold text-slate-950">Plano de onboarding</h2>
          </div>
          <div className="mt-5 space-y-3">
            {recommendedActions.slice(0, 4).map((action: OnboardingAction) => (
              <ActionLink key={action.id} title={action.title} detail={action.detail} path={action.path} />
            ))}
            {recommendedActions.length === 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                Sem recomendações pendentes do onboarding institucional.
              </div>
            )}
            <ActionLink
              title="Abrir configuração inicial"
              detail="Atualizar respostas de enquadramento, postura inicial e plano recomendado."
              path="/onboarding"
            />
          </div>
        </div>
      </section>

      {completion < 80 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p>
              O perfil institucional ainda não está suficientemente completo. Para melhorar a qualidade das recomendações IA,
              completa o contexto regulatório, responsáveis, serviços críticos e objetivos de segurança.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
