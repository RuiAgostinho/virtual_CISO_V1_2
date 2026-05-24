/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { mappingReviewApi, type MappingRecord, type SearchOption, type TraceabilityPayload } from "@/lib/mappingReviewApi";

type RelationshipType = "equivalent" | "partial" | "supports" | "overlaps" | "derived";
type SearchKind = "internal_control" | "framework" | "framework_control";

type MappingForm = {
  relationship_type: RelationshipType;
  coverage_percentage: number;
  confidence_score: number;
  rationale: string;
};

const steps = ["Controlo interno", "Framework", "Controlo externo", "Relacao", "Impacto", "Revisao"];

const relationshipTypes: Array<{ value: RelationshipType; label: string; description: string }> = [
  { value: "equivalent", label: "Equivalent", description: "O controlo interno cobre o controlo externo de forma direta." },
  { value: "partial", label: "Partial", description: "O controlo interno cobre apenas parte do requisito externo." },
  { value: "supports", label: "Supports", description: "O controlo interno suporta a demonstracao de conformidade." },
  { value: "overlaps", label: "Overlaps", description: "Existe sobreposicao relevante, mas nao equivalencia total." },
  { value: "derived", label: "Derived", description: "O controlo interno deriva do requisito externo ou de uma interpretacao local." },
];

const traceabilityOptions = {
  mode: "official" as const,
  include_inactive: true,
  include_evidence: true,
  include_gaps: true,
  include_scores: true,
  max_depth: 3 as const,
};

function getApiErrorMessage(err: any, fallback: string) {
  if (typeof err?.message === "string" && err.message) return err.message;
  if (typeof err?.detail === "string") return err.detail;
  if (typeof err === "string") return err;
  return fallback;
}

function unwrap<T = any>(payload: any): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.results || [];
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function entityId(item: any) {
  return String(item?.id || item?.pk || item?.uuid || "");
}

function entityLabel(item: any) {
  if (!item) return "-";
  if (item.framework_code && item.code && item.title) return `${item.framework_code}:${item.code} - ${item.title}`;
  if (item.code && item.title) return `${item.code} - ${item.title}`;
  if (item.code && item.name) return `${item.code} - ${item.name}`;
  if (item.name && item.version) return `${item.name} ${item.version}`;
  return item.title || item.name || item.code || item.label || item.id || "-";
}

function relationshipItems(traceability: TraceabilityPayload | null, key: string) {
  return unwrap(traceability?.relationships?.[key]);
}

function inactiveMapping(mapping: MappingRecord) {
  return mapping.validation_status === "rejected" || mapping.validation_status === "deprecated";
}

function statusTone(status?: string) {
  if (status === "approved" || status === "active" || status === "compliant") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review" || status === "draft" || status === "mostly_compliant") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "rejected" || status === "non_compliant") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated" || status === "archived" || status === "not_assessed") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function scoreValue(score?: any) {
  const raw = score?.score ?? score?.official?.score ?? score?.result?.score ?? score?.details?.score;
  if (raw === undefined || raw === null || raw === "") return "-";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(raw);
}

function coverageValue(payload?: any) {
  const raw = payload?.coverage ?? payload?.details?.coverage ?? payload?.score?.coverage;
  if (raw === undefined || raw === null || raw === "") return "-";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(raw);
}

function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex min-w-max gap-2">
        {steps.map((step, index) => {
          const active = index === currentStep;
          const done = index < currentStep;
          return (
            <div
              key={step}
              className={`min-w-[150px] rounded-xl border px-3 py-3 ${
                active
                  ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                  : done
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-slate-100 bg-slate-50 text-slate-500"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-black ${done ? "bg-emerald-600 text-white" : active ? "bg-indigo-600 text-white" : "bg-white text-slate-400"}`}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="truncate text-[10px] font-bold uppercase tracking-wide">{step}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  icon?: typeof ShieldCheck;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <div className="mt-2 text-xl font-black text-slate-900">{value}</div>
        </div>
        {Icon && (
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
      {helper && <div className="mt-2 text-xs text-slate-500">{helper}</div>}
    </div>
  );
}

function SearchPicker({
  kind,
  selected,
  onSelect,
  placeholder,
  frameworkId,
  disabled,
}: {
  kind: SearchKind;
  selected?: SearchOption | null;
  onSelect: (option: SearchOption | null) => void;
  placeholder: string;
  frameworkId?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disabled) {
      setOptions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        let results: SearchOption[] = [];
        if (kind === "internal_control") results = await mappingReviewApi.searchInternalControls(query, { page_size: 25 });
        if (kind === "framework") results = await mappingReviewApi.searchFrameworks(query);
        if (kind === "framework_control") results = await mappingReviewApi.searchFrameworkControls(query, frameworkId);
        if (!controller.signal.aborted) setOptions(results);
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(err, "Nao foi possivel pesquisar."));
          setOptions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [disabled, frameworkId, kind, query]);

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black text-indigo-950">{selected.label}</p>
              {selected.description && <p className="mt-1 line-clamp-3 text-sm text-indigo-800/80">{selected.description}</p>}
              {selected.meta && <Badge className="mt-3 border-indigo-200 bg-white text-indigo-700">{selected.meta}</Badge>}
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Limpar
            </button>
          </div>
        </div>
      ) : (
        <div className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm ${disabled ? "opacity-60" : ""}`}>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              disabled={disabled}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed"
            />
          </label>
          {loading && (
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              A pesquisar...
            </div>
          )}
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
          {!loading && !error && options.length === 0 && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Sem resultados para mostrar.</p>
          )}
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option)}
                className="w-full rounded-xl border border-slate-100 bg-white p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">{option.label}</p>
                    {option.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{option.description}</p>}
                  </div>
                  {option.meta && <Badge className="border-slate-200 bg-slate-50 text-slate-600">{option.meta}</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImpactList({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
        <Badge className="border-slate-200 bg-slate-50 text-slate-600">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{empty}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.slice(0, 6).map((item) => (
            <div key={entityId(item) || entityLabel(item)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-800">{entityLabel(item)}</p>
              {(item.description || item.purpose || item.scope) && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description || item.purpose || item.scope}</p>
              )}
            </div>
          ))}
          {items.length > 6 && <p className="text-xs font-semibold text-slate-400">+{items.length - 6} adicionais</p>}
        </div>
      )}
    </div>
  );
}

function ExistingMappingsPanel({ mappings }: { mappings: MappingRecord[] }) {
  const active = mappings.filter((mapping) => !inactiveMapping(mapping));
  const inactive = mappings.filter(inactiveMapping);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-900">Mappings existentes</h3>
        <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">{active.length} ativos</Badge>
      </div>
      {mappings.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Ainda nao existem mappings conhecidos neste contexto.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {mappings.slice(0, 8).map((mapping) => (
            <div key={mapping.id} className={`rounded-xl border p-3 ${inactiveMapping(mapping) ? "border-slate-100 bg-slate-50 opacity-70" : "border-indigo-100 bg-indigo-50"}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">{mapping.sourceLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">{mapping.targetLabel}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={statusTone(mapping.validation_status)}>{mapping.validation_status}</Badge>
                  {mapping.relationship_type && <Badge className="border-slate-200 bg-white text-slate-600">{mapping.relationship_type}</Badge>}
                  {mapping.coverage_percentage !== undefined && <Badge className="border-slate-200 bg-white text-slate-600">{mapping.coverage_percentage}%</Badge>}
                </div>
              </div>
            </div>
          ))}
          {inactive.length > 0 && <p className="text-xs font-semibold text-slate-400">{inactive.length} mapeamentos inativos separados visualmente.</p>}
        </div>
      )}
    </div>
  );
}

export default function FrameworkMappingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedInternalControl, setSelectedInternalControl] = useState<SearchOption | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<SearchOption | null>(null);
  const [selectedFrameworkControl, setSelectedFrameworkControl] = useState<SearchOption | null>(null);
  const [form, setForm] = useState<MappingForm>({
    relationship_type: "equivalent",
    coverage_percentage: 100,
    confidence_score: 80,
    rationale: "",
  });
  const [internalControlTraceability, setInternalControlTraceability] = useState<TraceabilityPayload | null>(null);
  const [frameworkTraceability, setFrameworkTraceability] = useState<TraceabilityPayload | null>(null);
  const [frameworkControlTraceability, setFrameworkControlTraceability] = useState<TraceabilityPayload | null>(null);
  const [internalControlScore, setInternalControlScore] = useState<any>(null);
  const [frameworkScore, setFrameworkScore] = useState<any>(null);
  const [frameworkControlScore, setFrameworkControlScore] = useState<any>(null);
  const [existingControlMappings, setExistingControlMappings] = useState<MappingRecord[]>([]);
  const [existingExternalMappings, setExistingExternalMappings] = useState<MappingRecord[]>([]);
  const [loadingInternal, setLoadingInternal] = useState(false);
  const [loadingFramework, setLoadingFramework] = useState(false);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdMapping, setCreatedMapping] = useState<any>(null);

  useEffect(() => {
    if (!selectedInternalControl) {
      setInternalControlTraceability(null);
      setInternalControlScore(null);
      setExistingControlMappings([]);
      return;
    }

    let active = true;
    setLoadingInternal(true);
    setContextError(null);
    Promise.all([
      mappingReviewApi.getInternalControlTraceability(selectedInternalControl.id, traceabilityOptions),
      mappingReviewApi.getInternalControlComplianceScore(selectedInternalControl.id, { mode: "official", include_details: true, include_gaps: true }),
      mappingReviewApi.listMappings("internal_control_framework_mapping", { internal_control: selectedInternalControl.id, page_size: 500 }),
    ])
      .then(([traceability, score, mappings]) => {
        if (!active) return;
        setInternalControlTraceability(traceability);
        setInternalControlScore(score);
        setExistingControlMappings(mappings);
      })
      .catch((err: any) => {
        if (active) setContextError(getApiErrorMessage(err, "Nao foi possivel carregar o impacto do controlo interno."));
      })
      .finally(() => {
        if (active) setLoadingInternal(false);
      });

    return () => {
      active = false;
    };
  }, [selectedInternalControl]);

  useEffect(() => {
    if (!selectedFramework) {
      setFrameworkTraceability(null);
      setFrameworkScore(null);
      setSelectedFrameworkControl(null);
      return;
    }

    let active = true;
    setLoadingFramework(true);
    setContextError(null);
    Promise.all([
      mappingReviewApi.getFrameworkTraceability(selectedFramework.id, { ...traceabilityOptions, max_depth: 2 }),
      mappingReviewApi.getFrameworkScore(selectedFramework.id, { mode: "official", include_details: true, include_gaps: true }),
    ])
      .then(([traceability, score]) => {
        if (!active) return;
        setFrameworkTraceability(traceability);
        setFrameworkScore(score);
      })
      .catch((err: any) => {
        if (active) setContextError(getApiErrorMessage(err, "Nao foi possivel carregar o resumo da framework."));
      })
      .finally(() => {
        if (active) setLoadingFramework(false);
      });

    return () => {
      active = false;
    };
  }, [selectedFramework]);

  useEffect(() => {
    if (!selectedFrameworkControl) {
      setFrameworkControlTraceability(null);
      setFrameworkControlScore(null);
      setExistingExternalMappings([]);
      return;
    }

    let active = true;
    setLoadingExternal(true);
    setContextError(null);
    Promise.all([
      mappingReviewApi.getFrameworkControlTraceability(selectedFrameworkControl.id, traceabilityOptions),
      mappingReviewApi.getFrameworkControlComplianceScore(selectedFrameworkControl.id, { mode: "official", include_details: true, include_gaps: true }),
      mappingReviewApi.listMappings("internal_control_framework_mapping", { framework_control: selectedFrameworkControl.id, page_size: 500 }),
    ])
      .then(([traceability, score, mappings]) => {
        if (!active) return;
        setFrameworkControlTraceability(traceability);
        setFrameworkControlScore(score);
        setExistingExternalMappings(mappings);
      })
      .catch((err: any) => {
        if (active) setContextError(getApiErrorMessage(err, "Nao foi possivel carregar o controlo externo."));
      })
      .finally(() => {
        if (active) setLoadingExternal(false);
      });

    return () => {
      active = false;
    };
  }, [selectedFrameworkControl]);

  const loadingContext = loadingInternal || loadingFramework || loadingExternal;

  const existingMappings = useMemo(() => {
    return uniqueBy([...existingControlMappings, ...existingExternalMappings], (mapping) => String(mapping.id));
  }, [existingControlMappings, existingExternalMappings]);

  const activeDuplicate = useMemo(() => {
    if (!selectedInternalControl || !selectedFrameworkControl) return null;
    return existingMappings.find((mapping) => (
      String(mapping.sourceId) === String(selectedInternalControl.id)
      && String(mapping.targetId) === String(selectedFrameworkControl.id)
      && !inactiveMapping(mapping)
    )) || null;
  }, [existingMappings, selectedFrameworkControl, selectedInternalControl]);

  const mechanisms = useMemo(() => {
    return uniqueBy(
      [
        ...relationshipItems(internalControlTraceability, "mechanisms"),
        ...relationshipItems(frameworkControlTraceability, "mechanisms"),
      ],
      entityId
    );
  }, [frameworkControlTraceability, internalControlTraceability]);

  const policies = useMemo(() => {
    return uniqueBy(
      [
        ...relationshipItems(internalControlTraceability, "policies"),
        ...relationshipItems(frameworkControlTraceability, "policies"),
      ],
      entityId
    );
  }, [frameworkControlTraceability, internalControlTraceability]);

  const documents = useMemo(() => {
    return uniqueBy(
      [
        ...relationshipItems(internalControlTraceability, "governance_documents"),
        ...relationshipItems(frameworkControlTraceability, "governance_documents"),
      ],
      entityId
    );
  }, [frameworkControlTraceability, internalControlTraceability]);

  const impactedFrameworks = useMemo(() => {
    return uniqueBy(
      [
        ...relationshipItems(internalControlTraceability, "frameworks"),
        ...relationshipItems(frameworkControlTraceability, "frameworks"),
        ...(selectedFramework ? [selectedFramework.raw] : []),
      ],
      entityId
    );
  }, [frameworkControlTraceability, internalControlTraceability, selectedFramework]);

  const frameworkControls = useMemo(() => {
    return uniqueBy(
      [
        ...relationshipItems(internalControlTraceability, "framework_controls"),
        ...(selectedFrameworkControl ? [selectedFrameworkControl.raw] : []),
      ],
      entityId
    );
  }, [internalControlTraceability, selectedFrameworkControl]);

  const gaps = useMemo(() => {
    return [
      ...unwrap(internalControlTraceability?.gaps),
      ...unwrap(frameworkControlTraceability?.gaps),
      ...unwrap(frameworkTraceability?.gaps),
    ].slice(0, 8);
  }, [frameworkControlTraceability, frameworkTraceability, internalControlTraceability]);

  function validateStep(stepIndex: number) {
    if (stepIndex === 0 && !selectedInternalControl) return "Seleciona um InternalControl antes de continuar.";
    if (stepIndex === 1 && !selectedFramework) return "Seleciona uma framework antes de continuar.";
    if (stepIndex === 2 && !selectedFrameworkControl) return "Seleciona um controlo externo da framework.";
    if (stepIndex === 3) {
      if (!form.relationship_type) return "Seleciona o tipo de relacao.";
      if (form.coverage_percentage < 0 || form.coverage_percentage > 100) return "A cobertura tem de estar entre 0 e 100.";
      if (form.confidence_score < 0 || form.confidence_score > 100) return "A confianca tem de estar entre 0 e 100.";
      if (!form.rationale.trim()) return "Indica uma rationale para defender o mapeamento.";
    }
    return null;
  }

  function goNext() {
    const error = validateStep(currentStep);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setCurrentStep((value) => Math.min(value + 1, steps.length - 1));
  }

  function goBack() {
    setValidationError(null);
    setCurrentStep((value) => Math.max(value - 1, 0));
  }

  async function handleCreate() {
    const error = [0, 1, 2, 3].map(validateStep).find(Boolean);
    if (error) {
      setValidationError(error);
      return;
    }
    if (activeDuplicate) {
      setValidationError("Ja existe um mapping ativo para este par InternalControl + FrameworkControl.");
      return;
    }
    if (!selectedInternalControl || !selectedFrameworkControl) return;

    setSaving(true);
    setSaveError(null);
    setValidationError(null);
    try {
      const created = await mappingReviewApi.createInternalControlFrameworkMapping({
        internal_control: selectedInternalControl.id,
        framework_control: selectedFrameworkControl.id,
        relationship_type: form.relationship_type,
        coverage_percentage: form.coverage_percentage,
        confidence_score: form.confidence_score,
        rationale: form.rationale.trim(),
      });
      setCreatedMapping(created);
    } catch (err: any) {
      setSaveError(getApiErrorMessage(err, "Nao foi possivel criar o mapeamento."));
    } finally {
      setSaving(false);
    }
  }

  if (createdMapping) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-8 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge className="border-emerald-200 bg-white text-emerald-700">Mapping criado</Badge>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-emerald-950">Matriz framework atualizada.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-800">
                O mapeamento foi criado como manual/draft para validacao humana. A aprovacao final pode ser feita na Mapping Review.
              </p>
            </div>
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryTile label="InternalControl" value={selectedInternalControl?.label || "-"} icon={ShieldCheck} />
          <SummaryTile label="Framework" value={selectedFramework?.label || "-"} icon={Layers3} />
          <SummaryTile label="Control externo" value={selectedFrameworkControl?.label || "-"} icon={Network} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/governance/mapping-review" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">
            Abrir Mapping Review
          </Link>
          {selectedInternalControl && (
            <a href={`/api/governance/traceability/internal-control/${selectedInternalControl.id}/`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Traceability do InternalControl
            </a>
          )}
          {selectedFramework && (
            <a href={`/api/governance/traceability/framework/${selectedFramework.id}/`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Traceability da Framework
            </a>
          )}
          {selectedFramework && (
            <a href={`/api/governance/compliance-propagation/framework/${selectedFramework.id}/`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Compliance da Framework
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">Framework Mapping Wizard</Badge>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Mapear controlos internos para frameworks.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Cria mapeamentos defensaveis entre o catalogo interno de controlos e os requisitos externos, com rationale,
              cobertura, confianca e visibilidade de impacto antes de gravar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/governance/mapping-review" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <GitBranch className="h-4 w-4" />
              Mapping Review
            </Link>
          </div>
        </div>
      </div>

      <WizardStepper currentStep={currentStep} />

      {(validationError || saveError || contextError || activeDuplicate) && (
        <div className={`rounded-2xl border p-4 text-sm shadow-sm ${activeDuplicate ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-100 bg-red-50 text-red-700"}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">{validationError || saveError || contextError || "Ja existe um mapping ativo para este par."}</p>
              {activeDuplicate && (
                <p className="mt-1 text-xs">
                  Mapping existente: {activeDuplicate.sourceLabel} {"->"} {activeDuplicate.targetLabel}. Abre a Mapping Review para editar ou aprovar este registo.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {loadingContext && (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar contexto e impacto...
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {currentStep === 0 && (
            <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-black text-slate-950">1. Selecionar controlo interno</h2>
                  <p className="mt-1 text-sm text-slate-500">Pesquisa por codigo, titulo, descricao ou dominio do catalogo interno.</p>
                </div>
              </div>
              <SearchPicker
                kind="internal_control"
                selected={selectedInternalControl}
                onSelect={setSelectedInternalControl}
                placeholder="Pesquisar InternalControl por codigo, titulo, descricao ou dominio..."
              />
            </section>
          )}

          {currentStep === 1 && (
            <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start gap-3">
                <Layers3 className="mt-1 h-5 w-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-black text-slate-950">2. Selecionar framework</h2>
                  <p className="mt-1 text-sm text-slate-500">Escolhe a framework externa onde o controlo interno deve ser mapeado.</p>
                </div>
              </div>
              <SearchPicker
                kind="framework"
                selected={selectedFramework}
                onSelect={setSelectedFramework}
                placeholder="Pesquisar ISO, NIST, QNRC, NIS2, DORA, CIS..."
              />
            </section>
          )}

          {currentStep === 2 && (
            <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start gap-3">
                <Network className="mt-1 h-5 w-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-black text-slate-950">3. Selecionar controlo externo</h2>
                  <p className="mt-1 text-sm text-slate-500">A pesquisa fica filtrada pela framework selecionada.</p>
                </div>
              </div>
              <SearchPicker
                kind="framework_control"
                selected={selectedFrameworkControl}
                onSelect={setSelectedFrameworkControl}
                placeholder="Pesquisar FrameworkControl por codigo, titulo ou descricao..."
                frameworkId={selectedFramework?.id}
                disabled={!selectedFramework}
              />
            </section>
          )}

          {currentStep === 3 && (
            <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start gap-3">
                <SlidersHorizontal className="mt-1 h-5 w-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-black text-slate-950">4. Definir relacao</h2>
                  <p className="mt-1 text-sm text-slate-500">Define o tipo de relacao, cobertura, confianca e rationale do mapeamento.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {relationshipTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setForm((value) => ({ ...value, relationship_type: type.value }))}
                    className={`rounded-2xl border p-4 text-left transition ${
                      form.relationship_type === type.value
                        ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100"
                        : "border-slate-100 bg-slate-50 hover:border-indigo-200"
                    }`}
                  >
                    <p className="font-black text-slate-900">{type.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{type.description}</p>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Coverage percentage</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.coverage_percentage}
                    onChange={(event) => setForm((value) => ({ ...value, coverage_percentage: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Confidence score</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.confidence_score}
                    onChange={(event) => setForm((value) => ({ ...value, confidence_score: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>

              <label className="mt-5 block space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Rationale</span>
                <textarea
                  value={form.rationale}
                  onChange={(event) => setForm((value) => ({ ...value, rationale: event.target.value }))}
                  rows={5}
                  placeholder="Explica porque este controlo interno cobre, suporta ou se sobrepoe ao controlo externo..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </section>
          )}

          {currentStep === 4 && (
            <section className="space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-start gap-3">
                  <FileSearch className="mt-1 h-5 w-5 text-indigo-600" />
                  <div>
                    <h2 className="text-lg font-black text-slate-950">5. Impacto e duplicados</h2>
                    <p className="mt-1 text-sm text-slate-500">Revista estrutural antes de criar o mapeamento.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <SummaryTile label="Score InternalControl" value={scoreValue(internalControlScore)} icon={ShieldCheck} />
                  <SummaryTile label="Score FrameworkControl" value={scoreValue(frameworkControlScore)} icon={Network} />
                  <SummaryTile label="Coverage Framework" value={coverageValue(frameworkScore)} icon={Layers3} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ImpactList title="Mecanismos suportados" items={mechanisms} empty="Sem mecanismos associados ao controlo interno." />
                <ImpactList title="Politicas afetadas" items={policies} empty="Sem politicas associadas." />
                <ImpactList title="Documentos afetados" items={documents} empty="Sem documentos associados." />
                <ImpactList title="Frameworks impactadas" items={impactedFrameworks} empty="Ainda sem frameworks impactadas." />
              </div>

              <ExistingMappingsPanel mappings={existingMappings} />

              {gaps.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Gaps relevantes
                  </div>
                  <div className="mt-3 space-y-2">
                    {gaps.map((gap, index) => (
                      <div key={`${gap.type || "gap"}-${index}`} className="rounded-xl border border-amber-100 bg-white p-3">
                        <p className="text-xs font-bold text-amber-900">{gap.type || gap.title || "Gap"}</p>
                        <p className="mt-1 text-xs text-amber-700">{gap.description || gap.recommendation || JSON.stringify(gap)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {currentStep === 5 && (
            <section className="space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-start gap-3">
                  <Link2 className="mt-1 h-5 w-5 text-indigo-600" />
                  <div>
                    <h2 className="text-lg font-black text-slate-950">6. Revisao final</h2>
                    <p className="mt-1 text-sm text-slate-500">Confirma o mapeamento antes de criar o registo draft.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryTile label="InternalControl" value={selectedInternalControl?.label || "-"} helper={selectedInternalControl?.description} icon={ShieldCheck} />
                  <SummaryTile label="Framework" value={selectedFramework?.label || "-"} helper={selectedFramework?.description} icon={Layers3} />
                  <SummaryTile label="FrameworkControl" value={selectedFrameworkControl?.label || "-"} helper={selectedFrameworkControl?.description} icon={Network} />
                  <SummaryTile
                    label="Relacao"
                    value={relationshipTypes.find((type) => type.value === form.relationship_type)?.label || form.relationship_type}
                    helper={`${form.coverage_percentage}% coverage | ${form.confidence_score}% confidence`}
                    icon={SlidersHorizontal}
                  />
                </div>

                <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rationale</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{form.rationale || "-"}</p>
                </div>

                {activeDuplicate && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-black">Criacao bloqueada por duplicado ativo.</p>
                    <p className="mt-1 text-xs">O par selecionado ja existe. Usa a Mapping Review para alterar o mapeamento existente.</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <SummaryTile label="Selecionado" value={selectedInternalControl ? "InternalControl OK" : "A selecionar"} helper={selectedInternalControl?.label || "Primeiro escolhe o controlo interno."} icon={ShieldCheck} />
          <SummaryTile label="Framework" value={selectedFramework ? "Framework OK" : "A selecionar"} helper={selectedFramework?.label || "Depois escolhe a framework."} icon={Layers3} />
          <SummaryTile label="Control externo" value={selectedFrameworkControl ? "Control OK" : "A selecionar"} helper={selectedFrameworkControl?.label || "Por fim escolhe o controlo externo."} icon={Network} />

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-sm font-black text-slate-900">Impacto estrutural</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-black text-slate-900">{mechanisms.length}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400">Mecanismos</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-black text-slate-900">{policies.length}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400">Politicas</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-black text-slate-900">{documents.length}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400">Documentos</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-black text-slate-900">{frameworkControls.length}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400">Controls</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={currentStep === 0 || saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {currentStep < steps.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving || !!activeDuplicate}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Criar mapeamento
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
