import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Compass, Radar, RefreshCw, Shield, XCircle } from "lucide-react";
import {
  riskApi,
  type AssetDiscoveryFinding,
  type AssetDiscoveryRun,
  type PaginatedResponse,
  type SyncStatusItem,
} from "@/lib/riskApi";

type DiscoverySyncStatus = SyncStatusItem & {
  id?: string | number;
  provider?: string;
  status?: string;
  last_sync?: string | null;
  last_sync_at?: string | null;
};

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function statusTone(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (["completed", "success", "confirmed"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["running", "queued", "in_review", "new"].includes(normalized)) return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (["ignored", "duplicate", "failed"].includes(normalized)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-PT");
}

export default function Discovery() {
  const [syncStatus, setSyncStatus] = useState<DiscoverySyncStatus[]>([]);
  const [runs, setRuns] = useState<AssetDiscoveryRun[]>([]);
  const [findings, setFindings] = useState<AssetDiscoveryFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "confirmed" | "ignored" | "duplicate">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusData, runsData, findingsData] = await Promise.all([
        riskApi.getSyncStatus(),
        riskApi.listAssetDiscoveryRuns({ page_size: 5 }),
        riskApi.listAssetDiscoveryFindings({ page_size: 50, ordering: "-created_at" }),
      ]);
      setSyncStatus(unwrap(statusData));
      setRuns(unwrap(runsData));
      setFindings(unwrap(findingsData));
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar a descoberta de ativos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const metrics = useMemo(
    () => ({
      findings: findings.length,
      new: findings.filter((item) => item.status === "new").length,
      confirmed: findings.filter((item) => item.status === "confirmed").length,
      ignored: findings.filter((item) => item.status === "ignored").length,
    }),
    [findings],
  );

  const visibleFindings = useMemo(
    () => findings.filter((finding) => filter === "all" || finding.status === filter),
    [findings, filter],
  );

  const handleNmapScan = async () => {
    setIsScanning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await riskApi.runNmapScan();
      setMessage(res.detail || "Scan Nmap concluído.");
      await load();
    } catch (err) {
      console.error(err);
      setError("Erro ao executar scan Nmap.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleWazuhSync = async () => {
    setIsScanning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await riskApi.syncWazuh();
      setMessage(res.detail || "Sincronização Wazuh iniciada.");
      await load();
    } catch (err) {
      console.error(err);
      setError("Erro ao iniciar sincronização Wazuh.");
    } finally {
      setIsScanning(false);
    }
  };

  const reviewFinding = async (finding: AssetDiscoveryFinding, action: "confirm" | "ignore") => {
    try {
      if (action === "confirm") {
        await riskApi.confirmAssetDiscoveryFinding(finding.id);
        setMessage("Finding confirmado e ligado ao inventário.");
      } else {
        await riskApi.ignoreAssetDiscoveryFinding(finding.id, "Ignorado na triagem de descoberta.");
        setMessage("Finding ignorado.");
      }
      await load();
    } catch (err) {
      console.error(err);
      setError("Não foi possível atualizar o finding.");
    }
  };

  const tabs: Array<{ key: typeof filter; label: string; count: number }> = [
    { key: "all", label: "Todos", count: metrics.findings },
    { key: "new", label: "Novos", count: metrics.new },
    { key: "confirmed", label: "Confirmados", count: metrics.confirmed },
    { key: "ignored", label: "Ignorados", count: metrics.ignored },
    { key: "duplicate", label: "Duplicados", count: findings.filter((item) => item.status === "duplicate").length },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestão de ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Descoberta e validação de ativos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Cada execução fica registada na BD. Os ativos descobertos entram numa fila de validação antes de serem tratados como inventário fiável.
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
              onClick={handleWazuhSync}
              disabled={isScanning}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700 disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              Sincronizar Wazuh
            </button>
            <button
              onClick={handleNmapScan}
              disabled={isScanning}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-800 disabled:opacity-50"
            >
              <Radar className="h-4 w-4 text-indigo-300" />
              Executar Nmap
            </button>
          </div>
        </div>
      </header>

      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm font-semibold text-indigo-700 shadow-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {message}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Compass className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.findings}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Findings registados</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Clock3 className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.new}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Por validar</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.confirmed}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Confirmados</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <XCircle className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.ignored}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ignorados</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 p-4">
            <h2 className="text-lg font-bold text-slate-950">Últimas execuções</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Histórico real de discovery runs registadas.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {runs.length === 0 ? (
              <p className="p-6 text-sm font-semibold text-slate-400">Ainda não existem execuções registadas.</p>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(run.status)}`}>
                        {run.status}
                      </span>
                      <p className="mt-2 text-sm font-bold text-slate-950">{run.source.toUpperCase()}</p>
                      <p className="text-xs font-semibold text-slate-500">{formatDate(run.started_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-slate-950">{run.processed_count || 0}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Processados</p>
                    </div>
                  </div>
                  {run.error_message && <p className="mt-3 text-xs font-semibold text-red-600">{run.error_message}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Fila de validação</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Confirma, ignora ou revê os ativos descobertos.</p>
            </div>
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
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar dados reais da BD...</div>
          ) : visibleFindings.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
              <p className="mt-4 text-sm font-bold text-slate-700">Sem findings para este filtro</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Executa um scan ou muda o filtro para ver histórico.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleFindings.map((finding) => (
                <div key={finding.id} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(finding.status)}`}>
                          {finding.status}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {finding.run_source || "discovery"}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-bold text-slate-950">{finding.hostname || finding.ip_address || "Ativo sem nome"}</h3>
                      <p className="mt-0.5 text-sm font-semibold text-slate-500">
                        {finding.ip_address || "Sem IP"} {finding.os_name ? `· ${finding.os_name}` : ""}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-400">
                        {finding.asset_name ? `Ligado a ${finding.asset_name}` : finding.match_reason || "Sem ativo ligado."}
                      </p>
                      {(finding.services || []).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(finding.services || []).slice(0, 6).map((service) => (
                            <span key={service} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {service}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {finding.status === "new" && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => void reviewFinding(finding, "confirm")}
                          className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => void reviewFinding(finding, "ignore")}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-red-600"
                        >
                          Ignorar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {syncStatus.length > 0 && (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Estado das integrações</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {syncStatus.map((item) => (
              <div key={item.id ?? `${item.provider}-${item.last_sync ?? item.last_sync_at}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.provider || "integração"}</p>
                <p className="mt-2 text-sm font-bold text-slate-950">{item.status || "sem estado"}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{formatDate(item.last_sync || item.last_sync_at)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
