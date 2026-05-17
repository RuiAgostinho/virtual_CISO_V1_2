import { useState, useMemo } from "react";
import { Users as UsersIcon, UserPlus, Search, ShieldCheck, Mail, Calendar, MoreVertical, Target } from "lucide-react";

// Mock data for users since there are no user management endpoints yet
const MOCK_USERS = [
  { id: 1, name: "Rui Agostinho", email: "rui.agostinho@virtualciso.pt", role: "CISO", status: "active", lastLogin: "2026-05-15T14:30:00Z" },
  { id: 2, name: "Maria Silva", email: "maria.silva@virtualciso.pt", role: "Security Analyst", status: "active", lastLogin: "2026-05-14T09:15:00Z" },
  { id: 3, name: "João Santos", email: "joao.santos@virtualciso.pt", role: "Admin", status: "inactive", lastLogin: "2026-04-20T16:45:00Z" },
  { id: 4, name: "Ana Costa", email: "ana.costa@virtualciso.pt", role: "Auditor", status: "active", lastLogin: "2026-05-10T11:20:00Z" },
  { id: 5, name: "Carlos Ferreira", email: "carlos.f@virtualciso.pt", role: "IT Manager", status: "active", lastLogin: "2026-05-15T08:00:00Z" },
];

export default function Users() {
  const [search, setSearch] = useState("");
  const [users] = useState(MOCK_USERS);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const lower = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower) ||
        u.role.toLowerCase().includes(lower)
    );
  }, [search, users]);

  const metrics = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.status === "active").length,
    admins: users.filter(u => u.role === "Admin" || u.role === "CISO").length,
  }), [users]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Administração</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Gestão de Utilizadores</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Controlo de acessos, contas de utilizadores e atribuição de perfis de segurança na plataforma.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors">
              <UserPlus className="h-4 w-4" />
              Convidar Utilizador
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <UsersIcon className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.total}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total de Contas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.active}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Contas Ativas</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Target className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{metrics.admins}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Administradores / CISO</p>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, email ou perfil..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <UsersIcon className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-slate-400">Nenhum utilizador encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Utilizador</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Email</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Perfil</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Estado</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Último Login</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {u.name.split(" ").map(n => n[0]).join("").substring(0, 2)}
                        </div>
                        <span className="font-semibold text-slate-950">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600 font-medium">
                        <Mail className="h-4 w-4 text-slate-400" />
                        {u.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        u.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {u.status === "active" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {new Date(u.lastLogin).toLocaleDateString("pt-PT")}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
