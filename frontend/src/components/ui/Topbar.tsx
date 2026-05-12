import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

type Props = {
  onOpenMenu: () => void;
};

export default function Topbar({ onOpenMenu }: Props) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const userLabel = user?.name ?? user?.email ?? "utilizador";

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b bg-white/90 backdrop-blur">
      <div className="flex h-full w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm lg:hidden"
            onClick={onOpenMenu}
            aria-label="Abrir menu"
          >
            ☰
          </button>

          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
              🛡️
            </div>
            <div className="leading-tight">
              <div className="font-semibold">Virtual CISO</div>
              <div className="text-xs text-slate-500">Plataforma</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <input
              className="w-72 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Pesquisar..."
            />
          </div>

          <div className="hidden sm:block text-sm text-slate-600">{userLabel}</div>

          <button
            onClick={handleLogout}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}