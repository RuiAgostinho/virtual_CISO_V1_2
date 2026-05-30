import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Database,
  ExternalLink,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { riskApi, type Asset, type AssetCategory, type PaginatedResponse } from "@/lib/riskApi";
import { AssetFormModal } from "@/components/ui/AssetFormModal";

type QuickFilter = "critical" | "vulnerable" | "high-exposure" | "review-due";

type MetricCardProps = {
  active?: boolean;
  detail?: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  tone: string;
  value: number;
};

const REVIEW_WINDOW_DAYS = 30;

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT");
}

function criticalityLabel(value?: string) {
  const labels: Record<string, string> = {
    Critical: "Crítica",
    High: "Alta",
    Medium: "Média",
    Low: "Baixa",
  };
  return labels[value || ""] || "Sem criticidade";
}

function sourceLabel(value?: string) {
  const labels: Record<string, string> = {
    discovery: "Discovery",
    manual: "Manual",
    wazuh: "Wazuh",
  };
  return labels[value || ""] || value || "Manual";
}

function ownerName(asset: Asset) {
  return asset.business_owner_name || asset.owner || (asset.business_owner ? String(asset.business_owner) : "");
}

function assetExposure(asset: Asset) {
  const score = Number(asset.latest_exposure_score ?? asset.exposure ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isCriticalOrHigh(asset: Asset) {
  return asset.criticality === "Critical" || asset.criticality === "High";
}

function hasOpenVulnerabilities(asset: Asset) {
  return Number(asset.vulnerabilities_count || 0) > 0;
}

function hasHighExposure(asset: Asset) {
  return assetExposure(asset) >= 4;
}

function isReviewDue(asset: Asset) {
  if (!asset.classification_review_due) return false;
  const due = new Date(asset.classification_review_due).getTime();
  if (!Number.isFinite(due)) return false;
  const reviewWindow = Date.now() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return due <= reviewWindow;
}

function toneForCriticality(value?: string) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function toneForExposure(value: number) {
  if (value >= 4) return "bg-red-50 text-red-700 ring-red-100";
  if (value >= 3) return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function reviewTone(asset: Asset) {
  if (!asset.classification_review_due) return "border-slate-200 bg-slate-50 text-slate-500";
  const due = new Date(asset.classification_review_due).getTime();
  if (!Number.isFinite(due)) return "border-slate-200 bg-slate-50 text-slate-500";
  if (due < Date.now()) return "border-red-200 bg-red-50 text-red-700";
  if (isReviewDue(asset)) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function isFinalizedInventoryAsset(asset: Asset) {
  return (
    asset.status === "Active" &&
    Boolean(asset.business_owner || asset.business_owner_name) &&
    Boolean(asset.asset_type || asset.type_name) &&
    asset.classification_status === "validated"
  );
}

function MetricCard({ active, detail, icon: Icon, label, onClick, tone, value }: MetricCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-xl p-2.5 ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        {onClick ? <ExternalLink className="h-4 w-4 text-slate-300" /> : null}
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      {detail ? <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p> : null}
    </>
  );

  const className = `rounded-2xl border bg-white p-5 shadow-sm transition-colors ${
    active ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
  }`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left hover:border-indigo-200 hover:bg-indigo-50/30`}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export default function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [criticality, setCriticality] = useState("");
  const [responsible, setResponsible] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listAssets({ page_size: 500, ordering: "name" });
      const loadedAssets = unwrap<Asset>(data);
      setAllAssets(loadedAssets);
      setPendingCount(loadedAssets.filter((asset) => !isFinalizedInventoryAsset(asset)).length);
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar o inventário."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    riskApi
      .listAssetCategories({ page_size: 100 })
      .then((data) => setCategories(unwrap<AssetCategory>(data)))
      .catch(() => setCategories([]));
  }, []);

  const assets = useMemo(() => allAssets.filter(isFinalizedInventoryAsset), [allAssets]);

  const sourceOptions = useMemo(() => {
    return Array.from(new Set(assets.map((asset) => asset.source).filter(Boolean) as string[])).sort((a, b) =>
      sourceLabel(a).localeCompare(sourceLabel(b), "pt-PT"),
    );
  }, [assets]);

  const responsibleOptions = useMemo(() => {
    return Array.from(new Set(assets.map(ownerName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-PT"));
  }, [assets]);

  const handleCategoryChange = (nextCategory: string) => {
    setCategory(nextCategory);
    const nextParams = new URLSearchParams(searchParams);
    if (nextCategory) {
      nextParams.set("category", nextCategory);
    } else {
      nextParams.delete("category");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const toggleQuickFilter = (filter: QuickFilter) => {
    setQuickFilter((current) => (current === filter ? null : filter));
  };

  const clearFilters = () => {
    setSearch("");
    setSource("");
    handleCategoryChange("");
    setCriticality("");
    setResponsible("");
    setQuickFilter(null);
  };

  const filteredAssets = useMemo(() => {
    const term = normalizeSearch(search);

    return assets.filter((asset) => {
      if (source && asset.source !== source) return false;
      if (category && String(asset.category) !== String(category)) return false;
      if (criticality && asset.criticality !== criticality) return false;
      if (responsible && ownerName(asset) !== responsible) return false;
      if (quickFilter === "critical" && !isCriticalOrHigh(asset)) return false;
      if (quickFilter === "vulnerable" && !hasOpenVulnerabilities(asset)) return false;
      if (quickFilter === "high-exposure" && !hasHighExposure(asset)) return false;
      if (quickFilter === "review-due" && !isReviewDue(asset)) return false;

      if (!term) return true;
      const fields = [
        asset.name,
        asset.description,
        asset.wazuh_ip,
        asset.category_name,
        asset.type_name,
        asset.business_process,
        asset.environment_name,
        asset.location_name,
        asset.org_unit_name,
        ownerName(asset),
        sourceLabel(asset.source),
      ];
      return fields.some((field) => normalizeSearch(field).includes(term));
    });
  }, [assets, category, criticality, quickFilter, responsible, search, source]);

  const metrics = useMemo(() => {
    return {
      critical: assets.filter(isCriticalOrHigh).length,
      highExposure: assets.filter(hasHighExposure).length,
      reviewDue: assets.filter(isReviewDue).length,
      vulnerable: assets.filter(hasOpenVulnerabilities).length,
    };
  }, [assets]);

  const hasActiveFilters = Boolean(search || source || category || criticality || responsible || quickFilter);

  return (
    <div className="mx-auto max-w-[1540px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestão de ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Inventário oficial de ativos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Só aparecem ativos finalizados: estado ativo, responsável de negócio, tipo de ativo e classificação validada.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Novo ativo
            </button>
            <button
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      {pendingCount > 0 ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-950">{pendingCount} ativos ainda bloqueados no onboarding</p>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-amber-800">
                Os ativos descobertos só entram neste inventário depois de terem responsável, tipo de ativo e classificação validada.
              </p>
            </div>
          </div>
          <Link
            to="/assets/onboarding"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-950"
          >
            Resolver pendentes
            <ExternalLink className="h-4 w-4" />
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={Database}
          label="Ativos oficiais"
          value={assets.length}
          tone="bg-indigo-50 text-indigo-700"
          detail={`${filteredAssets.length} visíveis com os filtros atuais`}
        />
        <MetricCard
          active={quickFilter === "critical"}
          icon={ShieldAlert}
          label="Críticos ou altos"
          onClick={() => toggleQuickFilter("critical")}
          tone="bg-red-50 text-red-700"
          value={metrics.critical}
        />
        <MetricCard
          active={quickFilter === "vulnerable"}
          icon={AlertTriangle}
          label="Vulnerabilidades abertas"
          onClick={() => toggleQuickFilter("vulnerable")}
          tone="bg-amber-50 text-amber-700"
          value={metrics.vulnerable}
        />
        <MetricCard
          active={quickFilter === "high-exposure"}
          icon={ShieldCheck}
          label="Exposição alta"
          onClick={() => toggleQuickFilter("high-exposure")}
          tone="bg-orange-50 text-orange-700"
          value={metrics.highExposure}
        />
        <MetricCard
          active={quickFilter === "review-due"}
          icon={CalendarClock}
          label="Revisão a vencer"
          onClick={() => toggleQuickFilter("review-due")}
          tone="bg-sky-50 text-sky-700"
          value={metrics.reviewDue}
          detail={`${REVIEW_WINDOW_DAYS} dias`}
        />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-slate-100 p-2 text-slate-600">
              <Filter className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Filtros</p>
              <p className="text-sm font-semibold text-slate-600">Pesquisar por identidade, responsabilidade, postura ou origem.</p>
            </div>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              <X className="h-4 w-4" />
              Limpar filtros
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.2fr)_160px_190px_170px_240px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome, IP, responsável, processo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todas as origens</option>
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {sourceLabel(option)}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) => handleCategoryChange(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todos os tipos</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={criticality}
            onChange={(event) => setCriticality(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Toda a criticidade</option>
            <option value="Critical">Crítica</option>
            <option value="High">Alta</option>
            <option value="Medium">Média</option>
            <option value="Low">Baixa</option>
          </select>
          <select
            value={responsible}
            onChange={(event) => setResponsible(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Todos os responsáveis</option>
            {responsibleOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Registo oficial</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Ativos finalizados</h2>
          </div>
          <p className="text-sm font-bold text-slate-500">
            {loading ? "A carregar..." : `${filteredAssets.length} de ${assets.length} ativos oficiais`}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-white text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Ativo</th>
                  <th className="px-5 py-3">Tipo e contexto</th>
                  <th className="px-5 py-3">Responsável</th>
                  <th className="px-5 py-3">Postura</th>
                  <th className="px-5 py-3">Exposição</th>
                  <th className="px-5 py-3 text-center">Vulns</th>
                  <th className="px-5 py-3 text-center">Controlos</th>
                  <th className="px-5 py-3">Revisão</th>
                  <th className="px-5 py-3 text-right">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((asset) => {
                  const exposure = assetExposure(asset);
                  return (
                    <tr key={asset.id} className="align-top hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <Link to={`/assets/inventory/${asset.id}`} className="font-bold text-slate-950 hover:text-indigo-700">
                          {asset.name}
                        </Link>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {sourceLabel(asset.source)}
                          </span>
                          {asset.wazuh_ip ? (
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wide text-slate-500">
                              {asset.wazuh_ip}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{asset.type_name || asset.category_name || "Sem tipo"}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {asset.business_process || asset.environment_name || asset.location_name || "Sem contexto operacional"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2">
                          <UserRoundCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                          <div>
                            <p className="font-semibold text-slate-800">{ownerName(asset)}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{asset.org_unit_name || "Unidade não definida"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${toneForCriticality(asset.criticality)}`}>
                          {criticalityLabel(asset.criticality)}
                        </span>
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Classificada
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex min-w-12 justify-center rounded-xl px-3 py-2 text-sm font-bold ring-1 ${toneForExposure(exposure)}`}>
                          {formatScore(exposure)}
                        </span>
                        <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(asset.latest_exposure_at || asset.last_sync_at)}</p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex min-w-10 justify-center rounded-xl px-3 py-2 font-bold ${hasOpenVulnerabilities(asset) ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
                          {asset.vulnerabilities_count || 0}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex min-w-10 justify-center rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">
                          {asset.controls_count || 0}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${reviewTone(asset)}`}>
                          {formatDate(asset.classification_review_due)}
                        </span>
                        <p className="mt-2 text-xs font-semibold text-slate-500">Sync: {formatDate(asset.last_sync_at)}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          to={`/assets/inventory/${asset.id}`}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 p-2 text-slate-500 hover:border-indigo-200 hover:text-indigo-700"
                          aria-label={`Abrir detalhe de ${asset.name}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-base font-bold text-slate-950">Sem ativos finalizados para os filtros atuais</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-relaxed text-slate-500">
              Os ativos descobertos ficam no onboarding até terem responsável, tipo de ativo e classificação validada.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                >
                  <X className="h-4 w-4" />
                  Limpar filtros
                </button>
              ) : null}
              <Link
                to="/assets/onboarding"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700"
              >
                Abrir onboarding
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </section>

      <AssetFormModal open={formOpen} mode="create" onClose={() => setFormOpen(false)} onSaved={() => void load()} />
    </div>
  );
}
