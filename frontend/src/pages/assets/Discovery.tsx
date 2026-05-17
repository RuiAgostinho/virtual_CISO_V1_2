import { useState, useEffect } from "react";
import { Radar, RefreshCw, Zap, Shield, Search, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { riskApi } from "@/lib/riskApi";

export default function Discovery() {
  const [syncStatus, setSyncStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const data = await riskApi.getSyncStatus();
      setSyncStatus(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error("Failed to load sync status", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // Refresh status every 30s
    return () => clearInterval(interval);
  }, []);

  const handleNmapScan = async () => {
    setIsScanning(true);
    try {
      const res = await riskApi.runNmapScan();
      setLastScanMessage(res.detail || "Scan Nmap iniciado.");
      loadStatus();
    } catch (err) {
      setLastScanMessage("Erro ao iniciar scan Nmap.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleWazuhSync = async () => {
    setIsScanning(true);
    try {
      const res = await riskApi.syncWazuh();
      setLastScanMessage(res.detail || "Sincronização Wazuh iniciada.");
      loadStatus();
    } catch (err) {
      setLastScanMessage("Erro ao iniciar sincronização Wazuh.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">UC3: Descoberta de Ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Orquestração de Descoberta</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Automatize a identificação de novos ativos no parque informático através de scans de rede e telemetria de agentes.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={handleWazuhSync}
              disabled={isScanning}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              Sincronizar Wazuh
            </button>
            <button 
              onClick={handleNmapScan}
              disabled={isScanning}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors disabled:opacity-50"
            >
              <Radar className="h-4 w-4 text-indigo-400" />
              Executar Scan Nmap
            </button>
          </div>
        </div>
      </header>

      {lastScanMessage && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 flex items-center gap-3 text-sm font-semibold text-indigo-700 shadow-sm animate-in fade-in slide-in-from-top-2">
          <Zap className="h-5 w-5 text-indigo-500" />
          {lastScanMessage}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Status Cards */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-4">Estado das Integrações</h3>
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-10 bg-slate-100 rounded-lg" />
              <div className="h-10 bg-slate-100 rounded-lg" />
            </div>
          ) : syncStatus.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Sem histórico de sincronização.</p>
          ) : (
            <div className="space-y-3">
              {syncStatus.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${s.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : s.status === 'RUNNING' ? 'bg-indigo-100 text-indigo-700 animate-pulse' : 'bg-red-100 text-red-700'}`}>
                      {s.provider === 'wazuh' ? <Shield className="h-4 w-4" /> : <Radar className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 uppercase">{s.provider}</p>
                      <p className="text-[10px] text-slate-500">{new Date(s.last_sync || Date.now()).toLocaleTimeString()}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md ${s.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-indigo-500/10 text-indigo-700'}`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discovery Policy */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm col-span-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-4">Redes em Scope</h3>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Rede / Subnet</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">192.168.1.0/24</td>
                  <td className="px-4 py-3 text-xs text-slate-500">Corporate Internal</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-indigo-600 font-bold text-xs hover:underline">Configurar</button>
                  </td>
                </tr>
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">10.0.0.0/16</td>
                  <td className="px-4 py-3 text-xs text-slate-500">Production Cloud (VPC)</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-indigo-600 font-bold text-xs hover:underline">Configurar</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[10px] text-slate-400 font-medium italic">
            * A descoberta automática utiliza o Nmap para as redes configuradas e o Wazuh para ativos com agente instalado.
          </p>
        </div>
      </div>
    </div>
  );
}
