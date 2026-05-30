import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Save, X } from "lucide-react";
import { riskApi, type Asset, type AssetCategory, type AssetLookup, type AssetType } from "@/lib/riskApi";
import { companyApi, type OrgUnit, type Person } from "@/lib/companyApi";

interface AssetFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  asset?: AssetModalRecord | null;
  onClose: () => void;
  onSaved: (asset?: Asset) => void | Promise<void>;
  showClassification?: boolean;
}

type Lookup = { id: number | string; name: string };
type FormScalar = string | number;
type FormIdArray = Array<string | number>;

type AssetFormState = {
  name: string;
  description: string;
  category: FormScalar | "";
  asset_type: FormScalar | "";
  status: string;
  location: FormScalar | "";
  environment: FormScalar | "";
  deployment_type: FormScalar | "";
  supported_service: string;
  business_process: string;
  business_owner: FormScalar | "";
  technical_owner: FormScalar | "";
  org_unit: FormScalar | "";
  parent: FormScalar | "";
  dependent_assets: FormIdArray;
  external_service_assets: FormIdArray;
  integration_assets: FormIdArray;
  confidentiality: number;
  integrity: number;
  availability: number;
  exposure: number;
  business_value: number;
  dependency_score: number;
};

type AssetPayload = {
  name: string;
  description: string;
  category: FormScalar | null;
  asset_type: FormScalar | null;
  status: string;
  location: FormScalar | null;
  environment: FormScalar | null;
  deployment_type: FormScalar | null;
  supported_service: string;
  business_process: string;
  business_owner: FormScalar | null;
  technical_owner: FormScalar | null;
  org_unit: FormScalar | null;
  parent: FormScalar | null;
  dependent_assets: FormIdArray;
  external_service_assets: FormIdArray;
  integration_assets: FormIdArray;
  confidentiality: number;
  integrity: number;
  availability: number;
  exposure: number;
  business_value: number;
  dependency_score: number;
  source?: string;
};

type AssetModalRecord = Partial<Asset> & {
  id: string | number;
  supported_service?: string;
  org_unit?: FormScalar;
  dependent_assets?: FormIdArray;
  external_service_assets?: FormIdArray;
  integration_assets?: FormIdArray;
  business_value?: number | string;
  dependency_score?: number | string;
};

type ClassificationFieldKey =
  | "confidentiality"
  | "integrity"
  | "availability"
  | "exposure"
  | "business_value"
  | "dependency_score";

type DependencyFieldKey = "dependent_assets" | "external_service_assets" | "integration_assets";

type ClassificationLevel = {
  value: number;
  short: string;
  label: string;
  definition: string;
};

type ClassificationField = {
  key: ClassificationFieldKey;
  label: string;
  subtitle: string;
  group: "cid" | "operational";
  color: "sky" | "emerald" | "rose" | "amber" | "slate";
  levels: ClassificationLevel[];
};

const STATUS_OPTIONS = [
  { value: "Active", label: "Ativo" },
  { value: "New", label: "Novo" },
  { value: "Maintenance", label: "Em manutenção" },
  { value: "Retired", label: "Descontinuado" },
];

const COMMON_LEVELS = [
  { value: 1, short: "MB" },
  { value: 2, short: "B" },
  { value: 3, short: "M" },
  { value: 4, short: "A" },
  { value: 5, short: "C" },
];

const CLASSIFICATION_FIELDS: ClassificationField[] = [
  {
    key: "confidentiality",
    label: "Confidencialidade",
    subtitle: "Sensibilidade e sigilo dos dados.",
    group: "cid",
    color: "amber",
    levels: [
      { ...COMMON_LEVELS[0], label: "Público", definition: "Livre acesso. Nenhuma restrição de confidencialidade." },
      { ...COMMON_LEVELS[1], label: "Baixo", definition: "Dados internos sem sensibilidade; uso corporativo normal." },
      { ...COMMON_LEVELS[2], label: "Médio", definition: "Acesso restrito a equipas internas ou funções autorizadas." },
      { ...COMMON_LEVELS[3], label: "Alto", definition: "Informação estratégica; divulgação causa dano financeiro, reputacional ou operacional elevado." },
      { ...COMMON_LEVELS[4], label: "Crítico", definition: "Divulgação pode causar dano legal, reputacional ou operacional catastrófico." },
    ],
  },
  {
    key: "integrity",
    label: "Integridade",
    subtitle: "Exatidão e proteção contra alterações.",
    group: "cid",
    color: "sky",
    levels: [
      { ...COMMON_LEVELS[0], label: "Mínimo", definition: "Integridade pouco relevante para a função do ativo." },
      { ...COMMON_LEVELS[1], label: "Residual", definition: "Alteração causa transtorno cosmético ou facilmente corrigível." },
      { ...COMMON_LEVELS[2], label: "Operacional", definition: "Erros remediáveis, mas com custo, atraso ou validação adicional." },
      { ...COMMON_LEVELS[3], label: "Grave", definition: "Erros podem afetar decisões, faturação, processos críticos ou confiança." },
      { ...COMMON_LEVELS[4], label: "Crítico", definition: "Corrupção de dados causa falha total, irreversível ou legalmente material." },
    ],
  },
  {
    key: "availability",
    label: "Disponibilidade",
    subtitle: "Continuidade operacional necessária.",
    group: "cid",
    color: "emerald",
    levels: [
      { ...COMMON_LEVELS[0], label: "Opcional", definition: "Reposição por conveniência, sem impacto relevante no negócio." },
      { ...COMMON_LEVELS[1], label: "Suporte", definition: "Pode ficar offline até 24 horas sem impacto significativo." },
      { ...COMMON_LEVELS[2], label: "Laboral", definition: "Indispensável em horário útil; tolerância de algumas horas." },
      { ...COMMON_LEVELS[3], label: "Core", definition: "Paragem afeta canais principais, produtividade ou serviço essencial." },
      { ...COMMON_LEVELS[4], label: "24/7 vital", definition: "Indisponibilidade breve pode causar prejuízo elevado ou interrupção crítica." },
    ],
  },
  {
    key: "exposure",
    label: "Exposição",
    subtitle: "Visibilidade perante redes externas.",
    group: "operational",
    color: "rose",
    levels: [
      { ...COMMON_LEVELS[0], label: "Air-gapped", definition: "Isolamento físico ou sem conectividade relevante." },
      { ...COMMON_LEVELS[1], label: "Isolado", definition: "Sem acesso externo; apenas interfaces locais ou altamente restritas." },
      { ...COMMON_LEVELS[2], label: "Interno", definition: "Acessível apenas em redes corporativas internas." },
      { ...COMMON_LEVELS[3], label: "Filtrado", definition: "Acesso via VPN, gateway autenticado ou exposição fortemente controlada." },
      { ...COMMON_LEVELS[4], label: "Público", definition: "Exposto à Internet, DMZ ou terceiros sem controlo equivalente a rede interna." },
    ],
  },
  {
    key: "business_value",
    label: "Valor de negócio",
    subtitle: "Importância estratégica e financeira.",
    group: "operational",
    color: "amber",
    levels: [
      { ...COMMON_LEVELS[0], label: "Legado/teste", definition: "Ativo de teste ou sem valor direto para o negócio." },
      { ...COMMON_LEVELS[1], label: "Apoio", definition: "Suporta processos secundários ou administrativos." },
      { ...COMMON_LEVELS[2], label: "Produtivo", definition: "Necessário para produtividade diária interna." },
      { ...COMMON_LEVELS[3], label: "Estratégico", definition: "Fundamental para competitividade, serviço ou missão da organização." },
      { ...COMMON_LEVELS[4], label: "Crítico", definition: "Gera valor central, receita, serviço essencial ou função pública crítica." },
    ],
  },
  {
    key: "dependency_score",
    label: "Dependência",
    subtitle: "Impacto em outros ativos se falhar.",
    group: "operational",
    color: "slate",
    levels: [
      { ...COMMON_LEVELS[0], label: "Isolado", definition: "Falha não afeta outros sistemas ou processos relevantes." },
      { ...COMMON_LEVELS[1], label: "Terminal", definition: "Ativo final; poucos ou nenhuns serviços dependem dele." },
      { ...COMMON_LEVELS[2], label: "Local", definition: "Impacto em fluxos de trabalho ou equipas locais." },
      { ...COMMON_LEVELS[3], label: "Core", definition: "Vários serviços fundamentais dependem deste ativo." },
      { ...COMMON_LEVELS[4], label: "Pilar", definition: "Falha deste ativo pode comprometer uma parte significativa da infraestrutura." },
    ],
  },
];

const DEPENDENCY_FIELDS: Array<{ key: DependencyFieldKey; label: string; hint: string }> = [
  { key: "dependent_assets", label: "Depende de", hint: "Ativos de que este ativo depende para funcionar" },
  { key: "external_service_assets", label: "Serviços externos", hint: "Serviços externos consumidos por este ativo" },
  { key: "integration_assets", label: "Integrações", hint: "Ativos com que este ativo está integrado" },
];

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const EMPTY_FORM: AssetFormState = {
  name: "",
  description: "",
  category: "",
  asset_type: "",
  status: "Active",
  location: "",
  environment: "",
  deployment_type: "",
  supported_service: "",
  business_process: "",
  business_owner: "",
  technical_owner: "",
  org_unit: "",
  parent: "",
  dependent_assets: [],
  external_service_assets: [],
  integration_assets: [],
  confidentiality: 3,
  integrity: 3,
  availability: 3,
  exposure: 3,
  business_value: 3,
  dependency_score: 3,
};

function unwrap<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toLookup(item: Asset | AssetLookup | AssetCategory | AssetType | Person | OrgUnit): Lookup {
  return { id: item.id ?? "", name: item.name };
}

function toNumber(value: number | string | undefined, fallback = 3) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampClassificationValue(value: number | string | undefined) {
  const parsed = toNumber(value);
  return Math.min(5, Math.max(1, parsed));
}

function getClassificationLevel(field: ClassificationField, value: number | string | undefined) {
  const normalized = clampClassificationValue(value);
  return field.levels.find((level) => level.value === normalized) || field.levels[2] || field.levels[0];
}

function classificationColorClasses(color: ClassificationField["color"], selected = false) {
  const tones: Record<ClassificationField["color"], string> = {
    sky: selected ? "border-sky-500 bg-sky-500 text-white" : "border-sky-100 bg-sky-50 text-sky-700",
    emerald: selected
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-emerald-100 bg-emerald-50 text-emerald-700",
    rose: selected ? "border-rose-600 bg-rose-600 text-white" : "border-rose-100 bg-rose-50 text-rose-700",
    amber: selected ? "border-amber-500 bg-amber-500 text-white" : "border-amber-100 bg-amber-50 text-amber-700",
    slate: selected ? "border-slate-700 bg-slate-700 text-white" : "border-slate-100 bg-slate-50 text-slate-700",
  };
  return tones[color];
}

function classificationLevelLabel(score: number) {
  if (score >= 4.5) return "Crítico";
  if (score >= 3.5) return "Alto";
  if (score >= 2.5) return "Médio";
  if (score >= 1.5) return "Baixo";
  return "Muito baixo";
}

function classificationLevelTone(score: number) {
  if (score >= 4.5) return "text-red-700";
  if (score >= 3.5) return "text-orange-700";
  if (score >= 2.5) return "text-indigo-700";
  if (score >= 1.5) return "text-sky-700";
  return "text-emerald-700";
}

function calculateClassificationPreview(form: AssetFormState) {
  const confidentiality = clampClassificationValue(form.confidentiality);
  const integrity = clampClassificationValue(form.integrity);
  const availability = clampClassificationValue(form.availability);
  const exposure = clampClassificationValue(form.exposure);
  const businessValue = clampClassificationValue(form.business_value);
  const dependency = clampClassificationValue(form.dependency_score);
  const cid = (confidentiality + integrity + availability) / 3;
  const operational = (exposure + businessValue + dependency) / 3;
  const score = cid * 0.4 + exposure * 0.2 + businessValue * 0.2 + dependency * 0.2;

  return {
    cid,
    operational,
    score,
    label: classificationLevelLabel(score),
  };
}

export function AssetFormModal({ open, mode, asset, onClose, onSaved, showClassification = true }: AssetFormModalProps) {
  const [form, setForm] = useState<AssetFormState>(EMPTY_FORM);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [types, setTypes] = useState<AssetType[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [environments, setEnvironments] = useState<Lookup[]>([]);
  const [infrastructures, setInfrastructures] = useState<Lookup[]>([]);
  const [people, setPeople] = useState<Lookup[]>([]);
  const [orgUnits, setOrgUnits] = useState<Lookup[]>([]);
  const [assetOptions, setAssetOptions] = useState<Lookup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      riskApi.listAssetCategories(),
      riskApi.listAssetTypes(),
      riskApi.listAssetLocations(),
      riskApi.listAssetEnvironments(),
      riskApi.listAssetInfrastructures(),
      companyApi.listPeople(),
      companyApi.listOrgUnits(),
      riskApi.listAssets({ page_size: 500 }),
    ])
      .then(([c, t, l, e, i, p, o, a]) => {
        setCategories(unwrap(c).map(toLookup));
        setTypes(unwrap(t));
        setLocations(unwrap(l).map(toLookup));
        setEnvironments(unwrap(e).map(toLookup));
        setInfrastructures(unwrap(i).map(toLookup));
        setPeople(unwrap<Person>(p).map(toLookup));
        setOrgUnits(unwrap<OrgUnit>(o).map(toLookup));
        setAssetOptions(unwrap(a).map(toLookup));
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && asset) {
      setForm({
        name: asset.name ?? "",
        description: asset.description ?? "",
        category: asset.category ?? "",
        asset_type: asset.asset_type ?? "",
        status: asset.status ?? "Active",
        location: asset.location ?? "",
        environment: asset.environment ?? "",
        deployment_type: asset.deployment_type ?? "",
        supported_service: asset.supported_service ?? "",
        business_process: asset.business_process ?? "",
        business_owner: asset.business_owner ?? "",
        technical_owner: asset.technical_owner ?? "",
        org_unit: asset.org_unit ?? "",
        parent: asset.parent ?? "",
        dependent_assets: asset.dependent_assets ?? [],
        external_service_assets: asset.external_service_assets ?? [],
        integration_assets: asset.integration_assets ?? [],
        confidentiality: toNumber(asset.confidentiality),
        integrity: toNumber(asset.integrity),
        availability: toNumber(asset.availability),
        exposure: toNumber(asset.exposure),
        business_value: toNumber(asset.business_value),
        dependency_score: toNumber(asset.dependency_score),
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }, [open, mode, asset]);

  const filteredTypes = useMemo(
    () => types.filter((t) => !form.category || String(t.category) === String(form.category)),
    [types, form.category],
  );

  // An asset can't depend on itself, so exclude the one being edited.
  const dependencyOptions = useMemo(
    () =>
      assetOptions.filter((a) => !(mode === "edit" && asset && String(a.id) === String(asset.id))),
    [assetOptions, mode, asset],
  );
  const cidClassificationFields = CLASSIFICATION_FIELDS.filter((field) => field.group === "cid");
  const operationalClassificationFields = CLASSIFICATION_FIELDS.filter((field) => field.group === "operational");
  const classificationPreview = calculateClassificationPreview(form);

  if (!open) return null;

  const set = <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const createPerson = async (name: string): Promise<Lookup | null> => {
    try {
      const created = await companyApi.createPerson({ name });
      const lookup = { id: created.id, name: created.name };
      setPeople((prev) => [...prev, lookup]);
      return lookup;
    } catch {
      setError("Não foi possível criar a pessoa.");
      return null;
    }
  };

  const createOrgUnit = async (name: string): Promise<Lookup | null> => {
    try {
      const created = await companyApi.createOrgUnit({ name });
      const lookup = { id: created.id, name: created.name };
      setOrgUnits((prev) => [...prev, lookup]);
      return lookup;
    } catch {
      setError("Não foi possível criar a unidade orgânica.");
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!String(form.name || "").trim()) {
      setError("O nome do ativo é obrigatório.");
      return;
    }
    const fk = (v: FormScalar | "") => (v === "" || v == null ? null : v);
    const payload: AssetPayload = {
      name: String(form.name).trim(),
      description: form.description || "",
      category: fk(form.category),
      asset_type: fk(form.asset_type),
      status: form.status,
      location: fk(form.location),
      environment: fk(form.environment),
      deployment_type: fk(form.deployment_type),
      supported_service: form.supported_service || "",
      business_process: form.business_process || "",
      business_owner: fk(form.business_owner),
      technical_owner: fk(form.technical_owner),
      org_unit: fk(form.org_unit),
      parent: fk(form.parent),
      dependent_assets: form.dependent_assets || [],
      external_service_assets: form.external_service_assets || [],
      integration_assets: form.integration_assets || [],
      confidentiality: Number(form.confidentiality),
      integrity: Number(form.integrity),
      availability: Number(form.availability),
      exposure: Number(form.exposure),
      business_value: Number(form.business_value),
      dependency_score: Number(form.dependency_score),
    };
    setSaving(true);
    setError(null);
    try {
      let saved: Asset;
      if (mode === "create") {
        payload.source = "manual";
        saved = await riskApi.createAsset(payload);
      } else {
        saved = await riskApi.updateAsset(asset!.id, payload);
      }
      await onSaved(saved);
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível guardar o ativo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-slate-950/40"
        onClick={() => !saving && onClose()}
      />
      <section className="relative flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestão de ativos</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {mode === "create" ? "Novo ativo" : "Editar ativo"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Identificação</p>
            <Field label="Nome do ativo" required>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ex.: Servidor de aplicações ERP"
              />
            </Field>
            <Field label="Descrição">
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                className={INPUT_CLASS}
                placeholder="Função e contexto operacional do ativo"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Categoria">
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, asset_type: "" }))}
                  className={INPUT_CLASS}
                >
                  <option value="">— Selecionar —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo">
                <select
                  value={form.asset_type}
                  onChange={(e) => set("asset_type", e.target.value)}
                  className={INPUT_CLASS}
                  disabled={!form.category}
                >
                  <option value="">{form.category ? "— Selecionar —" : "Escolha a categoria primeiro"}</option>
                  {filteredTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Estado">
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={INPUT_CLASS}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Contexto organizacional</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Localização">
                <select value={form.location} onChange={(e) => set("location", e.target.value)} className={INPUT_CLASS}>
                  <option value="">— Selecionar —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ambiente">
                <select
                  value={form.environment}
                  onChange={(e) => set("environment", e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">— Selecionar —</option>
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>{env.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Infraestrutura">
                <select
                  value={form.deployment_type}
                  onChange={(e) => set("deployment_type", e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">— Selecionar —</option>
                  {infrastructures.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Serviço suportado">
                <input
                  value={form.supported_service}
                  onChange={(e) => set("supported_service", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Ex.: Faturação"
                />
              </Field>
              <Field label="Processo de negócio">
                <input
                  value={form.business_process}
                  onChange={(e) => set("business_process", e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Ex.: Gestão financeira"
                />
              </Field>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Responsabilidade</p>
              <Link
                to="/governance/responsibilities"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
              >
                Adicionar/editar pessoas
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBlock label="Dono de negócio">
                <CreatableSelect
                  value={form.business_owner}
                  options={people}
                  onChange={(v) => set("business_owner", v)}
                  onCreate={createPerson}
                  placeholder="— Selecionar —"
                  createPlaceholder="Nome da pessoa"
                />
              </FieldBlock>
              <FieldBlock label="Dono técnico">
                <CreatableSelect
                  value={form.technical_owner}
                  options={people}
                  onChange={(v) => set("technical_owner", v)}
                  onCreate={createPerson}
                  placeholder="— Selecionar —"
                  createPlaceholder="Nome da pessoa"
                />
              </FieldBlock>
            </div>
            <FieldBlock label="Unidade orgânica">
              <CreatableSelect
                value={form.org_unit}
                options={orgUnits}
                onChange={(v) => set("org_unit", v)}
                onCreate={createOrgUnit}
                placeholder="— Selecionar —"
                createPlaceholder="Nome da unidade"
              />
            </FieldBlock>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Dependências</p>
            <Field label="Ativo-pai (aloja ou suporta este ativo)">
              <select value={form.parent} onChange={(e) => set("parent", e.target.value)} className={INPUT_CLASS}>
                <option value="">— Nenhum —</option>
                {dependencyOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            {DEPENDENCY_FIELDS.map((df) => (
              <FieldBlock key={df.key} label={df.label} hint={df.hint}>
                <AssetMultiSelect
                  value={form[df.key] || []}
                  options={dependencyOptions}
                  onChange={(ids) => set(df.key, ids)}
                />
              </FieldBlock>
            ))}
          </div>

          {showClassification && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Classificação</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Escolhe cada dimensão com apoio no modelo de classificação. A criticidade final é recalculada
                  automaticamente ao guardar.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                    Segurança da informação (CID)
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500">
                    Impacto em confidencialidade, integridade e disponibilidade.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cidClassificationFields.map((field) => (
                    <ClassificationDimensionCard
                      key={field.key}
                      field={field}
                      value={Number(form[field.key])}
                      onSelect={(value) => set(field.key, value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                    Contexto operacional
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500">
                    Exposição externa, valor para o negócio e dependência operacional.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {operationalClassificationFields.map((field) => (
                    <ClassificationDimensionCard
                      key={field.key}
                      field={field}
                      value={Number(form[field.key])}
                      onSelect={(value) => set(field.key, value)}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                      Pontuação ponderada estimada
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      CID {classificationPreview.cid.toFixed(2)} / contexto operacional{" "}
                      {classificationPreview.operational.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-2xl font-black text-slate-950">{classificationPreview.score.toFixed(2)}</p>
                    <p
                      className={`text-xs font-black uppercase tracking-wide ${classificationLevelTone(
                        classificationPreview.score,
                      )}`}
                    >
                      {classificationPreview.label}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {mode === "create" ? "Criar ativo" : "Guardar alterações"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FieldBlock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-600">{label}</p>
      {hint && <p className="mb-1.5 mt-0.5 text-[11px] font-medium text-slate-500">{hint}</p>}
      <div className={hint ? "" : "mt-1"}>{children}</div>
    </div>
  );
}

function CreatableSelect({
  value,
  options,
  onChange,
  onCreate,
  placeholder,
  createPlaceholder,
}: {
  value: string | number;
  options: Lookup[];
  onChange: (v: string) => void;
  onCreate: (name: string) => Promise<Lookup | null>;
  placeholder: string;
  createPlaceholder: string;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const created = await onCreate(name);
    setBusy(false);
    if (created) {
      onChange(String(created.id));
      setCreating(false);
      setNewName("");
    }
  };

  if (creating) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder={createPlaceholder}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {busy ? "..." : "Criar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setNewName("");
          }}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700"
      >
        <Plus className="h-3.5 w-3.5" />
        Novo
      </button>
    </div>
  );
}

function AssetMultiSelect({
  value,
  options,
  onChange,
}: {
  value: (string | number)[];
  options: Lookup[];
  onChange: (ids: (string | number)[]) => void;
}) {
  const selectedIds = value.map(String);
  const selected = options.filter((o) => selectedIds.includes(String(o.id)));
  const available = options.filter((o) => !selectedIds.includes(String(o.id)));

  return (
    <div className="space-y-2">
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
        className={INPUT_CLASS}
      >
        <option value="">+ Adicionar ativo...</option>
        {available.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              {o.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => String(id) !== String(o.id)))}
                className="text-slate-400 hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassificationDimensionCard({
  field,
  value,
  onSelect,
}: {
  field: ClassificationField;
  value: number;
  onSelect: (value: number) => void;
}) {
  const level = getClassificationLevel(field, value);

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{field.label}</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{field.subtitle}</p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${classificationColorClasses(
            field.color,
            true,
          )}`}
        >
          {value}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1.5 rounded-2xl bg-slate-50 p-1.5">
        {field.levels.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`rounded-xl border px-2 py-2 text-[11px] font-black transition-colors ${
              value === option.value
                ? classificationColorClasses(field.color, true)
                : "border-transparent bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-700"
            }`}
          >
            {option.short}
          </button>
        ))}
      </div>

      <div className={`mt-3 rounded-2xl border p-3 ${classificationColorClasses(field.color)}`}>
        <p className="text-[10px] font-black uppercase tracking-wide opacity-80">Definição técnica</p>
        <p className="mt-1 text-sm font-black">{level.label}</p>
        <p className="mt-1 text-xs font-semibold leading-relaxed opacity-90">{level.definition}</p>
      </div>
    </article>
  );
}

export default AssetFormModal;
