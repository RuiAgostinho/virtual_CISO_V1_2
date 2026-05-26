import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Compass,
  Layers3,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { riskApi, type Asset, type PaginatedResponse } from "@/lib/riskApi";

type ClassificationFieldKey =
  | "confidentiality"
  | "integrity"
  | "availability"
  | "exposure"
  | "business_value"
  | "dependency_score";

type ClassificationStatus = "discovered" | "incomplete" | "validated" | "expired";
type Filter = "all" | ClassificationStatus;

type ClassificationForm = Record<ClassificationFieldKey, number> & {
  owner: string;
  rationale: string;
  next_review_at: string;
  classification_status: "incomplete" | "validated" | "expired";
};

const CLASSIFICATION_FIELDS: Array<{ key: ClassificationFieldKey; label: string; hint: string }> = [
  { key: "confidentiality", label: "Confidencialidade", hint: "Impacto da divulgacao nao autorizada" },
  { key: "integrity", label: "Integridade", hint: "Impacto da alteracao indevida" },
  { key: "availability", label: "Disponibilidade", hint: "Impacto da indisponibilidade" },
  { key: "exposure", label: "Exposicao", hint: "Superficie exposta a redes ou terceiros" },
  { key: "business_value", label: "Valor de negocio", hint: "Importancia para operacao/servico" },
  { key: "dependency_score", label: "Dependencia", hint: "Impacto em cadeia noutros ativos" },
];

const SCALE_LABEL: Record<number, string> = {
  1: "Muito baixo",
  2: "Baixo",
  3: "Medio",
  4: "Alto",
  5: "Critico",
};

const STATUS_META: Record<ClassificationStatus, { label: string; tone: string; hint: string }> = {
  discovered: {
    label: "Descoberto",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    hint: "Ativo detetado por discovery; falta validar e classificar.",
  },
  incomplete: {
    label: "Incompleta",
    tone: "border-slate-200 bg-slate-100 text-slate-600",
    hint: "Classificacao iniciada ou por validar formalmente.",
  },
  validated: {
    label: "Validada",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    hint: "Classificacao validada com owner, justificacao e data de revisao.",
  },
  expired: {
    label: "Expirada",
    tone: "border-red-200 bg-red-50 text-red-700",
    hint: "Classificacao fora do ciclo de revisao.",
  },
};

const EMPTY_FORM: ClassificationForm = {
  confidentiality: 3,
  integrity: 3,
  availability: 3,
  exposure: 3,
  business_value: 3,
  dependency_score: 3,
  owner: "",
  rationale: "",
  next_review_at: "",
  classification_status: "validated",
};

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toNumber(value: unknown, fallback = 3) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assetClassificationStatus(asset: Asset): ClassificationStatus {
  if (asset.status === "New") return "discovered";
  if (asset.classification_status === "validated") return "validated";
  if (asset.classification_status === "expired") return "expired";
  return "incomplete";
}

function criticalityTone(value?: string) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function buildInitialForm(asset?: Asset | null): ClassificationForm {
  if (!asset) return EMPTY_FORM;
  const current = asset.current_classification_review;
  return {
    confidentiality: toNumber(asset.confidentiality),
    integrity: toNumber(asset.integrity),
    availability: toNumber(asset.availability),
    exposure: toNumber(asset.exposure),
    business_value: toNumber(asset.business_value),
    dependency_score: toNumber(asset.dependency_score),
    owner: asset.owner || asset.business_owner_name || "",
    rationale: current?.rationale || "",
    next_review_at: current?.next_review_at || "",
    classification_status:
      current?.status === "expired" || current?.status === "incomplete" || current?.status === "validated"
        ? current.status
        : "validated",
  };
}

function validateForm(form: ClassificationForm) {
  for (const field of CLASSIFICATION_FIELDS) {
    const value = form[field.key];
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      return `${field.label} deve estar entre 1 e 5.`;
    }
  }
  if (form.classification_status === "validated") {
    if (!form.owner.trim()) return "Owner e obrigatorio para validar a classificacao.";
    if (!form.rationale.trim()) return "Justificacao e obrigatoria para validar a classificacao.";
    if (!form.next_review_at) return "Data de revisao e obrigatoria para validar a classificacao.";
  }
  return null;
}

function ClassificationModal({
  title,
  subtitle,
  asset,
  assetCount,
  open,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  asset?: Asset | null;
  assetCount?: number;
  open: boolean;
  onClose: () => void;
  onSubmit: (form: ClassificationForm) => Promise<void>;
}) {
  const [form, setForm] = useState<ClassificationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(asset));
      setError(null);
    }
  }, [open, asset]);

  if (!open) return null;

  const update = <K extends keyof ClassificationForm>(key: K, value: ClassificationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    const validation = validateForm(form);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel guardar a classificacao."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Classificacao operacional</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
            {assetCount ? <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{assetCount} ativos selecionados</p> : null}
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-170px)] overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {CLASSIFICATION_FIELDS.map((field) => (
              <label key={field.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{field.label}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-400">{field.hint}</span>
                <select
                  value={form[field.key]}
                  onChange={(event) => update(field.key, Number(event.target.value))}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value} - {SCALE_LABEL[value]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner</span>
              <input
                value={form.owner}
                onChange={(event) => update("owner", event.target.value)}
                placeholder="Responsavel pela classificacao"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Data de revisao</span>
              <input
                type="date"
                value={form.next_review_at}
                onChange={(event) => update("next_review_at", event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</span>
              <select
                value={form.classification_status}
                onChange={(event) => update("classification_status", event.target.value as ClassificationForm["classification_status"])}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="incomplete">Incompleta</option>
                <option value="validated">Validada</option>
                <option value="expired">Expirada</option>
              </select>
            </label>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Justificacao</span>
            <textarea
              value={form.rationale}
              onChange={(event) => update("rationale", event.target.value)}
              placeholder="Explica porque estes valores foram atribuídos. Isto torna a classificacao defensavel em auditoria."
              rows={5}
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-5 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-slate-900"
          >
            Cancelar
          </button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {saving ? "A guardar..." : "Guardar classificacao"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Classification() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wizardAsset, setWizardAsset] = useState<Asset | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listAssets({ page_size: 500 });
      setAssets(unwrap<Asset>(data));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel carregar os ativos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(
    () => assets.map((asset) => ({ asset, classificationStatus: assetClassificationStatus(asset) })),
    [assets],
  );

  const metrics = useMemo(
    () => ({
      total: entries.length,
      discovered: entries.filter((entry) => entry.classificationStatus === "discovered").length,
      incomplete: entries.filter((entry) => entry.classificationStatus === "incomplete").length,
      validated: entries.filter((entry) => entry.classificationStatus === "validated").length,
      expired: entries.filter((entry) => entry.classificationStatus === "expired").length,
    }),
    [entries],
  );

  const visible = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== "all" && entry.classificationStatus !== filter) return false;
      if (!lower) return true;
      const asset = entry.asset;
      return (
        (asset.name || "").toLowerCase().includes(lower) ||
        (asset.wazuh_ip || "").toLowerCase().includes(lower) ||
        (asset.type_name || asset.category_name || "").toLowerCase().includes(lower) ||
        (asset.owner || "").toLowerCase().includes(lower)
      );
    });
  }, [entries, filter, search]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selected.has(asset.id)),
    [assets, selected],
  );

  const toggleSelected = (assetId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const submitSingle = async (form: ClassificationForm) => {
    if (!wizardAsset) return;
    await riskApi.classifyAsset(wizardAsset.id, form);
    setSuccess(`Classificacao do ativo "${wizardAsset.name}" guardada.`);
    setSelected(new Set());
    await load();
  };

  const submitBulk = async (form: ClassificationForm) => {
    const ids = selectedAssets.map((asset) => asset.id);
    await riskApi.bulkClassifyAssets({ ...form, asset_ids: ids });
    setSuccess(`Classificacao aplicada a ${ids.length} ativo(s).`);
    setSelected(new Set());
    await load();
  };

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: metrics.total },
    { key: "discovered", label: "Descobertos", count: metrics.discovered },
    { key: "incomplete", label: "Incompletos", count: metrics.incomplete },
    { key: "validated", label: "Validados", count: metrics.validated },
    { key: "expired", label: "Expirados", count: metrics.expired },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestao de ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Classificacao de ativos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Workspace operacional para classificar ativos por CIA, exposicao, valor de negocio e dependencia, com owner,
              justificacao, data de revisao e validacao humana.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <button
              onClick={() => setBulkOpen(true)}
              disabled={selected.size === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-800 disabled:opacity-40"
            >
              <Layers3 className="h-4 w-4 text-indigo-300" />
              Classificar em massa ({selected.size})
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ListChecks className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ativos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Compass className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.discovered}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Descobertos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Target className="h-5 w-5 text-slate-500" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.incomplete}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Incompletos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.validated}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Validados</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.expired}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Expirados</p>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 shadow-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {success}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  filter === tab.key ? "bg-indigo-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-indigo-700"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="relative xl:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome, IP, tipo ou owner..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar ativos...</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
            <p className="mt-4 text-sm font-bold text-slate-700">Nenhum ativo para este filtro</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">Experimenta outro filtro ou limpa a pesquisa.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map(({ asset, classificationStatus }) => {
              const meta = STATUS_META[classificationStatus];
              return (
                <div key={asset.id} className="p-5 transition-colors hover:bg-slate-50">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <input
                        type="checkbox"
                        checked={selected.has(asset.id)}
                        onChange={() => toggleSelected(asset.id)}
                        className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Selecionar ${asset.name}`}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${meta.tone}`}>
                            {meta.label}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${criticalityTone(asset.criticality)}`}>
                            {asset.criticality || "Sem criticidade"}
                          </span>
                          {asset.classification_review_due && (
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Revisao {new Date(asset.classification_review_due).toLocaleDateString("pt-PT")}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 text-base font-bold text-slate-950">{asset.name}</h3>
                        <p className="mt-0.5 text-sm font-semibold text-slate-500">
                          {asset.type_name || asset.category_name || "Sem tipo"}
                          {asset.wazuh_ip ? ` · ${asset.wazuh_ip}` : ""}
                          {asset.owner ? ` · owner: ${asset.owner}` : ""}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-400">{meta.hint}</p>
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-3 gap-2 text-center sm:grid-cols-6 xl:w-[460px]">
                      {CLASSIFICATION_FIELDS.map((field) => (
                        <div key={field.key} className="rounded-xl bg-slate-50 p-2">
                          <p className="text-lg font-bold text-slate-950">{toNumber(asset[field.key])}</p>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{field.label.slice(0, 4)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        onClick={() => setWizardAsset(asset)}
                        className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                      >
                        {classificationStatus === "validated" ? "Rever" : "Classificar"}
                      </button>
                      <button
                        onClick={() => navigate(`/assets/inventory/${asset.id}`)}
                        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-indigo-600 hover:bg-indigo-50"
                      >
                        Abrir
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ClassificationModal
        open={!!wizardAsset}
        asset={wizardAsset}
        title={wizardAsset ? `Classificar ${wizardAsset.name}` : "Classificar ativo"}
        subtitle="Define dimensoes, owner, justificacao, data de revisao e estado."
        onClose={() => setWizardAsset(null)}
        onSubmit={submitSingle}
      />

      <ClassificationModal
        open={bulkOpen}
        asset={null}
        assetCount={selectedAssets.length}
        title="Classificacao em massa"
        subtitle="Aplica a mesma classificacao operacional aos ativos selecionados."
        onClose={() => setBulkOpen(false)}
        onSubmit={submitBulk}
      />
    </div>
  );
}
