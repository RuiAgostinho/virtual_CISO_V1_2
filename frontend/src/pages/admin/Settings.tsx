import { useCallback, useEffect, useState } from "react";
import { Bell, Database, Globe, RefreshCw, Save, Shield } from "lucide-react";
import { companyApi, type CompanyProfile } from "@/lib/companyApi";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState("general");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [institutionalOnboardingRequired, setInstitutionalOnboardingRequired] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tabs = [
    { id: "general", label: "Geral", icon: Globe },
    { id: "security", label: "Seguranca", icon: Shield },
    { id: "notifications", label: "Notificacoes", icon: Bell },
    { id: "database", label: "Base de Dados", icon: Database },
  ];

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    setError(null);
    try {
      const loadedProfile = await companyApi.getProfile();
      setProfile(loadedProfile);
      setOrganizationName(loadedProfile.legal_name || "");
      setInstitutionalOnboardingRequired(Boolean(loadedProfile.institutional_onboarding_required));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Nao foi possivel carregar os parametros da plataforma."));
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updatedProfile = await companyApi.updateProfile({
        legal_name: organizationName.trim() || profile?.legal_name || "Virtual CISO",
        institutional_onboarding_required: institutionalOnboardingRequired,
      });

      setProfile(updatedProfile);
      setOrganizationName(updatedProfile.legal_name || "");
      setInstitutionalOnboardingRequired(Boolean(updatedProfile.institutional_onboarding_required));
      window.dispatchEvent(
        new CustomEvent("institutional-onboarding-required-changed", {
          detail: { required: Boolean(updatedProfile.institutional_onboarding_required) },
        }),
      );
      setMessage("Parametros guardados com sucesso.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Nao foi possivel guardar os parametros da plataforma."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      <header className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Administracao</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Parametros da plataforma</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Configuracao global da instancia, incluindo parametros usados para testar fluxos de onboarding.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadProfile()}
              disabled={loadingProfile || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={loadingProfile || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "A guardar..." : "Guardar parametros"}
            </button>
          </div>
        </div>
      </header>

      {message && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full space-y-1 lg:w-64">
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

        <main className="flex-1 space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
            {activeTab === "general" && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-slate-950">Definicoes gerais</h2>
                  <p className="text-sm text-slate-500">
                    Identidade da organizacao e parametros operacionais da instancia.
                  </p>
                </div>

                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nome da organizacao</label>
                    <input
                      type="text"
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      disabled={loadingProfile}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none transition-all focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  <div className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-950">Forcar onboarding institucional</p>
                      <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
                        Quando ativo, o CISO e encaminhado para o wizard de onboarding da organizacao no proximo acesso.
                        Ao concluir o wizard, este parametro volta automaticamente a desligado.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInstitutionalOnboardingRequired((current) => !current)}
                      disabled={loadingProfile}
                      aria-pressed={institutionalOnboardingRequired}
                      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        institutionalOnboardingRequired ? "bg-indigo-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                          institutionalOnboardingRequired ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Idioma do sistema</label>
                    <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none transition-all focus:border-indigo-500">
                      <option>Portugues (PT)</option>
                      <option>English (US)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-slate-950">Seguranca global</h2>
                  <p className="text-sm text-slate-500">Politicas de autenticacao e sessao.</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Autenticacao de dois factores (MFA)</p>
                      <p className="text-xs text-slate-500">Exigir MFA para todos os utilizadores administradores.</p>
                    </div>
                    <div className="relative h-6 w-10 cursor-pointer rounded-full bg-emerald-500">
                      <div className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Tempo de sessao</p>
                      <p className="text-xs text-slate-500">Duracao maxima da sessao antes de expirar (minutos).</p>
                    </div>
                    <input type="number" defaultValue={60} className="w-20 rounded-lg border border-slate-200 p-2 text-right text-sm outline-none" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="flex h-48 items-center justify-center text-sm italic text-slate-400">
                Configuracoes de notificacoes em desenvolvimento...
              </div>
            )}

            {activeTab === "database" && (
              <div className="flex h-48 items-center justify-center text-sm italic text-slate-400">
                Configuracoes de base de dados em desenvolvimento...
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
