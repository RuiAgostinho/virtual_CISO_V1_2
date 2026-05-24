import { useState } from "react";
import { AlertTriangle, FileCheck2, Loader2, X } from "lucide-react";
import { controlsApi } from "@/lib/controlsApi";

interface AddEvidenceModalProps {
  open: boolean;
  controlMechanismId: string;
  onClose: () => void;
  onAdded: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AddEvidenceModal({ open, controlMechanismId, onClose, onAdded }: AddEvidenceModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) {
      setError("Indique um titulo para a evidencia.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await controlsApi.addMechanismEvidence(controlMechanismId, {
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim() || null,
      });
      setTitle("");
      setDescription("");
      setUrl("");
      onAdded();
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel adicionar a evidencia."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar evidencia" className="absolute inset-0 bg-slate-950/40" onClick={onClose} />
      <section className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Evidencia</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Adicionar evidencia</h2>
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
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Titulo</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Descricao</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">URL ou referencia</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
            Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}
