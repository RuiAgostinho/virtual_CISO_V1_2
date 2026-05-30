import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  Loader2,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { chatApi } from "@/lib/chatApi";
import {
  riskApi,
  type Asset,
  type AssetDiscoveryFinding,
  type PaginatedResponse,
  type RiskConfig,
} from "@/lib/riskApi";
import AssetFormModal from "@/components/ui/AssetFormModal";

type IntakeTab = "findings" | "assets";
type WizardStep = "origin" | "context" | "classification" | "ai" | "finish";
type ClassificationForm = {
  confidentiality: number;
  integrity: number;
  availability: number;
  exposure: number;
  business_value: number;
  dependency_score: number;
  owner: string;
  rationale: string;
  next_review_at: string;
  classification_status: "incomplete" | "validated" | "expired";
};

type ClassificationMetricKey = keyof Pick<
  ClassificationForm,
  "confidentiality" | "integrity" | "availability" | "exposure" | "business_value" | "dependency_score"
>;

type ClassificationLevel = {
  value: number;
  short: string;
  label: string;
  definition: string;
};

type ClassificationDimension = {
  key: ClassificationMetricKey;
  label: string;
  subtitle: string;
  group: "cid" | "operational";
  color: "indigo" | "sky" | "emerald" | "rose" | "amber" | "slate";
  levels: ClassificationLevel[];
};

const DEFAULT_RISK_CONFIG: Pick<RiskConfig, "weight_cia" | "weight_exposure" | "weight_value" | "weight_dependency"> = {
  weight_cia: 0.4,
  weight_exposure: 0.2,
  weight_value: 0.2,
  weight_dependency: 0.2,
};

const COMMON_LEVELS = [
  { value: 1, short: "MB" },
  { value: 2, short: "B" },
  { value: 3, short: "M" },
  { value: 4, short: "A" },
  { value: 5, short: "C" },
];

const CLASSIFICATION_FIELDS: ClassificationDimension[] = [
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

const EMPTY_CLASSIFICATION: ClassificationForm = {
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

function statusTone(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (["validated", "confirmed", "active"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["new", "incomplete", "in_review", "draft"].includes(normalized)) return "border-amber-200 bg-amber-50 text-amber-700";
  if (["expired", "ignored", "duplicate", "failed"].includes(normalized)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function assetNeedsOnboarding(asset: Asset) {
  return asset.status === "New" || asset.classification_status !== "validated" || !asset.business_owner_name || !asset.technical_owner_name;
}

function getRelatedName(record: unknown, nameKey: string, detailKey: string) {
  const source = record as Record<string, unknown>;
  const direct = source[nameKey];
  if (typeof direct === "string" && direct.trim()) return direct;
  const detail = source[detailKey];
  if (detail && typeof detail === "object") {
    const detailRecord = detail as Record<string, unknown>;
    for (const key of ["name", "title", "label"]) {
      const value = detailRecord[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "";
}

function getAssetContext(asset: Asset) {
  return {
    businessOwner: getRelatedName(asset, "business_owner_name", "business_owner_details") || asset.owner || "",
    technicalOwner: getRelatedName(asset, "technical_owner_name", "technical_owner_details"),
    orgUnit: getRelatedName(asset, "org_unit_name", "org_unit_details"),
    type: getRelatedName(asset, "type_name", "type_details") || getRelatedName(asset, "category_name", "category_details"),
    environment: getRelatedName(asset, "environment_name", "environment_details"),
    businessProcess: asset.business_process || "",
  };
}

function buildClassification(asset?: Asset | null): ClassificationForm {
  if (!asset) return EMPTY_CLASSIFICATION;
  const review = asset.current_classification_review;
  const context = getAssetContext(asset);
  return {
    confidentiality: toNumber(asset.confidentiality),
    integrity: toNumber(asset.integrity),
    availability: toNumber(asset.availability),
    exposure: toNumber(asset.exposure),
    business_value: toNumber(asset.business_value),
    dependency_score: toNumber(asset.dependency_score),
    owner: asset.owner || context.businessOwner || "",
    rationale: String(review?.rationale || ""),
    next_review_at: String(review?.next_review_at || ""),
    classification_status:
      review?.status === "incomplete" || review?.status === "expired" || review?.status === "validated"
        ? review.status
        : "validated",
  };
}

function getFieldLevel(field: ClassificationDimension, value: number) {
  return field.levels.find((level) => level.value === value) || field.levels[2];
}

function calculateClassificationPreview(
  classification: ClassificationForm,
  config: Pick<RiskConfig, "weight_cia" | "weight_exposure" | "weight_value" | "weight_dependency"> = DEFAULT_RISK_CONFIG
) {
  const ciaAverage = (classification.confidentiality + classification.integrity + classification.availability) / 3;
  const components = [
    { label: "CID (média C/I/D)", value: ciaAverage, weight: config.weight_cia },
    { label: "Exposição", value: classification.exposure, weight: config.weight_exposure },
    { label: "Valor de negócio", value: classification.business_value, weight: config.weight_value },
    { label: "Dependência", value: classification.dependency_score, weight: config.weight_dependency },
  ].map((component) => ({
    ...component,
    contribution: component.value * component.weight,
  }));
  const score = components.reduce((total, component) => total + component.contribution, 0);
  const rounded = Math.round(score * 100) / 100;
  const level = rounded >= 4.5 ? "Critical" : rounded >= 3.5 ? "High" : rounded >= 2.5 ? "Medium" : "Low";
  return { score: rounded, level, components };
}

function criticalityLabel(level: string) {
  if (level === "Critical") return "Crítico (5)";
  if (level === "High") return "Alto (4)";
  if (level === "Medium") return "Médio (3)";
  return "Baixo (2)";
}

function criticalityTone(level: string) {
  if (level === "Critical") return "text-red-700";
  if (level === "High") return "text-orange-700";
  if (level === "Medium") return "text-sky-700";
  return "text-emerald-700";
}

function colorClasses(color: ClassificationDimension["color"], selected = false) {
  const tones = {
    indigo: selected ? "bg-indigo-600 text-white border-indigo-600" : "border-indigo-100 bg-indigo-50 text-indigo-700",
    sky: selected ? "bg-sky-500 text-white border-sky-500" : "border-sky-100 bg-sky-50 text-sky-700",
    emerald: selected ? "bg-emerald-600 text-white border-emerald-600" : "border-emerald-100 bg-emerald-50 text-emerald-700",
    rose: selected ? "bg-rose-600 text-white border-rose-600" : "border-rose-100 bg-rose-50 text-rose-700",
    amber: selected ? "bg-amber-500 text-white border-amber-500" : "border-amber-100 bg-amber-50 text-amber-700",
    slate: selected ? "bg-slate-700 text-white border-slate-700" : "border-slate-100 bg-slate-50 text-slate-700",
  };
  return tones[color];
}

function ClassificationDimensionCard({
  field,
  value,
  active,
  onSelect,
  onFocus,
}: {
  field: ClassificationDimension;
  value: number;
  active: boolean;
  onSelect: (value: number) => void;
  onFocus: () => void;
}) {
  const level = getFieldLevel(field, value);
  return (
    <article
      onClick={onFocus}
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-all ${
        active ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100 hover:border-indigo-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{field.label}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{field.subtitle}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-black shadow-sm ${colorClasses(field.color, true)}`}>
          {value}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-5 gap-2 rounded-2xl bg-slate-50 p-2">
        {field.levels.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(option.value);
              onFocus();
            }}
            className={`rounded-xl border px-2 py-3 text-[11px] font-black uppercase transition-all ${
              option.value === value
                ? colorClasses(field.color, true)
                : "border-slate-100 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-700"
            }`}
            title={`${option.label}: ${option.definition}`}
          >
            {option.short}
          </button>
        ))}
      </div>

      <div className={`mt-4 rounded-2xl border p-4 ${colorClasses(field.color)}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Definição técnica</p>
        <p className="mt-2 text-sm font-bold">{level.label}</p>
        <p className="mt-1 text-xs font-semibold leading-relaxed opacity-90">{level.definition}</p>
      </div>
    </article>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Entrada de ativos</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function ManualAssetModal({ onClose, onCreated }: { onClose: () => void; onCreated: (asset: Asset) => void }) {
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) {
      setError("O nome do ativo e obrigatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const asset = await riskApi.createAsset({
        name: name.trim(),
        description,
        wazuh_ip: ip || undefined,
        source: "manual",
        status: "New",
        confidentiality: 3,
        integrity: 3,
        availability: 3,
        exposure: 3,
        business_value: 3,
        dependency_score: 3,
      });
      onCreated(asset);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel criar o ativo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Criar ativo para onboarding" onClose={onClose}>
      <div className="space-y-4 p-6">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400" />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">IP / identificador tecnico</span>
          <input value={ip} onChange={(event) => setIp(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400" />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descricao</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400" />
        </label>
      </div>
      <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
        <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">Cancelar</button>
        <button onClick={() => void create()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar e iniciar wizard
        </button>
      </footer>
    </ModalShell>
  );
}

function MetricCard({ icon: Icon, label, value, tone = "text-indigo-700" }: { icon: LucideIcon; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function AiAdvicePanel({
  asset,
  finding,
}: {
  asset: Asset | null;
  finding: AssetDiscoveryFinding | null;
}) {
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (!asset) return;
    setLoading(true);
    setError(null);
    setAnswer("");
    const services = finding?.services?.join(", ") || "sem servicos tecnicos registados";
    const prompt = [
      "Sou CISO e estou a fazer onboarding de um ativo.",
      "Quero uma recomendacao objetiva para classificar o ativo e sugerir controlos/mecanismos iniciais.",
      `Ativo: ${asset.name}`,
      `Descricao: ${asset.description || "sem descricao"}`,
      `IP: ${asset.wazuh_ip || finding?.ip_address || "sem IP"}`,
      `Sistema operativo: ${asset.wazuh_os_name || finding?.os_name || "desconhecido"}`,
      `Servicos detetados: ${services}`,
      `Classificacao atual: C=${asset.confidentiality}, I=${asset.integrity}, A=${asset.availability}, exposicao=${asset.exposure}, valor=${asset.business_value}, dependencia=${asset.dependency_score}`,
      "Responde em portugues de Portugal com: classificacao sugerida, justificacao auditavel, controlos internos recomendados, mecanismos recomendados, evidencias a recolher e riscos principais.",
    ].join("\n");
    try {
      const response = await chatApi.ask(prompt);
      setAnswer(response.response);
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel contactar o assistente IA."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
            <Sparkles className="h-4 w-4" />
            Assistente IA para onboarding
          </div>
          <p className="mt-2 text-sm font-semibold text-indigo-900">
            A IA sugere classificacao, controlos, mecanismos e evidencias. O CISO revê e valida antes de guardar.
          </p>
        </div>
        <button
          onClick={() => void ask()}
          disabled={!asset || loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          Pedir recomendacao
        </button>
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {answer && (
        <div className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-indigo-100 bg-white p-4 text-sm font-semibold leading-relaxed text-slate-700">
          {answer}
        </div>
      )}
    </div>
  );
}

function OnboardingWizard({
  asset,
  finding,
  riskConfig,
  onAssetUpdated,
}: {
  asset: Asset | null;
  finding: AssetDiscoveryFinding | null;
  riskConfig: Pick<RiskConfig, "weight_cia" | "weight_exposure" | "weight_value" | "weight_dependency">;
  onAssetUpdated: (asset: Asset) => void;
}) {
  const [step, setStep] = useState<WizardStep>("origin");
  const [classification, setClassification] = useState<ClassificationForm>(EMPTY_CLASSIFICATION);
  const [activeMetric, setActiveMetric] = useState<ClassificationMetricKey>("confidentiality");
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClassification(buildClassification(asset));
    setActiveMetric("confidentiality");
    setMessage(null);
    setError(null);
    setStep("origin");
  }, [asset]);

  const reloadAsset = async () => {
    if (!asset?.id) return;
    const latest = await riskApi.getAsset(asset.id);
    onAssetUpdated(latest);
  };

  const saveClassification = async () => {
    if (!asset) return;
    if (classification.classification_status === "validated") {
      if (!classification.owner.trim()) {
        setError("O owner e obrigatorio para validar a classificacao.");
        return;
      }
      if (!classification.rationale.trim()) {
        setError("A justificacao e obrigatoria para validar a classificacao.");
        return;
      }
      if (!classification.next_review_at) {
        setError("A data de revisao e obrigatoria para validar a classificacao.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await riskApi.classifyAsset(asset.id, classification);
      await reloadAsset();
      setMessage("Classificacao guardada e rastreavel.");
      setStep("ai");
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel guardar a classificacao."));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      if (asset.source === "discovery") {
        await riskApi.promoteAssetToInventory(asset.id);
      }
      await riskApi.updateAsset(asset.id, { status: "Active" });
      await reloadAsset();
      setMessage("Onboarding concluido. O ativo passa a estar pronto para inventario, risco e priorizacao.");
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel concluir o onboarding."));
    } finally {
      setSaving(false);
    }
  };

  if (!asset) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-xl font-bold text-slate-950">Seleciona um ativo ou finding</h2>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          A fila da esquerda alimenta este wizard. Nada entra como confiavel sem validação humana.
        </p>
      </div>
    );
  }

  const steps: Array<{ key: WizardStep; label: string }> = [
    { key: "origin", label: "Origem" },
    { key: "context", label: "Contexto" },
    { key: "classification", label: "Classificacao" },
    { key: "ai", label: "IA" },
    { key: "finish", label: "Finalizar" },
  ];
  const classificationPreview = calculateClassificationPreview(classification, riskConfig);
  const activeMetricIndex = CLASSIFICATION_FIELDS.findIndex((field) => field.key === activeMetric);
  const activeDimension = CLASSIFICATION_FIELDS[activeMetricIndex] || CLASSIFICATION_FIELDS[0];
  const cidFields = CLASSIFICATION_FIELDS.filter((field) => field.group === "cid");
  const operationalFields = CLASSIFICATION_FIELDS.filter((field) => field.group === "operational");
  const assetContext = getAssetContext(asset);
  const selectMetricValue = (key: ClassificationMetricKey, value: number) => {
    setClassification((current) => ({ ...current, [key]: value }));
  };
  const moveMetric = (direction: 1 | -1) => {
    const next = Math.min(Math.max(activeMetricIndex + direction, 0), CLASSIFICATION_FIELDS.length - 1);
    setActiveMetric(CLASSIFICATION_FIELDS[next].key);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/60 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Wizard de onboarding do ativo</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{asset.name}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {asset.wazuh_ip || finding?.ip_address || "Sem IP"} · {asset.source || "manual"} · {asset.status || "sem estado"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {steps.map((item) => (
              <button
                key={item.key}
                onClick={() => setStep(item.key)}
                className={`rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${
                  step === item.key ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-500 hover:text-indigo-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

        {step === "origin" && (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Dados tecnicos conhecidos</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="font-bold text-slate-400">Origem</dt><dd className="font-semibold text-slate-900">{asset.source || finding?.run_source || "-"}</dd></div>
                <div><dt className="font-bold text-slate-400">IP</dt><dd className="font-semibold text-slate-900">{asset.wazuh_ip || finding?.ip_address || "-"}</dd></div>
                <div><dt className="font-bold text-slate-400">Sistema operativo</dt><dd className="font-semibold text-slate-900">{asset.wazuh_os_name || finding?.os_name || "-"}</dd></div>
                <div><dt className="font-bold text-slate-400">Servicos</dt><dd className="font-semibold text-slate-900">{finding?.services?.join(", ") || "Sem servicos registados nesta fila."}</dd></div>
              </dl>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Objetivo</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-indigo-900">
                Confirmar que o ativo e real, atribuir owner, classificar o impacto, recolher recomendacao IA e so depois
                integrar o ativo na visao de risco e priorizacao.
              </p>
              <button onClick={() => setStep("context")} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white">
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === "context" && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Contexto organizacional</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Completa owners, unidade organica, tipo, ambiente, dependencias e processo suportado.
                </p>
              </div>
              <button onClick={() => setEditOpen(true)} className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white">
                Editar contexto
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Owner negocio", assetContext.businessOwner || "-"],
                ["Owner tecnico", assetContext.technicalOwner || "-"],
                ["Unidade organica", assetContext.orgUnit || "-"],
                ["Tipo", assetContext.type || "-"],
                ["Ambiente", assetContext.environment || "-"],
                ["Processo", assetContext.businessProcess || "-"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setStep("classification")} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700">
              Avancar para classificacao <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === "classification" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-700">
                    Classificação guiada · dimensão {activeMetricIndex + 1} de {CLASSIFICATION_FIELDS.length}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">{activeDimension.label}</h3>
                  <p className="mt-1 text-sm font-semibold leading-relaxed text-indigo-900">
                    Escolhe o nível mais defensável para a dimensão ativa. A definição técnica fica visível para justificar a decisão.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moveMetric(-1)}
                    disabled={activeMetricIndex === 0}
                    className="rounded-xl border border-indigo-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 disabled:opacity-40"
                  >
                    Dimensão anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMetric(1)}
                    disabled={activeMetricIndex === CLASSIFICATION_FIELDS.length - 1}
                    className="rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40"
                  >
                    Próxima dimensão
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 border-l-4 border-indigo-500 pl-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Segurança da informação (CID)</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">Impacto na confidencialidade, integridade e disponibilidade.</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                {cidFields.map((field) => (
                  <ClassificationDimensionCard
                    key={field.key}
                    field={field}
                    value={classification[field.key]}
                    active={activeMetric === field.key}
                    onFocus={() => setActiveMetric(field.key)}
                    onSelect={(value) => selectMetricValue(field.key, value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 border-l-4 border-sky-500 pl-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Contexto operacional</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">Exposição externa, importância estratégica e dependência operacional.</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                {operationalFields.map((field) => (
                  <ClassificationDimensionCard
                    key={field.key}
                    field={field}
                    value={classification[field.key]}
                    active={activeMetric === field.key}
                    onFocus={() => setActiveMetric(field.key)}
                    onSelect={(value) => selectMetricValue(field.key, value)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5 shadow-sm">
              <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr_1fr] xl:items-center">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-700">Pontuação ponderada</p>
                  <p className="mt-2 text-4xl font-black italic tracking-tight text-slate-950">{classificationPreview.score.toFixed(2)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    O backend recalcula este valor ao guardar, usando o modelo de classificação ativo.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {classificationPreview.components.map((component) => (
                    <div key={component.label} className="rounded-xl border border-indigo-100 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{component.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {component.value.toFixed(2)} × {(component.weight * 100).toFixed(0)}% = {component.contribution.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="xl:text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Classificação final provável</p>
                  <p className={`mt-2 text-3xl font-black uppercase ${criticalityTone(classificationPreview.level)}`}>
                    {criticalityLabel(classificationPreview.level)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner da classificacao</span>
                <input value={classification.owner} onChange={(event) => setClassification((current) => ({ ...current, owner: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Proxima revisao</span>
                <input type="date" value={classification.next_review_at} onChange={(event) => setClassification((current) => ({ ...current, next_review_at: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</span>
                <select value={classification.classification_status} onChange={(event) => setClassification((current) => ({ ...current, classification_status: event.target.value as ClassificationForm["classification_status"] }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-indigo-400">
                  <option value="incomplete">Incompleta</option>
                  <option value="validated">Validada</option>
                  <option value="expired">Expirada</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Justificacao auditavel</span>
              <textarea value={classification.rationale} onChange={(event) => setClassification((current) => ({ ...current, rationale: event.target.value }))} rows={5} className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-400" />
            </label>
            <button onClick={() => void saveClassification()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Guardar classificacao
            </button>
          </div>
        )}

        {step === "ai" && <AiAdvicePanel asset={asset} finding={finding} />}

        {step === "finish" && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <h3 className="text-lg font-bold text-emerald-950">Finalizar onboarding</h3>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-900">
              Ao concluir, o ativo fica pronto para inventario oficial, priorizacao de vulnerabilidades, risco residual e
              recomendacoes do assistente.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <span className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-wide ${statusTone(asset.classification_status)}`}>Classificacao: {asset.classification_status || "nao validada"}</span>
              <span className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-wide ${assetContext.businessOwner ? "border-emerald-200 bg-white text-emerald-700" : "border-amber-200 bg-white text-amber-700"}`}>Owner: {assetContext.businessOwner || "em falta"}</span>
              <span className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-wide ${asset.status === "Active" ? "border-emerald-200 bg-white text-emerald-700" : "border-amber-200 bg-white text-amber-700"}`}>Estado: {asset.status}</span>
            </div>
            <button onClick={() => void finish()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Concluir onboarding
            </button>
          </div>
        )}
      </div>

      <AssetFormModal
        open={editOpen}
        mode="edit"
        asset={asset}
        showClassification={false}
        onClose={() => setEditOpen(false)}
        onSaved={(savedAsset) => {
          setEditOpen(false);
          if (savedAsset) onAssetUpdated(savedAsset);
          void reloadAsset();
        }}
      />
    </section>
  );
}

export default function AssetOnboarding() {
  const [findings, setFindings] = useState<AssetDiscoveryFinding[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<IntakeTab>("findings");
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<AssetDiscoveryFinding | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [riskConfig, setRiskConfig] = useState<Pick<RiskConfig, "weight_cia" | "weight_exposure" | "weight_value" | "weight_dependency">>(DEFAULT_RISK_CONFIG);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [findingData, assetData] = await Promise.all([
        riskApi.listAssetDiscoveryFindings({ page_size: 80, ordering: "-created_at" }),
        riskApi.listAssets({ page_size: 500, ordering: "-created_at" }),
      ]);
      setFindings(unwrap(findingData));
      setAssets(unwrap(assetData).filter(assetNeedsOnboarding));
      riskApi.getRiskConfig().then(setRiskConfig).catch(() => setRiskConfig(DEFAULT_RISK_CONFIG));
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel carregar a entrada de ativos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleFindings = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return findings.filter((finding) => finding.status === "new").filter((finding) => {
      if (!lower) return true;
      return [finding.hostname, finding.ip_address, finding.os_name, finding.match_reason].some((value) => String(value || "").toLowerCase().includes(lower));
    });
  }, [findings, search]);

  const visibleAssets = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (!lower) return true;
      return [asset.name, asset.wazuh_ip, asset.type_name, asset.category_name, asset.owner].some((value) => String(value || "").toLowerCase().includes(lower));
    });
  }, [assets, search]);

  const confirmFinding = async (finding: AssetDiscoveryFinding) => {
    setBusy(true);
    setError(null);
    try {
      const confirmed = await riskApi.confirmAssetDiscoveryFinding(finding.id);
      setSelectedFinding(confirmed);
      if (confirmed.asset) {
        const asset = await riskApi.getAsset(String(confirmed.asset));
        setSelectedAsset(asset);
      }
      setMessage("Finding validado. Completa agora o onboarding do ativo.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel validar o finding."));
    } finally {
      setBusy(false);
    }
  };

  const runNmap = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await riskApi.runNmapScan();
      setMessage(result.detail || "Scan Nmap iniciado/concluido.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel executar o scan Nmap."));
    } finally {
      setBusy(false);
    }
  };

  const syncWazuh = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await riskApi.syncWazuh();
      setMessage(result.detail || "Sincronizacao Wazuh iniciada.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Nao foi possivel sincronizar o Wazuh."));
    } finally {
      setBusy(false);
    }
  };

  const selectAsset = async (assetId: string) => {
    const asset = await riskApi.getAsset(assetId);
    setSelectedAsset(asset);
    setSelectedFinding(findings.find((finding) => String(finding.asset) === String(assetId)) || null);
  };

  const metrics = {
    pendingFindings: findings.filter((finding) => finding.status === "new").length,
    onboardingAssets: assets.length,
    withoutOwner: assets.filter((asset) => !asset.business_owner_name && !asset.owner).length,
    unclassified: assets.filter((asset) => asset.classification_status !== "validated").length,
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Ativos e classificacao</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Entrada de ativos</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              Pesquisa ativos por Wazuh/Nmap, cria ativos manuais e valida tudo antes de entrar no inventario fiavel.
              O wizard fecha owner, contexto, classificacao e recomendacao IA.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <button onClick={() => void syncWazuh()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:opacity-50">
              <Shield className="h-4 w-4" />
              Pesquisar Wazuh
            </button>
            <button onClick={() => void runNmap()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:opacity-50">
              <Radar className="h-4 w-4" />
              Pesquisar Nmap
            </button>
            <button onClick={() => setManualOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <Plus className="h-4 w-4 text-indigo-300" />
              Criar manual
            </button>
          </div>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Search} label="Findings por validar" value={metrics.pendingFindings} tone="text-amber-600" />
        <MetricCard icon={ClipboardCheck} label="Ativos em onboarding" value={metrics.onboardingAssets} tone="text-indigo-700" />
        <MetricCard icon={AlertTriangle} label="Sem owner" value={metrics.withoutOwner} tone="text-red-600" />
        <MetricCard icon={Database} label="Sem classificacao valida" value={metrics.unclassified} tone="text-slate-600" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Fila de entrada</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Nada deve ser considerado fiavel antes do wizard.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTab("findings")} className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide ${tab === "findings" ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-500"}`}>Findings</button>
                <button onClick={() => setTab("assets")} className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide ${tab === "assets" ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-500"}`}>Onboarding</button>
              </div>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por nome, IP, sistema ou owner..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-400" />
            </div>
          </div>

          <div className="max-h-[780px] overflow-y-auto">
            {loading ? (
              <div className="p-10 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar dados reais da BD...</div>
            ) : tab === "findings" ? (
              visibleFindings.length === 0 ? (
                <div className="p-10 text-center text-sm font-semibold text-slate-400">Sem findings novos por validar.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {visibleFindings.map((finding) => (
                    <div key={finding.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(finding.status)}`}>{finding.status}</span>
                          <h3 className="mt-3 text-base font-bold text-slate-950">{finding.hostname || finding.ip_address || "Ativo detetado"}</h3>
                          <p className="mt-1 text-sm font-semibold text-slate-500">{finding.ip_address || "Sem IP"} · {finding.os_name || "SO desconhecido"}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">{finding.match_reason || "Novo ativo detetado."}</p>
                        </div>
                        <button onClick={() => void confirmFinding(finding)} disabled={busy} className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50">
                          Validar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : visibleAssets.length === 0 ? (
              <div className="p-10 text-center text-sm font-semibold text-slate-400">Sem ativos pendentes de onboarding.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleAssets.map((asset) => (
                  <button key={asset.id} onClick={() => void selectAsset(asset.id)} className="block w-full p-4 text-left hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(asset.status)}`}>{asset.status || "sem estado"}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(asset.classification_status)}`}>{asset.classification_status || "sem classificacao"}</span>
                        </div>
                        <h3 className="mt-3 text-base font-bold text-slate-950">{asset.name}</h3>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{asset.wazuh_ip || "Sem IP"} · {asset.type_name || asset.category_name || "Sem tipo"}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">{asset.business_owner_name || asset.owner ? `Owner: ${asset.business_owner_name || asset.owner}` : "Owner em falta"}</p>
                      </div>
                      <ChevronRight className="mt-3 h-4 w-4 text-slate-300" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <OnboardingWizard
          asset={selectedAsset}
          finding={selectedFinding}
          riskConfig={riskConfig}
          onAssetUpdated={(asset) => {
            setSelectedAsset(asset);
            void load();
          }}
        />
      </section>

      {manualOpen && (
        <ManualAssetModal
          onClose={() => setManualOpen(false)}
          onCreated={(asset) => {
            setSelectedAsset(asset);
            setSelectedFinding(null);
            setTab("assets");
            setMessage("Ativo manual criado em estado de onboarding.");
            void load();
          }}
        />
      )}
    </div>
  );
}
