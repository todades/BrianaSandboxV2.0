"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useProjectList } from "./useProjectList";
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
import { describeAudit } from "@/lib/audit-labels";
import type { AiStatus, AuditDTO, ProjectDTO, ServerSettings, UserDTO } from "@/lib/types";
import { TopNav } from "./TopNav";
import { SandboxPanel } from "./SandboxPanel";
import { ProjectCard, ProjectDetailModal } from "./ProjectViews";
import { ReportsPanel } from "./ReportsPanel";
import { AccountsAdmin } from "./AccountsAdmin";
import { ProjectFilters } from "./ProjectFilters";
import { ALL_PROJECTS_FILTER, isProjectFilterActive, matchesProjectFilter, matchesProjectSearch, type ProjectFilter } from "@/lib/project-filters";
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

type Tab = "sandbox" | "reportes" | "tutores" | "cuentas" | "auditoria" | "servidor";

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
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */
function AuditTab() {
  const pageSize = 100;
  const [logs, setLogs] = useState<AuditDTO[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    try {
      const result = await api<{ logs: AuditDTO[]; total: number; offset: number }>(
        `/api/admin/audit?limit=${pageSize}&offset=${nextOffset}`
      );
      setLogs(result.logs);
      setTotal(result.total);
      setOffset(result.offset);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el historial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(0));
  }, [load]);

  const visibleLogs = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    return (logs ?? [])
      .map((log) => ({
        log,
        readable: log.readable ?? describeAudit(log.action, log.entity, log.userRole, log.details),
      }))
      .filter(({ log, readable }) =>
        !q ||
        [log.userName ?? "", readable.action, readable.entity, readable.role, readable.detail, formatDate(log.createdAt)]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(q)
      );
  }, [logs, search]);

  return (
    <div className="card overflow-hidden fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line">
        <div>
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Activity size={16} className="text-cyan-500" /> Historial de actividad
          </h3>
          <p className="text-xs text-muted mt-1">
            Registro de accesos, envíos, correcciones, publicaciones y cambios de configuración. Actualizar no borra el historial.
          </p>
        </div>
        <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={() => void load(offset)} loading={loading}>
          Actualizar
        </SecondaryButton>
      </div>

      <div className="px-5 py-4 border-b border-line">
        <label htmlFor="audit-search" className="sr-only">Buscar en el historial</label>
        <input
          id="audit-search"
          className="input-base max-w-xl"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por persona, acción, proyecto o fecha..."
        />
        <p className="text-xs text-muted2 mt-2">
          {search ? `${visibleLogs.length} coincidencia(s) en esta página.` : `${total} registro(s) conservados en el historial.`}
        </p>
      </div>

      {error && <div className="p-4"><Alert tone="error">{error}</Alert></div>}
      {logs === null ? (
        <Spinner />
      ) : visibleLogs.length === 0 ? (
        <div className="p-8"><EmptyState icon={<ShieldCheck size={36} />} title={search ? "No hay coincidencias" : "Sin actividad registrada"} /></div>
      ) : (
        <div className="divide-y divide-line">
          {visibleLogs.map(({ log, readable }) => (
            <article key={log.id} className="px-5 py-4 hover:bg-card2/50">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-ink">{readable.action}</h4>
                  <p className="text-xs text-muted mt-1">
                    {log.userName ?? "Sistema"} · {readable.role} · {readable.entity}
                    {log.entityId ? ` n.º ${log.entityId}` : ""}
                  </p>
                </div>
                <time className="text-xs text-muted2 whitespace-nowrap" dateTime={log.createdAt}>{formatDate(log.createdAt)}</time>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft whitespace-pre-wrap break-words">{readable.detail}</p>
            </article>
          ))}
        </div>
      )}

      {total > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-line">
          <p className="text-xs text-muted">
            Mostrando {offset + 1}–{Math.min(offset + pageSize, total)} de {total} registros.
          </p>
          <div className="flex gap-2">
            <SecondaryButton size="sm" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>
              Anteriores
            </SecondaryButton>
            <SecondaryButton size="sm" disabled={loading || offset + pageSize >= total} onClick={() => void load(offset + pageSize)}>
              Siguientes
            </SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Envíos por Tutores                                                  */
/* ------------------------------------------------------------------ */
function TutorSubmissionsTab({ user }: { user: UserDTO }) {
  const { projects, error: projectError, loading, load, applyUpdated, removeDeleted } = useProjectList();
  type TutorAccount = { id: number; name: string; email: string; role: "tutor" | "administrador"; isActive: boolean };
  const [filter, setFilter] = useState<ProjectFilter>({ field: "status", value: "validado_tutor" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tutorAccounts, setTutorAccounts] = useState<TutorAccount[]>([]);
  const [tutorListOpen, setTutorListOpen] = useState(false);
  const [togglingTutor, setTogglingTutor] = useState<number | null>(null);
  const selected = useMemo(() => projects?.find((p) => p.id === selectedId) ?? null, [projects, selectedId]);

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
      const { user: updated } = await postJson<{ user: TutorAccount }>(`/api/admin/users/${tutor.id}`, { isActive: !tutor.isActive }, "PATCH");
      setTutorAccounts((prev) => prev.map((t) => (t.id === updated.id ? { ...t, isActive: updated.isActive } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado del tutor.");
    } finally {
      setTogglingTutor(null);
    }
  }

  const allProjects = useMemo(() => projects ?? [], [projects]);
  const quickFilters: { label: string; filter: ProjectFilter }[] = [
    { label: "Todos", filter: ALL_PROJECTS_FILTER },
    { label: "Pendientes de publicación", filter: { field: "status", value: "validado_tutor" } },
    { label: "En revisión por tutores", filter: { field: "status", value: "enviado_tutor" } },
    { label: "Devueltos al tutor", filter: { field: "status", value: "devuelto_tutor" } },
    { label: "Devueltos al estudiante", filter: { field: "status", value: "devuelto" } },
    { label: "Publicados", filter: { field: "status", value: "publicado" } },
    { label: "Rechazados", filter: { field: "status", value: "rechazado" } },
  ];
  const list = useMemo(
    () => allProjects.filter((p) => matchesProjectFilter(p, filter) && matchesProjectSearch(p, search)),
    [allProjects, filter, search]
  );
  const filtersActive = isProjectFilterActive(filter) || search.trim().length > 0;

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
          {quickFilters.map((f) => {
            const c = allProjects.filter((p) => matchesProjectFilter(p, f.filter)).length;
            const active = filter.field === f.filter.field && filter.value === f.filter.value;
            return (
              <SecondaryButton key={f.label} size="sm" active={active} onClick={() => setFilter(f.filter)}>
                {f.label} <span className="opacity-70">({c})</span>
              </SecondaryButton>
            );
          })}
        </div>
        <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={() => { void load(); void loadTutors(); }} loading={loading}>
          Actualizar
        </SecondaryButton>
      </div>

      <ProjectFilters
        idPrefix="admin-project"
        projects={allProjects}
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        resultCount={list.length}
      />

      {(error || projectError) && <Alert tone="error">{error || projectError}</Alert>}
      {projects === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="card p-10">
          <EmptyState icon={<ClipboardCheck size={38} />} title="No hay proyectos en esta categoría">
            {filtersActive ? "Cambia la categoría o limpia los filtros para ver otros proyectos." : "Los proyectos enviados por los tutores aparecerán aquí para su revisión y publicación."}
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} role={user.role} onOpen={(project) => setSelectedId(project.id)} showFiles={false} />
          ))}
        </div>
      )}

      <ProjectDetailModal
        project={selected}
        user={user}
        hideFiles
        onClose={() => setSelectedId(null)}
        onUpdated={applyUpdated}
        onDeleted={removeDeleted}
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
              { id: "cuentas", label: "Cuentas", icon: <Users size={14} /> },
              { id: "auditoria", label: "Auditoría", icon: <ShieldCheck size={14} /> },
              { id: "servidor", label: "Servidor", icon: <Server size={14} /> },
            ]}
          />
        </div>

        {tab === "sandbox" && <SandboxPanel user={user} />}
        {tab === "reportes" && <ReportsPanel user={user} />}
        {tab === "tutores" && <TutorSubmissionsTab user={user} />}
        {tab === "cuentas" && <AccountsAdmin user={user} />}
        {tab === "auditoria" && <AuditTab />}
        {tab === "servidor" && <ServerTab />}
      </main>
    </div>
  );
}