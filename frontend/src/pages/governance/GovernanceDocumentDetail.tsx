/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FilePlus2,
  FileText,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { mappingReviewApi, type TraceabilityPayload } from "@/lib/mappingReviewApi";

type DocumentRecord = Record<string, any>;

function asArray<T = any>(payload: any): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.results || [];
}

function documentTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    policy: "Policy",
    standard: "Norma",
    procedure: "Procedimento",
    guideline: "Guideline",
    technical_regulation: "Regulamento tecnico",
    runbook: "Runbook",
  };
  return labels[type || ""] || type || "Documento";
}

function documentTypeTone(type?: string) {
  if (type === "policy") return "border-slate-200 bg-slate-50 text-slate-700";
  if (type === "standard") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "procedure") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  if (type === "runbook") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (type === "technical_regulation") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-violet-100 bg-violet-50 text-violet-700";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    under_review: "Em revisao",
    approved: "Aprovado",
    published: "Publicado",
    deprecated: "Deprecated",
    archived: "Arquivado",
    non_compliant: "Nao conforme",
    partially_compliant: "Parcialmente conforme",
    mostly_compliant: "Maioritariamente conforme",
    compliant: "Conforme",
    not_assessed: "Nao avaliado",
    not_applicable: "Nao aplicavel",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusTone(status?: string) {
  if (["approved", "published", "compliant"].includes(status || "")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["under_review", "mostly_compliant"].includes(status || "")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["deprecated", "archived", "not_assessed", "not_applicable"].includes(status || "")) {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }
  if (["non_compliant", "partially_compliant"].includes(status || "")) {
    return "border-red-100 bg-red-50 text-red-700";
  }
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function mappingTone(status?: string) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "rejected" || status === "deprecated") return "border-red-100 bg-red-50 text-red-700";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function scoreValue(result?: any) {
  const score = result?.score ?? result?.result?.score;
  if (score === null || score === undefined || score === "") return "-";
  const parsed = Number(score);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(score);
}

function scoreStatus(result?: any) {
  return result?.status ?? result?.result?.status ?? "not_assessed";
}

function compactText(value?: string | null, fallback = "-") {
  return value && value.trim() ? value : fallback;
}

function entityLabel(item: any) {
  if (!item) return "-";
  if (item.code && item.title) return `${item.code} - ${item.title}`;
  if (item.framework_code && item.code && item.title) return `${item.framework_code}:${item.code} - ${item.title}`;
  if (item.name && item.version) return `${item.name} ${item.version}`;
  return item.title || item.name || item.code || item.id || "-";
}

function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function InfoCard({ icon: Icon, label, value, tone = "text-indigo-700" }: { icon: any; label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }: { title: string; icon: any; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-indigo-700" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function DocumentHierarchyPanel({ document, childrenDocuments }: { document: DocumentRecord; childrenDocuments: DocumentRecord[] }) {
  return (
    <SectionCard title="Hierarquia" icon={GitBranch}>
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Documento pai</p>
          {document.parent_document ? (
            <Link to={`/governance/documents/${document.parent_document}`} className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 hover:text-indigo-900">
              <Link2 className="h-4 w-4" />
              {document.parent_document_title || document.parent_document}
            </Link>
          ) : document.legacy_policy ? (
            <p className="mt-1 text-sm font-bold text-slate-700">
              {document.legacy_policy_code || "Policy"} - {document.legacy_policy_title || document.legacy_policy}
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-slate-500">Sem documento pai.</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Documentos filhos</p>
          {childrenDocuments.length > 0 ? (
            <div className="mt-2 space-y-2">
              {childrenDocuments.map((child) => (
                <Link key={child.id} to={`/governance/documents/${child.id}`} className="block rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 hover:border-indigo-200 hover:bg-indigo-50">
                  <p className="text-sm font-bold text-slate-900">{child.title}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {documentTypeLabel(child.document_type)} - {statusLabel(child.status)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm font-semibold text-slate-500">Sem subordinados criados.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function RunbookStepsPanel({ steps }: { steps: any[] }) {
  return (
    <SectionCard title="Runbook steps" icon={ClipboardList}>
      {steps.length > 0 ? (
        <div className="space-y-3">
          {steps
            .slice()
            .sort((a, b) => Number(a.step_number || 0) - Number(b.step_number || 0))
            .map((step) => (
              <div key={step.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Step {step.step_number}</p>
                    <h3 className="mt-1 text-base font-bold text-slate-950">{step.title}</h3>
                  </div>
                  {step.evidence_required && (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">Evidencia requerida</Badge>
                  )}
                </div>
                {step.description && <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">{step.description}</p>}
                {step.expected_output && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Output esperado</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{step.expected_output}</p>
                  </div>
                )}
              </div>
            ))}
        </div>
      ) : (
        <EmptyState text="Este runbook ainda nao tem passos operacionais." />
      )}
    </SectionCard>
  );
}

function TraceabilitySummaryPanel({
  traceability,
  officialScore,
  simulationScore,
}: {
  traceability: TraceabilityPayload | null;
  officialScore: any;
  simulationScore: any;
}) {
  const relationships = traceability?.relationships || {};
  const evidence = traceability?.evidence || {};
  const gaps = traceability?.gaps || officialScore?.gaps || [];
  const internalControls = asArray(relationships.internal_controls);
  const mechanisms = asArray(relationships.mechanisms);
  const frameworks = asArray(relationships.frameworks);
  const frameworkControls = asArray(relationships.framework_controls);
  const evidenceItems = asArray(evidence.items);

  return (
    <SectionCard title="Rastreabilidade e impacto" icon={Network}>
      <div className="grid gap-4 lg:grid-cols-2">
        <TraceList
          title="Controlos internos"
          empty="Sem controlos internos associados."
          items={internalControls}
          render={(item) => (
            <>
              <p className="font-bold text-slate-950">{entityLabel(item)}</p>
              <p className="text-xs font-semibold text-slate-500">{item.control_domain || "Sem dominio"} - {item.criticality || "criticality n/d"}</p>
            </>
          )}
        />
        <TraceList
          title="Mecanismos"
          empty="Sem mecanismos indiretos associados."
          items={mechanisms}
          render={(item) => {
            const mechanism = item.mechanism || item;
            return (
              <>
                <p className="font-bold text-slate-950">{entityLabel(mechanism)}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {item.implementation_status || mechanism.mechanism_type || "Sem estado"}{item.mandatory ? " - obrigatorio" : ""}
                </p>
              </>
            );
          }}
        />
        <TraceList
          title="Frameworks"
          empty="Sem frameworks impactadas."
          items={frameworks}
          render={(item) => (
            <>
              <p className="font-bold text-slate-950">{entityLabel(item)}</p>
              <p className="text-xs font-semibold text-slate-500">{item.code || "Framework"} - {item.version || "versao n/d"}</p>
            </>
          )}
        />
        <TraceList
          title="Evidencias"
          empty="Sem evidencias associadas direta ou indiretamente."
          items={evidenceItems}
          render={(item) => (
            <>
              <p className="font-bold text-slate-950">{entityLabel(item)}</p>
              <p className="text-xs font-semibold text-slate-500">
                {item.evidence_type || "evidence"} - {statusLabel(item.status)} - validade {formatDate(item.valid_until)}
              </p>
            </>
          )}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score official</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{scoreValue(officialScore || traceability?.scores?.official)}</p>
          <Badge className={statusTone(scoreStatus(officialScore || traceability?.scores?.official))}>{statusLabel(scoreStatus(officialScore || traceability?.scores?.official))}</Badge>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score simulation</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{scoreValue(simulationScore || traceability?.scores?.simulation)}</p>
          <Badge className={statusTone(scoreStatus(simulationScore || traceability?.scores?.simulation))}>{statusLabel(scoreStatus(simulationScore || traceability?.scores?.simulation))}</Badge>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Framework controls</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{frameworkControls.length}</p>
          <p className="text-xs font-semibold text-slate-500">Controlos externos impactados</p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Gaps</h3>
        {gaps.length > 0 ? (
          <div className="mt-3 space-y-2">
            {gaps.slice(0, 8).map((gap: any, index: number) => (
              <div key={`${gap.type || gap.gap_type || "gap"}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-amber-900">{gap.type || gap.gap_type || "Gap"}</p>
                <p className="mt-1 text-sm font-semibold text-amber-800">{gap.description || gap.recommendation || "Sem descricao."}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm font-semibold text-slate-500">Sem gaps devolvidos pelo motor de rastreabilidade.</p>
        )}
      </div>
    </SectionCard>
  );
}

function TraceList({ title, empty, items, render }: { title: string; empty: string; items: any[]; render: (item: any) => ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
        <Badge className="border-slate-200 bg-white text-slate-500">{items.length}</Badge>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.slice(0, 6).map((item, index) => (
            <div key={item.id || `${title}-${index}`} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
              {render(item)}
            </div>
          ))}
          {items.length > 6 && <p className="text-xs font-semibold text-slate-500">+{items.length - 6} adicionais via API.</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-500">{empty}</p>
      )}
    </div>
  );
}

export default function GovernanceDocumentDetail() {
  const { id } = useParams();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [children, setChildren] = useState<DocumentRecord[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [runbookSteps, setRunbookSteps] = useState<any[]>([]);
  const [internalControls, setInternalControls] = useState<any[]>([]);
  const [traceability, setTraceability] = useState<TraceabilityPayload | null>(null);
  const [officialScore, setOfficialScore] = useState<any | null>(null);
  const [simulationScore, setSimulationScore] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [
        documentPayload,
        childrenPayload,
        sectionsPayload,
        runbookStepsPayload,
        internalControlsPayload,
        traceabilityPayload,
        officialPayload,
        simulationPayload,
      ] = await Promise.all([
        mappingReviewApi.getGovernanceDocument(id),
        mappingReviewApi.getGovernanceDocumentChildren(id).catch(() => []),
        mappingReviewApi.getGovernanceDocumentSections(id).catch(() => []),
        mappingReviewApi.getGovernanceDocumentRunbookSteps(id).catch(() => []),
        mappingReviewApi.getGovernanceDocumentInternalControls(id).catch(() => []),
        mappingReviewApi.getGovernanceDocumentTraceability(id, {
          mode: "official",
          include_inactive: true,
          include_evidence: true,
          include_gaps: true,
          include_scores: true,
          max_depth: 3,
        }).catch(() => null),
        mappingReviewApi.getGovernanceDocumentComplianceScore(id, {
          mode: "official",
          include_details: true,
          include_gaps: true,
        }).catch(() => null),
        mappingReviewApi.getGovernanceDocumentComplianceScore(id, {
          mode: "simulation",
          include_details: true,
          include_gaps: true,
        }).catch(() => null),
      ]);

      setDocument(documentPayload);
      setChildren(asArray(childrenPayload));
      setSections(asArray(sectionsPayload));
      setRunbookSteps(asArray(runbookStepsPayload));
      setInternalControls(asArray(internalControlsPayload));
      setTraceability(traceabilityPayload);
      setOfficialScore(officialPayload);
      setSimulationScore(simulationPayload);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o documento de governance.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const traceCounts = useMemo(() => {
    const relationships = traceability?.relationships || {};
    return {
      mechanisms: asArray(relationships.mechanisms).length,
      evidence: asArray(traceability?.evidence?.items).length,
      frameworks: asArray(relationships.frameworks).length,
      gaps: (traceability?.gaps || officialScore?.gaps || []).length,
    };
  }, [officialScore, traceability]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-5 text-sm font-bold text-slate-500 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-700" />
          A carregar documento...
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 rounded-2xl border border-red-100 bg-white p-8 shadow-sm">
        <AlertTriangle className="h-8 w-8 text-red-600" />
        <h1 className="text-2xl font-bold text-slate-950">Documento indisponivel</h1>
        <p className="text-sm font-semibold text-slate-500">{error || "Nao foi encontrado documento para o ID indicado."}</p>
        <Link to="/governance/documents" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
          <ArrowLeft className="h-4 w-4" />
          Voltar aos documentos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <Link to="/governance/documents" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar aos documentos
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Badge className={documentTypeTone(document.document_type)}>{documentTypeLabel(document.document_type)}</Badge>
              <Badge className={statusTone(document.status)}>{statusLabel(document.status)}</Badge>
              {!document.is_active && <Badge className="border-slate-200 bg-slate-50 text-slate-500">Inativo</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{document.title}</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {compactText(document.purpose || document.scope || document.content, "Documento de governance criado na camada transversal.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link to={`/governance/documents/wizard?parentDocument=${document.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <FilePlus2 className="h-4 w-4" />
              Criar subordinado
            </Link>
            <Link to={`/governance/mapping-review?document=${document.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <GitBranch className="h-4 w-4" />
              Mapping Review
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard icon={ShieldCheck} label="Score official" value={scoreValue(officialScore || traceability?.scores?.official)} tone="text-emerald-600" />
        <InfoCard icon={CheckCircle2} label="Score simulation" value={scoreValue(simulationScore || traceability?.scores?.simulation)} tone="text-indigo-700" />
        <InfoCard icon={Wrench} label="Mecanismos" value={traceCounts.mechanisms} tone="text-cyan-600" />
        <InfoCard icon={AlertTriangle} label="Gaps" value={traceCounts.gaps} tone={traceCounts.gaps ? "text-amber-600" : "text-slate-400"} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <main className="space-y-6">
          <SectionCard title="Dados gerais" icon={FileText}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Versao</p>
                <p className="mt-1 text-sm font-bold text-slate-900">v{document.version || "1.0"}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{document.owner || "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data de aprovacao</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(document.approval_date)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data de revisao</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(document.review_date)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ambito</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">{compactText(document.scope)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Proposito</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">{compactText(document.purpose)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Conteudo</p>
                <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                  {compactText(document.content, "Sem conteudo detalhado registado.")}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Secoes" icon={Layers3}>
            {sections.length > 0 ? (
              <div className="space-y-3">
                {sections
                  .slice()
                  .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                  .map((section) => (
                    <div key={section.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{section.section_number || "Secao"}</p>
                          <h3 className="mt-1 text-base font-bold text-slate-950">{section.title}</h3>
                        </div>
                        {section.parent_section_title && <Badge className="border-slate-200 bg-white text-slate-500">Subsecao</Badge>}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-600">{compactText(section.content, "Sem conteudo.")}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState text="Este documento ainda nao tem secoes estruturadas." />
            )}
          </SectionCard>

          {document.document_type === "runbook" && <RunbookStepsPanel steps={runbookSteps} />}

          <SectionCard title="Controlos internos associados" icon={ShieldCheck}>
            {internalControls.length > 0 ? (
              <div className="space-y-3">
                {internalControls.map((link) => (
                  <div key={link.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-950">
                          {link.internal_control_code ? `${link.internal_control_code} - ${link.internal_control_title || ""}` : link.internal_control}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{link.internal_control_domain || "Sem dominio"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">{link.purpose_display || link.purpose}</Badge>
                        <Badge className={mappingTone(link.validation_status)}>{link.validation_status_display || statusLabel(link.validation_status)}</Badge>
                      </div>
                    </div>
                    {link.rationale && <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">{link.rationale}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Ainda nao existem controlos internos associados a este documento." />
            )}
          </SectionCard>

          <TraceabilitySummaryPanel traceability={traceability} officialScore={officialScore} simulationScore={simulationScore} />
        </main>

        <aside className="space-y-6">
          <DocumentHierarchyPanel document={document} childrenDocuments={children} />

          <SectionCard title="Links rapidos" icon={ExternalLink}>
            <div className="space-y-3">
              <a href={`/api/governance/traceability/governance-document/${document.id}/?include_scores=true&include_gaps=true&include_evidence=true`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Traceability API
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href={`/api/governance/compliance-propagation/governance-document/${document.id}/?mode=official&include_details=true&include_gaps=true`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Compliance score API
                <ExternalLink className="h-4 w-4" />
              </a>
              <Link to={`/governance/mapping-review?document=${document.id}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Mapping Review
                <GitBranch className="h-4 w-4" />
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Resumo tecnico" icon={BookOpen}>
            <div className="space-y-3 text-sm font-semibold text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>Controlos internos</span>
                <strong className="text-slate-950">{internalControls.length}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Frameworks impactadas</span>
                <strong className="text-slate-950">{traceCounts.frameworks}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Evidencias</span>
                <strong className="text-slate-950">{traceCounts.evidence}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Secoes</span>
                <strong className="text-slate-950">{sections.length}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Runbook steps</span>
                <strong className="text-slate-950">{runbookSteps.length}</strong>
              </div>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
