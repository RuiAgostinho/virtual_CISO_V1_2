//import React from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, Shield } from "lucide-react";


export default function Header() {
    const { user, logout } = useAuth();
    const nav = useNavigate();


    async function onLogout() {
        try { await logout(); } finally { nav("/login", { replace: true }); }
    }


    return (
        <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2">
                    <div className="size-8 rounded-xl bg-gray-900 text-white grid place-items-center"><Shield className="w-4 h-4" /></div>
                    <span className="font-semibold">Virtual CISO</span>
                </Link>
                <div className="flex items-center gap-3">
                    {user && <span className="text-sm text-gray-600">{user.name || user.email}</span>}
                    <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm border hover:bg-gray-50">
                        <LogOut className="w-4 h-4" /> Sair
                    </button>
                </div>
            </div>
        </header>
    );
}