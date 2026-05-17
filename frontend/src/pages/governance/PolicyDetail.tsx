import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";

type PolicyRecord = Record<string, any>;

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

function unwrapList<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
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
  if (["mfa", "scanner", "backup", "config", "monitor", "siem"].some((term) => text.includes(term))) return "technical";
  if (["contrato", "clausula", "fornecedor", "supplier"].some((term) => text.includes(term))) return "contractual";
  if (["comite", "owner", "raci", "calendario", "revisao"].some((term) => text.includes(term))) return "organizational";
  return "procedural";
}

function truncate(value: string, max = 240) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function recommendationControlId(item: any) {
  return String(item?.control || item?.control_id || item?.id || "");
}

function recommendationLabel(item: any) {
  const code = item?.code || item?.control_code;
  const title = item?.title || item?.control_title;
  return [code, title].filter(Boolean).join(" - ") || "Controlo recomendado";
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{value || "-"}</p>
    </div>
  );
}

function SectionTree({ sections }: { sections: any[] }) {
  if (!sections?.length) {
    return <div className="p-8 text-center text-sm font-bold text-slate-400">Sem secoes estruturadas.</div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {sections.map((section) => (
        <article key={section.id} className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Secao {section.order}</p>
          <h3 className="mt-1 text-base font-bold text-slate-950">{section.title}</h3>
          {section.content && <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600">{section.content}</p>}
          {section.subsections?.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 border-slate-100 pl-4">
              {section.subsections.map((sub: any) => (
                <div key={sub.id}>
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

export default function PolicyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [controlsCatalog, setControlsCatalog] = useState<any[]>([]);
  const [controlSearch, setControlSearch] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [creatingMapping, setCreatingMapping] = useState(false);
  const [createImplementationPack, setCreateImplementationPack] = useState(false);
  const [mappingMessage, setMappingMessage] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(true);
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedPolicyControlId, setSelectedPolicyControlId] = useState("");
  const [selectedMechanismId, setSelectedMechanismId] = useState("");
  const [draftMechanismName, setDraftMechanismName] = useState("");
  const [draftEvidenceTitle, setDraftEvidenceTitle] = useState("");
  const [creatingMechanism, setCreatingMechanism] = useState(false);
  const [creatingEvidence, setCreatingEvidence] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [policyData, frameworksData, controlsData] = await Promise.all([
        governanceApi.getPolicy(id),
        governanceApi.getFrameworks(),
        governanceApi.listControls({ page_size: 1000 }),
      ]);
      setPolicy(policyData);
      setFrameworks(unwrapList(frameworksData));
      setControlsCatalog(unwrapList(controlsData));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar a politica.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

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

  const controls = useMemo(() => policy?.policy_controls || [], [policy]);
  const sections = useMemo(() => policy?.sections || [], [policy]);
  const score = Math.round(Number(policy?.compliance_score || 0));
  const linkedControlIds = useMemo(() => new Set(controls.map((policyControl: any) => String(policyControl.control))), [controls]);
  const generatedMechanisms = useMemo(() => extractBulletItems(sections, "mecanismos"), [sections]);
  const generatedEvidence = useMemo(() => extractBulletItems(sections, "evidencias"), [sections]);
  const mechanismSuggestions = useMemo(
    () => (generatedMechanisms.length ? generatedMechanisms : ["Procedimento de implementacao e revisao"]).slice(0, 5),
    [generatedMechanisms]
  );
  const evidenceSuggestions = useMemo(
    () => (generatedEvidence.length ? generatedEvidence : ["Evidencia de implementacao e revisao"]).slice(0, 5),
    [generatedEvidence]
  );
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
  const selectedPolicyControl = useMemo(
    () => controls.find((policyControl: any) => String(policyControl.id) === String(selectedPolicyControlId)),
    [controls, selectedPolicyControlId]
  );
  const selectedMechanism = useMemo(
    () => allMechanisms.find((mechanism: any) => String(mechanism.id) === String(selectedMechanismId)),
    [allMechanisms, selectedMechanismId]
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
  const recommendationItems = useMemo(() => {
    if (Array.isArray(recommendations?.recommendations)) return recommendations.recommendations;
    if (Array.isArray(recommendations?.results)) return recommendations.results;
    return [];
  }, [recommendations]);
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
      status: `${controls.length} associados`,
    },
    {
      label: "Mecanismos",
      status: `${allMechanisms.length} criados`,
    },
    {
      label: "Evidencias",
      status: `${allMechanisms.reduce((total: number, mechanism: any) => total + Number(mechanism.evidence_count || 0), 0)} esperadas`,
    },
    {
      label: "Revisao",
      status: score > 0 ? `${score}%` : "Por validar",
    },
  ], [policy, controls.length, allMechanisms, score]);

  useEffect(() => {
    if (!selectedPolicyControlId && controls[0]?.id) {
      setSelectedPolicyControlId(controls[0].id);
    }
  }, [controls, selectedPolicyControlId]);

  useEffect(() => {
    if (!selectedMechanismId && allMechanisms[0]?.id) {
      setSelectedMechanismId(allMechanisms[0].id);
    }
  }, [allMechanisms, selectedMechanismId]);

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

  const createMechanismForControl = async (policyControlId: string, mechanismName: string, source: "manual" | "assistant") => {
    const name = mechanismName.trim();
    if (!policyControlId || !name) return;

    setCreatingMechanism(true);
    setError(null);
    setMappingMessage(null);
    try {
      await governanceApi.createPolicyMechanism({
        policy_control: policyControlId,
        name: truncate(name),
        description: source === "assistant"
          ? "Rascunho recomendado pelo assistente para validacao do CISO."
          : "Mecanismo criado manualmente durante o onboarding da politica.",
        mechanism_type: classifyMechanismType(name),
        implementation_status: "not_started",
        responsible: policy?.owner_display || policy?.owner || "",
        progress: 0,
        notes: "Criado no onboarding da politica. Rever prazos, responsavel e estado.",
      });
      setDraftMechanismName("");
      setMappingMessage("Mecanismo criado para a politica.");
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel criar o mecanismo.");
    } finally {
      setCreatingMechanism(false);
    }
  };

  const createEvidenceForMechanism = async (mechanismId: string, evidenceTitle: string, source: "manual" | "assistant") => {
    const title = evidenceTitle.trim();
    if (!mechanismId || !title) return;

    setCreatingEvidence(true);
    setError(null);
    setMappingMessage(null);
    try {
      await governanceApi.createPolicyEvidence({
        mechanism: mechanismId,
        title: truncate(title),
        evidence_type: "document",
        description: source === "assistant"
          ? "Evidencia esperada recomendada pelo assistente. Deve ser substituida ou validada com evidencia real."
          : "Evidencia esperada criada manualmente durante o onboarding da politica.",
        status: "pending_review",
      });
      setDraftEvidenceTitle("");
      setMappingMessage("Evidencia esperada criada para o mecanismo.");
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel criar a evidencia.");
    } finally {
      setCreatingEvidence(false);
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

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
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
            <button onClick={() => setOnboardingOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100">
              <ClipboardCheck className="h-4 w-4" />
              Onboarding da politica
            </button>
            <Link to={`/governance/policies/${policy.id}/edit`} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <BookOpen className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{controls.length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Controlos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ClipboardCheck className="h-5 w-5 text-slate-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{policy.mechanism_count || 0}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{score}%</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Conformidade</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <FileCheck2 className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{formatDate(policy.next_review_date)}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Proxima revisao</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Metadados</h2>
          <div className="mt-5 grid gap-3">
            <Field label="Owner" value={policy.owner_display || policy.owner} />
            <Field label="Owner pessoa" value={policy.owner_person_name} />
            <Field label="Owner unidade" value={policy.owner_org_unit_name} />
            <Field label="Accountable" value={policy.accountable_person_name} />
            <Field label="Aprovacao" value={formatDate(policy.approval_date)} />
            <Field label="Ultima revisao" value={formatDate(policy.review_date)} />
            <Field label="Proxima revisao" value={formatDate(policy.next_review_date)} />
            <Field label="Ambito" value={policy.scope} />
            <Field label="Objetivo" value={policy.objective} />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Estrutura documental</h2>
          </div>
          <SectionTree sections={sections} />
        </div>
      </section>

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
            onClick={() => setOnboardingOpen((value) => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
          >
            {onboardingOpen ? "Minimizar" : "Abrir wizard"}
          </button>
        </div>

        {!onboardingOpen ? (
          <div className="grid gap-4 p-5 md:grid-cols-4">
            <Field label="Controlos" value={controls.length} />
            <Field label="Mecanismos" value={allMechanisms.length} />
            <Field label="Sem mecanismos" value={controlsWithoutMechanisms.length} />
            <Field label="Sem evidencias" value={mechanismsWithoutEvidence.length} />
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
                      <h3 className="text-xl font-bold text-slate-950">Controlos aplicaveis</h3>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{controls.length} controlos associados</p>
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

                  <div className="mt-5 grid gap-5 xl:grid-cols-2">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-indigo-700" />
                          <p className="text-sm font-bold text-indigo-950">Sugestoes da IA</p>
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
                          <div className="rounded-xl border border-indigo-100 bg-white p-4 text-sm font-bold text-slate-500">Sem recomendacoes nesta sessao.</div>
                        ) : actionableRecommendationItems.length === 0 ? (
                          <div className="rounded-xl border border-indigo-100 bg-white p-4 text-sm font-bold text-slate-500">Nao ha recomendacoes novas.</div>
                        ) : actionableRecommendationItems.map((item: any, index: number) => (
                          <article key={recommendationControlId(item) || index} className="rounded-xl border border-indigo-100 bg-white p-4">
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
                              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Aceitar
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-white p-4">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-slate-700" />
                        <p className="text-sm font-bold text-slate-950">Adicionar manualmente</p>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_210px]">
                        <label className="relative block">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            value={controlSearch}
                            onChange={(event) => setControlSearch(event.target.value)}
                            placeholder="Pesquisar controlos"
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
                          <div className="p-6 text-center text-sm font-bold text-slate-400">Sem controlos disponiveis.</div>
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
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Mecanismos de implementacao</h3>
                  {controls.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm font-bold text-amber-800">Associa pelo menos um controlo antes de criares mecanismos.</div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <select
                          value={selectedPolicyControlId}
                          onChange={(event) => setSelectedPolicyControlId(event.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        >
                          {controls.map((policyControl: any) => (
                            <option key={policyControl.id} value={policyControl.id}>
                              {policyControl.control_details?.code || "CTRL"} - {policyControl.control_details?.title || "Controlo"}
                            </option>
                          ))}
                        </select>
                        <input
                          value={draftMechanismName}
                          onChange={(event) => setDraftMechanismName(event.target.value)}
                          placeholder="Novo mecanismo"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        />
                        <button
                          onClick={() => createMechanismForControl(selectedPolicyControlId, draftMechanismName, "manual")}
                          disabled={creatingMechanism || !draftMechanismName.trim()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" />
                          Criar
                        </button>
                      </div>

                      <div className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Recomendacoes para o controlo selecionado</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {mechanismSuggestions.map((suggestion) => {
                            const exists = (selectedPolicyControl?.mechanisms || []).some((mechanism: any) =>
                              String(mechanism.name || "").toLowerCase() === suggestion.toLowerCase()
                            );
                            return (
                              <button
                                key={suggestion}
                                onClick={() => createMechanismForControl(selectedPolicyControlId, suggestion, "assistant")}
                                disabled={creatingMechanism || exists}
                                className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                                  exists
                                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                                }`}
                              >
                                {exists ? "Criado" : suggestion}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
                        {(selectedPolicyControl?.mechanisms || []).length === 0 ? (
                          <div className="p-5 text-sm font-bold text-slate-400">Sem mecanismos neste controlo.</div>
                        ) : (selectedPolicyControl?.mechanisms || []).map((mechanism: any) => (
                          <article key={mechanism.id} className="p-4">
                            <p className="text-sm font-bold text-slate-950">{mechanism.name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{mechanism.description || "Sem descricao."}</p>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {wizardStep === 3 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Evidencias esperadas</h3>
                  {allMechanisms.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm font-bold text-amber-800">Cria pelo menos um mecanismo antes de definires evidencias.</div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <select
                          value={selectedMechanismId}
                          onChange={(event) => setSelectedMechanismId(event.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
                        >
                          {allMechanisms.map((mechanism: any) => (
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
                          onClick={() => createEvidenceForMechanism(selectedMechanismId, draftEvidenceTitle, "manual")}
                          disabled={creatingEvidence || !draftEvidenceTitle.trim()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" />
                          Criar
                        </button>
                      </div>

                      <div className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Recomendacoes para o mecanismo selecionado</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {evidenceSuggestions.map((suggestion) => {
                            const exists = (selectedMechanism?.evidences || []).some((evidence: any) =>
                              String(evidence.title || "").toLowerCase() === suggestion.toLowerCase()
                            );
                            return (
                              <button
                                key={suggestion}
                                onClick={() => createEvidenceForMechanism(selectedMechanismId, suggestion, "assistant")}
                                disabled={creatingEvidence || exists}
                                className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                                  exists
                                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                                }`}
                              >
                                {exists ? "Criada" : suggestion}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
                        {(selectedMechanism?.evidences || []).length === 0 ? (
                          <div className="p-5 text-sm font-bold text-slate-400">Sem evidencias neste mecanismo.</div>
                        ) : (selectedMechanism?.evidences || []).map((evidence: any) => (
                          <article key={evidence.id} className="p-4">
                            <p className="text-sm font-bold text-slate-950">{evidence.title}</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{evidence.status || "pending_review"}</p>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {wizardStep === 4 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Revisao do onboarding</h3>
                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <Field label="Controlos" value={controls.length} />
                    <Field label="Mecanismos" value={allMechanisms.length} />
                    <Field label="Controlos sem mecanismos" value={controlsWithoutMechanisms.length} />
                    <Field label="Mecanismos sem evidencias" value={mechanismsWithoutEvidence.length} />
                  </div>
                  <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-5">
                    <p className="text-sm font-bold text-slate-950">Estado da politica</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Field label="Conformidade" value={`${score}%`} />
                      <Field label="Proxima revisao" value={formatDate(policy.next_review_date)} />
                      <Field label="Estado" value={statusLabel(policy.status)} />
                    </div>
                  </div>
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

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Controlos e mecanismos</h2>
        </div>
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
      </section>

    </div>
  );
}
