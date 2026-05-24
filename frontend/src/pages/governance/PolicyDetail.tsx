/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileCheck2,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
  X,
} from "lucide-react";
import {
  governanceApi,
  type DecisionRecord,
  type GovernanceAction,
  type GovernanceActionPriority,
  type GovernanceActionStatus,
  type GovernanceActionType,
  type GovernanceException,
} from "@/lib/governanceApi";
import { mappingReviewApi, type TraceabilityPayload } from "@/lib/mappingReviewApi";
import { chatApi, type AssistantHistoryEntry, type AssistantResponse } from "@/lib/chatApi";

type PolicyRecord = Record<string, any>;
type PolicyWorkspaceTab = "redaction" | "onboarding" | "traceability" | "assistant" | "dossier";

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    active: "Ativa",
    review: "Em revisao",
    obsolete: "Obsoleta",
  };
  return labels[status || ""] || status || "Sem estado";
}

function statusTone(status?: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "obsolete") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

const actionTypeLabels: Record<GovernanceActionType, string> = {
  correct_policy: "Corrigir politica",
  map_control: "Mapear controlo",
  implement_mechanism: "Implementar mecanismo",
  collect_evidence: "Recolher evidencia",
  review_document: "Rever documento",
  approve_mapping: "Aprovar mapping",
  update_framework: "Atualizar framework",
  review_exception: "Rever excecao",
  review_score: "Rever score",
  other: "Outra acao",
};

const actionPriorityLabels: Record<GovernanceActionPriority, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  critical: "Critica",
};

const actionStatusLabels: Record<GovernanceActionStatus, string> = {
  open: "Aberta",
  in_progress: "Em curso",
  blocked: "Bloqueada",
  done: "Concluida",
  deferred: "Adiada",
  cancelled: "Cancelada",
};

const actionPriorityTone: Record<GovernanceActionPriority, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

const actionStatusTone: Record<GovernanceActionStatus, string> = {
  open: "border-indigo-200 bg-indigo-50 text-indigo-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  blocked: "border-red-200 bg-red-50 text-red-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  deferred: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

function isActionClosed(action: GovernanceAction) {
  return action.status === "done" || action.status === "cancelled";
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueLabel(value?: string | null) {
  const days = daysUntil(value);
  if (days === null) return "Sem prazo";
  if (days < 0) return `${Math.abs(days)} dia(s) em atraso`;
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanha";
  return `Daqui a ${days} dias`;
}

function actionTargetLabel(action: GovernanceAction) {
  if (action.target_label) return action.target_label;
  if (action.target_type === "policy") return "Politica";
  if (action.target_type === "internal_control") return "Controlo interno";
  if (action.target_type === "mechanism") return "Mecanismo";
  if (action.target_type === "governance_document") return "Documento";
  if (action.target_type === "evidence_item") return "Evidencia";
  return action.target_type || "Contexto da politica";
}

function exceptionTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    policy_exception: "Exceção a política",
    control_exception: "Exceção a controlo",
    risk_acceptance: "Aceitação de risco",
    implementation_delay: "Adiamento",
    compensating_control: "Controlo compensatório",
  };
  return labels[type || ""] || type || "Exceção";
}

function exceptionStatusTone(status?: string) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "expired") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "rejected" || status === "revoked") return "border-red-100 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function unwrapList<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function documentTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    policy: "Politica",
    standard: "Norma",
    procedure: "Procedimento",
    guideline: "Guideline",
    technical_regulation: "Regulamento tecnico",
    runbook: "Runbook",
  };
  return labels[type || ""] || type || "Documento";
}

function documentStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    under_review: "Em revisao",
    approved: "Aprovado",
    published: "Publicado",
    deprecated: "Deprecated",
    archived: "Arquivado",
  };
  return labels[status || ""] || status || "Sem estado";
}

function documentStatusTone(status?: string) {
  if (status === "approved" || status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "under_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "deprecated" || status === "archived") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function sortByDocumentAndOrder(a: any, b: any) {
  const docOrder = Number(a.document_order ?? 0) - Number(b.document_order ?? 0);
  if (docOrder !== 0) return docOrder;
  const orderA = Number(a.order ?? a.section_number ?? 0);
  const orderB = Number(b.order ?? b.section_number ?? 0);
  if (orderA !== orderB) return orderA - orderB;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function buildSectionTree(items: any[]) {
  const cloned = items.map((item) => ({ ...item, subsections: [] as any[] }));
  const byId = new Map(cloned.map((item) => [String(item.id), item]));
  const roots: any[] = [];

  cloned.forEach((item) => {
    const parentId = item.parent_section || item.parent_section_id;
    if (parentId && byId.has(String(parentId))) {
      byId.get(String(parentId)).subsections.push(item);
    } else {
      roots.push(item);
    }
  });

  const sortTree = (nodes: any[]) => {
    nodes.sort(sortByDocumentAndOrder);
    nodes.forEach((node) => sortTree(node.subsections || []));
    return nodes;
  };

  return sortTree(roots);
}

function flattenSections(items: any[]): any[] {
  return items.flatMap((section) => [section, ...flattenSections(section.subsections || [])]);
}

function sectionAnchor(section: any) {
  return `policy-section-${String(section.id || section.section_number || section.order || "").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function buildDocumentTree(documents: any[]) {
  const cloned = documents.map((document) => ({ ...document, children: [] as any[] }));
  const byId = new Map(cloned.map((document) => [String(document.id), document]));
  const roots: any[] = [];

  cloned.forEach((document) => {
    const parentId = document.parent_document;
    if (parentId && byId.has(String(parentId))) {
      byId.get(String(parentId)).children.push(document);
    } else {
      roots.push(document);
    }
  });

  const sortTree = (nodes: any[]) => {
    nodes.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    nodes.forEach((node) => sortTree(node.children || []));
    return nodes;
  };

  return sortTree(roots);
}

function extractBulletItems(sections: any[], titleMatch: string) {
  const flatten = (items: any[]): any[] =>
    items.flatMap((section) => [section, ...flatten(section.subsections || [])]);
  const section = flatten(sections).find((item) =>
    String(item.title || "").toLowerCase().includes(titleMatch.toLowerCase())
  );

  if (!section?.content) return [];
  return String(section.content)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function classifyMechanismType(name: string) {
  const text = name.toLowerCase();
  if (["mfa", "scanner", "backup", "config", "monitor", "siem", "cctv", "video", "videovigil", "camara", "camera", "alarme", "sensor"].some((term) => text.includes(term))) return "technical";
  if (["contrato", "clausula", "fornecedor", "supplier"].some((term) => text.includes(term))) return "contractual";
  if (["comite", "owner", "raci", "calendario", "revisao"].some((term) => text.includes(term))) return "organizational";
  return "procedural";
}

function reusableMechanismType(name: string) {
  const type = classifyMechanismType(name);
  if (type === "technical") return "Técnico";
  if (type === "contractual") return "Fornecedor";
  if (type === "organizational") return "Pessoas";
  return "Processo";
}

function truncate(value: string, max = 240) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function assistantSourceLabel(source: any) {
  if (source?.is_internal_governance) return "Fonte interna";
  if (source?.is_external_framework) return "Framework externa";
  if (source?.governance_layer) return source.governance_layer;
  return source?.source_label || source?.source_type || "Fonte";
}

function historyEntryToAssistantResponse(entry: AssistantHistoryEntry): AssistantResponse {
  return {
    task_type: entry.task_type || "executive_advisory",
    model_used: entry.model_used || "historico",
    used_rag: Boolean(entry.used_rag),
    confidence: typeof entry.confidence === "number" ? entry.confidence : 0,
    response: entry.answer || "",
    sources: entry.sources_json || [],
  };
}

function normalizeForMatch(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const evidenceTypeOptions = [
  { value: "report", label: "Relatorio" },
  { value: "screenshot", label: "Fotografia / screenshot" },
  { value: "ticket", label: "Ticket" },
  { value: "log", label: "Log" },
  { value: "audit_report", label: "Relatorio de auditoria" },
  { value: "configuration_export", label: "Exportacao de configuracao" },
  { value: "meeting_minutes", label: "Ata" },
  { value: "approval_record", label: "Registo de aprovacao" },
  { value: "vulnerability_scan", label: "Scan de vulnerabilidades" },
  { value: "siem_alert", label: "Alerta SIEM" },
  { value: "manual_attestation", label: "Atestacao manual" },
  { value: "other", label: "Outra" },
];

const evidenceStatusOptions = [
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pendente de revisao" },
  { value: "valid", label: "Valida" },
];

const STOP_WORDS = new Set([
  "para", "com", "sem", "uma", "por", "dos", "das", "the", "and", "that", "este", "esta", "control", "controlo",
  "security", "seguranca", "implementacao", "mecanismo", "sistema", "gestao", "management",
]);

function importantWords(value: string) {
  return Array.from(
    new Set(
      normalizeForMatch(value)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    )
  );
}

const IMPACT_PROFILES = [
  {
    id: "physical_monitoring",
    label: "monitorizacao fisica",
    mechanismTerms: ["videovigilancia", "video", "cctv", "camara", "camera", "alarme", "sensor", "monitorizacao fisica"],
    controlTerms: ["fisic", "physical", "instalac", "premises", "facility", "facilities", "ambiente fisico", "perimetro", "seguranca fisica"],
    rationale: "Relacionado com protecao e monitorizacao fisica das instalacoes.",
  },
  {
    id: "access",
    label: "controlo de acessos",
    mechanismTerms: ["mfa", "acesso", "access", "identidade", "identity", "privileg", "credencial"],
    controlTerms: ["acesso", "access", "identity", "identidade", "authentication", "autenticacao", "privileg"],
    rationale: "Relacionado com gestao de acessos e identidades.",
  },
  {
    id: "backup",
    label: "continuidade e recuperacao",
    mechanismTerms: ["backup", "restauro", "restore", "recovery", "continuidade"],
    controlTerms: ["backup", "restore", "recovery", "continuidade", "recuperacao", "resilience"],
    rationale: "Relacionado com continuidade, backup ou recuperacao.",
  },
  {
    id: "vulnerability",
    label: "gestao de vulnerabilidades",
    mechanismTerms: ["vulnerab", "patch", "scan", "scanner", "correcao", "remediacao"],
    controlTerms: ["vulnerab", "patch", "scan", "correcao", "remediation", "exposure"],
    rationale: "Relacionado com deteccao e tratamento de vulnerabilidades.",
  },
  {
    id: "incident",
    label: "resposta a incidentes",
    mechanismTerms: ["incidente", "incident", "playbook", "soc", "triagem", "resposta"],
    controlTerms: ["incident", "incidente", "response", "resposta", "detect", "deteccao"],
    rationale: "Relacionado com deteccao, resposta ou aprendizagem pos-incidente.",
  },
  {
    id: "supplier",
    label: "terceiros e fornecedores",
    mechanismTerms: ["fornecedor", "supplier", "third", "terceir", "contrato", "clausula"],
    controlTerms: ["fornecedor", "supplier", "third", "terceir", "contract", "contrat"],
    rationale: "Relacionado com controlo de fornecedores e terceiros.",
  },
];

function textHasAny(text: string, terms: string[]) {
  const source = normalizeForMatch(text);
  return terms.some((term) => source.includes(normalizeForMatch(term)));
}

function selectedControlId(policyControl: any) {
  return String(policyControl?.control || policyControl?.control_details?.id || "");
}

function internalControlIdFromPolicyMapping(mapping: any) {
  return String(mapping?.targetId || mapping?.raw?.internal_control || mapping?.internal_control || "");
}

function internalControlContextFromPolicyMapping(mapping: any) {
  const raw = mapping?.raw || {};
  const internalControlId = internalControlIdFromPolicyMapping(mapping);
  return {
    id: mapping?.id,
    control: internalControlId,
    control_details: {
      id: internalControlId,
      code: raw.internal_control_code || mapping?.targetLabel?.split(" - ")?.[0],
      title: raw.internal_control_title || mapping?.targetLabel,
      description: raw.internal_control_description || mapping?.rationale || "",
      control_domain: raw.internal_control_domain,
    },
  };
}

function controlSearchText(control: any) {
  return [
    control?.code,
    control?.title,
    control?.description,
    control?.implementation_guidance,
    control?.framework_name,
    control?.framework_code,
  ].filter(Boolean).join(" ");
}

function profileMatches(mechanismName: string, context: string) {
  return IMPACT_PROFILES.filter((profile) =>
    textHasAny(mechanismName, profile.mechanismTerms) ||
    textHasAny(context, profile.controlTerms)
  );
}

function scoreReusableMechanism(mechanism: any, mechanismName: string, selectedPolicyControl: any) {
  const mechanismText = [mechanism?.title, mechanism?.description, mechanism?.mechanism_type].filter(Boolean).join(" ");
  const normalizedMechanismText = normalizeForMatch(mechanismText);
  const normalizedName = normalizeForMatch(mechanismName);
  const selectedContext = [
    selectedPolicyControl?.control_details?.code,
    selectedPolicyControl?.control_details?.title,
    selectedPolicyControl?.control_details?.description,
  ].filter(Boolean).join(" ");
  const profiles = profileMatches(mechanismName, selectedContext);
  let score = 0;

  if (normalizedName && (normalizedMechanismText === normalizedName || normalizedMechanismText.includes(normalizedName) || normalizedName.includes(normalizedMechanismText))) {
    score += 80;
  }

  for (const word of importantWords(mechanismName)) {
    if (normalizedMechanismText.includes(word)) score += 8;
  }

  for (const profile of profiles) {
    if (textHasAny(mechanismText, [...profile.mechanismTerms, ...profile.controlTerms])) score += 25;
  }

  return score;
}

function findReusableMechanismMatch(mechanismName: string, selectedPolicyControl: any, mechanisms: any[]) {
  return mechanisms
    .map((mechanism) => ({ mechanism, score: scoreReusableMechanism(mechanism, mechanismName, selectedPolicyControl) }))
    .filter((item) => item.score >= 25)
    .sort((a, b) => b.score - a.score)[0]?.mechanism || null;
}

function buildImpactCandidates({
  mechanismName,
  selectedPolicyControl,
  controlsCatalog,
  globalMechanisms,
  globalControlMechanisms,
}: {
  mechanismName: string;
  selectedPolicyControl: any;
  controlsCatalog: any[];
  globalMechanisms: any[];
  globalControlMechanisms: any[];
}) {
  const selectedControl = selectedPolicyControl?.control_details || {};
  const currentControlId = selectedControlId(selectedPolicyControl);
  const selectedContext = [
    selectedControl.code,
    selectedControl.title,
    selectedControl.description,
    selectedControl.framework_name,
  ].filter(Boolean).join(" ");
  const profiles = profileMatches(mechanismName, selectedContext);
  const words = importantWords(`${mechanismName} ${selectedControl.title || ""}`);
  const controlsById = new Map<string, any>();
  controlsCatalog.forEach((control) => controlsById.set(String(control.id), control));
  if (currentControlId && !controlsById.has(currentControlId)) {
    controlsById.set(currentControlId, { ...selectedControl, id: currentControlId });
  }

  const matchingMechanismIds = new Set(
    globalMechanisms
      .filter((mechanism) => scoreReusableMechanism(mechanism, mechanismName, selectedPolicyControl) >= 25)
      .map((mechanism) => String(mechanism.id))
  );

  const candidates = new Map<string, { control: any; score: number; reasons: string[]; fromLibrary: boolean; defaultSelected: boolean }>();

  const addCandidate = (control: any, score: number, reasons: string[], fromLibrary = false) => {
    if (!control?.id) return;
    const id = String(control.id);
    const existing = candidates.get(id);
    const mergedReasons = Array.from(new Set([...(existing?.reasons || []), ...reasons])).slice(0, 3);
    const isCurrent = id === currentControlId;
    const next = {
      control,
      score: Math.max(existing?.score || 0, score),
      reasons: mergedReasons,
      fromLibrary: Boolean(existing?.fromLibrary || fromLibrary),
      defaultSelected: Boolean(existing?.defaultSelected || isCurrent || fromLibrary || (score >= 30 && profiles.length > 0)),
    };
    candidates.set(id, next);
  };

  if (currentControlId) {
    addCandidate(
      controlsById.get(currentControlId) || { ...selectedControl, id: currentControlId },
      100,
      ["Controlo base selecionado pelo CISO."],
      true
    );
  }

  globalControlMechanisms.forEach((relation) => {
    if (!matchingMechanismIds.has(String(relation.mechanism))) return;
    const control = controlsById.get(String(relation.control)) || {
      id: relation.control,
      code: relation.control_code,
      title: relation.control_title,
      framework_name: relation.framework_name,
    };
    addCandidate(control, 65, ["Ligacao existente na biblioteca de mecanismos."], true);
  });

  controlsCatalog.forEach((control) => {
    const text = controlSearchText(control);
    let score = 0;
    const reasons: string[] = [];

    profiles.forEach((profile) => {
      if (textHasAny(text, profile.controlTerms)) {
        score += 24;
        reasons.push(profile.rationale);
      }
    });

    words.forEach((word) => {
      if (normalizeForMatch(text).includes(word)) score += 4;
    });

    if (String(control.id) === currentControlId) score += 100;
    if (score >= 16) addCandidate(control, score, reasons.length ? reasons : ["Correspondencia textual com o mecanismo."], false);
  });

  return Array.from(candidates.values())
    .sort((a, b) => {
      if (String(a.control.id) === currentControlId) return -1;
      if (String(b.control.id) === currentControlId) return 1;
      if (a.fromLibrary !== b.fromLibrary) return a.fromLibrary ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 12);
}

function recommendationControlId(item: any) {
  return String(item?.control || item?.control_id || item?.id || "");
}

function internalRecommendationId(item: any) {
  return String(item?.internal_control || item?.internal_control_id || item?.id || "");
}

function recommendationLabel(item: any) {
  const code = item?.code || item?.control_code;
  const title = item?.title || item?.control_title;
  return [code, title].filter(Boolean).join(" - ") || "Controlo recomendado";
}

function uniqueSuggestions<T extends { title: string; rationale: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasAny(text: string, terms: string[]) {
  const source = text.toLowerCase();
  return terms.some((term) => source.includes(term));
}

function buildMechanismSuggestions(policy: PolicyRecord | null, policyControl: any, generatedMechanisms: string[]) {
  const control = policyControl?.control_details || {};
  const context = [
    policy?.title,
    policy?.description,
    policy?.objective,
    policy?.scope,
    control.code,
    control.title,
    control.description,
    control.framework_name,
  ].filter(Boolean).join(" ");

  const suggestions: Array<{ title: string; rationale: string }> = generatedMechanisms.map((item) => ({
    title: item,
    rationale: "Derivado da estrutura documental da politica.",
  }));

  if (hasAny(context, ["access", "acesso", "identity", "identidade", "auth", "privileg"])) {
    suggestions.push(
      { title: "Revisao periodica de acessos e privilegios", rationale: "O controlo selecionado parece relacionado com gestao de acessos." },
      { title: "MFA para contas privilegiadas e acessos remotos", rationale: "Reduz risco de abuso de credenciais em acessos criticos." },
      { title: "Processo formal de joiner, mover e leaver", rationale: "Ajuda a manter permissões alinhadas com responsabilidades reais." }
    );
  }

  if (hasAny(context, ["incident", "incidente", "response", "resposta"])) {
    suggestions.push(
      { title: "Playbook de resposta a incidentes", rationale: "Transforma a politica num procedimento acionavel em caso de incidente." },
      { title: "Canal formal de reporte e triagem de incidentes", rationale: "Garante entrada, classificacao e encaminhamento consistentes." },
      { title: "Exercicios periodicos de simulacao de incidentes", rationale: "Permite testar prontidao e recolher melhorias." }
    );
  }

  if (hasAny(context, ["asset", "ativo", "invent", "classification", "classificacao"])) {
    suggestions.push(
      { title: "Inventario de ativos com owner e criticidade", rationale: "Liga a politica a ativos concretos e responsabilidades operacionais." },
      { title: "Revisao mensal de ativos criticos", rationale: "Mantem o inventario e a criticidade atualizados." },
      { title: "Processo de classificacao e etiquetagem de ativos", rationale: "Ajuda a aplicar controlos proporcionais ao valor do ativo." }
    );
  }

  if (hasAny(context, ["supplier", "fornecedor", "third", "terceir", "contrat"])) {
    suggestions.push(
      { title: "Avaliacao de risco de fornecedores", rationale: "Permite decidir requisitos de seguranca antes e durante a relacao." },
      { title: "Clausulas contratuais de seguranca e notificacao", rationale: "Formaliza responsabilidades, evidencias e tempos de resposta." },
      { title: "Revisao anual de fornecedores criticos", rationale: "Mantem a visibilidade sobre dependencias externas relevantes." }
    );
  }

  if (hasAny(context, ["backup", "restore", "continuidade", "recovery", "recuperacao"])) {
    suggestions.push(
      { title: "Plano de backup com periodicidade e retencao", rationale: "Define o minimo operacional para recuperacao." },
      { title: "Teste periodico de restauro", rationale: "Valida que o backup e recuperavel, nao apenas existente." },
      { title: "Monitorizacao de falhas de backup", rationale: "Evita que falhas recorrentes passem despercebidas." }
    );
  }

  if (hasAny(context, ["vulnerab", "patch", "correcao", "scan", "exposure"])) {
    suggestions.push(
      { title: "Scan recorrente de vulnerabilidades", rationale: "Cria uma fonte regular para detetar exposicao tecnica." },
      { title: "SLA de correcao por severidade", rationale: "Transforma risco tecnico em prioridade operacional." },
      { title: "Processo de excecoes e aceitacao de risco", rationale: "Garante decisao formal quando a correcao nao e imediata." }
    );
  }

  if (hasAny(context, ["log", "monitor", "siem", "alert", "dete", "event"])) {
    suggestions.push(
      { title: "Centralizacao de logs de sistemas criticos", rationale: "Melhora rastreabilidade e capacidade de deteccao." },
      { title: "Regras de alerta para eventos prioritarios", rationale: "Transforma logs em deteccao operacional." },
      { title: "Retencao minima de logs de seguranca", rationale: "Suporta investigacao e auditoria." }
    );
  }

  suggestions.push(
    { title: "Matriz RACI para execucao e aprovacao", rationale: "Clarifica quem executa, aprova e acompanha a politica." },
    { title: "Calendario de revisao e melhoria continua", rationale: "Mantem a politica viva e alinhada com alteracoes de risco." },
    { title: "Registo de excecoes e decisoes", rationale: "Aumenta a rastreabilidade das decisoes do CISO." }
  );

  return uniqueSuggestions(suggestions).slice(0, 6);
}

function buildEvidenceSuggestions(
  policy: PolicyRecord | null,
  policyControl: any,
  mechanism: any,
  generatedEvidence: string[]
) {
  const control = policyControl?.control_details || {};
  const context = [
    policy?.title,
    control.code,
    control.title,
    control.description,
    mechanism?.name,
    mechanism?.description,
  ].filter(Boolean).join(" ");

  const suggestions: Array<{ title: string; rationale: string; evidence_type?: string; description?: string }> = generatedEvidence.map((item) => ({
    title: item,
    rationale: "Derivado da estrutura documental da politica.",
  }));

  if (hasAny(context, ["access", "acesso", "identity", "identidade", "mfa", "privileg"])) {
    suggestions.push(
      { title: "Relatorio de revisao de acessos assinado pelo owner", rationale: "Demonstra validacao humana das permissoes." },
      { title: "Export de configuracao MFA ou politica de autenticacao", rationale: "Evidencia tecnica da implementacao do mecanismo." },
      { title: "Ticket de remocao ou alteracao de privilegios", rationale: "Mostra execucao controlada de alteracoes de acesso." }
    );
  }

  if (hasAny(context, ["incident", "incidente", "playbook", "resposta"])) {
    suggestions.push(
      { title: "Registo de incidente ou exercicio com licoes aprendidas", rationale: "Demonstra aplicacao real ou simulada do processo." },
      { title: "Ata de revisao pos-incidente", rationale: "Evidencia melhoria continua e decisao de gestao." },
      { title: "Lista de contactos e escalonamento aprovada", rationale: "Comprova preparacao operacional." }
    );
  }

  if (hasAny(context, ["asset", "ativo", "invent", "classificacao"])) {
    suggestions.push(
      { title: "Export do inventario com owner e criticidade", rationale: "Mostra cobertura e responsabilidade dos ativos." },
      { title: "Relatorio de alteracoes ao inventario", rationale: "Demonstra manutencao continua." },
      { title: "Aprovacao da classificacao de ativos criticos", rationale: "Liga criticidade a decisao formal." }
    );
  }

  if (hasAny(context, ["supplier", "fornecedor", "contrat", "third", "terceir"])) {
    suggestions.push(
      { title: "Questionario de seguranca do fornecedor", rationale: "Evidencia avaliacao antes ou durante a relacao." },
      { title: "Contrato ou anexo com clausulas de seguranca", rationale: "Formaliza obrigacoes e responsabilidades." },
      { title: "Relatorio de revisao anual de fornecedor critico", rationale: "Mostra acompanhamento continuado." }
    );
  }

  if (hasAny(context, ["backup", "restore", "restauro", "recuperacao"])) {
    suggestions.push(
      { title: "Logs de execucao de backups", rationale: "Comprova que o mecanismo executa conforme definido." },
      { title: "Relatorio de teste de restauro", rationale: "Valida recuperabilidade, nao apenas configuracao." },
      { title: "Evidencia de retencao e cifragem de backups", rationale: "Suporta requisitos de protecao e continuidade." }
    );
  }

  if (hasAny(context, ["vulnerab", "patch", "scan", "correcao"])) {
    suggestions.push(
      { title: "Relatorio de scan de vulnerabilidades", rationale: "Demonstra identificacao tecnica recorrente." },
      { title: "Tickets de correcao fechados por severidade", rationale: "Liga descoberta a remediacao." },
      { title: "Registo de excecao ou aceitacao de risco", rationale: "Documenta decisao quando a correcao nao e imediata." }
    );
  }

  if (hasAny(context, ["log", "monitor", "siem", "alert", "dete", "event"])) {
    suggestions.push(
      { title: "Captura de regra de alerta ativa", rationale: "Comprova configuracao operacional de deteccao." },
      { title: "Relatorio de eventos analisados", rationale: "Mostra que a monitorizacao e acompanhada." },
      { title: "Configuracao de retencao de logs", rationale: "Evidencia cumprimento de rastreabilidade." }
    );
  }

  suggestions.push(
    { title: "Procedimento aprovado e publicado", rationale: "Comprova que existe orientacao operacional formal." },
    { title: "Ata ou decisao de aprovacao do owner", rationale: "Regista accountability e validacao humana." },
    { title: "Registo de revisao periodica", rationale: "Demonstra melhoria continua e manutencao." }
  );

  return uniqueSuggestions(suggestions).slice(0, 6);
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{value || "-"}</p>
    </div>
  );
}

// Mantido temporariamente como fallback para estruturas antigas compactas.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionTree({ sections, emptyMessage = "Sem secoes estruturadas." }: { sections: any[]; emptyMessage?: string }) {
  if (!sections?.length) {
    return <div className="p-8 text-center text-sm font-bold text-slate-400">{emptyMessage}</div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {sections.map((section) => (
        <article key={section.id} className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {section.document_title ? `${section.document_title} · ` : ""}Secao {section.section_number || section.order || "-"}
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-950">{section.title}</h3>
          {section.content && <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600">{section.content}</p>}
          {section.subsections?.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 border-slate-100 pl-4">
              {section.subsections.map((sub: any) => (
                <div key={sub.id}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Secao {sub.section_number || sub.order || "-"}</p>
                  <p className="text-sm font-bold text-slate-900">{sub.title}</p>
                  {sub.content && <p className="mt-1 whitespace-pre-line text-xs font-semibold leading-relaxed text-slate-500">{sub.content}</p>}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function PolicyDocumentReader({ sections, emptyMessage = "Sem secoes estruturadas." }: { sections: any[]; emptyMessage?: string }) {
  if (!sections?.length) {
    return <div className="p-10 text-center text-sm font-bold text-slate-400">{emptyMessage}</div>;
  }

  const renderSection = (section: any, level = 0) => (
    <article
      key={section.id}
      id={sectionAnchor(section)}
      className={level === 0 ? "rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" : "mt-5 border-l-2 border-slate-100 pl-5"}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">
        {section.document_title && level === 0 ? `${section.document_title} - ` : ""}Capitulo {section.section_number || section.order || "-"}
      </p>
      <h3 className={`${level === 0 ? "mt-2 text-2xl" : "mt-1 text-lg"} font-bold tracking-tight text-slate-950`}>
        {section.title}
      </h3>
      {section.content && (
        <div className={`${level === 0 ? "mt-4 text-base" : "mt-2 text-sm"} whitespace-pre-line font-medium leading-8 text-slate-700`}>
          {section.content}
        </div>
      )}
      {section.subsections?.length > 0 && (
        <div className="mt-5 space-y-4">
          {section.subsections.map((sub: any) => renderSection(sub, level + 1))}
        </div>
      )}
    </article>
  );

  return (
    <div className="space-y-5 bg-slate-50 p-5">
      {sections.map((section) => renderSection(section))}
    </div>
  );
}

function SectionIndex({ sections }: { sections: any[] }) {
  const flat = flattenSections(sections);
  if (!flat.length) {
    return <p className="text-sm font-semibold text-slate-400">Sem capitulos para indexar.</p>;
  }

  return (
    <nav className="space-y-2">
      {flat.map((section) => (
        <a
          key={section.id}
          href={`#${sectionAnchor(section)}`}
          className="block rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <span className="mr-2 font-mono text-xs text-slate-400">{section.section_number || section.order || "-"}</span>
          {section.title || "Sem titulo"}
        </a>
      ))}
    </nav>
  );
}

function GovernanceDocumentTree({ documents }: { documents: any[] }) {
  if (!documents.length) return null;

  const tree = buildDocumentTree(documents);
  const renderDocument = (document: any, level = 0) => (
    <div key={document.id} className={level ? "ml-4 border-l border-slate-100 pl-4" : ""}>
      <Link
        to={`/governance/documents/${document.id}`}
        className="block rounded-xl border border-slate-100 bg-white p-4 transition hover:border-indigo-200 hover:bg-indigo-50/40"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {documentTypeLabel(document.document_type)}
          </span>
          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${documentStatusTone(document.status)}`}>
            {documentStatusLabel(document.status)}
          </span>
          {document.version && (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              v{document.version}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm font-bold text-slate-950">{document.title}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {document.sections_count || 0} secoes · {document.children_count || document.children?.length || 0} subordinados
        </p>
      </Link>
      {document.children?.length > 0 && <div className="mt-3 space-y-3">{document.children.map((child: any) => renderDocument(child, level + 1))}</div>}
    </div>
  );

  return <div className="space-y-3">{tree.map((document) => renderDocument(document))}</div>;
}

async function loadPolicyGovernanceStructure(policyId: string) {
  const rootDocuments = unwrapList<any>(
    await mappingReviewApi.listGovernanceDocuments({ legacy_policy: policyId, page_size: 50 })
  );
  const documentsById = new Map<string, any>();
  const queue = rootDocuments.map((document) => ({ document, depth: 0 }));

  rootDocuments.forEach((document) => documentsById.set(String(document.id), document));

  while (queue.length) {
    const { document, depth } = queue.shift()!;
    if (depth >= 4) continue;

    const children = unwrapList<any>(await mappingReviewApi.getGovernanceDocumentChildren(String(document.id)).catch(() => []));
    children.forEach((child) => {
      const childId = String(child.id);
      if (!documentsById.has(childId)) {
        documentsById.set(childId, child);
        queue.push({ document: child, depth: depth + 1 });
      }
    });
  }

  const documents = Array.from(documentsById.values());
  const sectionGroups = await Promise.all(
    documents.map(async (document, documentOrder) => {
      const sections = unwrapList<any>(await mappingReviewApi.getGovernanceDocumentSections(String(document.id)).catch(() => []));
      return sections.map((section) => ({
        ...section,
        document_order: documentOrder,
        document_title: section.document_title || document.title,
      }));
    })
  );

  return {
    documents,
    sections: buildSectionTree(sectionGroups.flat()),
  };
}

export default function PolicyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [governanceDocuments, setGovernanceDocuments] = useState<any[]>([]);
  const [governanceDocumentSections, setGovernanceDocumentSections] = useState<any[]>([]);
  const [governanceExceptions, setGovernanceExceptions] = useState<GovernanceException[]>([]);
  const [policyTraceability, setPolicyTraceability] = useState<TraceabilityPayload | null>(null);
  const [policyAssistantHistory, setPolicyAssistantHistory] = useState<AssistantHistoryEntry[]>([]);
  const [decisionRecords, setDecisionRecords] = useState<DecisionRecord[]>([]);
  const [governanceActions, setGovernanceActions] = useState<GovernanceAction[]>([]);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [controlsCatalog, setControlsCatalog] = useState<any[]>([]);
  const [internalControlsCatalog, setInternalControlsCatalog] = useState<any[]>([]);
  const [policyInternalControls, setPolicyInternalControls] = useState<any[]>([]);
  const [internalControlMechanismMappings, setInternalControlMechanismMappings] = useState<any[]>([]);
  const [evidenceCatalog, setEvidenceCatalog] = useState<any[]>([]);
  const [mechanismEvidenceLinks, setMechanismEvidenceLinks] = useState<any[]>([]);
  const [internalControlEvidenceLinks, setInternalControlEvidenceLinks] = useState<any[]>([]);
  const [globalMechanisms, setGlobalMechanisms] = useState<any[]>([]);
  const [globalControlMechanisms, setGlobalControlMechanisms] = useState<any[]>([]);
  const [controlSearch, setControlSearch] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [internalDomainFilter, setInternalDomainFilter] = useState("");
  const [controlCatalogMode, setControlCatalogMode] = useState<"internal" | "external">("internal");
  const [creatingMapping, setCreatingMapping] = useState(false);
  const [createImplementationPack, setCreateImplementationPack] = useState(false);
  const [mappingMessage, setMappingMessage] = useState<string | null>(null);
  const [lastImpactSummary, setLastImpactSummary] = useState<any>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingCatalogsLoaded, setOnboardingCatalogsLoaded] = useState(false);
  const [onboardingCatalogsLoading, setOnboardingCatalogsLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    metadata: true,
    content: true,
    controlsMechanisms: true,
    frameworkMappings: true,
    evidence: true,
    documents: true,
    score: true,
    gaps: true,
    aiAdvice: true,
    decisions: true,
    actionPlan: true,
  });
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<PolicyWorkspaceTab>("redaction");
  const [policyGapAdviceLoading, setPolicyGapAdviceLoading] = useState(false);
  const [policyGapAdviceError, setPolicyGapAdviceError] = useState<string | null>(null);
  const [policyGapAdviceResult, setPolicyGapAdviceResult] = useState<AssistantResponse | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedPolicyControlId, setSelectedPolicyControlId] = useState("");
  const [selectedPolicyInternalControlId, setSelectedPolicyInternalControlId] = useState("");
  const [selectedMechanismId, setSelectedMechanismId] = useState("");
  const [selectedImpactControlIds, setSelectedImpactControlIds] = useState<string[]>([]);
  const [mechanismImplemented, setMechanismImplemented] = useState(false);
  const [draftMechanismName, setDraftMechanismName] = useState("");
  const [draftEvidenceTitle, setDraftEvidenceTitle] = useState("");
  const [collectingActualEvidenceFor, setCollectingActualEvidenceFor] = useState<any>(null);
  const [actualEvidenceDraft, setActualEvidenceDraft] = useState({
    title: "",
    description: "",
    evidence_type: "report",
    status: "pending_review",
    confidence_level: "70",
    source: "",
    external_reference: "",
  });
  const [actualEvidenceFile, setActualEvidenceFile] = useState<File | null>(null);
  const [creatingMechanism, setCreatingMechanism] = useState(false);
  const [creatingEvidence, setCreatingEvidence] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMechanismEvidenceLinks = useCallback(async (mechanismMappings: any[]) => {
    const reusableMechanismIds = Array.from(new Set(
      mechanismMappings
        .map((mapping: any) => String(mapping.targetId || mapping.raw?.mechanism || ""))
        .filter(Boolean)
    ));

    if (!reusableMechanismIds.length) {
      setMechanismEvidenceLinks([]);
      return [];
    }

    const evidenceLinkBatches = await Promise.all(
      reusableMechanismIds.map((mechanismId) =>
        mappingReviewApi
          .listMappings("evidence_link", { target_type: "mechanism", target_id: mechanismId, page_size: 1000 })
          .catch(() => [])
      )
    );
    const links = evidenceLinkBatches.flat();
    setMechanismEvidenceLinks(links);
    return links;
  }, []);

  const loadOnboardingCatalogs = async (force = false) => {
    if (onboardingCatalogsLoaded && !force) return;

    setOnboardingCatalogsLoading(true);
    try {
      const [
        frameworksData,
        controlsData,
        mechanismsData,
        controlMechanismsData,
        internalControlsData,
        evidenceItemsData,
      ] = await Promise.all([
        governanceApi.getFrameworks(),
        governanceApi.listControls({ page_size: 1000 }),
        governanceApi.listMechanisms({ page_size: 1000 }),
        governanceApi.listControlMechanisms({ page_size: 2000 }),
        mappingReviewApi.searchInternalControls("", { page_size: 1000 }).catch(() => []),
        mappingReviewApi.listEvidenceItems({ page_size: 1000 }).catch(() => []),
      ]);

      setFrameworks(unwrapList(frameworksData));
      setControlsCatalog(unwrapList(controlsData));
      setGlobalMechanisms(unwrapList(mechanismsData));
      setGlobalControlMechanisms(unwrapList(controlMechanismsData));
      setEvidenceCatalog(unwrapList(evidenceItemsData));

      const preferredInternalControls = unwrapList(internalControlsData).filter((option: any) => option.raw?.source !== "migrated");
      setInternalControlsCatalog(preferredInternalControls.length ? preferredInternalControls : unwrapList(internalControlsData));
      setOnboardingCatalogsLoaded(true);
    } catch (err) {
      console.warn("Nao foi possivel carregar os catalogos do onboarding.", err);
      setError("Nao foi possivel carregar os catalogos do onboarding.");
    } finally {
      setOnboardingCatalogsLoading(false);
    }
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [
        policyData,
        policyInternalControlsData,
        policyAdviceHistoryData,
      ] = await Promise.all([
        governanceApi.getPolicy(id),
        mappingReviewApi.listMappings("policy_internal_control", { policy: id, page_size: 1000 }).catch(() => []),
        chatApi.listHistory({ context: "policy_advice", policy_id: id, advice_mode: "auditability", page_size: 1 }).catch(() => ({ results: [] })),
      ]);
      setPolicy(policyData);
      const policyInternalControlList = unwrapList(policyInternalControlsData);
      setPolicyInternalControls(policyInternalControlList);
      const latestPolicyAdvice = policyAdviceHistoryData.results?.[0];
      setPolicyGapAdviceResult(latestPolicyAdvice ? historyEntryToAssistantResponse(latestPolicyAdvice) : null);
      setPolicyAssistantHistory(policyAdviceHistoryData.results || []);

      const internalControlIds = Array.from(new Set(
        policyInternalControlList
          .map((mapping: any) => internalControlIdFromPolicyMapping(mapping))
          .filter(Boolean)
      ));
      let internalMechanismList: any[] = [];
      if (internalControlIds.length) {
        const internalEvidenceBatches = await Promise.all(
          internalControlIds.map((internalControlId) =>
            mappingReviewApi
              .listMappings("evidence_link", { target_type: "internal_control", target_id: internalControlId, page_size: 1000 })
              .catch(() => [])
          )
        );
        setInternalControlEvidenceLinks(internalEvidenceBatches.flat());

        const internalMechanismBatches = await Promise.all(
          internalControlIds.map((internalControlId) =>
            mappingReviewApi
              .listMappings("internal_control_mechanism", { internal_control: internalControlId, page_size: 1000 })
              .catch(() => [])
          )
        );
        internalMechanismList = internalMechanismBatches.flat();
        setInternalControlMechanismMappings(internalMechanismList);
        await refreshMechanismEvidenceLinks(internalMechanismList);
      } else {
        setInternalControlMechanismMappings([]);
        setMechanismEvidenceLinks([]);
        setInternalControlEvidenceLinks([]);
      }

      const mechanismIds = Array.from(new Set(
        internalMechanismList
          .map((mapping: any) => String(mapping.targetId || mapping.raw?.mechanism || ""))
          .filter(Boolean)
      ));
      const exceptionRequests = [
        governanceApi.listGovernanceExceptions({ target_type: "policy", target_id: id, page_size: 50 }).catch(() => ({ results: [] })),
        ...internalControlIds.map((internalControlId) =>
          governanceApi.listGovernanceExceptions({ target_type: "internal_control", target_id: internalControlId, page_size: 50 }).catch(() => ({ results: [] }))
        ),
        ...mechanismIds.map((mechanismId) =>
          governanceApi.listGovernanceExceptions({ target_type: "mechanism", target_id: mechanismId, page_size: 50 }).catch(() => ({ results: [] }))
        ),
      ];
      const exceptionBatches = await Promise.all(exceptionRequests);
      const exceptionMap = new Map<string, GovernanceException>();
      exceptionBatches.flatMap((batch: any) => unwrapList<GovernanceException>(batch)).forEach((exception) => {
        exceptionMap.set(String(exception.id), exception);
      });
      setGovernanceExceptions(Array.from(exceptionMap.values()));

      try {
        const traceabilityData = await mappingReviewApi.getPolicyTraceability(id, {
          mode: "official",
          include_inactive: true,
          include_evidence: true,
          include_gaps: true,
          include_scores: true,
          max_depth: 3,
        });
        setPolicyTraceability(traceabilityData);
      } catch (traceabilityErr) {
        console.warn("Nao foi possivel carregar traceability para o dossier.", traceabilityErr);
        setPolicyTraceability(null);
      }

      try {
        const [decisionData, actionData, allAdviceData] = await Promise.all([
          governanceApi.listDecisionRecords({ page_size: 500 }).catch(() => ({ results: [] })),
          governanceApi.listGovernanceActions({ page_size: 500 }).catch(() => ({ results: [] })),
          chatApi.listHistory({ context: "policy_advice", policy_id: id, page_size: 30 }).catch(() => ({ results: [] })),
        ]);
        const policyControlIds = new Set(unwrapList<any>(policyData.policy_controls || []).map((item: any) => String(item.id)));
        const policyInternalControlIds = new Set(policyInternalControlList.map((item: any) => String(item.id)));
        const internalControlIdSet = new Set(internalControlIds.map(String));
        const mechanismIdSet = new Set(mechanismIds.map(String));
        const assistantIds = new Set((allAdviceData.results || []).map((item: AssistantHistoryEntry) => String(item.id)));
        const relatedDecisions = unwrapList<DecisionRecord>(decisionData).filter((record) => {
          const targetId = String(record.target_id || "");
          if (targetId === String(id)) return true;
          if (record.target_type === "policy_control" && policyControlIds.has(targetId)) return true;
          if (record.target_type === "policy_internal_control" && policyInternalControlIds.has(targetId)) return true;
          if (record.target_type === "internal_control" && internalControlIdSet.has(targetId)) return true;
          if (record.target_type === "mechanism" && mechanismIdSet.has(targetId)) return true;
          if (record.target_type === "assistant_recommendation" && assistantIds.has(targetId)) return true;
          const snapshot = JSON.stringify(record.source_snapshot || {});
          return snapshot.includes(String(id));
        });
        const relatedActions = unwrapList<GovernanceAction>(actionData).filter((action) => {
          const targetId = String(action.target_id || "");
          if (targetId === String(id)) return true;
          if (action.target_type === "policy_control" && policyControlIds.has(targetId)) return true;
          if (action.target_type === "policy_internal_control" && policyInternalControlIds.has(targetId)) return true;
          if (action.target_type === "internal_control" && internalControlIdSet.has(targetId)) return true;
          if (action.target_type === "mechanism" && mechanismIdSet.has(targetId)) return true;
          const serializedContext = JSON.stringify([
            action.source_key,
            action.description,
            action.recommendation,
            action.notes,
            action.ai_rationale,
          ].filter(Boolean));
          return serializedContext.includes(String(id));
        });
        setDecisionRecords(relatedDecisions);
        setGovernanceActions(relatedActions);
        setPolicyAssistantHistory(allAdviceData.results || []);
      } catch (auditErr) {
        console.warn("Nao foi possivel carregar todos os dados do dossier de auditoria.", auditErr);
        setDecisionRecords([]);
        setGovernanceActions([]);
      }

      try {
        const structure = await loadPolicyGovernanceStructure(id);
        setGovernanceDocuments(structure.documents);
        setGovernanceDocumentSections(structure.sections);
      } catch (structureErr) {
        console.warn("Nao foi possivel carregar a estrutura documental transversal.", structureErr);
        setGovernanceDocuments([]);
        setGovernanceDocumentSections([]);
      }
    } catch (err: any) {
      console.error(err);
      setGovernanceExceptions([]);
      setPolicyTraceability(null);
      setDecisionRecords([]);
      setGovernanceActions([]);
      setError(err?.message || "Nao foi possivel carregar a politica.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Recarregar a política apenas quando muda o id; o load agrega vários catálogos mutáveis desta página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (wizardStep !== 3 || !internalControlMechanismMappings.length) return;
    refreshMechanismEvidenceLinks(internalControlMechanismMappings).catch((err) => {
      console.warn("Nao foi possivel atualizar as evidencias dos mecanismos.", err);
    });
  }, [wizardStep, internalControlMechanismMappings, refreshMechanismEvidenceLinks]);

  const loadRecommendations = async () => {
    if (!id) return;
    setRecommending(true);
    setError(null);
    try {
      setRecommendations(await governanceApi.getAIRecommendations(id));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel gerar recomendacoes.");
    } finally {
      setRecommending(false);
    }
  };

  const openOnboardingPanel = () => {
    setOnboardingOpen(true);
    void loadOnboardingCatalogs();
  };

  const selectWorkspaceTab = (tab: PolicyWorkspaceTab) => {
    setActiveWorkspaceTab(tab);
    if (tab === "onboarding") {
      openOnboardingPanel();
    }
  };

  const toggleOnboardingPanel = () => {
    setOnboardingOpen((current) => {
      const next = !current;
      if (next) void loadOnboardingCatalogs();
      return next;
    });
  };

  const controls = useMemo(() => policy?.policy_controls || [], [policy]);
  const internalControlMappings = useMemo(() => policyInternalControls || [], [policyInternalControls]);
  const internalControlCount = internalControlMappings.length;
  const displayedControlCount = internalControlCount || controls.length;
  const legacySections = useMemo(() => policy?.sections || [], [policy]);
  const primaryGovernanceDocument = useMemo(
    () =>
      governanceDocuments.find((document) => String(document.legacy_policy || "") === String(id || "") && document.document_type === "policy") ||
      governanceDocuments.find((document) => !document.parent_document) ||
      governanceDocuments[0] ||
      null,
    [governanceDocuments, id]
  );
  const sections = useMemo(
    () => governanceDocumentSections.length ? governanceDocumentSections : legacySections,
    [governanceDocumentSections, legacySections]
  );
  const policyAdviceSnapshot = useMemo(() => ({
    code: policy?.code || "",
    title: policy?.title || "",
    version: policy?.version || "1.0",
    status: policy?.status || "",
    owner: policy?.owner_display || policy?.owner || "",
    sections: flattenSections(sections).slice(0, 20).map((section: any) => ({
      section_number: section.section_number || "",
      title: section.title || "",
      content: section.content || "",
    })),
  }), [policy, sections]);
  const score = Math.round(Number(policy?.compliance_score || 0));
  const contextualGovernanceExceptions = useMemo(
    () => governanceExceptions.filter((exception) => !["rejected", "revoked"].includes(exception.approval_status)),
    [governanceExceptions]
  );

  const requestPolicyGapAdvice = async () => {
    if (!policy?.id) return;
    setPolicyGapAdviceLoading(true);
    setPolicyGapAdviceError(null);
    setPolicyGapAdviceResult(null);
    try {
      const result = await chatApi.askPolicyAdvice({
        policy_id: String(policy.id),
        advice_mode: "auditability",
        policy_snapshot: policyAdviceSnapshot,
      });
      setPolicyGapAdviceResult(result);
    } catch (err: any) {
      console.error(err);
      setPolicyGapAdviceError(err?.message || "Nao foi possivel analisar gaps e recomendacoes da politica.");
    } finally {
      setPolicyGapAdviceLoading(false);
    }
  };

  const linkedControlIds = useMemo(() => new Set(controls.map((policyControl: any) => String(policyControl.control))), [controls]);
  const linkedInternalControlIds = useMemo(
    () => new Set(internalControlMappings.map((mapping: any) => String(mapping.targetId || mapping.raw?.internal_control || mapping.internal_control))),
    [internalControlMappings]
  );
  const generatedMechanisms = useMemo(() => extractBulletItems(sections, "mecanismos"), [sections]);
  const generatedEvidence = useMemo(() => extractBulletItems(sections, "evidencias"), [sections]);
  const allMechanisms = useMemo(
    () => controls.flatMap((policyControl: any) =>
      (policyControl.mechanisms || []).map((mechanism: any) => ({
        ...mechanism,
        policyControl,
      }))
    ),
    [controls]
  );
  const controlsWithoutMechanisms = useMemo(
    () => controls.filter((policyControl: any) => !(policyControl.mechanisms || []).length),
    [controls]
  );
  const mechanismsWithoutEvidence = useMemo(
    () => allMechanisms.filter((mechanism: any) => !(mechanism.evidences || []).length),
    [allMechanisms]
  );
  const internalControlsWithoutMechanisms = useMemo(
    () => internalControlMappings.filter((mapping: any) => {
      const internalControlId = internalControlIdFromPolicyMapping(mapping);
      return !internalControlMechanismMappings.some((mechanism: any) =>
        String(mechanism.sourceId || mechanism.raw?.internal_control) === internalControlId
      );
    }),
    [internalControlMappings, internalControlMechanismMappings]
  );
  const internalMechanismsWithoutEvidence = useMemo(
    () => internalControlMechanismMappings.filter((mechanism: any) => {
      const reusableMechanismId = String(mechanism.targetId || mechanism.raw?.mechanism || "");
      return !mechanismEvidenceLinks.some((link: any) =>
        String(link.targetType || link.raw?.target_type) === "mechanism" &&
        String(link.targetId || link.raw?.target_id) === reusableMechanismId &&
        String(link.link_type || link.raw?.link_type || "") === "required_by"
      );
    }),
    [internalControlMechanismMappings, mechanismEvidenceLinks]
  );
  const activePolicyInternalControlId = selectedPolicyInternalControlId || internalControlMappings[0]?.id || "";
  const selectedPolicyInternalControl = useMemo(
    () => internalControlMappings.find((mapping: any) => String(mapping.id) === String(activePolicyInternalControlId)),
    [internalControlMappings, activePolicyInternalControlId]
  );
  const selectedInternalControlId = internalControlIdFromPolicyMapping(selectedPolicyInternalControl);
  const selectedInternalControlContext = useMemo(
    () => selectedPolicyInternalControl ? internalControlContextFromPolicyMapping(selectedPolicyInternalControl) : null,
    [selectedPolicyInternalControl]
  );
  const selectedInternalControlMechanisms = useMemo(
    () => internalControlMechanismMappings.filter((mapping: any) => String(mapping.sourceId || mapping.raw?.internal_control) === String(selectedInternalControlId)),
    [internalControlMechanismMappings, selectedInternalControlId]
  );
  const useInternalMechanismFlow = internalControlMappings.length > 0;
  const internalMechanismCount = internalControlMechanismMappings.length;
  const displayedMechanismCount = useInternalMechanismFlow ? internalMechanismCount : allMechanisms.length;
  const mechanismExpectedEvidenceCount = useMemo(
    () => mechanismEvidenceLinks.filter((link: any) => String(link.link_type || link.raw?.link_type || "") === "required_by").length,
    [mechanismEvidenceLinks]
  );
  const mechanismActualEvidenceCount = useMemo(
    () => mechanismEvidenceLinks.filter((link: any) => String(link.link_type || link.raw?.link_type || "") !== "required_by").length,
    [mechanismEvidenceLinks]
  );
  const displayedEvidenceCount = useInternalMechanismFlow
    ? mechanismActualEvidenceCount
    : allMechanisms.reduce((total: number, mechanism: any) => total + Number(mechanism.evidence_count || 0), 0);
  const sortedGovernanceActions = useMemo(() => {
    const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const statusWeight: Record<string, number> = { blocked: 0, open: 1, in_progress: 2, deferred: 3, done: 4, cancelled: 5 };
    return [...governanceActions].sort((a, b) => {
      if (isActionClosed(a) !== isActionClosed(b)) return isActionClosed(a) ? 1 : -1;
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      const priorityDiff = (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;
      const statusDiff = (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      const dueA = a.due_date ? new Date(`${a.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.due_date ? new Date(`${b.due_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [governanceActions]);
  const activeGovernanceActions = useMemo(
    () => sortedGovernanceActions.filter((action) => !isActionClosed(action)),
    [sortedGovernanceActions]
  );
  const governanceActionSummary = useMemo(() => ({
    total: sortedGovernanceActions.length,
    active: activeGovernanceActions.length,
    done: sortedGovernanceActions.filter((action) => action.status === "done").length,
    overdue: activeGovernanceActions.filter((action) => action.is_overdue).length,
    highRisk: activeGovernanceActions.filter((action) => action.priority === "critical" || action.priority === "high").length,
    nextDue: activeGovernanceActions.filter((action) => action.due_date).sort((a, b) =>
      new Date(`${a.due_date}T00:00:00`).getTime() - new Date(`${b.due_date}T00:00:00`).getTime()
    )[0] || null,
  }), [activeGovernanceActions, sortedGovernanceActions]);
  const hasMechanismControlContext = useInternalMechanismFlow || controls.length > 0;
  const activePolicyControlId = selectedPolicyControlId || controls[0]?.id || "";
  const activeMechanismId = selectedMechanismId || allMechanisms[0]?.id || "";
  const selectedPolicyControl = useMemo(
    () => controls.find((policyControl: any) => String(policyControl.id) === String(activePolicyControlId)),
    [controls, activePolicyControlId]
  );
  const selectedMechanismControlContext = selectedInternalControlContext || selectedPolicyControl;
  const selectedMechanism = useMemo(
    () => allMechanisms.find((mechanism: any) => String(mechanism.id) === String(activeMechanismId)),
    [allMechanisms, activeMechanismId]
  );
  const useInternalEvidenceFlow = internalMechanismCount > 0;
  const selectedInternalMechanism = useMemo(
    () => internalControlMechanismMappings.find((mapping: any) => String(mapping.id) === String(selectedMechanismId || internalControlMechanismMappings[0]?.id || "")),
    [internalControlMechanismMappings, selectedMechanismId]
  );
  const selectedInternalMechanismControlContext = useMemo(() => {
    const internalControlId = String(selectedInternalMechanism?.sourceId || selectedInternalMechanism?.raw?.internal_control || "");
    const policyMapping = internalControlMappings.find((mapping: any) => internalControlIdFromPolicyMapping(mapping) === internalControlId);
    return policyMapping ? internalControlContextFromPolicyMapping(policyMapping) : null;
  }, [internalControlMappings, selectedInternalMechanism]);
  const activeEvidenceMechanismId = useInternalEvidenceFlow
    ? selectedInternalMechanism?.id || internalControlMechanismMappings[0]?.id || ""
    : activeMechanismId;
  const selectedReusableMechanismId = useInternalEvidenceFlow
    ? String(selectedInternalMechanism?.targetId || selectedInternalMechanism?.raw?.mechanism || "")
    : "";
  const evidenceLinksByMechanismId = useMemo(() => {
    const grouped = new Map<string, any[]>();
    mechanismEvidenceLinks.forEach((link: any) => {
      if (String(link.targetType || link.raw?.target_type) !== "mechanism") return;
      const mechanismId = String(link.targetId || link.raw?.target_id || "");
      if (!mechanismId) return;
      grouped.set(mechanismId, [...(grouped.get(mechanismId) || []), link]);
    });
    return grouped;
  }, [mechanismEvidenceLinks]);
  const selectedMechanismEvidenceLinks = useMemo(
    () => evidenceLinksByMechanismId.get(String(selectedReusableMechanismId)) || [],
    [evidenceLinksByMechanismId, selectedReusableMechanismId]
  );
  const evidencePlanGroups = useMemo(() => {
    const groups = new Map<string, { controlId: string; controlLabel: string; mechanisms: any[] }>();

    internalControlMechanismMappings.forEach((mapping: any) => {
      const controlId = String(mapping.sourceId || mapping.raw?.internal_control || "");
      const mechanismId = String(mapping.targetId || mapping.raw?.mechanism || "");
      const controlLabel = mapping.sourceLabel || mapping.raw?.internal_control_title || "Controlo interno";
      const mechanismLabel = mapping.targetLabel || mapping.raw?.mechanism_title || "Mecanismo";
      const links = mechanismId ? evidenceLinksByMechanismId.get(mechanismId) || [] : [];
      const normalizedLinks = links.map((link: any) => ({
        id: link.id,
        evidenceItemId: link.sourceId || link.raw?.evidence_item || "",
        title: link.sourceLabel || link.raw?.evidence_title || "Evidencia",
        description: link.rationale || link.raw?.evidence_description || "",
        type: link.raw?.evidence_type || "other",
        file: link.raw?.file || link.raw?.evidence_file || "",
        source: link.raw?.source || "",
        externalReference: link.raw?.external_reference || "",
        itemStatus: link.raw?.evidence_status || "draft",
        linkType: link.link_type || link.raw?.link_type || "evidences",
        validationStatus: link.validation_status || link.raw?.validation_status || "draft",
      }));
      const expectedEvidenceLinks = normalizedLinks.filter((link: any) => link.linkType === "required_by");
      const actualEvidenceLinks = normalizedLinks.filter((link: any) => link.linkType !== "required_by");

      if (!groups.has(controlId)) {
        groups.set(controlId, { controlId, controlLabel, mechanisms: [] });
      }

      groups.get(controlId)?.mechanisms.push({
        id: mapping.id,
        mechanismId,
        mechanismLabel,
        relationshipType: mapping.relationship_type || mapping.raw?.relationship_type || "primary",
        implementationStatus: mapping.implementation_status || mapping.raw?.implementation_status || "planned",
        mandatory: Boolean(mapping.mandatory ?? mapping.raw?.mandatory),
        evidenceLinks: normalizedLinks,
        expectedEvidenceLinks,
        actualEvidenceLinks,
      });
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      mechanismCount: group.mechanisms.length,
      expectedEvidenceCount: group.mechanisms.reduce((total, mechanism) => total + mechanism.expectedEvidenceLinks.length, 0),
      actualEvidenceCount: group.mechanisms.reduce((total, mechanism) => total + mechanism.actualEvidenceLinks.length, 0),
    }));
  }, [evidenceLinksByMechanismId, internalControlMechanismMappings]);
  const selectedInternalMechanismInternalControlId = useInternalEvidenceFlow
    ? String(selectedInternalMechanism?.sourceId || selectedInternalMechanism?.raw?.internal_control || "")
    : "";
  const selectedInternalControlEvidenceLinks = useMemo(
    () => internalControlEvidenceLinks.filter((link: any) =>
      String(link.targetType || link.raw?.target_type) === "internal_control" &&
      String(link.targetId || link.raw?.target_id) === String(selectedInternalMechanismInternalControlId)
    ),
    [internalControlEvidenceLinks, selectedInternalMechanismInternalControlId]
  );
  const mechanismSuggestions = useMemo(
    () => buildMechanismSuggestions(policy, selectedMechanismControlContext, generatedMechanisms),
    [policy, selectedMechanismControlContext, generatedMechanisms]
  );
  const associatedMechanismItems = useMemo(
    () => useInternalMechanismFlow
      ? selectedInternalControlMechanisms.map((mechanism: any) => ({
        id: mechanism.id,
        name: mechanism.targetLabel || mechanism.raw?.mechanism_title || "Mecanismo",
        description: mechanism.raw?.mechanism_description || mechanism.rationale || "",
        evidenceCount: evidenceLinksByMechanismId.get(String(mechanism.targetId || mechanism.raw?.mechanism || ""))?.length || 0,
        meta: `${mechanism.relationship_type || "primary"} · ${mechanism.implementation_status || "planned"} · peso ${mechanism.contribution_weight ?? 100}%`,
      }))
      : (selectedPolicyControl?.mechanisms || []).map((mechanism: any) => ({
        id: mechanism.id,
        name: mechanism.name || "Mecanismo",
        description: mechanism.description || "",
        evidenceCount: Number(mechanism.evidence_count || mechanism.evidences?.length || 0),
        meta: mechanism.implementation_status || mechanism.status || "",
      })),
    [evidenceLinksByMechanismId, useInternalMechanismFlow, selectedInternalControlMechanisms, selectedPolicyControl]
  );
  const associatedMechanismNameSet = useMemo(
    () => new Set(associatedMechanismItems.map((mechanism: any) => normalizeForMatch(mechanism.name)).filter(Boolean)),
    [associatedMechanismItems]
  );
  const recommendedMechanismSuggestions = useMemo(
    () => mechanismSuggestions.filter((suggestion) => !associatedMechanismNameSet.has(normalizeForMatch(suggestion.title))),
    [mechanismSuggestions, associatedMechanismNameSet]
  );
  const recommendedMechanismNameSet = useMemo(
    () => new Set(recommendedMechanismSuggestions.map((suggestion) => normalizeForMatch(suggestion.title)).filter(Boolean)),
    [recommendedMechanismSuggestions]
  );
  const reusableCatalogMechanisms = useMemo(() => {
    const query = normalizeForMatch(draftMechanismName);
    return globalMechanisms
      .filter((mechanism: any) => {
        const title = mechanism.title || mechanism.name || "";
        const normalizedTitle = normalizeForMatch(title);
        if (!normalizedTitle) return false;
        if (associatedMechanismNameSet.has(normalizedTitle)) return false;
        if (recommendedMechanismNameSet.has(normalizedTitle)) return false;
        if (!query) return true;
        const haystack = normalizeForMatch([title, mechanism.description, mechanism.mechanism_type].filter(Boolean).join(" "));
        return haystack.includes(query);
      })
      .sort((a: any, b: any) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")))
      .slice(0, 8);
  }, [associatedMechanismNameSet, draftMechanismName, globalMechanisms, recommendedMechanismNameSet]);
  const evidenceSuggestions = useMemo(
    () => buildEvidenceSuggestions(
      policy,
      useInternalEvidenceFlow ? selectedInternalMechanismControlContext : selectedMechanism?.policyControl,
      useInternalEvidenceFlow
        ? {
          name: selectedInternalMechanism?.targetLabel || selectedInternalMechanism?.raw?.mechanism_title,
          description: selectedInternalMechanism?.raw?.mechanism_description,
          evidences: [],
        }
        : selectedMechanism,
      generatedEvidence
    ),
    [policy, useInternalEvidenceFlow, selectedInternalMechanismControlContext, selectedInternalMechanism, selectedMechanism, generatedEvidence]
  );
  const associatedEvidenceItems = useMemo(
    () => useInternalEvidenceFlow
      ? selectedMechanismEvidenceLinks
        .filter((link: any) => String(link.link_type || link.raw?.link_type || "") !== "required_by")
        .map((link: any) => ({
          id: link.sourceId || link.raw?.evidence_item || link.id,
          linkId: link.id,
          title: link.sourceLabel || link.raw?.evidence_title || "Evidencia",
          description: link.rationale || "",
          evidence_type: link.raw?.evidence_type || "",
          status: link.raw?.evidence_status || link.validation_status || "",
          validation_status: link.validation_status,
          meta: `${link.link_type || "evidences"} · ${link.validation_status || "draft"}`,
        }))
      : (selectedMechanism?.evidences || []).map((evidence: any) => ({
        id: evidence.id,
        linkId: evidence.id,
        title: evidence.title || "Evidencia",
        description: evidence.description || "",
        evidence_type: evidence.evidence_type || "",
        status: evidence.status || "pending_review",
        validation_status: evidence.status || "pending_review",
        meta: evidence.status || "pending_review",
      })),
    [selectedMechanism, selectedMechanismEvidenceLinks, useInternalEvidenceFlow]
  );
  const associatedEvidenceNameSet = useMemo(
    () => new Set(associatedEvidenceItems.map((evidence: any) => normalizeForMatch(evidence.title)).filter(Boolean)),
    [associatedEvidenceItems]
  );
  const controlEvidenceCandidateItems = useMemo(
    () => selectedInternalControlEvidenceLinks
      .map((link: any) => ({
        id: link.sourceId || link.raw?.evidence_item || link.id,
        linkId: link.id,
        title: link.sourceLabel || link.raw?.evidence_title || "Evidencia",
        description: link.rationale || "",
        evidence_type: link.raw?.evidence_type || "",
        status: link.raw?.evidence_status || link.validation_status || "",
        validation_status: link.validation_status,
        meta: `controlo interno - ${link.link_type || "evidences"} - ${link.validation_status || "draft"}`,
      }))
      .filter((evidence: any) => !associatedEvidenceNameSet.has(normalizeForMatch(evidence.title))),
    [associatedEvidenceNameSet, selectedInternalControlEvidenceLinks]
  );
  const controlEvidenceCandidateNameSet = useMemo(
    () => new Set(controlEvidenceCandidateItems.map((evidence: any) => normalizeForMatch(evidence.title)).filter(Boolean)),
    [controlEvidenceCandidateItems]
  );
  const recommendedEvidenceSuggestions = useMemo(
    () => evidenceSuggestions.filter((suggestion) => {
      const name = normalizeForMatch(suggestion.title);
      return !associatedEvidenceNameSet.has(name) && !controlEvidenceCandidateNameSet.has(name);
    }),
    [associatedEvidenceNameSet, controlEvidenceCandidateNameSet, evidenceSuggestions]
  );
  const recommendedEvidenceNameSet = useMemo(
    () => new Set(recommendedEvidenceSuggestions.map((suggestion) => normalizeForMatch(suggestion.title)).filter(Boolean)),
    [recommendedEvidenceSuggestions]
  );
  const reusableEvidenceCatalog = useMemo(() => {
    const query = normalizeForMatch(draftEvidenceTitle);
    return evidenceCatalog
      .filter((evidence: any) => {
        const title = evidence.title || "";
        const normalizedTitle = normalizeForMatch(title);
        if (!normalizedTitle) return false;
        if (associatedEvidenceNameSet.has(normalizedTitle)) return false;
        if (controlEvidenceCandidateNameSet.has(normalizedTitle)) return false;
        if (recommendedEvidenceNameSet.has(normalizedTitle)) return false;
        if (!query) return true;
        const haystack = normalizeForMatch([title, evidence.description, evidence.source, evidence.external_reference, evidence.evidence_type].filter(Boolean).join(" "));
        return haystack.includes(query);
      })
      .sort((a: any, b: any) => String(a.title || "").localeCompare(String(b.title || "")))
      .slice(0, 8);
  }, [associatedEvidenceNameSet, controlEvidenceCandidateNameSet, draftEvidenceTitle, evidenceCatalog, recommendedEvidenceNameSet]);
  const impactDraftName = draftMechanismName.trim() || mechanismSuggestions[0]?.title || selectedMechanism?.name || "";
  const impactCandidates = useMemo(
    () => buildImpactCandidates({
      mechanismName: impactDraftName,
      selectedPolicyControl,
      controlsCatalog,
      globalMechanisms,
      globalControlMechanisms,
    }),
    [impactDraftName, selectedPolicyControl, controlsCatalog, globalMechanisms, globalControlMechanisms]
  );
  const impactCandidateKey = useMemo(
    () => impactCandidates.map((item) => `${item.control.id}:${item.defaultSelected ? "1" : "0"}`).join("|"),
    [impactCandidates]
  );
  const selectedImpactCandidates = useMemo(
    () => impactCandidates.filter((item) => selectedImpactControlIds.includes(String(item.control.id))),
    [impactCandidates, selectedImpactControlIds]
  );
  const selectedImpactFrameworkCount = useMemo(
    () => new Set(selectedImpactCandidates.map((item) => item.control.framework || item.control.framework_name).filter(Boolean)).size,
    [selectedImpactCandidates]
  );
  const filteredControls = useMemo(() => {
    const query = controlSearch.trim().toLowerCase();
    return controlsCatalog
      .filter((control) => {
        if (linkedControlIds.has(String(control.id))) return false;
        if (frameworkFilter && String(control.framework) !== frameworkFilter) return false;
        if (!query) return true;

        const haystack = [
          control.code,
          control.title,
          control.description,
          control.framework_name,
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [controlsCatalog, controlSearch, frameworkFilter, linkedControlIds]);
  const internalDomainOptions = useMemo(
    () =>
      Array.from(new Set(
        internalControlsCatalog
          .map((option: any) => option.raw?.control_domain || option.meta)
          .filter(Boolean)
      )).sort(),
    [internalControlsCatalog]
  );
  const filteredInternalControls = useMemo(() => {
    const query = controlSearch.trim().toLowerCase();
    return internalControlsCatalog
      .filter((option: any) => {
        if (linkedInternalControlIds.has(String(option.id))) return false;
        if (internalDomainFilter && String(option.raw?.control_domain || option.meta || "") !== internalDomainFilter) return false;
        if (!query) return true;

        const haystack = [
          option.label,
          option.description,
          option.meta,
          option.raw?.code,
          option.raw?.title,
          option.raw?.description,
          option.raw?.objective,
          option.raw?.control_domain,
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [controlSearch, internalControlsCatalog, internalDomainFilter, linkedInternalControlIds]);
  const recommendationItems = useMemo(() => {
    if (Array.isArray(recommendations?.recommendations)) return recommendations.recommendations;
    if (Array.isArray(recommendations?.results)) return recommendations.results;
    return [];
  }, [recommendations]);
  const internalRecommendationItems = useMemo(() => {
    if (Array.isArray(recommendations?.internal_recommendations)) return recommendations.internal_recommendations;
    return [];
  }, [recommendations]);
  const actionableInternalRecommendationItems = useMemo(
    () => internalRecommendationItems.filter((item: any) => {
      const internalControlId = internalRecommendationId(item);
      return internalControlId && !linkedInternalControlIds.has(internalControlId);
    }),
    [internalRecommendationItems, linkedInternalControlIds]
  );
  const actionableRecommendationItems = useMemo(
    () => recommendationItems.filter((item: any) => {
      const controlId = recommendationControlId(item);
      return controlId && !linkedControlIds.has(controlId);
    }),
    [recommendationItems, linkedControlIds]
  );
  const onboardingSteps = useMemo(() => [
    {
      label: "Responsabilidade",
      status: policy?.owner_display || policy?.owner ? "Pronto" : "Em falta",
    },
    {
      label: "Controlos",
      status: `${displayedControlCount} associados`,
    },
    {
      label: "Mecanismos",
      status: `${displayedMechanismCount} associados`,
    },
    {
      label: "Evidencias",
      status: useInternalEvidenceFlow
        ? `${mechanismExpectedEvidenceCount} tipos, ${mechanismActualEvidenceCount} reais`
        : `${displayedEvidenceCount} associadas`,
    },
    {
      label: "Revisao",
      status: score > 0 ? `${score}%` : "Por validar",
    },
  ], [policy, displayedControlCount, displayedMechanismCount, useInternalEvidenceFlow, mechanismExpectedEvidenceCount, mechanismActualEvidenceCount, displayedEvidenceCount, score]);

  useEffect(() => {
    if (!controls.length) {
      if (selectedPolicyControlId) setSelectedPolicyControlId("");
      return;
    }

    const selectedStillExists = controls.some((policyControl: any) => String(policyControl.id) === String(selectedPolicyControlId));
    if (!selectedStillExists) {
      setSelectedPolicyControlId(controls[0].id);
    }
  }, [controls, selectedPolicyControlId]);

  useEffect(() => {
    if (!internalControlMappings.length) {
      if (selectedPolicyInternalControlId) setSelectedPolicyInternalControlId("");
      return;
    }

    const selectedStillExists = internalControlMappings.some((mapping: any) => String(mapping.id) === String(selectedPolicyInternalControlId));
    if (!selectedStillExists) {
      setSelectedPolicyInternalControlId(internalControlMappings[0].id);
    }
  }, [internalControlMappings, selectedPolicyInternalControlId]);

  useEffect(() => {
    const mechanismPool = internalControlMechanismMappings.length ? internalControlMechanismMappings : allMechanisms;
    if (!mechanismPool.length) {
      if (selectedMechanismId) setSelectedMechanismId("");
      return;
    }

    const selectedStillExists = mechanismPool.some((mechanism: any) => String(mechanism.id) === String(selectedMechanismId));
    if (!selectedStillExists) {
      setSelectedMechanismId(mechanismPool[0].id);
    }
  }, [allMechanisms, internalControlMechanismMappings, selectedMechanismId]);

  useEffect(() => {
    const validIds = new Set(impactCandidates.map((item) => String(item.control.id)));
    const currentControlId = selectedControlId(selectedPolicyControl);

    setSelectedImpactControlIds((current) => {
      const next = current.filter((controlId) => validIds.has(String(controlId)));
      if (currentControlId && validIds.has(currentControlId) && !next.includes(currentControlId)) {
        next.push(currentControlId);
      }
      if (!next.length || (currentControlId && next.length === 1 && next[0] === currentControlId)) {
        impactCandidates
          .filter((item) => item.defaultSelected)
          .forEach((item) => {
            const controlId = String(item.control.id);
            if (!next.includes(controlId)) next.push(controlId);
          });
      }
      return next;
    });
  }, [impactCandidates, impactCandidateKey, selectedPolicyControl]);

  const createSuggestedImplementationPack = async (policyControlId: string) => {
    const mechanismNames = generatedMechanisms.length
      ? generatedMechanisms
      : ["Procedimento de implementacao e revisao"];
    const evidenceDescription = generatedEvidence.length
      ? generatedEvidence.map((item) => `- ${item}`).join("\n")
      : "- Evidencia de implementacao e revisao";

    for (const mechanismName of mechanismNames.slice(0, 5)) {
      const mechanism = await governanceApi.createPolicyMechanism({
        policy_control: policyControlId,
        name: truncate(mechanismName),
        description: "Criado como rascunho a partir da estrutura da politica. Deve ser validado e afinado manualmente.",
        mechanism_type: classifyMechanismType(mechanismName),
        implementation_status: "not_started",
        responsible: policy?.owner_display || policy?.owner || "",
        progress: 0,
        notes: "Gerado apos mapeamento de controlo. Rever owner, prazos e aplicabilidade.",
      });

      await governanceApi.createPolicyEvidence({
        mechanism: mechanism.id,
        title: truncate(`Evidencias esperadas - ${mechanismName}`),
        evidence_type: "document",
        description: evidenceDescription,
        status: "pending_review",
      });
    }
  };

  const resolveImpactControlIds = (name: string, policyControlId: string) => {
    const policyControl = controls.find((item: any) => String(item.id) === String(policyControlId)) || selectedPolicyControl;
    const candidates = buildImpactCandidates({
      mechanismName: name,
      selectedPolicyControl: policyControl,
      controlsCatalog,
      globalMechanisms,
      globalControlMechanisms,
    });
    const candidateIds = new Set(candidates.map((item) => String(item.control.id)));
    const selectedIds = selectedImpactControlIds.filter((controlId) => candidateIds.has(String(controlId)));
    const defaultIds = candidates.filter((item) => item.defaultSelected).map((item) => String(item.control.id));
    const baseControlId = selectedControlId(policyControl);
    return Array.from(new Set([baseControlId, ...(selectedIds.length ? selectedIds : defaultIds)].filter(Boolean)));
  };

  const ensurePolicyControlForImpact = async (controlId: string, mechanismName: string) => {
    const existing = controls.find((item: any) => String(item.control) === String(controlId));
    if (existing) return existing;
    if (!id) throw new Error("Politica nao identificada.");

    const catalogControl = controlsCatalog.find((control) => String(control.id) === String(controlId));
    return governanceApi.createPolicyControl({
      policy: id,
      control: controlId,
      rationale: `Associado pelo impacto multi-framework do mecanismo "${truncate(mechanismName, 120)}".`,
      applicability: catalogControl?.is_mandatory ? "mandatory" : "recommended",
      priority: catalogControl?.is_mandatory ? "high" : "medium",
      progress: mechanismImplemented ? 100 : 50,
    });
  };

  const createPolicyMechanismForImpact = async (
    policyControl: any,
    name: string,
    source: "manual" | "assistant",
    rationale?: string
  ) => {
    const existing = (policyControl?.mechanisms || []).find((mechanism: any) =>
      normalizeForMatch(mechanism.name) === normalizeForMatch(name)
    );
    if (existing) return existing;

    return governanceApi.createPolicyMechanism({
      policy_control: policyControl.id,
      name: truncate(name),
      description: source === "assistant"
        ? rationale || "Rascunho recomendado pelo assistente para validacao do CISO."
        : "Mecanismo associado manualmente durante o onboarding da politica.",
      mechanism_type: classifyMechanismType(name),
      implementation_status: mechanismImplemented ? "implemented" : "in_progress",
      responsible: policy?.owner_display || policy?.owner || "",
      progress: mechanismImplemented ? 100 : 50,
      notes: "Criado no onboarding da politica com impacto multi-framework. Rever prazos, responsavel, evidencia e aplicabilidade.",
    });
  };

  const findOrCreateReusableMechanism = async (name: string, rationale?: string, controlContext = selectedMechanismControlContext) => {
    const exactLocal = globalMechanisms.find((mechanism) =>
      normalizeForMatch(mechanism.title) === normalizeForMatch(name)
    );
    if (exactLocal) return exactLocal;

    const semanticMatch = findReusableMechanismMatch(name, controlContext, globalMechanisms);
    if (semanticMatch) return semanticMatch;

    const searchData = await governanceApi.listMechanisms({ search: name, page_size: 50 });
    const exactSearch = unwrapList(searchData).find((mechanism: any) =>
      normalizeForMatch(mechanism.title) === normalizeForMatch(name)
    );
    if (exactSearch) return exactSearch;

    return governanceApi.createMechanism({
      title: truncate(name),
      description: rationale || "Mecanismo reutilizavel registado a partir do onboarding de uma politica.",
      mechanism_type: reusableMechanismType(name),
    });
  };

  const createExpectedEvidenceLinksForMechanism = async (
    mechanismId: string,
    mechanismName: string,
    controlContext: any,
    existingLinks: any[] = [],
    maxSuggestions = 3
  ) => {
    const alreadyLinkedNames = new Set(
      existingLinks.map((link: any) => normalizeForMatch(link.sourceLabel || link.raw?.evidence_title)).filter(Boolean)
    );
    let requirementSuggestions: Array<{ title: string; rationale: string; evidence_type?: string; description?: string }> = [];
    try {
      const domain = controlContext?.control_details?.control_domain || controlContext?.control_domain || "";
      const requirements = await mappingReviewApi.getMechanismEvidenceRequirements(mechanismId, {
        control_domain: domain,
        limit: maxSuggestions,
      });
      requirementSuggestions = unwrapList(requirements).map((requirement: any) => ({
        title: requirement.title,
        rationale: requirement.rationale || requirement.description || "Requisito de evidencia esperado para este mecanismo.",
        description: requirement.description,
        evidence_type: requirement.evidence_type || "report",
      }));
    } catch (err) {
      console.warn("Nao foi possivel obter requisitos de evidencia do catalogo.", err);
    }

    const fallbackSuggestions = buildEvidenceSuggestions(
      policy,
      controlContext,
      { name: mechanismName, description: "" },
      generatedEvidence
    );
    const suggestions = uniqueSuggestions([...requirementSuggestions, ...fallbackSuggestions])
      .filter((suggestion) => !alreadyLinkedNames.has(normalizeForMatch(suggestion.title)))
      .slice(0, maxSuggestions);

    let created = 0;
    for (const suggestion of suggestions) {
      const title = truncate(suggestion.title);
      const existingEvidence = evidenceCatalog.find((item: any) => normalizeForMatch(item.title) === normalizeForMatch(title));
      const evidenceItem = existingEvidence || await mappingReviewApi.createEvidenceItem({
        title,
        description: suggestion.description || `Evidencia esperada para demonstrar o mecanismo "${truncate(mechanismName, 120)}". ${suggestion.rationale}`,
        evidence_type: suggestion.evidence_type || "report",
        status: "draft",
        confidence_level: 0,
        owner: policy?.owner_display || policy?.owner || "",
      });

      await mappingReviewApi.createEvidenceLink({
        evidence_item: evidenceItem.id,
        target_type: "mechanism",
        target_id: mechanismId,
        link_type: "required_by",
        rationale: `Evidencia esperada para validar a implementacao do mecanismo. ${suggestion.rationale}`,
        confidence_score: 0,
      });
      created += 1;
    }

    return created;
  };

  const createMissingExpectedEvidenceForMechanisms = async () => {
    if (!internalMechanismsWithoutEvidence.length) {
      setMappingMessage("Todos os mecanismos associados ja têm evidencias esperadas mapeadas.");
      return;
    }

    setCreatingEvidence(true);
    setError(null);
    setMappingMessage(null);
    try {
      let created = 0;
      for (const mechanism of internalMechanismsWithoutEvidence) {
        const reusableMechanismId = String(mechanism.targetId || mechanism.raw?.mechanism || "");
        if (!reusableMechanismId) continue;

        const internalControlId = String(mechanism.sourceId || mechanism.raw?.internal_control || "");
        const policyMapping = internalControlMappings.find((mapping: any) =>
          internalControlIdFromPolicyMapping(mapping) === internalControlId
        );
        const controlContext = policyMapping
          ? internalControlContextFromPolicyMapping(policyMapping)
          : selectedInternalMechanismControlContext;

        created += await createExpectedEvidenceLinksForMechanism(
          reusableMechanismId,
          mechanism.targetLabel || mechanism.raw?.mechanism_title || "Mecanismo",
          controlContext,
          evidenceLinksByMechanismId.get(reusableMechanismId) || [],
          1
        );
      }

      setMappingMessage(
        created
          ? `${created} evidencia(s) esperadas foram criadas e ligadas diretamente aos mecanismos.`
          : "Nao foi necessario criar novas evidencias esperadas."
      );
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel gerar evidencias esperadas para os mecanismos.");
    } finally {
      setCreatingEvidence(false);
    }
  };

  const createSuggestedInternalImplementationPack = async (policyInternalControlMapping: any, sourceItem: any) => {
    const controlMeta = sourceItem?.raw || sourceItem || {};
    const internalControlId = internalControlIdFromPolicyMapping(policyInternalControlMapping) || String(controlMeta.id || "");
    if (!internalControlId) return { createdMechanisms: 0, createdEvidence: 0, reusedMechanisms: 0 };

    const existingMappings = await mappingReviewApi
      .listMappings("internal_control_mechanism", { internal_control: internalControlId, page_size: 1000 })
      .catch(() => []);

    if (existingMappings.length) {
      return { createdMechanisms: 0, createdEvidence: 0, reusedMechanisms: existingMappings.length };
    }

    const normalizedPolicyControl = {
      ...policyInternalControlMapping,
      targetId: internalControlId,
      targetLabel: policyInternalControlMapping?.targetLabel || [controlMeta.code, controlMeta.title].filter(Boolean).join(" - "),
      raw: {
        ...(policyInternalControlMapping?.raw || policyInternalControlMapping || {}),
        internal_control: internalControlId,
        internal_control_code: policyInternalControlMapping?.internal_control_code || controlMeta.code,
        internal_control_title: policyInternalControlMapping?.internal_control_title || controlMeta.title,
        internal_control_description: policyInternalControlMapping?.internal_control_description || controlMeta.description,
        internal_control_domain: policyInternalControlMapping?.internal_control_domain || controlMeta.control_domain,
        applicability: policyInternalControlMapping?.applicability || "recommended",
      },
    };
    const controlContext = internalControlContextFromPolicyMapping(normalizedPolicyControl);
    const suggestions = buildMechanismSuggestions(policy, controlContext, generatedMechanisms).slice(0, 5);
    let createdMechanisms = 0;
    let createdEvidence = 0;

    for (const suggestion of suggestions) {
      const reusableMechanism = await findOrCreateReusableMechanism(suggestion.title, suggestion.rationale, controlContext);
      const mechanismMapping = await mappingReviewApi.createInternalControlMechanism({
        internal_control: internalControlId,
        mechanism: reusableMechanism.id,
        contribution_weight: 100,
        mandatory: normalizedPolicyControl.raw.applicability === "mandatory",
        implementation_status: mechanismImplemented ? "implemented" : "planned",
        relationship_type: "supporting",
        rationale: `Rascunho criado automaticamente no onboarding da politica. ${suggestion.rationale}`,
        confidence_score: 0,
      });

      if (mechanismMapping?.id) createdMechanisms += 1;

      const linkedEvidence = await mappingReviewApi
        .listMappings("evidence_link", { target_type: "mechanism", target_id: reusableMechanism.id, page_size: 1000 })
        .catch(() => []);

      if (!linkedEvidence.length) {
        createdEvidence += await createExpectedEvidenceLinksForMechanism(
          String(reusableMechanism.id),
          reusableMechanism.title || suggestion.title,
          controlContext,
          linkedEvidence,
          1
        );
      }
    }

    return { createdMechanisms, createdEvidence, reusedMechanisms: 0 };
  };

  const ensureControlMechanismForImpact = async (controlId: string, mechanismId: string, name: string) => {
    const existingLocal = globalControlMechanisms.find((item) =>
      String(item.control) === String(controlId) && String(item.mechanism) === String(mechanismId)
    );
    if (existingLocal) return existingLocal;

    const existingData = await governanceApi.listControlMechanisms({ control: controlId, mechanism: mechanismId, page_size: 20 });
    const existing = unwrapList(existingData).find((item: any) =>
      String(item.control) === String(controlId) && String(item.mechanism) === String(mechanismId)
    );
    if (existing) return existing;

    try {
      return await governanceApi.createControlMechanism({
        control: controlId,
        mechanism: mechanismId,
        status: mechanismImplemented ? "Implementado" : "Em implementação",
        responsible: policy?.owner_display || policy?.owner || "",
        acceptance_criteria: `O mecanismo "${truncate(name, 140)}" deve estar implementado, revisto pelo owner e suportado por evidencia auditavel.`,
      });
    } catch (err) {
      const retryData = await governanceApi.listControlMechanisms({ control: controlId, mechanism: mechanismId, page_size: 20 });
      const retryExisting = unwrapList(retryData).find((item: any) =>
        String(item.control) === String(controlId) && String(item.mechanism) === String(mechanismId)
      );
      if (retryExisting) return retryExisting;
      throw err;
    }
  };

  const refreshComplianceAndMappings = async () => {
    await Promise.allSettled([
      governanceApi.rebuildControlMappings(1),
      governanceApi.analyzeComplianceGaps(),
    ]);
  };

  const createMechanismForControl = async (
    policyControlId: string,
    mechanismName: string,
    source: "manual" | "assistant",
    rationale?: string
  ) => {
    const name = mechanismName.trim();
    if (!policyControlId) {
      setError("Seleciona primeiro um controlo para associar o mecanismo.");
      return;
    }
    if (!name) {
      setError("Escreve ou seleciona o nome do mecanismo antes de associar.");
      return;
    }

    setCreatingMechanism(true);
    setError(null);
    setMappingMessage(null);
    try {
      const impactControlIds = resolveImpactControlIds(name, policyControlId);
      const reusableMechanism = await findOrCreateReusableMechanism(name, rationale);
      const createdPolicyMechanisms = [];
      const affectedFrameworks = new Set<string>();

      for (const controlId of impactControlIds) {
        const policyControl = await ensurePolicyControlForImpact(controlId, name);
        const policyMechanism = await createPolicyMechanismForImpact(policyControl, name, source, rationale);
        createdPolicyMechanisms.push(policyMechanism);
        await ensureControlMechanismForImpact(controlId, reusableMechanism.id, name);

        const control = controlsCatalog.find((item) => String(item.id) === String(controlId)) || policyControl?.control_details;
        if (control?.framework || control?.framework_name) {
          affectedFrameworks.add(String(control.framework || control.framework_name));
        }
      }

      const preferredMechanism = createdPolicyMechanisms.find((item: any) => String(item.policy_control) === String(policyControlId)) || createdPolicyMechanisms[0];
      if (preferredMechanism?.id) setSelectedMechanismId(preferredMechanism.id);
      setDraftMechanismName("");
      setLastImpactSummary({
        controls: impactControlIds.length,
        frameworks: affectedFrameworks.size,
        mechanism: reusableMechanism.title || name,
      });
      setMappingMessage(`Mecanismo aplicado a ${impactControlIds.length} controlo(s) em ${affectedFrameworks.size || 1} framework(s).`);
      await refreshComplianceAndMappings();
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel associar o mecanismo.");
    } finally {
      setCreatingMechanism(false);
    }
  };

  const createMechanismForInternalControl = async (
    policyInternalControlId: string,
    mechanismName: string,
    source: "manual" | "assistant",
    rationale?: string
  ) => {
    const name = mechanismName.trim();
    const policyInternalControl = internalControlMappings.find((mapping: any) => String(mapping.id) === String(policyInternalControlId));
    const internalControlId = internalControlIdFromPolicyMapping(policyInternalControl);

    if (!internalControlId) {
      setError("Seleciona primeiro um controlo interno para associar o mecanismo.");
      return;
    }
    if (!name) {
      setError("Escreve ou seleciona o nome do mecanismo antes de associar.");
      return;
    }

    setCreatingMechanism(true);
    setError(null);
    setMappingMessage(null);
    try {
      const controlContext = internalControlContextFromPolicyMapping(policyInternalControl);
      const reusableMechanism = await findOrCreateReusableMechanism(name, rationale, controlContext);
      const existing = internalControlMechanismMappings.find((mapping: any) =>
        String(mapping.sourceId || mapping.raw?.internal_control) === String(internalControlId) &&
        String(mapping.targetId || mapping.raw?.mechanism) === String(reusableMechanism.id)
      );
      let mechanismMapping = existing;

      if (!existing) {
        mechanismMapping = await mappingReviewApi.createInternalControlMechanism({
          internal_control: internalControlId,
          mechanism: reusableMechanism.id,
          contribution_weight: 100,
          mandatory: policyInternalControl?.raw?.applicability === "mandatory",
          implementation_status: mechanismImplemented ? "implemented" : "planned",
          relationship_type: "primary",
          rationale: rationale || (
            source === "assistant"
              ? "Mecanismo sugerido pelo assistente e associado ao controlo interno para validacao humana."
              : "Mecanismo selecionado no onboarding da politica e associado ao controlo interno para validacao humana."
          ),
          confidence_score: 0,
        });
      }

      const linkedEvidence = await mappingReviewApi
        .listMappings("evidence_link", { target_type: "mechanism", target_id: reusableMechanism.id, page_size: 1000 })
        .catch(() => []);
      const expectedEvidenceCreated = linkedEvidence.length
        ? 0
        : await createExpectedEvidenceLinksForMechanism(
          String(reusableMechanism.id),
          reusableMechanism.title || name,
          controlContext,
          linkedEvidence
        );

      if (mechanismMapping?.id) {
        setSelectedMechanismId(String(mechanismMapping.id));
      }

      setDraftMechanismName("");
      setLastImpactSummary({
        controls: 1,
        frameworks: 0,
        mechanism: reusableMechanism.title || name,
      });
      setMappingMessage(linkedEvidence.length
        ? `Mecanismo associado e ${linkedEvidence.length} evidencia(s) ficaram selecionadas automaticamente pelo mapping do mecanismo.`
        : expectedEvidenceCreated
          ? `Mecanismo associado e ${expectedEvidenceCreated} evidencia(s) esperadas foram criadas diretamente no mecanismo.`
        : existing
          ? "Esse mecanismo ja estava associado ao controlo interno, mas ainda nao tem evidencias mapeadas."
          : "Mecanismo associado ao controlo interno em draft. Ainda nao tem evidencias mapeadas."
      );
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel associar o mecanismo ao controlo interno.");
    } finally {
      setCreatingMechanism(false);
    }
  };

  const createEvidenceForMechanism = async (
    mechanismId: string,
    evidenceTitle: string,
    source: "manual" | "assistant",
    rationale?: string
  ) => {
    const title = evidenceTitle.trim();
    if (!mechanismId) {
      setError("Seleciona primeiro um mecanismo para associar a evidencia.");
      return;
    }
    if (!title) {
      setError("Escreve o titulo da evidencia antes de criar.");
      return;
    }

    setCreatingEvidence(true);
    setError(null);
    setMappingMessage(null);
    try {
      const selected = allMechanisms.find((mechanism: any) => String(mechanism.id) === String(mechanismId));
      const mechanismName = selected?.name || "";
      const peerMechanisms = mechanismName
        ? allMechanisms.filter((mechanism: any) => normalizeForMatch(mechanism.name) === normalizeForMatch(mechanismName))
        : allMechanisms.filter((mechanism: any) => String(mechanism.id) === String(mechanismId));
      const evidenceDescription = source === "assistant"
        ? rationale || "Evidencia esperada recomendada pelo assistente. Deve ser substituida ou validada com evidencia real."
        : "Evidencia real registada manualmente durante o onboarding da politica, sem ficheiro anexado.";

      let policyEvidenceCreated = 0;
      for (const mechanism of peerMechanisms.length ? peerMechanisms : [{ id: mechanismId, evidences: [] }]) {
        const exists = (mechanism.evidences || []).some((evidence: any) =>
          normalizeForMatch(evidence.title) === normalizeForMatch(title)
        );
        if (exists) continue;

        await governanceApi.createPolicyEvidence({
          mechanism: mechanism.id,
          title: truncate(title),
          evidence_type: "document",
          description: evidenceDescription,
          status: "pending_review",
        });
        policyEvidenceCreated += 1;
      }

      let reusableEvidenceCreated = 0;
      if (mechanismName) {
        const reusableMechanism =
          findReusableMechanismMatch(mechanismName, selected?.policyControl, globalMechanisms) ||
          globalMechanisms.find((mechanism) => normalizeForMatch(mechanism.title) === normalizeForMatch(mechanismName));

        if (reusableMechanism?.id) {
          const relationData = await governanceApi.listControlMechanisms({ mechanism: reusableMechanism.id, page_size: 1000 });
          const relations = unwrapList(relationData);
          for (const relation of relations) {
            const exists = (relation.evidences || []).some((evidence: any) =>
              normalizeForMatch(evidence.title) === normalizeForMatch(title)
            );
            if (exists) continue;

            await governanceApi.createMechanismEvidence({
              control_mechanism: relation.id,
              title: truncate(title),
              description: evidenceDescription,
            });
            reusableEvidenceCreated += 1;
          }
        }
      }

      setDraftEvidenceTitle("");
      setMappingMessage(`Evidencia criada e refletida em ${policyEvidenceCreated} mecanismo(s) da politica e ${reusableEvidenceCreated} relacao(oes) multi-framework.`);
      await refreshComplianceAndMappings();
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel criar a evidencia.");
    } finally {
      setCreatingEvidence(false);
    }
  };

  const startCollectingActualEvidence = (mechanism: any, expectedEvidence?: any) => {
    setSelectedMechanismId(String(mechanism.id));
    setCollectingActualEvidenceFor({
      mechanismMappingId: String(mechanism.id),
      mechanismId: String(mechanism.mechanismId || ""),
      mechanismLabel: mechanism.mechanismLabel || "Mecanismo",
      expectedEvidenceId: expectedEvidence?.id || "",
      expectedTitle: expectedEvidence?.title || "",
    });
    setActualEvidenceDraft({
      title: expectedEvidence?.title ? `Evidencia real - ${expectedEvidence.title}` : `Evidencia real - ${mechanism.mechanismLabel || "Mecanismo"}`,
      description: expectedEvidence?.title
        ? `Evidencia recolhida para satisfazer o tipo esperado: ${expectedEvidence.title}.`
        : `Evidencia recolhida para demonstrar o mecanismo ${mechanism.mechanismLabel || "selecionado"}.`,
      evidence_type: expectedEvidence?.type || "report",
      status: "pending_review",
      confidence_level: "70",
      source: "",
      external_reference: "",
    });
    setActualEvidenceFile(null);
    setError(null);
    setMappingMessage(null);
  };

  const createActualEvidenceForInternalMechanism = async () => {
    if (!collectingActualEvidenceFor?.mechanismId) {
      setError("Seleciona primeiro um mecanismo para anexar evidencia real.");
      return;
    }

    const title = actualEvidenceDraft.title.trim();
    if (!title) {
      setError("Escreve o titulo da evidencia real.");
      return;
    }

    const confidenceLevel = Number(actualEvidenceDraft.confidence_level);
    if (Number.isNaN(confidenceLevel) || confidenceLevel < 0 || confidenceLevel > 100) {
      setError("A confianca da evidencia deve estar entre 0 e 100.");
      return;
    }

    const rationale = actualEvidenceDraft.description.trim() ||
      `Evidencia real recolhida para ${collectingActualEvidenceFor.expectedTitle || collectingActualEvidenceFor.mechanismLabel}.`;

    setCreatingEvidence(true);
    setError(null);
    setMappingMessage(null);
    try {
      const formData = new FormData();
      formData.append("title", truncate(title));
      formData.append("description", rationale);
      formData.append("evidence_type", actualEvidenceDraft.evidence_type);
      formData.append("status", actualEvidenceDraft.status);
      formData.append("confidence_level", String(confidenceLevel));
      formData.append("owner", policy?.owner_display || policy?.owner || "");
      if (actualEvidenceDraft.source.trim()) formData.append("source", actualEvidenceDraft.source.trim());
      if (actualEvidenceDraft.external_reference.trim()) formData.append("external_reference", actualEvidenceDraft.external_reference.trim());
      if (actualEvidenceFile) formData.append("file", actualEvidenceFile);

      const evidenceItem = await mappingReviewApi.createEvidenceItem(formData);
      await mappingReviewApi.createEvidenceLink({
        evidence_item: evidenceItem.id,
        target_type: "mechanism",
        target_id: collectingActualEvidenceFor.mechanismId,
        link_type: "evidences",
        rationale,
        confidence_score: confidenceLevel,
      });

      setCollectingActualEvidenceFor(null);
      setActualEvidenceFile(null);
      setMappingMessage("Evidencia real criada e ligada ao mecanismo em draft para validacao humana.");
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel anexar a evidencia real ao mecanismo.");
    } finally {
      setCreatingEvidence(false);
    }
  };

  const createEvidenceForInternalMechanism = async (
    internalMechanismMappingId: string,
    evidenceTitle: string,
    source: "manual" | "assistant",
    rationale?: string
  ) => {
    const title = evidenceTitle.trim();
    const internalMechanism = internalControlMechanismMappings.find((mapping: any) => String(mapping.id) === String(internalMechanismMappingId));
    const mechanismId = String(internalMechanism?.targetId || internalMechanism?.raw?.mechanism || "");

    if (!mechanismId) {
      setError("Seleciona primeiro um mecanismo para associar a evidencia.");
      return;
    }
    if (!title) {
      setError("Escreve o titulo da evidencia antes de criar.");
      return;
    }

    setCreatingEvidence(true);
    setError(null);
    setMappingMessage(null);
    try {
      const evidenceDescription = source === "assistant"
        ? rationale || "Evidencia esperada recomendada pelo assistente. Deve ser substituida ou validada com evidencia real."
        : "Evidencia esperada criada manualmente durante o onboarding da politica.";
      const evidenceItem = await mappingReviewApi.createEvidenceItem({
        title: truncate(title),
        description: evidenceDescription,
        evidence_type: "report",
        status: "draft",
        confidence_level: 0,
        owner: policy?.owner_display || policy?.owner || "",
      });

      await mappingReviewApi.createEvidenceLink({
        evidence_item: evidenceItem.id,
        target_type: "mechanism",
        target_id: mechanismId,
        link_type: "evidences",
        rationale: evidenceDescription,
        confidence_score: 0,
      });

      setDraftEvidenceTitle("");
      setMappingMessage("Evidencia real criada e ligada ao mecanismo em draft para validacao humana.");
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel criar a evidencia para o mecanismo interno.");
    } finally {
      setCreatingEvidence(false);
    }
  };

  const associateEvidenceItemToInternalMechanism = async (evidenceItem: any) => {
    const evidenceItemId = String(evidenceItem?.id || "");
    if (!selectedReusableMechanismId) {
      setError("Seleciona primeiro um mecanismo para associar a evidencia.");
      return;
    }
    if (!evidenceItemId) {
      setError("Evidencia invalida.");
      return;
    }

    const alreadyLinked = mechanismEvidenceLinks.some((link: any) =>
      String(link.sourceId || link.raw?.evidence_item) === evidenceItemId &&
      String(link.targetType || link.raw?.target_type) === "mechanism" &&
      String(link.targetId || link.raw?.target_id) === String(selectedReusableMechanismId)
    );
    if (alreadyLinked) {
      setMappingMessage("Essa evidencia ja esta associada ao mecanismo selecionado.");
      return;
    }

    setCreatingEvidence(true);
    setError(null);
    setMappingMessage(null);
    try {
      await mappingReviewApi.createEvidenceLink({
        evidence_item: evidenceItemId,
        target_type: "mechanism",
        target_id: selectedReusableMechanismId,
        link_type: "evidences",
        rationale: "Evidencia reutilizavel associada ao mecanismo durante o onboarding da politica.",
        confidence_score: 0,
      });

      setMappingMessage("Evidencia reutilizavel associada ao mecanismo em draft para validacao humana.");
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel associar a evidencia ao mecanismo.");
    } finally {
      setCreatingEvidence(false);
    }
  };

  const addInternalControlToPolicy = async (
    internalControlId: string,
    rationale: string,
    sourceItem: any
  ) => {
    if (!id || !internalControlId) return;
    if (linkedInternalControlIds.has(String(internalControlId))) {
      setMappingMessage("Esse controlo interno ja esta associado a esta politica.");
      return;
    }

    setCreatingMapping(true);
    setError(null);
    setMappingMessage(null);
    try {
      const controlMeta = sourceItem?.raw || sourceItem || {};
      const policyInternalControl = await mappingReviewApi.createPolicyInternalControl({
        policy: id,
        internal_control: internalControlId,
        applicability: ["high", "critical"].includes(String(controlMeta.criticality || "").toLowerCase())
          ? "mandatory"
          : "recommended",
        rationale,
        confidence_score: 0,
      });

      let packSummary: Awaited<ReturnType<typeof createSuggestedInternalImplementationPack>> | null = null;
      if (createImplementationPack) {
        packSummary = await createSuggestedInternalImplementationPack(policyInternalControl, sourceItem);
      }

      if (policyInternalControl?.id) {
        setSelectedPolicyInternalControlId(String(policyInternalControl.id));
      }

      setMappingMessage(
        packSummary?.reusedMechanisms
          ? `Controlo interno associado. Este controlo ja tinha ${packSummary.reusedMechanisms} mecanismo(s) no catalogo e ficaram disponiveis neste onboarding.`
          : packSummary?.createdMechanisms
            ? `Controlo interno associado. Foram criados ${packSummary.createdMechanisms} mecanismo(s) e ${packSummary.createdEvidence} tipo(s) de evidencia em rascunho.`
            : "Controlo interno associado a politica em draft para validacao humana."
      );
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel associar o controlo interno a politica.");
    } finally {
      setCreatingMapping(false);
    }
  };

  const addControlToPolicy = async (
    controlId: string,
    rationale: string,
    source: "manual" | "assistant",
    sourceItem: any
  ) => {
    if (!id || !controlId) return;
    if (linkedControlIds.has(String(controlId))) {
      setMappingMessage("Esse controlo ja esta associado a esta politica.");
      return;
    }

    setCreatingMapping(true);
    setError(null);
    setMappingMessage(null);
    try {
      const catalogControl = controlsCatalog.find((control) => String(control.id) === String(controlId));
      const controlMeta = { ...(catalogControl || {}), ...(sourceItem || {}) };
      const policyControl = await governanceApi.createPolicyControl({
        policy: id,
        control: controlId,
        rationale,
        applicability: controlMeta?.is_mandatory ? "mandatory" : "recommended",
        priority: controlMeta?.is_mandatory ? "high" : "medium",
        progress: 0,
      });

      let packFailed = false;
      if (createImplementationPack) {
        try {
          await createSuggestedImplementationPack(policyControl.id);
        } catch (packErr) {
          console.warn(packErr);
          packFailed = true;
        }
      }

      if (source === "assistant") {
        try {
          await governanceApi.createDecisionRecord({
            decision_type: "assistant_recommendation",
            target_type: "policy_control",
            target_id: String(policyControl.id),
            title: `Aceite recomendacao IA: ${recommendationLabel(sourceItem)}`,
            recommendation: recommendationLabel(sourceItem),
            rationale,
            source_snapshot: [{ policy: id, policy_code: policy?.code }, controlMeta],
            score_snapshot: { confidence: sourceItem?.confidence || null },
            decision: "accepted",
            justification: "Recomendacao aceite manualmente no detalhe da politica.",
            decided_by: policy?.owner_display || policy?.owner || "utilizador",
            decided_at: new Date().toISOString(),
          });
        } catch (decisionErr) {
          console.warn(decisionErr);
        }
      }

      setMappingMessage(packFailed
        ? "Controlo associado. Nao foi possivel criar todos os mecanismos/evidencias sugeridos."
        : source === "assistant"
          ? "Recomendacao aceite e controlo associado a politica."
          : "Controlo associado manualmente a politica."
      );
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel associar o controlo a politica.");
    } finally {
      setCreatingMapping(false);
    }
  };

  const renderExportSection = (section: any, level = 1): string => {
    const tag = Math.min(level + 1, 4);
    const title = escapeHtml(section.title || "Sem titulo");
    const number = escapeHtml(section.section_number || section.order || "-");
    const content = escapeHtml(section.content || "");
    const children = (section.subsections || []).map((sub: any) => renderExportSection(sub, level + 1)).join("");
    return `
      <section class="chapter level-${level}">
        <p class="eyebrow">Capitulo ${number}</p>
        <h${tag}>${title}</h${tag}>
        ${content ? `<div class="content">${content}</div>` : ""}
        ${children}
      </section>
    `;
  };

  const renderExportDocuments = () => {
    if (!governanceDocuments.length) return `<p class="muted">Sem documentos subordinados associados.</p>`;
    return `
      <div class="cards">
        ${governanceDocuments.map((document) => `
          <article class="card">
            <p class="eyebrow">${escapeHtml(documentTypeLabel(document.document_type))} · ${escapeHtml(documentStatusLabel(document.status))}</p>
            <h3>${escapeHtml(document.title || "Documento")}</h3>
            <p>${escapeHtml(document.purpose || document.scope || "")}</p>
            <p class="muted">Versao: ${escapeHtml(document.version || "-")} · Secoes: ${escapeHtml(document.sections_count || 0)} · Subordinados: ${escapeHtml(document.children_count || document.children?.length || 0)}</p>
          </article>
        `).join("")}
      </div>
    `;
  };

  const renderExportAiAdvice = () => {
    if (!policyGapAdviceResult) {
      return `
        <div class="card">
          <p class="muted">Ainda nao existe uma analise IA guardada para esta politica. Executa "Analisar gaps IA" antes de exportar se quiseres incluir esta secao.</p>
        </div>
      `;
    }

    return `
      <article class="advice-block">
        <div class="badges">
          <span>${escapeHtml(policyGapAdviceResult.model_used || "Modelo IA")}</span>
          <span>${policyGapAdviceResult.used_rag ? `${escapeHtml(policyGapAdviceResult.sources?.length || 0)} fontes` : "Sem RAG"}</span>
        </div>
        <div class="advice-text">${escapeHtml(policyGapAdviceResult.response || "")}</div>
        ${policyGapAdviceResult.sources?.length ? `
          <div class="sources-block">
            <p class="subhead">Fontes utilizadas</p>
            <ul>
              ${policyGapAdviceResult.sources.slice(0, 8).map((source: any) => `
                <li>
                  <strong>${escapeHtml(assistantSourceLabel(source))}</strong>
                  ${escapeHtml(source.title || source.source_ref || "Fonte")}
                  ${source.content_excerpt ? `<span class="muted"> - ${escapeHtml(truncate(source.content_excerpt, 180))}</span>` : ""}
                </li>
              `).join("")}
            </ul>
          </div>
        ` : ""}
      </article>
    `;
  };

  const renderExportFrameworkMappings = () => {
    const approvedMappings = unwrapList<any>(policyTraceability?.active_mappings?.framework_mappings);
    const pendingMappings = unwrapList<any>(policyTraceability?.relationships?.pending_review_mappings?.framework_mappings);
    const inactiveMappings = unwrapList<any>(policyTraceability?.inactive_mappings?.framework_mappings);
    const frameworksFromTraceability = unwrapList<any>(policyTraceability?.relationships?.frameworks);

    if (!approvedMappings.length && !pendingMappings.length && !inactiveMappings.length && !frameworksFromTraceability.length) {
      return `<p class="muted">Sem mappings para frameworks devolvidos pela traceability.</p>`;
    }

    return `
      ${frameworksFromTraceability.length ? `
        <div class="cards">
          ${frameworksFromTraceability.map((framework: any) => `
            <article class="card">
              <p class="eyebrow">Framework impactada</p>
              <h3>${escapeHtml([framework.code, framework.version].filter(Boolean).join(" "))}</h3>
              <p>${escapeHtml(framework.name || "")}</p>
            </article>
          `).join("")}
        </div>
      ` : ""}
      <table>
        <thead>
          <tr>
            <th>Controlo interno</th>
            <th>Controlo externo</th>
            <th>Framework</th>
            <th>Relação</th>
            <th>Cobertura</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ...approvedMappings.map((mapping: any) => ({ ...mapping, auditStatus: "approved" })),
            ...pendingMappings.map((mapping: any) => ({ ...mapping, auditStatus: "pending_review" })),
            ...inactiveMappings.map((mapping: any) => ({ ...mapping, auditStatus: mapping.validation_status || "inactive" })),
          ].map((mapping: any) => `
            <tr>
              <td>${escapeHtml([mapping.internal_control?.code, mapping.internal_control?.title].filter(Boolean).join(" - "))}</td>
              <td>${escapeHtml([mapping.framework_control?.code, mapping.framework_control?.title].filter(Boolean).join(" - "))}</td>
              <td>${escapeHtml(mapping.framework_control?.framework_code || "")}</td>
              <td>${escapeHtml(mapping.relationship_type || "-")}</td>
              <td>${escapeHtml(mapping.coverage_percentage ?? "-")}%</td>
              <td>${escapeHtml(mapping.auditStatus || mapping.validation_status || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  };

  const renderExportEvidenceSummary = () => {
    const evidenceItems = unwrapList<any>(policyTraceability?.evidence?.items);
    const evidenceLinks = unwrapList<any>(policyTraceability?.evidence?.links);
    const pendingEvidenceLinks = unwrapList<any>(policyTraceability?.evidence?.pending_review_links);
    const inactiveEvidenceLinks = unwrapList<any>(policyTraceability?.evidence?.inactive_links);

    if (!evidenceItems.length && !evidenceLinks.length && !pendingEvidenceLinks.length && !inactiveEvidenceLinks.length) {
      return `<p class="muted">Sem evidências associadas na traceability da política.</p>`;
    }

    return `
      <div class="metrics">
        <div class="metric"><strong>Evidências ativas</strong><span>${escapeHtml(evidenceItems.length)}</span></div>
        <div class="metric"><strong>Links aprovados</strong><span>${escapeHtml(evidenceLinks.length)}</span></div>
        <div class="metric"><strong>Pending review</strong><span>${escapeHtml(pendingEvidenceLinks.length)}</span></div>
        <div class="metric"><strong>Inativas</strong><span>${escapeHtml(inactiveEvidenceLinks.length)}</span></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Evidência</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Validade</th>
            <th>Confiança</th>
          </tr>
        </thead>
        <tbody>
          ${evidenceItems.map((item: any) => `
            <tr>
              <td>${escapeHtml(item.title || "Evidência")}</td>
              <td>${escapeHtml(item.evidence_type || "-")}</td>
              <td>${escapeHtml(item.status || "-")}</td>
              <td>${escapeHtml(formatDate(item.valid_until))}</td>
              <td>${escapeHtml(item.confidence_level ?? "-")}%</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  };

  const renderExportGaps = () => {
    const traceabilityGaps = unwrapList<any>(policyTraceability?.gaps);
    const structuralGaps = [
      internalControlsWithoutMechanisms.length ? {
        severity: "high",
        description: `${internalControlsWithoutMechanisms.length} controlo(s) interno(s) sem mecanismos.`,
        recommendation: "Associar mecanismos reutilizáveis aos controlos internos."
      } : null,
      internalMechanismsWithoutEvidence.length ? {
        severity: "high",
        description: `${internalMechanismsWithoutEvidence.length} mecanismo(s) sem tipo de evidência esperada.`,
        recommendation: "Definir tipos de evidência esperada e recolher evidências reais."
      } : null,
      contextualGovernanceExceptions.length ? {
        severity: "medium",
        description: `${contextualGovernanceExceptions.length} exceção(ões) ou aceitações de risco associadas.`,
        recommendation: "Rever validade, compensatórios e impacto no score."
      } : null,
    ].filter(Boolean);
    const gaps = [...traceabilityGaps, ...structuralGaps];

    if (!gaps.length) return `<p class="muted">Sem gaps devolvidos pela traceability ou pelos indicadores da política.</p>`;

    return `
      <div class="cards">
        ${gaps.map((gap: any) => `
          <article class="card warning-card">
            <p class="eyebrow">${escapeHtml(gap.severity || gap.type || "Gap")}</p>
            <h3>${escapeHtml(gap.description || gap.title || gap.type || "Gap identificado")}</h3>
            <p>${escapeHtml(gap.recommendation || gap.impact || "")}</p>
          </article>
        `).join("")}
      </div>
    `;
  };

  const renderExportDecisions = () => {
    if (!decisionRecords.length) return `<p class="muted">Sem decisões formais associadas a esta política ou ao seu contexto.</p>`;

    return `
      <table>
        <thead>
          <tr>
            <th>Decisão</th>
            <th>Tipo</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Justificação</th>
          </tr>
        </thead>
        <tbody>
          ${decisionRecords.map((record) => `
            <tr>
              <td>${escapeHtml(record.title || record.decision_display || record.decision)}</td>
              <td>${escapeHtml(record.decision_type_display || record.decision_type)}</td>
              <td>${escapeHtml(record.responsible || record.decided_by || "-")}</td>
              <td>${escapeHtml(formatDate(record.due_date))}</td>
              <td>${escapeHtml(truncate(record.justification || record.rationale || record.recommendation || "", 260))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  };

  const renderExportActionPlan = () => {
    if (!governanceActions.length) return `<p class="muted">Sem ações de governação associadas a esta política.</p>`;

    return `
      <div class="metrics">
        <div class="metric"><strong>Total</strong><span>${escapeHtml(governanceActionSummary.total)}</span></div>
        <div class="metric"><strong>Ativas</strong><span>${escapeHtml(governanceActionSummary.active)}</span></div>
        <div class="metric"><strong>Altas/Criticas</strong><span>${escapeHtml(governanceActionSummary.highRisk)}</span></div>
        <div class="metric"><strong>Atrasadas</strong><span>${escapeHtml(governanceActionSummary.overdue)}</span></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Ação</th>
            <th>Alvo</th>
            <th>Tipo</th>
            <th>Prioridade</th>
            <th>Estado</th>
            <th>Owner</th>
            <th>Data-alvo</th>
            <th>Execucao</th>
          </tr>
        </thead>
        <tbody>
          ${sortedGovernanceActions.map((action) => `
            <tr>
              <td>${escapeHtml(action.title)}</td>
              <td>${escapeHtml(actionTargetLabel(action))}</td>
              <td>${escapeHtml(action.action_type_display || actionTypeLabels[action.action_type] || action.action_type)}</td>
              <td>${escapeHtml(action.priority_display || actionPriorityLabels[action.priority] || action.priority)}</td>
              <td>${escapeHtml(action.status_display || actionStatusLabels[action.status] || action.status)}${action.is_overdue ? " - atrasada" : ""}</td>
              <td>${escapeHtml(action.owner || "-")}</td>
              <td>${escapeHtml(formatDate(action.due_date))}</td>
              <td>${escapeHtml(truncate(action.notes || action.recommendation || action.description || "", 220))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  };

  const renderExportTraceabilityScores = () => {
    const scoreEntries = Object.entries(policyTraceability?.scores || {});
    if (!scoreEntries.length) {
      return `<p class="muted">Sem scores adicionais devolvidos pela traceability.</p>`;
    }

    return `
      <div class="cards">
        ${scoreEntries.map(([key, value]: [string, any]) => {
          const scoreValue = value?.score ?? value?.score_avaliado ?? value?.coverage ?? value;
          const statusValue = value?.status || value?.calculation_mode || "";
          return `
            <article class="card">
              <p class="eyebrow">${escapeHtml(key)}</p>
              <h3>${escapeHtml(scoreValue)}${typeof scoreValue === "number" ? "%" : ""}</h3>
              ${statusValue ? `<p>${escapeHtml(statusValue)}</p>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  };

  const renderExportAssistantHistory = () => {
    if (!policyAssistantHistory.length) return "";
    return `
      <div class="sources-block">
        <p class="subhead">Histórico de recomendações incluído no dossier</p>
        <ul>
          ${policyAssistantHistory.slice(0, 10).map((entry) => `
            <li>
              <strong>${escapeHtml(formatDate(entry.created_at))}</strong>
              ${escapeHtml(entry.task_type || "policy_advice")} - ${escapeHtml(truncate(entry.answer || entry.question || "", 180))}
            </li>
          `).join("")}
        </ul>
      </div>
    `;
  };

  const renderExportControlsAndMechanisms = () => {
    if (useInternalMechanismFlow) {
      if (!evidencePlanGroups.length) {
        return `<p class="muted">Existem controlos internos associados, mas ainda nao existem mecanismos ligados a esses controlos.</p>`;
      }
      return evidencePlanGroups.map((group) => `
        <article class="control-block">
          <div class="control-summary">
            <p class="eyebrow">Controlo interno</p>
            <h3>${escapeHtml(group.controlLabel)}</h3>
            <div class="metrics-inline">
              <span>${group.mechanismCount} mecanismos</span>
              <span>${group.expectedEvidenceCount} tipos de evidencia</span>
              <span>${group.actualEvidenceCount} evidencias reais</span>
            </div>
          </div>
          <div class="cards">
            ${group.mechanisms.map((mechanism: any) => `
              <article class="card">
                <p class="eyebrow">Mecanismo</p>
                <h4>${escapeHtml(mechanism.mechanismLabel)}</h4>
                <p class="badges">
                  <span>${escapeHtml(mechanism.relationshipType)}</span>
                  <span>${escapeHtml(mechanism.implementationStatus)}</span>
                  ${mechanism.mandatory ? "<span>Obrigatorio</span>" : ""}
                </p>
                ${exportOptions.evidence ? `
                  <div class="evidence-block">
                    <p class="subhead">Tipos de evidencia esperada</p>
                    ${mechanism.expectedEvidenceLinks.length
                      ? `<ul>${mechanism.expectedEvidenceLinks.map((evidence: any) => `<li>${escapeHtml(evidence.title)} <span class="muted">(${escapeHtml(evidence.itemStatus)})</span></li>`).join("")}</ul>`
                      : `<p class="muted">Sem tipos de evidencia esperada.</p>`}
                    <p class="subhead">Evidencias reais</p>
                    ${mechanism.actualEvidenceLinks.length
                      ? `<ul>${mechanism.actualEvidenceLinks.map((evidence: any) => `<li>${escapeHtml(evidence.title)} <span class="muted">(${escapeHtml(evidence.itemStatus)})</span></li>`).join("")}</ul>`
                      : `<p class="muted">Sem evidencias reais associadas.</p>`}
                  </div>
                ` : ""}
              </article>
            `).join("")}
          </div>
        </article>
      `).join("");
    }

    if (!controls.length) return `<p class="muted">Sem controlos associados.</p>`;
    return controls.map((policyControl: any) => `
      <article class="control-block">
        <div class="control-summary">
          <p class="eyebrow">${escapeHtml(policyControl.control_details?.code || "CTRL")}</p>
          <h3>${escapeHtml(policyControl.control_details?.title || "Controlo")}</h3>
          <p>${escapeHtml(policyControl.rationale || policyControl.control_details?.description || "")}</p>
        </div>
      </article>
    `).join("");
  };

  const openPolicyPdfExport = () => {
    if (!policy) return;
    const title = `${policy.title || "Politica"} - dossier de auditoria`;

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4; margin: 18mm; }
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; line-height: 1.55; }
            header { border-bottom: 2px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 24px; }
            h1 { font-size: 28px; margin: 10px 0 8px; }
            h2 { font-size: 19px; margin: 28px 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
            h3 { font-size: 16px; margin: 6px 0; }
            h4 { font-size: 14px; margin: 6px 0; }
            .eyebrow { color: #4f46e5; font-size: 10px; font-weight: 700; letter-spacing: .08em; margin: 0 0 4px; text-transform: uppercase; }
            .muted { color: #64748b; font-size: 12px; }
            .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
            .meta div, .metric, .card, .control-summary { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
            .meta strong, .metric strong { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
            .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 20px; }
            .metric span { font-size: 20px; font-weight: 800; }
            .chapter, .control-block, .card { break-inside: avoid; page-break-inside: avoid; }
            .chapter { margin: 0 0 18px; }
            .level-2, .level-3 { margin-left: 16px; }
            .content { white-space: pre-line; font-size: 13px; margin-top: 8px; }
            .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .control-block { margin: 0 0 18px; }
            .advice-block { border: 1px solid #ddd6fe; border-radius: 12px; background: #f5f3ff; padding: 14px; }
            .advice-text { white-space: pre-wrap; font-size: 13px; margin-top: 12px; }
            .sources-block { margin-top: 14px; border-top: 1px solid #ddd6fe; padding-top: 10px; }
            .metrics-inline { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
            .metrics-inline span, .badges span { border: 1px solid #c7d2fe; border-radius: 999px; color: #4338ca; display: inline-block; font-size: 10px; font-weight: 700; padding: 4px 8px; text-transform: uppercase; }
            .badges { display: flex; flex-wrap: wrap; gap: 6px; }
            .subhead { font-size: 11px; font-weight: 800; margin: 10px 0 4px; text-transform: uppercase; color: #334155; }
            .warning-card { border-color: #fed7aa; background: #fff7ed; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; break-inside: avoid; page-break-inside: avoid; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
            ul { margin: 6px 0 0 18px; padding: 0; }
            li { margin-bottom: 4px; font-size: 12px; }
            .actions { position: sticky; top: 0; background: white; border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right; }
            .actions button { background: #111827; color: white; border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 700; }
            @media print { .actions { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="actions"><button onclick="window.print()">Guardar como PDF</button></div>
          <header>
            <p class="eyebrow">Virtual CISO · Dossier de auditoria</p>
            <h1>${escapeHtml(policy.title || "Politica")}</h1>
            <p>${escapeHtml(policy.description || policy.objective || "")}</p>
            <p class="muted">Gerado em ${escapeHtml(new Date().toLocaleString("pt-PT"))}</p>
          </header>

          ${exportOptions.score ? `
            <section>
              <h2>Resumo executivo</h2>
              <div class="metrics">
                <div class="metric"><strong>Estado</strong><span>${escapeHtml(statusLabel(policy.status))}</span></div>
                <div class="metric"><strong>Controlos</strong><span>${escapeHtml(displayedControlCount)}</span></div>
                <div class="metric"><strong>Mecanismos</strong><span>${escapeHtml(displayedMechanismCount)}</span></div>
                <div class="metric"><strong>Conformidade</strong><span>${escapeHtml(score)}%</span></div>
              </div>
              ${renderExportTraceabilityScores()}
            </section>
          ` : ""}

          ${exportOptions.metadata ? `
            <section>
              <h2>Metadados</h2>
              <div class="meta">
                <div><strong>Codigo</strong>${escapeHtml(policy.code || "-")}</div>
                <div><strong>Versao</strong>${escapeHtml(policy.version || "1.0")}</div>
                <div><strong>Owner</strong>${escapeHtml(policy.owner_display || policy.owner || "-")}</div>
                <div><strong>Accountable</strong>${escapeHtml(policy.accountable_person_name || "-")}</div>
                <div><strong>Unidade</strong>${escapeHtml(policy.owner_org_unit_name || "-")}</div>
                <div><strong>Proxima revisao</strong>${escapeHtml(formatDate(policy.next_review_date))}</div>
              </div>
            </section>
          ` : ""}

          ${exportOptions.content ? `
            <section>
              <h2>Conteudo da politica</h2>
              ${sections.length ? sections.map((section: any) => renderExportSection(section)).join("") : `<p class="muted">Sem capitulos estruturados.</p>`}
            </section>
          ` : ""}

          ${exportOptions.documents ? `
            <section>
              <h2>Documentos relacionados</h2>
              ${renderExportDocuments()}
            </section>
          ` : ""}

          ${exportOptions.frameworkMappings ? `
            <section>
              <h2>Mappings para frameworks</h2>
              ${renderExportFrameworkMappings()}
            </section>
          ` : ""}

          ${exportOptions.aiAdvice ? `
            <section>
              <h2>Gaps e recomendacoes IA</h2>
              ${renderExportAiAdvice()}
              ${renderExportAssistantHistory()}
            </section>
          ` : ""}

          ${exportOptions.controlsMechanisms ? `
            <section>
              <h2>Controlos internos e mecanismos</h2>
              ${renderExportControlsAndMechanisms()}
            </section>
          ` : ""}

          ${exportOptions.evidence ? `
            <section>
              <h2>Evidências esperadas e reais</h2>
              ${renderExportEvidenceSummary()}
            </section>
          ` : ""}

          ${exportOptions.gaps ? `
            <section>
              <h2>Gaps, exceções e riscos de auditabilidade</h2>
              ${renderExportGaps()}
            </section>
          ` : ""}

          ${exportOptions.decisions ? `
            <section>
              <h2>Decisões tomadas</h2>
              ${renderExportDecisions()}
            </section>
          ` : ""}

          ${exportOptions.actionPlan ? `
            <section>
              <h2>Plano de ações relacionado</h2>
              ${renderExportActionPlan()}
            </section>
          ` : ""}
        </body>
      </html>
    `;

    const existingFrame = document.getElementById("policy-pdf-print-frame");
    if (existingFrame) existingFrame.remove();

    const printFrame = document.createElement("iframe");
    printFrame.id = "policy-pdf-print-frame";
    printFrame.title = title;
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.style.opacity = "0";
    printFrame.setAttribute("aria-hidden", "true");

    printFrame.onload = () => {
      const frameWindow = printFrame.contentWindow;
      if (!frameWindow) {
        setError("Nao foi possivel preparar a vista de impressao.");
        return;
      }
      frameWindow.focus();
      frameWindow.onafterprint = () => printFrame.remove();
      frameWindow.print();
      window.setTimeout(() => printFrame.remove(), 30000);
    };

    printFrame.srcdoc = html;
    document.body.appendChild(printFrame);
    setExportDialogOpen(false);
    setError(null);
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar politica...</div>;
  }

  if (error && !policy) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-red-100 bg-red-50 p-8 text-red-700">
        <div className="flex items-center gap-3 font-bold">
          <AlertTriangle className="h-5 w-5" />
          Erro ao carregar politica
        </div>
        <p className="mt-2 text-sm font-semibold">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
          Voltar
        </button>
      </div>
    );
  }

  if (!policy) return null;

  const workspaceTabs: Array<{
    id: PolicyWorkspaceTab;
    label: string;
    description: string;
    badge: string;
    icon: LucideIcon;
  }> = [
    {
      id: "redaction",
      label: "Redação",
      description: "Capítulos, subcapítulos e estrutura documental.",
      badge: `${flattenSections(sections).length} capítulos`,
      icon: BookOpen,
    },
    {
      id: "onboarding",
      label: "Onboarding",
      description: "Responsáveis, controlos, mecanismos e evidências.",
      badge: `${displayedControlCount} controlos`,
      icon: ClipboardCheck,
    },
    {
      id: "traceability",
      label: "Rastreabilidade",
      description: "Controlos, mecanismos, exceções e mappings.",
      badge: `${displayedMechanismCount} mecanismos`,
      icon: Link2,
    },
    {
      id: "assistant",
      label: "IA e recomendações",
      description: "Gaps, fontes RAG e histórico de recomendações.",
      badge: policyGapAdviceResult ? "análise pronta" : "por analisar",
      icon: Sparkles,
    },
    {
      id: "dossier",
      label: "Dossier",
      description: "Exportação auditável e pacote de evidência.",
      badge: `${decisionRecords.length + governanceActions.length} registos`,
      icon: Download,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      {exportDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Pacote de auditoria</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Exportar dossier de auditoria</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                  Escolhe que contexto deve acompanhar a política: controlos, frameworks, evidências, score, gaps, recomendações, decisões e ações.
                </p>
              </div>
              <button
                onClick={() => setExportDialogOpen(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-indigo-700"
                aria-label="Fechar exportacao"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {[
                { key: "metadata", label: "Metadados", description: "Owner, versao, estado e revisao." },
                { key: "score", label: "Resumo e score", description: "Controlos, mecanismos e conformidade." },
                { key: "content", label: "Conteudo da politica", description: "Capitulos e subcapitulos." },
                { key: "documents", label: "Documentos relacionados", description: "Normas, procedimentos e runbooks." },
                { key: "frameworkMappings", label: "Mappings para frameworks", description: "Controlos externos, coverage e relação." },
                { key: "aiAdvice", label: "Gaps e recomendacoes IA", description: "Ultima analise, avisos e fontes RAG." },
                { key: "controlsMechanisms", label: "Controlos e mecanismos", description: "Controlos internos e implementacao." },
                { key: "evidence", label: "Evidencias", description: "Tipos esperados e evidencias reais." },
                { key: "gaps", label: "Gaps e excecoes", description: "Gaps técnicos, exceções e risco aceite." },
                { key: "decisions", label: "Decisoes tomadas", description: "Aceites, rejeitadas, adiadas e justificações." },
                { key: "actionPlan", label: "Plano de acoes", description: "Ações de governação associadas." },
              ].map((option) => (
                <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 hover:border-indigo-200 hover:bg-indigo-50/50">
                  <input
                    type="checkbox"
                    checked={Boolean(exportOptions[option.key as keyof typeof exportOptions])}
                    onChange={(event) => setExportOptions((current) => ({ ...current, [option.key]: event.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-700"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-950">{option.label}</span>
                    <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setExportDialogOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
              >
                Cancelar
              </button>
              <button
                onClick={openPolicyPdfExport}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
              >
                <Download className="h-4 w-4" />
                Gerar dossier
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(policy.status)}`}>
                {statusLabel(policy.status)}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {policy.code || "SEM-CODIGO"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                v{policy.version || "1.0"}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{policy.title}</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {policy.description || policy.objective || "Politica sem descricao operacional registada."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button onClick={() => setExportDialogOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <Download className="h-4 w-4" />
              Exportar dossier
            </button>
          </div>
        </div>
      </header>

      <nav className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm lg:grid-cols-5" aria-label="Workspace da política">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeWorkspaceTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectWorkspaceTab(tab.id)}
              className={`rounded-xl border p-4 text-left transition ${
                selected
                  ? "border-indigo-200 bg-indigo-50 text-indigo-950 shadow-sm"
                  : "border-slate-100 bg-white text-slate-600 hover:border-indigo-100 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <Icon className={selected ? "h-4 w-4 text-indigo-700" : "h-4 w-4 text-slate-400"} />
                <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                  selected ? "bg-white text-indigo-700" : "bg-slate-50 text-slate-400"
                }`}>
                  {tab.badge}
                </span>
              </div>
              <p className="mt-3 text-sm font-black">{tab.label}</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed opacity-75">{tab.description}</p>
            </button>
          );
        })}
      </nav>

      {activeWorkspaceTab === "traceability" && contextualGovernanceExceptions.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Exceções e risco aceite nesta política
              </div>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-amber-900">
                Existem decisões formais associadas à política, aos controlos internos ou aos mecanismos desta política.
                O score factual mantém-se separado do impacto declarado das exceções.
              </p>
            </div>
            <Link
              to="/governance/exceptions"
              className="inline-flex items-center justify-center rounded-xl bg-amber-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-amber-800"
            >
              Ver exceções
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {contextualGovernanceExceptions.slice(0, 4).map((exception) => (
              <div key={exception.id} className="rounded-xl border border-amber-100 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${exceptionStatusTone(exception.approval_status)}`}>
                    {exception.approval_status}
                  </span>
                  <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">
                    {exceptionTypeLabel(exception.exception_type)}
                  </span>
                </div>
                <div className="mt-2 font-bold text-slate-950">{exception.title}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {exception.target_label || exception.target_id} · validade: {formatDate(exception.valid_until)}
                </div>
                {exception.compensating_control_description ? (
                  <div className="mt-2 text-xs font-semibold leading-relaxed text-amber-800">
                    Compensatório: {exception.compensating_control_description}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {activeWorkspaceTab === "assistant" && (
        <section className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-violet-100 bg-violet-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Assistente CISO - gaps e recomendacoes</h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                  Analise internal-first da politica, usando controlos internos, mecanismos, evidencias, documentos e frameworks como contexto.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestPolicyGapAdvice}
              disabled={policyGapAdviceLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${policyGapAdviceLoading ? "animate-spin" : ""}`} />
              {policyGapAdviceLoading ? "A analisar..." : "Reanalisar"}
            </button>
          </div>

          <div className="p-5">
            {policyGapAdviceLoading && (
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm font-bold leading-relaxed text-violet-800">
                A IA esta a cruzar o texto da politica com controlos internos, mecanismos, evidencias e traceability. Pode demorar um pouco em LLM local.
              </div>
            )}

            {policyGapAdviceError && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold leading-relaxed text-red-700">
                {policyGapAdviceError}
              </div>
            )}

            {!policyGapAdviceLoading && !policyGapAdviceError && !policyGapAdviceResult && (
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-6">
                <h3 className="text-base font-bold text-violet-950">Analisar a política com IA</h3>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-violet-800">
                  O assistente cruza o texto da política com controlos internos, mecanismos, evidências, documentos, frameworks e traceability.
                  A resposta fica disponível para decisão formal, histórico e dossier de auditoria.
                </p>
                <button
                  type="button"
                  onClick={requestPolicyGapAdvice}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-violet-800"
                >
                  <Sparkles className="h-4 w-4" />
                  Analisar gaps IA
                </button>
              </div>
            )}

            {policyGapAdviceResult && (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {policyGapAdviceResult.model_used}
                    </span>
                    <span className={policyGapAdviceResult.used_rag ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"}>
                      {policyGapAdviceResult.used_rag ? `${policyGapAdviceResult.sources?.length || 0} fontes` : "Sem RAG"}
                    </span>
                  </div>
                  <div className="max-h-[460px] overflow-y-auto whitespace-pre-wrap pr-2 text-sm font-medium leading-relaxed text-slate-700">
                    {policyGapAdviceResult.response}
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <h3 className="text-sm font-bold text-slate-950">Acoes rapidas</h3>
                    <div className="mt-3 grid gap-2">
                      <Link
                        to={`/governance/mapping-review?policy=${policy.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
                      >
                        <Link2 className="h-4 w-4" />
                        Validar mappings
                      </Link>
                      <Link
                        to={`/governance/policies/${policy.id}/edit`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar politica
                      </Link>
                      <Link
                        to={`/recommendation-history?context=policy_advice&policy_id=${encodeURIComponent(String(policy.id))}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-violet-700 hover:bg-violet-100"
                      >
                        <Bot className="h-4 w-4" />
                        Historico IA
                      </Link>
                    </div>
                  </div>

                  {policyGapAdviceResult.sources?.length > 0 && (
                    <div className="rounded-2xl border border-slate-100 bg-white p-4">
                      <h3 className="text-sm font-bold text-slate-950">Fontes utilizadas</h3>
                      <div className="mt-3 space-y-2">
                        {policyGapAdviceResult.sources.slice(0, 6).map((source, index) => (
                          <div key={`${source.source_ref || source.title}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">{assistantSourceLabel(source)}</p>
                            <p className="mt-1 truncate text-xs font-bold text-slate-800" title={source.title || source.source_ref}>
                              {source.title || source.source_ref || "Fonte"}
                            </p>
                            {source.content_excerpt && (
                              <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">
                                {source.content_excerpt}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </div>
        </section>
      )}

      {activeWorkspaceTab === "redaction" && (
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Documento da politica</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Leitura integral dos capitulos e subcapitulos associados a esta politica.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/governance/policies/${policy.id}/edit`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
              >
                <Pencil className="h-4 w-4" />
                Editar conteudo
              </Link>
              <Link
                to={
                  primaryGovernanceDocument?.id
                    ? `/governance/documents/wizard?parentDocument=${primaryGovernanceDocument.id}`
                    : `/governance/documents/wizard?policy=${policy.id}`
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-4 w-4" />
                Criar subordinado
              </Link>
            </div>
          </div>
          <PolicyDocumentReader
            sections={sections}
            emptyMessage={
              governanceDocuments.length
                ? "Existem documentos ligados a esta politica, mas ainda nao ha capitulos estruturados."
                : "Sem capitulos estruturados."
            }
          />
        </article>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Resumo</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(policy.status)}`}>
                {statusLabel(policy.status)}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {policy.code || "SEM-CODIGO"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                v{policy.version || "1.0"}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Field label="Controlos" value={displayedControlCount} />
              <Field label="Mecanismos" value={displayedMechanismCount} />
              <Field label="Conformidade" value={`${score}%`} />
              <Field label="Proxima revisao" value={formatDate(policy.next_review_date)} />
            </div>
            <div className="mt-4 grid gap-3">
              <Field label="Owner" value={policy.owner_display || policy.owner} />
              <Field label="Accountable" value={policy.accountable_person_name} />
              <Field label="Unidade responsavel" value={policy.owner_org_unit_name} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Indice</h2>
            </div>
            <SectionIndex sections={sections} />
          </div>

          {governanceDocuments.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-950">Documentos</h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {governanceDocuments.length}
                </span>
              </div>
              <GovernanceDocumentTree documents={governanceDocuments} />
            </div>
          )}
        </aside>
      </section>
      )}

      {activeWorkspaceTab === "onboarding" && (
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-indigo-700" />
            <div>
              <h2 className="text-lg font-bold text-slate-950">Onboarding da politica</h2>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Responsabilidades, controlos, mecanismos e evidencias</p>
            </div>
          </div>
          <button
            onClick={toggleOnboardingPanel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
          >
            {onboardingOpen ? "Minimizar" : "Abrir wizard"}
          </button>
        </div>

        {!onboardingOpen ? (
          <div className="grid gap-4 p-5 md:grid-cols-4">
            <Field label="Controlos internos" value={displayedControlCount} />
            <Field label="Mecanismos associados" value={displayedMechanismCount} />
            <Field label="Controlos sem mecanismos" value={useInternalMechanismFlow ? internalControlsWithoutMechanisms.length : controlsWithoutMechanisms.length} />
            <Field label="Mecanismos sem evidencias" value={useInternalEvidenceFlow ? internalMechanismsWithoutEvidence.length : mechanismsWithoutEvidence.length} />
          </div>
        ) : (
          <div className="grid xl:grid-cols-[260px_1fr]">
            <aside className="border-b border-slate-100 bg-white p-4 xl:border-b-0 xl:border-r">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {onboardingSteps.map((step, index) => (
                  <button
                    key={step.label}
                    onClick={() => setWizardStep(index)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      wizardStep === index
                        ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                        : "border-slate-100 bg-white text-slate-600 hover:border-slate-200"
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      wizardStep === index ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-500"
                    }`}>
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{step.label}</span>
                      <span className="block truncate text-[10px] font-bold uppercase tracking-wide opacity-70">{step.status}</span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="p-5">
              {onboardingCatalogsLoading && (
                <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">
                  A preparar catalogos de controlos, mecanismos e evidencias para o onboarding...
                </div>
              )}

              {mappingMessage && (
                <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                  {mappingMessage}
                </div>
              )}

              {wizardStep === 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Responsabilidade e contexto</h3>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <Field label="Owner" value={policy.owner_display || policy.owner} />
                    <Field label="Accountable" value={policy.accountable_person_name} />
                    <Field label="Unidade responsavel" value={policy.owner_org_unit_name} />
                    <Field label="Proxima revisao" value={formatDate(policy.next_review_date)} />
                    <Field label="Ambito" value={policy.scope} />
                    <Field label="Objetivo" value={policy.objective} />
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {[
                      { label: "Owner definido", ok: Boolean(policy.owner_display || policy.owner) },
                      { label: "Accountable definido", ok: Boolean(policy.accountable_person_name) },
                      { label: "Revisao planeada", ok: Boolean(policy.next_review_date) },
                    ].map((item) => (
                      <div key={item.label} className={`rounded-xl border p-4 ${item.ok ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className={`h-4 w-4 ${item.ok ? "text-emerald-600" : "text-amber-600"}`} />
                          <p className={`text-sm font-bold ${item.ok ? "text-emerald-800" : "text-amber-800"}`}>{item.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link to={`/governance/policies/${policy.id}/edit`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
                    <Pencil className="h-4 w-4" />
                    Ajustar metadados
                  </Link>
                </div>
              )}

              {wizardStep === 1 && (
                <div>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-950">Controlos internos aplicaveis</h3>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        {internalControlCount} internos associados
                        {controls.length > 0 ? ` - ${controls.length} legacy/framework` : ""}
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={createImplementationPack}
                        onChange={(event) => setCreateImplementationPack(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-700"
                      />
                      Preencher rascunho automaticamente
                    </label>
                  </div>

                  <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-emerald-950">Controlos internos ja associados</p>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
                          Estes sao os controlos agnosticos de frameworks que a politica deve cobrir.
                        </p>
                      </div>
                      <Link
                        to={`/governance/mapping-review?policy=${policy.id}&type=policy_internal_control`}
                        className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100"
                      >
                        Validar
                      </Link>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {internalControlMappings.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-sm font-bold text-emerald-700">
                          Ainda nao existem controlos internos associados a esta politica.
                        </div>
                      ) : internalControlMappings.map((mapping: any) => (
                        <article key={mapping.id} className="rounded-xl border border-emerald-100 bg-white p-4">
                          <p className="font-mono text-xs font-bold uppercase tracking-wide text-emerald-700">
                            {mapping.targetLabel || "Controlo interno"}
                          </p>
                          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                            {mapping.rationale || "Associacao sem rationale definido."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {mapping.applicability || "recommended"}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {mapping.validation_status || "draft"}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-2">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-indigo-700" />
                          <p className="text-sm font-bold text-indigo-950">Sugestoes internas da IA</p>
                        </div>
                        <button
                          onClick={loadRecommendations}
                          disabled={recommending}
                          className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                        >
                          {recommending ? "A analisar..." : "Gerar"}
                        </button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {!recommendations ? (
                          <div className="rounded-xl border border-indigo-100 bg-white p-4 text-sm font-bold text-slate-500">
                            Sem recomendacoes nesta sessao. Clica em Gerar para priorizar o catalogo interno.
                          </div>
                        ) : (
                          <>
                            {actionableInternalRecommendationItems.length === 0 ? (
                              <div className="rounded-xl border border-indigo-100 bg-white p-4 text-sm font-bold text-slate-500">
                                Nao ha recomendacoes internas novas para esta politica.
                              </div>
                            ) : actionableInternalRecommendationItems.map((item: any, index: number) => (
                              <article key={internalRecommendationId(item) || index} className="rounded-xl border border-emerald-100 bg-white p-4">
                                <p className="font-mono text-xs font-bold uppercase tracking-wide text-emerald-700">{item.code || "IC"}</p>
                                <h4 className="mt-1 text-sm font-bold text-slate-950">{item.title || `Controlo interno ${index + 1}`}</h4>
                                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                                  {item.rationale || item.description || "Sugestao internal-first para validacao do CISO."}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.control_domain && (
                                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                      {item.control_domain}
                                    </span>
                                  )}
                                  {item.criticality && (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      {item.criticality}
                                    </span>
                                  )}
                                  {item.confidence && (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      {Math.round(Number(item.confidence) * 100)}% confianca
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => addInternalControlToPolicy(
                                    internalRecommendationId(item),
                                    item.rationale || "Sugestao internal-first do assistente aceite manualmente.",
                                    item
                                  )}
                                  disabled={creatingMapping}
                                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-800 disabled:opacity-60"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Aceitar interno
                                </button>
                              </article>
                            ))}

                            {actionableRecommendationItems.length > 0 && (
                              <div className="pt-2">
                                <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  Sugestoes externas/legacy, apenas como fallback
                                </p>
                                <div className="space-y-3">
                                  {actionableRecommendationItems.map((item: any, index: number) => (
                                    <article key={recommendationControlId(item) || index} className="rounded-xl border border-indigo-100 bg-white p-4 opacity-90">
                                      <p className="font-mono text-xs font-bold uppercase tracking-wide text-indigo-700">{item.code || "CTRL"}</p>
                                      <h4 className="mt-1 text-sm font-bold text-slate-950">{item.title || item.control_title || `Recomendacao ${index + 1}`}</h4>
                                      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                                        {item.rationale || item.reason || item.description || "Sugestao para validacao."}
                                      </p>
                                      <button
                                        onClick={() => addControlToPolicy(
                                          recommendationControlId(item),
                                          item.rationale || "Sugestao do assistente aceite manualmente.",
                                          "assistant",
                                          item
                                        )}
                                        disabled={creatingMapping}
                                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                                      >
                                        <CheckCircle2 className="h-4 w-4" />
                                        Aceitar externo
                                      </button>
                                    </article>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-5 w-5 text-slate-700" />
                          <div>
                            <p className="text-sm font-bold text-slate-950">Adicionar manualmente</p>
                            <p className="text-xs font-semibold text-slate-500">Primeiro catalogo interno; externos so se precisares de mapear outro requisito.</p>
                          </div>
                        </div>
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setControlCatalogMode("internal")}
                            className={`rounded-lg px-3 py-2 ${controlCatalogMode === "internal" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
                          >
                            Internos
                          </button>
                          <button
                            type="button"
                            onClick={() => setControlCatalogMode("external")}
                            className={`rounded-lg px-3 py-2 ${controlCatalogMode === "external" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
                          >
                            Externos
                          </button>
                        </div>
                      </div>

                      {controlCatalogMode === "internal" ? (
                        <>
                          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_210px]">
                            <label className="relative block">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                value={controlSearch}
                                onChange={(event) => setControlSearch(event.target.value)}
                                placeholder="Pesquisar controlos internos"
                                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                              />
                            </label>
                            <select
                              value={internalDomainFilter}
                              onChange={(event) => setInternalDomainFilter(event.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                            >
                              <option value="">Todos os dominios</option>
                              {internalDomainOptions.map((domain) => (
                                <option key={String(domain)} value={String(domain)}>
                                  {String(domain)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="mt-4 max-h-[420px] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-100">
                            {filteredInternalControls.length === 0 ? (
                              <div className="p-6 text-center text-sm font-bold text-slate-400">Sem controlos internos disponiveis.</div>
                            ) : filteredInternalControls.map((option: any) => (
                              <article key={option.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-emerald-700">{option.label || "IC"}</p>
                                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                                    {option.meta || option.raw?.criticality || "Catalogo interno"}
                                  </p>
                                  {option.description && (
                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{option.description}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => addInternalControlToPolicy(
                                    option.id,
                                    "Associacao manual criada a partir do catalogo interno de controlos.",
                                    option
                                  )}
                                  disabled={creatingMapping}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                                >
                                  <Plus className="h-4 w-4" />
                                  Adicionar
                                </button>
                              </article>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-800">
                            Usa esta opcao apenas quando precisares de associar diretamente um controlo externo. O caminho preferencial e criar ou mapear um controlo interno.
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_210px]">
                        <label className="relative block">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            value={controlSearch}
                            onChange={(event) => setControlSearch(event.target.value)}
                            placeholder="Pesquisar controlos externos"
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                          />
                        </label>
                        <select
                          value={frameworkFilter}
                          onChange={(event) => setFrameworkFilter(event.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        >
                          <option value="">Todas as frameworks</option>
                          {frameworks.map((framework) => (
                            <option key={framework.id} value={framework.id}>
                              {framework.code || framework.name} {framework.version ? `v${framework.version}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-4 max-h-[420px] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-100">
                        {filteredControls.length === 0 ? (
                          <div className="p-6 text-center text-sm font-bold text-slate-400">Sem controlos externos disponiveis.</div>
                        ) : filteredControls.map((control) => (
                          <article key={control.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="font-mono text-xs font-bold uppercase tracking-wide text-indigo-700">{control.code || "CTRL"}</p>
                              <h4 className="mt-1 text-sm font-bold text-slate-950">{control.title || "Controlo"}</h4>
                              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                                {control.framework_name || "Framework"} {control.is_mandatory ? "Obrigatorio" : "Recomendado"}
                              </p>
                            </div>
                            <button
                              onClick={() => addControlToPolicy(
                                control.id,
                                "Mapeamento manual criado no onboarding da politica.",
                                "manual",
                                control
                              )}
                              disabled={creatingMapping}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                            >
                              <Plus className="h-4 w-4" />
                              Adicionar
                            </button>
                          </article>
                        ))}
                      </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Mecanismos de implementacao</h3>
                  {!hasMechanismControlContext ? (
                    <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm font-bold text-amber-800">Associa pelo menos um controlo interno antes de selecionares mecanismos.</div>
                  ) : (
                    <>
                      {useInternalEvidenceFlow && !hasMechanismControlContext ? (
                        <div className="mt-5 space-y-5">
                          <div className="grid gap-3 md:grid-cols-3">
                            <Field label="Controlos internos" value={evidencePlanGroups.length} />
                            <Field label="Mecanismos a implementar" value={internalControlMechanismMappings.length} />
                            <Field label="Evidencias associadas" value={mechanismEvidenceLinks.length} />
                          </div>

                          {internalMechanismsWithoutEvidence.length > 0 && (
                            <div className="flex flex-col gap-4 rounded-xl border border-amber-100 bg-amber-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="text-sm font-bold text-amber-900">
                                  {internalMechanismsWithoutEvidence.length} mecanismo(s) ainda sem evidencias esperadas.
                                </p>
                                <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-800">
                                  Cada mecanismo deve ter pelo menos uma evidencia esperada para o CISO saber que prova recolher.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={createMissingExpectedEvidenceForMechanisms}
                                disabled={creatingEvidence}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-amber-700 disabled:opacity-60"
                              >
                                <Plus className="h-4 w-4" />
                                Gerar em falta
                              </button>
                            </div>
                          )}

                          <div className="space-y-4">
                            {evidencePlanGroups.map((group) => (
                              <section key={group.controlId || group.controlLabel} className="rounded-2xl border border-slate-100 bg-white p-4">
                                <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Controlo interno</p>
                                    <h4 className="mt-1 text-base font-bold text-slate-950">{group.controlLabel}</h4>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                                      {group.mechanismCount} mecanismos
                                    </span>
                                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                                      {group.expectedEvidenceCount + group.actualEvidenceCount} evidencias
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                                  {group.mechanisms.map((mechanism: any) => (
                                    <article key={mechanism.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismo</p>
                                          <h5 className="mt-1 text-sm font-bold text-slate-950">{mechanism.mechanismLabel}</h5>
                                        </div>
                                      </div>

                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                          {mechanism.relationshipType}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                          {mechanism.implementationStatus}
                                        </span>
                                        {mechanism.mandatory && (
                                          <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                                            obrigatorio
                                          </span>
                                        )}
                                      </div>

                                      <div className="mt-4 space-y-2">
                                        {mechanism.evidenceLinks.length === 0 ? (
                                          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-400">
                                            Ainda sem tipos de evidencia associados a este mecanismo.
                                          </div>
                                        ) : mechanism.evidenceLinks.map((evidence: any) => (
                                          <div key={evidence.id} className="rounded-xl border border-emerald-100 bg-white p-3">
                                            <p className="text-sm font-bold text-slate-950">{evidence.title}</p>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                                              {evidence.description || "Evidencia esperada para demonstrar este mecanismo."}
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                                {evidence.linkType}
                                              </span>
                                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                {evidence.validationStatus}
                                              </span>
                                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                {evidence.itemStatus}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <select
                          value={useInternalMechanismFlow ? activePolicyInternalControlId : activePolicyControlId}
                          onChange={(event) => {
                            if (useInternalMechanismFlow) {
                              setSelectedPolicyInternalControlId(event.target.value);
                            } else {
                              setSelectedPolicyControlId(event.target.value);
                            }
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        >
                          {useInternalMechanismFlow
                            ? internalControlMappings.map((mapping: any) => (
                              <option key={mapping.id} value={mapping.id}>
                                {mapping.targetLabel || "Controlo interno"}
                              </option>
                            ))
                            : controls.map((policyControl: any) => (
                              <option key={policyControl.id} value={policyControl.id}>
                                {policyControl.control_details?.code || "CTRL"} - {policyControl.control_details?.title || "Controlo"}
                              </option>
                            ))}
                        </select>
                        <input
                          value={draftMechanismName}
                          onChange={(event) => setDraftMechanismName(event.target.value)}
                          placeholder="Pesquisar ou escrever mecanismo"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        />
                        <button
                          type="button"
                          onClick={() => useInternalMechanismFlow
                            ? createMechanismForInternalControl(activePolicyInternalControlId, draftMechanismName, "manual")
                            : createMechanismForControl(activePolicyControlId, draftMechanismName, "manual")}
                          disabled={creatingMechanism || !draftMechanismName.trim()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" />
                          Associar
                        </button>
                      </div>

                      <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-indigo-700" />
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Impacto transversal</p>
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
                              {useInternalMechanismFlow
                                ? "O mecanismo fica ligado ao controlo interno agnostico. O impacto nas frameworks vem depois dos mapeamentos InternalControl -> FrameworkControl."
                                : "O mecanismo fica ligado aos controlos equivalentes ou suportados nas frameworks selecionadas pelo CISO."}
                            </p>
                          </div>
                          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                            <input
                              type="checkbox"
                              checked={mechanismImplemented}
                              onChange={(event) => setMechanismImplemented(event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-700"
                            />
                            Implementado
                          </label>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <Field label="Controlos selecionados" value={useInternalMechanismFlow ? 1 : selectedImpactCandidates.length} />
                          <Field label="Frameworks afetadas" value={useInternalMechanismFlow ? "Via mapping" : selectedImpactFrameworkCount || "-"} />
                          <Field label="Origem" value={useInternalMechanismFlow ? "Catalogo interno" : impactCandidates.some((item) => item.fromLibrary) ? "Biblioteca + IA" : "Sugestao IA"} />
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {useInternalMechanismFlow ? (
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 md:col-span-2">
                              O mecanismo selecionado sera associado ao controlo interno. Para refletir em ISO, NIST, QNRC, NIS2 ou outras frameworks, valida os mapeamentos desse controlo interno no Mapping Review.
                            </div>
                          ) : impactCandidates.length === 0 ? (
                            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                              Escreve o mecanismo ou seleciona uma sugestao para encontrar impacto noutras frameworks.
                            </div>
                          ) : impactCandidates.map((candidate) => {
                            const controlId = String(candidate.control.id);
                            const checked = selectedImpactControlIds.includes(controlId);
                            const isBase = controlId === selectedControlId(selectedPolicyControl);
                            return (
                              <label
                                key={controlId}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                                  checked ? "border-indigo-200 bg-white" : "border-slate-100 bg-white/70"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isBase}
                                  onChange={() => {
                                    if (isBase) return;
                                    setSelectedImpactControlIds((current) =>
                                      current.includes(controlId)
                                        ? current.filter((item) => item !== controlId)
                                        : [...current, controlId]
                                    );
                                  }}
                                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-700"
                                />
                                <span className="min-w-0">
                                  <span className="font-mono text-xs font-bold uppercase tracking-wide text-indigo-700">
                                    {candidate.control.code || "CTRL"}
                                  </span>
                                  <span className="mt-1 block text-sm font-bold text-slate-950">
                                    {candidate.control.title || "Controlo"}
                                  </span>
                                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                                    {candidate.control.framework_name || "Framework"}
                                  </span>
                                  {candidate.reasons.length > 0 && (
                                    <span className="mt-2 block text-xs font-semibold leading-relaxed text-slate-500">
                                      {candidate.reasons.join(" ")}
                                    </span>
                                  )}
                                  {candidate.fromLibrary && (
                                    <span className="mt-2 inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                      Ligacao existente
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">1. Ja associados a este controlo</p>
                        </div>
                        <div className="mt-3 divide-y divide-emerald-100 rounded-xl border border-emerald-100 bg-white">
                          {associatedMechanismItems.length === 0 ? (
                            <div className="p-5 text-sm font-bold text-slate-400">Ainda nao existem mecanismos associados a este controlo.</div>
                          ) : associatedMechanismItems.map((mechanism: any) => (
                            <article key={mechanism.id} className="p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="text-sm font-bold text-slate-950">{mechanism.name}</p>
                                  <p className="mt-1 text-xs font-semibold text-slate-500">{mechanism.description || mechanism.meta || "Sem descricao."}</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {mechanism.meta && (
                                      <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                        {mechanism.meta}
                                      </span>
                                    )}
                                    <span className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                                      {mechanism.evidenceCount || 0} evidencias mapeadas
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedMechanismId(String(mechanism.id));
                                    setWizardStep(3);
                                  }}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 hover:border-indigo-200 hover:text-indigo-700"
                                >
                                  Ver evidencias
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-indigo-700" />
                          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">2. Recomendados para este controlo</p>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {recommendedMechanismSuggestions.length === 0 ? (
                            <div className="rounded-xl border border-indigo-100 bg-white p-4 text-sm font-bold text-slate-400 md:col-span-2">
                              Sem novas recomendacoes para este controlo.
                            </div>
                          ) : recommendedMechanismSuggestions.map((suggestion) => (
                            <article key={suggestion.title} className="rounded-xl border border-indigo-100 bg-white p-4 text-slate-700">
                              <div>
                                <p className="text-sm font-bold text-slate-950">{suggestion.title}</p>
                                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{suggestion.rationale}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => useInternalMechanismFlow
                                  ? createMechanismForInternalControl(activePolicyInternalControlId, suggestion.title, "assistant", suggestion.rationale)
                                  : createMechanismForControl(activePolicyControlId, suggestion.title, "assistant", suggestion.rationale)}
                                disabled={creatingMechanism}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </button>
                            </article>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 rounded-xl border border-slate-100 bg-white p-5">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-slate-500" />
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">3. Outros mecanismos reutilizaveis do catalogo</p>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          Estes nao sao recomendacoes diretas; sao mecanismos disponiveis para reutilizar se fizerem sentido neste controlo.
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {reusableCatalogMechanisms.length === 0 ? (
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-400 md:col-span-2">
                              Sem outros mecanismos disponiveis com estes filtros.
                            </div>
                          ) : reusableCatalogMechanisms.map((mechanism: any) => (
                            <article key={mechanism.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <p className="text-sm font-bold text-slate-950">{mechanism.title || mechanism.name || "Mecanismo"}</p>
                              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">
                                {mechanism.description || mechanism.mechanism_type || "Mecanismo reutilizavel do catalogo."}
                              </p>
                              <button
                                type="button"
                                onClick={() => useInternalMechanismFlow
                                  ? createMechanismForInternalControl(activePolicyInternalControlId, mechanism.title || mechanism.name, "manual", "Associado a partir do catalogo reutilizavel de mecanismos.")
                                  : createMechanismForControl(activePolicyControlId, mechanism.title || mechanism.name, "manual", "Associado a partir do catalogo reutilizavel de mecanismos.")}
                                disabled={creatingMechanism}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
                              >
                                <Plus className="h-4 w-4" />
                                Associar
                              </button>
                            </article>
                          ))}
                        </div>
                      </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {wizardStep === 3 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Evidencias esperadas</h3>
                  <div className="mt-4 flex flex-col gap-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm font-semibold leading-relaxed text-indigo-800 lg:flex-row lg:items-center lg:justify-between">
                    <p>
                      Cada mecanismo mostra os tipos de evidencia esperada. Usa Adicionar evidencia dentro de cada tipo para anexar a fotografia, log, ficheiro, ticket ou referencia real.
                    </p>
                    {useInternalEvidenceFlow && (
                      <button
                        type="button"
                        onClick={() => refreshMechanismEvidenceLinks(internalControlMechanismMappings)}
                        disabled={creatingEvidence}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 disabled:opacity-60"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Atualizar evidencias
                      </button>
                    )}
                  </div>
                  {useInternalEvidenceFlow && internalMechanismsWithoutEvidence.length > 0 && (
                    <div className="mt-4 flex flex-col gap-4 rounded-xl border border-amber-100 bg-amber-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-bold text-amber-900">
                          {internalMechanismsWithoutEvidence.length} mecanismo(s) ainda sem evidencias esperadas.
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-800">
                          Para o onboarding ficar consistente, cada mecanismo deve ter pelo menos uma evidencia esperada ligada diretamente ao mecanismo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={createMissingExpectedEvidenceForMechanisms}
                        disabled={creatingEvidence}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" />
                        Gerar evidencias em falta
                      </button>
                    </div>
                  )}
                  {useInternalEvidenceFlow ? (
                    <div className="mt-5 space-y-5">
                      <div className="grid gap-3 md:grid-cols-4">
                        <Field label="Controlos internos" value={evidencePlanGroups.length} />
                        <Field label="Mecanismos a implementar" value={internalControlMechanismMappings.length} />
                        <Field label="Tipos esperados" value={mechanismExpectedEvidenceCount} />
                        <Field label="Evidencias reais" value={mechanismActualEvidenceCount} />
                      </div>

                      <div className="space-y-4">
                        {evidencePlanGroups.map((group) => (
                          <section key={group.controlId || group.controlLabel} className="rounded-2xl border border-slate-100 bg-white p-4">
                            <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Controlo interno</p>
                                <h4 className="mt-1 text-base font-bold text-slate-950">{group.controlLabel}</h4>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                                  {group.mechanismCount} mecanismos
                                </span>
                                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                                  {group.expectedEvidenceCount} tipos esperados
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                                  {group.actualEvidenceCount} reais
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 xl:grid-cols-2">
                              {group.mechanisms.map((mechanism: any) => (
                                <article key={mechanism.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismo</p>
                                      <h5 className="mt-1 text-sm font-bold text-slate-950">{mechanism.mechanismLabel}</h5>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      {mechanism.relationshipType}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      {mechanism.implementationStatus}
                                    </span>
                                    {mechanism.mandatory && (
                                      <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                                        obrigatorio
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-4 space-y-4">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Tipos de evidencia esperada</p>
                                      <div className="mt-2 space-y-2">
                                        {mechanism.expectedEvidenceLinks.length === 0 ? (
                                          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-400">
                                            Ainda sem tipos de evidencia esperada para este mecanismo.
                                          </div>
                                        ) : mechanism.expectedEvidenceLinks.map((evidence: any) => (
                                          <div key={evidence.id} className="rounded-xl border border-emerald-100 bg-white p-3">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                              <div>
                                                <p className="text-sm font-bold text-slate-950">{evidence.title}</p>
                                                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                                                  {evidence.description || "Tipo de evidencia esperado para demonstrar este mecanismo."}
                                                </p>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => startCollectingActualEvidence(mechanism, evidence)}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100"
                                              >
                                                <Plus className="h-4 w-4" />
                                                Adicionar evidencia
                                              </button>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                                {evidence.linkType}
                                              </span>
                                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                {evidence.validationStatus}
                                              </span>
                                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                {evidence.itemStatus}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Evidencias reais recolhidas</p>
                                      <div className="mt-2 space-y-2">
                                        {mechanism.actualEvidenceLinks.length === 0 ? (
                                          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-400">
                                            Ainda nao foi anexada evidencia real a este mecanismo.
                                          </div>
                                        ) : mechanism.actualEvidenceLinks.map((evidence: any) => (
                                          <div key={evidence.id} className="rounded-xl border border-indigo-100 bg-white p-3">
                                            <p className="text-sm font-bold text-slate-950">{evidence.title}</p>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                                              {evidence.description || evidence.source || evidence.externalReference || "Evidencia recolhida para este mecanismo."}
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                                                {evidence.type}
                                              </span>
                                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                {evidence.validationStatus}
                                              </span>
                                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                {evidence.itemStatus}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {collectingActualEvidenceFor?.mechanismMappingId === String(mechanism.id) && (
                                      <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                                          <div>
                                            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Adicionar evidencia real</p>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                                              Anexa uma fotografia, log, relatorio, ticket ou referencia que prove este mecanismo. A ligacao fica em draft para validacao.
                                            </p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setCollectingActualEvidenceFor(null)}
                                            className="text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-slate-700"
                                          >
                                            Cancelar
                                          </button>
                                        </div>

                                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                          <div>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Titulo da evidencia</label>
                                            <input
                                              value={actualEvidenceDraft.title}
                                              onChange={(event) => setActualEvidenceDraft((current) => ({ ...current, title: event.target.value }))}
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</label>
                                            <select
                                              value={actualEvidenceDraft.evidence_type}
                                              onChange={(event) => setActualEvidenceDraft((current) => ({ ...current, evidence_type: event.target.value }))}
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                                            >
                                              {evidenceTypeOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                              ))}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Estado</label>
                                            <select
                                              value={actualEvidenceDraft.status}
                                              onChange={(event) => setActualEvidenceDraft((current) => ({ ...current, status: event.target.value }))}
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                                            >
                                              {evidenceStatusOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                              ))}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Confianca</label>
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={actualEvidenceDraft.confidence_level}
                                              onChange={(event) => setActualEvidenceDraft((current) => ({ ...current, confidence_level: event.target.value }))}
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Fonte</label>
                                            <input
                                              value={actualEvidenceDraft.source}
                                              onChange={(event) => setActualEvidenceDraft((current) => ({ ...current, source: event.target.value }))}
                                              placeholder="Ex.: SharePoint, SIEM, sistema de tickets"
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Referencia externa</label>
                                            <input
                                              value={actualEvidenceDraft.external_reference}
                                              onChange={(event) => setActualEvidenceDraft((current) => ({ ...current, external_reference: event.target.value }))}
                                              placeholder="URL, ticket, caminho, identificador"
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Ficheiro</label>
                                            <input
                                              type="file"
                                              onChange={(event) => setActualEvidenceFile(event.target.files?.[0] || null)}
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:text-indigo-700"
                                            />
                                          </div>
                                          <div className="lg:col-span-2">
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Descricao / rationale</label>
                                            <textarea
                                              value={actualEvidenceDraft.description}
                                              onChange={(event) => setActualEvidenceDraft((current) => ({ ...current, description: event.target.value }))}
                                              rows={3}
                                              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                                            />
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={createActualEvidenceForInternalMechanism}
                                          disabled={creatingEvidence || !actualEvidenceDraft.title.trim()}
                                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                                        >
                                          <FileCheck2 className="h-4 w-4" />
                                          Guardar evidencia real
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </div>
                  ) : displayedMechanismCount === 0 ? (
                    <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm font-bold text-amber-800">Associa pelo menos um mecanismo antes de definires evidencias.</div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <select
                          value={activeEvidenceMechanismId}
                          onChange={(event) => setSelectedMechanismId(event.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        >
                          {useInternalEvidenceFlow
                            ? internalControlMechanismMappings.map((mechanism: any) => (
                              <option key={mechanism.id} value={mechanism.id}>
                                Mecanismo: {mechanism.targetLabel || "Mecanismo"} | Contexto: {mechanism.sourceLabel || "Controlo interno"}
                              </option>
                            ))
                            : allMechanisms.map((mechanism: any) => (
                              <option key={mechanism.id} value={mechanism.id}>
                                {mechanism.policyControl?.control_details?.code || "CTRL"} - {mechanism.name}
                              </option>
                            ))}
                        </select>
                        <input
                          value={draftEvidenceTitle}
                          onChange={(event) => setDraftEvidenceTitle(event.target.value)}
                          placeholder="Nova evidencia esperada"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        />
                        <button
                          type="button"
                          onClick={() => useInternalEvidenceFlow
                            ? createEvidenceForInternalMechanism(activeEvidenceMechanismId, draftEvidenceTitle, "manual")
                            : createEvidenceForMechanism(activeMechanismId, draftEvidenceTitle, "manual")}
                          disabled={creatingEvidence || !draftEvidenceTitle.trim()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" />
                          Criar
                        </button>
                      </div>

                      {useInternalEvidenceFlow && (
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismo selecionado</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">
                              {selectedInternalMechanism?.targetLabel || selectedInternalMechanism?.raw?.mechanism_title || "Mecanismo"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Controlo interno de contexto</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">
                              {selectedInternalMechanism?.sourceLabel || selectedInternalMechanismControlContext?.control_details?.title || "Controlo interno"}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">1. Evidencias ligadas diretamente ao mecanismo selecionado</p>
                        </div>
                        <div className="mt-3 divide-y divide-emerald-100 rounded-xl border border-emerald-100 bg-white">
                          {associatedEvidenceItems.length === 0 ? (
                            <div className="p-5 text-sm font-bold text-slate-400">Este mecanismo ainda nao tem evidencias ligadas diretamente.</div>
                          ) : associatedEvidenceItems.map((evidence: any) => (
                            <article key={evidence.linkId || evidence.id} className="p-4">
                              <p className="text-sm font-bold text-slate-950">{evidence.title}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">{evidence.description || evidence.evidence_type || "Sem descricao."}</p>
                              <span className="mt-2 inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                {evidence.meta || evidence.status || "draft"}
                              </span>
                            </article>
                          ))}
                        </div>
                      </div>

                      {useInternalEvidenceFlow && (
                        <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-5">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-amber-700" />
                            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">2. Evidencias ligadas ao controlo interno de contexto</p>
                          </div>
                          <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-800">
                            Estas evidencias pertencem ao controlo interno. Nao contam como evidencia do mecanismo enquanto nao forem associadas diretamente ao mecanismo.
                          </p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {controlEvidenceCandidateItems.length === 0 ? (
                              <div className="rounded-xl border border-amber-100 bg-white p-4 text-sm font-bold text-slate-400 md:col-span-2">
                                Sem evidencias adicionais herdadas do controlo interno.
                              </div>
                            ) : controlEvidenceCandidateItems.map((evidence: any) => (
                              <article key={evidence.linkId || evidence.id} className="rounded-xl border border-amber-100 bg-white p-4">
                                <p className="text-sm font-bold text-slate-950">{evidence.title}</p>
                                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{evidence.description || evidence.evidence_type || "Evidencia ligada ao controlo interno."}</p>
                                <span className="mt-2 inline-flex rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                  {evidence.meta}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => associateEvidenceItemToInternalMechanism(evidence)}
                                  disabled={creatingEvidence}
                                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-amber-700 disabled:opacity-60"
                                >
                                  <Plus className="h-4 w-4" />
                                  Associar ao mecanismo
                                </button>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-indigo-700" />
                          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{useInternalEvidenceFlow ? "3" : "2"}. Recomendadas para este mecanismo</p>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {recommendedEvidenceSuggestions.length === 0 ? (
                            <div className="rounded-xl border border-indigo-100 bg-white p-4 text-sm font-bold text-slate-400 md:col-span-2">
                              Sem novas recomendacoes para este mecanismo.
                            </div>
                          ) : recommendedEvidenceSuggestions.map((suggestion) => (
                            <article key={suggestion.title} className="rounded-xl border border-indigo-100 bg-white p-4 text-slate-700">
                              <div>
                                <p className="text-sm font-bold text-slate-950">{suggestion.title}</p>
                                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{suggestion.rationale}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => useInternalEvidenceFlow
                                  ? createEvidenceForInternalMechanism(activeEvidenceMechanismId, suggestion.title, "assistant", suggestion.rationale)
                                  : createEvidenceForMechanism(activeMechanismId, suggestion.title, "assistant", suggestion.rationale)}
                                disabled={creatingEvidence}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </button>
                            </article>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 rounded-xl border border-slate-100 bg-white p-5">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-slate-500" />
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{useInternalEvidenceFlow ? "4" : "3"}. Outras evidencias reutilizaveis do catalogo</p>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          Estas evidencias ja existem no catalogo e podem ser reutilizadas se demonstrarem este mecanismo.
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {reusableEvidenceCatalog.length === 0 ? (
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-400 md:col-span-2">
                              Sem outras evidencias disponiveis com estes filtros.
                            </div>
                          ) : reusableEvidenceCatalog.map((evidence: any) => (
                            <article key={evidence.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <p className="text-sm font-bold text-slate-950">{evidence.title || "Evidencia"}</p>
                              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">
                                {evidence.description || evidence.source || evidence.external_reference || "Evidencia reutilizavel do catalogo."}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  {evidence.evidence_type || "other"}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  {evidence.status || "draft"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => useInternalEvidenceFlow
                                  ? associateEvidenceItemToInternalMechanism(evidence)
                                  : createEvidenceForMechanism(activeMechanismId, evidence.title || "Evidencia reutilizavel", "manual", "Associada a partir do catalogo reutilizavel de evidencias.")}
                                disabled={creatingEvidence}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
                              >
                                <Plus className="h-4 w-4" />
                                Associar
                              </button>
                            </article>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {wizardStep === 4 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Revisao do onboarding</h3>
                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <Field label="Controlos" value={displayedControlCount} />
                    <Field label="Mecanismos" value={displayedMechanismCount} />
                    <Field label="Controlos sem mecanismos" value={useInternalMechanismFlow ? internalControlsWithoutMechanisms.length : controlsWithoutMechanisms.length} />
                    <Field label="Mecanismos sem evidencias" value={useInternalEvidenceFlow ? internalMechanismsWithoutEvidence.length : mechanismsWithoutEvidence.length} />
                  </div>
                  <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-5">
                    <p className="text-sm font-bold text-slate-950">Estado da politica</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Field label="Conformidade" value={`${score}%`} />
                      <Field label="Proxima revisao" value={formatDate(policy.next_review_date)} />
                      <Field label="Estado" value={statusLabel(policy.status)} />
                    </div>
                  </div>
                  {lastImpactSummary && (
                    <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
                      <p className="text-sm font-bold text-indigo-950">Ultimo impacto multi-framework</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <Field label="Mecanismo" value={lastImpactSummary.mechanism} />
                        <Field label="Controlos afetados" value={lastImpactSummary.controls} />
                        <Field label="Frameworks afetadas" value={lastImpactSummary.frameworks} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  onClick={() => setWizardStep((step) => Math.max(0, step - 1))}
                  disabled={wizardStep === 0}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => {
                    if (wizardStep === onboardingSteps.length - 1) {
                      setOnboardingOpen(false);
                      setMappingMessage("Onboarding da politica atualizado.");
                    } else {
                      setWizardStep((step) => Math.min(onboardingSteps.length - 1, step + 1));
                    }
                  }}
                  className="rounded-xl bg-indigo-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                >
                  {wizardStep === onboardingSteps.length - 1 ? "Concluir onboarding" : "Seguinte"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
      )}

      {activeWorkspaceTab === "traceability" && (
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Controlos internos e mecanismos</h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              Vista dividida entre os controlos internos da politica e os mecanismos que os implementam.
            </p>
          </div>
          <Link
            to={`/governance/mapping-review?policy=${policy.id}&type=policy_internal_control`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
          >
            <Link2 className="h-4 w-4" />
            Validar mappings
          </Link>
        </div>

        {useInternalMechanismFlow ? (
          <div className="divide-y divide-slate-100">
            {evidencePlanGroups.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">
                Existem controlos internos associados, mas ainda nao existem mecanismos ligados a esses controlos.
              </div>
            ) : evidencePlanGroups.map((group) => (
              <article key={group.controlId} className="grid gap-4 p-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Controlo interno</p>
                  <h3 className="mt-2 text-base font-bold text-slate-950">{group.controlLabel}</h3>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-lg font-bold text-slate-950">{group.mechanismCount}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Mecanismos</p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-lg font-bold text-slate-950">{group.expectedEvidenceCount}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Tipos evid.</p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-lg font-bold text-slate-950">{group.actualEvidenceCount}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Reais</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {group.mechanisms.map((mechanism: any) => (
                    <div key={mechanism.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mecanismo</p>
                          <h4 className="mt-1 text-sm font-bold text-slate-950">{mechanism.mechanismLabel}</h4>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(mechanism.implementationStatus)}`}>
                          {mechanism.implementationStatus}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {mechanism.relationshipType}
                        </span>
                        {mechanism.mandatory && (
                          <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                            obrigatorio
                          </span>
                        )}
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          {mechanism.expectedEvidenceLinks.length} tipos evidencia
                        </span>
                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-700">
                          {mechanism.actualEvidenceLinks.length} evidencias reais
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {controls.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">Sem controlos associados.</div>
            ) : controls.map((policyControl: any) => (
              <article key={policyControl.id} className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-mono text-xs font-bold uppercase tracking-wide text-indigo-700">
                      {policyControl.control_details?.code || "CTRL"}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-slate-950">{policyControl.control_details?.title || "Controlo"}</h3>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">{policyControl.rationale || policyControl.control_details?.description || "Sem racional."}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center sm:min-w-[220px]">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-lg font-bold text-slate-950">{policyControl.mechanism_count || 0}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Mecanismos</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-lg font-bold text-slate-950">{Math.round(Number(policyControl.implementation_score || 0))}%</p>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Score</p>
                    </div>
                  </div>
                </div>
                {policyControl.mechanisms?.length > 0 && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {policyControl.mechanisms.map((mechanism: any) => (
                      <div key={mechanism.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-bold text-slate-900">{mechanism.name}</p>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {mechanism.implementation_status}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-500">{mechanism.description || "Sem descricao."}</p>
                        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Evidencias validas: {mechanism.valid_evidence_count || 0}/{mechanism.evidence_count || 0}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      )}

      {activeWorkspaceTab === "traceability" && (
        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Plano de implementacao</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Tarefas associadas a politica</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Mostra o trabalho operacional ligado a esta politica, aos seus controlos internos e aos mecanismos que a implementam.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/governance/action-plan?target_type=policy&target_id=${policy.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
              >
                <ClipboardList className="h-4 w-4" />
                Plano de acoes
              </Link>
              <Link
                to="/governance/tasks"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
              >
                Ver tarefas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="Tarefas" value={governanceActionSummary.total} />
            <Field label="Ativas" value={governanceActionSummary.active} />
            <Field label="Altas/criticas" value={governanceActionSummary.highRisk} />
            <Field label="Atrasadas" value={governanceActionSummary.overdue} />
            <Field label="Proximo prazo" value={governanceActionSummary.nextDue ? formatDate(governanceActionSummary.nextDue.due_date) : "-"} />
          </div>

          {sortedGovernanceActions.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-400">
              Ainda nao existem tarefas associadas a esta politica, aos seus controlos internos ou mecanismos.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedGovernanceActions.slice(0, 10).map((action) => (
                <Link
                  key={action.id}
                  to={`/governance/tasks/${action.id}`}
                  className="grid gap-4 p-5 transition hover:bg-indigo-50/40 xl:grid-cols-[minmax(0,1fr)_220px_180px]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${actionPriorityTone[action.priority]}`}>
                        {action.priority_display || actionPriorityLabels[action.priority] || action.priority}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${actionStatusTone[action.status]}`}>
                        {action.status_display || actionStatusLabels[action.status] || action.status}
                      </span>
                      {action.is_overdue && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                          atrasada
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-950">{action.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold leading-relaxed text-slate-500">
                      {action.recommendation || action.description || action.notes || "Sem notas de execucao."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Alvo operacional</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">{actionTargetLabel(action)}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {action.action_type_display || actionTypeLabels[action.action_type] || action.action_type}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner e prazo</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">{action.owner || "Sem owner"}</p>
                    <p className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${action.is_overdue ? "text-red-700" : "text-slate-500"}`}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(action.due_date)} - {dueLabel(action.due_date)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {activeWorkspaceTab === "dossier" && (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Pacote de auditoria</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Dossier da política</h2>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                Exporta a política com o corpo documental, controlos internos, mecanismos, evidências, mappings,
                decisões, recomendações IA e plano de ação associado.
              </p>
            </div>

            <div className="p-6">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Controlos internos" value={displayedControlCount} />
                <Field label="Mecanismos" value={displayedMechanismCount} />
                <Field label="Conformidade" value={`${score}%`} />
                <Field label="Documentos" value={governanceDocuments.length} />
                <Field label="Decisões" value={decisionRecords.length} />
                <Field label="Ações" value={governanceActions.length} />
              </div>

              <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <div className="flex items-start gap-3">
                  <Download className="mt-0.5 h-5 w-5 text-indigo-700" />
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Exportação configurável</h3>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">
                      Antes de gerar o PDF podes escolher se queres incluir controlos, mecanismos, evidências,
                      gaps, recomendações IA, decisões formais e ações de governação.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExportDialogOpen(true)}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                >
                  <Download className="h-4 w-4" />
                  Configurar e exportar
                </button>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Plano de acoes no dossier</p>
                    <h3 className="mt-1 text-base font-bold text-slate-950">Tarefas que acompanham esta politica</h3>
                  </div>
                  <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                    {governanceActionSummary.active} ativas / {governanceActionSummary.total} total
                  </span>
                </div>
                {sortedGovernanceActions.length === 0 ? (
                  <div className="p-5 text-sm font-bold text-slate-400">
                    Sem tarefas associadas para incluir no dossier.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {sortedGovernanceActions.slice(0, 5).map((action) => (
                      <Link
                        key={action.id}
                        to={`/governance/tasks/${action.id}`}
                        className="flex flex-col gap-3 px-5 py-4 hover:bg-indigo-50/40 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-950">{action.title}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {actionTargetLabel(action)} - {action.action_type_display || actionTypeLabels[action.action_type] || action.action_type}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${actionPriorityTone[action.priority]}`}>
                            {action.priority_display || actionPriorityLabels[action.priority] || action.priority}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${actionStatusTone[action.status]}`}>
                            {action.status_display || actionStatusLabels[action.status] || action.status}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${action.is_overdue ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                            {formatDate(action.due_date)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Atalhos auditáveis</h2>
              <div className="mt-4 space-y-2">
                <Link
                  to={`/recommendation-history?context=policy_advice&policy_id=${policy.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-violet-200 hover:text-violet-700"
                >
                  Histórico IA
                  <Sparkles className="h-4 w-4" />
                </Link>
                <Link
                  to={`/governance/action-plan?target_type=policy&target_id=${policy.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                >
                  Plano de ações
                  <ClipboardCheck className="h-4 w-4" />
                </Link>
                <Link
                  to={`/governance/mapping-review?policy=${policy.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                >
                  Mappings da política
                  <Link2 className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Incluído no dossier</h2>
              <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Recomendações IA</span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${policyGapAdviceResult ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
                    {policyGapAdviceResult ? "pronto" : "por analisar"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Exceções e risco aceite</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {contextualGovernanceExceptions.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Decisões formais</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {decisionRecords.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Tarefas de implementação</span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${governanceActionSummary.overdue ? "border-red-100 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    {governanceActionSummary.active} ativas
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </section>
      )}

    </div>
  );
}
