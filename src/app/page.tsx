"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Shield } from "lucide-react";
import { ApiError, api, SESSION_EXPIRED_EVENT } from "@/lib/api-client";
import type { UserDTO } from "@/lib/types";
import { AuthView } from "@/components/AuthView";
import { StudentDashboard } from "@/components/StudentDashboard";
import { TutorDashboard } from "@/components/TutorDashboard";
import { AdminDashboard } from "@/components/AdminDashboard";
import { ToastProvider, useToast } from "@/components/toast";
import { ThemeToggle } from "@/components/ui";

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app bg-grid bg-radial-glow">
      <div className="flex flex-col items-center gap-4 fade-in">
        <div className="w-16 h-16 shield-glow rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center">
          <Shield size={30} className="text-white" strokeWidth={2.5} />
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-muted">Cargando BRIANA…</p>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [ready, setReady] = useState(false);
  const userRef = useRef<UserDTO | null>(null);
  const toast = useToast();

  const expireSession = useCallback(() => {
    if (!userRef.current) return;
    userRef.current = null;
    setUser(null);
    toast.warning(
      "Tu sesión terminó",
      "El servidor ya no reconoce esta sesión. Inicia sesión de nuevo para continuar."
    );
  }, [toast]);

  useEffect(() => {
    api<{ user: UserDTO | null }>("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        userRef.current = r.user;
        setUser(r.user);
      })
      .catch(() => {
        userRef.current = null;
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [expireSession]);

  const checkSession = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const { user: freshUser } = await api<{ user: UserDTO | null }>("/api/auth/me", { cache: "no-store" });
      if (freshUser) {
        userRef.current = freshUser;
        setUser(freshUser);
      } else {
        expireSession();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) expireSession();
    }
  }, [expireSession]);

  useEffect(() => {
    let lastCheck = 0;
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible" || !userRef.current) return;
      if (Date.now() - lastCheck < 10_000) return;
      lastCheck = Date.now();
      void checkSession();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [checkSession]);

  const acceptAuth = useCallback((nextUser: UserDTO) => {
    userRef.current = nextUser;
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      userRef.current = null;
      setUser(null);
    }
  }, []);

  if (!ready) return <Splash />;

  // Botón flotante de tema, disponible en todas las vistas (persistido en localStorage).
  const themeToggle = (
    <ThemeToggle floating placement={user ? "bottom-right" : "top-right"} />
  );

  if (!user)
    return (
      <>
        <AuthView onAuth={acceptAuth} />
        {themeToggle}
      </>
    );

  return (
    <>
      {user.role === "administrador" ? (
        <AdminDashboard user={user} onLogout={logout} />
      ) : user.role === "tutor" ? (
        <TutorDashboard user={user} onLogout={logout} />
      ) : (
        <StudentDashboard user={user} onLogout={logout} />
      )}
      {themeToggle}
    </>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
