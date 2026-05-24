import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Network,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { companyApi, type OrgUnit, type Person } from "@/lib/companyApi";
import { governanceApi, type PolicyRecord } from "@/lib/governanceApi";

type ListLike<T> = T[] | { results?: T[] } | null | undefined;

type UnitForm = Partial<OrgUnit> & {
  name: string;
};

type PersonForm = Partial<Person> & {
  name: string;
};

const emptyUnitForm: UnitForm = {
  name: "",
  description: "",
  unit_type: "other",
  parent: "",
  manager: "",
  is_security_relevant: false,
  security_relevance: "",
  critical_services: "",
};

const emptyPersonForm: PersonForm = {
  name: "",
  email: "",
  phone: "",
  role: "",
  governance_role: "other",
  org_unit: "",
  backup_for: "",
  is_security_contact: false,
  responsibilities: "",
};

const unitTypeLabel: Record<string, string> = {
  board: "Administracao",
  business: "Negocio",
  it: "Tecnologia",
  security: "Seguranca",
  operations: "Operacoes",
  support: "Suporte",
  external: "Externo",
  other: "Outro",
};

const governanceRoleLabel: Record<string, string> = {
  ciso: "CISO",
  security_officer: "Security Officer",
  it_owner: "IT Owner",
  risk_owner: "Risk Owner",
  business_owner: "Business Owner",
  data_protection: "Data Protection",
  compliance_owner: "Compliance Owner",
  policy_owner: "Policy Owner",
  auditor: "Auditor",
  executive_sponsor: "Executive Sponsor",
  other: "Outro",
};

function unwrap<T>(data: ListLike<T>): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function normalizeId(value?: string | null) {
  return value || null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

export default function OrgResponsibilities() {
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnitForm);
  const [personForm, setPersonForm] = useState<PersonForm>(emptyPersonForm);
  const [loading, setLoading] = useState(true);
  const [savingUnit, setSavingUnit] = useState(false);
  const [savingPerson, setSavingPerson] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [unitsData, peopleData, policiesData] = await Promise.all([
        companyApi.listOrgUnits({ page_size: 1000 }),
        companyApi.listPeople({ page_size: 1000 }),
        governanceApi.listPolicies({ page_size: 1000 }),
      ]);
      setUnits(unwrap<OrgUnit>(unitsData));
      setPeople(unwrap<Person>(peopleData));
      setPolicies(unwrap<PolicyRecord>(policiesData));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel carregar o organograma."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const peopleByUnit = useMemo(() => {
    const map = new Map<string, Person[]>();
    people.forEach((person) => {
      if (!person.org_unit) return;
      const current = map.get(person.org_unit) || [];
      current.push(person);
      map.set(person.org_unit, current);
    });
    return map;
  }, [people]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, OrgUnit[]>();
    units.forEach((unit) => {
      const key = unit.parent || "root";
      const current = map.get(key) || [];
      current.push(unit);
      map.set(key, current);
    });
    return map;
  }, [units]);

  const ownership = useMemo(() => {
    const personPolicies = new Map<string, number>();
    const accountablePolicies = new Map<string, number>();
    const unitPolicies = new Map<string, number>();

    policies.forEach((policy) => {
      if (policy.owner_person) personPolicies.set(policy.owner_person, (personPolicies.get(policy.owner_person) || 0) + 1);
      if (policy.accountable_person) accountablePolicies.set(policy.accountable_person, (accountablePolicies.get(policy.accountable_person) || 0) + 1);
      if (policy.owner_org_unit) unitPolicies.set(policy.owner_org_unit, (unitPolicies.get(policy.owner_org_unit) || 0) + 1);
    });

    return { personPolicies, accountablePolicies, unitPolicies };
  }, [policies]);

  const policiesWithoutRealOwner = useMemo(
    () => policies.filter((policy) => !policy.owner_person && !policy.owner_org_unit && !policy.owner),
    [policies]
  );

  const readiness = useMemo(() => {
    const checks = [
      units.length > 0,
      people.length > 0,
      people.some((person) => person.is_security_contact || person.governance_role === "ciso"),
      units.some((unit) => unit.is_security_relevant),
      policies.length > 0 && policiesWithoutRealOwner.length < policies.length,
      units.some((unit) => unit.manager),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [people, policies.length, policiesWithoutRealOwner.length, units]);

  const selectUnit = (unit: OrgUnit) => {
    setSelectedUnitId(unit.id);
    setUnitForm({
      ...emptyUnitForm,
      ...unit,
      parent: unit.parent || "",
      manager: unit.manager || "",
    });
  };

  const selectPerson = (person: Person) => {
    setSelectedPersonId(person.id);
    setPersonForm({
      ...emptyPersonForm,
      ...person,
      org_unit: person.org_unit || "",
      backup_for: person.backup_for || "",
    });
  };

  const saveUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (!unitForm.name.trim()) return;
    setSavingUnit(true);
    setError(null);
    setMessage(null);
    const payload = {
      ...unitForm,
      name: unitForm.name.trim(),
      parent: normalizeId(unitForm.parent),
      manager: normalizeId(unitForm.manager),
    };
    try {
      const saved = selectedUnitId
        ? await companyApi.updateOrgUnit(selectedUnitId, payload)
        : await companyApi.createOrgUnit(payload);
      setSelectedUnitId(saved.id);
      setUnitForm({ ...emptyUnitForm, ...saved, parent: saved.parent || "", manager: saved.manager || "" });
      setMessage(selectedUnitId ? "Unidade atualizada." : "Unidade criada.");
      await load();
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel guardar a unidade."));
    } finally {
      setSavingUnit(false);
    }
  };

  const savePerson = async (event: FormEvent) => {
    event.preventDefault();
    if (!personForm.name.trim()) return;
    setSavingPerson(true);
    setError(null);
    setMessage(null);
    const payload = {
      ...personForm,
      name: personForm.name.trim(),
      org_unit: normalizeId(personForm.org_unit),
      backup_for: normalizeId(personForm.backup_for),
    };
    try {
      const saved = selectedPersonId
        ? await companyApi.updatePerson(selectedPersonId, payload)
        : await companyApi.createPerson(payload);
      setSelectedPersonId(saved.id);
      setPersonForm({ ...emptyPersonForm, ...saved, org_unit: saved.org_unit || "", backup_for: saved.backup_for || "" });
      setMessage(selectedPersonId ? "Pessoa atualizada." : "Pessoa criada.");
      await load();
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel guardar a pessoa."));
    } finally {
      setSavingPerson(false);
    }
  };

  const renderUnit = (unit: OrgUnit, depth = 0) => {
    const unitPeople = peopleByUnit.get(unit.id) || [];
    const children = childrenByParent.get(unit.id) || [];
    const selected = selectedUnitId === unit.id;

    return (
      <div key={unit.id} className="space-y-3">
        <button
          type="button"
          onClick={() => selectUnit(unit)}
          className={`w-full rounded-2xl border p-4 text-left transition-all ${
            selected ? "border-indigo-200 bg-indigo-50" : "border-slate-100 bg-slate-50 hover:border-indigo-100"
          }`}
          style={{ marginLeft: depth ? Math.min(depth * 18, 54) : 0 }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {unitTypeLabel[unit.unit_type || "other"] || unit.unit_type || "Unidade"}
                </span>
                {unit.is_security_relevant && (
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    Relevante para seguranca
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-950">{unit.name}</h3>
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">
                {unit.description || unit.security_relevance || "Sem descricao operacional."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[240px]">
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-base font-bold text-slate-950">{unitPeople.length}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Pessoas</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-base font-bold text-slate-950">{ownership.unitPolicies.get(unit.id) || 0}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Politicas</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="truncate text-xs font-bold text-slate-950">{unit.manager_name || "-"}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Gestor</p>
              </div>
            </div>
          </div>
        </button>
        {children.map((child) => renderUnit(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar organograma...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governance operating model</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Organograma e responsabilidades</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Estrutura organizacional, papeis de seguranca e ownership das politicas para suportar decisoes auditaveis do CISO.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Network} label="Readiness" value={`${readiness}%`} detail="Completude minima do modelo de governance." tone="text-indigo-700" />
        <Kpi icon={Building2} label="Unidades" value={units.length} detail={`${units.filter((unit) => unit.manager).length} com gestor definido.`} tone="text-slate-700" />
        <Kpi icon={Users} label="Pessoas" value={people.length} detail={`${people.filter((person) => person.is_security_contact).length} contactos de seguranca.`} tone="text-cyan-700" />
        <Kpi icon={ShieldCheck} label="Papeis CISO" value={people.filter((person) => person.governance_role === "ciso" || person.is_security_contact).length} detail="Pessoas com responsabilidade explicita." tone="text-emerald-600" />
        <Kpi icon={AlertTriangle} label="Politicas sem owner" value={policiesWithoutRealOwner.length} detail="Politicas que ainda precisam de responsavel." tone="text-amber-600" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Organograma</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Selecione uma unidade para editar detalhes, gestor e relevancia de seguranca.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedUnitId(null);
                setUnitForm(emptyUnitForm);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white hover:bg-indigo-700"
              title="Nova unidade"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {(childrenByParent.get("root") || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                Ainda nao existem unidades organicas.
              </div>
            ) : (
              (childrenByParent.get("root") || []).map((unit) => renderUnit(unit))
            )}
          </div>
        </div>

        <form onSubmit={saveUnit} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-bold text-slate-950">{selectedUnitId ? "Editar unidade" : "Nova unidade"}</h2>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome</span>
              <input value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tipo</span>
                <select value={unitForm.unit_type || "other"} onChange={(event) => setUnitForm((current) => ({ ...current, unit_type: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                  {Object.entries(unitTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Unidade pai</span>
                <select value={unitForm.parent || ""} onChange={(event) => setUnitForm((current) => ({ ...current, parent: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                  <option value="">Sem unidade pai</option>
                  {units.filter((unit) => unit.id !== selectedUnitId).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Gestor</span>
              <select value={unitForm.manager || ""} onChange={(event) => setUnitForm((current) => ({ ...current, manager: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                <option value="">Sem gestor definido</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={Boolean(unitForm.is_security_relevant)} onChange={(event) => setUnitForm((current) => ({ ...current, is_security_relevant: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
              Unidade relevante para seguranca
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descricao</span>
              <textarea value={unitForm.description || ""} onChange={(event) => setUnitForm((current) => ({ ...current, description: event.target.value }))} className="mt-2 min-h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Relevancia de seguranca</span>
              <textarea value={unitForm.security_relevance || ""} onChange={(event) => setUnitForm((current) => ({ ...current, security_relevance: event.target.value }))} className="mt-2 min-h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Servicos criticos associados</span>
              <textarea value={unitForm.critical_services || ""} onChange={(event) => setUnitForm((current) => ({ ...current, critical_services: event.target.value }))} className="mt-2 min-h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <button type="submit" disabled={savingUnit || !unitForm.name.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:bg-slate-300">
              <Save className="h-4 w-4" />
              {savingUnit ? "A guardar..." : "Guardar unidade"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Pessoas e papeis de governance</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Responsaveis, contactos de seguranca e ownership associado a politicas.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPersonId(null);
                setPersonForm(emptyPersonForm);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white hover:bg-indigo-700"
              title="Nova pessoa"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {people.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500 md:col-span-2">
                Ainda nao existem pessoas registadas.
              </div>
            ) : people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => selectPerson(person)}
                className={`rounded-2xl border p-4 text-left transition-all ${selectedPersonId === person.id ? "border-indigo-200 bg-indigo-50" : "border-slate-100 bg-slate-50 hover:border-indigo-100"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {governanceRoleLabel[person.governance_role || "other"] || person.governance_role || "Outro"}
                      </span>
                      {person.is_security_contact && (
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          Contacto seguranca
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-950">{person.name}</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{person.role || person.org_unit_name || "Sem cargo definido"}</p>
                  </div>
                  <UserRound className="h-5 w-5 shrink-0 text-slate-300" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-base font-bold text-slate-950">{ownership.personPolicies.get(person.id) || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Owner</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-base font-bold text-slate-950">{ownership.accountablePolicies.get(person.id) || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Accountable</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-base font-bold text-slate-950">{units.filter((unit) => unit.manager === person.id).length}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Unidades</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={savePerson} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-bold text-slate-950">{selectedPersonId ? "Editar pessoa" : "Nova pessoa"}</h2>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome</span>
              <input value={personForm.name} onChange={(event) => setPersonForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
                <input value={personForm.email || ""} onChange={(event) => setPersonForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Telefone</span>
                <input value={personForm.phone || ""} onChange={(event) => setPersonForm((current) => ({ ...current, phone: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cargo</span>
              <input value={personForm.role || ""} onChange={(event) => setPersonForm((current) => ({ ...current, role: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Papel governance</span>
                <select value={personForm.governance_role || "other"} onChange={(event) => setPersonForm((current) => ({ ...current, governance_role: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                  {Object.entries(governanceRoleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Unidade</span>
                <select value={personForm.org_unit || ""} onChange={(event) => setPersonForm((current) => ({ ...current, org_unit: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                  <option value="">Sem unidade</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Backup de</span>
              <select value={personForm.backup_for || ""} onChange={(event) => setPersonForm((current) => ({ ...current, backup_for: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                <option value="">Nao definido</option>
                {people.filter((person) => person.id !== selectedPersonId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={Boolean(personForm.is_security_contact)} onChange={(event) => setPersonForm((current) => ({ ...current, is_security_contact: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-cyan-600" />
              Contacto de seguranca
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Responsabilidades</span>
              <textarea value={personForm.responsibilities || ""} onChange={(event) => setPersonForm((current) => ({ ...current, responsibilities: event.target.value }))} className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100" />
            </label>
            <button type="submit" disabled={savingPerson || !personForm.name.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-cyan-800 disabled:bg-slate-300">
              <Save className="h-4 w-4" />
              {savingPerson ? "A guardar..." : "Guardar pessoa"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold text-slate-950">Politicas sem owner real</h2>
          </div>
          <div className="mt-5 space-y-3">
            {policiesWithoutRealOwner.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                Todas as politicas carregadas tem owner preenchido.
              </div>
            ) : policiesWithoutRealOwner.slice(0, 8).map((policy) => (
              <Link key={policy.id} to={`/governance/policies/${policy.id}/edit`} className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 hover:border-amber-200 hover:bg-amber-50/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{policy.code || "SEM-CODIGO"}</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">{policy.title}</p>
                  </div>
                  <span className="rounded-full border border-amber-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    Atribuir owner
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-950">Proximos passos de governance</h2>
          </div>
          <div className="mt-5 space-y-3">
            {[
              "Completar contactos de seguranca e backups.",
              "Associar cada politica a owner e accountable real.",
              "Mapear unidades relevantes a servicos criticos.",
              "Usar estes dados no futuro wizard de governance.",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm font-semibold leading-relaxed text-slate-600">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
