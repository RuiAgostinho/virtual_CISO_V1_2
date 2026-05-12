import { AlertTriangle } from "lucide-react";

type RecoveredPlaceholderProps = {
  title: string;
};

export default function RecoveredPlaceholder({ title }: RecoveredPlaceholderProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      <section className="rounded-2xl border border-amber-100 bg-amber-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              Recuperacao parcial
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-600">
              Esta rota existia na versao perdida, mas o ficheiro original nao apareceu nos registos locais
              recuperaveis. A entrada fica preservada para a aplicacao arrancar enquanto reconstruimos o ecran.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
