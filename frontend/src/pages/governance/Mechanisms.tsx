import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from "lucide-react";
import { controlsApi, type ControlMechanism, type Mechanism } from "@/lib/controlsApi";
import { AddEvidenceModal } from "@/components/ui/AddEvidenceModal";
import { EvidenceSuggestionsModal } from "@/components/ui/EvidenceSuggestionsModal";
import { EditControlMechanismModal } from "@/components/ui/EditControlMechanismModal";

const statusOptions = ["Não iniciado", "Em implementação", "Implementado"];
const typeOptions = ["Técnico", "Processo", "Pessoas", "Fornecedor"];
const MAX_VISIBLE_FRAMEWORKS = 4;

type MechanismGroup = {
  id: string;
  title: string;
  description?: string;
  type?: string;
  relations: ControlMechanism[];
  frameworks: string[];
  evidenceCount: number;
  implementedCount: number;
  implementedWithEvidenceCount: number;
  implementedWithoutEvidenceCount: number;
};

function statusLabel(status?: string) {
  return status || "Não definido";
}

function statusClass(status?: string) {
  if (status === "Implementado") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Em implementação") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function typeClass(type?: string) {
  if (type === "Técnico") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (type === "Processo") return "border-amber-100 bg-amber-50 text-amber-700";
  if (type === "Pessoas") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: ElementType;
  tone: "slate" | "indigo" | "emerald" | "amber" | "red";
}) {
  const tones = {
    slate: "border-slate-100 bg-slate-50 text-slate-600",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

export default function Mechanisms() {
  const [mechanisms, setMechanisms] = useState<Mechanism[]>([]);
  const [controlMechanisms, setControlMechanisms] = useState<ControlMechanism[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [addingEvidenceTo, setAddingEvidenceTo] = useState<string | null>(null);
  const [suggestingEvidenceFor, setSuggestingEvidenceFor] = useState<ControlMechanism | null>(null);
  const [editingMechanism, setEditingMechanism] = useState<ControlMechanism | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mechanismsRes, controlMechanismsRes] = await Promise.all([
        controlsApi.listMechanisms(),
        controlsApi.listControlMechanisms({ page_size: 1000 }),
      ]);
      setMechanisms(mechanismsRes);
      setControlMechanisms(controlMechanismsRes);
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar os mecanismos."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const mechanismGroups = useMemo<MechanismGroup[]>(() => {
    const mechanismById = new Map(mechanisms.map((mechanism) => [mechanism.id, mechanism]));
    const grouped = new Map<string, ControlMechanism[]>();

    controlMechanisms.forEach((item) => {
      const current = grouped.get(item.mechanism) || [];
      current.push(item);
      grouped.set(item.mechanism, current);
    });

    return Array.from(grouped.entries())
      .map(([mechanismId, relations]) => {
        const mechanism = mechanismById.get(mechanismId);
        const firstRelation = relations[0];
        const frameworks = Array.from(
          new Set(relations.map((item) => item.framework_name).filter(Boolean) as string[])
        ).sort((a, b) => a.localeCompare(b, "pt-PT"));
        const implemented = relations.filter((item) => item.status === "Implementado");
        const implementedWithEvidence = implemented.filter((item) => (item.evidences?.length || 0) > 0);
        const implementedWithoutEvidence = implemented.filter((item) => (item.evidences?.length || 0) === 0);

        return {
          id: mechanismId,
          title: mechanism?.title || firstRelation?.mechanism_title || "Mecanismo sem título",
          description: mechanism?.description || firstRelation?.mechanism_description,
          type: mechanism?.mechanism_type || firstRelation?.mechanism_type,
          relations: [...relations].sort((a, b) => {
            const frameworkCompare = (a.framework_name || "").localeCompare(b.framework_name || "", "pt-PT");
            if (frameworkCompare !== 0) return frameworkCompare;
            return (a.control_code || "").localeCompare(b.control_code || "", "pt-PT");
          }),
          frameworks,
          evidenceCount: relations.reduce((acc, item) => acc + (item.evidences?.length || 0), 0),
          implementedCount: implemented.length,
          implementedWithEvidenceCount: implementedWithEvidence.length,
          implementedWithoutEvidenceCount: implementedWithoutEvidence.length,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, "pt-PT"));
  }, [mechanisms, controlMechanisms]);

  const metrics = useMemo(() => {
    const implemented = controlMechanisms.filter((item) => item.status === "Implementado");
    const withEvidence = controlMechanisms.filter((item) => (item.evidences?.length || 0) > 0);
    const implementedWithEvidence = implemented.filter((item) => (item.evidences?.length || 0) > 0);
    const implementedWithoutEvidence = implemented.filter((item) => (item.evidences?.length || 0) === 0);
    const inProgress = controlMechanisms.filter((item) => item.status === "Em implementação");
    const evidenceCount = controlMechanisms.reduce((acc, item) => acc + (item.evidences?.length || 0), 0);
    const frameworksCount = new Set(controlMechanisms.map((item) => item.framework_name).filter(Boolean)).size;
    const multiFrameworkMechanisms = mechanismGroups.filter((group) => group.frameworks.length > 1).length;

    return {
      implemented: implemented.length,
      withEvidence: withEvidence.length,
      implementedWithEvidence: implementedWithEvidence.length,
      implementedWithoutEvidence: implementedWithoutEvidence.length,
      inProgress: inProgress.length,
      evidenceCount,
      frameworksCount,
      multiFrameworkMechanisms,
      coverageScore: controlMechanisms.length > 0
        ? Math.round((implementedWithEvidence.length / controlMechanisms.length) * 100)
        : 0,
    };
  }, [controlMechanisms, mechanismGroups]);

  const filteredMechanismGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return mechanismGroups.filter((group) => {
      const relationValues = group.relations.flatMap((item) => [
        item.control_code,
        item.control_title,
        item.framework_name,
        item.responsible,
        item.acceptance_criteria,
      ]);
      const matchesSearch = !query || [
        group.title,
        group.description,
        group.type,
        ...group.frameworks,
        ...relationValues,
      ].some((value) => value?.toLowerCase().includes(query));

      const matchesStatus = !statusFilter || group.relations.some((item) => item.status === statusFilter);
      const matchesType = !typeFilter || group.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [mechanismGroups, searchTerm, statusFilter, typeFilter]);

  const filteredControlMechanisms = useMemo(
    () => filteredMechanismGroups.flatMap((group) => group.relations),
    [filteredMechanismGroups]
  );

  const unlinkedMechanisms = useMemo(() => {
    const linkedIds = new Set(controlMechanisms.map((item) => item.mechanism));
    return mechanisms.filter((mechanism) => !linkedIds.has(mechanism.id));
  }, [mechanisms, controlMechanisms]);

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
          <button onClick={() => void loadData()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 pb-16">
      <header className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <Wrench className="h-3.5 w-3.5" />
              Operacionalização de controlos
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Mecanismos de implementação</h1>
              <p className="mt-2 max-w-4xl text-sm font-medium leading-relaxed text-slate-500">
                Acompanhe que mecanismos concretizam os controlos e em que frameworks cada mecanismo é reutilizado, com evidência e estado por relação.
              </p>
            </div>
          </div>
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Mecanismos na biblioteca"
          value={mechanisms.length}
          detail={`${unlinkedMechanisms.length} ainda não estão ligados a controlos.`}
          icon={ClipboardCheck}
          tone="indigo"
        />
        <KpiCard
          label="Reutilizados em várias frameworks"
          value={metrics.multiFrameworkMechanisms}
          detail={`${metrics.frameworksCount} frameworks cobertas pelos mecanismos associados.`}
          icon={ShieldCheck}
          tone="slate"
        />
        <KpiCard
          label="Associações a controlos"
          value={controlMechanisms.length}
          detail="Relações controlo-mecanismo usadas para demonstrar implementação."
          icon={CheckCircle2}
          tone="emerald"
        />
        <KpiCard
          label="Fragilidade auditável"
          value={metrics.implementedWithoutEvidence}
          detail="Mecanismos marcados como implementados, mas ainda sem evidência."
          icon={AlertTriangle}
          tone={metrics.implementedWithoutEvidence > 0 ? "amber" : "emerald"}
        />
      </section>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mesa de trabalho</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Mecanismos reutilizáveis por framework</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:w-[760px]">
            <div className="relative sm:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Pesquisar mecanismo, controlo..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Todos os estados</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Todos os tipos</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cobertura multi-framework</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">Mecanismos reutilizados entre frameworks</h3>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {filteredMechanismGroups.length} mecanismo(s), {filteredControlMechanisms.length} relação(ões) controlo-mecanismo.
            </p>
          </div>
        </div>

        {filteredMechanismGroups.length === 0 ? (
          <div className="p-10 text-center">
            <Wrench className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-bold text-slate-900">Sem mecanismos para os filtros atuais</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Ajuste a pesquisa, o estado ou o tipo para ver a cobertura por framework.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2">
            {filteredMechanismGroups.map((group) => {
              const visibleFrameworks = group.frameworks.slice(0, MAX_VISIBLE_FRAMEWORKS);
              const hiddenFrameworks = group.frameworks.length - visibleFrameworks.length;
              const needsEvidence = group.implementedWithoutEvidenceCount > 0;
              const suggestionTarget =
                group.relations.find((item) => item.status === "Implementado" && (item.evidences?.length || 0) === 0) ||
                group.relations.find((item) => (item.evidences?.length || 0) === 0) ||
                group.relations[0];
              const statusCounts = statusOptions
                .map((status) => ({
                  status,
                  count: group.relations.filter((item) => item.status === status).length,
                }))
                .filter((item) => item.count > 0);

              return (
                <article
                  key={group.id}
                  className={`rounded-[1.5rem] border p-5 transition-all hover:border-indigo-100 hover:bg-slate-50/70 ${
                    needsEvidence ? "border-amber-200 bg-amber-50/20" : "border-slate-100 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${typeClass(group.type)}`}>
                          {group.type || "Mecanismo"}
                        </span>
                        {group.frameworks.length > 1 && (
                          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                            Multi-framework
                          </span>
                        )}
                        {needsEvidence && (
                          <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Falta evidência
                          </span>
                        )}
                      </div>
                      <h4 className="mt-3 text-base font-bold text-slate-950">{group.title}</h4>
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-relaxed text-slate-500">
                        {group.description || "Sem descrição operacional registada."}
                      </p>
                    </div>

                    <div className="flex min-w-[230px] flex-col gap-2">
                      <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Frameworks</p>
                        <p className="mt-1 text-xl font-bold text-slate-950">{group.frameworks.length}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Controlos</p>
                        <p className="mt-1 text-xl font-bold text-slate-950">{group.relations.length}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Evidências</p>
                        <p className={`mt-1 text-xl font-bold ${group.evidenceCount > 0 ? "text-indigo-700" : "text-slate-300"}`}>
                          {group.evidenceCount}
                        </p>
                      </div>
                      </div>
                      {suggestionTarget && (
                        <button
                          type="button"
                          onClick={() => setSuggestingEvidenceFor(suggestionTarget)}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 transition-all hover:border-indigo-200 hover:bg-indigo-100"
                        >
                          <Sparkles className="h-4 w-4" />
                          Sugerir evidencias
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {visibleFrameworks.map((framework) => (
                      <span key={framework} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {framework}
                      </span>
                    ))}
                    {hiddenFrameworks > 0 && (
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        +{hiddenFrameworks}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {statusCounts.map((item) => (
                      <span key={item.status} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(item.status)}`}>
                        {item.count} {statusLabel(item.status)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {group.relations.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.framework_name || "Framework não identificada"}</p>
                            <p className="mt-1 text-sm font-bold text-slate-900">
                              <span className="font-mono">{item.control_code || "--"}</span>
                              <span className="mx-2 text-slate-300">|</span>
                              <span>{item.control_title || "Controlo sem título"}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(item.status)}`}>
                              {statusLabel(item.status)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSuggestingEvidenceFor(item)}
                              className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50"
                            >
                              Sugerir
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Detalhe por controlo e framework</h3>
                <p className="text-xs font-semibold text-slate-500">{filteredControlMechanisms.length} relação(ões) encontradas.</p>
              </div>
              <SlidersHorizontal className="h-5 w-5 text-slate-300" />
            </div>
          </div>

          {filteredControlMechanisms.length === 0 ? (
            <div className="p-10 text-center">
              <Wrench className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">Sem mecanismos associados</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Associe mecanismos a partir do detalhe de um controlo para transformar conformidade abstrata em implementação evidenciável.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredControlMechanisms.map((item) => {
                const evidenceCount = item.evidences?.length || 0;
                const needsEvidence = item.status === "Implementado" && evidenceCount === 0;

                return (
                  <article key={item.id} className={`p-5 transition-all hover:bg-slate-50/70 ${needsEvidence ? "bg-amber-50/30" : "bg-white"}`}>
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${typeClass(item.mechanism_type)}`}>
                            {item.mechanism_type || "Mecanismo"}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                          {needsEvidence && (
                            <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                              Falta evidência
                            </span>
                          )}
                        </div>

                        <h4 className="mt-3 text-base font-bold text-slate-950">{item.mechanism_title || "Mecanismo sem título"}</h4>
                        <p className="mt-1 line-clamp-2 text-sm font-medium leading-relaxed text-slate-500">
                          {item.mechanism_description || "Sem descrição operacional registada."}
                        </p>

                        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Controlo suportado</p>
                          <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                            <span className="font-mono text-sm font-bold text-slate-950">{item.control_code || "--"}</span>
                            <span className="text-sm font-bold text-slate-700">{item.control_title || "Controlo sem título"}</span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-400">{item.framework_name || "Framework não identificada"}</p>
                        </div>

                        {(item.responsible || item.deadline || item.acceptance_criteria) && (
                          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                            {item.responsible && (
                              <div className="rounded-xl border border-slate-100 bg-white p-3">
                                <p className="font-bold uppercase tracking-wide text-slate-400">Responsável</p>
                                <p className="mt-1 font-bold text-slate-700">{item.responsible}</p>
                              </div>
                            )}
                            {item.deadline && (
                              <div className="rounded-xl border border-slate-100 bg-white p-3">
                                <p className="font-bold uppercase tracking-wide text-slate-400">Prazo</p>
                                <p className="mt-1 font-bold text-slate-700">{new Date(item.deadline).toLocaleDateString("pt-PT")}</p>
                              </div>
                            )}
                            {item.acceptance_criteria && (
                              <div className="rounded-xl border border-slate-100 bg-white p-3 sm:col-span-3">
                                <p className="font-bold uppercase tracking-wide text-slate-400">Critérios de aceitação</p>
                                <p className="mt-1 font-semibold leading-relaxed text-slate-600">{item.acceptance_criteria}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-3 lg:w-48">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidências</p>
                          <p className={`mt-1 text-3xl font-bold ${evidenceCount > 0 ? "text-indigo-700" : "text-slate-300"}`}>{evidenceCount}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAddingEvidenceTo(item.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700"
                        >
                          <FileCheck2 className="h-4 w-4" />
                          Evidência
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuggestingEvidenceFor(item)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-indigo-700 transition-all hover:border-indigo-200 hover:bg-indigo-100"
                        >
                          <Sparkles className="h-4 w-4" />
                          Sugerir evidencias
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMechanism(item)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950"
                        >
                          Editar estado
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cobertura evidenciável</p>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-5xl font-bold tracking-tight text-slate-950">{metrics.coverageScore}%</span>
              <span className="pb-2 text-xs font-bold uppercase tracking-wide text-slate-400">implementado + evidenciado</span>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${metrics.coverageScore}%` }} />
            </div>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-slate-500">
              Este indicador aproxima o controlo da realidade auditável: só conta como forte quando o mecanismo está implementado e tem evidência.
            </p>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Biblioteca sem ligação</p>
            <h3 className="mt-2 text-lg font-bold text-slate-950">Mecanismos por operacionalizar</h3>
            <div className="mt-5 space-y-3">
              {unlinkedMechanisms.length === 0 ? (
                <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                  Todos os mecanismos da biblioteca estão associados a pelo menos um controlo.
                </p>
              ) : (
                unlinkedMechanisms.slice(0, 8).map((mechanism) => (
                  <div key={mechanism.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900">{mechanism.title}</p>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${typeClass(mechanism.mechanism_type)}`}>
                        {mechanism.mechanism_type}
                      </span>
                    </div>
                    {mechanism.description && (
                      <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">{mechanism.description}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>

      <AddEvidenceModal
        open={!!addingEvidenceTo}
        controlMechanismId={addingEvidenceTo || ""}
        onClose={() => setAddingEvidenceTo(null)}
        onAdded={() => {
          setAddingEvidenceTo(null);
          void loadData();
        }}
      />

      <EditControlMechanismModal
        open={!!editingMechanism}
        controlMechanism={editingMechanism}
        onClose={() => setEditingMechanism(null)}
        onUpdated={() => {
          setEditingMechanism(null);
          void loadData();
        }}
      />

      <EvidenceSuggestionsModal
        open={!!suggestingEvidenceFor}
        controlMechanism={suggestingEvidenceFor}
        onClose={() => setSuggestingEvidenceFor(null)}
        onApplied={() => void loadData()}
      />
    </div>
  );
}
