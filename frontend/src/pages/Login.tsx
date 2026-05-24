import React, { useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'

import { useAuth } from "@/auth/AuthProvider";

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export default function Login() {
    const nav = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [remember, setRemember] = useState(true)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { login } = useAuth();

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!email || !password) { setError("Preenche email e password."); return; }
        setLoading(true);
        try {
            await login(email, password); // chama Django via api.ts
            nav("/dashboard", { replace: true });
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Falha na autenticação."));
        } finally { setLoading(false); }
    }

    return (
        <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
            <Card className="w-full max-w-md rounded-2xl shadow">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2 size-12 rounded-2xl bg-gray-900 text-white grid place-items-center">
                        <Shield className="w-6 h-6" />
                    </div>
                    <CardTitle className="text-xl">Virtual CISO</CardTitle>
                    <p className="text-sm text-muted-foreground">Inicia sessão para continuar</p>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="grid gap-4">
                        {error && (
                            <div className="text-sm rounded-xl p-3 bg-red-100 text-red-700">{error}</div>
                        )}
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Password</Label>
                                <Link to="#" className="text-xs text-gray-500 hover:underline">Esqueceste-te?</Link>
                            </div>
                            <div className="relative">
                                <Input id="password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800">
                                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>


                        <div className="flex items-center justify-between">
                            {/* shadcn checkbox (se instalado) */}
                            <div className="flex items-center gap-2">
                                <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                                <Label htmlFor="remember" className="text-sm">Lembrar sessão</Label>
                            </div>
                            <span className="text-xs text-gray-500">v0.1.0</span>
                        </div>


                        <Button type="submit" className="rounded-2xl" disabled={loading}>
                            {loading ? 'A entrar…' : 'Entrar'}
                        </Button>


                        <div className="text-xs text-gray-500 text-center">Ao continuar, aceitas os termos e a política de privacidade.</div>
                    </form>


                    <div className="mt-6 grid gap-2">
                        <Button variant="outline" className="w-full rounded-2xl" type="button">Continuar com Azure AD</Button>
                        <Button variant="outline" className="w-full rounded-2xl" type="button">Continuar com Google</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
