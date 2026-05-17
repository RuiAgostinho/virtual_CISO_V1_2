import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Save, X } from "lucide-react";
import { riskApi } from "@/lib/riskApi";

interface AssetFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  asset?: Record<string, any> | null;
  onClose: () => void;
  onSaved: () => void;
}

type Lookup = { id: number | string; name: string };

const STATUS_OPTIONS = [
  { value: "Active", label: "Ativo" },
  { value: "New", label: "Novo" },
  { value: "Maintenance", label: "Em manutenção" },
  { value: "Retired", label: "Descontinuado" },
];

const SCALE_LABEL: Record<number, string> = {
  1: "Muito baixo",
  2: "Baixo",
  3: "Médio",
  4: "Alto",
  5: "Crítico",
};

const CLASSIFICATION_FIELDS = [
  { key: "confidentiality", label: "Confidencialidade", hint: "Impacto da divulgação não autorizada" },
  { key: "integrity", label: "Integridade", hint: "Impacto da alteração indevida dos dados" },
  { key: "availability", label: "Disponibilidade", hint: "Impacto da indisponibilidade do ativo" },
  { key: "exposure", label: "Exposição", hint: "Grau de exposição a redes não confiáveis" },
  { key: "business_value", label: "Valor de negócio", hint: "Valor do ativo para a organização" },
  { key: "dependency_score", label: "Dependência", hint: "Dependência de/para outros ativos" },
];

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const EMPTY_FORM: Record<string, any> = {
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
  confidentiality: 3,
  integrity: 3,
  availability: 3,
  exposure: 3,
  business_value: 3,
  dependency_score: 3,
};

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

export function AssetFormModal({ open, mode, asset, onClose, onSaved }: AssetFormModalProps) {
  const [form, setForm] = useState<Record<string, any>>(EMPTY_FORM);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [environments, setEnvironments] = useState<Lookup[]>([]);
  const [infrastructures, setInfrastructures] = useState<Lookup[]>([]);
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
    ])
      .then(([c, t, l, e, i]) => {
        setCategories(unwrap(c));
        setTypes(unwrap(t));
        setLocations(unwrap(l));
        setEnvironments(unwrap(e));
        setInfrastructures(unwrap(i));
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
        confidentiality: asset.confidentiality ?? 3,
        integrity: asset.integrity ?? 3,
        availability: asset.availability ?? 3,
        exposure: asset.exposure ?? 3,
        business_value: asset.business_value ?? 3,
        dependency_score: asset.dependency_score ?? 3,
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }, [open, mode, asset]);

  const filteredTypes = useMemo(
    () => types.filter((t) => !form.category || String(t.category) === String(form.category)),
    [types, form.category],
  );

  if (!open) return null;

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!String(form.name || "").trim()) {
      setError("O nome do ativo é obrigatório.");
      return;
    }
    const fk = (v: any) => (v === "" || v == null ? null : v);
    const payload: Record<string, any> = {
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
      if (mode === "create") {
        payload.source = "manual";
        await riskApi.createAsset(payload);
      } else {
        await riskApi.updateAsset(asset!.id, payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Não foi possível guardar o ativo.");
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

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Classificação</p>
            <p className="text-xs font-medium text-slate-500">
              Escala de 1 (muito baixo) a 5 (crítico). A criticidade do ativo é recalculada automaticamente a
              partir destes valores ao guardar.
            </p>
            <div className="space-y-2.5">
              {CLASSIFICATION_FIELDS.map((cf) => (
                <ScaleRow
                  key={cf.key}
                  label={cf.label}
                  hint={cf.hint}
                  value={Number(form[cf.key])}
                  onChange={(v) => set(cf.key, v)}
                />
              ))}
            </div>
          </div>
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

function ScaleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{label}</p>
          <p className="text-[11px] font-medium text-slate-500">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                  value === n
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-indigo-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="w-20 text-right text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {SCALE_LABEL[value] || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AssetFormModal;
