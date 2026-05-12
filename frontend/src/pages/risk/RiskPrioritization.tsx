import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { riskApi, type PrioritizedVulnerability } from '@/lib/riskApi';
import { governanceApi, type DecisionValue } from '@/lib/governanceApi';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileCheck2,
  ShieldAlert,
  Target,
  Zap
} from 'lucide-react';
import { Link } from 'react-router-dom';
import CisoDecisionFlow from '@/components/ui/CisoDecisionFlow';
import { buildVulnerabilityOccurrenceUrl } from '@/lib/cisoNavigation';

const severityStyles: Record<string, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-blue-50 text-blue-700 border-blue-200'
};

function scoreTone(score: number) {
  if (score >= 80) return 'text-red-600';
  if (score >= 60) return 'text-orange-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-emerald-600';
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <span className={`text-2xl font-black ${scoreTone(value)}`}>{Math.round(value)}</span>
    </div>
  );
}

function ReasonList({ title, reasons, icon }: { title: string; reasons: string[]; icon: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {reasons.map((reason) => (
          <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
            {reason}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RiskPrioritization() {
  const [items, setItems] = useState<PrioritizedVulnerability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [savingDecisionKey, setSavingDecisionKey] = useState<string | null>(null);

  useEffect(() => {
    loadPrioritization();
  }, []);

  const loadPrioritization = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await riskApi.listPrioritizedVulnerabilities({ limit: 10 });
      setItems(res);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Nao foi possivel carregar a priorizacao.');
    } finally {
      setLoading(false);
    }
  };

  const registerDecision = async (item: PrioritizedVulnerability, decision: DecisionValue) => {
    const justification = window.prompt("Justificacao da decisao do CISO:");
    if (justification === null) return;

    const key = `${item.asset.id}-${item.vulnerability_id}-${decision}`;
    setSavingDecisionKey(key);
    setDecisionMessage(null);

    try {
      await governanceApi.createDecisionRecord({
        decision_type: "vulnerability",
        target_type: "asset_vulnerability",
        target_id: `${item.asset.id}:${item.vulnerability_id}`,
        title: `${item.cve_id} em ${item.asset.name}`,
        recommendation: item.priority_summary,
        rationale: [...item.risk_reasons, ...item.remediation_reasons].join(" | "),
        source_snapshot: [{
          title: `${item.cve_id} em ${item.asset.name}`,
          source_type: "vulnerability_prioritization",
          source_ref: `asset:${item.asset.id}; vulnerability:${item.vulnerability_id}`,
          content_excerpt: item.priority_summary,
          score: item.priority_score
        }],
        score_snapshot: {
          priority_score: item.priority_score,
          risk_score: item.risk_score,
          remediation_score: item.remediation_score,
          severity: item.severity,
          asset_criticality: item.asset.criticality,
          exposure_level: item.asset.exposure_level,
          risk_breakdown: item.risk_breakdown,
          remediation_breakdown: item.remediation_breakdown
        },
        decision,
        justification,
        decided_at: new Date().toISOString()
      });
      setDecisionMessage(`Decisao registada para ${item.cve_id}.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Nao foi possivel registar a decisao.");
    } finally {
      setSavingDecisionKey(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-12 w-96 rounded-xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-72 rounded-[2rem] bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-black">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar priorizacao
          </div>
          <p className="mt-2 text-sm font-medium">{error}</p>
          <button onClick={loadPrioritization} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-8">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-12 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <h1 className="text-2xl font-black text-slate-900">Sem vulnerabilidades abertas para priorizar</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            O motor nao encontrou ocorrencias abertas com dados suficientes para calcular a fila de remediacao.
          </p>
        </div>
      </div>
    );
  }

  const topItems = items.slice(0, 3);
  const queueItems = items.slice(3);
  const avgPriority = items.reduce((acc, item) => acc + item.priority_score, 0) / items.length;
  const kevCount = items.filter((item) => item.risk_breakdown.exploit_availability > 0).length;

  return (
    <div className="p-8 space-y-10 max-w-[1280px] mx-auto pb-20">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-indigo-600">
            <Zap className="h-4 w-4 fill-indigo-600" />
            Priorizacao contextual
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">O que resolver primeiro?</h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-relaxed text-slate-500">
              Fila calculada com severidade CVSS, probabilidade EPSS, sinal KEV, criticidade do ativo, exposicao e acionabilidade da remediacao.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ScorePill label="Itens" value={items.length} />
          <ScorePill label="Media prioridade" value={avgPriority} />
          <ScorePill label="KEV" value={kevCount} />
        </div>
      </header>

      <CisoDecisionFlow current="prioritization" />

      {decisionMessage && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
          {decisionMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {topItems.map((item, idx) => (
          <div key={`${item.asset.id}-${item.vulnerability_id}-${item.rank}`} className="relative group">
            <div className={`absolute -inset-1 rounded-[2rem] blur opacity-25 transition duration-500 group-hover:opacity-45 ${idx === 0 ? 'bg-gradient-to-r from-red-600 to-orange-500' : 'bg-gradient-to-r from-indigo-600 to-blue-500'}`} />
            <div className="relative flex h-full flex-col justify-between rounded-[2rem] border border-slate-100 bg-white p-7 shadow-sm">
              <div className="space-y-5">
                <div className="flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black ${idx === 0 ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    #{item.rank}
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Prioridade</span>
                    <span className={`text-3xl font-black ${scoreTone(item.priority_score)}`}>{Math.round(item.priority_score)}</span>
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${severityStyles[item.severity] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {item.severity}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {item.cve_id}
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-black leading-tight text-slate-900">{item.asset.name}</h2>
                  <p className="mt-2 text-sm font-medium text-slate-500">{item.priority_summary}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ScorePill label="Risco" value={item.risk_score} />
                  <ScorePill label="Remediacao" value={item.remediation_score} />
                </div>
              </div>
              <Link
                to={buildVulnerabilityOccurrenceUrl({
                  assetId: item.asset.id,
                  cveId: item.cve_id,
                  focus: true,
                })}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800"
              >
                Abrir ocorrência <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["accepted", "Aceitar"],
                  ["deferred", "Diferir"],
                  ["rejected", "Rejeitar"],
                ].map(([decision, label]) => {
                  const key = `${item.asset.id}-${item.vulnerability_id}-${decision}`;
                  return (
                    <button
                      key={decision}
                      onClick={() => registerDecision(item, decision as DecisionValue)}
                      disabled={savingDecisionKey === key}
                      className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60"
                    >
                      {savingDecisionKey === key ? "..." : label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-slate-400">
          <Target className="h-5 w-5" />
          Fila de remediacao prioritaria
        </h3>
        <div className="space-y-4">
          {queueItems.map((item) => (
            <div key={`${item.asset.id}-${item.vulnerability_id}-${item.rank}`} className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:border-indigo-200">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-xl font-black text-slate-900">
                  #{item.rank}
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="font-black uppercase tracking-tight text-slate-900">{item.asset.name}</h4>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{item.cve_id} | {item.severity}</p>
                    </div>
                    <div className="flex gap-3">
                      <ScorePill label="Prioridade" value={item.priority_score} />
                      <ScorePill label="Risco" value={item.risk_score} />
                      <ScorePill label="Remediacao" value={item.remediation_score} />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-600">{item.priority_summary}</p>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ReasonList title="Fatores de risco" reasons={item.risk_reasons} icon={<BarChart3 className="h-3.5 w-3.5" />} />
                    <ReasonList title="Fatores de remediacao" reasons={item.remediation_reasons} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
                  </div>
                </div>
                <Link
                  to={buildVulnerabilityOccurrenceUrl({
                    assetId: item.asset.id,
                    cveId: item.cve_id,
                    focus: true,
                  })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-indigo-600 hover:text-white"
                  title="Abrir ocorrência"
                >
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <button
                  onClick={() => registerDecision(item, "accepted")}
                  disabled={savingDecisionKey === `${item.asset.id}-${item.vulnerability_id}-accepted`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition-all hover:bg-emerald-600 hover:text-white disabled:opacity-60"
                  title="Aceitar recomendacao"
                >
                  <FileCheck2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <Clock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-indigo-950">Como ler esta prioridade</h3>
            <p className="max-w-4xl text-sm font-medium leading-relaxed text-indigo-800">
              O EPSS fornece o sinal preditivo externo de probabilidade de exploracao. O Virtual CISO contextualiza esse sinal com dados internos da organizacao, como criticidade, exposicao e capacidade de remediacao, produzindo uma fila de trabalho explicavel para o CISO e para as equipas tecnicas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


