import { useState, useMemo } from "react";
import { ListFilter, Search, RefreshCw, FileText, User, Clock, ShieldAlert, Target } from "lucide-react";

const MOCK_LOGS = [
  { id: 1, user: "Rui Agostinho", action: "Login efetuado", target: "Sistema", module: "Auth", status: "success", timestamp: "2026-05-15T14:30:00Z" },
  { id: 2, user: "Maria Silva", action: "Criou novo ativo", target: "Servidor Produção", module: "Assets", status: "success", timestamp: "2026-05-15T14:15:00Z" },
  { id: 3, user: "Sistema", action: "Tentativa de login falhada", target: "Admin", module: "Auth", status: "warning", timestamp: "2026-05-15T13:45:00Z" },
  { id: 4, user: "Rui Agostinho", action: "Alterou configurações NIS2", target: "Contexto Regulatório", module: "Governance", status: "success", timestamp: "2026-05-15T12:20:00Z" },
  { id: 5, user: "João Santos", action: "Eliminou utilizador", target: "Pedro Lima", module: "Admin", status: "danger", timestamp: "2026-05-15T11:00:00Z" },
  { id: 6, user: "Sistema", action: "Backup automático concluído", target: "DB_Main", module: "Core", status: "success", timestamp: "2026-05-15T04:00:00Z" },
];

export default function Logs() {
  const [search, setSearch] = useState("");
  const [logs] = useState(MOCK_LOGS);

  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const lower = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.user.toLowerCase().includes(lower) ||
        l.action.toLowerCase().includes(lower) ||
        l.target.toLowerCase().includes(lower) ||
        l.module.toLowerCase().includes(lower)
    );
  }, [search, logs]);

  const statusTone = (status: string) => {
    if (status === "success") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (status === "warning") return "bg-amber-50 text-amber-700 border-amber-100";
    if (status === "danger") return "bg-red-50 text-red-700 border-red-100";
    return "bg-slate-50 text-slate-700 border-slate-100";
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Administração</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Auditoria e Logs</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Registo detalhado de todas as atividades críticas e eventos de segurança realizados na plataforma.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors">
              <FileText className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Clock className="h-5 w-5 text-indigo-700" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{logs.length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Eventos Hoje</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">{logs.filter(l => l.status !== "success").length}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Alertas/Avisos</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Target className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-3xl font-bold text-slate-950">100%</p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Integridade de Logs</p>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar utilizador, ação ou alvo..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
          </div>
          <button className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-700">
            <ListFilter className="h-4 w-4" />
            Filtros Avançados
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Timestamp</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Utilizador</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Ação / Alvo</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs">Módulo</th>
                <th className="px-6 py-4 font-bold uppercase tracking-wide text-slate-400 text-xs text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-950">{new Date(log.timestamp).toLocaleTimeString("pt-PT")}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-bold">{new Date(log.timestamp).toLocaleDateString("pt-PT")}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center">
                        <User className="h-3 w-3 text-slate-500" />
                      </div>
                      <span className="font-semibold text-slate-700">{log.user}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900">{log.action}</span>
                      <span className="text-xs text-slate-500">{log.target}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                      {log.module}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone(log.status)}`}>
                      {log.status === "success" ? "Sucesso" : log.status === "warning" ? "Aviso" : "Perigo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
