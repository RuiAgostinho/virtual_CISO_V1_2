/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, FilePlus2, GitBranch, Link2, RefreshCw, Save, Search, ShieldCheck, Wrench, X } from "lucide-react";
import { governanceApi, type GovernanceAction } from "@/lib/governanceApi";
import { mappingReviewApi, type MappingRecord, type SearchOption } from "@/lib/mappingReviewApi";

type MechanismRecord = Record<string, any>;
type TaskSummary = {
  total: number;
  active: number;
  done: number;
  blocked: number;
  overdue: number;
  latestDueDate: string | null;
  completedAt: string | null;
};

const technicalType = "T\u00e9cnico";

const mechanismTypes = [
  { value: "", label: "Todos os tipos" },
  { value: technicalType, label: "Tecnico" },
  { value: "Processo", label: "Processo" },
  { value: "Pessoas", label: "Pessoas" },
  { value: "Fornecedor", label: "Fornecedor" },
];

const relationshipTypes = [
  { value: "primary", label: "Primario" },
  { value: "supporting", label: "Suporte" },
  { value: "compensating", label: "Compensatorio" },
  { value: "preventive", label: "Preventivo" },
  { value: "detective", label: "Detetivo" },
  { value: "corrective", label: "Corretivo" },
];

const implementationStatuses = [
  { value: "not_implemented", label: "Nao implementado" },
  { value: "planned", label: "Planeado" },
  { value: "partially_implemented", label: "Parcialmente implementado" },
  { value: "implemented", label: "Implementado" },
  { value: "implemented_evidenced", label: "Implementado e evidenciado" },
  { value: "not_applicable", label: "Nao aplicavel" },
];

const emptyAssociationForm = {
  mechanism: "",
  relationship_type: "supporting",
  contribution_weight: "100",
  mandatory: true,
  implementation_status: "not_implemented",
  confidence_score: "",
  rationale: "",
};

function unwrap<T>(data: any): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.results || [];
}

function mechanismTitle(mechanism: MechanismRecord) {
  return mechanism.title || mechanism.name || "Mecanismo sem titulo";
}

function mechanismTypeLabel(type?: string) {
  if (!type) return "Sem tipo";
  if (type === technicalType) return "Tecnico";
  return type;
}

function mechanismTypeTone(type?: string) {
  if (type === technicalType || type === "Tecnico") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "Processo") return "border-amber-100 bg-amber-50 text-amber-700";
  if (type === "Pessoas") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (type === "Fornecedor") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusTone(status?: string) {
  if (status === "implemented_evidenced" || status === "implemented" || status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "planned" || status === "partially_implemented" || status === "pending_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "not_implemented" || status === "rejected") return "border-red-100 bg-red-50 text-red-700";
  if (status === "deprecated" || status === "not_applicable") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-indigo-100 bg-indigo-50 text-indigo-700";
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

function frameworkKey(mapping: MappingRecord) {
  const raw = mapping.raw || {};
  return raw.framework_code || raw.framework_name || String(mapping.targetLabel || "").split(":")[0] || "";
}

function emptyTaskSummary(): TaskSummary {
  return { total: 0, active: 0, done: 0, blocked: 0, overdue: 0, latestDueDate: null, completedAt: null };
}

function isClosedTask(action: GovernanceAction) {
  return action.status === "done" || action.status === "cancelled";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("pt-PT");
}

function laterDate(current: string | null, candidate?: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function implementationProgress(summary: TaskSummary) {
  if (summary.total <= 0) return 0;
  return Math.round((summary.done / summary.total) * 100);
}

function progressTone(progress: number, summary: TaskSummary) {
  if (summary.overdue > 0 || summary.blocked > 0) return "bg-red-500";
  if (progress >= 90) return "bg-emerald-500";
  if (progress >= 50) return "bg-cyan-500";
  if (progress > 0) return "bg-amber-500";
  return "bg-slate-300";
}

function completionLabel(summary: TaskSummary) {
  if (summary.total <= 0) return "Sem plano";
  if (summary.done === summary.total && summary.completedAt) return `Concluido em ${formatDate(summary.completedAt)}`;
  if (summary.latestDueDate) return `Previsto ${formatDate(summary.latestDueDate)}`;
  return "Sem prazo";
}

export default function MechanismsList() {
  const [mechanisms, setMechanisms] = useState<MechanismRecord[]>([]);
  const [controlMappings, setControlMappings] = useState<MappingRecord[]>([]);
  const [frameworkMappings, setFrameworkMappings] = useState<MappingRecord[]>([]);
  const [evidenceLinks, setEvidenceLinks] = useState<MappingRecord[]>([]);
  const [mechanismTasks, setMechanismTasks] = useState<GovernanceAction[]>([]);
  const [internalControls, setInternalControls] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"catalog" | "associations">("catalog");
  const [filters, setFilters] = useState({
    search: "",
    mechanism_type: "",
    owner: "",
  });
  const [associationFilters, setAssociationFilters] = useState({
    search: "",
    mechanism: "",
    validation_status: "",
    implementation_status: "",
  });
  const [associationForm, setAssociationForm] = useState(emptyAssociationForm);
  const [selectedInternalControlIds, setSelectedInternalControlIds] = useState<string[]>([]);
  const [internalControlSearch, setInternalControlSearch] = useState("");
  const [savingAssociation, setSavingAssociation] = useState(false);
  const [associationMessage, setAssociationMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mechanismsData = await mappingReviewApi.listMechanisms({
        page_size: 500,
        search: filters.search,
        mechanism_type: filters.mechanism_type,
        ordering: "title",
      });
      const [internalControlLinks, internalFrameworkLinks, evidenceData, mechanismTasksData, internalControlsData] = await Promise.all([
        mappingReviewApi.listMappings("internal_control_mechanism", { page_size: 2000, include_inactive: true }).catch((err) => {
          console.warn("Nao foi possivel carregar associacoes InternalControl x Mechanism.", err);
          return [];
        }),
        mappingReviewApi.listMappings("internal_control_framework_mapping", { page_size: 3000 }).catch((err) => {
          console.warn("Nao foi possivel carregar mapeamentos de frameworks para mecanismos.", err);
          return [];
        }),
        mappingReviewApi.listMappings("evidence_link", { target_type: "mechanism", page_size: 2000 }).catch((err) => {
          console.warn("Nao foi possivel carregar evidencias associadas a mecanismos.", err);
          return [];
        }),
        governanceApi.listGovernanceActions({ target_type: "mechanism", page_size: 5000 }).catch((err) => {
          console.warn("Nao foi possivel carregar tarefas associadas a mecanismos.", err);
          return [];
        }),
        mappingReviewApi.searchInternalControls("", { include_migrated: true, page_size: 1000, ordering: "code" }).catch((err) => {
          console.warn("Nao foi possivel carregar controlos internos.", err);
          return [];
        }),
      ]);
      setMechanisms(unwrap<MechanismRecord>(mechanismsData));
      setControlMappings(internalControlLinks);
      setFrameworkMappings(internalFrameworkLinks);
      setEvidenceLinks(evidenceData);
      setMechanismTasks(unwrap<GovernanceAction>(mechanismTasksData));
      setInternalControls(internalControlsData);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar mecanismos.");
    } finally {
      setLoading(false);
    }
  }, [filters.mechanism_type, filters.search]);

  useEffect(() => {
    load();
  }, [load]);

  const controlMappingsByMechanism = useMemo(() => {
    const map = new Map<string, MappingRecord[]>();
    controlMappings.forEach((mapping) => {
      if (!mapping.targetId) return;
      const current = map.get(String(mapping.targetId)) || [];
      current.push(mapping);
      map.set(String(mapping.targetId), current);
    });
    return map;
  }, [controlMappings]);

  const evidenceByMechanism = useMemo(() => {
    const map = new Map<string, MappingRecord[]>();
    evidenceLinks.forEach((link) => {
      if (!link.targetId) return;
      const current = map.get(String(link.targetId)) || [];
      current.push(link);
      map.set(String(link.targetId), current);
    });
    return map;
  }, [evidenceLinks]);

  const taskSummaryByMechanism = useMemo(() => {
    const map = new Map<string, TaskSummary>();
    mechanismTasks.forEach((task) => {
      if (!task.target_id) return;
      const key = String(task.target_id);
      const current = map.get(key) || emptyTaskSummary();
      current.total += 1;
      if (!isClosedTask(task)) current.active += 1;
      if (task.status === "done") current.done += 1;
      if (task.status === "blocked") current.blocked += 1;
      if (task.is_overdue) current.overdue += 1;
      current.latestDueDate = laterDate(current.latestDueDate, task.due_date);
      current.completedAt = laterDate(current.completedAt, task.completed_at);
      map.set(key, current);
    });
    return map;
  }, [mechanismTasks]);

  const frameworkCountByMechanism = useMemo(() => {
    const controlToFrameworks = new Map<string, Set<string>>();
    frameworkMappings.forEach((mapping) => {
      if (!mapping.sourceId) return;
      const current = controlToFrameworks.get(String(mapping.sourceId)) || new Set<string>();
      const key = frameworkKey(mapping);
      if (key) current.add(key);
      controlToFrameworks.set(String(mapping.sourceId), current);
    });

    const mechanismToFrameworks = new Map<string, Set<string>>();
    controlMappings.forEach((mapping) => {
      if (!mapping.targetId || !mapping.sourceId) return;
      const current = mechanismToFrameworks.get(String(mapping.targetId)) || new Set<string>();
      const frameworkSet = controlToFrameworks.get(String(mapping.sourceId));
      frameworkSet?.forEach((item) => current.add(item));
      mechanismToFrameworks.set(String(mapping.targetId), current);
    });
    return new Map(Array.from(mechanismToFrameworks.entries()).map(([mechanismId, frameworks]) => [mechanismId, frameworks.size]));
  }, [controlMappings, frameworkMappings]);

  const filteredMechanisms = useMemo(() => {
    const ownerQuery = filters.owner.trim().toLowerCase();
    return mechanisms.filter((mechanism) => {
      if (!ownerQuery) return true;
      return String(mechanism.owner || mechanism.responsible || "").toLowerCase().includes(ownerQuery);
    });
  }, [filters.owner, mechanisms]);

  const metrics = useMemo(() => ({
    total: mechanisms.length,
    linked: mechanisms.filter((mechanism) => (controlMappingsByMechanism.get(String(mechanism.id)) || []).length > 0).length,
    evidenced: mechanisms.filter((mechanism) => (evidenceByMechanism.get(String(mechanism.id)) || []).length > 0).length,
    tasks: mechanismTasks.length,
    notImplemented: controlMappings.filter((mapping) => mapping.implementation_status === "not_implemented").length,
  }), [controlMappings, controlMappingsByMechanism, evidenceByMechanism, mechanismTasks.length, mechanisms]);

  const filteredInternalControls = useMemo(() => {
    const query = internalControlSearch.trim().toLowerCase();
    return internalControls
      .filter((control) => {
        if (!query) return true;
        return [control.label, control.description, control.meta]
          .some((value) => String(value || "").toLowerCase().includes(query));
      })
      .slice(0, 80);
  }, [internalControlSearch, internalControls]);

  const filteredAssociations = useMemo(() => {
    const query = associationFilters.search.trim().toLowerCase();
    return controlMappings.filter((mapping) => {
      if (associationFilters.mechanism && String(mapping.targetId) !== associationFilters.mechanism) return false;
      if (associationFilters.validation_status && mapping.validation_status !== associationFilters.validation_status) return false;
      if (associationFilters.implementation_status && mapping.implementation_status !== associationFilters.implementation_status) return false;
      if (!query) return true;
      return [mapping.sourceLabel, mapping.targetLabel, mapping.rationale, mapping.relationship_type, mapping.implementation_status]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [associationFilters, controlMappings]);

  const associationMetrics = useMemo(() => ({
    total: controlMappings.length,
    approved: controlMappings.filter((mapping) => mapping.validation_status === "approved").length,
    draft: controlMappings.filter((mapping) => mapping.validation_status === "draft").length,
    mandatory: controlMappings.filter((mapping) => mapping.mandatory).length,
  }), [controlMappings]);

  const toggleInternalControl = (controlId: string) => {
    setSelectedInternalControlIds((current) =>
      current.includes(controlId)
        ? current.filter((id) => id !== controlId)
        : [...current, controlId]
    );
  };

  const resetAssociationForm = () => {
    setAssociationForm(emptyAssociationForm);
    setSelectedInternalControlIds([]);
    setInternalControlSearch("");
    setAssociationMessage(null);
  };

  const saveAssociation = async () => {
    if (!associationForm.mechanism) {
      setAssociationMessage("Seleciona primeiro um mecanismo.");
      return;
    }
    if (selectedInternalControlIds.length === 0) {
      setAssociationMessage("Seleciona pelo menos um controlo interno.");
      return;
    }
    if (!associationForm.rationale.trim()) {
      setAssociationMessage("Indica a rationale da associacao.");
      return;
    }

    setSavingAssociation(true);
    setAssociationMessage(null);
    try {
      const existingPairs = new Set(
        controlMappings.map((mapping) => `${mapping.sourceId}:${mapping.targetId}`)
      );
      const controlsToCreate = selectedInternalControlIds.filter(
        (controlId) => !existingPairs.has(`${controlId}:${associationForm.mechanism}`)
      );

      if (controlsToCreate.length === 0) {
        setAssociationMessage("Os controlos selecionados ja estao associados a este mecanismo.");
        setSavingAssociation(false);
        return;
      }

      await Promise.all(
        controlsToCreate.map((internalControl) =>
          mappingReviewApi.createInternalControlMechanism({
            internal_control: internalControl,
            mechanism: associationForm.mechanism,
            relationship_type: associationForm.relationship_type,
            contribution_weight: Number(associationForm.contribution_weight || 0),
            mandatory: associationForm.mandatory,
            implementation_status: associationForm.implementation_status,
            confidence_score: associationForm.confidence_score === "" ? undefined : Number(associationForm.confidence_score),
            rationale: associationForm.rationale,
          })
        )
      );

      setAssociationMessage(
        `${controlsToCreate.length} associacao(oes) criada(s) em draft para validacao humana.`
      );
      setSelectedInternalControlIds([]);
      await load();
    } catch (err: any) {
      console.error(err);
      setAssociationMessage(err?.message || "Nao foi possivel criar a associacao.");
    } finally {
      setSavingAssociation(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <span className="text-sm font-bold uppercase tracking-wide">A carregar mecanismos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-red-700">
          <div className="flex items-center gap-3 font-bold">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar mecanismos
          </div>
          <p className="mt-2 text-sm font-medium">{error}</p>
          <button onClick={load} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Mecanismos reutilizaveis</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Mecanismos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Consulte mecanismos reutilizaveis, controlos internos suportados, evidencias associadas e impacto nas frameworks.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <Link to="/governance/mechanisms/wizard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800">
              <FilePlus2 className="h-4 w-4" />
              Criar mecanismo
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm sm:flex-row">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`flex flex-1 items-center justify-between rounded-xl px-4 py-3 text-left transition ${
            activeTab === "catalog" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>
            <span className="block text-sm font-bold">Catalogo de mecanismos</span>
            <span className={`text-xs font-semibold ${activeTab === "catalog" ? "text-indigo-100" : "text-slate-400"}`}>
              Lista reutilizavel de mecanismos de implementacao.
            </span>
          </span>
          <Wrench className="h-4 w-4" />
        </button>
        <button
          onClick={() => setActiveTab("associations")}
          className={`flex flex-1 items-center justify-between rounded-xl px-4 py-3 text-left transition ${
            activeTab === "associations" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>
            <span className="block text-sm font-bold">Associacoes a controlos</span>
            <span className={`text-xs font-semibold ${activeTab === "associations" ? "text-indigo-100" : "text-slate-400"}`}>
              Liga mecanismos aos controlos internos que implementam.
            </span>
          </span>
          <Link2 className="h-4 w-4" />
        </button>
      </section>

      {activeTab === "catalog" && (
        <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <InfoCard icon={Wrench} label="Mecanismos" value={metrics.total} />
        <InfoCard icon={ShieldCheck} label="Com controlos internos" value={metrics.linked} tone="text-emerald-600" />
        <InfoCard icon={GitBranch} label="Com evidencias" value={metrics.evidenced} tone="text-cyan-600" />
        <InfoCard icon={ClipboardList} label="Tarefas associadas" value={metrics.tasks} tone="text-indigo-600" />
        <InfoCard icon={AlertTriangle} label="Links nao implementados" value={metrics.notImplemented} tone="text-amber-600" />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") load();
              }}
              placeholder="Pesquisar por nome, titulo ou descricao..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={filters.mechanism_type}
            onChange={(event) => setFilters((current) => ({ ...current, mechanism_type: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-300 focus:bg-white"
          >
            {mechanismTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <input
            value={filters.owner}
            onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}
            placeholder="Owner, se existir"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:bg-white"
          />
          <button onClick={load} className="rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700">
            Aplicar
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Nome</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Tipo</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Owner</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Controlos internos</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Evidencias</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Tarefas</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Frameworks</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Implementacao</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Termino</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMechanisms.map((mechanism) => {
                const controls = controlMappingsByMechanism.get(String(mechanism.id)) || [];
                const evidence = evidenceByMechanism.get(String(mechanism.id)) || [];
                const tasks = taskSummaryByMechanism.get(String(mechanism.id)) || emptyTaskSummary();
                const frameworks = frameworkCountByMechanism.get(String(mechanism.id)) || 0;
                const progress = implementationProgress(tasks);
                return (
                  <tr key={mechanism.id} className="align-top hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link to={`/governance/mechanisms/${mechanism.id}`} className="font-bold text-slate-950 hover:text-indigo-700">
                        {mechanismTitle(mechanism)}
                      </Link>
                      <p className="mt-1 line-clamp-2 max-w-xl text-xs font-semibold text-slate-500">{mechanism.description || "Sem descricao."}</p>
                      {Array.isArray(mechanism.tags) && mechanism.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {mechanism.tags.slice(0, 4).map((tag: string) => (
                            <Badge key={tag} className="border-slate-200 bg-slate-50 text-slate-500">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge className={mechanismTypeTone(mechanism.mechanism_type)}>{mechanismTypeLabel(mechanism.mechanism_type)}</Badge>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-600">{mechanism.owner || mechanism.responsible || "-"}</td>
                    <td className="px-5 py-4 font-bold text-slate-900">{controls.length}</td>
                    <td className="px-5 py-4 font-bold text-slate-900">{evidence.length || mechanism.evidence_count || 0}</td>
                    <td className="px-5 py-4">
                      <Link to={`/governance/mechanisms/${mechanism.id}`} className="font-bold text-indigo-700 hover:text-indigo-900">
                        {tasks.total}
                      </Link>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {tasks.active} ativas · {tasks.done} concluidas
                      </p>
                      {(tasks.blocked > 0 || tasks.overdue > 0) && (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-red-600">
                          {tasks.blocked > 0 ? `${tasks.blocked} bloqueadas` : ""}
                          {tasks.blocked > 0 && tasks.overdue > 0 ? " · " : ""}
                          {tasks.overdue > 0 ? `${tasks.overdue} atrasadas` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900">{frameworks || "-"}</td>
                    <td className="px-5 py-4">
                      <div className="min-w-44">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-black text-slate-950">{tasks.total > 0 ? `${progress}%` : "-"}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {tasks.done}/{tasks.total}
                          </span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${progressTone(progress, tasks)}`}
                            style={{ width: `${tasks.total > 0 ? progress : 0}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          tarefas concluidas
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className={`text-sm font-bold ${tasks.overdue > 0 ? "text-red-700" : "text-slate-900"}`}>
                        {completionLabel(tasks)}
                      </p>
                      {tasks.total > 0 && (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {tasks.active} ativas
                          {tasks.blocked > 0 ? ` · ${tasks.blocked} bloqueadas` : ""}
                          {tasks.overdue > 0 ? ` · ${tasks.overdue} atrasadas` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Link to={`/governance/mechanisms/${mechanism.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredMechanisms.length === 0 && (
          <div className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
            Nao foram encontrados mecanismos com os filtros atuais.
          </div>
        )}
      </section>
        </>
      )}

      {activeTab === "associations" && (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <InfoCard icon={Link2} label="Associacoes" value={associationMetrics.total} />
            <InfoCard icon={CheckCircle2} label="Aprovadas" value={associationMetrics.approved} tone="text-emerald-600" />
            <InfoCard icon={ShieldCheck} label="Obrigatorias" value={associationMetrics.mandatory} tone="text-cyan-600" />
            <InfoCard icon={AlertTriangle} label="Draft" value={associationMetrics.draft} tone="text-amber-600" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Nova associacao</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">Mecanismo para controlo interno</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Define que mecanismos implementam cada controlo interno. A associacao fica em draft para validacao humana.
                  </p>
                </div>
                <button
                  onClick={resetAssociationForm}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700"
                >
                  <X className="h-4 w-4" />
                  Limpar
                </button>
              </div>

              {associationMessage && (
                <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
                  {associationMessage}
                </div>
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismo</span>
                  <select
                    value={associationForm.mechanism}
                    onChange={(event) => setAssociationForm((current) => ({ ...current, mechanism: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white"
                  >
                    <option value="">Selecionar mecanismo</option>
                    {mechanisms.map((mechanism) => (
                      <option key={mechanism.id} value={mechanism.id}>{mechanismTitle(mechanism)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Tipo de relacao</span>
                  <select
                    value={associationForm.relationship_type}
                    onChange={(event) => setAssociationForm((current) => ({ ...current, relationship_type: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white"
                  >
                    {relationshipTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Peso de contributo</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={associationForm.contribution_weight}
                    onChange={(event) => setAssociationForm((current) => ({ ...current, contribution_weight: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Estado operacional</span>
                  <select
                    value={associationForm.implementation_status}
                    onChange={(event) => setAssociationForm((current) => ({ ...current, implementation_status: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white"
                  >
                    {implementationStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Confidence score</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={associationForm.confidence_score}
                    onChange={(event) => setAssociationForm((current) => ({ ...current, confidence_score: event.target.value }))}
                    placeholder="Opcional"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white"
                  />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={associationForm.mandatory}
                    onChange={(event) => setAssociationForm((current) => ({ ...current, mandatory: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  Mecanismo obrigatorio para o controlo
                </label>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Rationale</span>
                <textarea
                  value={associationForm.rationale}
                  onChange={(event) => setAssociationForm((current) => ({ ...current, rationale: event.target.value }))}
                  placeholder="Explica porque este mecanismo implementa ou suporta os controlos selecionados."
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white"
                />
              </label>

              <div className="mt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Controlos internos</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Selecionados: {selectedInternalControlIds.length}. Podes associar o mesmo mecanismo a varios controlos.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-80">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={internalControlSearch}
                      onChange={(event) => setInternalControlSearch(event.target.value)}
                      placeholder="Pesquisar controlos internos..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-indigo-300 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-slate-100">
                  {filteredInternalControls.map((control) => {
                    const selected = selectedInternalControlIds.includes(control.id);
                    const alreadyLinked = controlMappings.some((mapping) =>
                      String(mapping.sourceId) === control.id && String(mapping.targetId) === associationForm.mechanism
                    );
                    return (
                      <button
                        key={control.id}
                        type="button"
                        onClick={() => toggleInternalControl(control.id)}
                        className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 ${
                          selected ? "bg-indigo-50" : "bg-white"
                        }`}
                      >
                        <span className={`mt-1 flex h-5 w-5 items-center justify-center rounded border ${
                          selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-transparent"
                        }`}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-950">{control.label}</span>
                          <span className="mt-1 line-clamp-2 block text-xs font-semibold text-slate-500">{control.description || control.meta || "Sem descricao."}</span>
                          {alreadyLinked && (
                            <Badge className="mt-2 border-amber-200 bg-amber-50 text-amber-700">Ja associado a este mecanismo</Badge>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {filteredInternalControls.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                      Sem controlos internos encontrados.
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={saveAssociation}
                disabled={savingAssociation}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Save className="h-4 w-4" />
                {savingAssociation ? "A guardar..." : "Criar associacao"}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Leitura operacional</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Como isto encaixa no score</h2>
              <div className="mt-4 space-y-3 text-sm font-semibold leading-relaxed text-slate-600">
                <p>
                  Um mecanismo pode existir no catalogo, mas so conta para um controlo quando existe uma associacao
                  `InternalControlMechanism`.
                </p>
                <p>
                  O peso, a obrigatoriedade e o estado operacional desta associacao sao usados pelo motor de conformidade
                  por propagacao.
                </p>
                <p>
                  Depois, os tipos de evidencia esperada ficam ligados ao mecanismo, e as evidencias reais provam a sua implementacao.
                </p>
              </div>
              <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm font-bold text-indigo-800">
                Fluxo: Controlo interno &gt; Mecanismo &gt; Tipo de evidencia esperada &gt; Evidencia real.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={associationFilters.search}
                  onChange={(event) => setAssociationFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Pesquisar por controlo, mecanismo ou rationale..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <select
                value={associationFilters.mechanism}
                onChange={(event) => setAssociationFilters((current) => ({ ...current, mechanism: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-300 focus:bg-white"
              >
                <option value="">Todos os mecanismos</option>
                {mechanisms.map((mechanism) => <option key={mechanism.id} value={mechanism.id}>{mechanismTitle(mechanism)}</option>)}
              </select>
              <select
                value={associationFilters.validation_status}
                onChange={(event) => setAssociationFilters((current) => ({ ...current, validation_status: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-300 focus:bg-white"
              >
                <option value="">Todos os estados</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Pending review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="deprecated">Deprecated</option>
              </select>
              <select
                value={associationFilters.implementation_status}
                onChange={(event) => setAssociationFilters((current) => ({ ...current, implementation_status: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-300 focus:bg-white"
              >
                <option value="">Todos os estados operacionais</option>
                {implementationStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <button onClick={load} className="rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-700">
                Atualizar
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Controlo interno</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismo</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Relacao</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Peso</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Obrigatorio</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Implementacao</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Validacao</th>
                    <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssociations.map((mapping) => (
                    <tr key={mapping.id} className="align-top hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950">{mapping.sourceLabel}</p>
                        <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{mapping.rationale || "Sem rationale."}</p>
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-900">{mapping.targetLabel}</td>
                      <td className="px-5 py-4">
                        <Badge className="border-slate-200 bg-slate-50 text-slate-600">{mapping.relationship_type || "-"}</Badge>
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-900">{mapping.contribution_weight ?? "-"}%</td>
                      <td className="px-5 py-4">
                        <Badge className={mapping.mandatory ? "border-indigo-100 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                          {mapping.mandatory ? "Sim" : "Nao"}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge className={statusTone(mapping.implementation_status)}>{mapping.implementation_status || "-"}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge className={statusTone(mapping.validation_status)}>{mapping.validation_status}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          to={`/governance/mapping-review?mechanism=${mapping.targetId}&internalControl=${mapping.sourceId}&type=internal_control_mechanism`}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                        >
                          Rever
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAssociations.length === 0 && (
              <div className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
                Ainda nao existem associacoes com os filtros atuais.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
