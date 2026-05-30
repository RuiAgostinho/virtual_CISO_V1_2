/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, BookOpen, ListTree, Plus, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";
import { mappingReviewApi } from "@/lib/mappingReviewApi";
import { companyApi, type OrgUnit, type Person } from "@/lib/companyApi";
import { chatApi, type AssistantResponse, type ChatSource, type PolicyAdvicePayload } from "@/lib/chatApi";

type PolicyFormState = {
  code: string;
  title: string;
  description: string;
  objective: string;
  scope: string;
  owner: string;
  owner_person: string;
  owner_org_unit: string;
  accountable_person: string;
  status: string;
  version: string;
  approval_date: string;
  review_date: string;
  next_review_date: string;
  related_frameworks: string[];
};

type PolicyEditorSection = {
  localId: string;
  id?: string;
  section_number: string;
  title: string;
  content: string;
  order: number;
  parentLocalId: string;
  deleted?: boolean;
};

type PolicyAdviceMode = NonNullable<PolicyAdvicePayload["advice_mode"]>;

const emptyForm: PolicyFormState = {
  code: "",
  title: "",
  description: "",
  objective: "",
  scope: "",
  owner: "",
  owner_person: "",
  owner_org_unit: "",
  accountable_person: "",
  status: "draft",
  version: "1.0",
  approval_date: "",
  review_date: "",
  next_review_date: "",
  related_frameworks: [],
};

function asDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function newLocalId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePolicyStatus(status?: string | null) {
  const value = String(status || "").trim().toLowerCase();
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["active", "ativa", "ativo", "published", "approved"].includes(normalized)) {
    return "active";
  }
  if (["review", "em revisao", "under_review", "under review"].includes(normalized)) {
    return "review";
  }
  if (["obsolete", "obsoleta", "obsoleto", "archived", "deprecated"].includes(normalized)) {
    return "obsolete";
  }
  return "draft";
}

function policyStatusToDocumentStatus(status: string) {
  const normalized = normalizePolicyStatus(status);
  if (normalized === "active") return "published";
  if (normalized === "review") return "under_review";
  if (normalized === "obsolete") return "archived";
  return "draft";
}

function sortSections(a: PolicyEditorSection, b: PolicyEditorSection) {
  const orderA = Number(a.order || a.section_number || 0);
  const orderB = Number(b.order || b.section_number || 0);
  if (orderA !== orderB) return orderA - orderB;
  return String(a.section_number || "").localeCompare(String(b.section_number || ""));
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function titleMatches(title: string, terms: string[]) {
  const normalized = normalizeText(title);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function chapterTemplate(title: string, content: string, order: number): PolicyEditorSection {
  return {
    localId: newLocalId(),
    section_number: String(order),
    title,
    content: content || "",
    order,
    parentLocalId: "",
  };
}

function mergePolicyTextIntoSections(policy: any, loadedSections: PolicyEditorSection[]) {
  const baseChapters = [
    {
      title: "Descricao",
      content: policy.description || "",
      terms: ["descricao"],
    },
    {
      title: "Objetivo",
      content: policy.objective || "",
      terms: ["objetivo", "objectivo"],
    },
    {
      title: "Ambito",
      content: policy.scope || "",
      terms: ["ambito", "scope"],
    },
  ];

  const missingBase = baseChapters
    .filter((chapter) => chapter.content || loadedSections.length === 0)
    .filter((chapter) => !loadedSections.some((section) => !section.parentLocalId && titleMatches(section.title, chapter.terms)))
    .map((chapter, index) => chapterTemplate(chapter.title, chapter.content, index + 1));

  return resequenceSections([...missingBase, ...loadedSections]);
}

function resequenceSections(sections: PolicyEditorSection[]) {
  const byId = new Map(sections.map((section) => [section.localId, { ...section }]));

  const renumber = (parentLocalId: string, prefix = "") => {
    const siblings = Array.from(byId.values())
      .filter((section) => !section.deleted && section.parentLocalId === parentLocalId)
      .sort(sortSections);

    siblings.forEach((section, index) => {
      const sectionNumber = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      byId.set(section.localId, {
        ...section,
        order: index + 1,
        section_number: sectionNumber,
      });
      renumber(section.localId, sectionNumber);
    });
  };

  renumber("");
  return sections.map((section) => byId.get(section.localId) || section);
}

function sectionDomId(localId: string) {
  return `policy-section-${localId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function sourceLabel(source: ChatSource) {
  if (source.source_label) return source.source_label;
  const labels: Record<string, string> = {
    internal_control: "Controlo interno",
    governance_document: "Documento",
    governance_section: "Seccao",
    policy: "Politica",
    mechanism: "Mecanismo",
    evidence_item: "Evidencia",
    framework_mapping: "Mapping framework",
    internal_control_mechanism: "Mecanismo por controlo",
    control: "Controlo externo",
  };
  return labels[source.source_type] || source.source_type;
}

export default function PolicyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [form, setForm] = useState<PolicyFormState>(emptyForm);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [policyDocument, setPolicyDocument] = useState<any | null>(null);
  const [policySections, setPolicySections] = useState<PolicyEditorSection[]>([]);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adviceMode, setAdviceMode] = useState<PolicyAdviceMode>("full_review");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [adviceResult, setAdviceResult] = useState<AssistantResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [frameworksData, peopleData, orgUnitsData] = await Promise.all([
          governanceApi.getFrameworks(),
          companyApi.listPeople({ page_size: 1000 }),
          companyApi.listOrgUnits({ page_size: 1000 }),
        ]);
        setFrameworks(unwrap(frameworksData));
        setPeople(unwrap<Person>(peopleData));
        setOrgUnits(unwrap<OrgUnit>(orgUnitsData));

        if (id) {
          const policy = await governanceApi.getPolicy(id);
          const documents = unwrap<any>(await mappingReviewApi.listGovernanceDocuments({ legacy_policy: id, page_size: 20 }).catch(() => []));
          const document = documents.find((item) => item.document_type === "policy") || documents[0] || null;
          const sections = document
            ? unwrap<any>(await mappingReviewApi.getGovernanceDocumentSections(String(document.id)).catch(() => []))
            : [];

          const loadedPolicySections = sections
            .map((section) => ({
              localId: String(section.id),
              id: String(section.id),
              section_number: section.section_number || "",
              title: section.title || "",
              content: section.content || "",
              order: Number(section.order || 0),
              parentLocalId: section.parent_section ? String(section.parent_section) : "",
            }))
            .sort(sortSections);

          setPolicyDocument(document);
          setPolicySections(mergePolicyTextIntoSections(policy, loadedPolicySections));
          setForm({
            code: policy.code || "",
            title: policy.title || "",
            description: policy.description || "",
            objective: policy.objective || "",
            scope: policy.scope || "",
            owner: policy.owner || "",
            owner_person: policy.owner_person || "",
            owner_org_unit: policy.owner_org_unit || "",
            accountable_person: policy.accountable_person || "",
            status: normalizePolicyStatus(policy.status),
            version: policy.version || "1.0",
            approval_date: asDateInput(policy.approval_date),
            review_date: asDateInput(policy.review_date),
            next_review_date: asDateInput(policy.next_review_date),
            related_frameworks: Array.isArray(policy.related_frameworks)
              ? policy.related_frameworks.map((item: any) => String(item?.id || item))
              : [],
          });
        }
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Nao foi possivel carregar o formulario.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const selectedFrameworkNames = useMemo(() => {
    const selected = new Set(form.related_frameworks);
    return frameworks.filter((framework) => selected.has(String(framework.id))).map((framework) => framework.name || framework.code);
  }, [frameworks, form.related_frameworks]);

  const activeSections = useMemo(
    () => policySections.filter((section) => !section.deleted).sort(sortSections),
    [policySections]
  );

  const rootSections = useMemo(
    () => activeSections.filter((section) => !section.parentLocalId).sort(sortSections),
    [activeSections]
  );

  const textFromChapter = (terms: string[], fallback: string) =>
    rootSections.find((section) => titleMatches(section.title, terms))?.content || fallback;

  const canRequestAdvice = Boolean(form.title.trim() || activeSections.some((section) => section.title.trim() || section.content.trim()));

  const derivedDescription = textFromChapter(["descricao"], form.description);
  const derivedObjective = textFromChapter(["objetivo", "objectivo"], form.objective);
  const derivedScope = textFromChapter(["ambito", "scope"], form.scope);

  const toggleFramework = (frameworkId: string) => {
    setForm((current) => {
      const selected = new Set(current.related_frameworks);
      if (selected.has(frameworkId)) selected.delete(frameworkId);
      else selected.add(frameworkId);
      return { ...current, related_frameworks: Array.from(selected) };
    });
  };

  const childrenOf = (localId: string) =>
    activeSections.filter((section) => section.parentLocalId === localId).sort(sortSections);

  const updateSection = (localId: string, patch: Partial<PolicyEditorSection>) => {
    setPolicySections((current) =>
      current.map((section) => section.localId === localId ? { ...section, ...patch } : section)
    );
  };

  const addChapter = () => {
    const nextOrder = rootSections.length + 1;
    const localId = newLocalId();
    setPolicySections((current) =>
      resequenceSections([
        ...current,
        {
          localId,
          section_number: String(nextOrder),
          title: "",
          content: "",
          order: nextOrder,
          parentLocalId: "",
        },
      ])
    );
    setFocusedSectionId(localId);
  };

  const addSubchapter = (parent: PolicyEditorSection) => {
    const siblings = childrenOf(parent.localId);
    const nextOrder = siblings.length + 1;
    const localId = newLocalId();
    setPolicySections((current) =>
      resequenceSections([
        ...current,
        {
          localId,
          section_number: `${parent.section_number || parent.order}.${nextOrder}`,
          title: "",
          content: "",
          order: nextOrder,
          parentLocalId: parent.localId,
        },
      ])
    );
    setFocusedSectionId(localId);
  };

  const moveSection = (section: PolicyEditorSection, direction: -1 | 1) => {
    setPolicySections((current) => {
      const siblings = current
        .filter((item) => !item.deleted && item.parentLocalId === section.parentLocalId)
        .sort(sortSections);
      const index = siblings.findIndex((item) => item.localId === section.localId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return current;

      const reordered = siblings.map((item) => item.localId);
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);
      const orderById = new Map(reordered.map((localId, orderIndex) => [localId, orderIndex + 1]));

      return resequenceSections(
        current.map((item) =>
          orderById.has(item.localId)
            ? { ...item, order: orderById.get(item.localId) || item.order }
            : item
        )
      );
    });
    setFocusedSectionId(section.localId);
  };

  const renumberPolicy = () => {
    setPolicySections((current) => resequenceSections(current));
  };

  const removeSection = (localId: string) => {
    const idsToRemove = new Set<string>();
    const collect = (targetId: string) => {
      idsToRemove.add(targetId);
      policySections
        .filter((section) => section.parentLocalId === targetId)
        .forEach((section) => collect(section.localId));
    };
    collect(localId);

    setPolicySections((current) =>
      resequenceSections(
        current
          .map((section) => idsToRemove.has(section.localId) && section.id ? { ...section, deleted: true } : section)
          .filter((section) => !idsToRemove.has(section.localId) || section.id)
      )
    );
  };

  const scrollToSection = (localId: string) => {
    setFocusedSectionId(localId);
    document.getElementById(sectionDomId(localId))?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const requestPolicyAdvice = async () => {
    if (!canRequestAdvice || adviceLoading) return;
    setAdviceLoading(true);
    setAdviceError(null);
    setAdviceResult(null);
    try {
      const result = await chatApi.askPolicyAdvice({
        policy_id: editing && id ? id : null,
        advice_mode: adviceMode,
        policy_snapshot: {
          code: form.code,
          title: form.title,
          version: form.version,
          status: normalizePolicyStatus(form.status),
          owner: form.owner,
          sections: activeSections.map((section) => ({
            section_number: section.section_number,
            title: section.title,
            content: section.content,
          })),
        },
      });
      setAdviceResult(result);
    } catch (err: any) {
      console.error(err);
      setAdviceError(err?.message || "Nao foi possivel obter aconselhamento da IA.");
    } finally {
      setAdviceLoading(false);
    }
  };

  const renderOutline = (section: PolicyEditorSection, level = 0) => (
    <div key={section.localId} className={level ? "ml-3 border-l border-slate-100 pl-3" : ""}>
      <button
        type="button"
        onClick={() => scrollToSection(section.localId)}
        className={`w-full rounded-xl px-3 py-2 text-left transition ${
          focusedSectionId === section.localId
            ? "bg-indigo-50 text-indigo-800"
            : "text-slate-600 hover:bg-slate-50 hover:text-indigo-700"
        }`}
      >
        <span className="block font-mono text-[10px] font-bold uppercase tracking-wide">{section.section_number || "-"}</span>
        <span className="mt-1 block truncate text-xs font-bold">{section.title || "Sem titulo"}</span>
      </button>
      {childrenOf(section.localId).map((child) => renderOutline(child, level + 1))}
    </div>
  );

  const ensurePolicyDocument = async (policyId: string, savedPolicy: any, policyPayload: Record<string, any>) => {
    const documentPayload = {
      title: savedPolicy.title || form.title.trim(),
      document_type: "policy",
      version: form.version || "1.0",
      status: policyStatusToDocumentStatus(form.status),
      owner: form.owner.trim(),
      scope: policyPayload.scope,
      purpose: policyPayload.objective,
      content: policyPayload.description,
      approval_date: form.approval_date || null,
      review_date: form.review_date || null,
      legacy_policy: policyId,
      is_active: true,
    };

    if (policyDocument?.id) {
      return mappingReviewApi.updateGovernanceDocument(String(policyDocument.id), documentPayload);
    }

    return mappingReviewApi.createGovernanceDocument(documentPayload);
  };

  const savePolicySections = async (documentId: string) => {
    const deletedSections = policySections.filter((section) => section.deleted && section.id);
    for (const section of deletedSections.sort((a, b) => (a.parentLocalId ? -1 : 1) - (b.parentLocalId ? -1 : 1))) {
      await mappingReviewApi.deleteGovernanceDocumentSection(String(section.id)).catch(() => undefined);
    }

    const savedIds = new Map<string, string>();
    const active = policySections
      .filter((section) => !section.deleted && (section.title.trim() || section.content.trim()))
      .sort(sortSections);
    let savedCount = 0;

    const saveOne = async (section: PolicyEditorSection, parentId: string | null) => {
      const sectionNumber = section.section_number.trim() || String(section.order || 1);
      const payload = {
        document: documentId,
        section_number: sectionNumber,
        title: section.title.trim() || `Capitulo ${sectionNumber}`,
        content: section.content,
        order: Number(section.order || 0),
        parent_section: parentId,
      };
      const saved = section.id
        ? await mappingReviewApi.updateGovernanceDocumentSection(String(section.id), payload)
        : await mappingReviewApi.createGovernanceDocumentSection(payload);
      savedIds.set(section.localId, String(saved.id || section.id));
      savedCount += 1;
      return saved;
    };

    for (const section of active.filter((item) => !item.parentLocalId)) {
      await saveOne(section, null);
    }

    let pending = active.filter((item) => item.parentLocalId);
    while (pending.length) {
      const nextPending: PolicyEditorSection[] = [];
      for (const section of pending) {
        const parentId = savedIds.get(section.parentLocalId) || section.parentLocalId;
        if (!parentId) {
          nextPending.push(section);
          continue;
        }
        await saveOne(section, parentId);
      }
      if (nextPending.length === pending.length) break;
      pending = nextPending;
    }

    return { expected: active.length, saved: savedCount };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.code.trim() || !form.title.trim()) return;
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      code: form.code.trim(),
      title: form.title.trim(),
      description: derivedDescription,
      objective: derivedObjective,
      scope: derivedScope,
      owner: form.owner.trim(),
      status: normalizePolicyStatus(form.status),
      owner_person: form.owner_person || null,
      owner_org_unit: form.owner_org_unit || null,
      accountable_person: form.accountable_person || null,
      approval_date: form.approval_date || null,
      review_date: form.review_date || null,
      next_review_date: form.next_review_date || null,
    };

    try {
      const saved = editing && id
        ? await governanceApi.updatePolicy(id, payload)
        : await governanceApi.createPolicy(payload);
      const document = await ensurePolicyDocument(String(saved.id), saved, payload);
      const sectionSave = await savePolicySections(String(document.id));
      if (sectionSave.expected > 0 && sectionSave.saved === 0) {
        throw new Error("A politica foi guardada, mas os capitulos nao foram persistidos.");
      }
      navigate(`/governance/policies/${saved.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel guardar a politica.");
    } finally {
      setSaving(false);
    }
  };

  const renderSectionEditor = (section: PolicyEditorSection, level = 0) => {
    const siblings = activeSections.filter((item) => item.parentLocalId === section.parentLocalId).sort(sortSections);
    const siblingIndex = siblings.findIndex((item) => item.localId === section.localId);
    const canMoveUp = siblingIndex > 0;
    const canMoveDown = siblingIndex >= 0 && siblingIndex < siblings.length - 1;
    const isFocused = focusedSectionId === section.localId;

    return (
    <div key={section.localId} className={level ? "ml-4 border-l-2 border-slate-100 pl-4 md:ml-10 md:pl-6" : ""}>
      <article
        id={sectionDomId(section.localId)}
        className={`rounded-2xl border bg-white p-5 shadow-sm transition md:p-6 ${
          isFocused ? "border-indigo-300 ring-4 ring-indigo-50" : "border-slate-200"
        }`}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className="block w-full lg:w-48">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {level ? "Subcapitulo" : "Capitulo"}
              </span>
              <input
                value={section.section_number}
                onFocus={() => setFocusedSectionId(section.localId)}
                onChange={(event) => updateSection(section.localId, { section_number: event.target.value })}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                placeholder={level ? "1.1" : "1"}
              />
            </label>
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => moveSection(section, -1)}
              disabled={!canMoveUp}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-35"
              title="Subir"
            >
              <ArrowUp className="h-4 w-4" />
              Subir
            </button>
            <button
              type="button"
              onClick={() => moveSection(section, 1)}
              disabled={!canMoveDown}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-35"
              title="Descer"
            >
              <ArrowDown className="h-4 w-4" />
              Descer
            </button>
            <button
              type="button"
              onClick={() => addSubchapter(section)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-white px-3 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" />
              Subcapitulo
            </button>
            <button
              type="button"
              onClick={() => removeSection(section.localId)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-3 text-xs font-bold uppercase tracking-wide text-red-600 hover:bg-red-50"
              title="Remover capitulo"
            >
              <Trash2 className="h-4 w-4" />
              Remover
            </button>
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Titulo do capitulo</span>
            <input
              value={section.title}
              onFocus={() => setFocusedSectionId(section.localId)}
              onChange={(event) => updateSection(section.localId, { title: event.target.value })}
              className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xl font-bold leading-tight text-slate-950 outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              placeholder="Ex.: Responsabilidades"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Texto</span>
          <textarea
            value={section.content}
            onFocus={() => setFocusedSectionId(section.localId)}
            onChange={(event) => updateSection(section.localId, { content: event.target.value })}
            rows={level ? 10 : 16}
            className={`mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-[15px] font-medium leading-7 text-slate-800 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 ${
              level ? "min-h-[280px] md:min-h-[340px]" : "min-h-[420px] md:min-h-[520px]"
            }`}
            placeholder="Escreve aqui o conteudo deste capitulo..."
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-400">
          <span>Texto livre deste capitulo. Podes escrever frases, listas e instrucoes operacionais.</span>
          <span>{section.content.trim().length} caracteres</span>
        </div>
      </article>
      {childrenOf(section.localId).length > 0 && (
        <div className="mt-3 space-y-3">
          {childrenOf(section.localId).map((child) => renderSectionEditor(child, level + 1))}
        </div>
      )}
    </div>
    );
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar formulario...</div>;
  }

  return (
    <div className="w-full max-w-none space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link to={editing && id ? `/governance/policies/${id}` : "/governance/policies"} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          {editing && id && (
            <Link to={`/governance/policies/${id}`} className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100">
              <BookOpen className="h-4 w-4" />
              Ver politica
            </Link>
          )}
        </div>
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governo documental</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {editing ? "Editar politica" : "Nova politica"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Defina o corpo normativo, ownership, ciclo de revisao e frameworks relacionadas.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-6">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Titulo da politica</span>
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="mt-2 min-h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xl font-bold leading-tight text-slate-950 outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              placeholder="Politica de Seguranca da Informacao"
            />
            <span className="mt-2 block text-xs font-semibold leading-relaxed text-slate-400">
              Este é o nome formal do documento. Deve ser legível numa ata, auditoria ou índice documental.
            </span>
          </label>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[180px_minmax(0,1fr)_160px_minmax(0,1fr)]">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Codigo</span>
              <input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="POL-001"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                <option value="draft">Rascunho</option>
                <option value="active">Ativa</option>
                <option value="review">Em revisao</option>
                <option value="obsolete">Obsoleta</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Versao</span>
              <input
                value={form.version}
                onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner</span>
              <input
                value={form.owner}
                onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="Fallback textual"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pessoas e ownership</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Usa pessoas reais do catálogo para owner e accountable da política.</p>
            </div>
            <Link to="/governance/responsibilities" className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
              Adicionar/editar pessoas
            </Link>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner pessoa</span>
              <select
                value={form.owner_person}
                onChange={(event) => {
                  const person = people.find((item) => String(item.id) === event.target.value);
                  setForm((current) => ({
                    ...current,
                    owner_person: event.target.value,
                    owner: person?.name || current.owner,
                  }));
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">Sem owner pessoa</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner unidade</span>
              <select value={form.owner_org_unit} onChange={(event) => setForm((current) => ({ ...current, owner_org_unit: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                <option value="">Sem owner unidade</option>
                {orgUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Accountable</span>
              <select value={form.accountable_person} onChange={(event) => setForm((current) => ({ ...current, accountable_person: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                <option value="">Sem accountable</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Aprovacao</span>
              <input type="date" value={form.approval_date} onChange={(event) => setForm((current) => ({ ...current, approval_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ultima revisao</span>
              <input type="date" value={form.review_date} onChange={(event) => setForm((current) => ({ ...current, review_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Proxima revisao</span>
              <input type="date" value={form.next_review_date} onChange={(event) => setForm((current) => ({ ...current, next_review_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>

          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-sm font-bold text-indigo-950">Descricao, objetivo e ambito agora vivem no corpo da politica.</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-indigo-800">
              Edita esses pontos como capitulos normais abaixo. Ao guardar, a aplicacao sincroniza esses capitulos com os campos tecnicos antigos.
            </p>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Corpo da politica</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Capitulos e subcapitulos</h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
                  Redige aqui a politica como documento: cria capitulos, subcapitulos e escreve livremente o conteudo de cada bloco.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={renumberPolicy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                >
                  <ListTree className="h-4 w-4" />
                  Renumerar
                </button>
                <button
                  type="button"
                  onClick={addChapter}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar capitulo
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {rootSections.length > 0 ? (
                rootSections.map((section) => renderSectionEditor(section))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <p className="text-sm font-bold text-slate-500">Ainda nao existem capitulos nesta politica.</p>
                  <button
                    type="button"
                    onClick={addChapter}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50"
                  >
                    <Plus className="h-4 w-4" />
                    Criar primeiro capitulo
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Assistente CISO</h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                  Pede uma revisao contextual da politica com controlos internos, mecanismos, evidencias e frameworks.
                </p>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tipo de aconselhamento</span>
              <select
                value={adviceMode}
                onChange={(event) => setAdviceMode(event.target.value as PolicyAdviceMode)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="full_review">Revisao completa</option>
                <option value="coverage">Cobertura de controlos</option>
                <option value="auditability">Auditabilidade e evidencias</option>
                <option value="wording">Redacao normativa</option>
                <option value="draft_text">Exemplo de redacao</option>
              </select>
            </label>

            <button
              type="button"
              onClick={requestPolicyAdvice}
              disabled={!canRequestAdvice || adviceLoading}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Sparkles className="h-4 w-4" />
              {adviceLoading ? "A analisar..." : "Pedir aconselhamento"}
            </button>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
              A analise usa RAG e pode demorar cerca de 1 a 2 minutos em LLM local.
            </p>

            {adviceError && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-relaxed text-red-700">
                {adviceError}
              </div>
            )}

            {adviceResult && (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {adviceResult.model_used}
                    </span>
                    <span className={adviceResult.used_rag ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"}>
                      {adviceResult.used_rag ? `${adviceResult.sources?.length || 0} fontes` : "Sem RAG"}
                    </span>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap pr-1 text-sm font-medium leading-relaxed text-slate-700">
                    {adviceResult.response}
                  </div>
                </div>

                {adviceResult.sources?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fontes utilizadas</p>
                    <div className="mt-2 space-y-2">
                      {adviceResult.sources.slice(0, 5).map((source, index) => (
                        <div key={`${source.source_ref || source.title}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">{sourceLabel(source)}</p>
                          <p className="mt-1 truncate text-xs font-bold text-slate-800" title={source.title}>
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
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ListTree className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Estrutura</h2>
            </div>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
              Usa este mapa para saltar rapidamente entre capitulos durante a redacao.
            </p>
            <div className="mt-4 max-h-[360px] space-y-1 overflow-y-auto pr-1">
              {rootSections.length > 0 ? (
                rootSections.map((section) => renderOutline(section))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-400">
                  Sem capitulos.
                </p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={addChapter}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100"
              >
                <Plus className="h-4 w-4" />
                Capitulo
              </button>
              <button
                type="button"
                onClick={renumberPolicy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
              >
                <ListTree className="h-4 w-4" />
                Ordem
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Frameworks</h2>
            </div>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
              {selectedFrameworkNames.length ? selectedFrameworkNames.join(", ") : "Nenhuma framework selecionada."}
            </p>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {frameworks.length === 0 ? (
                <p className="text-sm font-bold text-slate-400">Sem frameworks carregadas.</p>
              ) : frameworks.map((framework) => {
                const frameworkId = String(framework.id);
                const selected = form.related_frameworks.includes(frameworkId);
                return (
                  <button
                    type="button"
                    key={frameworkId}
                    onClick={() => toggleFramework(frameworkId)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-indigo-100"
                    }`}
                  >
                    <p className="text-sm font-bold">{framework.name || framework.code}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{framework.code || framework.version || "Framework"}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <button
            type="submit"
            disabled={saving || !form.code.trim() || !form.title.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save className="h-4 w-4" />
            {saving ? "A guardar..." : "Guardar politica"}
          </button>
        </aside>
      </form>
    </div>
  );
}
