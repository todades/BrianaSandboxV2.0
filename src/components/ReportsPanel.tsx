"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bot, CheckCircle2, ClipboardCheck, Inbox, RefreshCw, Users } from "lucide-react";
import { api, formatDate } from "@/lib/api-client";
import { describeAudit } from "@/lib/audit-labels";
import { ROLE_LABEL, STATUS_META, type ProjectStatus, type Role } from "@/lib/constants";
import {
  ALL_PROJECTS_FILTER,
  PROJECT_FILTER_LABELS,
  matchesProjectFilter,
  projectFilterLabel,
  type ProjectFilter,
  type ProjectFilterField,
} from "@/lib/project-filters";
import type { AuditDTO, ProjectDTO, UserDTO } from "@/lib/types";
import { ProjectCard, ProjectDetailModal } from "./ProjectViews";
import { useProjectList } from "./useProjectList";
import { Alert, EmptyState, SecondaryButton, Spinner, StatCard, StatusBadge } from "./ui";

interface Reports {
  totals: { projects: number; published: number; pendingAdmin: number; pendingTutor: number; users: number; aiCalls: number };
  usersByRole: { role: string; total: number }[];
  byStatus: { key: string; total: number }[];
  byLinea: { key: string; total: number }[];
  byTipo: { key: string; total: number }[];
  byTrayecto: { key: string; total: number }[];
  byAnio: { key: string; total: number }[];
  tutorsLoad: { id: number; name: string; email: string; total: number }[];
  recent: { id: number; title: string; status: ProjectStatus; updatedAt: string; studentName: string | null }[];
}

type ReportSelection =
  | { kind: "projects"; filter: ProjectFilter; label: string }
  | { kind: "users"; role: Role | "todos"; label: string }
  | { kind: "ai"; label: string };

function Bars({
  titulo,
  rows,
  selectedKey,
  onSelect,
}: {
  titulo: string;
  rows: { key: string; total: number; label?: string }[];
  selectedKey?: string | null;
  onSelect: (key: string, label: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-ink">{titulo}</h3>
      <p className="text-xs text-muted mt-1 mb-4">Pulsa una categoría para filtrar.</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted2">Sin datos todavía.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const label = r.label ?? r.key;
            const active = selectedKey === r.key;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(r.key, label)}
                className={`w-full rounded-lg px-2 py-2 text-left transition hover:bg-card2 ${active ? "bg-cyan-500/10 ring-1 ring-cyan-500/40" : ""}`}
              >
                <div className="flex justify-between gap-3 text-xs mb-1">
                  <span className="text-ink-soft truncate pr-2">{label}</span>
                  <span className="font-bold text-ink">{r.total}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(r.total / max) * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ReportsPanel({ user }: { user: UserDTO }) {
  const [data, setData] = useState<Reports | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<ReportSelection | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const { projects, error: projectError, loading: projectsLoading, load, applyUpdated, removeDeleted } = useProjectList();
  const [users, setUsers] = useState<UserDTO[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditDTO[] | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const resultsRef = useRef<HTMLElement | null>(null);
  const auditPageSize = 100;

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Reports>("/api/admin/reports"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los reportes.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await api<{ users: UserDTO[] }>("/api/admin/users");
      setUsers(result.users);
      setUsersError(null);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "No se pudieron cargar las cuentas.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async (offset = 0) => {
    setAuditLoading(true);
    try {
      const result = await api<{ logs: AuditDTO[]; total: number; offset: number }>(
        `/api/admin/audit?action=IA_EXTRACCION_METADATOS&limit=${auditPageSize}&offset=${offset}`
      );
      setAuditLogs(result.logs);
      setAuditTotal(result.total);
      setAuditOffset(result.offset);
      setAuditError(null);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "No se pudieron cargar las consultas de IA.");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadReports();
      void load();
    });
  }, [loadReports, load]);

  useEffect(() => {
    if (selection) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selection]);

  const allProjects = useMemo(() => projects ?? [], [projects]);
  const selectedProject = useMemo(
    () => allProjects.find((p) => p.id === selectedProjectId) ?? null,
    [allProjects, selectedProjectId]
  );
  const filteredProjects = useMemo(
    () => selection?.kind === "projects" ? allProjects.filter((p) => matchesProjectFilter(p, selection.filter)) : [],
    [allProjects, selection]
  );
  const filteredUsers = useMemo(
    () => selection?.kind === "users" ? (users ?? []).filter((u) => selection.role === "todos" || u.role === selection.role) : [],
    [users, selection]
  );

  function selectProjects(field: ProjectFilterField, value: string, label?: string) {
    const filter: ProjectFilter = field === "todos" ? ALL_PROJECTS_FILTER : { field, value };
    setSelection({
      kind: "projects",
      filter,
      label: label ?? (field === "todos" ? "Todos los proyectos" : `${PROJECT_FILTER_LABELS[field]}: ${projectFilterLabel(filter, allProjects)}`),
    });
  }

  function selectUsers(role: Role | "todos", label: string) {
    setSelection({ kind: "users", role, label });
    if (!users) void loadUsers();
  }

  function selectAi() {
    setSelection({ kind: "ai", label: "Consultas de extracción de información con IA" });
    void loadAudit(0);
  }

  function refreshAll() {
    void loadReports();
    void load();
    if (selection?.kind === "users") void loadUsers();
    if (selection?.kind === "ai") void loadAudit(auditOffset);
  }

  function projectSelected(field: ProjectFilterField, value: string) {
    return selection?.kind === "projects" && selection.filter.field === field && selection.filter.value === value ? value : null;
  }

  if (!data) {
    return error ? (
      <div className="space-y-3"><Alert tone="error">{error}</Alert><SecondaryButton size="sm" onClick={loadReports} loading={loading}>Reintentar</SecondaryButton></div>
    ) : <Spinner label="Generando reportes..." />;
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Pulsa un indicador o una categoría para ver los registros filtrados.</p>
        <SecondaryButton size="sm" icon={<RefreshCw size={13} />} onClick={refreshAll} loading={loading || projectsLoading}>
          Actualizar reportes
        </SecondaryButton>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Proyectos" value={data.totals.projects} icon={<BookOpen size={18} />} tone="cyan" active={selection?.kind === "projects" && selection.filter.field === "todos"} onClick={() => selectProjects("todos", "")} />
        <StatCard label="Publicados" value={data.totals.published} icon={<CheckCircle2 size={18} />} tone="emerald" active={projectSelected("status", "publicado") !== null} onClick={() => selectProjects("status", "publicado")} />
        <StatCard label="Pendientes del administrador" value={data.totals.pendingAdmin} icon={<Inbox size={18} />} tone="blue" active={projectSelected("status", "validado_tutor") !== null} onClick={() => selectProjects("status", "validado_tutor")} />
        <StatCard label="Pendientes del tutor" value={data.totals.pendingTutor} icon={<ClipboardCheck size={18} />} tone="amber" active={projectSelected("status", "enviado_tutor") !== null} onClick={() => selectProjects("status", "enviado_tutor")} />
        <StatCard label="Usuarios" value={data.totals.users} icon={<Users size={18} />} tone="purple" active={selection?.kind === "users"} onClick={() => selectUsers("todos", "Todas las cuentas")} />
        <StatCard label="Consultas IA" value={data.totals.aiCalls} icon={<Bot size={18} />} tone="cyan" active={selection?.kind === "ai"} onClick={selectAi} />
      </div>

      {selection && (
        <section ref={resultsRef} className="card p-5 space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-ink">Resultados del filtro</h3>
              <p className="text-sm text-muted mt-1">{selection.label}</p>
            </div>
            <SecondaryButton size="sm" onClick={() => setSelection(null)}>Limpiar filtro</SecondaryButton>
          </div>

          {selection.kind === "projects" && (
            <>
              {projectError && <Alert tone="error">{projectError}</Alert>}
              {projects === null ? <Spinner /> : filteredProjects.length === 0 ? (
                <EmptyState icon={<BookOpen size={32} />} title="No hay proyectos en esta categoría" />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredProjects.map((p) => <ProjectCard key={p.id} project={p} role={user.role} showFiles={false} onOpen={(project) => setSelectedProjectId(project.id)} />)}
                </div>
              )}
            </>
          )}

          {selection.kind === "users" && (
            <>
              {usersError && <Alert tone="error">{usersError}</Alert>}
              {usersLoading && users === null ? <Spinner /> : filteredUsers.length === 0 ? (
                <EmptyState icon={<Users size={32} />} title="No hay cuentas en esta categoría" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted border-b border-line">
                      <tr><th className="py-2 pr-4">Cuenta</th><th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Trayecto</th><th className="py-2">Estado</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filteredUsers.map((u) => (
                        <tr key={u.id}>
                          <td className="py-3 pr-4"><p className="font-semibold text-ink">{u.name}</p><p className="text-xs text-muted">{u.email}</p></td>
                          <td className="py-3 pr-4 text-ink-soft">{ROLE_LABEL[u.role]}</td>
                          <td className="py-3 pr-4 text-ink-soft">{u.trayecto ?? "—"}</td>
                          <td className="py-3 text-ink-soft">{u.isActive ? "Activa" : "Deshabilitada"}{u.emailVerified ? "" : " · Pendiente de confirmar correo"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {selection.kind === "ai" && (
            <>
              {auditError && <Alert tone="error">{auditError}</Alert>}
              {auditLoading && auditLogs === null ? <Spinner /> : auditLogs?.length === 0 ? (
                <EmptyState icon={<Bot size={32} />} title="Todavía no hay consultas de IA registradas" />
              ) : (
                <div className="divide-y divide-line">
                  {(auditLogs ?? []).map((log) => {
                    const readable = log.readable ?? describeAudit(log.action, log.entity, log.userRole, log.details);
                    return (
                      <article key={log.id} className="py-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">{readable.action}</p>
                          <time className="text-xs text-muted2" dateTime={log.createdAt}>{formatDate(log.createdAt)}</time>
                        </div>
                        <p className="text-xs text-muted mt-1">{log.userName ?? "Sistema"} · {readable.role}</p>
                        <p className="text-sm text-ink-soft mt-2">{readable.detail}</p>
                      </article>
                    );
                  })}
                </div>
              )}
              {auditTotal > auditPageSize && (
                <div className="flex justify-between gap-2">
                  <SecondaryButton size="sm" disabled={auditLoading || auditOffset === 0} onClick={() => void loadAudit(Math.max(0, auditOffset - auditPageSize))}>Anteriores</SecondaryButton>
                  <SecondaryButton size="sm" disabled={auditLoading || auditOffset + auditPageSize >= auditTotal} onClick={() => void loadAudit(auditOffset + auditPageSize)}>Siguientes</SecondaryButton>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bars titulo="Proyectos por estado" rows={data.byStatus.map((r) => ({ ...r, label: STATUS_META[r.key as ProjectStatus]?.label ?? r.key }))} selectedKey={projectSelected("status", selection?.kind === "projects" && selection.filter.field === "status" ? selection.filter.value : "")} onSelect={(key, label) => selectProjects("status", key, `Estado: ${label}`)} />
        <Bars titulo="Proyectos por línea de investigación" rows={data.byLinea} selectedKey={selection?.kind === "projects" && selection.filter.field === "lineaInvestigacion" ? selection.filter.value : null} onSelect={(key) => selectProjects("lineaInvestigacion", key)} />
        <Bars titulo="Proyectos por tipo de recurso" rows={data.byTipo} selectedKey={selection?.kind === "projects" && selection.filter.field === "tipoRecurso" ? selection.filter.value : null} onSelect={(key) => selectProjects("tipoRecurso", key)} />
        <Bars titulo="Proyectos por trayecto" rows={data.byTrayecto} selectedKey={selection?.kind === "projects" && selection.filter.field === "trayecto" ? selection.filter.value : null} onSelect={(key) => selectProjects("trayecto", key)} />
        <Bars titulo="Proyectos por año de publicación" rows={data.byAnio} selectedKey={selection?.kind === "projects" && selection.filter.field === "anio" ? selection.filter.value : null} onSelect={(key) => selectProjects("anio", key)} />
        <Bars titulo="Carga de proyectos por tutor" rows={data.tutorsLoad.map((t) => ({ key: String(t.id), total: t.total, label: `${t.name} (${t.email})` }))} selectedKey={selection?.kind === "projects" && selection.filter.field === "tutorId" ? selection.filter.value : null} onSelect={(key, label) => selectProjects("tutorId", key, `Tutor: ${label}`)} />
        <Bars titulo="Usuarios por rol" rows={data.usersByRole.map((u) => ({ key: u.role, total: u.total, label: ROLE_LABEL[u.role as Role] ?? u.role }))} selectedKey={selection?.kind === "users" ? selection.role : null} onSelect={(key, label) => selectUsers(key as Role, `Cuentas: ${label}`)} />
        <div className="card p-5">
          <h3 className="text-sm font-bold text-ink mb-4">Actividad reciente</h3>
          {data.recent.length === 0 ? <p className="text-xs text-muted2">Sin proyectos registrados.</p> : (
            <ul className="space-y-2">
              {data.recent.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelectedProjectId(r.id)} className="w-full rounded-lg px-2 py-2 text-left hover:bg-card2 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0"><p className="text-ink font-medium line-clamp-1">{r.title}</p><p className="text-muted2">{r.studentName} · {formatDate(r.updatedAt)}</p></div>
                    <StatusBadge status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ProjectDetailModal
        project={selectedProject}
        user={user}
        hideFiles
        onClose={() => setSelectedProjectId(null)}
        onUpdated={(p) => { applyUpdated(p); void loadReports(); }}
        onDeleted={(id) => { removeDeleted(id); void loadReports(); }}
      />
    </div>
  );
}
