import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Database,
  FileCheck,
  FileText,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  GovernanceMetricCard,
  GovernancePanel,
} from "@/components/governance/GovernancePrimitives";
import {
  governanceApi,
  type GovernanceHealthListItem,
  type GovernanceHealthPayload,
  type GovernanceHealthSeverity,
} from "@/lib/governanceApi";

const severityTone: Record<GovernanceHealthSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
  info: "border-slate-200 bg-slate-50 text-slate-600",
};

function formatNumber(value?: number) {
  return new Intl.NumberFormat("pt-PT").format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-PT");
}

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Erro desconhecido");
}

function SectionHealthCard({
  title,
  description,
  count,
  href,
  actionLabel,
  severity,
}: {
  title: string;
  description: string;
  count: number;
  href: string;
  actionLabel: string;
  severity: GovernanceHealthSeverity;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${count > 0 ? severityTone[severity] : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-black uppercase tracking-wide">{title}</div>
          <p className="mt-2 text-sm font-semibold leading-6 opacity-90">{description}</p>
        </div>
        <div className="rounded-full bg-white/80 px-3 py-1 text-lg font-black">{formatNumber(count)}</div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-wide">
          {count > 0 ? "Requer atenção" : "Sem lacuna"}
        </span>
        <Link to={href} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-900 shadow-sm hover:text-indigo-700">
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function CompactList({
  items,
  emptyLabel,
  renderItem,
}: {
  items: GovernanceHealthListItem[];
  emptyLabel: string;
  renderItem: (item: GovernanceHealthListItem) => ReactNode;
}) {
  if (!items.length) {
    return (
      <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
        <CheckCircle2 className="mx-auto mb-3 h-6 w-6 text-emerald-600" />
        {emptyLabel}
      </div>
    );
  }
  return <div className="divide-y divide-slate-100">{items.map(renderItem)}</div>;
}

function EntityRow({ item, meta }: { item: GovernanceHealthListItem; meta: ReactNode }) {
  return (
    <Link to={item.href} className="block px-6 py-4 hover:bg-slate-50">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-slate-950">
            {item.code ? `${item.code} - ` : ""}
            {item.title}
          </div>
          <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{meta}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
      </div>
    </Link>
  );
}

export default function GovernanceHealth() {
  const [data, setData] = useState<GovernanceHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await governanceApi.getGovernanceHealth();
      setData(payload);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = data?.metrics;
  const topRagIssues = useMemo(
    () => (data?.rag_health || []).filter((item) => item.missing_count > 0 || item.chunks_without_embedding > 0),
    [data],
  );

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-indigo-600">Qualidade de dados GRC</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Saúde da governação</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-500">
              Diagnóstico só de leitura sobre políticas, controlos, mecanismos, evidências, tarefas, mappings e cobertura RAG. Os números vêm diretamente da base de dados.
            </p>
            {data?.generated_at && (
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                Atualizado em {formatDate(data.generated_at)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600 hover:text-indigo-700"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
            <Link to="/governance/workbench" className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-indigo-700 hover:bg-indigo-100">
              <ClipboardList className="h-4 w-4" />
              Workbench
            </Link>
            <Link to="/admin/rag" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-indigo-800">
              <Database className="h-4 w-4" />
              Base RAG
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500 shadow-sm">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-600" />
          A carregar diagnóstico real da base de dados...
        </div>
      ) : data && metrics ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <GovernanceMetricCard icon={AlertTriangle} label="Itens de atenção" value={formatNumber(metrics.total_attention)} tone="text-orange-600" />
            <GovernanceMetricCard icon={FileText} label="Políticas sem controlos" value={formatNumber(metrics.policies_without_controls)} tone="text-indigo-600" />
            <GovernanceMetricCard icon={Wrench} label="Mecanismos sem evidência real" value={formatNumber(metrics.mechanisms_without_valid_evidence)} tone="text-amber-600" />
            <GovernanceMetricCard icon={ClipboardList} label="Tarefas vencidas" value={formatNumber(metrics.overdue_tasks)} tone="text-red-600" />
            <GovernanceMetricCard icon={GitBranch} label="Mappings pendentes" value={formatNumber(metrics.pending_mappings)} tone="text-violet-600" />
            <GovernanceMetricCard icon={Database} label="Chunks RAG em falta" value={formatNumber(metrics.rag_missing_chunks)} tone="text-slate-600" />
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            {data.sections.map((section) => (
              <SectionHealthCard
                key={section.id}
                title={section.title}
                description={section.description}
                count={section.count}
                href={section.href}
                actionLabel={section.action_label}
                severity={section.severity}
              />
            ))}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <GovernancePanel title="Políticas sem controlos internos" icon={FileText} empty={!data.lists.policies_without_controls.length}>
              <CompactList
                items={data.lists.policies_without_controls}
                emptyLabel="Todas as políticas estão associadas a controlos internos ativos."
                renderItem={(item) => (
                  <EntityRow
                    key={item.id}
                    item={item}
                    meta={`Owner: ${item.owner || "sem owner"} · Estado: ${item.status || "-"}`}
                  />
                )}
              />
            </GovernancePanel>

            <GovernancePanel title="Mecanismos sem evidência real válida" icon={Wrench} empty={!data.lists.mechanisms_without_valid_evidence.length}>
              <CompactList
                items={data.lists.mechanisms_without_valid_evidence}
                emptyLabel="Todos os mecanismos têm evidência real válida e aprovada."
                renderItem={(item) => (
                  <EntityRow
                    key={item.id}
                    item={item}
                    meta={`${formatNumber(item.expected_evidence_count)} tipo(s) de evidência esperada · ${item.mechanism_type || "sem tipo"}`}
                  />
                )}
              />
            </GovernancePanel>

            <GovernancePanel title="Tarefas vencidas" icon={ClipboardList} empty={!data.lists.overdue_tasks.length}>
              <CompactList
                items={data.lists.overdue_tasks}
                emptyLabel="Não existem tarefas de governação vencidas."
                renderItem={(item) => (
                  <EntityRow
                    key={item.id}
                    item={item}
                    meta={`Prazo: ${formatDate(item.due_date)} · Prioridade: ${item.priority || "-"} · Owner: ${item.owner || "sem owner"}`}
                  />
                )}
              />
            </GovernancePanel>

            <GovernancePanel title="Evidências expiradas" icon={FileCheck} empty={!data.lists.expired_evidence.length}>
              <CompactList
                items={data.lists.expired_evidence}
                emptyLabel="Não existem evidências expiradas."
                renderItem={(item) => (
                  <EntityRow
                    key={item.id}
                    item={item}
                    meta={`Validade: ${formatDate(item.valid_until)} · Tipo: ${item.evidence_type || "-"} · Estado: ${item.status || "-"}`}
                  />
                )}
              />
            </GovernancePanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <GovernancePanel title="Estado dos mappings" icon={GitBranch}>
              <div className="divide-y divide-slate-100">
                {data.pending_mappings.map((row) => (
                  <Link key={row.key} to={row.href} className="block px-6 py-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-slate-950">{row.label}</div>
                        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                          {formatNumber(row.approved)} aprovados · {formatNumber(row.rejected + row.deprecated)} inativos
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-right text-xs font-black uppercase tracking-wide">
                        <span className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">{formatNumber(row.pending_review)} pending</span>
                        <span className="rounded-xl bg-slate-50 px-3 py-2 text-slate-600">{formatNumber(row.draft)} draft</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </GovernancePanel>

            <GovernancePanel title="Cobertura RAG por entidade" icon={Database} empty={!topRagIssues.length}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 text-left">Fonte</th>
                      <th className="px-5 py-3 text-right">Entidades</th>
                      <th className="px-5 py-3 text-right">Chunks</th>
                      <th className="px-5 py-3 text-right">Em falta</th>
                      <th className="px-5 py-3 text-right">Sem embedding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rag_health.map((row) => (
                      <tr key={row.source_type} className={row.missing_count || row.chunks_without_embedding ? "bg-amber-50/40" : "bg-white"}>
                        <td className="px-5 py-3">
                          <Link to={row.href} className="font-black text-slate-950 hover:text-indigo-700">
                            {row.label}
                          </Link>
                          <div className="text-xs font-bold text-slate-400">{row.source_type}</div>
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-slate-700">{formatNumber(row.expected_count)}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-700">{formatNumber(row.chunk_count)}</td>
                        <td className="px-5 py-3 text-right font-black text-amber-700">{formatNumber(row.missing_count)}</td>
                        <td className="px-5 py-3 text-right font-black text-red-700">{formatNumber(row.chunks_without_embedding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GovernancePanel>
          </div>

          <GovernancePanel title="Recomendações de melhoria" icon={ShieldCheck}>
            <div className="grid gap-3 p-6 lg:grid-cols-2">
              {data.recommendations.map((recommendation) => (
                <div key={recommendation} className="rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm font-bold leading-6 text-indigo-900">
                  {recommendation}
                </div>
              ))}
            </div>
          </GovernancePanel>
        </>
      ) : null}
    </div>
  );
}
