import { useEffect, useState, type ReactNode } from 'react';
import { riskApi, type RiskDashboardPayload } from '@/lib/riskApi';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell,
} from 'recharts';
import { 
  AlertTriangle, Shield, Activity, TrendingUp, 
  ArrowRight, BrainCircuit,
} from 'lucide-react';

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#10b981'];
const LEVEL_LABELS: Record<string, string> = {
  'critical': 'Crítico',
  'high': 'Elevado',
  'medium': 'Médio',
  'low': 'Baixo',
  'very_low': 'Muito Baixo'
};

export default function RiskDashboard() {
  const [data, setData] = useState<RiskDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await riskApi.getRiskDashboard();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-10 w-64 bg-slate-100 animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-3xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-96 bg-slate-100 animate-pulse rounded-3xl md:col-span-2" />
          <div className="h-96 bg-slate-100 animate-pulse rounded-3xl" />
        </div>
      </div>
    );
  }

  const chartData = data.distribution.map((d) => ({
    name: LEVEL_LABELS[d.risk_level] || d.risk_level,
    value: d.count
  }));

  return (
    <div className="p-8 space-y-8 pb-20 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="flex justify-between items-start">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Gestão de Risco</h1>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-indigo-500" />
            Priorização baseada em Inteligência Preditiva (ISO 27005)
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">
            Exportar Relatório
          </button>
          <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
            Nova Avaliação
          </button>
        </div>
      </header>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total de Riscos" 
          value={data.metrics.total} 
          icon={<Shield className="w-6 h-6 text-slate-500" />}
          color="bg-slate-50"
        />
        <StatCard 
          title="Riscos Críticos"
          value={data.metrics.critical} 
          icon={<AlertTriangle className="w-6 h-6 text-red-500" />}
          color="bg-red-50"
          textColor="text-red-600"
        />
        <StatCard 
          title="Riscos Elevados" 
          value={data.metrics.high} 
          icon={<Activity className="w-6 h-6 text-orange-500" />}
          color="bg-orange-50"
          textColor="text-orange-600"
        />
        <StatCard 
          title="Em Aberto" 
          value={data.metrics.open} 
          icon={<TrendingUp className="w-6 h-6 text-indigo-500" />}
          color="bg-indigo-50"
          textColor="text-indigo-600"
        />
      </div>

      {/* Main Grid (Bento Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Distribution Chart */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col">
          <h3 className="text-xl font-bold text-slate-900 mb-8 uppercase tracking-tight">Distribuição por Nível de Risco</h3>
          <div className="flex-1 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800 }}
                />
                <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={60}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Assets */}
        <div className="lg:col-span-4 bg-slate-900 text-white border border-slate-800 rounded-[2.5rem] p-8 shadow-xl flex flex-col">
          <h3 className="text-xl font-bold mb-6 uppercase tracking-tight">Top Ativos Críticos</h3>
          <div className="space-y-4 flex-1">
            {data.top_assets.map((asset, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all group">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Ativo</span>
                  <p className="font-bold text-sm truncate max-w-[180px]">{asset.asset__name}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Score Máx</span>
                  <span className="text-xl font-bold text-red-400">{Math.round(asset.score)}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-8 w-full py-4 bg-white text-slate-900 rounded-2xl font-bold text-xs uppercase tracking-wide hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
            Ver Inventário de Risco <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* AI Explanation Area */}
        <div className="lg:col-span-12 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] p-8 flex items-center gap-8">
           <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <BrainCircuit className="w-10 h-10 text-white" />
           </div>
           <div className="space-y-2">
              <h4 className="text-lg font-bold text-indigo-900">Resumo da Inteligência Preditiva</h4>
              <p className="text-sm font-medium text-indigo-700 leading-relaxed max-w-4xl">
                O modelo XGBoost identificou uma concentração de risco em ativos virados para a internet com vulnerabilidades exploráveis (EPSS &gt; 0.8).
                Recomenda-se a mitigação imediata de 5 vulnerabilidades no cluster de Gateway para reduzir o score global em 12%.
              </p>
           </div>
           <div className="ml-auto">
              <button className="px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-200 rounded-2xl font-bold text-xs uppercase tracking-wide hover:bg-indigo-100 transition-all shadow-sm">
                 Ver Recomendações
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  textColor = 'text-slate-900',
}: {
  title: string;
  value: number | string;
  icon: ReactNode;
  color: string;
  textColor?: string;
}) {
  return (
    <div className={`${color} p-8 rounded-[2.5rem] border border-white shadow-sm hover:shadow-md transition-all space-y-4`}>
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{title}</span>
        {icon}
      </div>
      <div className={`text-4xl font-bold ${textColor}`}>{value}</div>
      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
        <span className="text-green-500">↑ 12%</span> vs mês anterior
      </div>
    </div>
  );
}
