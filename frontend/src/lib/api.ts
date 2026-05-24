function resolveApiBase() {
    const configured = import.meta.env.VITE_API_BASE ?? `${window.location.protocol}//${window.location.hostname}:8000`;
    const pageHost = window.location.hostname;

    try {
        const url = new URL(configured);
        const localPage = pageHost === "localhost" || pageHost === "127.0.0.1";
        const localApi = url.hostname === "localhost" || url.hostname === "127.0.0.1";

        if (localPage && localApi) {
            url.hostname = pageHost;
        }

        return url.origin;
    } catch {
        return configured;
    }
}

const API_BASE = resolveApiBase();



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



// Refresh deduplicado: vários 401 concorrentes partilham uma única chamada de refresh.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            try {
                await ensureCsrf();
                const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "X-CSRFToken": getCookie("csrftoken") || "" },
                });
                return res.ok;
            } catch {
                return false;
            }
        })();
        refreshInFlight.finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
}

// Endpoints de auth que NÃO despoletam refresh+retry (evita recursão infinita).
const NO_REFRESH_PATHS = ["/api/auth/login/", "/api/auth/logout/", "/api/auth/refresh/"];

// ✅ EXPORTA ISTO para poderes usar noutros ficheiros (controlsApi, etc.)

export async function request<T>(path: string, opts: RequestInit = {}, _retried = false): Promise<T> {

    const method = (opts.method || "GET").toUpperCase();
    const hasFormDataBody = typeof FormData !== "undefined" && opts.body instanceof FormData;



    // Para POST/PUT/PATCH/DELETE: garante cookie CSRF e envia X-CSRFToken

    const headers: Record<string, string> = {

        ...(hasFormDataBody ? {} : { "Content-Type": "application/json" }),

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



    // 401: tenta renovar o access token via refresh e repete o pedido uma vez.
    // Só termina a sessão se a renovação também falhar.

    if (res.status === 401) {

        const skipRefresh = NO_REFRESH_PATHS.some((p) => path.startsWith(p));

        if (!_retried && !skipRefresh) {

            const refreshed = await tryRefreshToken();

            if (refreshed) {

                return request<T>(path, opts, true);

            }

        }

        try {

            await fetch(`${API_BASE}/api/auth/logout/`, {

                method: "POST",

                credentials: "include",

                headers: { "X-CSRFToken": getCookie("csrftoken") || "" },

            });

        } catch {
            // Ignore logout failures while handling an expired session.
        }

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

export type LoginResponse = { user: { id: number; email: string; name?: string; is_staff?: boolean; is_superuser?: boolean } };



export const api = {

    login: (body: LoginPayload) =>

        request<LoginResponse>(`/api/auth/login/`, {

            method: "POST",

            body: JSON.stringify(body),

        }),

    me: () => request<LoginResponse["user"]>(`/api/auth/me/`),

    logout: () => request<void>(`/api/auth/logout/`, { method: "POST" }),

};
