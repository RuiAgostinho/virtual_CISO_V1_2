import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Compass,
  ListChecks,
  RefreshCw,
  Search,
  Target,
} from "lucide-react";
import { riskApi } from "@/lib/riskApi";

type Reason = "discovered" | "unclassified";

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

// An asset lands in the triage queue when it needs the CISO's attention:
// discovered assets await validation; default-CIA assets were never reviewed.
function triageReason(asset: any): Reason | null {
  if (asset.status === "New") return "discovered";
  const c = Number(asset.confidentiality);
  const i = Number(asset.integrity);
  const a = Number(asset.availability);
  if (c === 3 && i === 3 && a === 3) return "unclassified";
  return null;
}

const REASON_META: Record<Reason, { label: string; tone: string; hint: string }> = {
  discovered: {
    label: "Descoberto — a validar",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    hint: "Ativo detetado por scanner; falta validar e enquadrar no inventário.",
  },
  unclassified: {
    label: "Classificação por rever",
    tone: "border-slate-200 bg-slate-100 text-slate-600",
    hint: "A classificação CIA ainda está nos valores por omissão.",
  },
};

function criticalityTone(value?: string) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function Classification() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Reason>("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.listAssets({ page_size: 500 });
      setAssets(unwrap(data));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar os ativos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const queue = useMemo(
    () =>
      assets
        .map((asset) => ({ asset, reason: triageReason(asset) }))
        .filter((entry): entry is { asset: any; reason: Reason } => entry.reason !== null),
    [assets],
  );

  const metrics = useMemo(
    () => ({
      total: queue.length,
      discovered: queue.filter((e) => e.reason === "discovered").length,
      unclassified: queue.filter((e) => e.reason === "unclassified").length,
    }),
    [queue],
  );

  const visible = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return queue.filter((entry) => {
      if (filter !== "all" && entry.reason !== filter) return false;
      if (!lower) return true;
      const a = entry.asset;
      return (
        (a.name || "").toLowerCase().includes(lower) ||
        (a.wazuh_ip || "").toLowerCase().includes(lower) ||
        (a.type_name || a.category_name || "").toLowerCase().includes(lower)
      );
    });
  }, [queue, filter, search]);

  const tabs: { key: "all" | Reason; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: metrics.total },
    { key: "discovered", label: "Descobertos", count: metrics.discovered },
    { key: "unclassified", label: "Por classificar", count: metrics.unclassified },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Gestão de ativos</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Classificação de ativos</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Fila de trabalho do CISO: ativos descobertos por validar e classificações por rever. Abre cada ativo e
              usa <span className="font-bold text-slate-700">Editar</span> para definir a classificação CIA.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ListChecks className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">A precisar de atenção</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Compass className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.discovered}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Descobertos a validar</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Target className="h-5 w-5 text-slate-500" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.unclassified}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Classificação por rever</p>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  filter === tab.key
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-indigo-700"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, IP ou tipo..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar...</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
            <p className="mt-4 text-sm font-bold text-slate-700">
              {queue.length === 0 ? "Tudo em dia" : "Nenhum ativo para este filtro"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {queue.length === 0
                ? "Não há ativos por validar nem classificações por rever."
                : "Experimenta outro filtro ou limpa a pesquisa."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map(({ asset, reason }) => (
              <button
                key={asset.id}
                onClick={() => navigate(`/assets/inventory/${asset.id}`)}
                className="block w-full p-5 text-left transition-colors hover:bg-slate-50"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${REASON_META[reason].tone}`}>
                        {REASON_META[reason].label}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${criticalityTone(asset.criticality)}`}>
                        {asset.criticality || "Sem criticidade"}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-bold text-slate-950">{asset.name}</h3>
                    <p className="mt-0.5 text-sm font-semibold text-slate-500">
                      {asset.type_name || asset.category_name || "Sem tipo"}
                      {asset.wazuh_ip ? ` · ${asset.wazuh_ip}` : ""}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-400">{REASON_META[reason].hint}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wide text-indigo-600">
                    Classificar
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
