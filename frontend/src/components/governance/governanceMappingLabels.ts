export function mappingStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    pending_review: "Pendente de revisão",
    approved: "Aprovado",
    rejected: "Rejeitado",
    deprecated: "Descontinuado",
  };
  return labels[status || ""] || status || "Sem estado";
}

export function mappingSourceLabel(source?: string) {
  const labels: Record<string, string> = {
    manual: "Manual",
    migrated: "Migrado",
    imported: "Importado",
    ai_suggested: "Sugerido por IA",
    rule_based: "Baseado em regras",
    template: "Modelo",
  };
  return labels[source || ""] || source || "Sem origem";
}

export function mappingStatusTone(status?: string) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "draft") return "border-slate-200 bg-slate-50 text-slate-600";
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-700";
  if (status === "deprecated") return "border-zinc-300 bg-zinc-100 text-zinc-600";
  return "border-slate-200 bg-white text-slate-600";
}

export function mappingSourceTone(source?: string) {
  if (source === "manual") return "border-indigo-100 bg-indigo-50 text-indigo-700";
  if (source === "migrated") return "border-blue-100 bg-blue-50 text-blue-700";
  if (source === "ai_suggested") return "border-violet-100 bg-violet-50 text-violet-700";
  if (source === "rule_based") return "border-cyan-100 bg-cyan-50 text-cyan-700";
  if (source === "template") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}
