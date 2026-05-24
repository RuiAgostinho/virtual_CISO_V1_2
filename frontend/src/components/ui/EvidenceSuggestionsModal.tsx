import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  controlsApi,
  type ControlMechanism,
  type EvidenceSuggestion,
  type EvidenceSuggestionResponse,
} from "@/lib/controlsApi";

interface EvidenceSuggestionsModalProps {
  open: boolean;
  controlMechanism: ControlMechanism | null;
  onClose: () => void;
  onApplied: () => void;
}

function confidenceTone(confidence: number) {
  if (confidence >= 0.8) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (confidence >= 0.65) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.8) return "Alta";
  if (confidence >= 0.65) return "Media";
  return "Baixa";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function EvidenceSuggestionsModal({
  open,
  controlMechanism,
  onClose,
  onApplied,
}: EvidenceSuggestionsModalProps) {
  const [data, setData] = useState<EvidenceSuggestionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    if (!controlMechanism) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await controlsApi.getEvidenceSuggestions(controlMechanism.id);
      setData(response);
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel obter sugestoes de evidencia."));
    } finally {
      setLoading(false);
    }
  }, [controlMechanism]);

  useEffect(() => {
    if (open && controlMechanism) {
      void loadSuggestions();
    } else {
      setData(null);
      setError(null);
      setSuccessMessage(null);
      setApplyingId(null);
    }
  }, [controlMechanism, loadSuggestions, open]);

  if (!open || !controlMechanism) return null;

  const suggestions = data?.suggestions || [];

  const applySuggestion = async (suggestion: EvidenceSuggestion) => {
    setApplyingId(suggestion.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await controlsApi.applyEvidenceSuggestion(controlMechanism.id, suggestion.id);
      setSuccessMessage("Evidencia associada ao mecanismo com validacao do CISO.");
      onApplied();
      await loadSuggestions();
    } catch (err: unknown) {
      console.error(err);
      setError(getErrorMessage(err, "Nao foi possivel associar esta evidencia."));
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar sugestoes"
        className="absolute inset-0 bg-slate-950/40"
        onClick={onClose}
      />

      <section className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Sugestoes automaticas
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-950">Atribuir evidencias ao mecanismo</h2>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
              {controlMechanism.mechanism_title || "Mecanismo"} em {controlMechanism.control_code || "--"}.
              As sugestoes so sao associadas depois de aprovadas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-slate-400">
              <Loader2 className="mb-3 h-9 w-9 animate-spin" />
              <p className="text-xs font-bold uppercase tracking-wide">A procurar evidencias candidatas...</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-8 text-center">
              <FileCheck2 className="mx-auto h-11 w-11 text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-950">Sem sugestoes automaticas</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Nao foram encontrados documentos, inventario, telemetria ou historico operacional suficientes para este mecanismo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion) => {
                const applying = applyingId === suggestion.id;
                const disabled = applying || suggestion.already_attached;

                return (
                  <article key={suggestion.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${confidenceTone(suggestion.confidence)}`}>
                            {confidenceLabel(suggestion.confidence)} {Math.round(suggestion.confidence * 100)}%
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {suggestion.source_label}
                          </span>
                          {suggestion.already_attached && (
                            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                              Ja associada
                            </span>
                          )}
                        </div>

                        <h3 className="mt-3 text-base font-bold text-slate-950">{suggestion.title}</h3>
                        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">{suggestion.description}</p>
                        <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-500">
                          {suggestion.rationale}
                        </p>
                        {suggestion.url && (
                          <a
                            href={suggestion.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-600 hover:text-indigo-800"
                          >
                            Abrir fonte <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => applySuggestion(suggestion)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {suggestion.already_attached ? "Associada" : "Aprovar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">
            A criacao da evidencia fica registada como sugestao automatica validada pelo CISO.
          </p>
          <button
            type="button"
            onClick={() => void loadSuggestions()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 transition-all hover:border-slate-300 hover:text-slate-950 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar sugestoes
          </button>
        </footer>
      </section>
    </div>
  );
}
