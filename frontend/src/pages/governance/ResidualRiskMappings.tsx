import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Edit3,
  GitBranch,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  GovernanceBadge,
  GovernanceFramedMetricCard,
} from "@/components/governance/GovernancePrimitives";
import { request } from "@/lib/api";
import {
  governanceApi,
  type GovernanceRiskCalculationMode,
  type GovernanceRiskLink,
  type GovernanceRiskLinkSourceType,
  type GovernanceRiskLinkStatus,
  type GovernanceRiskLinkTargetType,
  type PaginatedResponse,
} from "@/lib/governanceApi";
import { mappingReviewApi, type SearchOption } from "@/lib/mappingReviewApi";

type RelationshipType = GovernanceRiskLink["relationship_type"];

type RawRecord = Record<string, unknown>;

type FormState = {
  source_type: GovernanceRiskLinkSourceType;
  target_type: GovernanceRiskLinkTargetType;
  source: SearchOption | null;
  target: SearchOption | null;
  relationship_type: RelationshipType;
  effectiveness_percentage: string;
  residual_impact_percentage: string;
  confidence_score: string;
  rationale: string;
};

type FilterState = {
  search: string;
  source_type: "" | GovernanceRiskLinkSourceType;
  target_type: "" | GovernanceRiskLinkTargetType;
  validation_status: "" | GovernanceRiskLinkStatus;
  source_id: string;
  target_id: string;
};

const sourceTypes: Array<{ value: GovernanceRiskLinkSourceType; label: string; description: string }> = [
  { value: "internal_control", label: "Controlo interno", description: "Catalogo interno agnostico de frameworks" },
  { value: "mechanism", label: "Mecanismo", description: "Mecanismo reutilizavel de implementacao" },
  { value: "internal_control_mechanism", label: "Mecanismo por controlo", description: "Estado operacional num controlo especifico" },
  { value: "policy", label: "Politica", description: "Politica de governo associada" },
  { value: "governance_document", label: "Documento", description: "Norma, procedimento, guideline ou runbook" },
];

const targetTypes: Array<{ value: GovernanceRiskLinkTargetType; label: string; description: string }> = [
  { value: "risk", label: "Risco", description: "Registo formal de risco" },
  { value: "asset", label: "Ativo", description: "Ativo afetado pela mitigacao" },
  { value: "vulnerability", label: "Vulnerabilidade", description: "CVE ou vulnerabilidade catalogada" },
  { value: "asset_vulnerability", label: "Ocorrencia", description: "Vulnerabilidade observada num ativo" },
];

const relationshipTypes: Array<{ value: RelationshipType; label: string; description: string }> = [
  { value: "mitigates", label: "Mitiga", description: "Reduz o risco global" },
  { value: "reduces_likelihood", label: "Reduz probabilidade", description: "Diminui a probabilidade de exploracao" },
  { value: "reduces_impact", label: "Reduz impacto", description: "Diminui o impacto se o evento ocorrer" },
  { value: "detects", label: "Deteta", description: "Melhora detecao e resposta" },
  { value: "prevents", label: "Previne", description: "Atua antes da materializacao" },
  { value: "compensates", label: "Compensa", description: "Compensating control ou medida alternativa" },
  { value: "monitors", label: "Monitoriza", description: "Acompanha sinais de risco" },
];

const statusLabel: Record<GovernanceRiskLinkStatus, string> = {
  draft: "Draft",
  pending_review: "Por validar",
  approved: "Aprovado",
  rejected: "Rejeitado",
  deprecated: "Deprecated",
};

const sourceLabel = Object.fromEntries(sourceTypes.map((item) => [item.value, item.label])) as Record<GovernanceRiskLinkSourceType, string>;
const targetLabel = Object.fromEntries(targetTypes.map((item) => [item.value, item.label])) as Record<GovernanceRiskLinkTargetType, string>;
const relationshipLabel = Object.fromEntries(relationshipTypes.map((item) => [item.value, item.label])) as Record<RelationshipType, string>;

const emptyForm: FormState = {
  source_type: "internal_control",
  target_type: "risk",
  source: null,
  target: null,
  relationship_type: "mitigates",
  effectiveness_percentage: "50",
  residual_impact_percentage: "50",
  confidence_score: "70",
  rationale: "",
};

function queryString(params?: Record<string, unknown>) {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

function unwrap<T>(payload: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(payload)) return payload;
  return payload?.results || [];
}

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRecord(value: unknown): RawRecord {
  return typeof value === "object" && value !== null ? (value as RawRecord) : {};
}

function joinLabel(parts: Array<unknown>, separator = " - ") {
  return parts
    .map((part) => asText(part).trim())
    .filter(Boolean)
    .join(separator);
}

function formatPercent(value: unknown) {
  const parsed = asNumber(value);
  return `${parsed.toFixed(parsed % 1 === 0 ? 0 : 1)}%`;
}

function statusTone(status: string) {
  if (status === "approved") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "border-amber-100 bg-amber-50 text-amber-700";
  if (status === "draft") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (status === "rejected") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-200 bg-white text-slate-600";
}

function optionFromRaw(item: RawRecord, label: string, description?: string, meta?: string): SearchOption {
  return {
    id: asText(item.id),
    label: label || asText(item.id),
    description,
    meta,
    raw: item,
  };
}

async function searchInternalControlMechanisms(search = "") {
  const payload = await request<PaginatedResponse<RawRecord> | RawRecord[]>(
    `/api/governance/internal-control-mechanisms/${queryString({ search, include_inactive: true, page_size: 20 })}`
  );
  return unwrap(payload).map((item) => {
    const control = joinLabel([item.internal_control_code, item.internal_control_title]);
    const mechanism = asText(item.mechanism_title || item.mechanism_name || item.mechanism, "Mecanismo");
    return optionFromRaw(
      item,
      control ? `${control} / ${mechanism}` : mechanism,
      asText(item.rationale || item.relationship_type),
      asText(item.implementation_status || item.validation_status)
    );
  });
}

async function searchAssetVulnerabilities(search = "") {
  const payload = await request<PaginatedResponse<RawRecord> | RawRecord[]>(
    `/api/risk/vulnerability-occurrences/${queryString({ search, page_size: 20 })}`
  );
  return unwrap(payload).map((item) => {
    const vulnerability = asRecord(item.vulnerability_details);
    const asset = asRecord(item.asset_details);
    const cve = asText(item.cve_id || vulnerability.cve_id || item.vulnerability, "Vulnerabilidade");
    const assetName = asText(item.asset_name || asset.name || item.asset, "ativo");
    return optionFromRaw(
      item,
      `${cve} em ${assetName}`,
      asText(item.status || vulnerability.title),
      asText(item.severity || item.source)
    );
  });
}

async function searchSourceOptions(type: GovernanceRiskLinkSourceType, search: string) {
  if (type === "internal_control") return mappingReviewApi.searchInternalControls(search, { include_migrated: true });
  if (type === "mechanism") return mappingReviewApi.searchMechanisms(search);
  if (type === "internal_control_mechanism") return searchInternalControlMechanisms(search);
  if (type === "policy") return mappingReviewApi.searchPolicies(search);
  return mappingReviewApi.searchGovernanceDocuments(search);
}

async function searchTargetOptions(type: GovernanceRiskLinkTargetType, search: string) {
  if (type === "risk") return mappingReviewApi.searchRisks(search);
  if (type === "asset") return mappingReviewApi.searchAssets(search);
  if (type === "vulnerability") return mappingReviewApi.searchVulnerabilities(search);
  return searchAssetVulnerabilities(search);
}

function EntityPicker({
  label,
  helper,
  placeholder,
  value,
  onChange,
  search,
}: {
  label: string;
  helper: string;
  placeholder: string;
  value: SearchOption | null;
  onChange: (option: SearchOption | null) => void;
  search: (query: string) => Promise<SearchOption[]>;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await search(query);
        if (!cancelled) setOptions(result);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setOptions([]);
          setError("Nao foi possivel pesquisar esta entidade.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, search]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:text-red-600"
          >
            Limpar
          </button>
        )}
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>
      {value ? (
        <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-sm font-bold text-indigo-950">{value.label}</p>
          {value.description && <p className="mt-1 line-clamp-2 text-xs font-semibold text-indigo-800">{value.description}</p>}
          {value.meta && (
            <span className="mt-3 inline-flex rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              {value.meta}
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <GitBranch className="h-4 w-4 text-slate-400" />}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              placeholder={placeholder}
            />
          </div>
          {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
          <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-100 bg-white">
            {loading && options.length === 0 ? (
              <div className="p-4 text-xs font-bold uppercase tracking-wide text-slate-400">A pesquisar...</div>
            ) : options.length === 0 ? (
              <div className="p-4 text-xs font-bold uppercase tracking-wide text-slate-400">Sem resultados.</div>
            ) : (
              options.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => onChange(option)}
                  className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-indigo-50"
                >
                  <span className="block text-sm font-bold text-slate-950">{option.label}</span>
                  {option.description && <span className="mt-1 line-clamp-2 block text-xs font-semibold text-slate-500">{option.description}</span>}
                  {option.meta && <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-indigo-600">{option.meta}</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ImpactPreview({
  targetType,
  target,
}: {
  targetType: GovernanceRiskLinkTargetType;
  target: SearchOption | null;
}) {
  const [mode, setMode] = useState<GovernanceRiskCalculationMode>("official");
  const [payload, setPayload] = useState<RawRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setPayload(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let response: unknown = null;
        if (targetType === "risk") response = await governanceApi.getResidualRiskForRisk(target.id, mode, true);
        if (targetType === "asset") response = await governanceApi.getResidualRiskForAsset(target.id, mode, true);
        if (targetType === "vulnerability") response = await governanceApi.getResidualRiskForVulnerability(target.id, mode, true);
        if (!cancelled) setPayload(asRecord(response));
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPayload(null);
          setError("Ainda nao foi possivel calcular impacto para este alvo.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [mode, target, targetType]);

  if (!target) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
        Seleciona um alvo para ver a leitura de risco residual existente.
      </div>
    );
  }

  if (targetType === "asset_vulnerability") {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
        A projecao agregada para ocorrencias asset-vulnerability ainda nao tem endpoint dedicado. O mapping fica registado e auditavel.
      </div>
    );
  }

  const aggregate = asRecord(payload?.aggregate);
  const linksUsed = unwrap(asRecord(payload).links_used as PaginatedResponse<RawRecord> | RawRecord[]);
  const score = payload?.adjusted_residual_score ?? aggregate.adjusted_residual_score_average;
  const reduction = payload?.governance_reduction_percentage ?? aggregate.governance_reduction_percentage_average;
  const base = payload?.base_score ?? aggregate.base_score_average;

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Impacto atual do alvo</p>
          <p className="mt-1 text-sm font-bold text-emerald-950">{target.label}</p>
        </div>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as GovernanceRiskCalculationMode)}
          className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 outline-none"
        >
          <option value="official">Official</option>
          <option value="simulation">Simulation</option>
          <option value="exploratory">Exploratory</option>
        </select>
      </div>
      {loading ? (
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-white/70" />
      ) : error ? (
        <p className="mt-4 rounded-xl border border-amber-100 bg-white px-4 py-3 text-xs font-bold text-amber-700">{error}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score base</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{asNumber(base).toFixed(1)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Reducao</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{formatPercent(reduction)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Residual</p>
            <p className="mt-2 text-2xl font-bold text-indigo-700">{asNumber(score).toFixed(1)}</p>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mappings usados</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{asNumber(payload?.links_used_count, linksUsed.length)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResidualRiskMappings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [links, setLinks] = useState<GovernanceRiskLink[]>([]);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filters, setFilters] = useState<FilterState>(() => ({
    search: searchParams.get("search") || "",
    source_type: (searchParams.get("source_type") as GovernanceRiskLinkSourceType) || "",
    target_type: (searchParams.get("target_type") as GovernanceRiskLinkTargetType) || "",
    validation_status: (searchParams.get("status") as GovernanceRiskLinkStatus) || "",
    source_id: searchParams.get("source_id") || "",
    target_id: searchParams.get("target_id") || "",
  }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const contextFiltersActive = Boolean(filters.source_id || filters.target_id || searchParams.toString());

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [payload, overviewPayload] = await Promise.all([
        governanceApi.listGovernanceRiskLinks({
          include_inactive: true,
          page_size: 100,
          search: filters.search,
          source_type: filters.source_type,
          target_type: filters.target_type,
          validation_status: filters.validation_status,
          source_id: filters.source_id,
          target_id: filters.target_id,
        }),
        governanceApi.getResidualRiskOverview("exploratory"),
      ]);
      setLinks(unwrap(payload));
      setOverview(overviewPayload);
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel carregar os mappings de risco residual.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const sourceSearch = useCallback((query: string) => searchSourceOptions(form.source_type, query), [form.source_type]);
  const targetSearch = useCallback((query: string) => searchTargetOptions(form.target_type, query), [form.target_type]);

  const stats = useMemo(() => {
    const pageStats = links.reduce(
      (acc, link) => {
        acc.total += 1;
        acc[link.validation_status] += 1;
        if (!link.rationale?.trim()) acc.withoutRationale += 1;
        return acc;
      },
      { total: 0, approved: 0, pending_review: 0, draft: 0, rejected: 0, deprecated: 0, withoutRationale: 0 } as Record<GovernanceRiskLinkStatus | "total" | "withoutRationale", number>
    );
    if (!overview) return pageStats;
    return {
      ...pageStats,
      total: asNumber(overview.total_links, pageStats.total),
      approved: asNumber(overview.approved, pageStats.approved),
      pending_review: asNumber(overview.pending_review, pageStats.pending_review),
      draft: asNumber(overview.draft, pageStats.draft),
      rejected: asNumber(overview.rejected, pageStats.rejected),
      deprecated: asNumber(overview.deprecated, pageStats.deprecated),
    };
  }, [links, overview]);

  const validatePercentage = (value: string, field: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new Error(`${field} deve estar entre 0 e 100.`);
    }
    return parsed;
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!form.source) throw new Error("Seleciona a entidade de origem.");
      if (!form.target) throw new Error("Seleciona a entidade alvo.");
      if (!form.rationale.trim()) throw new Error("O rationale e obrigatorio.");

      const payload: Partial<GovernanceRiskLink> = {
        source_type: form.source_type,
        source_id: form.source.id,
        target_type: form.target_type,
        target_id: form.target.id,
        relationship_type: form.relationship_type,
        effectiveness_percentage: validatePercentage(form.effectiveness_percentage, "Eficacia"),
        residual_impact_percentage: validatePercentage(form.residual_impact_percentage, "Impacto residual"),
        confidence_score: validatePercentage(form.confidence_score, "Confianca"),
        rationale: form.rationale.trim(),
      };

      if (editingId) {
        await governanceApi.updateGovernanceRiskLink(editingId, payload);
        setMessage("Mapping atualizado. Continua a precisar de validacao humana se ainda nao estiver aprovado.");
      } else {
        await governanceApi.createGovernanceRiskLink(payload);
        setMessage("Mapping criado em draft para validacao humana.");
      }

      resetForm();
      await loadLinks();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Nao foi possivel guardar o mapping.");
    } finally {
      setSaving(false);
    }
  };

  const editLink = (link: GovernanceRiskLink) => {
    setEditingId(link.id);
    setForm({
      source_type: link.source_type,
      target_type: link.target_type,
      source: {
        id: link.source_id,
        label: link.source_label || link.source_id,
        description: sourceLabel[link.source_type],
        raw: link,
      },
      target: {
        id: link.target_id,
        label: link.target_label || link.target_id,
        description: targetLabel[link.target_type],
        raw: link,
      },
      relationship_type: link.relationship_type,
      effectiveness_percentage: String(link.effectiveness_percentage ?? 50),
      residual_impact_percentage: String(link.residual_impact_percentage ?? 50),
      confidence_score: String(link.confidence_score ?? 70),
      rationale: link.rationale || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const approve = async (link: GovernanceRiskLink) => {
    if (!window.confirm("Aprovar este mapping como oficial para risco residual?")) return;
    setSaving(true);
    setError(null);
    try {
      await governanceApi.approveGovernanceRiskLink(link.id);
      setMessage("Mapping aprovado.");
      await loadLinks();
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel aprovar o mapping.");
    } finally {
      setSaving(false);
    }
  };

  const reject = async (link: GovernanceRiskLink) => {
    const rationale = window.prompt("Justificacao da rejeicao:");
    if (!rationale?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await governanceApi.rejectGovernanceRiskLink(link.id, rationale.trim());
      setMessage("Mapping rejeitado.");
      await loadLinks();
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel rejeitar o mapping.");
    } finally {
      setSaving(false);
    }
  };

  const markDeprecated = async (link: GovernanceRiskLink) => {
    if (!window.confirm("Marcar este mapping como deprecated?")) return;
    setSaving(true);
    setError(null);
    try {
      await governanceApi.markGovernanceRiskLinkDeprecated(link.id);
      setMessage("Mapping marcado como deprecated.");
      await loadLinks();
    } catch (err) {
      console.error(err);
      setError("Nao foi possivel marcar o mapping como deprecated.");
    } finally {
      setSaving(false);
    }
  };

  const clearContextFilters = () => {
    setSearchParams({});
    setFilters({
      search: "",
      source_type: "",
      target_type: "",
      validation_status: "",
      source_id: "",
      target_id: "",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
      <header className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              Risco residual
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Mappings de risco residual</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              Liga controlos internos, mecanismos, politicas e documentos a riscos, ativos e vulnerabilidades. Esta e a ponte que permite demonstrar como a governacao reduz o risco residual.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadLinks}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-red-200 hover:text-red-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link
              to="/governance/workbench"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-800"
            >
              Workbench <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {contextFiltersActive && (
        <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm font-semibold text-indigo-800 md:flex-row md:items-center md:justify-between">
          <span>
            Filtros de contexto aplicados
            {filters.source_id ? ` | origem ${filters.source_id}` : ""}
            {filters.target_id ? ` | alvo ${filters.target_id}` : ""}
          </span>
          <button
            type="button"
            onClick={clearContextFilters}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {message && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <GovernanceFramedMetricCard icon={GitBranch} label="Total" value={stats.total} tone="indigo" />
        <GovernanceFramedMetricCard icon={CheckCircle2} label="Aprovados" value={stats.approved} tone="emerald" />
        <GovernanceFramedMetricCard icon={AlertTriangle} label="Por validar" value={stats.pending_review} tone="amber" />
        <GovernanceFramedMetricCard icon={Edit3} label="Draft" value={stats.draft} tone="indigo" />
        <GovernanceFramedMetricCard icon={XCircle} label="Rejeitados" value={stats.rejected} tone="red" />
        <GovernanceFramedMetricCard icon={AlertTriangle} label="Sem rationale" value={stats.withoutRationale} tone={stats.withoutRationale ? "amber" : "slate"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.8fr]">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {editingId ? "Editar mapping" : "Criar mapping"}
            </p>
            <h2 className="text-xl font-bold text-slate-950">Governacao para risco residual</h2>
            <p className="text-xs font-semibold leading-relaxed text-slate-500">
              O mapping nasce em draft e so entra no score oficial depois de aprovado por validacao humana.
            </p>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Origem</label>
                  <select
                    value={form.source_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        source_type: event.target.value as GovernanceRiskLinkSourceType,
                        source: null,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300"
                  >
                    {sourceTypes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Alvo</label>
                  <select
                    value={form.target_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        target_type: event.target.value as GovernanceRiskLinkTargetType,
                        target: null,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300"
                  >
                    {targetTypes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <EntityPicker
                label={sourceLabel[form.source_type]}
                helper={sourceTypes.find((item) => item.value === form.source_type)?.description || "Seleciona a origem"}
                placeholder="Pesquisar origem..."
                value={form.source}
                onChange={(option) => setForm((current) => ({ ...current, source: option }))}
                search={sourceSearch}
              />

              <EntityPicker
                label={targetLabel[form.target_type]}
                helper={targetTypes.find((item) => item.value === form.target_type)?.description || "Seleciona o alvo"}
                placeholder="Pesquisar alvo..."
                value={form.target}
                onChange={(option) => setForm((current) => ({ ...current, target: option }))}
                search={targetSearch}
              />
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo de relacao</label>
                <select
                  value={form.relationship_type}
                  onChange={(event) => setForm((current) => ({ ...current, relationship_type: event.target.value as RelationshipType }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300"
                >
                  {relationshipTypes.map((item) => (
                    <option key={item.value} value={item.value}>{item.label} - {item.description}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Eficacia %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.effectiveness_percentage}
                    onChange={(event) => setForm((current) => ({ ...current, effectiveness_percentage: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto residual %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.residual_impact_percentage}
                    onChange={(event) => setForm((current) => ({ ...current, residual_impact_percentage: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Confianca %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.confidence_score}
                    onChange={(event) => setForm((current) => ({ ...current, confidence_score: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Rationale</label>
                <textarea
                  value={form.rationale}
                  onChange={(event) => setForm((current) => ({ ...current, rationale: event.target.value }))}
                  placeholder="Explica porque esta entidade de governacao reduz este risco, ativo ou vulnerabilidade."
                  className="mt-2 min-h-40 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed outline-none focus:border-indigo-300"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-800 disabled:bg-slate-300"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingId ? "Guardar alteracoes" : "Criar mapping"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-slate-300"
                  >
                    Cancelar edicao
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <ImpactPreview targetType={form.target_type} target={form.target} />
          </div>
        </div>

        <aside className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Filtros</p>
            <h2 className="text-xl font-bold text-slate-950">Validacao e pesquisa</h2>
          </div>
          <div className="mt-5 space-y-4">
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Pesquisar por id, label ou rationale..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300"
            />
            <select
              value={filters.validation_status}
              onChange={(event) => setFilters((current) => ({ ...current, validation_status: event.target.value as FilterState["validation_status"] }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300"
            >
              <option value="">Todos os estados</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={filters.source_type}
              onChange={(event) => setFilters((current) => ({ ...current, source_type: event.target.value as FilterState["source_type"] }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300"
            >
              <option value="">Todas as origens</option>
              {sourceTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              value={filters.target_type}
              onChange={(event) => setFilters((current) => ({ ...current, target_type: event.target.value as FilterState["target_type"] }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300"
            >
              <option value="">Todos os alvos</option>
              {targetTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={clearContextFilters}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-slate-300"
            >
              Limpar tudo
            </button>
          </div>
        </aside>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mappings registados</p>
            <h2 className="text-xl font-bold text-slate-950">Ponte governacao para risco</h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {links.length} registos
          </span>
        </div>

        {loading ? (
          <div className="p-8">
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : links.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-500">Nao existem mappings para os filtros atuais.</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">Cria uma ligacao acima para comecar a projetar risco residual.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {links.map((link) => (
              <article key={link.id} className="p-5 transition-all hover:bg-slate-50/70">
                <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GovernanceBadge className={statusTone(link.validation_status)}>
                        {statusLabel[link.validation_status] || link.validation_status}
                      </GovernanceBadge>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {relationshipLabel[link.relationship_type] || link.relationship_type}
                      </span>
                      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        eficacia {formatPercent(link.effectiveness_percentage)}
                      </span>
                      <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                        impacto {formatPercent(link.residual_impact_percentage)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{sourceLabel[link.source_type]}</p>
                        <p className="mt-1 text-sm font-bold text-slate-950">{link.source_label || link.source_id}</p>
                      </div>
                      <ArrowRight className="hidden h-5 w-5 text-slate-300 lg:block" />
                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{targetLabel[link.target_type]}</p>
                        <p className="mt-1 text-sm font-bold text-slate-950">{link.target_label || link.target_id}</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm font-semibold leading-relaxed text-slate-500">
                      {link.rationale || "Sem rationale registado."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-start gap-2 xl:max-w-[300px] xl:justify-end">
                    <button
                      type="button"
                      onClick={() => editLink(link)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    {link.validation_status !== "approved" && (
                      <button
                        type="button"
                        onClick={() => approve(link)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aprovar
                      </button>
                    )}
                    {link.validation_status !== "rejected" && (
                      <button
                        type="button"
                        onClick={() => reject(link)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-red-700 hover:bg-red-100"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Rejeitar
                      </button>
                    )}
                    {link.validation_status !== "deprecated" && (
                      <button
                        type="button"
                        onClick={() => markDeprecated(link)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:border-slate-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Deprecated
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
