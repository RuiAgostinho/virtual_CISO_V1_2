import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, AlertTriangle, Shield, Zap, ExternalLink, Filter, Target } from "lucide-react";
import { riskApi, type PaginatedResponse, type Vulnerability } from "@/lib/riskApi";

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function Vulnerabilities() {
  const [vulns, setVulns] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadVulns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listVulnerabilities();
      setVulns(unwrap<Vulnerability>(data));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar vulnerabilidades."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVulns();
  }, [loadVulns]);

  const filteredVulns = useMemo(() => {
    if (!search) return vulns;
    const lower = search.toLowerCase();
    return vulns.filter(v => 
      v.cve_id?.toLowerCase().includes(lower) || 
      v.description?.toLowerCase().includes(lower)
    );
  }, [search, vulns]);

  const metrics = useMemo(() => ({
    total: vulns.length,
    critical: vulns.filter(v => v.severity === 'Critical').length,
    high: vulns.filter(v => v.severity === 'High').length,
  }), [vulns]);

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">UC4: Gestão de Vulnerabilidades</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Dicionário de CVEs</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Catálogo centralizado de vulnerabilidades detetadas, enriquecido com dados de inteligência EPSS e KEV.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void loadVulns()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar Intel
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Shield className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total CVEs</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.critical}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gravidade Crítica</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Zap className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.high}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gravidade Alta</p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por CVE ID ou descrição..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium outline-none focus:border-indigo-500 transition-all"
            />
          </div>
          <button className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Filter className="h-4 w-4" />
            Filtros
          </button>
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
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">CVE ID</th>
                  <th className="px-6 py-4">Gravidade / CVSS</th>
                  <th className="px-6 py-4 w-1/3">Descrição</th>
                  <th className="px-6 py-4 text-center">EPSS / KEV</th>
                  <th className="px-6 py-4 text-right">Ativos Afetados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVulns.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-950 underline decoration-indigo-200 underline-offset-4 cursor-pointer hover:text-indigo-700 transition-colors">
                          {v.cve_id}
                        </span>
                        <ExternalLink className="h-3 w-3 text-slate-300" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded-lg border text-[10px] font-bold uppercase ${getSeverityStyle(v.severity)}`}>
                          {v.severity}
                        </span>
                        <span className="font-bold text-slate-900">{v.cvss_score || '0.0'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 leading-relaxed line-clamp-2" title={v.description}>
                      {v.description || 'Sem descrição disponível.'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-[10px] font-bold ${Number(v.epss_score || 0) > 0.5 ? 'text-red-600' : 'text-slate-500'}`}>
                          EPSS: {(Number(v.epss_score || 0) * 100).toFixed(1)}%
                        </span>
                        {v.is_in_kev && (
                          <span className="bg-red-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">KEV</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-900 border border-slate-200 shadow-sm">
                        {v.affected_assets_count || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
