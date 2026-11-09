"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

type Tone = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  tone: Tone;
  titulo: string;
  message?: string;
}

interface ToastApi {
  show: (t: { tone?: Tone; titulo: string; message?: string; duration?: number }) => void;
  success: (titulo: string, message?: string) => void;
  error: (titulo: string, message?: string) => void;
  info: (titulo: string, message?: string) => void;
  warning: (titulo: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const ICON_COLORS: Record<Tone, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-cyan-500",
  warning: "text-amber-500",
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const Icon = ICONS[item.tone];
  return (
    <div
      role="status"
      className={`toast-in pointer-events-auto card p-4 flex items-start gap-3 toast-glow-${item.tone}`}
    >
      <div className={`mt-0.5 flex-shrink-0 ${ICON_COLORS[item.tone]}`}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-ink leading-snug">{item.titulo}</p>
        {item.message && <p className="text-xs text-muted mt-1 leading-relaxed break-words">{item.message}</p>}
      </div>
      <button
        onClick={onClose}
        aria-label="Cerrar notificación"
        className="text-muted2 hover:text-ink transition flex-shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    ({ tone = "info", titulo, message, duration = 6000 }) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev.slice(-4), { id, tone, titulo, message }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (titulo, message) => show({ tone: "success", titulo, message }),
      error: (titulo, message) => show({ tone: "error", titulo, message, duration: 8000 }),
      info: (titulo, message) => show({ tone: "info", titulo, message }),
      warning: (titulo, message) => show({ tone: "warning", titulo, message, duration: 8000 }),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
