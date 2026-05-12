const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

function getCookie(name: string) {
    return document.cookie
        .split("; ")
        .find((r) => r.startsWith(name + "="))
        ?.split("=")[1];
}

// Pede o cookie csrftoken se ainda não existir
export async function ensureCsrf(): Promise<void> {
    if (!getCookie("csrftoken")) {
        await fetch(`${API_BASE}/api/auth/csrf/`, { credentials: "include" });
    }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const method = (opts.method || "GET").toUpperCase();

    // Para POST/PUT/PATCH/DELETE: garante cookie CSRF e envia X-CSRFToken
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(opts.headers as Record<string, string> | undefined),
    };
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        await ensureCsrf();
        const csrftoken = getCookie("csrftoken");
        if (csrftoken) headers["X-CSRFToken"] = csrftoken;
    }

    const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...opts,
        headers,
    });

    // Se o token expirou, volta ao /login
    if (res.status === 401) {
        try {
            await fetch(`${API_BASE}/api/auth/logout/`, {
                method: "POST",
                credentials: "include",
                headers: { "X-CSRFToken": getCookie("csrftoken") || "" },
            });
        } catch { }
        if (window.location.pathname !== "/login") {
            window.location.href = "/login";
        }
        throw new Error("Não autorizado (401)");
    }

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }

    // Alguns endpoints podem devolver 204; tenta JSON só se houver corpo
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return (await res.json()) as T;
    const bodyText = await res.text();
    return (bodyText ? (JSON.parse(bodyText) as T) : (undefined as unknown as T));
}

export type LoginPayload = { email: string; password: string };
export type LoginResponse = { user: { id: number; email: string; name?: string } };

export const api = {
    login: (body: LoginPayload) =>
        request<LoginResponse>(`/api/auth/login/`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    me: () => request<LoginResponse["user"]>(`/api/auth/me/`),
    logout: () => request<void>(`/api/auth/logout/`, { method: "POST" }),
};
