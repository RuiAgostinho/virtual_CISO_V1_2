/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Database,
  FileCheck,
  FileSearch,
  GitBranch,
  Layers,
  Loader2,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  Wrench,
} from "lucide-react";
import {
  governanceApi,
  type GovernanceRiskCalculationMode,
  type ResidualRiskImpact,
} from "@/lib/governanceApi";
import {
  mappingReviewApi,
  type SearchOption,
  type TraceabilityOptions,
  type TraceabilityPayload,
} from "@/lib/mappingReviewApi";

type ExplorerEntityType =
  | "framework"
  | "framework_control"
  | "internal_control"
  | "mechanism"
  | "evidence_item"
  | "policy"
  | "governance_document"
  | "asset"
  | "risk";

type AnyRecord = Record<string, any>;

const entityTypes: Array<{
  value: ExplorerEntityType;
  label: string;
  icon: typeof GitBranch;
  traceability: "governance" | "residual";
}> = [
  { value: "framework", label: "Framework", icon: BookOpen, traceability: "governance" },
  { value: "framework_control", label: "Controlo externo", icon: Layers, traceability: "governance" },
  { value: "internal_control", label: "Controlo interno", icon: ShieldCheck, traceability: "governance" },
  { value: "mechanism", label: "Mecanismo", icon: Wrench, traceability: "governance" },
  { value: "evidence_item", label: "Evidência", icon: FileCheck, traceability: "governance" },
  { value: "policy", label: "Política", icon: FileSearch, traceability: "governance" },
  { value: "governance_document", label: "Documento", icon: Database, traceability: "governance" },
  { value: "asset", label: "Ativo", icon: Target, traceability: "residual" },
  { value: "risk", label: "Risco", icon: ShieldAlert, traceability: "residual" },
];

function isExplorerEntityType(value: string): value is ExplorerEntityType {
  return entityTypes.some((item) => item.value === value);
}

function asArray<T = AnyRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function scoreValue(score: AnyRecord | undefined) {
  const value = score?.score ?? score?.coverage;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${Math.round(parsed)}%`;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayLabel(item: AnyRecord | null | undefined) {
  if (!item) return "-";
  return [
    item.code || item.framework_code || item.source_type || item.target_type,
    item.title || item.name || item.label,
  ].filter(Boolean).join(" - ") || item.id || "-";
}

function statusTone(status?: string) {
  if (status === "implemented" || status === "implemented_evidenced" || status === "approved") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }
  if (status === "partial" || status === "partially_implemented" || status === "pending_review") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }
  if (status === "missing" || status === "not_implemented" || status === "rejected") {
    return "border-red-100 bg-red-50 text-red-700";
  }
  return "border-slate-100 bg-slate-50 text-slate-600";
}

async function searchByType(type: ExplorerEntityType, query: string) {
  if (type === "framework") return mappingReviewApi.searchFrameworks(query);
  if (type === "framework_control") return mappingReviewApi.searchFrameworkControls(query);
  if (type === "internal_control") return mappingReviewApi.searchInternalControls(query, { include_migrated: true });
  if (type === "mechanism") return mappingReviewApi.searchMechanisms(query);
  if (type === "evidence_item") return mappingReviewApi.searchEvidenceItems(query);
  if (type === "policy") return mappingReviewApi.searchPolicies(query);
  if (type === "governance_document") return mappingReviewApi.searchGovernanceDocuments(query);
  if (type === "asset") return mappingReviewApi.searchAssets(query);
  return mappingReviewApi.searchRisks(query);
}

function relationshipGroups(payload: TraceabilityPayload | null) {
  const relationships = payload?.relationships || {};
  return [
    { key: "policies", title: "Políticas", type: "policy", items: asArray(relationships.policies) },
    { key: "governance_documents", title: "Documentos", type: "governance_document", items: asArray(relationships.governance_documents) },
    { key: "internal_controls", title: "Controlos internos", type: "internal_control", items: asArray(relationships.internal_controls) },
    { key: "mechanisms", title: "Mecanismos", type: "mechanism", items: asArray(relationships.mechanisms) },
    { key: "framework_controls", title: "Controlos externos", type: "framework_control", items: asArray(relationships.framework_controls) },
    { key: "frameworks", title: "Frameworks", type: "framework", items: asArray(relationships.frameworks) },
  ];
}

function getTraceabilityChains(payload: TraceabilityPayload | null) {
  const active = payload?.active_mappings || {};
  const evidence = payload?.evidence || {};
  const frameworkMappings = asArray(active.framework_mappings);
  const mechanismLinks = asArray(active.internal_control_mechanisms);
  const evidenceLinks = asArray(evidence.links);

  return frameworkMappings.map((mapping) => {
    const internalControl = mapping.internal_control;
    const externalControl = mapping.framework_control;
    const internalControlId = String(internalControl?.id || "");
    const mechanisms = mechanismLinks
      .filter((link) => String(link.internal_control?.id || "") === internalControlId)
      .map((link) => ({ ...link.mechanism, implementation_status: link.implementation_status, mandatory: link.mandatory }));
    const mechanismIds = new Set(mechanisms.map((item) => String(item.id)));
    const chainEvidence = evidenceLinks
      .filter((link) => {
        const targetId = String(link.target_id || "");
        return targetId === internalControlId || mechanismIds.has(targetId);
      })
      .map((link) => link.evidence_item);

    return {
      id: mapping.id,
      externalControl,
      internalControl,
      mechanisms,
      evidence: chainEvidence,
      coverage: mapping.coverage_percentage,
      relationshipType: mapping.relationship_type,
      validationStatus: mapping.validation_status,
    };
  });
}

export default function TraceabilityExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entityType, setEntityType] = useState<ExplorerEntityType>("framework");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [selected, setSelected] = useState<SearchOption | null>(null);
  const [mode, setMode] = useState<TraceabilityOptions["mode"]>("official");
  const [traceability, setTraceability] = useState<TraceabilityPayload | null>(null);
  const [residualRisk, setResidualRisk] = useState<ResidualRiskImpact | AnyRecord | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [chainPage, setChainPage] = useState(1);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entityMeta = entityTypes.find((item) => item.value === entityType) || entityTypes[0];
  const isResidualTarget = entityMeta.traceability === "residual";
  const selectedId = selected?.id;

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const results = await searchByType(entityType, search.trim());
      setOptions(results);
    } catch (err) {
      console.error(err);
      setOptions([]);
    } finally {
      setLoadingOptions(false);
    }
  }, [entityType, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOptions(), 250);
    return () => window.clearTimeout(timeout);
  }, [loadOptions]);

  useEffect(() => {
    const queryType = searchParams.get("type") as ExplorerEntityType | null;
    const queryId = searchParams.get("id");
    if (!queryType || !queryId || !entityTypes.some((item) => item.value === queryType)) return;
    if (entityType !== queryType) setEntityType(queryType);
    setSelected((current) => (
      current?.id === queryId
        ? current
        : { id: queryId, label: queryId, raw: { id: queryId } }
    ));
  }, [entityType, searchParams]);

  const selectEntity = useCallback((option: SearchOption) => {
    setSelected(option);
    setTraceability(null);
    setResidualRisk(null);
    setExpandedSections({});
    setChainPage(1);
    setSearchParams({ type: entityType, id: option.id });
  }, [entityType, setSearchParams]);

  const changeEntityType = (nextType: ExplorerEntityType) => {
    setEntityType(nextType);
    setSelected(null);
    setTraceability(null);
    setResidualRisk(null);
    setOptions([]);
    setExpandedSections({});
    setChainPage(1);
    setSearchParams({});
  };

  const reroot = useCallback((type: string, item: AnyRecord | null | undefined) => {
    const id = String(item?.id || "");
    if (!id || !isExplorerEntityType(type)) return;
    const label = displayLabel(item);
    setEntityType(type);
    setSelected({ id, label, raw: item });
    setSearch(label === id ? "" : label);
    setTraceability(null);
    setResidualRisk(null);
    setExpandedSections({});
    setChainPage(1);
    setSearchParams({ type, id });
  }, [setSearchParams]);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedSections((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const loadTraceability = useCallback(async () => {
    if (!selectedId) return;
    setLoadingTrace(true);
    setError(null);
    setTraceability(null);
    setResidualRisk(null);
    try {
      if (isResidualTarget) {
        const residualMode = (mode || "official") as GovernanceRiskCalculationMode;
        const payload = entityType === "asset"
          ? await governanceApi.getResidualRiskForAsset(selectedId, residualMode, true)
          : await governanceApi.getResidualRiskForRisk(selectedId, residualMode, true);
        setResidualRisk(payload);
      } else {
        const payload = await mappingReviewApi.getTraceability(entityType, selectedId, {
          mode,
          include_inactive: true,
          include_evidence: true,
          include_gaps: true,
          include_scores: true,
          max_depth: 3,
        });
        setTraceability(payload);
        const rootObject = payload.root?.object;
        const rootLabel = displayLabel(rootObject);
        if (rootObject && rootLabel !== "-") {
          setSelected((current) => (
            current?.id === selectedId
              ? { ...current, label: rootLabel, raw: rootObject }
              : current
          ));
        }
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Não foi possível carregar a rastreabilidade.");
    } finally {
      setLoadingTrace(false);
    }
  }, [entityType, isResidualTarget, mode, selectedId]);

  useEffect(() => {
    void loadTraceability();
  }, [loadTraceability]);

  useEffect(() => {
    setChainPage(1);
  }, [entityType, mode, selectedId]);

  const chains = useMemo(() => getTraceabilityChains(traceability), [traceability]);
  const groups = useMemo(() => relationshipGroups(traceability), [traceability]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-20">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <GitBranch className="h-3.5 w-3.5" />
              Rastreabilidade transversal
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Explorador de rastreabilidade</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              Percorre a cadeia ativo, risco, controlo, mecanismo, evidência e framework com o modo oficial ou simulado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTraceability()}
            disabled={!selected || loadingTrace}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loadingTrace ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[240px_220px_1fr]">
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Entidade</span>
            <select
              value={entityType}
              onChange={(event) => changeEntityType(event.target.value as ExplorerEntityType)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            >
              {entityTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Modo</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as TraceabilityOptions["mode"])}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
            >
              <option value="official">Oficial</option>
              <option value="simulation">Simulação</option>
              <option value="exploratory">Exploratório</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pesquisa</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Pesquisar ${entityMeta.label.toLowerCase()}...`}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
          </label>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {loadingOptions ? (
            <div className="col-span-full flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              A procurar entidades...
            </div>
          ) : options.length === 0 ? (
            <div className="col-span-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
              Sem resultados para a pesquisa atual.
            </div>
          ) : options.slice(0, 12).map((option) => {
            const active = selected?.id === option.id;
            const Icon = entityMeta.icon;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectEntity(option)}
                className={`flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-500/10"
                    : "border-slate-100 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50"
                }`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-bold">{option.label}</span>
                  <span className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{option.meta || option.description || option.id}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {loadingTrace ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-400 shadow-sm">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-600" />
          <span className="text-xs font-bold uppercase tracking-wide">A carregar rastreabilidade...</span>
        </div>
      ) : selected && isResidualTarget ? (
        <ResidualRiskPanel
          payload={residualRisk}
          entityType={entityType}
          selected={selected}
          expandedSections={expandedSections}
          onToggleExpanded={toggleExpanded}
          onReroot={reroot}
        />
      ) : selected && traceability ? (
        <>
          <TraceabilityKpis payload={traceability} />
          <ChainPanel
            chains={chains}
            page={chainPage}
            onPageChange={setChainPage}
            expandedSections={expandedSections}
            onToggleExpanded={toggleExpanded}
            onReroot={reroot}
          />
          <RelationshipsPanel
            groups={groups}
            expandedSections={expandedSections}
            onToggleExpanded={toggleExpanded}
            onReroot={reroot}
          />
          <EvidenceAndGapsPanel
            payload={traceability}
            expandedSections={expandedSections}
            onToggleExpanded={toggleExpanded}
            onReroot={reroot}
          />
        </>
      ) : (
        <section className="rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <Network className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-bold text-slate-950">Seleciona uma entidade para ver a cadeia de impacto</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
            A vista consolida controlos internos, mecanismos, evidências, frameworks e impacto em risco residual quando aplicável.
          </p>
        </section>
      )}
    </div>
  );
}

function TraceabilityKpis({ payload }: { payload: TraceabilityPayload }) {
  const relationships = payload.relationships || {};
  const official = payload.scores?.official as AnyRecord | undefined;
  const simulation = payload.scores?.simulation as AnyRecord | undefined;
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <Kpi icon={GitBranch} label="Raiz" value={payload.root?.type || "-"} />
      <Kpi icon={ShieldCheck} label="Score oficial" value={scoreValue(official)} tone="text-emerald-600" />
      <Kpi icon={Activity} label="Score simulação" value={scoreValue(simulation)} tone="text-indigo-700" />
      <Kpi icon={Layers} label="Controlos internos" value={asArray(relationships.internal_controls).length} />
      <Kpi icon={Wrench} label="Mecanismos" value={asArray(relationships.mechanisms).length} tone="text-amber-600" />
      <Kpi icon={FileCheck} label="Evidências" value={asArray(payload.evidence?.items).length} tone="text-sky-600" />
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "text-slate-900",
}: {
  icon: typeof GitBranch;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 truncate text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function ChainPanel({
  chains,
  page,
  onPageChange,
  expandedSections,
  onToggleExpanded,
  onReroot,
}: {
  chains: ReturnType<typeof getTraceabilityChains>;
  page: number;
  onPageChange: (page: number) => void;
  expandedSections: Record<string, boolean>;
  onToggleExpanded: (key: string) => void;
  onReroot: (type: string, item: AnyRecord | null | undefined) => void;
}) {
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(chains.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleChains = chains.slice(pageStart, pageStart + pageSize);

  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cadeia L4</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Controlo externo para controlo interno para mecanismo para evidência</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {chains.length} cadeia(s)
        </span>
      </div>
      {chains.length === 0 ? (
        <div className="p-8 text-sm font-semibold text-slate-500">
          Sem mapeamentos de framework aprovados para desenhar a cadeia.
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {visibleChains.map((chain) => {
              const key = String(chain.id || `${chain.externalControl?.id}-${chain.internalControl?.id}`);
              return (
                <article key={key} className="p-5">
                  <div className="grid gap-3 xl:grid-cols-[1.2fr_40px_1.2fr_40px_1fr_40px_1fr] xl:items-stretch">
                    <ChainNode title="Controlo externo" type="framework_control" item={chain.externalControl} badge={chain.relationshipType} onReroot={onReroot} />
                    <FlowArrow />
                    <ChainNode title="Controlo interno" type="internal_control" item={chain.internalControl} badge={`${numberValue(chain.coverage)}% cobertura`} onReroot={onReroot} />
                    <FlowArrow />
                    <ChainCollection
                      title="Mecanismos"
                      type="mechanism"
                      items={chain.mechanisms}
                      sectionKey={`${key}-mechanisms`}
                      expanded={Boolean(expandedSections[`${key}-mechanisms`])}
                      onToggleExpanded={onToggleExpanded}
                      onReroot={onReroot}
                    />
                    <FlowArrow />
                    <ChainCollection
                      title="Evidências"
                      type="evidence_item"
                      items={chain.evidence}
                      sectionKey={`${key}-evidence`}
                      expanded={Boolean(expandedSections[`${key}-evidence`])}
                      onToggleExpanded={onToggleExpanded}
                      onReroot={onReroot}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          <ExplorerPagination
            page={currentPage}
            totalItems={chains.length}
            pageSize={pageSize}
            currentCount={visibleChains.length}
            onPageChange={onPageChange}
          />
        </>
      )}
    </section>
  );
}

function FlowArrow() {
  return (
    <div className="hidden items-center justify-center xl:flex">
      <ArrowRight className="h-5 w-5 text-slate-300" />
    </div>
  );
}

function ChainNode({
  title,
  type,
  item,
  badge,
  onReroot,
}: {
  title: string;
  type: string;
  item: AnyRecord;
  badge?: string;
  onReroot: (type: string, item: AnyRecord | null | undefined) => void;
}) {
  const canReroot = Boolean(item?.id && isExplorerEntityType(type));
  const content = (
    <div className="min-h-28 rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</span>
        {badge && (
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm font-bold leading-snug text-slate-950">{displayLabel(item)}</p>
    </div>
  );
  return canReroot ? (
    <button type="button" onClick={() => onReroot(type, item)} className="block w-full text-left transition hover:scale-[1.01]">
      {content}
    </button>
  ) : content;
}

function ChainCollection({
  title,
  type,
  items,
  sectionKey,
  expanded,
  onToggleExpanded,
  onReroot,
}: {
  title: string;
  type: string;
  items: AnyRecord[];
  sectionKey: string;
  expanded: boolean;
  onToggleExpanded: (key: string) => void;
  onReroot: (type: string, item: AnyRecord | null | undefined) => void;
}) {
  const visibleItems = expanded ? items : items.slice(0, 4);

  return (
    <div className="min-h-28 rounded-xl border border-slate-100 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-slate-400">Sem registos ligados.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {visibleItems.map((item) => {
            const canReroot = Boolean(item?.id && isExplorerEntityType(type));
            const pill = (
              <span className={`inline-flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${statusTone(item.implementation_status || item.status)}`}>
                <span className="line-clamp-2">{displayLabel(item)}</span>
                {item.implementation_status && <span className="shrink-0 text-[9px] uppercase">{item.implementation_status}</span>}
              </span>
            );
            return canReroot ? (
              <button key={item.id || displayLabel(item)} type="button" onClick={() => onReroot(type, item)} className="w-full text-left hover:text-indigo-700">
                {pill}
              </button>
            ) : (
              <span key={item.id || displayLabel(item)}>{pill}</span>
            );
          })}
          {items.length > 4 && (
            <ExpandButton expanded={expanded} hiddenCount={items.length - 4} onClick={() => onToggleExpanded(sectionKey)} />
          )}
        </div>
      )}
    </div>
  );
}

function RelationshipsPanel({
  groups,
  expandedSections,
  onToggleExpanded,
  onReroot,
}: {
  groups: Array<{ key: string; title: string; type: string; items: AnyRecord[] }>;
  expandedSections: Record<string, boolean>;
  onToggleExpanded: (key: string) => void;
  onReroot: (type: string, item: AnyRecord | null | undefined) => void;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const expanded = Boolean(expandedSections[group.key]);
        const visibleItems = expanded ? group.items : group.items.slice(0, 6);
        return (
          <div key={group.key} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">{group.title}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{group.items.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {group.items.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">Sem relações.</p>
              ) : visibleItems.map((item) => {
                const canReroot = Boolean(item?.id && isExplorerEntityType(group.type));
                const row = (
                  <span className="block rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700">
                    {displayLabel(item)}
                  </span>
                );
                return canReroot ? (
                  <button key={item.id || displayLabel(item)} type="button" onClick={() => onReroot(group.type, item)} className="block w-full text-left">
                    {row}
                  </button>
                ) : (
                  <span key={item.id || displayLabel(item)}>{row}</span>
                );
              })}
              {group.items.length > 6 && (
                <ExpandButton expanded={expanded} hiddenCount={group.items.length - 6} onClick={() => onToggleExpanded(group.key)} />
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function EvidenceAndGapsPanel({
  payload,
  expandedSections,
  onToggleExpanded,
  onReroot,
}: {
  payload: TraceabilityPayload;
  expandedSections: Record<string, boolean>;
  onToggleExpanded: (key: string) => void;
  onReroot: (type: string, item: AnyRecord | null | undefined) => void;
}) {
  const evidence = asArray(payload.evidence?.items);
  const gaps = asArray(payload.gaps);
  const evidenceExpanded = Boolean(expandedSections.evidence);
  const gapsExpanded = Boolean(expandedSections.gaps);
  const visibleEvidence = evidenceExpanded ? evidence : evidence.slice(0, 8);
  const visibleGaps = gapsExpanded ? gaps : gaps.slice(0, 8);

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">Evidências reutilizáveis</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{evidence.length}</span>
        </div>
        <div className="mt-4 space-y-2">
          {evidence.length === 0 ? (
            <p className="text-sm font-semibold text-slate-400">Sem evidências ligadas.</p>
          ) : visibleEvidence.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onReroot("evidence_item", item)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
            >
              <span>{displayLabel(item)}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(item.status)}`}>{item.status || "-"}</span>
            </button>
          ))}
          {evidence.length > 8 && (
            <ExpandButton expanded={evidenceExpanded} hiddenCount={evidence.length - 8} onClick={() => onToggleExpanded("evidence")} />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">Gaps e lacunas</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{gaps.length}</span>
        </div>
        <div className="mt-4 space-y-2">
          {gaps.length === 0 ? (
            <p className="text-sm font-semibold text-slate-400">Sem gaps para o modo atual.</p>
          ) : visibleGaps.map((gap, index) => (
            <div key={`${gap.type || "gap"}-${gap.target_id || index}`} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              <div className="text-[10px] font-bold uppercase tracking-wide text-red-500">{gap.type || "gap"} - {gap.severity || "sem severidade"}</div>
              <p className="mt-1">{gap.message || gap.recommendation || "Gap sem descrição."}</p>
            </div>
          ))}
          {gaps.length > 8 && (
            <ExpandButton expanded={gapsExpanded} hiddenCount={gaps.length - 8} onClick={() => onToggleExpanded("gaps")} />
          )}
        </div>
      </div>
    </section>
  );
}

function ExpandButton({ expanded, hiddenCount, onClick }: { expanded: boolean; hiddenCount: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-[10px] font-bold uppercase tracking-wide text-indigo-600 hover:text-indigo-800"
    >
      {expanded ? "Ver menos" : `Ver mais ${hiddenCount}`}
    </button>
  );
}

function ExplorerPagination({
  page,
  totalItems,
  pageSize,
  currentCount,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  currentCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = totalItems === 0 ? 0 : Math.min(totalItems, firstItem + currentCount - 1);

  if (totalItems <= pageSize) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
      <span>
        A mostrar {firstItem}-{lastItem} de {totalItems} cadeia(s).
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="px-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Seguinte
        </button>
      </div>
    </div>
  );
}

function ResidualRiskPanel({
  payload,
  entityType,
  selected,
  expandedSections,
  onToggleExpanded,
  onReroot,
}: {
  payload: ResidualRiskImpact | AnyRecord | null;
  entityType: ExplorerEntityType;
  selected: SearchOption;
  expandedSections: Record<string, boolean>;
  onToggleExpanded: (key: string) => void;
  onReroot: (type: string, item: AnyRecord | null | undefined) => void;
}) {
  if (!payload) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-8 text-sm font-semibold text-slate-500 shadow-sm">
        Sem impacto de risco residual carregado.
      </section>
    );
  }

  const data = payload as AnyRecord;
  const riskResults = asArray(data.risk_results);
  const links = asArray(data.links_used).concat(asArray(data.direct_links));
  const aggregate = data.aggregate || {};
  const risksExpanded = Boolean(expandedSections.residualRisks);
  const visibleRiskResults = risksExpanded ? riskResults : riskResults.slice(0, 9);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Target} label={entityType === "asset" ? "Ativo" : "Risco"} value={selected.label} />
        <Kpi icon={ShieldAlert} label="Score base" value={data.base_score ?? aggregate.base_score_average ?? "-"} tone="text-red-600" />
        <Kpi icon={ShieldCheck} label="Score residual" value={data.adjusted_residual_score ?? aggregate.adjusted_residual_score_average ?? "-"} tone="text-emerald-600" />
        <Kpi icon={Activity} label="Redução governance" value={`${numberValue(data.governance_reduction_percentage).toFixed(0)}%`} tone="text-indigo-700" />
        <Kpi icon={GitBranch} label="Links usados" value={links.length} />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Risco residual</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Fontes de governance que reduzem risco</h2>
        </div>
        {links.length === 0 ? (
          <div className="p-8 text-sm font-semibold text-slate-500">Sem links de governance para este alvo.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {links.map((link, index) => (
              <div key={link.id || index} className="grid gap-3 p-5 lg:grid-cols-[1fr_180px_1fr] lg:items-center">
                <ChainNode title="Fonte governance" type={link.source_type} item={{ id: link.source_id, label: link.source?.label || link.source_label || link.source_type }} badge={link.validation_status} onReroot={onReroot} />
                <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  <ArrowRight className="h-4 w-4" />
                  {link.relationship_type || "mitiga"}
                </div>
                <ChainNode title="Alvo de risco" type={link.target_type} item={{ id: link.target_id, label: link.target?.label || link.target_label || link.target_type }} badge={`${numberValue(link.effective_reduction_percentage).toFixed(0)}% redução`} onReroot={onReroot} />
              </div>
            ))}
          </div>
        )}
      </section>

      {riskResults.length > 0 && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">Riscos associados</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{riskResults.length}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleRiskResults.map((risk) => (
              <button
                key={risk.risk?.id || risk.id}
                type="button"
                onClick={() => onReroot("risk", risk.risk || risk)}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-left hover:border-indigo-200 hover:text-indigo-700"
              >
                <p className="text-sm font-bold text-slate-950">{risk.risk?.label || risk.title || "Risco"}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500">Residual: {risk.adjusted_residual_score ?? "-"} | Base: {risk.base_score ?? "-"}</p>
              </button>
            ))}
          </div>
          {riskResults.length > 9 && (
            <div className="mt-4">
              <ExpandButton expanded={risksExpanded} hiddenCount={riskResults.length - 9} onClick={() => onToggleExpanded("residualRisks")} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
