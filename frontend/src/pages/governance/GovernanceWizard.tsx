/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  RefreshCw,
  Save,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { companyApi, type CompanyProfile, type OrgUnit, type Person } from "@/lib/companyApi";
import { governanceApi, type RegulatoryContextRecord, type Stakeholder } from "@/lib/governanceApi";

type PolicyRecord = Record<string, any>;
type FrameworkRecord = Record<string, any>;

type WizardStep = "diagnosis" | "responsibilities" | "policies" | "plan";

type PolicyTemplate = {
  code: string;
  title: string;
  domain: string;
  priority: "Alta" | "Media";
  description: string;
  objective: string;
  scope: string;
  ownerRole?: string;
  ownerUnitType?: string;
  frameworkKeywords: string[];
  mechanisms: string[];
  evidence: string[];
  triggers: string[];
};

const policyCatalog: PolicyTemplate[] = [
  {
    code: "POL-GOV-001",
    title: "Politica de Governo da Seguranca da Informacao",
    domain: "Governance",
    priority: "Alta",
    description: "Define principios, responsabilidades, autoridade e ciclo de revisao do sistema de governo de seguranca.",
    objective: "Estabelecer accountability, alinhamento com objetivos de negocio e base formal para decisoes do CISO.",
    scope: "Toda a organizacao, incluindo unidades internas, prestadores e servicos criticos.",
    ownerRole: "ciso",
    ownerUnitType: "security",
    frameworkKeywords: ["iso", "27001", "nis2", "qncs", "nist"],
    mechanisms: ["Comite de seguranca", "Calendario de revisao", "Registo de decisoes"],
    evidence: ["Ata de aprovacao", "Matriz RACI", "Registo de revisao anual"],
    triggers: ["baseline"],
  },
  {
    code: "POL-RISK-001",
    title: "Politica de Gestao de Risco de Ciberseguranca",
    domain: "Risco",
    priority: "Alta",
    description: "Formaliza metodologia, apetite de risco, criterios de aceitacao e escalonamento.",
    objective: "Garantir que riscos, vulnerabilidades e excecoes sao tratados de forma consistente e rastreavel.",
    scope: "Riscos tecnologicos, ativos criticos, fornecedores relevantes e excecoes de seguranca.",
    ownerRole: "risk_owner",
    ownerUnitType: "security",
    frameworkKeywords: ["iso", "27001", "nis2", "nist", "qncs"],
    mechanisms: ["Matriz de risco", "Fluxo de aceitacao", "Revisao periodica de riscos"],
    evidence: ["Registo de riscos", "Decisoes de aceitacao", "Relatorios de revisao"],
    triggers: ["baseline", "nis2"],
  },
  {
    code: "POL-ACCESS-001",
    title: "Politica de Controlo de Acessos",
    domain: "Identidade",
    priority: "Alta",
    description: "Define regras para autenticacao, privilegios, recertificacao e segregacao de funcoes.",
    objective: "Reduzir risco de acesso indevido e garantir controlo sobre contas privilegiadas.",
    scope: "Utilizadores internos, administradores, contas de servico e acessos de terceiros.",
    ownerRole: "it_owner",
    ownerUnitType: "it",
    frameworkKeywords: ["iso", "27001", "nist", "cis", "qncs"],
    mechanisms: ["MFA", "Recertificacao de acessos", "Gestao de contas privilegiadas"],
    evidence: ["Lista de acessos revistos", "Configuracao MFA", "Aprovacoes de acesso"],
    triggers: ["baseline"],
  },
  {
    code: "POL-ASSET-001",
    title: "Politica de Gestao de Ativos",
    domain: "Ativos",
    priority: "Alta",
    description: "Define inventario, classificacao, owners, ciclo de vida e requisitos minimos de protecao de ativos.",
    objective: "Assegurar que ativos criticos tem ownership, classificacao e contexto de risco.",
    scope: "Ativos tecnologicos, informacionais, software, redes e servicos relevantes.",
    ownerRole: "it_owner",
    ownerUnitType: "it",
    frameworkKeywords: ["iso", "27001", "nist", "qncs"],
    mechanisms: ["Inventario de ativos", "Classificacao de ativos", "Owners tecnico e de negocio"],
    evidence: ["Export do inventario", "Registo de classificacao", "Revisao de owners"],
    triggers: ["baseline"],
  },
  {
    code: "POL-INC-001",
    title: "Politica de Gestao de Incidentes de Seguranca",
    domain: "Resposta",
    priority: "Alta",
    description: "Estabelece deteccao, triagem, resposta, comunicacao e aprendizagem pos-incidente.",
    objective: "Reduzir impacto operacional e garantir resposta coordenada a incidentes de seguranca.",
    scope: "Eventos e incidentes que afetem confidencialidade, integridade, disponibilidade ou obrigacoes legais.",
    ownerRole: "security_officer",
    ownerUnitType: "security",
    frameworkKeywords: ["iso", "27001", "nis2", "nist", "qncs"],
    mechanisms: ["Runbook de incidente", "Canal de reporte", "Exercicio de simulacao"],
    evidence: ["Registo de incidentes", "Relatorio post-mortem", "Exercicio tabletop"],
    triggers: ["baseline", "nis2"],
  },
  {
    code: "POL-BCP-001",
    title: "Politica de Continuidade e Recuperacao",
    domain: "Resiliencia",
    priority: "Alta",
    description: "Define continuidade, recuperacao, backups, objetivos de recuperacao e testes.",
    objective: "Garantir continuidade dos servicos criticos e capacidade de recuperacao validada.",
    scope: "Servicos criticos, infraestrutura, dados essenciais e dependencias tecnicas.",
    ownerRole: "business_owner",
    ownerUnitType: "operations",
    frameworkKeywords: ["iso", "27001", "nis2", "nist", "qncs"],
    mechanisms: ["Plano de continuidade", "Plano de disaster recovery", "Testes de backup"],
    evidence: ["Resultado de teste de recuperacao", "Plano BCP/DR", "RTO/RPO aprovados"],
    triggers: ["baseline", "critical_services", "nis2"],
  },
  {
    code: "POL-VULN-001",
    title: "Politica de Gestao de Vulnerabilidades",
    domain: "Exposicao",
    priority: "Alta",
    description: "Define descoberta, priorizacao, remediacao, excecoes e metricas de vulnerabilidades.",
    objective: "Assegurar tratamento das vulnerabilidades por criticidade, exposicao e contexto de negocio.",
    scope: "Infraestrutura, software, redes, ativos expostos e integracoes externas.",
    ownerRole: "security_officer",
    ownerUnitType: "security",
    frameworkKeywords: ["iso", "27001", "nist", "cis", "qncs"],
    mechanisms: ["Scanner de vulnerabilidades", "SLA de remediacao", "Priorizacao contextual"],
    evidence: ["Relatorio de scan", "Ticket de remediacao", "Aceitacao formal de risco"],
    triggers: ["baseline"],
  },
  {
    code: "POL-SUP-001",
    title: "Politica de Seguranca de Fornecedores",
    domain: "Terceiros",
    priority: "Alta",
    description: "Define avaliacao, requisitos contratuais, monitorizacao e saida segura de fornecedores.",
    objective: "Controlar risco de terceiros e garantir requisitos de seguranca em relacoes criticas.",
    scope: "Fornecedores, parceiros, prestadores TIC, cloud e servicos geridos.",
    ownerRole: "compliance_owner",
    ownerUnitType: "business",
    frameworkKeywords: ["iso", "27001", "nis2", "nist", "qncs"],
    mechanisms: ["Due diligence", "Clausulas de seguranca", "Revisao periodica de fornecedores"],
    evidence: ["Avaliacao de fornecedor", "Contrato com requisitos", "Plano de remediacao"],
    triggers: ["suppliers", "nis2"],
  },
  {
    code: "POL-DATA-001",
    title: "Politica de Protecao da Informacao e Dados",
    domain: "Dados",
    priority: "Media",
    description: "Define classificacao, tratamento, retencao, partilha e protecao de dados.",
    objective: "Garantir protecao proporcional da informacao de negocio e dados sensiveis.",
    scope: "Dados corporativos, dados pessoais, documentacao, bases de dados e repositorios partilhados.",
    ownerRole: "data_protection",
    ownerUnitType: "business",
    frameworkKeywords: ["iso", "27001", "nist", "qncs"],
    mechanisms: ["Classificacao de informacao", "Regras de retencao", "Controlo de partilha"],
    evidence: ["Tabela de classificacao", "Registo de retencao", "Aprovacoes de partilha"],
    triggers: ["baseline", "data"],
  },
  {
    code: "POL-AWARE-001",
    title: "Politica de Sensibilizacao e Formacao",
    domain: "Pessoas",
    priority: "Media",
    description: "Define formacao, campanhas, responsabilidades individuais e medicao de consciencializacao.",
    objective: "Reduzir risco humano e reforcar cultura de seguranca.",
    scope: "Todos os colaboradores, terceiros com acesso e funcoes criticas.",
    ownerRole: "security_officer",
    ownerUnitType: "security",
    frameworkKeywords: ["iso", "27001", "nist", "qncs"],
    mechanisms: ["Plano anual de formacao", "Campanhas phishing", "Onboarding de seguranca"],
    evidence: ["Registos de presenca", "Resultados de simulacao", "Conteudos de formacao"],
    triggers: ["baseline"],
  },
];

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
}

function matchFrameworkIds(frameworks: FrameworkRecord[], keywords: string[]) {
  const normalized = keywords.map((item) => item.toLowerCase());
  return frameworks
    .filter((framework) => {
      const text = `${framework.name || ""} ${framework.code || ""} ${framework.slug || ""}`.toLowerCase();
      return normalized.some((keyword) => text.includes(keyword));
    })
    .map((framework) => framework.id);
}

function findPersonByRole(people: Person[], role?: string) {
  if (!role) return "";
  return people.find((person) => person.governance_role === role)?.id || "";
}

function findUnitByType(units: OrgUnit[], unitType?: string) {
  if (!unitType) return "";
  return units.find((unit) => unit.unit_type === unitType)?.id || "";
}

function existingPolicy(template: PolicyTemplate, policies: PolicyRecord[]) {
  const code = template.code.toLowerCase();
  const title = template.title.toLowerCase();
  return policies.find((policy) => String(policy.code || "").toLowerCase() === code || String(policy.title || "").toLowerCase() === title);
}

function stepLabel(step: WizardStep) {
  return {
    diagnosis: "Diagnostico",
    responsibilities: "Responsaveis",
    policies: "Politicas",
    plan: "Plano",
  }[step];
}

function priorityTone(priority: string) {
  return priority === "Alta"
    ? "border-red-100 bg-red-50 text-red-700"
    : "border-amber-100 bg-amber-50 text-amber-700";
}

function bulletList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function buildPolicySections({
  item,
  organizationName,
  nis2Classification,
  ownerPersonName,
  ownerUnitName,
  accountableName,
}: {
  item: PolicyTemplate;
  organizationName: string;
  nis2Classification: string;
  ownerPersonName: string;
  ownerUnitName: string;
  accountableName: string;
}) {
  return [
    {
      order: 1,
      title: "1. Enquadramento e objetivo",
      content: [
        item.description,
        "",
        `Objetivo: ${item.objective}`,
        "",
        `Ambito: ${item.scope}`,
        "",
        `Contexto de geracao: ${organizationName || "Organizacao"}; classificacao NIS2: ${nis2Classification || "Nao definida"}.`,
      ].join("\n"),
    },
    {
      order: 2,
      title: "2. Responsabilidades e accountability",
      content: [
        `Owner pessoa: ${ownerPersonName || "A definir"}`,
        `Owner unidade: ${ownerUnitName || "A definir"}`,
        `Accountable: ${accountableName || "A definir"}`,
        "",
        "As responsabilidades devem ser validadas pelo CISO e revistas sempre que existam alteracoes relevantes na estrutura organizacional, no contexto regulatorio ou nos servicos criticos.",
      ].join("\n"),
    },
    {
      order: 3,
      title: "3. Mecanismos de implementacao recomendados",
      content: [
        "Mecanismos minimos sugeridos para operacionalizar esta politica:",
        "",
        bulletList(item.mechanisms),
        "",
        "Estes mecanismos devem ser posteriormente ligados a controlos e avaliados com evidencias formais na plataforma.",
      ].join("\n"),
    },
    {
      order: 4,
      title: "4. Evidencias esperadas",
      content: [
        "Evidencias recomendadas para demonstrar implementacao e revisao da politica:",
        "",
        bulletList(item.evidence),
        "",
        "Cada evidencia deve ter owner, data de recolha, validade e ligacao ao mecanismo ou controlo correspondente quando aplicavel.",
      ].join("\n"),
    },
    {
      order: 5,
      title: "5. Revisao e melhoria continua",
      content: [
        "A politica deve ser revista pelo menos anualmente, ou sempre que ocorram alteracoes significativas no risco, nos ativos, nos servicos criticos, nos requisitos legais ou no modelo operacional.",
        "",
        "Resultados de auditorias, incidentes, simulacoes, findings e decisoes registadas devem alimentar a revisao desta politica.",
      ].join("\n"),
    },
  ];
}

export default function GovernanceWizard() {
  const steps: WizardStep[] = ["diagnosis", "responsibilities", "policies", "plan"];
  const [step, setStep] = useState<WizardStep>("diagnosis");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [regulatory, setRegulatory] = useState<RegulatoryContextRecord | null>(null);
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkRecord[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [defaultOwnerPerson, setDefaultOwnerPerson] = useState("");
  const [defaultOwnerUnit, setDefaultOwnerUnit] = useState("");
  const [defaultAccountablePerson, setDefaultAccountablePerson] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdPolicies, setCreatedPolicies] = useState<PolicyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileData, regulatoryData, unitsData, peopleData, stakeholdersData, policiesData, frameworksData] = await Promise.all([
        companyApi.getProfile(),
        governanceApi.getRegulatoryContext(),
        companyApi.listOrgUnits({ page_size: 1000 }),
        companyApi.listPeople({ page_size: 1000 }),
        governanceApi.listStakeholders({ page_size: 1000 }),
        governanceApi.listPolicies({ page_size: 1000 }),
        governanceApi.getFrameworks(),
      ]);

      const loadedUnits = unwrap<OrgUnit>(unitsData);
      const loadedPeople = unwrap<Person>(peopleData);
      const loadedPolicies = unwrap<PolicyRecord>(policiesData);

      setProfile(profileData);
      setRegulatory(regulatoryData);
      setUnits(loadedUnits);
      setPeople(loadedPeople);
      setStakeholders(unwrap<Stakeholder>(stakeholdersData));
      setPolicies(loadedPolicies);
      setFrameworks(unwrap<FrameworkRecord>(frameworksData));

      const ciso = findPersonByRole(loadedPeople, "ciso") || loadedPeople.find((person) => person.is_security_contact)?.id || "";
      setDefaultOwnerPerson(ciso);
      setDefaultAccountablePerson(ciso);
      setDefaultOwnerUnit(findUnitByType(loadedUnits, "security"));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o wizard de governance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const contextFlags = useMemo(() => {
    const text = `${profile?.sector || ""} ${profile?.critical_services || ""} ${profile?.security_objectives || ""}`.toLowerCase();
    const hasSuppliers = stakeholders.some((stakeholder) => stakeholder.stakeholder_type === "Supplier");
    const nis2Relevant = regulatory?.nis2_classification === "Essential" || regulatory?.nis2_classification === "Important";
    return {
      baseline: true,
      nis2: nis2Relevant,
      critical_services: Boolean(profile?.critical_services),
      suppliers: hasSuppliers,
      data: text.includes("dados") || text.includes("data") || text.includes("cliente") || text.includes("pessoal"),
    };
  }, [profile, regulatory, stakeholders]);

  const recommendations = useMemo(() => {
    return policyCatalog
      .map((template) => {
        const relevant = template.triggers.some((trigger) => contextFlags[trigger as keyof typeof contextFlags]);
        const existing = existingPolicy(template, policies);
        const ownerPerson = findPersonByRole(people, template.ownerRole) || defaultOwnerPerson;
        const ownerUnit = findUnitByType(units, template.ownerUnitType) || defaultOwnerUnit;
        const frameworkIds = matchFrameworkIds(frameworks, template.frameworkKeywords);
        return {
          ...template,
          relevant,
          existing,
          ownerPerson,
          ownerUnit,
          accountablePerson: defaultAccountablePerson || ownerPerson,
          frameworkIds,
        };
      })
      .filter((item) => item.relevant);
  }, [contextFlags, defaultAccountablePerson, defaultOwnerPerson, defaultOwnerUnit, frameworks, people, policies, units]);

  useEffect(() => {
    if (selectedCodes.length > 0 || recommendations.length === 0) return;
    setSelectedCodes(recommendations.filter((item) => !item.existing).map((item) => item.code));
  }, [recommendations, selectedCodes.length]);

  const readiness = useMemo(() => {
    const checks = [
      { label: "Perfil da organizacao", ok: Boolean(profile?.legal_name && profile?.sector && profile?.critical_services) },
      { label: "Contexto regulatorio", ok: Boolean(regulatory && regulatory.nis2_classification !== "Pending") },
      { label: "Unidades organicas", ok: units.length > 0 },
      { label: "Contactos de seguranca", ok: people.some((person) => person.is_security_contact || person.governance_role === "ciso") },
      { label: "Unidades relevantes", ok: units.some((unit) => unit.is_security_relevant) },
      { label: "Partes interessadas", ok: stakeholders.length > 0 },
      { label: "Politicas com ownership", ok: policies.length > 0 && policies.some((policy) => policy.owner_person || policy.owner_org_unit || policy.owner) },
    ];
    const score = Math.round((checks.filter((item) => item.ok).length / checks.length) * 100);
    return { checks, score };
  }, [people, policies, profile, regulatory, stakeholders.length, units]);

  const selectedRecommendations = recommendations.filter((item) => selectedCodes.includes(item.code) && !item.existing);

  const toggleRecommendation = (code: string) => {
    setSelectedCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  };

  const createDraftPolicies = async () => {
    setCreating(true);
    setError(null);
    setCreatedPolicies([]);
    try {
      const created: PolicyRecord[] = [];
      for (const item of selectedRecommendations) {
        const saved = await governanceApi.createPolicy({
          code: item.code,
          title: item.title,
          description: item.description,
          objective: item.objective,
          scope: item.scope,
          owner: item.ownerPerson ? "" : "A definir",
          owner_person: item.ownerPerson || defaultOwnerPerson || null,
          owner_org_unit: item.ownerUnit || defaultOwnerUnit || null,
          accountable_person: item.accountablePerson || defaultAccountablePerson || null,
          status: "draft",
          version: "1.0",
          next_review_date: addMonths(new Date(), 12),
          related_frameworks: item.frameworkIds,
        });

        const ownerPersonName = people.find((person) => person.id === (item.ownerPerson || defaultOwnerPerson))?.name || "";
        const ownerUnitName = units.find((unit) => unit.id === (item.ownerUnit || defaultOwnerUnit))?.name || "";
        const accountableName = people.find((person) => person.id === (item.accountablePerson || defaultAccountablePerson))?.name || "";
        const sections = buildPolicySections({
          item,
          organizationName: profile?.legal_name || "",
          nis2Classification: regulatory?.nis2_classification || "",
          ownerPersonName,
          ownerUnitName,
          accountableName,
        });

        for (const section of sections) {
          await governanceApi.createPolicySection({
            policy: saved.id,
            parent: null,
            title: section.title,
            content: section.content,
            order: section.order,
          });
        }

        created.push(saved);
      }
      setCreatedPolicies(created);
      const refreshed = await governanceApi.listPolicies({ page_size: 1000 });
      setPolicies(unwrap<PolicyRecord>(refreshed));
      setSelectedCodes([]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel criar os rascunhos de politicas.");
    } finally {
      setCreating(false);
    }
  };

  const currentStepIndex = steps.indexOf(step);
  const canGoNext = currentStepIndex < steps.length - 1;
  const canGoBack = currentStepIndex > 0;

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar wizard de governance...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governance wizard</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Construir modelo de governance</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Sequencia orientada para transformar contexto organizacional em politicas, ownership e evidencias esperadas.
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
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

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          {steps.map((item, index) => {
            const active = item === step;
            const complete = index < currentStepIndex;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setStep(item)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                  active
                    ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                    : complete
                      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                      : "border-slate-100 bg-slate-50 text-slate-500 hover:border-indigo-100"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-indigo-600 text-white" : complete ? "bg-emerald-600 text-white" : "bg-white text-slate-500"}`}>
                  {index + 1}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide">{stepLabel(item)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {step === "diagnosis" && (
        <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Scale className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Readiness de governance</h2>
            </div>
            <p className="mt-5 text-6xl font-bold tracking-tight text-slate-950">{readiness.score}%</p>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">
              Este score mede se ha contexto minimo para o CISO conseguir atribuir ownership e criar politicas defensaveis.
            </p>
            <div className="mt-6 grid gap-3">
              <Link to="/governance/organization" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200">
                Rever dados da organizacao <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/governance/responsibilities" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200">
                Rever organograma <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/governance/regulatory" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200">
                Rever contexto regulatorio <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-950">Pre-condicoes</h2>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {readiness.checks.map((item) => (
                <div key={item.label} className={`rounded-2xl border p-4 ${item.ok ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
                  <div className="flex items-center gap-3">
                    {item.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                    <p className={`text-sm font-bold ${item.ok ? "text-emerald-800" : "text-amber-800"}`}>{item.label}</p>
                  </div>
                  <p className={`mt-2 text-xs font-semibold ${item.ok ? "text-emerald-700" : "text-amber-700"}`}>
                    {item.ok ? "Pronto para ser usado no wizard." : "Deve ser completado para aumentar defensabilidade."}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === "responsibilities" && (
        <section className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-cyan-700" />
              <h2 className="text-lg font-bold text-slate-950">Responsaveis por defeito</h2>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner pessoa</span>
                <select value={defaultOwnerPerson} onChange={(event) => setDefaultOwnerPerson(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                  <option value="">A definir depois</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.role || person.governance_role || "sem cargo"}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner unidade</span>
                <select value={defaultOwnerUnit} onChange={(event) => setDefaultOwnerUnit(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                  <option value="">Sem unidade por defeito</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Accountable</span>
                <select value={defaultAccountablePerson} onChange={(event) => setDefaultAccountablePerson(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                  <option value="">A definir depois</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.role || person.governance_role || "sem cargo"}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-950">Papeis detetados</h2>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {people.filter((person) => person.is_security_contact || person.governance_role !== "other").slice(0, 8).map((person) => (
                <div key={person.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-950">{person.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{person.role || person.org_unit_name || "Sem contexto"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {person.governance_role_display || person.governance_role || "Papel"}
                    </span>
                    {person.is_security_contact && (
                      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Contacto seguranca
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {people.filter((person) => person.is_security_contact || person.governance_role !== "other").length === 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm font-semibold text-amber-700 md:col-span-2">
                  Ainda nao ha papeis de governance definidos. Podes continuar, mas o plano ficara menos defensavel.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {step === "policies" && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Politicas recomendadas</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Este fluxo gera rascunhos em lote com base no contexto, NIS2, stakeholders e baseline de governance.
                  Para criar uma politica individual completa, usa o <Link to="/governance/policies/wizard" className="font-bold text-indigo-700 underline">PolicyWizard</Link>.
                </p>
              </div>
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                {selectedRecommendations.length} para criar
              </span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {recommendations.map((item) => {
              const selected = selectedCodes.includes(item.code);
              const disabled = Boolean(item.existing);
              return (
                <button
                  key={item.code}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleRecommendation(item.code)}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    disabled
                      ? "cursor-not-allowed border-emerald-100 bg-emerald-50"
                      : selected
                        ? "border-indigo-200 bg-indigo-50"
                        : "border-slate-100 bg-white hover:border-indigo-100 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${priorityTone(item.priority)}`}>
                          {item.priority}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {item.domain}
                        </span>
                        {disabled && (
                          <span className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            Ja existe
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-base font-bold text-slate-950">{item.title}</h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{item.code}</p>
                      <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">{item.description}</p>
                    </div>
                    {!disabled && (
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-white/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mecanismos iniciais</p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{item.mechanisms.join(", ")}</p>
                    </div>
                    <div className="rounded-xl bg-white/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidencias esperadas</p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{item.evidence.join(", ")}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === "plan" && (
        <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Plano a criar</h2>
            </div>
            <div className="mt-5 space-y-3">
              {selectedRecommendations.length === 0 ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm font-bold text-emerald-700">
                  Nao ha novas politicas selecionadas para criar.
                </div>
              ) : selectedRecommendations.map((item) => (
                <div key={item.code} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.code}</p>
                      <h3 className="mt-1 text-sm font-bold text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{item.objective}</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mecanismos</p>
                          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{item.mechanisms.join(", ")}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidencias</p>
                          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{item.evidence.join(", ")}</p>
                        </div>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${priorityTone(item.priority)}`}>
                      {item.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-indigo-700" />
                <h2 className="text-lg font-bold text-slate-950">Resultado esperado</h2>
              </div>
              <div className="mt-5 space-y-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-slate-950">{selectedRecommendations.length}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Politicas novas</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-slate-950">{selectedRecommendations.length * 5}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Secoes estruturadas</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-slate-950">{policies.length}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Politicas existentes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={createDraftPolicies}
                disabled={creating || selectedRecommendations.length === 0}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Save className="h-4 w-4" />
                {creating ? "A criar..." : "Gerar rascunhos de politicas"}
              </button>
            </div>

            {createdPolicies.length > 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-emerald-950">Rascunhos criados</h2>
                </div>
                <div className="mt-4 space-y-2">
                  {createdPolicies.map((policy) => (
                    <Link key={policy.id} to={`/governance/policies/${policy.id}`} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-bold text-emerald-800 hover:text-indigo-700">
                      {policy.code} com secoes <ArrowRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </section>
      )}

      <footer className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => canGoBack && setStep(steps[currentStepIndex - 1])}
          disabled={!canGoBack}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>
        <div className="text-center text-xs font-bold uppercase tracking-wide text-slate-400">
          {stepLabel(step)} ({currentStepIndex + 1}/{steps.length})
        </div>
        <button
          type="button"
          onClick={() => canGoNext && setStep(steps[currentStepIndex + 1])}
          disabled={!canGoNext}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Seguinte <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}
