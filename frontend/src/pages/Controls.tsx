import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldCheck, Target } from "lucide-react";
import { governanceApi, type PaginatedResponse } from "@/lib/governanceApi";

type ControlListRecord = {
  id: string | number;
  code?: string;
  title?: string;
  description?: string;
  status?: string;
  framework?: string | { name?: string };
  framework_name?: string;
  framework_code?: string;
  section_code?: string;
  section_name?: string;
  is_mandatory?: boolean;
  mechanisms_count?: number;
  internal_mappings_count?: number;
  approved_internal_mappings_count?: number;
};

function unwrap<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

function getTotal<T>(data: T[] | PaginatedResponse<T> | null | undefined, fallback: number) {
  return Array.isArray(data) ? fallback : data?.count ?? fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getFrameworkName(framework: ControlListRecord["framework"]) {
  if (framework && typeof framework === "object") return framework.name || "Desconhecida";
  return "Desconhecida";
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function normalizeControlRecord(record: Record<string, unknown>): ControlListRecord {
  const framework = record.framework;
  return {
    id: typeof record.id === "string" || typeof record.id === "number" ? record.id : String(record.id ?? ""),
    code: getString(record.code),
    title: getString(record.title),
    description: getString(record.description),
    status: getString(record.status),
    framework:
      typeof framework === "string" || (framework && typeof framework === "object")
        ? (framework as ControlListRecord["framework"])
        : undefined,
    framework_name: getString(record.framework_name),
    framework_code: getString(record.framework_code),
    section_code: getString(record.section_code),
    section_name: getString(record.section_name),
    is_mandatory: typeof record.is_mandatory === "boolean" ? record.is_mandatory : false,
    mechanisms_count: getNumber(record.mechanisms_count),
    internal_mappings_count: getNumber(record.internal_mappings_count),
    approved_internal_mappings_count: getNumber(record.approved_internal_mappings_count),
  };
}

export default function Controls() {
  const [searchParams] = useSearchParams();
  const frameworkId = searchParams.get("framework") || undefined;
  const searchParam = searchParams.get("search") || "";

  const [controls, setControls] = useState<ControlListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParam);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalControls, setTotalControls] = useState(0);

  useEffect(() => {
    setSearch(searchParam);
    setPage(1);
  }, [searchParam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.listControls({
        framework: frameworkId,
        page,
        page_size: pageSize,
        ordering: "code",
        search: search.trim() || undefined,
      });
      const items = unwrap<Record<string, unknown>>(data as PaginatedResponse<Record<string, unknown>>).map(
        normalizeControlRecord
      );
      setControls(items);
      setTotalControls(getTotal<Record<string, unknown>>(data as PaginatedResponse<Record<string, unknown>>, items.length));
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar os controlos."));
    } finally {
      setLoading(false);
    }
  }, [frameworkId, page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    return {
      total: totalControls,
      mandatory: controls.filter((c) => c.is_mandatory).length,
      active: controls.filter((c) => c.status === "active").length,
    };
  }, [controls, totalControls]);

  const totalPages = Math.max(1, Math.ceil(totalControls / pageSize));

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Avaliação de Conformidade</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Catálogo de Controlos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Visualização paginada dos controlos externos por framework. A implementação deve continuar a ser feita
              através dos controlos internos e dos respetivos mapeamentos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de Controlos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.mandatory}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Obrigatórios nesta página</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.active}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ativos nesta página</p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Pesquisar por código, título, descrição, framework ou secção..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar controlos...</div>
        ) : controls.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhum controlo encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Framework / Código</th>
                  <th className="w-1/2 px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Título e Descrição</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-400">Estado</th>
                  <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wide text-slate-400">Obrigatório</th>
                  <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wide text-slate-400">Mecanismos</th>
                  <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wide text-slate-400">Mappings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {controls.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="mb-1 text-xs font-bold text-slate-400">{c.framework_name || getFrameworkName(c.framework)}</div>
                      <div className="inline-block rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-950">{c.code}</div>
                      {(c.section_code || c.section_name) && (
                        <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {[c.section_code, c.section_name].filter(Boolean).join(" - ")}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="mb-1 font-semibold text-slate-950">{c.title}</div>
                      <div className="line-clamp-2 text-xs text-slate-500" title={c.description}>
                        {c.description || "Sem descrição"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          c.status === "active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-500"
                        }`}
                      >
                        {c.status === "active" ? "Ativo" : c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {c.is_mandatory ? (
                        <span className="inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Sim</span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Não</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                        {c.mechanisms_count || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        {c.approved_internal_mappings_count || 0}/{c.internal_mappings_count || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={totalControls}
        totalPages={totalPages}
        currentCount={controls.length}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
      />
    </div>
  );
}

function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  currentCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  currentCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = totalItems === 0 ? 0 : Math.min(totalItems, firstItem + currentCount - 1);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm md:flex-row md:items-center md:justify-between">
      <span>
        A mostrar {firstItem}-{lastItem} de {totalItems} controlo(s).
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase tracking-wide text-slate-600"
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="px-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Seguinte
        </button>
      </div>
    </div>
  );
}
