import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Bug,
  Cpu,
  Database,
  History,
  RefreshCw,
  Save,
  Server,
  ShieldAlert,
} from "lucide-react";
import { riskApi, type Software } from "@/lib/riskApi";

type SoftwareDetailRecord = Software & Record<string, any>;

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-PT");
}

function valueOrDash(value: any) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  return String(value);
}

function severityTone(severity?: string) {
  if (severity === "Critical") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "High") return "border-orange-200 bg-orange-50 text-orange-700";
  if (severity === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (severity === "Low") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{valueOrDash(value)}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-3xl font-black text-slate-950">{valueOrDash(value)}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

export default function SoftwareDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [software, setSoftware] = useState<SoftwareDetailRecord | null>(null);
  const [status, setStatus] = useState("");
  const [criticality, setCriticality] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await riskApi.getSoftware(id) as SoftwareDetailRecord;
      setSoftware(data);
      setStatus(data.status || "Active");
      setCriticality(data.criticality || "Medium");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel carregar o software.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const updateClassification = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await riskApi.updateSoftware(id, { status, criticality } as Partial<SoftwareDetailRecord>) as SoftwareDetailRecord;
      setSoftware(updated);
      setMessage("Classificacao do software atualizada.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel atualizar o software.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-black uppercase tracking-widest text-slate-400">A carregar software...</div>;
  }

  if (error && !software) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-red-100 bg-red-50 p-8 text-red-700">
        <div className="flex items-center gap-3 font-black">
          <AlertTriangle className="h-5 w-5" />
          Erro ao carregar software
        </div>
        <p className="mt-2 text-sm font-semibold">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
          Voltar
        </button>
      </div>
    );
  }

  if (!software) return null;

  const assets = software.assets_detail || [];
  const vulnerabilities = software.vulnerabilities_detail || [];
  const history = software.history || [];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-cyan-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${severityTone(software.max_severity)}`}>
                {software.max_severity || "None"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                {software.source || "manual"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                {software.status || "sem estado"}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">{software.name}</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
              {[software.vendor, software.version, software.architecture].filter(Boolean).join(" / ") || "Software sem fabricante ou versao registada."}
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-cyan-700">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </header>

      {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={Server} label="Ativos" value={software.assets_count || assets.length} tone="text-cyan-700" />
        <Metric icon={Bug} label="Vulnerabilidades" value={software.vulnerabilities_count || vulnerabilities.length} tone="text-red-600" />
        <Metric icon={ShieldAlert} label="Score maximo" value={software.risk_score || "-"} tone="text-orange-600" />
        <Metric icon={Cpu} label="Criticidade" value={software.criticality || "-"} tone="text-slate-700" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_.75fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-black text-slate-950">Resumo do software</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Field label="Fabricante" value={software.vendor} />
            <Field label="Versao" value={software.version} />
            <Field label="Arquitetura" value={software.architecture} />
            <Field label="Identificador unico" value={software.unique_identifier} />
            <Field label="Categoria" value={software.category_details?.name} />
            <Field label="Tipo" value={software.type_details?.name} />
            <Field label="Unidade organica" value={software.org_unit_details?.name} />
            <Field label="Owner tecnico" value={software.technical_owner_details?.name} />
            <Field label="Owner negocio" value={software.business_owner_details?.name} />
            <Field label="Fim de vida" value={software.end_of_life ? new Date(software.end_of_life).toLocaleDateString("pt-PT") : "-"} />
          </div>
          {software.description && (
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descricao</p>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{software.description}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Classificacao</h2>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Estado</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                <option value="New">Novo</option>
                <option value="Active">Ativo</option>
                <option value="Maintenance">Em manutencao</option>
                <option value="Retired">Descontinuado</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Criticidade</span>
              <select value={criticality} onChange={(event) => setCriticality(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100">
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Very Low">Very Low</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Confidencialidade" value={software.confidentiality} />
              <Field label="Integridade" value={software.integrity} />
              <Field label="Disponibilidade" value={software.availability} />
              <Field label="Exposicao" value={software.exposure} />
            </div>
            <button onClick={updateClassification} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-cyan-900 disabled:bg-slate-300">
              <Save className="h-4 w-4" />
              {saving ? "A guardar..." : "Guardar classificacao"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Ativos com este software</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {assets.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">Sem ativos associados.</div>
            ) : assets.map((asset: any) => (
              <Link key={asset.id} to={`/assets/inventory/${asset.id}`} className="block p-5 hover:bg-slate-50">
                <p className="font-black text-slate-950">{asset.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{asset.wazuh_ip || asset.criticality || "Ativo registado"}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Vulnerabilidades relacionadas</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {vulnerabilities.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-slate-400">Sem vulnerabilidades associadas.</div>
            ) : vulnerabilities.map((item: any) => (
              <div key={item.id || item.cve_id} className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${severityTone(item.severity)}`}>
                      {item.severity || "n/a"}
                    </span>
                    <p className="mt-3 font-black text-slate-950">{item.cve_id || item.title || "Vulnerabilidade"}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{item.title || item.description || "Sem detalhe"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center">
                    <p className="text-xl font-black text-slate-950">{item.cvss_score || "-"}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">CVSS</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-slate-500" />
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Historico</h2>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {history.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-400">Sem historico registado.</div>
          ) : history.slice(0, 10).map((item: any) => (
            <div key={item.id} className="p-5">
              <p className="text-sm font-black text-slate-900">{item.action}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{item.details || "Sem detalhe"} / {formatDate(item.timestamp)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
