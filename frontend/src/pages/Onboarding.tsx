import { useEffect, useMemo, useState, type ElementType } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  Gauge,
  Loader2,
  Plus,
  Rocket,
  Save,
  Scale,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { chatApi } from "@/lib/chatApi";
import { companyApi, type CompanyProfile, type ListResponse, type OnboardingAction, type OrgUnit, type Person } from "@/lib/companyApi";
import { governanceApi, type RegulatoryContextRecord } from "@/lib/governanceApi";

type StepKey = "organization" | "structure" | "legal" | "risk" | "posture" | "plan";
type OrganizationType = "Public" | "Private" | "ThirdSector";
type RiskAppetite = "conservative" | "balanced" | "tolerant";
type Nis2Classification = RegulatoryContextRecord["nis2_classification"];
type PostureAnswer = "yes" | "partial" | "no" | "unknown";
type Dl125Annex = "annex_i" | "annex_ii" | "other" | "";
type Dl125SizeAssessment = "exceeds_medium_thresholds" | "below_medium_thresholds" | "unknown";

type InstitutionalOnboardingForm = {
  legal_name: string;
  org_type: OrganizationType;
  sector: string;
  employee_count: string;
  annual_turnover_million_eur: string;
  city: string;
  country: string;
  critical_services: string;
  essential_services: string[];
  dl125_annex: Dl125Annex;
  dl125_sector: string;
  dl125_subsector: string;
  dl125_entity_type_id: string;
  dl125_size_assessment: Dl125SizeAssessment;
  entity_category: Nis2Classification;
  classification_criteria: string;
  competent_authority: string;
  public_relevant_group: string;
  supplier_dependency: string;
  risk_appetite: RiskAppetite;
  cybersecurity_responsible_name: string;
  cybersecurity_responsible_email: string;
  cybersecurity_responsible_role: string;
  permanent_contact_name: string;
  permanent_contact_email: string;
  management_body: string;
  incident_contact_process: string;
  frameworks: string[];
  posture: Record<string, PostureAnswer>;
};

type StepDefinition = {
  key: StepKey;
  title: string;
  icon: ElementType;
};

const steps: StepDefinition[] = [
  { key: "organization", title: "Instituição", icon: Building2 },
  { key: "structure", title: "Estrutura", icon: Users },
  { key: "legal", title: "DL 125/2025", icon: Scale },
  { key: "risk", title: "Apetite", icon: UserRound },
  { key: "posture", title: "Postura inicial", icon: Gauge },
  { key: "plan", title: "Plano", icon: ClipboardCheck },
];

type Dl125EntityOption = {
  id: string;
  annex: Exclude<Dl125Annex, "" | "other">;
  sector: string;
  subsector?: string;
  entityType: string;
  forceEssential?: boolean;
};

const dl125EntityOptions: Dl125EntityOption[] = [
  { id: "energy-electricity-company", annex: "annex_i", sector: "Energia", subsector: "Eletricidade", entityType: "Empresa de eletricidade / comercialização" },
  { id: "energy-electricity-distribution", annex: "annex_i", sector: "Energia", subsector: "Eletricidade", entityType: "Operador da rede de distribuição" },
  { id: "energy-electricity-transport", annex: "annex_i", sector: "Energia", subsector: "Eletricidade", entityType: "Operador da rede de transporte" },
  { id: "energy-electricity-producer", annex: "annex_i", sector: "Energia", subsector: "Eletricidade", entityType: "Produtor de eletricidade" },
  { id: "energy-electricity-market", annex: "annex_i", sector: "Energia", subsector: "Eletricidade", entityType: "Operador nomeado do mercado / participante de agregação, resposta da procura ou armazenamento" },
  { id: "energy-electricity-charging", annex: "annex_i", sector: "Energia", subsector: "Eletricidade", entityType: "Operador de ponto de carregamento" },
  { id: "energy-heating-cooling", annex: "annex_i", sector: "Energia", subsector: "Aquecimento e arrefecimento urbano", entityType: "Operador de sistema de aquecimento ou arrefecimento urbano" },
  { id: "energy-oil", annex: "annex_i", sector: "Energia", subsector: "Petróleo", entityType: "Operador de oleodutos, instalações petrolíferas ou entidade central de armazenagem" },
  { id: "energy-gas", annex: "annex_i", sector: "Energia", subsector: "Gás", entityType: "Empresa de gás natural, comercialização, distribuição, transporte, armazenamento ou GNL" },
  { id: "energy-hydrogen", annex: "annex_i", sector: "Energia", subsector: "Hidrogénio", entityType: "Operador de produção, armazenamento ou transporte de hidrogénio" },
  { id: "transport-air", annex: "annex_i", sector: "Transportes", subsector: "Transporte aéreo", entityType: "Transportadora aérea, entidade gestora aeroportuária ou operador de tráfego aéreo" },
  { id: "transport-rail", annex: "annex_i", sector: "Transportes", subsector: "Transporte ferroviário", entityType: "Gestor de infraestrutura ou empresa ferroviária" },
  { id: "transport-water", annex: "annex_i", sector: "Transportes", subsector: "Transporte aquático", entityType: "Companhia de transporte aquático, entidade gestora portuária ou operador VTS" },
  { id: "transport-road", annex: "annex_i", sector: "Transportes", subsector: "Transporte rodoviário", entityType: "Autoridade rodoviária ou operador de sistemas de transporte inteligentes" },
  { id: "banking-credit", annex: "annex_i", sector: "Setor bancário", entityType: "Instituição de crédito" },
  { id: "financial-market", annex: "annex_i", sector: "Infraestruturas do mercado financeiro", entityType: "Operador de plataforma de negociação ou contraparte central" },
  { id: "health-provider", annex: "annex_i", sector: "Saúde", entityType: "Prestador de cuidados de saúde" },
  { id: "health-lab", annex: "annex_i", sector: "Saúde", entityType: "Laboratório de referência da UE" },
  { id: "health-medicines-rd", annex: "annex_i", sector: "Saúde", entityType: "Entidade de investigação e desenvolvimento de medicamentos" },
  { id: "water-drinking", annex: "annex_i", sector: "Água potável", entityType: "Fornecedor ou distribuidor de água destinada ao consumo humano" },
  { id: "water-wastewater", annex: "annex_i", sector: "Águas residuais", entityType: "Empresa de recolha, eliminação ou tratamento de águas residuais" },
  { id: "digital-ixp", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Fornecedor de ponto de troca de tráfego" },
  { id: "digital-dns", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Prestador de serviços de DNS", forceEssential: true },
  { id: "digital-tld", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Registo de nomes de domínio de topo", forceEssential: true },
  { id: "digital-cloud", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Prestador de serviços de computação em nuvem" },
  { id: "digital-datacenter", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Prestador de serviços de centro de dados" },
  { id: "digital-cdn", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Fornecedor de rede de distribuição de conteúdos" },
  { id: "digital-trust", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Prestador de serviços de confiança qualificado", forceEssential: true },
  { id: "digital-public-networks", annex: "annex_i", sector: "Infraestruturas digitais", entityType: "Fornecedor de redes públicas ou serviços de comunicações eletrónicas acessíveis ao público" },
  { id: "ict-managed", annex: "annex_i", sector: "Gestão de serviços TIC entre empresas", entityType: "Prestador de serviços geridos" },
  { id: "ict-security-managed", annex: "annex_i", sector: "Gestão de serviços TIC entre empresas", entityType: "Prestador de serviços de segurança geridos" },
  { id: "space", annex: "annex_i", sector: "Espaço", entityType: "Operador de infraestrutura terrestre de apoio a serviços espaciais" },
  { id: "postal", annex: "annex_ii", sector: "Serviços postais e de estafeta", entityType: "Prestador de serviços postais ou de estafeta" },
  { id: "waste", annex: "annex_ii", sector: "Gestão de resíduos", entityType: "Empresa de gestão de resíduos" },
  { id: "chemicals", annex: "annex_ii", sector: "Produção, fabrico e distribuição de produtos químicos", entityType: "Empresa de produção ou distribuição de substâncias, misturas ou artigos químicos" },
  { id: "food", annex: "annex_ii", sector: "Produção, transformação e distribuição de produtos alimentares", entityType: "Empresa alimentar de distribuição por grosso ou produção/transformação industrial" },
  { id: "manufacturing-medical", annex: "annex_ii", sector: "Indústria transformadora", subsector: "Dispositivos médicos", entityType: "Fabricante de dispositivos médicos ou diagnóstico in vitro" },
  { id: "manufacturing-electronics", annex: "annex_ii", sector: "Indústria transformadora", subsector: "Equipamentos informáticos, comunicação, eletrónicos e óticos", entityType: "Empresa da divisão 26 da NACE Rev. 2" },
  { id: "manufacturing-electrical", annex: "annex_ii", sector: "Indústria transformadora", subsector: "Equipamento elétrico", entityType: "Empresa da divisão 27 da NACE Rev. 2" },
  { id: "manufacturing-machinery", annex: "annex_ii", sector: "Indústria transformadora", subsector: "Máquinas e equipamentos", entityType: "Empresa da divisão 28 da NACE Rev. 2" },
  { id: "manufacturing-vehicles", annex: "annex_ii", sector: "Indústria transformadora", subsector: "Veículos automóveis, reboques e semirreboques", entityType: "Empresa da divisão 29 da NACE Rev. 2" },
  { id: "manufacturing-transport", annex: "annex_ii", sector: "Indústria transformadora", subsector: "Outro equipamento de transporte", entityType: "Empresa da divisão 30 da NACE Rev. 2" },
  { id: "digital-services-marketplace", annex: "annex_ii", sector: "Prestação de serviços digitais", entityType: "Prestador de mercados em linha" },
  { id: "digital-services-search", annex: "annex_ii", sector: "Prestação de serviços digitais", entityType: "Prestador de motores de pesquisa em linha" },
  { id: "digital-services-social", annex: "annex_ii", sector: "Prestação de serviços digitais", entityType: "Prestador de plataformas de redes sociais" },
  { id: "research", annex: "annex_ii", sector: "Investigação", entityType: "Organismo de investigação" },
];

const postureQuestions = [
  {
    id: "approved_security_policy",
    label: "Existe política de segurança aprovada",
    obligation: "Governação e aprovação de medidas de gestão de risco",
    recommendedAction: "Criar ou rever política de segurança da informação",
    path: "/governance/policies/wizard",
  },
  {
    id: "asset_inventory",
    label: "Existe inventário de ativos atualizado",
    obligation: "Identificação de ativos e sistemas que suportam serviços críticos",
    recommendedAction: "Executar onboarding e classificação de ativos",
    path: "/assets/onboarding",
  },
  {
    id: "risk_assessment",
    label: "Existe avaliação de risco formal",
    obligation: "Gestão de riscos de cibersegurança e risco residual",
    recommendedAction: "Criar avaliação de risco residual ligada a controlos internos",
    path: "/governance/residual-risk-mappings",
  },
  {
    id: "incident_response",
    label: "Existe processo de resposta e notificação de incidentes",
    obligation: "Notificação de incidentes significativos e relatório final",
    recommendedAction: "Formalizar procedimento/runbook de resposta a incidentes",
    path: "/governance/documents/wizard?documentType=runbook",
  },
  {
    id: "backup_continuity",
    label: "Backups, continuidade e recuperação são testados",
    obligation: "Continuidade das atividades, cópias de segurança e recuperação de desastres",
    recommendedAction: "Associar mecanismos de backup/continuidade a controlos internos",
    path: "/governance/mechanisms",
  },
  {
    id: "supplier_security",
    label: "Fornecedores críticos são avaliados",
    obligation: "Segurança da cadeia de abastecimento",
    recommendedAction: "Criar mapeamento de fornecedores críticos e controlos compensatórios",
    path: "/governance/stakeholders",
  },
  {
    id: "training_culture",
    label: "Há formação regular em cibersegurança",
    obligation: "Ciber-higiene e formação, incluindo órgãos de gestão e trabalhadores",
    recommendedAction: "Criar plano de formação e evidências de participação",
    path: "/governance/action-plan",
  },
  {
    id: "crypto_access",
    label: "MFA, acessos privilegiados e criptografia estão controlados",
    obligation: "Políticas e procedimentos de criptografia, cifragem e controlo de acessos",
    recommendedAction: "Mapear mecanismos MFA/RBAC/PAM e evidências associadas",
    path: "/governance/mechanisms",
  },
  {
    id: "evidence_register",
    label: "Existe evidência auditável das medidas implementadas",
    obligation: "Demonstração de eficácia das medidas de gestão de risco",
    recommendedAction: "Recolher evidências reais e associá-las a mecanismos/controlos",
    path: "/governance/evidence",
  },
];

const emptyPosture = postureQuestions.reduce<Record<string, PostureAnswer>>((acc, question) => {
  acc[question.id] = "unknown";
  return acc;
}, {});

const emptyForm: InstitutionalOnboardingForm = {
  legal_name: "",
  org_type: "Public",
  sector: "",
  employee_count: "",
  annual_turnover_million_eur: "",
  city: "",
  country: "Portugal",
  critical_services: "",
  essential_services: [],
  dl125_annex: "",
  dl125_sector: "",
  dl125_subsector: "",
  dl125_entity_type_id: "",
  dl125_size_assessment: "unknown",
  entity_category: "Pending",
  classification_criteria: "",
  competent_authority: "CNCS",
  public_relevant_group: "",
  supplier_dependency: "",
  risk_appetite: "balanced",
  cybersecurity_responsible_name: "",
  cybersecurity_responsible_email: "",
  cybersecurity_responsible_role: "Responsável de Cibersegurança",
  permanent_contact_name: "",
  permanent_contact_email: "",
  management_body: "",
  incident_contact_process: "",
  frameworks: [],
  posture: emptyPosture,
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.map(String) : fallback;
}

function unwrapList<T>(data: ListResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results || [];
}

function asPosture(value: unknown): Record<string, PostureAnswer> {
  if (!value || typeof value !== "object") return emptyPosture;
  const record = value as Record<string, unknown>;
  return postureQuestions.reduce<Record<string, PostureAnswer>>((acc, question) => {
    const answer = record[question.id];
    acc[question.id] = answer === "yes" || answer === "partial" || answer === "no" || answer === "unknown" ? answer : "unknown";
    return acc;
  }, {});
}

function asNis2Classification(value: unknown): Nis2Classification {
  return value === "Essential" || value === "Important" || value === "Out of Scope" || value === "Pending" ? value : "Pending";
}

function nis2ClassificationLabel(value: Nis2Classification) {
  if (value === "Essential") return "Entidade essencial";
  if (value === "Important") return "Entidade importante";
  if (value === "Out of Scope") return "Não abrangida";
  return "Por confirmar";
}

function nis2ClassificationTone(value: Nis2Classification) {
  if (value === "Essential") return "border-red-100 bg-red-50 text-red-700";
  if (value === "Important") return "border-amber-100 bg-amber-50 text-amber-700";
  if (value === "Out of Scope") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
}

function asRiskAppetite(value: unknown): RiskAppetite {
  return value === "conservative" || value === "balanced" || value === "tolerant" ? value : "balanced";
}

function asDl125Annex(value: unknown): Dl125Annex {
  return value === "annex_i" || value === "annex_ii" || value === "other" || value === "" ? value : "";
}

function asDl125SizeAssessment(value: unknown): Dl125SizeAssessment {
  return value === "exceeds_medium_thresholds" || value === "below_medium_thresholds" || value === "unknown" ? value : "unknown";
}

function selectedDl125Option(form: Pick<InstitutionalOnboardingForm, "dl125_entity_type_id">) {
  return dl125EntityOptions.find((option) => option.id === form.dl125_entity_type_id) || null;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-PT"));
}

function dl125Sectors() {
  return uniqueValues(dl125EntityOptions.map((option) => option.sector));
}

function dl125Subsectors(sector: string) {
  return uniqueValues(
    dl125EntityOptions
      .filter((option) => option.sector === sector)
      .map((option) => option.subsector || "Sem subsetor específico"),
  );
}

function dl125EntityTypes(sector: string, subsector: string) {
  return dl125EntityOptions.filter((option) => {
    const optionSubsector = option.subsector || "Sem subsetor específico";
    return option.sector === sector && optionSubsector === subsector;
  });
}

function dl125AnnexLabel(annex: Dl125Annex) {
  if (annex === "annex_i") return "Anexo I - setores de importância crítica";
  if (annex === "annex_ii") return "Anexo II - outros setores críticos";
  if (annex === "other") return "Outro / não identificado nos anexos";
  return "Por selecionar";
}

function dl125SizeLabel(size: Dl125SizeAssessment) {
  if (size === "exceeds_medium_thresholds") return "Excede limiares de média empresa";
  if (size === "below_medium_thresholds") return "Não excede limiares de média empresa";
  return "Dimensão por confirmar";
}

function parsePositiveNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function deriveDl125SizeAssessment(form: Pick<InstitutionalOnboardingForm, "employee_count" | "annual_turnover_million_eur">): Dl125SizeAssessment {
  const employeeCount = Number.parseInt(form.employee_count, 10);
  const turnover = parsePositiveNumber(form.annual_turnover_million_eur);
  if (!Number.isFinite(employeeCount) || turnover === null) return "unknown";
  return employeeCount >= 250 || turnover > 50 ? "exceeds_medium_thresholds" : "below_medium_thresholds";
}

function computeDl125Classification(form: InstitutionalOnboardingForm): {
  classification: Nis2Classification;
  criteria: string;
  services: string[];
} {
  const option = selectedDl125Option(form);
  const employeeCount = Number.parseInt(form.employee_count, 10);
  const turnover = parsePositiveNumber(form.annual_turnover_million_eur);
  const sizeAssessment = deriveDl125SizeAssessment(form);
  const exceedsMedium = sizeAssessment === "exceeds_medium_thresholds";
  const services = option ? [option.sector, option.subsector, option.entityType].filter((value): value is string => Boolean(value)) : [];

  if (form.dl125_annex === "other" || form.dl125_sector === "Outro") {
    return {
      classification: "Out of Scope",
      services: [],
      criteria:
        "O setor/tipo de entidade foi assinalado como 'Outro' e não foi identificado nos anexos I ou II do DL 125/2025. A plataforma classifica como não abrangida por obrigações legais específicas deste diploma, mantendo recomendações iniciais de boas práticas de governação, risco, continuidade, políticas e evidência.",
    };
  }

  if (!option) {
    return {
      classification: "Pending",
      services: [],
      criteria:
        "Ainda não foi selecionado um tipo de entidade dos anexos I ou II do DL 125/2025. A classificação permanece por confirmar até existir setor, subsetor e tipo de entidade selecionados.",
    };
  }

  if (!Number.isFinite(employeeCount) || turnover === null) {
    return {
      classification: "Pending",
      services,
      criteria: `${option.entityType} consta do ${dl125AnnexLabel(option.annex)}, mas ainda faltam dados objetivos de dimensão: número de trabalhadores e volume de negócios anual. A plataforma só fecha a classificação depois de estes dados estarem preenchidos.`,
    };
  }

  if (option.forceEssential) {
    return {
      classification: "Essential",
      services,
      criteria: `${option.entityType} consta do ${dl125AnnexLabel(option.annex)}. Nos termos do artigo 6.º do DL 125/2025, este tipo de entidade deve ser tratado como entidade essencial independentemente da dimensão. Dados registados: ${employeeCount} trabalhadores e ${turnover} M€ de volume de negócios anual.`,
    };
  }

  if (option.annex === "annex_i" && exceedsMedium) {
    return {
      classification: "Essential",
      services,
      criteria: `${option.entityType} consta do Anexo I do DL 125/2025. Com ${employeeCount} trabalhadores e ${turnover} M€ de volume de negócios anual, a entidade excede os limiares considerados pela plataforma para média empresa. Classificação calculada: entidade essencial.`,
    };
  }

  return {
    classification: "Important",
    services,
    criteria:
      option.annex === "annex_i"
        ? `${option.entityType} consta do Anexo I do DL 125/2025, mas os dados de dimensão registados (${employeeCount} trabalhadores e ${turnover} M€ de volume de negócios anual) não excedem os limiares considerados pela plataforma para média empresa. Classificação calculada: entidade importante, sem prejuízo de validação humana e eventual qualificação pela autoridade competente.`
        : `${option.entityType} consta do Anexo II do DL 125/2025. Com ${employeeCount} trabalhadores e ${turnover} M€ de volume de negócios anual registados, a classificação calculada pela plataforma é entidade importante, salvo qualificação específica em sentido diferente pela autoridade competente.`,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getProfileForm(profile: CompanyProfile, regulatory?: RegulatoryContextRecord | null): InstitutionalOnboardingForm {
  const answers = profile.onboarding_answers || {};

  const baseForm: InstitutionalOnboardingForm = {
    ...emptyForm,
    legal_name: profile.legal_name || "",
    org_type: profile.org_type || "Public",
    sector: profile.sector || "",
    employee_count: profile.employee_count ? String(profile.employee_count) : "",
    annual_turnover_million_eur: asString(answers.annual_turnover_million_eur),
    city: profile.city || "",
    country: profile.country || "Portugal",
    critical_services: profile.critical_services || "",
    dl125_annex: asDl125Annex(answers.dl125_annex),
    dl125_sector: asString(answers.dl125_sector),
    dl125_subsector: asString(answers.dl125_subsector),
    dl125_entity_type_id: asString(answers.dl125_entity_type_id),
    dl125_size_assessment: asDl125SizeAssessment(answers.dl125_size_assessment),
    essential_services: asStringArray(answers.essential_services, emptyForm.essential_services),
    entity_category: asNis2Classification(regulatory?.nis2_classification || answers.entity_category),
    classification_criteria: regulatory?.classification_criteria || asString(answers.classification_criteria),
    competent_authority: regulatory?.competent_authority || asString(answers.competent_authority) || "CNCS",
    public_relevant_group: asString(answers.public_relevant_group),
    supplier_dependency: asString(answers.supplier_dependency),
    risk_appetite: profile.risk_appetite || asRiskAppetite(answers.risk_appetite),
    cybersecurity_responsible_name: asString(answers.cybersecurity_responsible_name),
    cybersecurity_responsible_email: asString(answers.cybersecurity_responsible_email),
    cybersecurity_responsible_role: asString(answers.cybersecurity_responsible_role) || "Responsável de Cibersegurança",
    permanent_contact_name: asString(answers.permanent_contact_name),
    permanent_contact_email: asString(answers.permanent_contact_email),
    management_body: asString(answers.management_body),
    incident_contact_process: asString(answers.incident_contact_process),
    frameworks: profile.preferred_frameworks?.length ? profile.preferred_frameworks : emptyForm.frameworks,
    posture: asPosture(answers.posture),
  };

  const computed = computeDl125Classification(baseForm);
  return {
    ...baseForm,
    sector: baseForm.dl125_sector || baseForm.sector,
    entity_category: baseForm.entity_category === "Pending" ? computed.classification : baseForm.entity_category,
    classification_criteria: baseForm.classification_criteria || computed.criteria,
    essential_services: baseForm.essential_services.length ? baseForm.essential_services : computed.services,
  };
}

function buildObligations(form: InstitutionalOnboardingForm) {
  if (form.entity_category === "Pending") {
    return [
      "Confirmar enquadramento DL 125/2025/NIS2 com base no setor, subsetor, tipo de entidade, trabalhadores e volume de negócios.",
      "Documentar o racional de classificação e manter evidência da decisão tomada pelo CISO.",
      "Criar política de segurança da informação aprovada pela gestão.",
      "Criar inventário de ativos, owners e classificação de criticidade.",
      "Realizar avaliação inicial de riscos e definir risco residual aceitável.",
      "Definir procedimento de resposta a incidentes e contactos internos de escalamento.",
      "Criar plano de ações de governação com owners, prioridades e datas-alvo.",
    ];
  }

  if (form.entity_category === "Out of Scope") {
    return [
      "Documentar o racional de não abrangência no DL 125/2025 e rever periodicamente se a atividade, dimensão ou serviços prestados mudaram.",
      "Criar política de segurança da informação aprovada pela gestão.",
      "Criar inventário de ativos, owners e classificação de criticidade.",
      "Realizar avaliação inicial de riscos e definir risco residual aceitável.",
      "Definir procedimento de resposta a incidentes e contactos internos de escalamento.",
      "Implementar mecanismos mínimos de controlo de acessos, backups, atualização de sistemas e registo de evidências.",
      "Criar plano de ações de governação com owners, prioridades e datas-alvo.",
    ];
  }

  const obligations = [
    "Registar e manter atualizados os elementos de identificação, setor/subsetor e contactos aplicáveis.",
    "Aprovação e supervisão das medidas de gestão dos riscos de cibersegurança pelos órgãos de gestão.",
    "Medidas técnicas, operacionais e organizativas para gerir riscos nas redes e sistemas de informação.",
    "Continuidade das atividades, backups, recuperação de desastres e gestão de crises.",
    "Segurança da cadeia de abastecimento e relações com fornecedores/prestadores diretos.",
    "Políticas e procedimentos para avaliar a eficácia das medidas de gestão de risco.",
    "Ciber-higiene e formação em cibersegurança para gestão e trabalhadores.",
    "Políticas de criptografia/cifragem e proteção de acessos.",
    "Responsável de cibersegurança e ponto de contacto permanente.",
    "Processo de notificação de incidentes significativos e relatório final.",
    "Análise e gestão de riscos sobre os ativos que suportam os serviços essenciais.",
  ];

  if (form.entity_category === "Essential") {
    return [
      ...obligations,
      "Elaborar e submeter relatório anual à autoridade de cibersegurança competente nos termos aplicáveis às entidades essenciais.",
      "Preparar evidência para supervisão, auditorias e pedidos de informação com rastreabilidade por controlo, mecanismo e evidência.",
    ];
  }

  return [
    ...obligations,
    "Manter relatório anual preparado e comunicável ao CNCS quando solicitado, nos termos aplicáveis às entidades importantes.",
    "Preparar evidência para supervisão ex post e pedidos de informação da autoridade competente.",
  ];
}

function buildRecommendedActions(form: InstitutionalOnboardingForm): OnboardingAction[] {
  const actions: OnboardingAction[] = [];

  const add = (action: OnboardingAction) => {
    if (!actions.some((item) => item.id === action.id)) actions.push(action);
  };

  add({
    id: "institutional_context",
    title: "Validar contexto institucional e regulatório",
    detail: "Confirmar setor, subsetor, tipo de entidade, trabalhadores, volume de negócios, autoridade competente e racional de classificação.",
    path: "/governance/regulatory",
    priority: "high",
  });

  if (form.entity_category === "Pending") {
    add({
      id: "confirm_dl125_classification",
      title: "Fechar classificação DL 125/2025",
      detail: "A classificação ainda está por confirmar. Validar setor/subsetor, tipo de entidade, trabalhadores, volume de negócios e eventual qualificação pela autoridade competente.",
      path: "/onboarding",
      priority: "high",
    });
  }

  if (form.entity_category === "Essential") {
    add({
      id: "annual_report_essential",
      title: "Preparar relatório anual de entidade essencial",
      detail: "Definir owner, calendário, evidências e assinatura do responsável de cibersegurança para submissão anual.",
      path: "/governance/action-plan",
      priority: "high",
    });
  }

  if (form.entity_category === "Important") {
    add({
      id: "annual_report_important",
      title: "Preparar relatório anual comunicável quando solicitado",
      detail: "Manter registo anual e evidências organizadas para resposta a pedidos do CNCS ou autoridade competente.",
      path: "/governance/action-plan",
      priority: "medium",
    });
  }

  if (form.entity_category === "Out of Scope") {
    add({
      id: "baseline_security_program",
      title: "Criar programa mínimo de segurança",
      detail: "Mesmo sem obrigação legal específica, criar políticas, inventário, avaliação de risco, resposta a incidentes, mecanismos essenciais e evidências de controlo.",
      path: "/governance/action-plan",
      priority: "medium",
    });
  }

  if (!form.cybersecurity_responsible_name || !form.permanent_contact_name) {
    add({
      id: "responsible_contact",
      title: "Designar responsável e ponto de contacto",
      detail: "Formalizar responsável de cibersegurança e contacto permanente para incidentes e supervisão.",
      path: "/governance/responsibilities",
      priority: "high",
    });
  }

  postureQuestions.forEach((question) => {
    const answer = form.posture[question.id];
    if (answer === "no" || answer === "partial" || answer === "unknown") {
      add({
        id: question.id,
        title: question.recommendedAction,
        detail: question.obligation,
        path: question.path,
        priority: answer === "no" || answer === "unknown" ? "high" : "medium",
      });
    }
  });

  add({
    id: "workbench",
    title: "Abrir Governance Workbench",
    detail: "Acompanhar gaps, mapeamentos, tarefas e evidências numa fila de trabalho única.",
    path: "/governance/workbench",
    priority: "medium",
  });

  return actions;
}

function buildApplicableObligationsText(form: InstitutionalOnboardingForm) {
  return buildObligations(form)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
}

function StepProgress({ currentStep, onSelect }: { currentStep: number; onSelect: (index: number) => void }) {
  return (
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = index === currentStep;
        const complete = index < currentStep;
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelect(index)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition-all ${
              active
                ? "border-slate-950 bg-slate-950 text-white"
                : complete
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs font-bold">{step.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
      >
        {children}
      </select>
    </label>
  );
}

function ChoiceButton({
  selected,
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-20 rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-indigo-300 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      <span className="block text-sm font-bold">{title}</span>
      {detail && <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{detail}</span>}
    </button>
  );
}

function buildOnboardingFallback(form: InstitutionalOnboardingForm, step: StepKey) {
  const missing = [
    !form.legal_name.trim() ? "nome legal da entidade" : "",
    !form.employee_count.trim() ? "numero de trabalhadores" : "",
    !form.annual_turnover_million_eur.trim() ? "volume de negocios anual" : "",
    !form.dl125_sector ? "setor de atividade" : "",
    form.dl125_sector && form.dl125_sector !== "Outro" && !form.dl125_entity_type_id ? "tipo de entidade/atividade" : "",
    form.entity_category !== "Out of Scope" && !form.cybersecurity_responsible_name.trim() ? "responsavel de ciberseguranca" : "",
    form.entity_category !== "Out of Scope" && !form.permanent_contact_name.trim() ? "ponto de contacto permanente" : "",
  ].filter(Boolean);

  const nextActions =
    form.entity_category === "Out of Scope"
      ? [
          "Documentar o racional de nao abrangencia.",
          "Criar documentos internos de seguranca, inventario de ativos e avaliacao inicial de risco.",
          "Definir resposta a incidentes, backups, controlo de acessos e evidencias minimas.",
        ]
      : [
          "Validar o enquadramento calculado e guardar o racional.",
          "Designar responsavel de ciberseguranca e contacto permanente.",
          "Criar o plano inicial de acoes, evidencias e revisoes.",
        ];

  return [
    "O servico LLM excedeu o tempo limite alargado. A plataforma gerou esta orientacao operacional com base nos dados ja preenchidos.",
    "",
    `Passo atual: ${step}.`,
    `Classificacao calculada: ${nis2ClassificationLabel(form.entity_category)}.`,
    "",
    "Dados a confirmar:",
    ...(missing.length ? missing.map((item) => `- ${item}`) : ["- Nao foram detetados campos obrigatorios em falta neste passo."]),
    "",
    "Proximas acoes:",
    ...nextActions.map((item) => `- ${item}`),
    "",
    "Mantem a decisao final validada por uma pessoa responsavel, sobretudo se existirem duvidas sobre o enquadramento legal.",
  ].join("\n");
}

function AiHelpPanel({ form, step }: { form: InstitutionalOnboardingForm; step: StepKey }) {
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);
    setAnswer("");
    const prompt = [
      "Estou a preencher o formulario inicial de uma organizacao numa plataforma de apoio a seguranca.",
      "Usa apenas os dados abaixo e conhecimento geral sobre o DL 125/2025. Mantem a resposta curta e pratica.",
      `Passo atual: ${step}`,
      `Organizacao: ${form.legal_name || "por preencher"}`,
      `Tipo: ${form.org_type}; setor: ${form.dl125_sector || form.sector || "por preencher"}; subsetor: ${form.dl125_subsector || "por preencher"}; tipo de entidade: ${selectedDl125Option(form)?.entityType || "por preencher"}; trabalhadores: ${form.employee_count || "por preencher"}; volume de negocios anual: ${form.annual_turnover_million_eur || "por preencher"} M EUR; classificacao calculada: ${nis2ClassificationLabel(form.entity_category)}`,
      `Servicos/atividade critica: ${form.critical_services || form.essential_services.join(", ") || "por preencher"}`,
      `Responsavel: ${form.cybersecurity_responsible_name || "por preencher"}; contacto permanente: ${form.permanent_contact_name || "por preencher"}`,
      `Postura inicial: ${JSON.stringify(form.posture)}`,
      "Responde em portugues de Portugal com 4 blocos: dados em falta, enquadramento provavel, pontos de atencao e proximos passos. Nao inventes factos; quando faltar informacao, diz que deve ser validada.",
    ].join("\n");

    try {
      const response = await chatApi.askOnboardingHelp(prompt);
      const text = response.response || "";
      if (text.includes("Não foi possível contactar") || text.includes("Nao foi possivel contactar")) {
        setAnswer(buildOnboardingFallback(form, step));
      } else {
        setAnswer(text);
      }
    } catch (err) {
      setAnswer(buildOnboardingFallback(form, step));
      setError(getErrorMessage(err, "Nao foi possivel contactar o assistente IA; foi apresentada orientacao local."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-3 text-indigo-700">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Assistente IA</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">Apoio ao preenchimento</h3>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-indigo-900">
            Usa o contexto preenchido para explicar obrigações, dúvidas e próximos passos. Em LLM local pode demorar alguns minutos.
          </p>
          <button
            type="button"
            onClick={() => void ask()}
            disabled={loading}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {loading ? "A aguardar IA" : "Pedir ajuda IA"}
          </button>
          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          {answer && (
            <div className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-indigo-100 bg-white p-4 text-sm font-semibold leading-relaxed text-slate-700">
              {answer}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [regulatory, setRegulatory] = useState<RegulatoryContextRecord | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [form, setForm] = useState<InstitutionalOnboardingForm>(emptyForm);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStructure, setSavingStructure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showOrgChart, setShowOrgChart] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<Record<string, boolean>>({});
  const [selectedCybersecurityPersonId, setSelectedCybersecurityPersonId] = useState("");
  const [selectedPermanentContactPersonId, setSelectedPermanentContactPersonId] = useState("");
  const [selectedDepartmentPersonId, setSelectedDepartmentPersonId] = useState("");
  const [editingDepartmentPersonId, setEditingDepartmentPersonId] = useState("");
  const [newDepartment, setNewDepartment] = useState({
    name: "",
    responsibleName: "",
    responsibleEmail: "",
    parent: "",
  });
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [editingDepartment, setEditingDepartment] = useState({
    name: "",
    responsibleName: "",
    responsibleEmail: "",
    parent: "",
  });

  const actions = useMemo(() => buildRecommendedActions(form), [form]);
  const obligations = useMemo(() => buildObligations(form), [form]);
  const completion = Math.round(((currentStep + 1) / steps.length) * 100);
  const activeStep = steps[currentStep]?.key || "organization";
  const incompletePosture = postureQuestions.filter((question) => form.posture[question.id] !== "yes");
  const dl125AvailableSectors = useMemo(() => dl125Sectors(), []);
  const dl125AvailableSubsectors = useMemo(
    () => dl125Subsectors(form.dl125_sector),
    [form.dl125_sector],
  );
  const dl125AvailableEntityTypes = useMemo(
    () => dl125EntityTypes(form.dl125_sector, form.dl125_subsector),
    [form.dl125_sector, form.dl125_subsector],
  );
  const dl125Option = useMemo(() => selectedDl125Option(form), [form]);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const orgUnitsByParent = useMemo(() => {
    const grouped = new Map<string, OrgUnit[]>();
    orgUnits.forEach((unit) => {
      const parent = unit.parent || "root";
      grouped.set(parent, [...(grouped.get(parent) || []), unit]);
    });
    return grouped;
  }, [orgUnits]);
  const rootOrgUnits = orgUnitsByParent.get("root") || [];
  const orgUnitsWithResponsible = orgUnits.filter((unit) => unit.manager).length;
  const selectedFormalActionIds = useMemo(
    () => actions.filter((action) => action.id !== "workbench" && selectedActionIds[action.id] !== false).map((action) => action.id),
    [actions, selectedActionIds],
  );

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      companyApi.getProfile(),
      governanceApi.getRegulatoryContext(),
      companyApi.listOrgUnits({ page_size: 1000 }),
      companyApi.listPeople({ page_size: 1000 }),
    ])
      .then(([profileResult, regulatoryResult, orgUnitsResult, peopleResult]) => {
        if (!mounted) return;
        const loadedProfile = profileResult.status === "fulfilled" ? profileResult.value : null;
        const loadedRegulatory = regulatoryResult.status === "fulfilled" ? regulatoryResult.value : null;
        if (loadedProfile) {
          setProfile(loadedProfile);
          setRegulatory(loadedRegulatory);
          setForm(getProfileForm(loadedProfile, loadedRegulatory));
        }
        if (orgUnitsResult.status === "fulfilled") setOrgUnits(unwrapList(orgUnitsResult.value));
        if (peopleResult.status === "fulfilled") setPeople(unwrapList(peopleResult.value));
        if (profileResult.status === "rejected") {
          setError(getErrorMessage(profileResult.reason, "Nao foi possivel carregar o perfil institucional."));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedActionIds((current) => {
      const next: Record<string, boolean> = {};
      actions.forEach((action) => {
        next[action.id] = current[action.id] ?? action.id !== "workbench";
      });
      return next;
    });
  }, [actions]);

  const updateForm = (patch: Partial<InstitutionalOnboardingForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateDl125Context = (patch: Partial<InstitutionalOnboardingForm>) => {
    setForm((current) => {
      const draft = { ...current, ...patch };
      const option = selectedDl125Option(draft);
      const inferredAnnex: Dl125Annex = draft.dl125_sector === "Outro" ? "other" : option?.annex || draft.dl125_annex;
      const next = {
        ...draft,
        dl125_annex: inferredAnnex,
        dl125_size_assessment: deriveDl125SizeAssessment(draft),
      };
      const computed = computeDl125Classification(next);
      return {
        ...next,
        sector: next.dl125_sector || next.sector,
        essential_services: computed.services,
        entity_category: computed.classification,
        classification_criteria: computed.criteria,
      };
    });
  };

  const updatePosture = (id: string, value: PostureAnswer) => {
    setForm((current) => ({ ...current, posture: { ...current.posture, [id]: value } }));
  };

  const selectContactPerson = (personId: string, role: "cybersecurity" | "permanent_contact") => {
    const person = people.find((item) => item.id === personId);
    if (role === "cybersecurity") {
      setSelectedCybersecurityPersonId(personId);
      if (person) {
        updateForm({
          cybersecurity_responsible_name: person.name,
          cybersecurity_responsible_email: person.email || "",
          cybersecurity_responsible_role: person.role || person.governance_role_display || form.cybersecurity_responsible_role,
        });
      }
    } else {
      setSelectedPermanentContactPersonId(personId);
      if (person) {
        updateForm({
          permanent_contact_name: person.name,
          permanent_contact_email: person.email || "",
        });
      }
    }
  };

  const selectDepartmentPerson = (personId: string) => {
    setSelectedDepartmentPersonId(personId);
    const person = people.find((item) => item.id === personId);
    if (!person) return;
    setNewDepartment((current) => ({
      ...current,
      responsibleName: person.name,
      responsibleEmail: person.email || "",
    }));
  };

  const selectEditingDepartmentPerson = (personId: string) => {
    setEditingDepartmentPersonId(personId);
    const person = people.find((item) => item.id === personId);
    if (!person) return;
    setEditingDepartment((current) => ({
      ...current,
      responsibleName: person.name,
      responsibleEmail: person.email || "",
    }));
  };

  const reloadStructure = async () => {
    const [unitsData, peopleData] = await Promise.all([
      companyApi.listOrgUnits({ page_size: 1000 }),
      companyApi.listPeople({ page_size: 1000 }),
    ]);
    setOrgUnits(unwrapList(unitsData));
    setPeople(unwrapList(peopleData));
  };

  const saveContactPerson = async (role: "cybersecurity" | "permanent_contact") => {
    const isCybersecurity = role === "cybersecurity";
    const selectedId = isCybersecurity ? selectedCybersecurityPersonId : selectedPermanentContactPersonId;
    const name = isCybersecurity ? form.cybersecurity_responsible_name.trim() : form.permanent_contact_name.trim();
    const email = isCybersecurity ? form.cybersecurity_responsible_email.trim() : form.permanent_contact_email.trim();
    const roleLabel = isCybersecurity ? form.cybersecurity_responsible_role.trim() || "Responsável de Cibersegurança" : "Ponto de contacto permanente";

    if (!name) {
      setError(isCybersecurity ? "Indica o responsável de cibersegurança." : "Indica o ponto de contacto permanente.");
      return;
    }

    setSavingStructure(true);
    setError(null);
    setMessage(null);

    try {
      const existingByEmail = email
        ? people.find((person) => person.email?.toLowerCase() === email.toLowerCase())
        : null;
      const personId = selectedId || existingByEmail?.id;
      const payload: Partial<Person> = {
        name,
        email,
        role: roleLabel,
        governance_role: isCybersecurity ? "ciso" : "security_officer",
        is_security_contact: true,
        responsibilities: isCybersecurity
          ? "Responsável pelo programa de segurança da informação, articulação com a gestão e coordenação de obrigações DL 125/2025/NIS2."
          : "Ponto de contacto permanente para incidentes, notificações e escalamento operacional.",
      };
      const savedPerson = personId
        ? await companyApi.updatePerson(personId, payload)
        : await companyApi.createPerson(payload);
      if (isCybersecurity) {
        setSelectedCybersecurityPersonId(savedPerson.id);
      } else {
        setSelectedPermanentContactPersonId(savedPerson.id);
      }
      await reloadStructure();
      setMessage(isCybersecurity ? "Responsável de cibersegurança guardado no catálogo de pessoas." : "Ponto de contacto guardado no catálogo de pessoas.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Nao foi possivel guardar a pessoa no catalogo."));
    } finally {
      setSavingStructure(false);
    }
  };

  const saveDepartment = async () => {
    if (!newDepartment.name.trim()) {
      setError("Indica o nome do departamento.");
      return;
    }
    if (!newDepartment.responsibleName.trim()) {
      setError("Indica o responsável do departamento.");
      return;
    }

    setSavingStructure(true);
    setError(null);
    setMessage(null);

    try {
      const selectedPerson = selectedDepartmentPersonId ? peopleById.get(selectedDepartmentPersonId) : null;
      const person = selectedPerson
        ? await companyApi.updatePerson(selectedPerson.id, {
            name: newDepartment.responsibleName.trim(),
            email: newDepartment.responsibleEmail.trim() || undefined,
            role: `Responsável - ${newDepartment.name.trim()}`,
            governance_role: "business_owner",
          })
        : await companyApi.createPerson({
            name: newDepartment.responsibleName.trim(),
            email: newDepartment.responsibleEmail.trim() || undefined,
            role: `Responsável - ${newDepartment.name.trim()}`,
            governance_role: "business_owner",
          });
      const unit = await companyApi.createOrgUnit({
        name: newDepartment.name.trim(),
        unit_type: "business",
        parent: newDepartment.parent || null,
        manager: person.id,
      });
      await companyApi.updatePerson(person.id, { org_unit: unit.id });
      await reloadStructure();
      setNewDepartment({ name: "", responsibleName: "", responsibleEmail: "", parent: "" });
      setSelectedDepartmentPersonId("");
      setMessage("Departamento e responsável guardados na estrutura organizacional.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Nao foi possivel guardar o departamento e o responsavel."));
    } finally {
      setSavingStructure(false);
    }
  };

  const startDepartmentEdit = (unit: OrgUnit) => {
    const manager = unit.manager ? peopleById.get(unit.manager) : null;
    setEditingDepartmentId(unit.id);
    setEditingDepartmentPersonId(unit.manager || "");
    setEditingDepartment({
      name: unit.name,
      responsibleName: manager?.name || unit.manager_name || "",
      responsibleEmail: manager?.email || "",
      parent: unit.parent || "",
    });
    setError(null);
    setMessage(null);
  };

  const cancelDepartmentEdit = () => {
    setEditingDepartmentId(null);
    setEditingDepartmentPersonId("");
    setEditingDepartment({ name: "", responsibleName: "", responsibleEmail: "", parent: "" });
  };

  const saveDepartmentEdit = async (unit: OrgUnit) => {
    if (!editingDepartment.name.trim()) {
      setError("Indica o nome do departamento.");
      return;
    }
    if (!editingDepartment.responsibleName.trim()) {
      setError("Indica o responsável do departamento.");
      return;
    }
    if (editingDepartment.parent === unit.id) {
      setError("Um departamento não pode ser o seu próprio departamento pai.");
      return;
    }

    setSavingStructure(true);
    setError(null);
    setMessage(null);

    try {
      let managerId = editingDepartmentPersonId;
      if (managerId) {
        await companyApi.updatePerson(managerId, {
          name: editingDepartment.responsibleName.trim(),
          email: editingDepartment.responsibleEmail.trim() || undefined,
          role: `Responsável - ${editingDepartment.name.trim()}`,
          governance_role: "business_owner",
          org_unit: unit.id,
        });
      } else {
        const person = await companyApi.createPerson({
          name: editingDepartment.responsibleName.trim(),
          email: editingDepartment.responsibleEmail.trim() || undefined,
          role: `Responsável - ${editingDepartment.name.trim()}`,
          governance_role: "business_owner",
        });
        managerId = person.id;
      }

      await companyApi.updateOrgUnit(unit.id, {
        name: editingDepartment.name.trim(),
        parent: editingDepartment.parent || null,
        manager: managerId,
      });
      await companyApi.updatePerson(managerId, { org_unit: unit.id });
      await reloadStructure();
      cancelDepartmentEdit();
      setMessage("Departamento atualizado.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Nao foi possivel atualizar o departamento."));
    } finally {
      setSavingStructure(false);
    }
  };

  const validateStep = () => {
    if (activeStep === "organization" && !form.legal_name.trim()) return "Indica o nome da instituicao.";
    if (activeStep === "organization" && !form.employee_count.trim()) return "Indica o numero de trabalhadores.";
    if (activeStep === "organization" && !Number.isFinite(Number.parseInt(form.employee_count, 10))) return "Indica um numero de trabalhadores valido.";
    if (activeStep === "organization" && !form.annual_turnover_million_eur.trim()) return "Indica o volume de negocios anual em milhoes de euros.";
    if (activeStep === "organization" && parsePositiveNumber(form.annual_turnover_million_eur) === null) return "Indica um volume de negocios anual valido.";
    if (activeStep === "structure" && orgUnits.length === 0) return "Adiciona pelo menos um departamento.";
    if (activeStep === "structure" && orgUnitsWithResponsible === 0) return "Associa pelo menos um responsável a um departamento.";
    if (activeStep === "legal" && !form.dl125_sector) return "Seleciona o setor de atividade ou escolhe Outro.";
    if (activeStep === "legal" && form.dl125_sector !== "Outro" && !form.dl125_entity_type_id) return "Seleciona o subsetor e o tipo de entidade previsto no DL 125/2025.";
    if (activeStep === "legal" && !form.classification_criteria.trim()) {
      return "Indica o racional de classificacao DL 125/2025/NIS2.";
    }
    if (activeStep === "legal" && form.entity_category !== "Out of Scope") {
      if (!form.cybersecurity_responsible_name.trim()) return "Indica o responsavel de ciberseguranca.";
      if (!form.permanent_contact_name.trim()) return "Indica o ponto de contacto permanente.";
      if (!form.incident_contact_process.trim()) return "Descreve o processo de contacto e notificacao de incidentes.";
    }
    return null;
  };

  const save = async (complete = false) => {
    const validation = validateStep();
    if (validation && !complete) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const employeeCount = Number.parseInt(form.employee_count, 10);
      const annualTurnover = parsePositiveNumber(form.annual_turnover_million_eur);
      const computedSizeAssessment = deriveDl125SizeAssessment(form);
      const payload: Partial<CompanyProfile> = {
        legal_name: form.legal_name || "A sua Instituição",
        org_type: form.org_type,
        sector: form.dl125_sector || form.sector,
        employee_count: Number.isFinite(employeeCount) ? employeeCount : null,
        city: form.city,
        country: form.country || "Portugal",
        critical_services: form.critical_services || form.essential_services.join("\n"),
        security_objectives: [
          "Cumprir obrigações DL 125/2025/NIS2 com evidência auditável.",
          "Reduzir risco residual dos serviços críticos.",
          "Manter inventário, controlos, mecanismos e evidências rastreáveis.",
        ].join("\n"),
        primary_security_goals: ["institutional_governance", "compliance_readiness", "risk_reduction", "evidence_management"],
        preferred_frameworks: profile?.preferred_frameworks || form.frameworks,
        risk_appetite: form.risk_appetite,
        onboarding_answers: {
          dl125_annex: form.dl125_annex,
          dl125_sector: form.dl125_sector,
          dl125_subsector: form.dl125_subsector,
          dl125_entity_type_id: form.dl125_entity_type_id,
          dl125_entity_type: dl125Option?.entityType || "",
          dl125_size_assessment: computedSizeAssessment,
          annual_turnover_million_eur: annualTurnover === null ? "" : String(annualTurnover),
          essential_services: form.essential_services,
          entity_category: form.entity_category,
          classification_criteria: form.classification_criteria,
          competent_authority: form.competent_authority,
          public_relevant_group: form.public_relevant_group,
          supplier_dependency: form.supplier_dependency,
          cybersecurity_responsible_name: form.cybersecurity_responsible_name,
          cybersecurity_responsible_email: form.cybersecurity_responsible_email,
          cybersecurity_responsible_role: form.cybersecurity_responsible_role,
          permanent_contact_name: form.permanent_contact_name,
          permanent_contact_email: form.permanent_contact_email,
          management_body: form.management_body,
          incident_contact_process: form.incident_contact_process,
          posture: form.posture,
          dl125_obligations_snapshot: obligations,
        },
        onboarding_recommended_actions: actions,
        institutional_onboarding_required: complete ? false : profile?.institutional_onboarding_required ?? true,
        onboarding_completed_at: complete ? new Date().toISOString() : profile?.onboarding_completed_at || null,
      };

      const updated = await companyApi.updateProfile(payload);
      setProfile(updated);

      try {
        const currentRegulatory = regulatory?.id ? regulatory : await governanceApi.getRegulatoryContext();
        if (currentRegulatory?.id) {
          const updatedRegulatory = await governanceApi.updateRegulatoryContext(currentRegulatory.id, {
            nis2_classification: form.entity_category,
            classification_criteria: form.classification_criteria,
            applicable_obligations: buildApplicableObligationsText(form),
            competent_authority: form.competent_authority,
            last_reviewed_at: todayIsoDate(),
          });
          setRegulatory(updatedRegulatory);
          setForm(getProfileForm(updated, updatedRegulatory));
        } else {
          setForm(getProfileForm(updated, regulatory));
        }
      } catch {
        setForm(getProfileForm(updated, regulatory));
      }

      let generatedActions = null;
      if (complete) {
        try {
          generatedActions = await governanceApi.generateGovernanceActionsFromOnboarding(
            form.cybersecurity_responsible_name || form.permanent_contact_name || undefined,
            selectedFormalActionIds,
          );
        } catch (actionErr: unknown) {
          setError(
            getErrorMessage(
              actionErr,
              "O onboarding foi guardado, mas nao foi possivel criar as tarefas formais no plano de acoes.",
            ),
          );
          return;
        }
      }

      if (complete) {
        window.dispatchEvent(
          new CustomEvent("institutional-onboarding-required-changed", {
            detail: { required: false },
          }),
        );
        navigate(
          `/governance/action-plan?source_type=onboarding&created=${generatedActions?.created || 0}&updated=${generatedActions?.updated || 0}`,
        );
      } else {
        setMessage("Onboarding institucional guardado.");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Nao foi possivel guardar o onboarding institucional."));
    } finally {
      setSaving(false);
    }
  };

  const nextStep = async () => {
    const validation = validateStep();
    if (validation) {
      setError(validation);
      return;
    }
    await save(false);
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  };

  function renderOrgNode(unit: OrgUnit, depth = 0) {
    const manager = unit.manager ? peopleById.get(unit.manager) : null;
    const children = orgUnitsByParent.get(unit.id) || [];
    return (
      <div key={unit.id} className="space-y-3">
        <div
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          style={{ marginLeft: depth ? Math.min(depth * 28, 84) : 0 }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Departamento</p>
              <h3 className="mt-1 text-base font-bold text-slate-950">{unit.name}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {unit.parent_name ? `Depende de ${unit.parent_name}` : "Unidade de topo"}
              </p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Responsável</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{manager?.name || unit.manager_name || "Por definir"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{manager?.role || manager?.email || "Sem detalhe adicional"}</p>
            </div>
          </div>
        </div>
        {children.map((child) => renderOrgNode(child, depth + 1))}
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-sm font-semibold text-slate-500">A carregar onboarding institucional...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Setup regulatório e organizacional</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Onboarding da instituição</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              Guia inicial para transformar o DL 125/2025/NIS2 em contexto, responsabilidades, perguntas de postura,
              obrigações e plano de trabalho rastreável para o CISO.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              <Rocket className="h-4 w-4 text-indigo-300" />
              Concluir setup
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Progresso</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">{completion}% do percurso inicial</p>
          </div>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>
        <StepProgress currentStep={currentStep} onSelect={setCurrentStep} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          {activeStep === "organization" && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 1</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Identificação da instituição</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  Esta informação alimenta risco, conformidade, RAG e recomendações do assistente.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label="Nome legal" value={form.legal_name} onChange={(value) => updateForm({ legal_name: value })} />
                <SelectInput label="Tipo de organização" value={form.org_type} onChange={(value) => updateForm({ org_type: value as OrganizationType })}>
                  <option value="Public">Pública</option>
                  <option value="Private">Privada</option>
                  <option value="ThirdSector">Terceiro setor</option>
                </SelectInput>
                <TextInput label="Número de trabalhadores" value={form.employee_count} onChange={(value) => updateDl125Context({ employee_count: value })} type="number" />
                <TextInput label="Volume de negócios anual (M€)" value={form.annual_turnover_million_eur} onChange={(value) => updateDl125Context({ annual_turnover_million_eur: value })} placeholder="Ex: 12,5" />
                <TextInput label="Cidade" value={form.city} onChange={(value) => updateForm({ city: value })} />
                <TextInput label="País" value={form.country} onChange={(value) => updateForm({ country: value })} />
              </div>

            </div>
          )}

          {activeStep === "structure" && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 2</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">Estrutura organizacional</h2>
                  <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                    Regista apenas os departamentos e os respetivos responsáveis. Estes dados alimentam ownership de políticas,
                    tarefas, ativos e decisões sem misturar obrigações legais neste passo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOrgChart((value) => !value)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-100"
                >
                  <Users className="h-4 w-4" />
                  {showOrgChart ? "Ocultar organograma" : "Ver organograma"}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-slate-950">{orgUnits.length}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Departamentos</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-slate-950">{orgUnitsWithResponsible}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Com responsável</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-slate-950">{people.length}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pessoas registadas</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput label="Departamento" value={newDepartment.name} onChange={(value) => setNewDepartment((current) => ({ ...current, name: value }))} placeholder="Ex: Direção de TI" />
                  <SelectInput label="Departamento pai" value={newDepartment.parent} onChange={(value) => setNewDepartment((current) => ({ ...current, parent: value }))}>
                    <option value="">Sem departamento pai</option>
                    {orgUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </SelectInput>
                  <SelectInput label="Pessoa responsável" value={selectedDepartmentPersonId} onChange={selectDepartmentPerson}>
                    <option value="">Criar nova ou preencher manualmente</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} {person.role ? `- ${person.role}` : person.email ? `- ${person.email}` : ""}
                      </option>
                    ))}
                  </SelectInput>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDepartmentPersonId("");
                        setNewDepartment((current) => ({ ...current, responsibleName: "", responsibleEmail: "" }));
                      }}
                      className="mb-0 inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                    >
                      Nova pessoa
                    </button>
                    <Link to="/governance/responsibilities" className="mb-0 inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
                      Gerir catálogo
                    </Link>
                  </div>
                  <TextInput label="Responsável" value={newDepartment.responsibleName} onChange={(value) => setNewDepartment((current) => ({ ...current, responsibleName: value }))} placeholder="Nome do responsável" />
                  <TextInput label="Email do responsável" value={newDepartment.responsibleEmail} onChange={(value) => setNewDepartment((current) => ({ ...current, responsibleEmail: value }))} type="email" placeholder="email@organizacao.pt" />
                </div>
                <button
                  type="button"
                  onClick={() => void saveDepartment()}
                  disabled={savingStructure}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar departamento
                </button>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">Departamentos e responsáveis</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Podes completar detalhes mais tarde em Dados da Organização.</p>
                  </div>
                  <Link to="/governance/responsibilities" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
                    Gestão completa
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                {orgUnits.length === 0 ? (
                  <div className="p-8 text-center text-sm font-semibold text-slate-500">Ainda não existem departamentos registados.</div>
                ) : showOrgChart ? (
                  <div className="space-y-3 bg-slate-50 p-4">
                    {(rootOrgUnits.length ? rootOrgUnits : orgUnits).map((unit) => renderOrgNode(unit))}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {orgUnits.map((unit) => {
                      const manager = unit.manager ? peopleById.get(unit.manager) : null;
                      const isEditing = editingDepartmentId === unit.id;
                      return (
                        <div key={unit.id} className="p-4">
                          {isEditing ? (
                            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <TextInput
                                  label="Departamento"
                                  value={editingDepartment.name}
                                  onChange={(value) => setEditingDepartment((current) => ({ ...current, name: value }))}
                                />
                                <SelectInput
                                  label="Departamento pai"
                                  value={editingDepartment.parent}
                                  onChange={(value) => setEditingDepartment((current) => ({ ...current, parent: value }))}
                                >
                                  <option value="">Sem departamento pai</option>
                                  {orgUnits
                                    .filter((candidate) => candidate.id !== unit.id)
                                    .map((candidate) => (
                                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                                    ))}
                                </SelectInput>
                                <SelectInput
                                  label="Pessoa responsável"
                                  value={editingDepartmentPersonId}
                                  onChange={selectEditingDepartmentPerson}
                                >
                                  <option value="">Criar nova ou preencher manualmente</option>
                                  {people.map((person) => (
                                    <option key={person.id} value={person.id}>
                                      {person.name} {person.role ? `- ${person.role}` : person.email ? `- ${person.email}` : ""}
                                    </option>
                                  ))}
                                </SelectInput>
                                <div className="flex items-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDepartmentPersonId("");
                                      setEditingDepartment((current) => ({ ...current, responsibleName: "", responsibleEmail: "" }));
                                    }}
                                    className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                                  >
                                    Nova pessoa
                                  </button>
                                  <Link to="/governance/responsibilities" className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
                                    Editar catálogo
                                  </Link>
                                </div>
                                <TextInput
                                  label="Responsável"
                                  value={editingDepartment.responsibleName}
                                  onChange={(value) => setEditingDepartment((current) => ({ ...current, responsibleName: value }))}
                                />
                                <TextInput
                                  label="Email do responsável"
                                  value={editingDepartment.responsibleEmail}
                                  onChange={(value) => setEditingDepartment((current) => ({ ...current, responsibleEmail: value }))}
                                  type="email"
                                />
                              </div>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveDepartmentEdit(unit)}
                                  disabled={savingStructure}
                                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {savingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  Guardar alterações
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelDepartmentEdit}
                                  disabled={savingStructure}
                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-red-700 disabled:opacity-50"
                                >
                                  <X className="h-4 w-4" />
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
                              <div>
                                <p className="text-sm font-bold text-slate-950">{unit.name}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">{unit.parent_name || "Sem unidade pai"}</p>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Responsável</p>
                                <p className="mt-1 text-sm font-semibold text-slate-700">{manager?.name || unit.manager_name || "Por definir"}</p>
                                {(manager?.email) && <p className="mt-1 text-xs font-semibold text-slate-500">{manager.email}</p>}
                              </div>
                              <span className={`rounded-full px-3 py-1 text-center text-[10px] font-bold uppercase tracking-wide ${unit.manager ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                {unit.manager ? "Completo" : "Sem responsável"}
                              </span>
                              <button
                                type="button"
                                onClick={() => startDepartmentEdit(unit)}
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                              >
                                Editar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeStep === "legal" && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 3</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Enquadramento DL 125/2025 / NIS2</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  O objetivo é guardar o racional de enquadramento calculado pela plataforma, não substituir parecer jurídico.
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Classificação automática DL 125/2025</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">Setor, subsetor e atividade</h3>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                      O CISO escolhe o setor e tipo de atividade. A plataforma identifica o anexo aplicável, cruza com trabalhadores
                      e volume de negócios, calcula a classificação e gera tarefas iniciais legais ou de boas práticas.
                    </p>
                  </div>
                  <div className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-wide ${nis2ClassificationTone(form.entity_category)}`}>
                    {nis2ClassificationLabel(form.entity_category)}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <SelectInput
                    label="Setor de atividade"
                    value={form.dl125_sector}
                    onChange={(value) =>
                      updateDl125Context({
                        dl125_annex: value === "Outro" ? "other" : "",
                        dl125_sector: value,
                        dl125_subsector: "",
                        dl125_entity_type_id: "",
                      })
                    }
                  >
                    <option value="">Selecionar setor</option>
                    {dl125AvailableSectors.map((sector) => (
                      <option key={sector} value={sector}>{sector}</option>
                    ))}
                    <option value="Outro">Outro / não abrangido nos anexos</option>
                  </SelectInput>

                  {form.dl125_sector && form.dl125_sector !== "Outro" && (
                    <>
                      <SelectInput
                        label="Subsetor"
                        value={form.dl125_subsector}
                        onChange={(value) =>
                          updateDl125Context({
                            dl125_subsector: value,
                            dl125_entity_type_id: "",
                          })
                        }
                      >
                        <option value="">Selecionar subsetor</option>
                        {dl125AvailableSubsectors.map((subsector) => (
                          <option key={subsector} value={subsector}>{subsector}</option>
                        ))}
                      </SelectInput>

                      <div className="md:col-span-2">
                        <SelectInput
                          label="Tipo de entidade / atividade"
                          value={form.dl125_entity_type_id}
                          onChange={(value) => updateDl125Context({ dl125_entity_type_id: value })}
                        >
                          <option value="">Selecionar tipo de entidade</option>
                          {dl125AvailableEntityTypes.map((option) => (
                            <option key={option.id} value={option.id}>{option.entityType}</option>
                          ))}
                        </SelectInput>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-white bg-white/80 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cálculo efetuado pela plataforma</p>
                  <p className="mt-2 text-sm font-bold text-slate-950">
                    {dl125Option
                      ? `${dl125AnnexLabel(dl125Option.annex)} · ${dl125Option.sector}${dl125Option.subsector ? ` · ${dl125Option.subsector}` : ""}`
                      : form.dl125_sector === "Outro"
                      ? "Outro / não identificado nos anexos"
                      : "Por calcular"}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{dl125SizeLabel(deriveDl125SizeAssessment(form))}</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                    {form.classification_criteria || "Seleciona o tipo de entidade para gerar o racional de classificação."}
                  </p>
                </div>
              </div>

              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Descrição complementar dos serviços/atividade crítica</span>
                <textarea
                  value={form.critical_services}
                  onChange={(event) => updateForm({ critical_services: event.target.value })}
                  rows={5}
                  placeholder="Descreve serviços prestados, dependências, sistemas que suportam a atividade e qualquer dúvida de enquadramento não resolvida pelos dropdowns."
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <div className={`rounded-2xl border p-5 ${nis2ClassificationTone(form.entity_category)}`}>
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">Classificação calculada</p>
                <h3 className="mt-2 text-2xl font-bold">{nis2ClassificationLabel(form.entity_category)}</h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed">
                  {dl125Option
                    ? `${dl125AnnexLabel(dl125Option.annex)} · ${dl125Option.sector}${dl125Option.subsector ? ` · ${dl125Option.subsector}` : ""} · ${dl125Option.entityType}`
                    : dl125AnnexLabel(form.dl125_annex)}
                </p>
                <p className="mt-2 text-xs font-semibold leading-relaxed opacity-80">
                  Esta classificação resulta do setor, subsetor, tipo de atividade, número de trabalhadores e volume de negócios.
                  Se o setor não constar dos anexos, a plataforma mantém recomendações mínimas de boas práticas.
                </p>
              </div>

              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Racional de classificação gerado/editável</span>
                <textarea
                  value={form.classification_criteria}
                  onChange={(event) => updateForm({ classification_criteria: event.target.value })}
                  rows={5}
                  placeholder="Explica setor, dimensão, serviços essenciais, dependências e motivo pelo qual a entidade deve ser considerada essencial/importante/não abrangida."
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label="Autoridade competente" value={form.competent_authority} onChange={(value) => updateForm({ competent_authority: value })} />
                <TextInput label="Grupo público relevante / setor especial" value={form.public_relevant_group} onChange={(value) => updateForm({ public_relevant_group: value })} placeholder="Se aplicável" />
              </div>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Dependências e fornecedores críticos</span>
                <textarea
                  value={form.supplier_dependency}
                  onChange={(event) => updateForm({ supplier_dependency: event.target.value })}
                  rows={4}
                  placeholder="Ex: cloud, SOC externo, fornecedor ERP, comunicações, prestadores de serviços geridos, fornecedores únicos..."
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Confirmações obrigatórias do CISO</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">Responsabilidade, contacto e notificação</h3>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                      Estes campos fecham o enquadramento operacional: quem responde, quem decide, quem é contactado e como se escala um incidente.
                    </p>
                  </div>
                  <Link to="/governance/responsibilities" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
                    Adicionar/editar pessoas
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <SelectInput
                      label="Escolher pessoa existente para responsável"
                      value={selectedCybersecurityPersonId}
                      onChange={(value) => selectContactPerson(value, "cybersecurity")}
                    >
                      <option value="">Preencher manualmente ou escolher pessoa</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} {person.role ? `- ${person.role}` : person.email ? `- ${person.email}` : ""}
                        </option>
                      ))}
                    </SelectInput>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <TextInput label="Responsável de cibersegurança" value={form.cybersecurity_responsible_name} onChange={(value) => updateForm({ cybersecurity_responsible_name: value })} />
                      <TextInput label="Email do responsável" value={form.cybersecurity_responsible_email} onChange={(value) => updateForm({ cybersecurity_responsible_email: value })} type="email" />
                    </div>
                    <TextInput className="mt-4" label="Cargo/função" value={form.cybersecurity_responsible_role} onChange={(value) => updateForm({ cybersecurity_responsible_role: value })} />
                    <button
                      type="button"
                      onClick={() => void saveContactPerson("cybersecurity")}
                      disabled={savingStructure}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {savingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar pessoa
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <SelectInput
                      label="Escolher pessoa existente para ponto de contacto"
                      value={selectedPermanentContactPersonId}
                      onChange={(value) => selectContactPerson(value, "permanent_contact")}
                    >
                      <option value="">Preencher manualmente ou escolher pessoa</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} {person.role ? `- ${person.role}` : person.email ? `- ${person.email}` : ""}
                        </option>
                      ))}
                    </SelectInput>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <TextInput label="Ponto de contacto permanente" value={form.permanent_contact_name} onChange={(value) => updateForm({ permanent_contact_name: value })} />
                      <TextInput label="Email do ponto de contacto" value={form.permanent_contact_email} onChange={(value) => updateForm({ permanent_contact_email: value })} type="email" />
                    </div>
                    <TextInput className="mt-4" label="Órgão de gestão/supervisão" value={form.management_body} onChange={(value) => updateForm({ management_body: value })} placeholder="Ex: Conselho de Administração, Executivo, Direção..." />
                    <button
                      type="button"
                      onClick={() => void saveContactPerson("permanent_contact")}
                      disabled={savingStructure}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {savingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar contacto
                    </button>
                  </div>
                </div>
                <label className="mt-4 block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Processo de contacto/notificação de incidentes</span>
                  <textarea
                    value={form.incident_contact_process}
                    onChange={(event) => updateForm({ incident_contact_process: event.target.value })}
                    rows={5}
                    placeholder="Ex: quem recebe alertas, quem decide notificar, como escalar, como envolver CNCS/autoridade setorial/CNPD quando aplicável."
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Obrigações legais identificadas</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">
                      {form.entity_category === "Out of Scope" ? "Sem obrigação específica identificada no DL 125/2025" : "Obrigações mínimas a operacionalizar"}
                    </h3>
                    <p className="mt-2 max-w-3xl text-xs font-semibold leading-relaxed text-emerald-900">
                      A plataforma trabalha internal-first: primeiro obrigações, controlos internos, mecanismos, tarefas e evidências.
                      ISO, NIST ou outros referenciais são apenas mapeamentos para calcular conformidade mais tarde.
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    {obligations.length} itens
                  </span>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {obligations.map((obligation, index) => (
                    <div key={obligation} className="flex gap-3 rounded-xl border border-emerald-100 bg-white p-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{index + 1}</span>
                      <p className="text-xs font-semibold leading-relaxed text-slate-700">{obligation}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeStep === "risk" && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 4</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Apetite de risco inicial</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  Escolhe o critério de decisão inicial para priorizar ações, exceções, evidências e aceitação temporária de risco.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["conservative", "Conservador", "Exige evidência e validação mais cedo."],
                  ["balanced", "Equilibrado", "Equilibra risco, esforço e maturidade."],
                  ["tolerant", "Tolerante", "Aceita mais risco temporário com justificação."],
                ].map(([value, label, detail]) => (
                  <ChoiceButton
                    key={value}
                    selected={form.risk_appetite === value}
                    title={label}
                    detail={detail}
                    onClick={() => updateForm({ risk_appetite: value as RiskAppetite })}
                  />
                ))}
              </div>
            </div>
          )}

          {activeStep === "posture" && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 5</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Postura inicial de segurança</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  Estas respostas geram gaps e ações iniciais para o Governance Workbench.
                </p>
              </div>
              <div className="space-y-3">
                {postureQuestions.map((question) => (
                  <div key={question.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-950">{question.label}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{question.obligation}</p>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          ["yes", "Sim"],
                          ["partial", "Parcial"],
                          ["no", "Não"],
                          ["unknown", "Não sei"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updatePosture(question.id, value as PostureAnswer)}
                            className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${
                              form.posture[question.id] === value
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white text-slate-500 hover:text-indigo-700"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStep === "plan" && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passo 6</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Plano inicial e obrigações</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  Este resumo fica guardado no perfil institucional e no contexto regulatório.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <Scale className="h-5 w-5 text-indigo-600" />
                  <p className="mt-3 text-2xl font-bold text-slate-950">{nis2ClassificationLabel(form.entity_category)}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Classificação</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <p className="mt-3 text-2xl font-bold text-slate-950">{incompletePosture.length}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gaps iniciais</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <FileCheck className="h-5 w-5 text-emerald-600" />
                  <p className="mt-3 text-2xl font-bold text-slate-950">{actions.length}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ações propostas</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white">
                <div className="border-b border-slate-100 p-4">
                  <h3 className="text-lg font-bold text-slate-950">Obrigações base identificadas</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {obligations.map((obligation, index) => (
                    <div key={obligation} className="flex gap-3 p-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{index + 1}</span>
                      <p className="text-sm font-semibold leading-relaxed text-slate-700">{obligation}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">Ações iniciais recomendadas</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      O CISO escolhe quais serão criadas como tarefas formais. As restantes ficam apenas como recomendações guardadas.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedActionIds(Object.fromEntries(actions.map((action) => [action.id, action.id !== "workbench"])))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700"
                    >
                      Selecionar tarefas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedActionIds(Object.fromEntries(actions.map((action) => [action.id, false])))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:text-red-700"
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {actions.map((action) => {
                    const createsTask = action.id !== "workbench";
                    const selected = createsTask && selectedActionIds[action.id] !== false;
                    return (
                      <article key={action.id} className="flex items-start justify-between gap-4 p-4 transition-colors hover:bg-slate-50">
                        <label className="flex min-w-0 flex-1 cursor-pointer gap-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={!createsTask}
                            onChange={(event) =>
                              setSelectedActionIds((current) => ({
                                ...current,
                                [action.id]: event.target.checked,
                              }))
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${action.priority === "high" ? "border-red-100 bg-red-50 text-red-700" : action.priority === "medium" ? "border-amber-100 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                                {action.priority}
                              </span>
                              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${selected ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                                {createsTask ? (selected ? "cria tarefa" : "não criar agora") : "atalho"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-slate-950">{action.title}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{action.detail}</p>
                          </div>
                        </label>
                        <Link to={action.path} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
                          Abrir
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </article>
                    );
                  })}
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
                  {selectedFormalActionIds.length} tarefa(s) serão criadas no Plano de Ações ao concluir o onboarding.
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
              disabled={currentStep === 0}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:opacity-40"
            >
              Anterior
            </button>
            {currentStep < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => void nextStep()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
              >
                Seguinte <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void save(true)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Concluir e abrir plano
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <AiHelpPanel form={form} step={activeStep} />
        </div>
      </section>

      {profile?.onboarding_completed_at && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          Onboarding institucional concluído em {new Date(profile.onboarding_completed_at).toLocaleString("pt-PT")}.
        </div>
      )}
    </div>
  );
}
