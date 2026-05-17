import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { governanceApi } from '@/lib/governanceApi';
import { 
  Scale, Building2, ShieldAlert, BookOpen, FileText, FileCheck, AlertTriangle, 
  Settings, Target, Users, CheckCircle2
} from 'lucide-react';

export default function GovernanceDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    nis2: 'Pendente',
    activePolicies: 0,
    activeRegulations: 0,
    activeProcedures: 0,
    reviewPolicies: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [regCtx, policies, regs, procs] = await Promise.all([
          governanceApi.getRegulatoryContext(),
          governanceApi.listPolicies(),
          governanceApi.listTechnicalRegulations(),
          governanceApi.listProcedures()
        ]);

        const activePolicies = policies.results?.filter((p: any) => p.status === 'Active').length || 0;
        const reviewPolicies = policies.results?.filter((p: any) => p.status === 'Under Review').length || 0;
        const activeRegulations = regs.results?.filter((r: any) => r.status === 'Active').length || 0;
        const activeProcedures = procs.results?.filter((p: any) => p.status === 'Active').length || 0;

        setStats({
          nis2: regCtx?.nis2_classification || 'Pendente',
          activePolicies,
          activeRegulations,
          activeProcedures,
          reviewPolicies
        });
      } catch (err) {
        console.error("Erro ao carregar dashboard de governação", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-10 font-bold uppercase tracking-wide text-slate-400">A Carregar Governação...</div>;

  const getBadgeColor = (status: string) => {
    switch (status) {
      case 'Essential': return 'bg-red-50 text-red-600 border-red-200';
      case 'Important': return 'bg-orange-50 text-orange-600 border-orange-200';
      case 'Out of Scope': return 'bg-slate-50 text-slate-600 border-slate-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getTranslatedNis2 = (status: string) => {
    switch (status) {
      case 'Essential': return 'Essencial';
      case 'Important': return 'Importante';
      case 'Out of Scope': return 'Não Abrangida';
      default: return 'Pendente';
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-20">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Scale className="text-indigo-600" size={32} />
            Governação
          </h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-wide mt-1">Visão Estratégica e Risco de Compliance</p>
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div 
          onClick={() => navigate('/governance/regulatory')}
          className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform"><ShieldAlert size={20} /></div>
            <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded-md border ${getBadgeColor(stats.nis2)}`}>NIS2</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tracking-tighter mb-1">{getTranslatedNis2(stats.nis2)}</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Enquadramento Legal</div>
          </div>
        </div>

        <div 
          onClick={() => navigate('/governance/policies')}
          className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform"><BookOpen size={20} /></div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900 tracking-tighter mb-1">{stats.activePolicies}</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Políticas Ativas</div>
          </div>
        </div>

        <div 
          onClick={() => navigate('/governance/technical-regulations')}
          className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform"><Settings size={20} /></div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900 tracking-tighter mb-1">{stats.activeRegulations}</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Reg. Técnicos</div>
          </div>
        </div>

        <div 
          onClick={() => navigate('/governance/procedures')}
          className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform"><FileCheck size={20} /></div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900 tracking-tighter mb-1">{stats.activeProcedures}</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Procedimentos</div>
          </div>
        </div>

        <div 
          onClick={() => navigate('/governance/policies')}
          className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform"><AlertTriangle size={20} /></div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900 tracking-tighter mb-1">{stats.reviewPolicies}</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Doc. em Revisão</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
         <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 p-8 border border-slate-100 min-h-[300px]">
             <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 mb-6 flex items-center gap-2"><Target className="text-indigo-500" size={18} /> Recomendações Estratégicas</h3>
             <div className="space-y-4">
                 {stats.nis2 === 'Pendente' && (
                     <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-start gap-3">
                         <AlertTriangle className="text-orange-500 mt-0.5 shrink-0" size={16} />
                         <div>
                             <div className="text-xs font-bold text-slate-900">Classificação Regulatório Pendente</div>
                             <div className="text-[10px] font-medium text-slate-600 mt-1">Utilize o assistente de contexto regulatório para definir o enquadramento da sua organização face ao DL 125/2025 (NIS2).</div>
                         </div>
                     </div>
                 )}
                 {stats.activePolicies === 0 && (
                     <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                         <ShieldAlert className="text-red-500 mt-0.5 shrink-0" size={16} />
                         <div>
                             <div className="text-xs font-bold text-slate-900">Ausência de Políticas de Segurança</div>
                             <div className="text-[10px] font-medium text-slate-600 mt-1">A organização não possui nenhuma política de segurança ativa. É crítico iniciar a criação do corpo normativo (ex: PSI, Acessos).</div>
                         </div>
                     </div>
                 )}
                  {(stats.activePolicies > 0 && stats.activeRegulations === 0) && (
                     <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                         <Settings className="text-blue-500 mt-0.5 shrink-0" size={16} />
                         <div>
                             <div className="text-xs font-bold text-slate-900">Políticas não operacionalizadas</div>
                             <div className="text-[10px] font-medium text-slate-600 mt-1">Existem políticas ativas mas nenhum Regulamento Técnico definido para as operacionalizar no terreno.</div>
                         </div>
                     </div>
                 )}
                 {(stats.nis2 !== 'Pendente' && stats.activePolicies > 0 && stats.activeRegulations > 0) && (
                     <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
                         <CheckCircle2 className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                         <div>
                             <div className="text-xs font-bold text-slate-900">Estrutura de Governação Base Estabelecida</div>
                             <div className="text-[10px] font-medium text-slate-600 mt-1">Mantenha a revisão periódica dos documentos para garantir a adequação à realidade da organização.</div>
                         </div>
                     </div>
                 )}
             </div>
         </div>
      </div>
    </div>
  );
}

// CheckCircle2 needs to be imported, wait let's just use AlertTriangle or import CheckCircle2.


