import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";


type User = { id: number; email: string; name?: string; is_staff?: boolean; is_superuser?: boolean } | null;


type Ctx = {
    user: User;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
};


const AuthCtx = createContext<Ctx | null>(null);


export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        (async () => {
            try { setUser(await api.me()); } catch { setUser(null); } finally { setLoading(false); }
        })();
    }, []);


    async function login(email: string, password: string) {
        const res = await api.login({ email, password });
        setUser(res.user);
    }
    async function logout() {
        await api.logout();
        setUser(null);
    }


    return (
        <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>
    );
}

// Hook colocada aqui para manter compatibilidade com os imports existentes.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const v = useContext(AuthCtx);
    if (!v) throw new Error("useAuth must be used within <AuthProvider>");
    return v;
}
