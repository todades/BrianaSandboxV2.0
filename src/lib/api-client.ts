"use client";

export const SESSION_EXPIRED_EVENT = "briana:session-expired";
const EMBEDDED_SESSION_KEY = "briana-embedded-session";

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown> | null;
  constructor(status: number, message: string, data: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function isEmbeddedFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function readEmbeddedToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(EMBEDDED_SESSION_KEY);
  } catch {
    return null;
  }
}

function clearEmbeddedToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(EMBEDDED_SESSION_KEY);
  } catch {
    /* El almacenamiento puede estar deshabilitado por el navegador. */
  }
}

function storesAuthToken(url: string): boolean {
  return url.endsWith("/api/auth/login") || url.endsWith("/api/auth/verify");
}

function needsBearerToken(url: string): boolean {
  return !url.startsWith("/api/auth/") || url.endsWith("/api/auth/me") || url.endsWith("/api/auth/logout");
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const embedded = isEmbeddedFrame();
  const requestHeaders = new Headers(init?.headers);
  if (embedded) {
    requestHeaders.set("X-Briana-Embedded", "1");
    const token = readEmbeddedToken();
    if (token && needsBearerToken(url)) requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: requestHeaders,
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }

  if (!res.ok) {
    let msg = `Error HTTP ${res.status}`;
    if (data && typeof data === "object" && "error" in data) {
      msg = String((data as { error: unknown }).error);
    }

    // Una respuesta protegida 401 invalida el estado visual y el fallback local.
    const isAuthEndpoint = url.startsWith("/api/auth/");
    if (res.status === 401 && !isAuthEndpoint && typeof window !== "undefined") {
      clearEmbeddedToken();
      window.dispatchEvent(
        new CustomEvent(SESSION_EXPIRED_EVENT, {
          detail: { message: "Tu sesión venció o dejó de ser válida. Inicia sesión otra vez." },
        })
      );
    }

    throw new ApiError(res.status, msg, data && typeof data === "object" ? (data as Record<string, unknown>) : null);
  }

  if (typeof window !== "undefined" && data && typeof data === "object") {
    const sessionToken = (data as { sessionToken?: unknown }).sessionToken;
    if (embedded && storesAuthToken(url) && typeof sessionToken === "string" && sessionToken.length > 20) {
      try {
        window.sessionStorage.setItem(EMBEDDED_SESSION_KEY, sessionToken);
      } catch {
        /* Si sessionStorage está bloqueado, la cookie HttpOnly sigue siendo el mecanismo normal. */
      }
    }
    if (url.endsWith("/api/auth/logout")) clearEmbeddedToken();
  }

  return data as T;
}

export function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  return api<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function postForm<T>(url: string, form: FormData): Promise<T> {
  return api<T>(url, { method: "POST", body: form });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
