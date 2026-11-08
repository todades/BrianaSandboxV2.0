"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Sparkles,
  BarChart3,
  ClipboardCheck,
  ShieldCheck,
  Server,
  RefreshCw,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Users,
  Bot,
  Inbox,
  Trash2,
  Link2,
  Activity,
  Mail,
  UserCheck,
} from "lucide-react";
import { api, formatDate, postJson } from "@/lib/api-client";
import { STATUS_META, type ProjectStatus } from "@/lib/constants";
import type { AiStatus, AuditDTO, ProjectDTO, ServerSettings, UserDTO } from "@/lib/types";
import { TopNav } from "./TopNav";
import { SandboxPanel } from "./SandboxPanel";
import { ProjectCard, ProjectDetailModal } from "./ProjectViews";
import {
  Alert,
  EmptyState,
  Field,
  PillTabs,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  StatCard,
  StatusBadge,
} from "./ui";

type Tab = "sandbox" | "reportes" | "tutores" | "auditoria" | "servidor";

/* ------------------------------------------------------------------ */
/* Servidor                                                            */
/* ------------------------------------------------------------------ */
function ServerTab() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [backendUrl, setBackendUrl] = useState("");
  const [backendState, setBackendState] = useState<"idle" | "ok" | "fail" | "checking">("idle");
  const [geminiKey, setGeminiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [settings, setSettings] = useState<ServerSettings | null>(null);

  const refresh = useCallback(async (verify = false) => {
    setChecking(true);
    try {
      const [s, cfg] = await Promise.all([
        api<AiStatus>(`/api/ai/status${verify ? "?verify=1" : ""}`),
        api<ServerSettings>("/api/admin/settings"),
      ]);
      setStatus(s);
      setSettings(cfg);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "No se pudo consultar el estado." });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
    try {
      const saved = localStorage.getItem("briana-backend-url");
      setBackendUrl(saved || window.location.origin);
    } catch {
      setBackendUrl(window.location.origin);
    }
  }, [refresh]);

  async function connectBackend() {
    setBackendState("checking");
    try {
      const url = backendUrl.replace(/\/+$/, "");
      const res = await fetch(`${url}/api/health`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean };
      if (res.ok && data.ok) {
        setBackendState("ok");
        localStorage.setItem("briana-backend-url", url);
        setMsg({ tone: "success", text: `Backend conectado correctamente en ${url}.` });
      } else {
        setBackendState("fail");
        setMsg({ tone: "error", text: "El backend respondió pero no está saludable." });
      }
    } catch {
      setBackendState("fail");
      setMsg({ tone: "error", text: "No se pudo conectar con la URL indicada (CORS o servidor inactivo)." });
    }
  }

  async function saveKey() {
    setSavingKey(true);
    setMsg(null);
    try {
      const r = await postJson<{ verified: boolean; error?: string; maskedKey: string }>("/api/admin/settings", {
        geminiKey,
      });
      setGeminiKey("");
      setMsg(
        r.verified
          ? { tone: "success", text: `Clave de Gemini guardada y verificada (${r.maskedKey}).` }
          : { tone: "error", text: `Clave guardada pero no verificada: ${r.error ?? "revisa la clave"}.` }
      );
      await refresh(true);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "No se pudo guardar la clave." });
    } finally {
      setSavingKey(false);
    }
  }

  async function clearKey() {
    if (!confirm("¿Eliminar la clave de Gemini configurada en el servidor?")) return;
    try {
      await postJson("/api/admin/settings", {}, "DELETE");
      setMsg({ tone: "info", text: "Clave de Gemini eliminada del servidor." });
      await refresh(false);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "No se pudo eliminar." });
    }
  }

  const active = status?.active ?? false;

  return (
    <div className="space-y-6 fade-in">
      <div className="card p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600/20 to-cyan-500/20 border border-cyan-400/30 flex items-center justify-center flex-shrink-0">
            <Server size={22} className="text-cyan-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">Configuración del Servidor</h2>
            <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
              Conecta BRIANA con el backend para proteger la clave de IA y habilitar la persistencia en base de
              datos. Todas las operaciones sensibles se ejecutan en el servidor.
            </p>
          </div>
        </div>

        {msg && (
          <div className="mb-5">
            <Alert tone={msg.tone} onClose={() => setMsg(null)}>
              {msg.text}
            </Alert>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-card2 border border-line mb-6">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                checking ? "bg-amber-400" : active ? "bg-emerald-400 pulse-dot" : "bg-red-400"
              }`}
            />
            <div>
              <p className="text-sm font-bold text-ink">
                {checking
                  ? "VERIFICANDO IA..."
                  : active
                  ? `IA ACTIVA (GEMINI · ${status?.model ?? ""})`
                  : "IA INACTIVA · SIN CLAVE DE GEMINI"}
              </p>
              <p className="text-xs text-muted">
                {status
                  ? `${status.dbOk ? "Base de datos PostgreSQL conectada" : "Base de datos sin conexión"} · Fuente de la clave: ${
                      status.source === "env" ? "variables de entorno (.env)" : status.source === "servidor" ? "panel del servidor" : "ninguna (modo heurístico)"
                    }${status.maskedKey ? ` · ${status.maskedKey}` : ""}`
                  : "Consultando estado..."}
                {status?.error && <span className="text-red-500"> · {status.error}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => refresh(true)}
            disabled={checking}
            className="inline-flex items-center gap-1.5 text-xs text-cyan-500 hover:text-cyan-400 font-semibold px-3 py-1.5 rounded-lg border border-cyan-400/30 hover:border-cyan-400/60 transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
            Volver a verificar
          </button>
        </div>

        {/* Estado del correo SMTP (nodemailer) */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-card2 border border-line mb-6">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status?.mail.configured
                  ? status.mail.verified === false
                    ? "bg-red-400"
                    : "bg-emerald-400 pulse-dot"
                  : "bg-amber-400"
              }`}
            />
            <div>
              <p className="text-sm font-bold text-ink inline-flex items-center gap-2">
                <Mail size={14} className="text-cyan-500" />
                {status?.mail.configured
                  ? `CORREO SMTP ACTIVO (${status.mail.host?.toUpperCase() ?? "NODEMAILER"})`
                  : "CORREO SMTP NO CONFIGURADO · MODO DESARROLLO"}
              </p>
              <p className="text-xs text-muted">
                {status?.mail.configured
                  ? `Remitente: ${status.mail.from ?? status.mail.user} · Códigos de 6 dígitos para verificación y recuperación${
                      status.mail.verified === true ? " · Conexión verificada" : status.mail.verified === false ? "" : ""
                    }`
                  : "Define EMAIL_USER y EMAIL_PASS (App Password) en el servidor. Mientras tanto, los códigos de verificación se muestran en pantalla."}
                {status?.mail.error && <span className="text-red-500"> · {status.mail.error}</span>}
              </p>
            </div>
          </div>
          <span className="text-[0.65rem] uppercase tracking-wider text-muted2">
            Expira en {settings?.env.codeTtlMinutes ?? 15} min · Reenvío cada {settings?.env.resendCooldownSeconds ?? 60}s
          </span>
        </div>

        <div className="space-y-5">
          <Field label="URL DEL BACKEND" hint="URL pública del servidor que gestiona la IA y la base de datos. Por defecto, este mismo origen.">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <input
                  className="input-base font-mono text-sm"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="https://brianasandboxv-1.onrender.com"
                />
              </div>
              <PrimaryButton
                onClick={connectBackend}
                loading={backendState === "checking"}
                icon={backendState === "ok" ? <CheckCircle2 size={15} /> : <Link2 size={15} />}
              >
                {backendState === "ok" ? "Conectado" : "Conectar"}
              </PrimaryButton>
            </div>
          </Field>

          <Field
            label="CLAVE DE GEMINI (MODO DIRECTO)"
            hint="Se guarda cifrada en tránsito y solo en el servidor. Si existe GEMINI_API_KEY en el .env, esta tiene prioridad."
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <input
                  type="password"
                  className="input-base font-mono text-sm"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={status?.maskedKey ? `Configurada: ${status.maskedKey}` : "AIza..."}
                  autoComplete="off"
                />
              </div>
              <SecondaryButton icon={<KeyRound size={15} />} loading={savingKey} disabled={!geminiKey} onClick={saveKey}>
                Actualizar IA
              </SecondaryButton>
              {status?.source === "servidor" && (
                <SecondaryButton tone="danger" icon={<Trash2 size={15} />} onClick={clearKey}>
                  Quitar
                </SecondaryButton>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-6 flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-700 dark:text-amber-200/90 text-xs leading-relaxed">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <p>
            <span className="font-bold">Nota de seguridad:</span> Si el backend está conectado, la clave del servidor
            tiene prioridad y nunca se expone al navegador. El cliente solo se comunica a través de endpoints
            protegidos por sesión y rol.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reportes                                                            */
/* ------------------------------------------------------------------ */
interface Reports {
  totals: { projects: number; published: number; pendingAdmin: number; pendingTutor: number; users: number; aiCalls: number };
  usersByRole: { role: string; total: number }[];
  byStatus: { key: string; total: number }[];
  byLinea: { key: string; total: number }[];
  byTipo: { key: string; total: number }[];
  byTrayecto: { key: string; total: number }[];
  byAnio: { key: string; total: number }[];
  tutorsLoad: { id: number; name: string; total: number }[];
  recent: { id: number; titulo: string; status: ProjectStatus; updatedAt: string; studentName: string | null }[];
}

function Bars({ title, rows, labelFor }: { title: string; rows: { key: string; total: number }[]; labelFor?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-ink mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted2">Sin datos todavía.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-ink-soft truncate pr-2">{labelFor ? labelFor(r.key) : r.key}</span>
                <span className="font-bold text-ink">{r.total}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(r.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsTab() {
  const [data, setData] = useState<Reports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Reports>("/api/admin/reports")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner label="Generando reportes..." />;

  return (
    <div className="space-y-6 fade-in">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Proyectos" value={data.totals.projects} icon={<BookOpen size={20} />} tone="cyan" />
        <StatCard label="Publicados" value={data.totals.published} icon={<CheckCircle2 size={20} />} tone="emerald" />
        <StatCard label="Pend. Admin" value={data.totals.pendingAdmin} icon={<Inbox size={20} />} tone="blue" />
        <StatCard label="Pend. Tutor" value={data.totals.pendingTutor} icon={<ClipboardCheck size={20} />} tone="amber" />
        <StatCard label="Usuarios" value={data.totals.users} icon={<Users size={20} />} tone="purple" />
        <StatCard label="Consultas IA" value={data.totals.aiCalls} icon={<Bot size={20} />} tone="cyan" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars title="Proyectos por estado" rows={data.byStatus} labelFor={(k) => STATUS_META[k as ProjectStatus]?.label ?? k} />
        <Bars title="Proyectos por línea de investigación" rows={data.byLinea} />
        <Bars title="Proyectos por tipo de recurso" rows={data.byTipo} />
        <Bars title="Proyectos por trayecto" rows={data.byTrayecto} />
        <Bars title="Proyectos por año de publicación" rows={data.byAnio} />
        <Bars title="Carga de proyectos por tutor" rows={data.tutorsLoad.map((t) => ({ key: t.name, total: t.total }))} />
        <Bars title="Usuarios por rol" rows={data.usersByRole.map((u) => ({ key: u.role, total: u.total }))} />
        <div className="card p-5">
          <h3 className="text-sm font-bold text-ink mb-4">Actividad reciente</h3>
          {data.recent.length === 0 ? (
            <p className="text-xs text-muted2">Sin proyectos registrados.</p>
          ) : (
            <ul className="space-y-3">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-ink font-medium line-clamp-1">{r.titulo}</p>
                    <p className="text-muted2">
                      {r.studentName} · {formatDate(r.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */
function AuditTab() {
  const [logs, setLogs] = useState<AuditDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ logs: AuditDTO[] }>("/api/admin/audit")
      .then((r) => setLogs(r.logs))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="card overflow-hidden fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Activity size={16} className="text-cyan-500" /> Registro de auditoría
          </h3>
          <p className="text-xs text-muted">Trazabilidad de accesos, envíos, validaciones, publicaciones y cambios de configuración.</p>
        </div>
        <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={load}>
          Actualizar
        </SecondaryButton>
      </div>
      {error && <div className="p-4"><Alert tone="error">{error}</Alert></div>}
      {logs === null ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <div className="p-8"><EmptyState icon={<ShieldCheck size={36} />} title="Sin eventos registrados" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-card2 text-muted uppercase tracking-wider text-[0.65rem]">
              <tr>
                <th className="text-left px-5 py-2.5 font-bold">Fecha</th>
                <th className="text-left px-5 py-2.5 font-bold">Usuario</th>
                <th className="text-left px-5 py-2.5 font-bold">Acción</th>
                <th className="text-left px-5 py-2.5 font-bold">Entidad</th>
                <th className="text-left px-5 py-2.5 font-bold">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-card2/60">
                  <td className="px-5 py-2.5 whitespace-nowrap text-muted">{formatDate(l.createdAt)}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <span className="text-ink font-medium">{l.userName}</span>
                    <span className="text-muted2"> · {l.userRole}</span>
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-cyan-600 dark:text-cyan-300">{l.action}</span>
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap text-muted">
                    {l.entity ?? "—"}
                    {l.entityId ? ` #${l.entityId}` : ""}
                  </td>
                  <td className="px-5 py-2.5 text-muted max-w-md">
                    <span className="line-clamp-2 font-mono text-[0.65rem]">
                      {l.details ? JSON.stringify(l.details) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Envíos por Tutores                                                  */
/* ------------------------------------------------------------------ */
function TutorSubmissionsTab({ user }: { user: UserDTO }) {
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  type FilterId = "validado_tutor" | "mios" | "todos" | ProjectStatus;
  type TutorAccount = { id: number; name: string; email: string; role: "tutor" | "administrador"; isActive: boolean };
  const [filter, setFilter] = useState<FilterId>("validado_tutor");
  const [selected, setSelected] = useState<ProjectDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tutorAccounts, setTutorAccounts] = useState<TutorAccount[]>([]);
  const [tutorListOpen, setTutorListOpen] = useState(false);
  const [togglingTutor, setTogglingTutor] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { projects } = await api<{ projects: ProjectDTO[] }>("/api/projects");
      setProjects(projects);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  const loadTutors = useCallback(async () => {
    try {
      const { tutors } = await api<{ tutors: TutorAccount[] }>("/api/tutors");
      setTutorAccounts(tutors.filter((t) => t.role === "tutor"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la disponibilidad de tutores.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void loadTutors();
    });
  }, [load, loadTutors]);

  async function toggleTutor(tutor: TutorAccount) {
    setTogglingTutor(tutor.id);
    setError(null);
    try {
      const updated = await postJson<TutorAccount>(`/api/admin/users/${tutor.id}`, { isActive: !tutor.isActive }, "PATCH");
      setTutorAccounts((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado del tutor.");
    } finally {
      setTogglingTutor(null);
    }
  }

  const filters: { id: FilterId; label: string; test: (p: ProjectDTO) => boolean; icon?: ReactNode }[] = useMemo(
    () => [
      { id: "validado_tutor", label: "Pendientes de publicación", test: (p) => p.status === "validado_tutor" },
      {
        id: "mios",
        label: "Asignados a mí (en revisión)",
        test: (p) => p.tutorId === user.id && (p.status === "enviado_tutor" || p.status === "devuelto_tutor"),
        icon: <UserCheck size={12} />,
      },
      { id: "publicado", label: "Publicados", test: (p) => p.status === "publicado" },
      { id: "enviado_tutor", label: "En revisión por tutores", test: (p) => p.status === "enviado_tutor" },
      { id: "devuelto_tutor", label: "Devueltos al tutor", test: (p) => p.status === "devuelto_tutor" },
      { id: "devuelto", label: "Devueltos al estudiante", test: (p) => p.status === "devuelto" },
      { id: "rechazado", label: "Rechazados", test: (p) => p.status === "rechazado" },
      { id: "todos", label: "Todos", test: () => true },
    ],
    [user.id]
  );

  const list = useMemo(() => {
    const f = filters.find((x) => x.id === filter) ?? filters[0];
    const q = search.trim().toLocaleLowerCase("es");
    return (projects ?? []).filter(f.test).filter((p) =>
      !q ||
      [p.titulo, p.codigo ?? "", p.studentName ?? "", p.tutorCuenta ?? "", p.status, p.observaciones ?? ""]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(q)
    );
  }, [projects, filter, filters, search]);

  return (
    <div className="space-y-4 fade-in">
      <div className="card-flat rounded-xl p-4">
        <button
          type="button"
          onClick={() => setTutorListOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-ink">Disponibilidad de tutores</span>
            <span className="block text-xs text-muted mt-0.5">Los tutores deshabilitados seguirán apareciendo marcados como «No disponible» en el selector de proyectos.</span>
          </span>
          <span className="text-xs font-semibold text-cyan-500">{tutorListOpen ? "Ocultar" : `Gestionar (${tutorAccounts.length})`}</span>
        </button>
        {tutorListOpen && (
          <div className="mt-4 space-y-2 border-t border-line pt-3">
            {tutorAccounts.length === 0 ? (
              <p className="text-sm text-muted">No hay cuentas de tutor verificadas.</p>
            ) : (
              tutorAccounts.map((tutor) => (
                <div key={tutor.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-app px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{tutor.name}</p>
                    <p className="truncate text-xs text-muted">{tutor.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${tutor.isActive ? "text-emerald-500" : "text-amber-500"}`}>
                      {tutor.isActive ? "Activo" : "No disponible"}
                    </span>
                    <SecondaryButton
                      size="sm"
                      tone={tutor.isActive ? "warning" : "success"}
                      loading={togglingTutor === tutor.id}
                      onClick={() => void toggleTutor(tutor)}
                    >
                      {tutor.isActive ? "Deshabilitar" : "Activar"}
                    </SecondaryButton>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const c = (projects ?? []).filter(f.test).length;
            return (
              <SecondaryButton key={f.id} size="sm" active={filter === f.id} onClick={() => setFilter(f.id)} icon={f.icon}>
                {f.label} <span className="opacity-70">({c})</span>
              </SecondaryButton>
            );
          })}
        </div>
        <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={() => { void load(); void loadTutors(); }}>
          Actualizar
        </SecondaryButton>
      </div>

      <div className="max-w-md">
        <label className="sr-only" htmlFor="admin-project-search">Buscar proyectos</label>
        <input
          id="admin-project-search"
          className="input-base"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título, código, estudiante o tutor..."
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {projects === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="card p-10">
          <EmptyState icon={<ClipboardCheck size={38} />} title="No hay proyectos en esta categoría">
            Los proyectos validados por los tutores aparecerán aquí para su auditoría y publicación oficial.
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {list.map((p) => (
              <ProjectCard key={p.id} project={p} role={user.role} onOpen={setSelected} showFiles={false} />
            ))}
        </div>
      )}

      <ProjectDetailModal
        project={selected}
        user={user}
        hideFiles
        onClose={() => setSelected(null)}
        onUpdated={(p) => {
          setProjects((prev) => (prev ?? []).map((x) => (x.id === p.id ? p : x)));
          setSelected(p);
        }}
        onDeleted={(id) => setProjects((prev) => (prev ?? []).filter((p) => p.id !== id))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel principal                                                     */
/* ------------------------------------------------------------------ */
export function AdminDashboard({ user, onLogout }: { user: UserDTO; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("tutores");

  return (
    <div className="min-h-screen bg-app">
      <TopNav user={user} onLogout={onLogout} />
      <main className="max-w-7xl mx-auto px-5 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-ink flex items-center gap-2">
            <ShieldCheck size={22} className="text-purple-500" />
            Panel de Administración
          </h1>
          <p className="text-sm text-muted mt-1">
            Administrador único del sistema · Supervisión institucional, auditoría y gestión del backend con IA.
          </p>
        </div>

        <div className="mb-6">
          <PillTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "sandbox", label: "Sandbox", icon: <Sparkles size={14} /> },
              { id: "reportes", label: "Reportes", icon: <BarChart3 size={14} /> },
              { id: "tutores", label: "Envíos por Tutores", icon: <ClipboardCheck size={14} /> },
              { id: "auditoria", label: "Auditoría", icon: <ShieldCheck size={14} /> },
              { id: "servidor", label: "Servidor", icon: <Server size={14} /> },
            ]}
          />
        </div>

        {tab === "sandbox" && <SandboxPanel user={user} />}
        {tab === "reportes" && <ReportsTab />}
        {tab === "tutores" && <TutorSubmissionsTab user={user} />}
        {tab === "auditoria" && <AuditTab />}
        {tab === "servidor" && <ServerTab />}
      </main>
    </div>
  );
}
