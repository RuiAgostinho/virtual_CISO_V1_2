import type { ElementType } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, FileCheck2, LayoutDashboard, ListChecks, ShieldAlert } from "lucide-react";
import { buildVulnerabilityOccurrenceUrl } from "@/lib/cisoNavigation";

export type CisoDecisionStage = "overview" | "prioritization" | "vulnerabilities" | "decision";

type Step = {
    id: CisoDecisionStage;
    label: string;
    detail: string;
    to: string;
    icon: ElementType;
};

const steps: Step[] = [
    {
        id: "overview",
        label: "Painel",
        detail: "Sinais consolidados",
        to: "/mission-control",
        icon: LayoutDashboard,
    },
    {
        id: "prioritization",
        label: "Priorizar",
        detail: "Fila contextual",
        to: "/risks/prioritization",
        icon: ListChecks,
    },
    {
        id: "vulnerabilities",
        label: "Validar ocorrência",
        detail: "Contexto técnico",
        to: buildVulnerabilityOccurrenceUrl({ status: "Open" }),
        icon: ShieldAlert,
    },
    {
        id: "decision",
        label: "Decidir e evidenciar",
        detail: "Registo auditável",
        to: buildVulnerabilityOccurrenceUrl({ status: "In remediation" }),
        icon: FileCheck2,
    },
];

export default function CisoDecisionFlow({
    current,
    className = "",
}: {
    current: CisoDecisionStage;
    className?: string;
}) {
    const currentIndex = Math.max(0, steps.findIndex((step) => step.id === current));

    return (
        <nav
            aria-label="Fluxo de decisão do CISO"
            className={`rounded-2xl border border-slate-100 bg-white p-3 shadow-sm ${className}`}
        >
            <div className="flex gap-2 overflow-x-auto">
                {steps.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = step.id === current;
                    const isComplete = index < currentIndex;

                    return (
                        <div key={step.id} className="flex min-w-[210px] flex-1 items-center gap-2">
                            <Link
                                to={step.to}
                                aria-current={isActive ? "step" : undefined}
                                className={`group flex min-h-[68px] flex-1 items-center gap-3 rounded-xl border px-3 py-3 transition-all ${
                                    isActive
                                        ? "border-slate-900 bg-slate-950 text-white shadow-sm"
                                        : isComplete
                                          ? "border-emerald-100 bg-emerald-50 text-emerald-900 hover:border-emerald-200"
                                          : "border-slate-100 bg-slate-50 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800"
                                }`}
                            >
                                <span
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                                        isActive
                                            ? "border-white/20 bg-white/10 text-white"
                                            : isComplete
                                              ? "border-emerald-200 bg-white text-emerald-600"
                                              : "border-slate-200 bg-white text-slate-400 group-hover:text-indigo-600"
                                    }`}
                                >
                                    {isComplete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[10px] font-black uppercase tracking-widest opacity-70">
                                        Passo {index + 1}
                                    </span>
                                    <span className="block truncate text-sm font-black">{step.label}</span>
                                    <span className={`block truncate text-xs font-semibold ${isActive ? "text-white/70" : "opacity-60"}`}>
                                        {step.detail}
                                    </span>
                                </span>
                            </Link>
                            {index < steps.length - 1 && (
                                <ChevronRight className="hidden h-5 w-5 shrink-0 text-slate-300 xl:block" />
                            )}
                        </div>
                    );
                })}
            </div>
        </nav>
    );
}