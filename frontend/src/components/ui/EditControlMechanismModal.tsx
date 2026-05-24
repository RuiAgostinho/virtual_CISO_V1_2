import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, X } from "lucide-react";
import { controlsApi, type ControlMechanism } from "@/lib/controlsApi";

interface EditControlMechanismModalProps {
  open: boolean;
  controlMechanism: ControlMechanism | null;
  onClose: () => void;
  onUpdated: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function EditControlMechanismModal({
  open,
  controlMechanism,
  onClose,
  onUpdated,
}: EditControlMechanismModalProps) {
  const [status, setStatus] = useState("Nao iniciado");
  const [responsible, setResponsible] = useState("");
  const [deadline, setDeadline] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!controlMechanism) return;
    setStatus(controlMechanism.status || "Nao iniciado");
    setResponsible(controlMechanism.responsible || "");
    setDeadline(controlMechanism.deadline || "");
    setAcceptanceCriteria(controlMechanism.acceptance_criteria || "");
    setError(null);
  }, [controlMechanism]);

  if (!open || !controlMechanism) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await controlsApi.updateControlMechanism(controlMechanism.id, {
        status,
        responsible: responsible.trim() || null,
        deadline: deadline || null,
        acceptance_criteria: acceptanceCriteria.trim() || null,
      });
      onUpdated();
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel atualizar o mecanismo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar estado" className="absolute inset-0 bg-slate-950/40" onClick={onClose} />
      <section className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Mecanismo</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Editar estado</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{controlMechanism.mechanism_title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estado</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="Nao iniciado">Nao iniciado</option>
              <option value="Em implementacao">Em implementacao</option>
              <option value="Implementado">Implementado</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Responsavel</span>
            <input
              value={responsible}
              onChange={(event) => setResponsible(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Prazo</span>
            <input
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Criterios de aceitacao</span>
            <textarea
              value={acceptanceCriteria}
              onChange={(event) => setAcceptanceCriteria(event.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}
