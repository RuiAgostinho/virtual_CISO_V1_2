import { useState } from "react";
import { Shield, Bell, Globe, Database, Save, RefreshCw } from "lucide-react";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("general");

  const tabs = [
    { id: "general", label: "Geral", icon: Globe },
    { id: "security", label: "Segurança", icon: Shield },
    { id: "notifications", label: "Notificações", icon: Bell },
    { id: "database", label: "Base de Dados", icon: Database },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Administração</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Configurações do Sistema</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Personalização da plataforma, gestão de segurança global e preferências de sistema.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-indigo-700 transition-colors">
              <RefreshCw className="h-4 w-4" />
              Resetar
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-indigo-800 transition-colors">
              <Save className="h-4 w-4" />
              Guardar Configurações
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-indigo-50 text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Content Area */}
        <main className="flex-1 space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
            {activeTab === "general" && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-slate-950">Definições Gerais</h2>
                  <p className="text-sm text-slate-500">Identidade visual e preferências regionais.</p>
                </div>
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome da Organização</label>
                    <input type="text" defaultValue="Virtual CISO Demo" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-500 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Idioma do Sistema</label>
                    <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-500 transition-all">
                      <option>Português (PT)</option>
                      <option>English (US)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === "security" && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-slate-950">Segurança Global</h2>
                  <p className="text-sm text-slate-500">Políticas de autenticação e sessão.</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Autenticação de Dois Factores (MFA)</p>
                      <p className="text-xs text-slate-500">Exigir MFA para todos os utilizadores administradores.</p>
                    </div>
                    <div className="h-6 w-10 rounded-full bg-emerald-500 relative cursor-pointer">
                      <div className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Tempo de Sessão</p>
                      <p className="text-xs text-slate-500">Duração máxima da sessão antes de expirar (minutos).</p>
                    </div>
                    <input type="number" defaultValue={60} className="w-20 rounded-lg border border-slate-200 p-2 text-right text-sm outline-none" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="flex h-48 items-center justify-center text-slate-400 italic text-sm">
                Configurações de notificações em desenvolvimento...
              </div>
            )}

            {activeTab === "database" && (
              <div className="flex h-48 items-center justify-center text-slate-400 italic text-sm">
                Configurações de base de dados em desenvolvimento...
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
