import { useState } from "react";
import { ShieldCheck, Lock, Users, Plus, Edit2 } from "lucide-react";

const MOCK_ROLES = [
  { id: 1, name: "CISO", description: "Acesso total a todas as funcionalidades de governance, risco e definições.", usersCount: 1, isSystem: true },
  { id: 2, name: "Security Analyst", description: "Acesso de leitura e escrita a riscos, vulnerabilidades e ativos.", usersCount: 3, isSystem: false },
  { id: 3, name: "Admin", description: "Gestão de utilizadores, sistema e configurações técnicas.", usersCount: 2, isSystem: true },
  { id: 4, name: "Auditor", description: "Acesso apenas de leitura a relatórios, conformidade e dashboards.", usersCount: 4, isSystem: false },
  { id: 5, name: "IT Manager", description: "Gestão de ativos e infraestrutura, reporte de vulnerabilidades.", usersCount: 2, isSystem: false },
];

export default function Roles() {
  const [roles] = useState(MOCK_ROLES);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Administração</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Perfis e Permissões</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Gestão de perfis de acesso baseados em funções (RBAC), controlando o que cada utilizador pode ver ou editar.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors">
              <Plus className="h-4 w-4" />
              Novo Perfil
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{roles.length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de Perfis</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Lock className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{roles.filter(r => r.isSystem).length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Perfis de Sistema (Inalteráveis)</p>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <div key={role.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-950">{role.name}</h3>
              </div>
              {role.isSystem && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Sistema</span>
              )}
            </div>
            
            <p className="mt-2 flex-1 text-sm text-slate-500">{role.description}</p>

            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <Users className="h-4 w-4 text-slate-400" />
                {role.usersCount} Utilizadores
              </div>
              <button 
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                disabled={role.isSystem}
                title={role.isSystem ? "Perfis de sistema não podem ser editados" : "Editar perfil"}
              >
                <Edit2 className="h-3 w-3" />
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
