import React, { useEffect, useMemo, useState } from "react";
import { controlsApi } from "@/lib/controlsApi";
import type { Control, ControlStatus, Framework } from "@/lib/controlsApi";

type StatusFilterUI = "active" | "archived";
type Mode = "create" | "edit";

function classNames(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "system" | "custom" | "archived" | "ok";
}) {
  const cls =
    tone === "system"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : tone === "custom"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : tone === "ok"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        cls
      )}
    >
      {children}
    </span>
  );
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
          <button
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={onClose}
          >
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
  const [frameworkId, setFrameworkId] = useState<string>(
    (initial?.framework as unknown as string) ?? frameworks[0]?.id ?? ""
  );

  const [code, setCode] = useState<string>(initial?.code ?? "");
  const [title, setTitle] = useState<string>(initial?.title ?? "");
  const [desc, setDesc] = useState<string>(initial?.description ?? "");
  const [isMandatory, setIsMandatory] = useState<boolean>(
    Boolean(initial?.is_mandatory ?? false)
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se o teu backend não tiver 'source', isto fica sempre false (ok)
  const isSystem = initial?.source === "SYSTEM";

  useEffect(() => {
    if (mode === "edit" && initial) {
      setFrameworkId(initial.framework as unknown as string);
      setCode(initial.code ?? "");
      setTitle(initial.title ?? "");
      setDesc(initial.description ?? "");
      setIsMandatory(Boolean(initial.is_mandatory ?? false));
    }
  }, [mode, initial]);

  useEffect(() => {
    if (mode === "create" && !initial && !frameworkId && frameworks.length > 0) {
      setFrameworkId(frameworks[0].id);
    }
  }, [frameworks, mode, initial, frameworkId]);

  const canSave = !!frameworkId && code.trim() && title.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSave) return;

    setSaving(true);
    try {
      if (mode === "create") {
        await controlsApi.createControl({
          framework: frameworkId,
          code: code.trim(),
          title: title.trim(),
          description: desc.trim() || undefined,
          is_mandatory: isMandatory,
        });
      } else if (mode === "edit" && initial) {
        await controlsApi.updateControl(initial.id, {
          code: code.trim(),
          title: title.trim(),
          description: desc.trim() || undefined,
          is_mandatory: isMandatory,
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(errorMessage(err, "Erro ao guardar."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-2">
        <label className="text-sm font-medium">Framework</label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={frameworkId}
          onChange={(e) => setFrameworkId(e.target.value)}
          disabled={mode === "edit"}
        >
          <option value="">Selecionar framework…</option>
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
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ex: A.5.1 | ID.AM-01"
          disabled={isSystem && mode === "edit"}
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Título</label>
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título curto"
          disabled={isSystem && mode === "edit"}
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Obrigatório</label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border"
            checked={isMandatory}
            onChange={(e) => setIsMandatory(e.target.checked)}
            disabled={isSystem && mode === "edit"}
          />
          Marcar este controlo como obrigatório
        </label>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Descrição (opcional)</label>
        <textarea
          className="min-h-[110px] w-full rounded-xl border px-3 py-2 text-sm"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Notas internas (evita texto integral de standards proprietários)"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          onClick={onCancel}
        >
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
          Este controlo é do catálogo base (SYSTEM). Alguns campos podem estar bloqueados.
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

  // ✅ agora é UUID (não slug)
  const [frameworkFilter, setFrameworkFilter] = useState<string>("");

  // UI: active|archived  → API: active|deprecated
  const [statusFilter, setStatusFilter] = useState<StatusFilterUI>("active");
  const [search, setSearch] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<Mode>("create");
  const [selected, setSelected] = useState<Control | null>(null);

  const statusParam: ControlStatus =
    statusFilter === "archived" ? "deprecated" : "active";

  const reload = async () => {
    setErr(null);
    setLoading(true);
    try {
      const [fw, list] = await Promise.all([
        controlsApi.listFrameworks(),
        controlsApi.listControls({
          framework: frameworkFilter || undefined, // ✅ UUID
          status: statusParam, // ✅ active|deprecated
          search: search.trim() || undefined,
        }),
      ]);

      setFrameworks(fw);
      setControls(list);
    } catch (e: unknown) {
      setErr(errorMessage(e, "Erro ao carregar."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      reload();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkFilter, statusFilter, search]);

  const frameworkById = useMemo(() => {
    const m = new Map<string, Framework>();
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
      // Preferir endpoints dedicados se existirem; caso falhem, faz PATCH
      try {
        await controlsApi.archiveControl(c.id);
      } catch {
        await controlsApi.updateControl(c.id, { status: "deprecated" });
      }
      await reload();
    } catch (e: unknown) {
      alert(errorMessage(e, "Falha ao arquivar."));
    }
  };

  const restore = async (c: Control) => {
    if (!confirm("Restaurar este controlo?")) return;
    try {
      try {
        await controlsApi.restoreControl(c.id);
      } catch {
        await controlsApi.updateControl(c.id, { status: "active" });
      }
      await reload();
    } catch (e: unknown) {
      alert(errorMessage(e, "Falha ao restaurar."));
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
        <button
          onClick={openCreate}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          + Novo controlo
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Framework
            </label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={frameworkFilter}
              onChange={(e) => setFrameworkFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {frameworks.map((f) => (
                // ✅ value = UUID
                <option key={f.id} value={f.id}>
                  {f.name} {f.version ? `(${f.version})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Estado
            </label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterUI)}
            >
              <option value="active">Ativos</option>
              <option value="archived">Arquivados</option>
            </select>
          </div>

          <div className="md:col-span-2 grid gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pesquisa
            </label>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por ID, título…"
            />
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      )}

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
                <th className="px-4 py-3">Obrigatório</th>
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
                const fw = frameworkById.get(c.framework as unknown as string);
                const isArchived = c.status === "deprecated";
                return (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      {fw?.name ?? c.framework_name ?? "—"}
                    </td>

                    {/* ✅ ID funcional */}
                    <td className="px-4 py-3 font-mono">{c.code ?? "—"}</td>

                    <td className="px-4 py-3">{c.title}</td>

                    {/* ✅ Obrigatório */}
                    <td className="px-4 py-3">
                      {c.is_mandatory ? (
                        <Badge tone="ok">Sim</Badge>
                      ) : (
                        <Badge tone="system">Não</Badge>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={isArchived ? "archived" : "system"}>
                        {c.status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"
                          onClick={() => openEdit(c)}
                        >
                          Editar
                        </button>

                        {isArchived ? (
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
          {!loading && controls.length === 0 && (
            <div className="text-sm text-slate-600">Sem resultados.</div>
          )}

          {controls.map((c) => {
            const fw = frameworkById.get(c.framework as unknown as string);
            const isArchived = c.status === "deprecated";
            return (
              <div key={c.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">
                      {fw?.name ?? c.framework_name ?? "—"}
                    </div>
                    <div className="mt-1 font-mono text-sm">{c.code ?? "—"}</div>
                    <div className="mt-1 font-medium">{c.title}</div>

                    <div className="mt-2">
                      {c.is_mandatory ? (
                        <Badge tone="ok">Obrigatório: Sim</Badge>
                      ) : (
                        <Badge tone="system">Obrigatório: Não</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={isArchived ? "archived" : "system"}>
                      {c.status}
                    </Badge>
                  </div>
                </div>

                {c.description && (
                  <div className="mt-2 text-sm text-slate-600">
                    {c.description}
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    className="flex-1 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => openEdit(c)}
                  >
                    Editar
                  </button>

                  {isArchived ? (
                    <button
                      className="flex-1 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => restore(c)}
                    >
                      Restaurar
                    </button>
                  ) : (
                    <button
                      className="flex-1 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => archive(c)}
                    >
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
