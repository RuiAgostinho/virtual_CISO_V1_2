import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";


type User = { id: number; email: string; name?: string } | null;


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
            try { setUser(await api.me()); } catch { } finally { setLoading(false); }
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


export function useAuth() {
    const v = useContext(AuthCtx);
    if (!v) throw new Error("useAuth must be used within <AuthProvider>");
    return v;
}