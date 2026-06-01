import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseZap,
  ExternalLink,
  Link,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { riskApi, type ApiRecord, type IntegrationConfig, type VulnerabilityIntelQuality } from "@/lib/riskApi";

const DEFAULT_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

type EditableIntegrationConfig = IntegrationConfig & {
  api_url?: string | null;
  is_active?: boolean;
  provider_display?: string;
};

type Message = { type: "success" | "error"; text: string };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value?: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function percent(value = 0, total = 0) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function syncStatus(quality: VulnerabilityIntelQuality | null) {
  return (quality?.sync_statuses?.["kev:vulnerability_intel"] || {}) as ApiRecord;
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "text-slate-950",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-indigo-700">
        {icon}
      </div>
      <div className={`mt-5 text-3xl font-bold tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

export default function KEV() {
  const [config, setConfig] = useState<EditableIntegrationConfig | null>(null);
  const [quality, setQuality] = useState<VulnerabilityIntelQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [configResult, qualityData] = await Promise.allSettled([
        riskApi.getIntegrationConfig("kev"),
        riskApi.getVulnerabilityIntelQuality(),
      ]);

      if (configResult.status === "fulfilled") {
        setConfig(configResult.value);
      } else {
        setConfig({
          id: 0,
          provider: "kev",
          api_url: "",
          is_active: true,
          provider_display: "CISA KEV",
        });
      }

      if (qualityData.status === "fulfilled") {
        setQuality(qualityData.value);
      }
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err, "Não foi possível carregar a integração CISA KEV.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveUrl = config?.api_url?.trim() || DEFAULT_KEV_URL;
  const status = useMemo(() => syncStatus(quality), [quality]);

  const persistConfig = async () => {
    if (!config) throw new Error("Configuração CISA KEV indisponível.");
    const payload = {
      provider: "kev",
      api_url: config.api_url || "",
      is_active: config.is_active !== false,
    };
    const saved = config.id
      ? await riskApi.updateIntegrationConfig(config.id, payload)
      : await riskApi.createIntegrationConfig(payload);
    setConfig(saved);
    return saved;
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await persistConfig();
      setMessage({ type: "success", text: "Configuração CISA KEV guardada com sucesso." });
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err, "Erro ao guardar configuração CISA KEV.") });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const saved = await persistConfig();
      const result = await riskApi.testIntegration(saved.id);
      setMessage({ type: result.status === "success" ? "success" : "error", text: result.message || result.detail || "Teste concluído." });
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err, "Erro ao testar ligação ao feed CISA KEV.") });
    } finally {
      setTesting(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      await persistConfig();
      const result = await riskApi.refreshKevIntel();
      setMessage({ type: "success", text: result.detail || result.message || "Sincronização CISA KEV iniciada." });
      window.setTimeout(() => void load(), 2500);
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err, "Erro ao iniciar sincronização CISA KEV.") });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">
        A carregar integração CISA KEV...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-100">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-700">Inteligência de ameaça</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Integração CISA KEV</h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                Sincroniza o catálogo Known Exploited Vulnerabilities da CISA e marca os CVEs existentes que têm exploração conhecida ativa.
              </p>
            </div>
          </div>
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-red-200 hover:text-red-700"
          >
            Feed oficial <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-bold ${
            message.type === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<DatabaseZap className="h-5 w-5" />}
          label="CVEs no catálogo"
          value={quality?.total ?? 0}
          detail="Vulnerabilidades já conhecidas pela plataforma."
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Verificados no KEV"
          value={quality?.kev_checked ?? 0}
          detail={`${percent(quality?.kev_checked, quality?.total)} com consulta KEV registada.`}
          tone={(quality?.missing_kev_check ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}
        />
        <MetricCard
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Em CISA KEV"
          value={quality?.kev_present ?? 0}
          detail="CVEs existentes que surgem no catálogo de exploração conhecida."
          tone={(quality?.kev_present ?? 0) > 0 ? "text-red-600" : "text-slate-950"}
        />
        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="Por verificar"
          value={quality?.missing_kev_check ?? 0}
          detail="CVEs sem carimbo de verificação KEV."
          tone={(quality?.missing_kev_check ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}
        />
      </section>

      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Fonte externa</h2>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">
                Se deixares o campo vazio, o backend usa o feed oficial da CISA. A sincronização não cria CVEs novos: apenas enriquece CVEs já detetados por Wazuh, Nmap ou importação.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">URL do feed JSON</label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={config?.api_url || ""}
                  onChange={(event) =>
                    setConfig((current) => (current ? { ...current, api_url: event.target.value } : current))
                  }
                  placeholder={DEFAULT_KEV_URL}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all focus:border-red-400 focus:ring-2 focus:ring-red-100"
                />
              </div>
              <p className="text-xs font-semibold text-slate-400">URL efetivo: {effectiveUrl}</p>
            </div>

            <label className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <span>
                <span className="block text-sm font-bold text-slate-900">Integração ativa</span>
                <span className="block text-xs font-semibold text-slate-500">Quando ativa, os jobs de sincronização usam esta configuração.</span>
              </span>
              <input
                type="checkbox"
                checked={config?.is_active !== false}
                onChange={(event) => setConfig((current) => (current ? { ...current, is_active: event.target.checked } : current))}
                className="h-5 w-5 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
            </label>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing || saving || syncing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:border-red-200 hover:text-red-700 disabled:opacity-50"
              >
                {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Testar ligação
              </button>
              <button
                type="submit"
                disabled={saving || testing || syncing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-red-800 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </button>
              <button
                type="button"
                onClick={runSync}
                disabled={syncing || saving || testing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-6 py-3 text-xs font-bold uppercase tracking-wide text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizar CISA KEV
              </button>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Estado da sincronização</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Estado</dt>
              <dd className="mt-1 font-bold text-slate-900">{String(status.status || "PENDING")}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Última execução</dt>
              <dd className="mt-1 font-bold text-slate-900">{formatDate(status.last_run_at)}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Duração</dt>
              <dd className="mt-1 font-bold text-slate-900">{status.duration_seconds ? `${status.duration_seconds}s` : "-"}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Último erro</dt>
              <dd className="mt-1 break-words text-xs font-semibold leading-relaxed text-slate-600">
                {String(status.last_error || "Sem erro registado.")}
              </dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-3">
            <RouterLink
              to="/vulnerabilities?filter=kev"
              className="inline-flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-red-200 hover:text-red-700"
            >
              Ver CVEs em KEV <ExternalLink className="h-4 w-4" />
            </RouterLink>
            <RouterLink
              to="/risks/prioritization"
              className="inline-flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-800"
            >
              Ver priorização <ShieldAlert className="h-4 w-4" />
            </RouterLink>
          </div>
        </aside>
      </form>
    </div>
  );
}
