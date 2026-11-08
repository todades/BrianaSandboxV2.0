"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  GraduationCap,
  ShieldCheck,
  UserCog,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
  Moon,
  Sun,
} from "lucide-react";
import { ROLE_LABEL, STATUS_META, type ProjectStatus, type Role } from "@/lib/constants";
import { isValidVenezuelanPhone } from "@/lib/validation";

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */
export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-9 h-9 text-lg" : "w-11 h-11 text-xl";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${dim} shield-glow rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center font-black text-white`}
      >
        B
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-lg font-black tracking-wider text-ink">BRIANA</span>
        <span className="text-[0.6rem] uppercase tracking-[0.25em] text-cyan-500 mt-0.5">Repositorio IA</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Theme toggle (persistente en localStorage)                          */
/* ------------------------------------------------------------------ */
export function ThemeToggle({
  floating = false,
  placement = "top-right",
}: {
  floating?: boolean;
  placement?: "top-right" | "bottom-right";
}) {
  // El icono se controla por CSS según la clase real de <html>: sin estado,
  // sin desincronización de hidratación y siempre refleja el tema activo.
  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("briana-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  const position = floating
    ? placement === "top-right"
      ? "fixed top-4 right-4 z-50"
      : "fixed bottom-5 right-5 z-50"
    : "";

  return (
    <button
      type="button"
      onClick={toggle}
      title="Alternar modo claro / oscuro"
      aria-label="Cambiar tema"
      className={`${position} w-11 h-11 rounded-full bg-card2 border border-line shadow-lg flex items-center justify-center text-muted hover:text-cyan-500 hover:border-cyan-500/60 hover:scale-105 transition`}
    >
      <span className="hidden dark:block" title="Cambiar a modo claro">
        <Sun size={18} />
      </span>
      <span className="block dark:hidden" title="Cambiar a modo oscuro">
        <Moon size={18} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers de validación numérica estricta                             */
/* ------------------------------------------------------------------ */
export const onlyDigits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

/** Letras Unicode (incluye tildes/ñ), espacios, guion y apóstrofo para nombres. */
export function onlyNameLetters(value: string): string {
  return value.replace(/[^\p{L}\s'-’]/gu, "").replace(/\s{2,}/g, " ").slice(0, 120);
}

export function validateFullName(value: string): string | null {
  const name = value.trim();
  if (name.length < 3) return "Ingresa tu nombre completo.";
  if (!/^[\p{L}]+(?:[ '\-’][\p{L}]+)*$/u.test(name)) {
    return "El nombre solo puede contener letras, espacios, guion o apóstrofo; no se permiten números.";
  }
  return null;
}

export function validateCedula(value: string): string | null {
  if (!/^\d+$/.test(value)) return "La cédula solo admite números.";
  if (value.length < 6) return "La cédula debe tener al menos 6 dígitos.";
  if (value.length > 9) return "La cédula no debe superar 9 dígitos.";
  return null;
}

export function validatePhone(value: string): string | null {
  if (!value) return null; // opcional
  if (!isValidVenezuelanPhone(value))
    return "El teléfono debe ser un móvil venezolano válido (0412, 0414, 0416, 0422, 0424 o 0426 + 6 dígitos, ej: 0414123456).";
  return null;
}

/* ------------------------------------------------------------------ */
/* Botones                                                             */
/* ------------------------------------------------------------------ */
export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  full = false,
  icon,
  loading = false,
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  full?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn-glow inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-400 font-semibold text-white hover:from-blue-500 hover:to-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed ${
        size === "sm" ? "px-3.5 py-2 text-xs" : "px-5 py-2.5 text-sm"
      } ${full ? "w-full" : ""}`}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  icon,
  active = false,
  disabled = false,
  loading = false,
  tone = "default",
  size = "md",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tone?: "default" | "danger" | "success" | "warning";
  size?: "sm" | "md";
  type?: "button" | "submit";
}) {
  const tones: Record<string, string> = {
    default: active
      ? "bg-cyan-500/10 border-cyan-400/40 text-cyan-500"
      : "bg-card2 border-line text-ink-soft hover:border-cyan-500/50 hover:text-cyan-500",
    danger: "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20",
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition border disabled:opacity-60 disabled:cursor-not-allowed ${
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
      } ${tones[tone]}`}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Campo de formulario                                                 */
/* ------------------------------------------------------------------ */
export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-muted">
        {label}
        {required && <span className="text-cyan-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[0.72rem] text-muted2">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insignias                                                           */
/* ------------------------------------------------------------------ */
export function RoleBadge({ role, trayecto }: { role: Role; trayecto?: string | null }) {
  const cls =
    role === "estudiante"
      ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30"
      : role === "administrador"
      ? "bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30";
  const Icon = role === "estudiante" ? GraduationCap : role === "administrador" ? ShieldCheck : UserCog;
  return (
    <span className={`badge ${cls}`}>
      <Icon size={11} />
      {ROLE_LABEL[role]}
      {trayecto ? ` • ${trayecto}` : ""}
    </span>
  );
}

export function StatusBadge({ status, long = false }: { status: ProjectStatus; long?: boolean }) {
  const meta = STATUS_META[status];
  const tones: Record<string, string> = {
    cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
    blue: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
    emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
    red: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30",
  };
  return <span className={`badge border ${tones[meta.tone]}`}>{long ? meta.label : meta.short}</span>;
}

/* ------------------------------------------------------------------ */
/* Alertas                                                             */
/* ------------------------------------------------------------------ */
export function Alert({
  tone = "info",
  title,
  children,
  onClose,
}: {
  tone?: "info" | "success" | "error" | "warning";
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
}) {
  const map = {
    info: { cls: "bg-cyan-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-200", Icon: Info },
    success: {
      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-200",
      Icon: CheckCircle2,
    },
    error: { cls: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200", Icon: AlertCircle },
    warning: {
      cls: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-200",
      Icon: AlertTriangle,
    },
  }[tone];
  const Icon = map.Icon;
  return (
    <div className={`fade-in flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm ${map.cls}`}>
      <Icon size={17} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={`${title ? "text-xs mt-0.5 opacity-90" : ""} break-words`}>{children}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Cerrar">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative fade-in card w-full ${wide ? "max-w-5xl" : "max-w-2xl"} max-h-[92vh] flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink leading-snug">{title}</h3>
            {subtitle && <div className="text-xs text-muted mt-1">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-line text-muted hover:text-red-500 hover:border-red-500/40 flex items-center justify-center flex-shrink-0"
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estado vacío, estadísticas, pestañas                                */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center py-6">
      <div className="w-20 h-20 rounded-2xl bg-card2 border border-line flex items-center justify-center text-muted2">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {children && <div className="text-sm text-muted mt-2 max-w-md mx-auto leading-relaxed">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = "cyan",
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "cyan" | "blue" | "emerald" | "amber" | "purple";
}) {
  const tones = {
    cyan: "bg-cyan-500/15 text-cyan-500",
    blue: "bg-blue-500/15 text-blue-500",
    emerald: "bg-emerald-500/15 text-emerald-500",
    amber: "bg-amber-500/15 text-amber-500",
    purple: "bg-purple-500/15 text-purple-500",
  };
  return (
    <div className="card-flat p-5 card-glow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.68rem] uppercase tracking-wider text-muted font-bold">{label}</p>
          <p className="text-3xl font-black text-ink mt-1">{value}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tones[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-card2 border border-line w-fit max-w-full">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`tab-pill inline-flex items-center gap-1.5 ${value === t.id ? "active" : ""}`}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && (
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[0.65rem] font-bold ${
                value === t.id ? "bg-white/25 text-white" : "bg-line text-muted"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm">
      <Loader2 size={18} className="animate-spin text-cyan-500" />
      {label}
    </div>
  );
}
