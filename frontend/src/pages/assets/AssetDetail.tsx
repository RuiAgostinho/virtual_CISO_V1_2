import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Bug,
  CheckCircle2,
  Database,
  GitBranch,
  History,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  UserRound,
  Wifi,
} from "lucide-react";
import { riskApi } from "@/lib/riskApi";

type AssetDetailRecord = Record<string, any>;

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-PT");
}

function valueOrDash(value: any) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  return String(value);
}

function criticalityTone(value?: string) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function severityTone(value?: string) {
  if (value === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (value === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "Low") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-3xl font-black text-slate-950">{valueOrDash(value)}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{valueOrDash(value)}</p>
    </div>
  );
}

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<AssetDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.getAsset(id);
      setAsset(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o ativo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const vulnerabilities = asset?.vulnerability_occurrences || [];
  const software = asset?.installed_software || [];
  const history = asset?.history || [];
  const relations = useMemo(() => {
    if (!asset) return [];
    return [
      { label: "Ativo pai", items: asset.parent_details ? [asset.parent_details] : [] },
      { label: "Dependencias diretas", items: asset.children_details || [] },
      { label: "Depende de", items: asset.dependent_assets_details || [] },
      { label: "Servicos externos", items: asset.external_service_assets_details || [] },
      { label: "Integracoes", items: asset.integration_assets_details || [] },
      { label: "Software dependente", items: asset.depends_on_software_details || [] },
    ];
  }, [asset]);

  const enrich = async () => {
    if (!asset?.id) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await riskApi.enrichAsset(asset.id);
      setMessage(result?.detail || "Enriquecimento Nmap executado.");
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel enriquecer o ativo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-black uppercase tracking-widest text-slate-400">A carregar ativo...</div>;
  }

  if (error && !asset) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-red-100 bg-red-50 p-8 text-red-700">
        <div className="flex items-center gap-3 font-black">
          <AlertTriangle className="h-5 w-5" />
          Erro ao carregar ativo
        </div>
        <p className="mt-2 text-sm font-semibold">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
          Voltar
        </button>
      </div>
    );
  }

  if (!asset) return null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${criticalityTone(asset.criticality)}`}>
                {asset.criticality || "Sem criticidade"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                {asset.source || "manual"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                {asset.status || "sem estado"}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">{asset.name}</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {asset.description || "Ativo sem descricao operacional registada."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-indigo-700">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={enrich}
              disabled={saving || !asset.wazuh_ip}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Sparkles className="h-4 w-4" />
              {saving ? "A enriquecer..." : "Enriquecer"}
            </button>
          </div>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Bug} label="Vulnerabilidades" value={asset.vulnerabilities_count || vulnerabilities.length} tone="text-red-600" />
        <MetricCard icon={ShieldAlert} label="Controlos" value={asset.controls_count || 0} tone="text-indigo-700" />
        <MetricCard icon={Boxes} label="Software" value={software.length} tone="text-cyan-700" />
        <MetricCard icon={Server} label="Exposicao" value={asset.exposure} tone="text-amber-600" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-indigo-700" />
            <h2 className="text-lg font-black text-slate-950">Resumo do ativo</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Field label="Categoria" value={asset.category_details?.name || asset.category_name} />
            <Field label="Tipo" value={asset.type_details?.name || asset.type_name} />
            <Field label="Unidade organica" value={asset.org_unit_details?.name || asset.org_unit_name} />
            <Field label="Dono de negocio" value={asset.business_owner_details?.name || asset.business_owner_name || asset.owner} />
            <Field label="Dono tecnico" value={asset.technical_owner_details?.name || asset.technical_owner_name} />
            <Field label="Localizacao" value={asset.location_details?.name || asset.location_name} />
            <Field label="Ambiente" value={asset.environment_details?.name || asset.environment_name} />
            <Field label="Infraestrutura" value={asset.deployment_type_details?.name} />
            <Field label="IP principal" value={asset.wazuh_ip} />
            <Field label="IPs secundarios" value={asset.secondary_ips} />
            <Field label="Wazuh agent" value={asset.wazuh_agent_id} />
            <Field label="Ultima sincronizacao" value={formatDate(asset.last_sync_at)} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-black text-slate-950">Classificacao CIA</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Field label="Confidencialidade" value={asset.confidentiality} />
            <Field label="Integridade" value={asset.integrity} />
            <Field label="Disponibilidade" value={asset.availability} />
            <Field label="Valor de negocio" value={asset.business_value} />
            <Field label="Dependencia" value={asset.dependency_score} />
            <Field label="Criticidade" value={asset.criticality} />
          </div>
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sistema operativo</p>
            <p className="mt-1 text-sm font-bold text-slate-800">
              {[asset.wazuh_os_name, asset.wazuh_os_version].filter(Boolean).join(" ") || "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.8fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Vulnerabilidades associadas</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {vulnerabilities.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">Sem vulnerabilidades associadas.</div>
            ) : vulnerabilities.map((item: any) => (
              <div key={item.id} className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${severityTone(item.severity)}`}>
                        {item.severity || "n/a"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {item.status || "sem estado"}
                      </span>
                    </div>
                    <p className="mt-2 font-black text-slate-950">{item.cve_id || item.vulnerability_details?.cve_id || "Vulnerabilidade"}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{item.software_name || item.software_details?.name || "Sem software associado"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center sm:min-w-[220px]">
                    <Field label="CVSS" value={item.cvss_score || item.vulnerability_details?.cvss_score} />
                    <Field label="Ultima vista" value={formatDate(item.last_seen)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Software instalado</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {software.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">Sem software associado.</div>
            ) : software.map((item: any) => (
              <Link key={item.id} to={`/assets/software/${item.id}`} className="block p-5 hover:bg-slate-50">
                <p className="font-black text-slate-950">{item.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {[item.vendor, item.version, item.architecture].filter(Boolean).join(" / ") || "Sem versao"}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-slate-700" />
            <h2 className="text-lg font-black text-slate-950">Dependencias</h2>
          </div>
          <div className="mt-5 space-y-4">
            {relations.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.items.length === 0 ? (
                    <span className="text-sm font-semibold text-slate-400">Sem registos</span>
                  ) : group.items.map((item: any) => (
                    <span key={`${group.label}-${item.id || item.name}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                      {item.name || item.title}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-slate-500" />
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Historico</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {history.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">Sem historico registado.</div>
            ) : history.slice(0, 8).map((item: any) => (
              <div key={item.id} className="p-5">
                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="text-sm font-black text-slate-900">{item.action}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.details || "Sem detalhe"} / {formatDate(item.timestamp)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Wifi className="h-5 w-5 text-cyan-700" />
          <h2 className="text-lg font-black text-slate-950">Identificadores tecnicos</h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Field label="Identificador unico" value={asset.unique_identifier} />
          <Field label="No Wazuh" value={asset.wazuh_node_name} />
          <Field label="Criado em" value={formatDate(asset.created_at)} />
        </div>
      </section>
    </div>
  );
}
