import { useState, useEffect } from "react";
import { Grid3X3, RefreshCw, AlertTriangle, ShieldCheck, Zap, Info } from "lucide-react";
import { riskApi } from "@/lib/riskApi";

export default function RiskMatrix() {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRisks = async () => {
    setLoading(true);
    try {
      const data = await riskApi.listRisks();
      setRisks(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error("Failed to load risks for matrix", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRisks();
  }, []);

  const matrixData = Array(5).fill(0).map(() => Array(5).fill(0));
  risks.forEach(r => {
    const l = Math.min(Math.max(Math.round(r.likelihood || 1), 1), 5) - 1;
    const i = Math.min(Math.max(Math.round(r.impact || 1), 1), 5) - 1;
    matrixData[4-l][i]++;
  });

  const getCellColor = (row: number, col: number) => {
    const l = 5 - row;
    const i = col + 1;
    const score = l * i;
    if (score >= 15) return "bg-red-500/80 text-white border-red-600";
    if (score >= 9) return "bg-orange-500/80 text-white border-orange-600";
    if (score >= 4) return "bg-amber-500/80 text-white border-amber-600";
    return "bg-emerald-500/80 text-white border-emerald-600";
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">UC4: Gestão de Risco</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Matriz de Risco (ISO 27005)</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Visualização da probabilidade vs impacto de todos os riscos identificados no parque informático.
            </p>
          </div>
          <button onClick={loadRisks} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Matrix Visualization */}
        <div className="lg:col-span-2 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Grid3X3 className="h-5 w-5" />
              Heatmap de Probabilidade vs Impacto
            </h3>
          </div>

          <div className="flex">
            {/* Y Axis Label */}
            <div className="flex flex-col justify-between py-12 pr-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 [writing-mode:vertical-lr] rotate-180">Probabilidade</span>
              <div className="flex flex-col gap-4 text-xs font-bold text-slate-400">
                <span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>
              </div>
            </div>

            {/* Matrix Body */}
            <div className="flex-1">
              <div className="grid grid-cols-5 gap-2 h-[400px]">
                {matrixData.map((row, rIdx) => 
                  row.map((count, cIdx) => (
                    <div 
                      key={`${rIdx}-${cIdx}`}
                      className={`flex items-center justify-center rounded-xl border-2 transition-all hover:scale-105 cursor-pointer shadow-sm font-bold text-xl ${getCellColor(rIdx, cIdx)}`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  ))
                )}
              </div>
              {/* X Axis Labels */}
              <div className="grid grid-cols-5 gap-2 mt-4 text-center">
                <span className="text-xs font-bold text-slate-400">1</span>
                <span className="text-xs font-bold text-slate-400">2</span>
                <span className="text-xs font-bold text-slate-400">3</span>
                <span className="text-xs font-bold text-slate-400">4</span>
                <span className="text-xs font-bold text-slate-400">5</span>
              </div>
              <p className="text-center mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Impacto</p>
            </div>
          </div>
        </div>

        {/* Legend & Stats */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Legenda de Criticidade
            </h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-xs font-bold text-slate-700">Crítico (Inaceitável)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="text-xs font-bold text-slate-700">Alto (Intervenção Prioritária)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <span className="text-xs font-bold text-slate-700">Médio (Monitorização)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-700">Baixo (Aceitável)</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Métricas de Exposição</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Risco Médio</p>
                <p className="text-xl font-bold text-slate-900">
                  {(risks.reduce((acc, r) => acc + (r.risk_score || 0), 0) / (risks.length || 1)).toFixed(1)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Riscos Abertos</p>
                <p className="text-xl font-bold text-slate-900">{risks.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
