import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Save, ShieldAlert, BookOpen, AlertTriangle, type LucideIcon } from "lucide-react";
import { governanceApi, type RegulatoryContextRecord } from "@/lib/governanceApi";

type DisplayValue = string | number | boolean | null | undefined;

function nis2Label(value?: string) {
  const labels: Record<string, string> = {
    Essential: "Entidade Essencial",
    Important: "Entidade Importante",
    "Out of Scope": "Não Abrangida",
    Pending: "Em Avaliação",
  };
  return labels[value || ""] || value || "Pendente";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function Metric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: DisplayValue; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 text-xl font-bold text-slate-950">{value || "-"}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

export default function RegulatoryContext() {
  const [record, setRecord] = useState<RegulatoryContextRecord | null>(null);
  const [form, setForm] = useState<Partial<RegulatoryContextRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await governanceApi.getRegulatoryContext();
      setRecord(data);
      setForm(data || {});
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Não foi possível carregar o contexto regulatório."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completion = useMemo(() => {
    const fields = [
      form.nis2_classification !== "Pending" ? form.nis2_classification : null,
      form.classification_criteria,
      form.applicable_obligations,
      form.competent_authority,
      form.last_reviewed_at,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [form]);

  const updateField = (field: keyof RegulatoryContextRecord, value: string | null | undefined) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (!record?.id) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await governanceApi.updateRegulatoryContext(record.id, form);
      setRecord(updated);
      setForm(updated);
      setMessage("Contexto regulatório guardado com sucesso.");
      setTimeout(() => setMessage(null), 3000);
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Erro ao guardar contexto regulatório."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm font-bold uppercase tracking-wide text-slate-400">A carregar...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Contexto Organizacional</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Contexto Regulatório</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Definição do enquadramento legal e regulamentar da organização, incluindo a classificação segundo a Diretiva NIS2.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Alterações
            </button>
          </div>
        </div>
      </header>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 shadow-sm">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Metric
          icon={ShieldAlert}
          label="Classificação NIS2"
          value={nis2Label(form.nis2_classification)}
          tone={form.nis2_classification === "Essential" ? "text-red-600" : form.nis2_classification === "Important" ? "text-amber-600" : "text-slate-400"}
        />
        <Metric
          icon={AlertTriangle}
          label="Autoridade Competente"
          value={form.competent_authority || "Não definida"}
          tone="text-indigo-600"
        />
        <Metric
          icon={CheckCircle2}
          label="Preenchimento"
          value={`${completion || 0}%`}
          tone={completion === 100 ? "text-emerald-600" : "text-amber-500"}
        />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-indigo-700" />
          <h2 className="text-lg font-bold text-slate-950">Diretiva NIS2 e Obrigações</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Classificação NIS2</label>
            <select
              value={form.nis2_classification || "Pending"}
              onChange={(e) => updateField("nis2_classification", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
            >
              <option value="Pending">Em Avaliação</option>
              <option value="Essential">Entidade Essencial</option>
              <option value="Important">Entidade Importante</option>
              <option value="Out of Scope">Não Abrangida</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">Impacta os prazos de notificação de incidentes e o nível de coimas aplicáveis.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Autoridade Competente</label>
            <input
              type="text"
              value={form.competent_authority || ""}
              onChange={(e) => updateField("competent_authority", e.target.value)}
              placeholder="Ex: CNCS, Banco de Portugal..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Critérios de Classificação</label>
            <textarea
              rows={3}
              value={form.classification_criteria || ""}
              onChange={(e) => updateField("classification_criteria", e.target.value)}
              placeholder="Justificação legal para a classificação..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Obrigações Aplicáveis (Resumo)</label>
            <textarea
              rows={4}
              value={form.applicable_obligations || ""}
              onChange={(e) => updateField("applicable_obligations", e.target.value)}
              placeholder="Resumo das obrigações (ex: Artigo 21 - Medidas de gestão dos riscos de cibersegurança)..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Data da Última Revisão</label>
            <input
              type="date"
              value={form.last_reviewed_at || ""}
              onChange={(e) => updateField("last_reviewed_at", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
