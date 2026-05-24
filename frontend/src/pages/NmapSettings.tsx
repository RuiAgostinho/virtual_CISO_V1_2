import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Network, Save, RefreshCw, AlertCircle, CheckCircle2, Lock, Server } from "lucide-react";
import { riskApi, type IntegrationConfig } from "@/lib/riskApi";

type EditableIntegrationConfig = IntegrationConfig & {
  api_url?: string;
  username?: string;
  password?: string;
  is_active?: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function NmapSettings() {
  const [config, setConfig] = useState<EditableIntegrationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await riskApi.getIntegrationConfig('nmap');
      setConfig(data);
    } catch (err) {
      console.error("Failed to load Nmap config", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!config?.id) return;
    setSaving(true);
    setMessage(null);
    try {
      await riskApi.updateIntegrationConfig(config.id, config);
      setMessage({ type: 'success', text: "Configuração guardada com sucesso!" });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(err, "Erro ao guardar configuração.") });
    } finally {
      setSaving(false);
    }
  };

  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    if (!config?.id) return;
    setTesting(true);
    setMessage(null);
    try {
      const res = await riskApi.testIntegration(config.id);
      setMessage({ type: res.status === 'success' ? 'success' : 'error', text: res.message });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(err, "Erro ao testar ligação.") });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">A carregar configuração...</div>;

  return (
    <div className="mx-auto max-w-[800px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200">
            <Network className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Integração Nmap (Discovery)</h1>
            <p className="text-sm font-semibold text-slate-500">Configure as credenciais SSH para execução remota do motor de discovery.</p>
          </div>
        </div>
      </header>

      {message && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-2 ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="grid gap-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-slate-500">Scanner Host (SSH)</label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={config?.api_url || ""} 
                onChange={(e) => setConfig((current) => current ? { ...current, api_url: e.target.value } : current)}
                placeholder="localhost ou 192.168.1.10"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium focus:border-indigo-500 outline-none transition-all" 
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500">SSH User</label>
              <input 
                type="text" 
                value={config?.username || ""} 
                onChange={(e) => setConfig((current) => current ? { ...current, username: e.target.value } : current)}
                placeholder="root"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-4 text-sm font-medium focus:border-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500">SSH Password / Key Path</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input 
                  type="password" 
                  value={config?.password || ""} 
                  onChange={(e) => setConfig((current) => current ? { ...current, password: e.target.value } : current)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium focus:border-indigo-500 outline-none transition-all" 
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${config?.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                {config?.is_active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={testConnection}
                disabled={testing || saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors disabled:opacity-50"
              >
                {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
                Testar Ligação
              </button>
              <button 
                type="submit" 
                disabled={saving || testing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-8 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors shadow-lg shadow-slate-900/10 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
