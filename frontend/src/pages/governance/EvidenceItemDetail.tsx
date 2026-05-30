/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
  Timer,
  Workflow,
  XCircle,
} from "lucide-react";
import { mappingReviewApi, type TraceabilityPayload } from "@/lib/mappingReviewApi";
import {
  GovernanceBadge as Badge,
  GovernanceEmptyState as EmptyState,
  GovernanceInfoCard as InfoCard,
  GovernanceSectionCard as SectionCard,
} from "@/components/governance/GovernancePrimitives";
import { API_BASE } from "@/lib/api";

type EvidenceRecord = Record<string, any>;
type EvidenceWorkspaceTab = "overview" | "links" | "impact" | "scoring" | "audit";

function asArray<T = any>(payload: any): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.results || [];
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-PT");
}

function compactText(value?: string | null, fallback = "-") {
  return value && value.trim() ? value : fallback;
}

function absoluteFileUrl(value?: string | null) {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  return `${API_BASE}${value.startsWith("/") ? value : `/${value}`}`;
}

function formatBytes(value?: number | string | null) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortHash(value?: string | null) {
  if (!value) return "-";
  return value.length > 18 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
}

function evidenceTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    report: "Relatório",
    screenshot: "Captura de ecrã",
    ticket: "Ticket",
    log: "Log",
    audit_report: "Relatório de auditoria",
    configuration_export: "Exportação de configuração",
    meeting_minutes: "Ata de reunião",
    approval_record: "Registo de aprovação",
    vulnerability_scan: "Análise de vulnerabilidades",
    siem_alert: "Alerta SIEM",
    manual_attestation: "Declaração manual",
    other: "Outro",
  };
  return labels[type || ""] || type || "Evidência";
}

function evidenceTypeTone(type?: string) {
  if (type === "audit_report" || type === "report") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "configuration_export" || type === "log" || type === "siem_alert") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  if (type === "vulnerability_scan") return "border-red-100 bg-red-50 text-red-700";
  if (type === "approval_record" || type === "manual_attestation") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (type === "ticket") return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    pending_review: "Pendente de revisão",
    approved: "Aprovada",
    valid: "Válida",
    expired: "Expirada",
    rejected: "Rejeitada",
    deprecated: "Descontinuada",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusTone(status?: string) {
  if (status === "valid" || status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired" || status === "rejected" || status === "deprecated") return "border-red-100 bg-red-50 text-red-700";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function targetTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    mechanism: "Mecanismo",
    internal_control: "Controlo interno",
    governance_document: "Documento de governação",
    runbook_step: "Passo de runbook",
    framework_control: "Controlo externo",
    policy: "Política",
    risk: "Risco",
    asset: "Ativo",
    vulnerability: "Vulnerabilidade",
    finding: "Constatação",
    improvement_action: "Ação de melhoria",
  };
  return labels[type || ""] || type || "Alvo";
}

function entityLabel(item: any) {
  if (!item) return "-";
  if (item.framework_code && item.code && item.title) return `${item.framework_code}:${item.code} - ${item.title}`;
  if (item.code && item.title) return `${item.code} - ${item.title}`;
  if (item.name && item.version) return `${item.name} ${item.version}`;
  return item.title || item.name || item.code || item.reference || item.id || "-";
}

function isExpired(evidence: EvidenceRecord) {
  if (evidence.is_expired !== undefined) return Boolean(evidence.is_expired);
  if (!evidence.valid_until) return false;
  const validUntil = new Date(evidence.valid_until);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return validUntil < today;
}

function targetUrl(link: any) {
  const id = link.target_id;
  if (!id) return undefined;
  if (link.target_type === "governance_document") return `/governance/documents/${id}`;
  if (link.target_type === "policy") return `/governance/policies/${id}`;
  if (link.target_type === "asset") return `/assets/inventory/${id}`;
  if (link.target_type === "risk") return `/risks/${id}`;
  return undefined;
}

function RelationshipList({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
        <Badge className="border-slate-200 bg-white text-slate-500">{items.length}</Badge>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.slice(0, 7).map((item, index) => (
            <div key={item.id || `${title}-${index}`} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
              <p className="text-sm font-bold text-slate-950">{entityLabel(item)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {item.status || item.document_type || item.mechanism_type || item.control_domain || item.framework_name || "Relacionado"}
              </p>
            </div>
          ))}
          {items.length > 7 && <p className="text-xs font-semibold text-slate-500">+{items.length - 7} adicionais via API.</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function EvidenceLinksPanel({
  links,
  actionLoading,
  mappingReviewHref = "/governance/mapping-review",
  onApprove,
  onReject,
  onDeprecated,
}: {
  links: any[];
  actionLoading: string | null;
  mappingReviewHref?: string;
  onApprove: (link: any) => void;
  onReject: (link: any) => void;
  onDeprecated: (link: any) => void;
}) {
  return (
    <SectionCard
      title="Ligações de evidência"
      icon={Link2}
      action={(
        <Link to={mappingReviewHref} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
          <GitBranch className="h-4 w-4" />
          Revisão de mapeamentos
        </Link>
      )}
    >
      {links.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Alvo</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Relação</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Estado</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Origem</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Justificação</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Confiança</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Validado</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {links.map((link) => {
                const url = targetUrl(link);
                return (
                  <tr key={link.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{targetTypeLabel(link.target_type)}</p>
                      {url ? (
                        <Link to={url} className="mt-1 block font-bold text-slate-950 hover:text-indigo-700">{link.target_label || link.target_id}</Link>
                      ) : (
                        <p className="mt-1 font-bold text-slate-950">{link.target_label || link.target_id}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{link.link_type_display || link.link_type}</td>
                    <td className="px-4 py-3">
                      <Badge className={statusTone(link.validation_status)}>{link.validation_status_display || statusLabel(link.validation_status)}</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{link.mapping_source_display || link.mapping_source}</td>
                    <td className="px-4 py-3 text-xs font-semibold leading-relaxed text-slate-600">{link.rationale || "-"}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{link.confidence_score ?? 0}%</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500">{formatDateTime(link.validated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={Boolean(actionLoading)}
                          onClick={() => onApprove(link)}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 disabled:opacity-50"
                        >
                          {actionLoading === `approve-${link.id}` ? "..." : "Aprovar"}
                        </button>
                        <button
                          disabled={Boolean(actionLoading)}
                          onClick={() => onReject(link)}
                          className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-red-700 disabled:opacity-50"
                        >
                          {actionLoading === `reject-${link.id}` ? "..." : "Rejeitar"}
                        </button>
                        <button
                          disabled={Boolean(actionLoading)}
                          onClick={() => onDeprecated(link)}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 disabled:opacity-50"
                        >
                          {actionLoading === `deprecated-${link.id}` ? "..." : "Descontinuar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Esta evidência ainda não tem ligações associadas." />
      )}
    </SectionCard>
  );
}

function EvidenceImpactPanel({ impact, traceability }: { impact: any; traceability: TraceabilityPayload | null }) {
  const relationships = traceability?.relationships || {};
  const mechanisms = asArray(impact?.mechanisms).concat(asArray(relationships.mechanisms));
  const internalControls = asArray(impact?.internal_controls)
    .concat(asArray(relationships.internal_controls_direct))
    .concat(asArray(relationships.internal_controls_indirect));
  const documents = asArray(impact?.governance_documents).concat(asArray(relationships.governance_documents));
  const policies = asArray(impact?.policies).concat(asArray(relationships.policies));
  const frameworks = asArray(impact?.frameworks).concat(asArray(relationships.frameworks));
  const frameworkControls = asArray(impact?.framework_controls).concat(asArray(relationships.framework_controls));
  const estimatedImpact = relationships.estimated_score_impact || {};

  return (
    <SectionCard title="Impacto e rastreabilidade" icon={Network}>
      <div className="grid gap-4 lg:grid-cols-3">
        <RelationshipList title="Mecanismos" items={mechanisms} empty="Sem mecanismos suportados." />
        <RelationshipList title="Controlos internos" items={internalControls} empty="Sem controlos internos impactados." />
        <RelationshipList title="Documentos" items={documents} empty="Sem documentos relacionados." />
        <RelationshipList title="Políticas" items={policies} empty="Sem políticas relacionadas." />
        <RelationshipList title="Controlos externos" items={frameworkControls} empty="Sem controlos externos impactados." />
        <RelationshipList title="Frameworks" items={frameworks} empty="Sem frameworks impactadas." />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto mechanisms</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{estimatedImpact.mechanisms ?? mechanisms.length}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto internal controls</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{estimatedImpact.internal_controls ?? internalControls.length}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto framework controls</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{estimatedImpact.framework_controls ?? frameworkControls.length}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Impacto frameworks</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{estimatedImpact.frameworks ?? frameworks.length}</p>
        </div>
      </div>

      {(traceability?.gaps || []).length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Gaps</h3>
          <div className="mt-3 space-y-2">
            {(traceability?.gaps || []).slice(0, 8).map((gap: any, index: number) => (
              <div key={`${gap.type || gap.gap_type || "gap"}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-amber-900">{gap.type || gap.gap_type || "Gap"}</p>
                <p className="mt-1 text-sm font-semibold text-amber-800">{gap.description || gap.recommendation || "Sem descrição."}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export default function EvidenceItemDetail() {
  const { id } = useParams();
  const [evidence, setEvidence] = useState<EvidenceRecord | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [impact, setImpact] = useState<any | null>(null);
  const [traceability, setTraceability] = useState<TraceabilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<EvidenceWorkspaceTab>("overview");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const loadOptional = async <T,>(request: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await Promise.race([
            request,
            new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), 4500)),
          ]);
        } catch {
          return fallback;
        }
      };

      const evidencePayload = await mappingReviewApi.getEvidenceItem(id);
      const [linksPayload, impactPayload, traceabilityPayload] = await Promise.all([
        loadOptional(mappingReviewApi.getEvidenceItemLinks(id), []),
        loadOptional(mappingReviewApi.getEvidenceItemImpact(id), null),
        loadOptional(mappingReviewApi.getEvidenceItemTraceability(id, {
          mode: "official",
          include_inactive: true,
          include_evidence: true,
          include_gaps: true,
          include_scores: true,
          max_depth: 3,
        }), null),
      ]);
      setEvidence(evidencePayload);
      setLinks(asArray(linksPayload));
      setImpact(impactPayload);
      setTraceability(traceabilityPayload);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar a evidência.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const warnings = useMemo(() => {
    if (!evidence) return [];
    const items: Array<{ type: string; text: string }> = [];
    if (isExpired(evidence) || evidence.status === "expired") items.push({ type: "expired", text: "Esta evidência está expirada e não deve contar para o score oficial." });
    if (evidence.status === "rejected" || evidence.status === "deprecated") items.push({ type: "inactive", text: "O estado da evidência impede a sua utilização como evidência oficial." });
    const draftLinks = links.filter((link) => link.validation_status === "draft");
    const pendingLinks = links.filter((link) => link.validation_status === "pending_review");
    const inactiveLinks = links.filter((link) => ["rejected", "deprecated"].includes(link.validation_status));
    if (draftLinks.length > 0) items.push({ type: "draft", text: `${draftLinks.length} ligação(ões) em rascunho ainda não contam oficialmente.` });
    if (pendingLinks.length > 0) items.push({ type: "pending", text: `${pendingLinks.length} ligação(ões) pendentes de revisão apenas contam em simulação.` });
    if (inactiveLinks.length > 0) items.push({ type: "inactive_links", text: `${inactiveLinks.length} ligação(ões) rejeitadas ou descontinuadas estão inativas.` });
    if (!evidence.source && !evidence.external_reference && !evidence.file) items.push({ type: "reference", text: "A evidência não tem fonte, referência externa ou ficheiro associado." });
    return items;
  }, [evidence, links]);

  const handleApprove = async (link: any) => {
    if (!window.confirm("Aprovar esta ligação de evidência?")) return;
    setActionLoading(`approve-${link.id}`);
    try {
      await mappingReviewApi.approveEvidenceLink(link.id);
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (link: any) => {
    const rationale = window.prompt("Indica a justificação para rejeitar esta ligação:");
    if (!rationale?.trim()) return;
    setActionLoading(`reject-${link.id}`);
    try {
      await mappingReviewApi.rejectEvidenceLink(link.id, rationale.trim());
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeprecated = async (link: any) => {
    if (!window.confirm("Marcar esta ligação como descontinuada?")) return;
    setActionLoading(`deprecated-${link.id}`);
    try {
      await mappingReviewApi.markEvidenceLinkDeprecated(link.id);
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const counts = useMemo(() => {
    const relationships = traceability?.relationships || {};
    const impactPayload = impact || {};
    return {
      links: links.length,
      mechanisms: asArray(impactPayload.mechanisms).length || asArray(relationships.mechanisms).length,
      internalControls: asArray(impactPayload.internal_controls).length
        || (asArray(relationships.internal_controls_direct).length + asArray(relationships.internal_controls_indirect).length),
      frameworks: asArray(impactPayload.frameworks).length || asArray(relationships.frameworks).length,
    };
  }, [impact, links.length, traceability]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-5 text-sm font-bold text-slate-500 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-700" />
          A carregar evidência...
        </div>
      </div>
    );
  }

  if (error || !evidence) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 rounded-2xl border border-red-100 bg-white p-8 shadow-sm">
        <AlertTriangle className="h-8 w-8 text-red-600" />
        <h1 className="text-2xl font-bold text-slate-950">Evidência indisponível</h1>
        <p className="text-sm font-semibold text-slate-500">{error || "Não foi encontrada evidência para o ID indicado."}</p>
        <Link to="/governance/evidence" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
          <ArrowLeft className="h-4 w-4" />
          Voltar às evidências
        </Link>
      </div>
    );
  }

  const fileUrl = absoluteFileUrl(evidence.file);

  const workspaceTabs: Array<{
    id: EvidenceWorkspaceTab;
    label: string;
    description: string;
    badge: string;
    icon: any;
  }> = [
    {
      id: "overview",
      label: "Visao geral",
      description: "Metadados, origem, validade e referência da evidência.",
      badge: statusLabel(evidence.status),
      icon: FileCheck2,
    },
    {
      id: "links",
      label: "Ligacoes",
      description: "Entidades onde esta evidência é usada.",
      badge: `${counts.links} links`,
      icon: Link2,
    },
    {
      id: "impact",
      label: "Impacto",
      description: "Mecanismos, controlos, políticas e frameworks impactadas.",
      badge: `${counts.frameworks} frameworks`,
      icon: Network,
    },
    {
      id: "scoring",
      label: "Scoring",
      description: "Elegibilidade, expiracao e estado para conformidade.",
      badge: evidence.is_score_eligible ? "elegível" : "não elegível",
      icon: Timer,
    },
    {
      id: "audit",
      label: "Auditoria",
      description: "Avisos, detalhes técnicos e atalhos API.",
      badge: `${warnings.length} avisos`,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <Link to="/governance/evidence" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar às evidências
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Badge className={evidenceTypeTone(evidence.evidence_type)}>{evidenceTypeLabel(evidence.evidence_type)}</Badge>
              <Badge className={statusTone(evidence.status)}>{statusLabel(evidence.status)}</Badge>
              {isExpired(evidence) && <Badge className="border-red-100 bg-red-50 text-red-700">Expirada</Badge>}
              {!evidence.is_active && <Badge className="border-slate-200 bg-slate-50 text-slate-500">Inativa</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{evidence.title}</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {compactText(evidence.description, "Evidência reutilizável criada na camada transversal.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link to="/governance/evidence/wizard" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <FilePlus2 className="h-4 w-4" />
              Nova evidência
            </Link>
            <Link to={`/governance/mapping-review?evidence=${evidence.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <GitBranch className="h-4 w-4" />
              Revisão de mapeamentos
            </Link>
          </div>
        </div>
      </header>

      {warnings.length > 0 && (
        <section className="space-y-2">
          {warnings.map((warning) => (
            <div key={warning.type} className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {warning.text}
            </div>
          ))}
        </section>
      )}

      <nav className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm lg:grid-cols-5" aria-label="Workspace da evidência">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeWorkspaceTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveWorkspaceTab(tab.id)}
              className={`rounded-xl border p-4 text-left transition ${
                selected ? "border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-indigo-100 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <Icon className={`h-5 w-5 ${selected ? "text-indigo-700" : "text-slate-400"}`} />
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  selected ? "border-indigo-100 bg-white text-indigo-700" : "border-slate-200 bg-white text-slate-500"
                }`}>
                  {tab.badge}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold">{tab.label}</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{tab.description}</p>
            </button>
          );
        })}
      </nav>

      {activeWorkspaceTab === "overview" && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard icon={Link2} label="Ligacoes" value={counts.links} tone="text-indigo-700" />
            <InfoCard icon={Workflow} label="Mecanismos" value={counts.mechanisms} tone="text-cyan-600" />
            <InfoCard icon={ShieldCheck} label="Controlos internos" value={counts.internalControls} tone="text-emerald-600" />
            <InfoCard icon={Network} label="Frameworks" value={counts.frameworks} tone="text-amber-600" />
          </section>

          <SectionCard title="Dados gerais" icon={FileCheck2}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fonte</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{evidence.source || "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Referencia externa</p>
                <p className="mt-1 break-all text-sm font-bold text-slate-900">{evidence.external_reference || "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recolhida em</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(evidence.collected_at)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Válida até</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDate(evidence.valid_until)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Confianca</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, Number(evidence.confidence_level || 0)))}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-900">{evidence.confidence_level ?? 0}%</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Responsável</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{evidence.owner || "-"}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Descricao</p>
              <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700">
                {compactText(evidence.description, "Sem descrição detalhada.")}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ficheiro</p>
              {evidence.file ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0 space-y-2">
                    <p className="break-all text-sm font-bold text-slate-950">
                      {evidence.original_filename || evidence.file}
                    </p>
                    <div className="grid gap-2 text-xs font-semibold text-slate-500 md:grid-cols-3">
                      <span>Tamanho: {formatBytes(evidence.file_size)}</span>
                      <span>MIME: {evidence.mime_type || "-"}</span>
                      <span>Upload: {formatDateTime(evidence.uploaded_at)}</span>
                    </div>
                    {evidence.sha256_hash && (
                      <p className="break-all rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-indigo-700">
                        SHA-256: {evidence.sha256_hash}
                      </p>
                    )}
                  </div>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir ficheiro
                  </a>
                </div>
              ) : (
                <p className="mt-1 text-sm font-semibold text-slate-500">Sem ficheiro associado. A evidência usa fonte ou referência externa.</p>
              )}
            </div>
          </SectionCard>
        </>
      )}

      {activeWorkspaceTab === "links" && (
          <EvidenceLinksPanel
            links={links}
            actionLoading={actionLoading}
            mappingReviewHref={`/governance/mapping-review?evidence=${evidence.id}`}
            onApprove={handleApprove}
            onReject={handleReject}
            onDeprecated={handleDeprecated}
          />
      )}

      {activeWorkspaceTab === "impact" && (
          <EvidenceImpactPanel impact={impact} traceability={traceability} />
      )}

      {activeWorkspaceTab === "scoring" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <SectionCard title="Estado para scoring" icon={Timer}>
            <div className="space-y-3 text-sm font-semibold text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>Expirada</span>
                <Badge className={isExpired(evidence) ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}>
                  {isExpired(evidence) ? "Sim" : "Não"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Elegivel para score</span>
                <Badge className={evidence.is_score_eligible ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                  {evidence.is_score_eligible ? "Sim" : "Não"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Ativa</span>
                {evidence.is_active ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Links ativos</span>
                <strong className="text-slate-950">{evidence.active_links_count ?? links.filter((link) => !["rejected", "deprecated"].includes(link.validation_status)).length}</strong>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Resumo técnico" icon={Layers3}>
            <div className="space-y-3 text-sm font-semibold text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>Tipo de evidência</span>
                <strong className="text-right text-slate-950">{evidence.evidence_type || "-"}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Estado</span>
                <strong className="text-right text-slate-950">{evidence.status || "-"}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Criada</span>
                <strong className="text-right text-slate-950">{formatDateTime(evidence.created_at)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Updated</span>
                <strong className="text-right text-slate-950">{formatDateTime(evidence.updated_at)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Ficheiro original</span>
                <strong className="max-w-[220px] truncate text-right text-slate-950">{evidence.original_filename || "-"}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Tamanho</span>
                <strong className="text-right text-slate-950">{formatBytes(evidence.file_size)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Hash SHA-256</span>
                <strong className="text-right text-slate-950" title={evidence.sha256_hash || ""}>{shortHash(evidence.sha256_hash)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Carregado por</span>
                <strong className="text-right text-slate-950">{evidence.uploaded_by_username || "-"}</strong>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {activeWorkspaceTab === "audit" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <SectionCard title="Avisos auditaveis" icon={AlertTriangle}>
            {warnings.length > 0 ? (
              <div className="space-y-3">
                {warnings.map((warning) => (
                  <div key={warning.type} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                    {warning.text}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Sem avisos relevantes para esta evidência." />
            )}
          </SectionCard>

          <SectionCard title="Links rapidos" icon={ExternalLink}>
            <div className="space-y-3">
              {evidence.file && (
                <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                  Abrir ficheiro físico
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <a href={`/api/governance/evidence-items/${evidence.id}/links/`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                API de ligações de evidência
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href={`/api/governance/evidence-items/${evidence.id}/impact/`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Impact API
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href={`/api/governance/traceability/evidence-item/${evidence.id}/?include_scores=true&include_gaps=true&include_evidence=true`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Traceability API
                <ExternalLink className="h-4 w-4" />
              </a>
              <Link to={`/governance/mapping-review?evidence=${evidence.id}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                Revisão de mapeamentos
                <GitBranch className="h-4 w-4" />
              </Link>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
