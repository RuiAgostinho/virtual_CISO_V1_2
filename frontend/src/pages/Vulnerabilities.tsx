import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Shield,
  Target,
  Zap,
} from "lucide-react";
import {
  riskApi,
  type PaginatedResponse,
  type Vulnerability,
  type VulnerabilityIntelQuality,
} from "@/lib/riskApi";

type IntelFilter =
  | "all"
  | "missing_enrichment"
  | "without_any_enrichment"
  | "missing_cvss"
  | "missing_epss"
  | "missing_nvd"
  | "missing_kev_check"
  | "missing_mitigation"
  | "kev";

type SyncKind = "epss" | "nvd";

type AffectedAsset = {
  occurrence_id?: string;
  asset_id?: string;
  asset_name?: string;
  asset_status?: string;
  asset_source?: string;
  asset_ip?: string;
  status?: string;
  software_name?: string;
  software_version?: string;
};

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function affectedAssets(vulnerability: Vulnerability) {
  return (vulnerability.affected_assets || []) as AffectedAsset[];
}

function percent(part = 0, total = 0) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function qualityParams(filter: IntelFilter) {
  return filter === "all" ? undefined : { [filter]: true };
}

function getSeverityStyle(severity: string) {
  switch (severity) {
    case "Critical":
      return "bg-red-100 text-red-700 border-red-200";
    case "High":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "Medium":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function QualityBadge({ label, ok, emphatic = false }: { label: string; ok: boolean; emphatic?: boolean }) {
  const color = ok
    ? emphatic
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}

const filterOptions: Array<{ value: IntelFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "missing_enrichment", label: "Com falhas de enrichment" },
  { value: "without_any_enrichment", label: "Sem enrichment" },
  { value: "missing_cvss", label: "Sem CVSS" },
  { value: "missing_epss", label: "Sem EPSS" },
  { value: "missing_nvd", label: "Sem NVD" },
  { value: "missing_kev_check", label: "Sem check KEV" },
  { value: "missing_mitigation", label: "Sem mitigação" },
  { value: "kev", label: "CISA KEV" },
];

function filterFromQuery(value: string | null): IntelFilter {
  return filterOptions.some((option) => option.value === value) ? (value as IntelFilter) : "all";
}

export default function Vulnerabilities() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vulns, setVulns] = useState<Vulnerability[]>([]);
  const [quality, setQuality] = useState<VulnerabilityIntelQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<IntelFilter>(() => filterFromQuery(searchParams.get("filter")));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<SyncKind | null>(null);

  const loadVulns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vulnerabilityData, qualityData] = await Promise.all([
        riskApi.listVulnerabilities(qualityParams(filter)),
        riskApi.getVulnerabilityIntelQuality(),
      ]);
      setVulns(unwrap<Vulnerability>(vulnerabilityData));
      setQuality(qualityData);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar vulnerabilidades."));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadVulns();
  }, [loadVulns]);

  useEffect(() => {
    setFilter(filterFromQuery(searchParams.get("filter")));
  }, [searchParams]);

  const runSync = async (kind: SyncKind) => {
    setSyncing(kind);
    setNotice(null);
    setError(null);
    try {
      const result =
        kind === "epss"
          ? await riskApi.refreshVulnerabilityIntel()
          : await riskApi.refreshNvdIntel();
      setNotice(result.detail || result.message || "Sincronização iniciada.");
      await loadVulns();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao iniciar sincronização."));
    } finally {
      setSyncing(null);
    }
  };

  const filteredVulns = useMemo(() => {
    if (!search) return vulns;
    const lower = search.toLowerCase();
    return vulns.filter(
      (v) =>
        v.cve_id?.toLowerCase().includes(lower) ||
        v.description?.toLowerCase().includes(lower) ||
        v.mitigation?.toLowerCase().includes(lower),
    );
  }, [search, vulns]);

  const metrics = useMemo(
    () => ({
      total: quality?.total ?? vulns.length,
      critical: vulns.filter((v) => v.severity === "Critical").length,
      high: vulns.filter((v) => v.severity === "High").length,
    }),
    [quality?.total, vulns],
  );

  const syncStatuses = quality?.sync_statuses || {};

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">UC4: Gestão de Vulnerabilidades</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Dicionário de CVEs</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Catálogo centralizado de vulnerabilidades detetadas, enriquecido com CVSS/NVD, EPSS, CISA KEV e mitigação.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void loadVulns()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={() => void runSync("epss")}
              disabled={Boolean(syncing)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
            >
              <DatabaseZap className="h-4 w-4" />
              {syncing === "epss" ? "A iniciar..." : "Sync EPSS"}
            </button>
            <button
              onClick={() => void runSync("nvd")}
              disabled={Boolean(syncing)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 transition-colors hover:text-indigo-700 disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              {syncing === "nvd" ? "A iniciar..." : "Sync NVD"}
            </button>
            <Link
              to="/admin/integrations/kev"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-red-700 transition-colors hover:bg-red-100"
            >
              <AlertTriangle className="h-4 w-4" />
              CISA KEV
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Shield className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total CVEs</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.critical}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Críticas na lista</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Zap className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.high}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Altas na lista</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{percent(quality?.cvss_present, quality?.total)}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">CVSS presente</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <DatabaseZap className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{percent(quality?.epss_present, quality?.total)}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">EPSS presente</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{quality?.kev_present ?? 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">CISA KEV</p>
        </div>
      </section>

      {quality && quality.missing_enrichment > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800 shadow-sm">
          <p className="font-bold">Há vulnerabilidades com enrichment incompleto.</p>
          <p className="mt-2">
            Sem CVSS: {quality.missing_cvss} · Sem EPSS: {quality.missing_epss} · Sem NVD: {quality.missing_nvd} · Sem check KEV:{" "}
            {quality.missing_kev_check} · Sem mitigação: {quality.missing_mitigation}
          </p>
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-700 shadow-sm">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Qualidade dos dados</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <QualityMetric label="CVSS" value={quality?.cvss_present ?? 0} total={quality?.total ?? 0} />
            <QualityMetric label="EPSS" value={quality?.epss_present ?? 0} total={quality?.total ?? 0} />
            <QualityMetric label="NVD" value={quality?.nvd_present ?? 0} total={quality?.total ?? 0} />
            <QualityMetric label="Mitigação" value={quality?.mitigation_present ?? 0} total={quality?.total ?? 0} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Últimas sincronizações</p>
          <div className="mt-4 space-y-3 text-xs font-semibold text-slate-600">
            {["epss", "nist", "kev"].map((provider) => {
              const status = syncStatuses[`${provider}:vulnerability_intel`];
              return (
                <div key={provider} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-bold uppercase text-slate-900">{provider}</span>
                  <span className="text-right">
                    {String(status?.status || "PENDING")} · {formatDate(status?.last_run_at as string | undefined)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-4 xl:flex-row">
          <div className="relative w-full xl:max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por CVE ID, descrição ou mitigação..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-medium outline-none transition-all focus:border-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Filter className="h-4 w-4" />
              Filtro
            </div>
            <select
              value={filter}
              onChange={(event) => {
                const nextFilter = event.target.value as IntelFilter;
                setFilter(nextFilter);
                const nextParams = new URLSearchParams(searchParams);
                if (nextFilter === "all") nextParams.delete("filter");
                else nextParams.set("filter", nextFilter);
                setSearchParams(nextParams, { replace: true });
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar vulnerabilidades...</div>
        ) : filteredVulns.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhuma vulnerabilidade encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">CVE ID</th>
                  <th className="px-6 py-4">Gravidade / CVSS</th>
                  <th className="w-1/3 px-6 py-4">Descrição</th>
                  <th className="px-6 py-4">Qualidade / Intelligence</th>
                  <th className="px-6 py-4 text-right">Ativos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVulns.map((vulnerability) => {
                  const assets = affectedAssets(vulnerability);
                  return (
                    <tr key={vulnerability.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <a
                          href={`https://nvd.nist.gov/vuln/detail/${vulnerability.cve_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 font-bold text-slate-950 underline decoration-indigo-200 underline-offset-4 transition-colors hover:text-indigo-700"
                        >
                          {vulnerability.cve_id}
                          <ExternalLink className="h-3 w-3 text-slate-300" />
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase ${getSeverityStyle(vulnerability.severity)}`}>
                            {vulnerability.severity}
                          </span>
                          <span className="font-bold text-slate-900">{vulnerability.cvss_score || "0.0"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs leading-relaxed text-slate-500" title={vulnerability.description}>
                        <p className="line-clamp-2">{vulnerability.description || "Sem descrição disponível."}</p>
                        {!vulnerability.has_mitigation && (
                          <p className="mt-2 font-bold text-amber-700">Sem mitigação registada.</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          <QualityBadge label="CVSS" ok={Boolean(vulnerability.has_cvss)} />
                          <QualityBadge label="EPSS" ok={Boolean(vulnerability.has_epss)} />
                          <QualityBadge label="NVD" ok={Boolean(vulnerability.has_nvd)} />
                          <QualityBadge label={vulnerability.is_in_kev ? "KEV" : "KEV check"} ok={Boolean(vulnerability.has_kev_check)} emphatic={Boolean(vulnerability.is_in_kev)} />
                          <QualityBadge label="Mitigação" ok={Boolean(vulnerability.has_mitigation)} />
                        </div>
                        <div className="mt-2 text-[11px] font-semibold text-slate-500">
                          EPSS: {(asNumber(vulnerability.epss_score) * 100).toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 text-xs font-bold text-slate-900 shadow-sm">
                            {vulnerability.affected_assets_count || assets.length || 0}
                          </span>
                          {assets.length > 0 ? (
                            <div className="max-w-[240px] space-y-1">
                              {assets.slice(0, 2).map((asset) => (
                                <Link
                                  key={asset.occurrence_id || asset.asset_id}
                                  to={`/assets/inventory/${asset.asset_id}`}
                                  className="block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                                  title={[asset.asset_ip, asset.status, asset.software_name].filter(Boolean).join(" · ")}
                                >
                                  <span className="block truncate">{asset.asset_name || "Ativo"}</span>
                                  <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                    {[asset.asset_ip, asset.status].filter(Boolean).join(" · ") || "Ocorrência registada"}
                                  </span>
                                </Link>
                              ))}
                              {assets.length > 2 ? (
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  +{assets.length - 2} ativos
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">Sem ativos</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function QualityMetric({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-xs font-bold text-slate-500">
          {value}/{total}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-indigo-600" style={{ width: percent(value, total) }} />
      </div>
      <p className="mt-2 text-lg font-bold text-slate-950">{percent(value, total)}</p>
    </div>
  );
}
