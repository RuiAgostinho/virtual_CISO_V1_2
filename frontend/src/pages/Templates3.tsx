// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
//import { controlsApi, Control, Framework } from "@/lib/controlsApi";

type StatusFilter = "active" | "archived";
type Mode = "create" | "edit";

function classNames(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "system" | "custom" | "archived" }) {
  const cls =
    tone === "system"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : tone === "custom"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  return <span className={classNames("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", cls)}>{children}</span>;
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white shadow">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="font-semibold">{title}</div>
          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ControlForm({
  mode,
  frameworks,
  initial,
  onCancel,
  onSaved,
}: {
  mode: Mode;
  frameworks: Framework[];
  initial?: Control | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [frameworkId, setFrameworkId] = useState<number>(initial?.framework ?? frameworks[0]?.id ?? 0);
  const [controlId, setControlId] = useState<string>(initial?.control_id ?? "");
  const [title, setTitle] = useState<string>(initial?.title ?? "");
  const [desc, setDesc] = useState<string>(initial?.description_short ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se edit e o controlo for SYSTEM, bloqueia fields “sensíveis” (podes ajustar conforme regra backend)
  const isSystem = initial?.source === "SYSTEM";

  useEffect(() => {
    if (mode === "edit" && initial) {
      setFrameworkId(initial.framework);
      setControlId(initial.control_id);
      setTitle(initial.title);
      setDesc(initial.description_short ?? "");
    }
  }, [mode, initial]);

  const canSave = frameworkId > 0 && controlId.trim() && title.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSave) return;

    setSaving(true);
    try {
      if (mode === "create") {
        await controlsApi.createControl({
          framework: frameworkId,
          control_id: controlId.trim(),
          title: title.trim(),
          description_short: desc.trim() || undefined,
        });
      } else if (mode === "edit" && initial) {
        await controlsApi.updateControl(initial.id, {
          // se SYSTEM, backend deve limitar o que permite editar; aqui já bloqueamos parte na UI
          control_id: controlId.trim(),
          title: title.trim(),
          description_short: desc.trim() || undefined,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message || "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}

      <div className="grid gap-2">
        <label className="text-sm font-medium">Framework</label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={frameworkId}
          onChange={(e) => setFrameworkId(Number(e.target.value))}
          disabled={mode === "edit"} // normalmente não mudas framework no edit
        >
          {frameworks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} {f.version ? `(${f.version})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">ID do controlo</label>
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={controlId}
          onChange={(e) => setControlId(e.target.value)}
          placeholder="ex: 5.1 | PR.AC-01"
          disabled={isSystem && mode === "edit"} // ajusta conforme política
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Título</label>
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título curto"
          disabled={isSystem && mode === "edit"} // ajusta conforme política
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Descrição curta (opcional)</label>
        <textarea
          className="min-h-[110px] w-full rounded-xl border px-3 py-2 text-sm"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Resumo interno / notas (evita texto integral de standards proprietários)"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSave || saving}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "A guardar…" : "Guardar"}
        </button>
      </div>

      {isSystem && mode === "edit" && (
        <div className="text-xs text-slate-500">
          Este controlo é do catálogo base (SYSTEM). Alguns campos podem estar bloqueados para evitar inconsistências com a importação.
        </div>
      )}
    </form>
  );
}

export default function Templates() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [frameworkFilter, setFrameworkFilter] = useState<string>(""); // slug
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<Mode>("create");
  const [selected, setSelected] = useState<Control | null>(null);

  const reload = async () => {
    setErr(null);
    setLoading(true);
    try {
      const [fw, list] = await Promise.all([
        controlsApi.listFrameworks(),
        controlsApi.listControls({
          framework: frameworkFilter || undefined,
          status: statusFilter,
          search: search.trim() || undefined,
        }),
      ]);
      setFrameworks(fw);
      setControls(list);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-fetch quando filtros mudam (com debounce simples para search)
  useEffect(() => {
    const t = setTimeout(() => {
      reload();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkFilter, statusFilter, search]);

  const frameworkById = useMemo(() => {
    const m = new Map<number, Framework>();
    frameworks.forEach((f) => m.set(f.id, f));
    return m;
  }, [frameworks]);

  const openCreate = () => {
    setSelected(null);
    setModalMode("create");
    setModalOpen(true);
  };

  const openEdit = (c: Control) => {
    setSelected(c);
    setModalMode("edit");
    setModalOpen(true);
  };

  const archive = async (c: Control) => {
    if (!confirm("Arquivar este controlo?")) return;
    try {
      await controlsApi.archiveControl(c.id);
      await reload();
    } catch (e: any) {
      alert(e?.message || "Falha ao arquivar.");
    }
  };

  const restore = async (c: Control) => {
    if (!confirm("Restaurar este controlo?")) return;
    try {
      await controlsApi.restoreControl(c.id);
      await reload();
    } catch (e: any) {
      alert(e?.message || "Falha ao restaurar.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Templates & Controlos</h1>
          <p className="text-sm text-slate-600">
            Gestão do catálogo (ISO/NIST) e controlos custom. Importações via JSON não devem destruir controlos CUSTOM.
          </p>
        </div>
        <button onClick={openCreate} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
          + Novo controlo
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Framework</label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={frameworkFilter}
              onChange={(e) => setFrameworkFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {frameworks.map((f) => (
                <option key={f.id} value={f.slug}>
                  {f.name} {f.version ? `(${f.version})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="active">Ativos</option>
              <option value="archived">Arquivados</option>
            </select>
          </div>

          <div className="md:col-span-2 grid gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pesquisa</label>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por ID, título…"
            />
          </div>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

      <div className="rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            {loading ? "A carregar…" : `${controls.length} controlo(s)`}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="system">SYSTEM</Badge>
            <Badge tone="custom">CUSTOM</Badge>
            <Badge tone="archived">ARCHIVED</Badge>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b">
                <th className="px-4 py-3">Framework</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!loading && controls.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-slate-600" colSpan={6}>
                    Sem resultados.
                  </td>
                </tr>
              )}

              {controls.map((c) => {
                const fw = frameworkById.get(c.framework);
                return (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{fw?.name ?? c.framework_name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono">{c.control_id}</td>
                    <td className="px-4 py-3">{c.title}</td>
                    <td className="px-4 py-3">
                      <Badge tone={c.source === "SYSTEM" ? "system" : "custom"}>{c.source}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={c.status === "ARCHIVED" ? "archived" : "system"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"
                          onClick={() => openEdit(c)}
                        >
                          Editar
                        </button>

                        {c.status === "ARCHIVED" ? (
                          <button
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"
                            onClick={() => restore(c)}
                          >
                            Restaurar
                          </button>
                        ) : (
                          <button
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"
                            onClick={() => archive(c)}
                          >
                            Arquivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden p-4 space-y-3">
          {!loading && controls.length === 0 && <div className="text-sm text-slate-600">Sem resultados.</div>}

          {controls.map((c) => {
            const fw = frameworkById.get(c.framework);
            return (
              <div key={c.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">{fw?.name ?? "—"}</div>
                    <div className="mt-1 font-mono text-sm">{c.control_id}</div>
                    <div className="mt-1 font-medium">{c.title}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={c.source === "SYSTEM" ? "system" : "custom"}>{c.source}</Badge>
                    <Badge tone={c.status === "ARCHIVED" ? "archived" : "system"}>{c.status}</Badge>
                  </div>
                </div>

                {c.description_short && <div className="mt-2 text-sm text-slate-600">{c.description_short}</div>}

                <div className="mt-3 flex gap-2">
                  <button className="flex-1 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" onClick={() => openEdit(c)}>
                    Editar
                  </button>

                  {c.status === "ARCHIVED" ? (
                    <button className="flex-1 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" onClick={() => restore(c)}>
                      Restaurar
                    </button>
                  ) : (
                    <button className="flex-1 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" onClick={() => archive(c)}>
                      Arquivar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={modalMode === "create" ? "Novo controlo" : "Editar controlo"}
        onClose={() => setModalOpen(false)}
      >
        <ControlForm
          mode={modalMode}
          frameworks={frameworks}
          initial={selected}
          onCancel={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await reload();
          }}
        />
      </Modal>
    </div>
  );
}