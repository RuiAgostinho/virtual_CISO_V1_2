import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BookOpen, Save, ShieldCheck } from "lucide-react";
import { governanceApi } from "@/lib/governanceApi";

type PolicyFormState = {
  code: string;
  title: string;
  description: string;
  objective: string;
  scope: string;
  owner: string;
  status: string;
  version: string;
  approval_date: string;
  review_date: string;
  next_review_date: string;
  related_frameworks: string[];
};

const emptyForm: PolicyFormState = {
  code: "",
  title: "",
  description: "",
  objective: "",
  scope: "",
  owner: "",
  status: "draft",
  version: "1.0",
  approval_date: "",
  review_date: "",
  next_review_date: "",
  related_frameworks: [],
};

function asDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function unwrap<T>(data: any): T[] {
  return Array.isArray(data) ? data : data?.results || [];
}

export default function PolicyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [form, setForm] = useState<PolicyFormState>(emptyForm);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const frameworksData = await governanceApi.getFrameworks();
        setFrameworks(unwrap(frameworksData));

        if (id) {
          const policy = await governanceApi.getPolicy(id);
          setForm({
            code: policy.code || "",
            title: policy.title || "",
            description: policy.description || "",
            objective: policy.objective || "",
            scope: policy.scope || "",
            owner: policy.owner || "",
            status: policy.status || "draft",
            version: policy.version || "1.0",
            approval_date: asDateInput(policy.approval_date),
            review_date: asDateInput(policy.review_date),
            next_review_date: asDateInput(policy.next_review_date),
            related_frameworks: Array.isArray(policy.related_frameworks)
              ? policy.related_frameworks.map((item: any) => String(item?.id || item))
              : [],
          });
        }
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Nao foi possivel carregar o formulario.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const selectedFrameworkNames = useMemo(() => {
    const selected = new Set(form.related_frameworks);
    return frameworks.filter((framework) => selected.has(String(framework.id))).map((framework) => framework.name || framework.code);
  }, [frameworks, form.related_frameworks]);

  const toggleFramework = (frameworkId: string) => {
    setForm((current) => {
      const selected = new Set(current.related_frameworks);
      if (selected.has(frameworkId)) selected.delete(frameworkId);
      else selected.add(frameworkId);
      return { ...current, related_frameworks: Array.from(selected) };
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.code.trim() || !form.title.trim()) return;
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      code: form.code.trim(),
      title: form.title.trim(),
      owner: form.owner.trim(),
      approval_date: form.approval_date || null,
      review_date: form.review_date || null,
      next_review_date: form.next_review_date || null,
    };

    try {
      const saved = editing && id
        ? await governanceApi.updatePolicy(id, payload)
        : await governanceApi.createPolicy(payload);
      navigate(`/governance/policies/${saved.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Nao foi possivel guardar a politica.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-bold uppercase tracking-wide text-slate-400">A carregar formulario...</div>;
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <Link to={editing && id ? `/governance/policies/${id}` : "/governance/policies"} className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Governo documental</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {editing ? "Editar politica" : "Nova politica"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Defina o corpo normativo, ownership, ciclo de revisao e frameworks relacionadas.
            </p>
          </div>
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

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Codigo</span>
              <input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="POL-001"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Titulo</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="Politica de Seguranca da Informacao"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Estado</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
                <option value="draft">Rascunho</option>
                <option value="active">Ativa</option>
                <option value="review">Em revisao</option>
                <option value="obsolete">Obsoleta</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Versao</span>
              <input
                value={form.version}
                onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner</span>
              <input
                value={form.owner}
                onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                placeholder="CISO"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Aprovacao</span>
              <input type="date" value={form.approval_date} onChange={(event) => setForm((current) => ({ ...current, approval_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Última revisao</span>
              <input type="date" value={form.review_date} onChange={(event) => setForm((current) => ({ ...current, review_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Proxima revisao</span>
              <input type="date" value={form.next_review_date} onChange={(event) => setForm((current) => ({ ...current, next_review_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descricao</span>
              <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-2 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Objetivo</span>
              <textarea value={form.objective} onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ambito</span>
              <textarea value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-950">Frameworks</h2>
            </div>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
              {selectedFrameworkNames.length ? selectedFrameworkNames.join(", ") : "Nenhuma framework selecionada."}
            </p>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {frameworks.length === 0 ? (
                <p className="text-sm font-bold text-slate-400">Sem frameworks carregadas.</p>
              ) : frameworks.map((framework) => {
                const frameworkId = String(framework.id);
                const selected = form.related_frameworks.includes(frameworkId);
                return (
                  <button
                    type="button"
                    key={frameworkId}
                    onClick={() => toggleFramework(frameworkId)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-indigo-100"
                    }`}
                  >
                    <p className="text-sm font-bold">{framework.name || framework.code}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{framework.code || framework.version || "Framework"}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <button
            type="submit"
            disabled={saving || !form.code.trim() || !form.title.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save className="h-4 w-4" />
            {saving ? "A guardar..." : "Guardar politica"}
          </button>
        </aside>
      </form>
    </div>
  );
}
