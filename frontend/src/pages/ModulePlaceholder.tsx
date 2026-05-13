import { AlertTriangle } from "lucide-react";

type ModulePlaceholderProps = {
  title: string;
};

export default function ModulePlaceholder({ title }: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      <section className="rounded-2xl border border-amber-100 bg-amber-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              Modulo em desenvolvimento
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-600">
              Esta area faz parte do roteiro funcional da aplicacao e sera disponibilizada quando o ecran
              estiver concluido.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
