"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FileCheck2,
  Calendar,
  User as UserIcon,
  UserCog,
  Eye,
  Download,
  Save,
  Send,
  Undo2,
  CheckCircle2,
  XCircle,
  Paperclip,
  Bot,
  Cpu,
  MessageSquareWarning,
  Clock,
  BookMarked,
  GraduationCap,
  Trash2,
} from "lucide-react";
import { api, formatBytes, formatDate, postForm, postJson } from "@/lib/api-client";
import { useToast } from "./toast";
import type { MetadataForm, ProjectDTO, UserDTO } from "@/lib/types";
import { Alert, Field, Modal, PrimaryButton, SecondaryButton, StatusBadge } from "./ui";
import { MetadataFields, type TutorOption } from "./MetadataFields";

/* ------------------------------------------------------------------ */
/* Tarjeta de proyecto                                                 */
/* ------------------------------------------------------------------ */
export function ProjectCard({
  project,
  onOpen,
  role,
  showFiles = true,
}: {
  project: ProjectDTO;
  onOpen: (p: ProjectDTO) => void;
  role: UserDTO["role"];
  showFiles?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(project)}
      className="card p-5 text-left w-full card-glow hover:border-cyan-500/40 transition"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <StatusBadge status={project.status} />
            {project.codigo && (
              <span className="text-[0.68rem] font-mono text-muted bg-card2 border border-line rounded px-1.5 py-0.5">
                {project.codigo}
              </span>
            )}
            {project.aiSource && (
              <span className="inline-flex items-center gap-1 text-[0.65rem] text-muted2">
                {project.aiSource === "gemini" ? <Bot size={11} /> : <Cpu size={11} />}
                {project.aiSource}
              </span>
            )}
          </div>
          <h3 className="font-bold text-ink leading-snug line-clamp-2">{project.titulo}</h3>
          <p className="text-xs text-muted mt-1.5 line-clamp-1">
            {project.tipoRecurso} · {project.lineaInvestigacion}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted">
            {role !== "estudiante" && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap size={12} /> {project.studentName}
              </span>
            )}
            {role !== "tutor" && (
              <span className="inline-flex items-center gap-1">
                <UserCog size={12} /> {project.tutorCuenta ?? project.tutorNombre ?? "Sin tutor"}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} /> {project.anio ?? "—"} · {project.trayecto ?? "Trayecto —"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {formatDate(project.updatedAt)}
            </span>
          </div>
        </div>
        {showFiles && (
          <div className="flex flex-col items-end gap-1.5 text-[0.68rem]">
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${
                project.pdf ? "border-cyan-500/30 text-cyan-600 dark:text-cyan-300" : "border-line text-muted2"
              }`}
            >
              <FileText size={11} /> PDF {project.pdf ? "✓" : "—"}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${
                project.planilla
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                  : "border-amber-500/30 text-amber-600 dark:text-amber-300"
              }`}
            >
              <FileCheck2 size={11} /> Planilla {project.planilla ? "✓" : "pendiente"}
            </span>
          </div>
        )}
      </div>
      {project.observaciones &&
        (project.status === "devuelto" || project.status === "devuelto_tutor" || project.status === "rechazado") && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-300 inline-flex items-start gap-1.5">
          <MessageSquareWarning size={13} className="mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{project.observaciones}</span>
        </p>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Modal de detalle / revisión                                         */
/* ------------------------------------------------------------------ */
function toForm(p: ProjectDTO): MetadataForm {
  return {
    titulo: p.titulo,
    codigo: p.codigo ?? "",
    slug: p.slug ?? "",
    tipoRecurso: p.tipoRecurso,
    pnf: p.pnf,
    lineaInvestigacion: p.lineaInvestigacion,
    autores: p.autores.join("; "),
    tutorNombre: p.tutorNombre ?? "",
    tutorId: p.tutorId ? String(p.tutorId) : "",
    anio: p.anio ? String(p.anio) : "",
    trayecto: p.trayecto ?? "",
    palabrasClave: p.palabrasClave ?? "",
    resumen: p.resumen ?? "",
  };
}

export function ProjectDetailModal({
  project,
  user,
  onClose,
  onUpdated,
  onDeleted,
  hideFiles = false,
}: {
  project: ProjectDTO | null;
  user: UserDTO;
  onClose: () => void;
  onUpdated: (p: ProjectDTO) => void;
  onDeleted?: (projectId: number) => void;
  hideFiles?: boolean;
}) {
  const toast = useToast();
  const [form, setForm] = useState<MetadataForm | null>(null);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const planillaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (project) {
      setForm(toForm(project));
      setObs("");
      setError(null);
      setOk(null);
    }
  }, [project]);

  useEffect(() => {
    api<{ tutors: TutorOption[] }>("/api/tutors")
      .then((r) => setTutors(r.tutors))
      .catch(() => undefined);
  }, []);

  // Capacidades según rol y estado (el administrador también puede ser el revisor destinatario).
  const caps = useMemo(() => {
    if (!project) {
      return { canEdit: false, isReviewer: false, isAdminFinal: false, isTutorCorrection: false, isStudentFix: false };
    }
    const isReviewer =
      (user.role === "tutor" || user.role === "administrador") &&
      project.tutorId === user.id &&
      project.status === "enviado_tutor";
    const isAdminFinal = user.role === "administrador" && project.status === "validado_tutor";
    const isTutorCorrection = user.role === "tutor" && project.tutorId === user.id && project.status === "devuelto_tutor";
    const isStudentFix = user.role === "estudiante" && project.studentId === user.id && project.status === "devuelto";
    return {
      canEdit: isReviewer || isAdminFinal || isTutorCorrection || isStudentFix,
      isReviewer,
      isAdminFinal,
      isTutorCorrection,
      isStudentFix,
    };
  }, [project, user]);
  const { canEdit, isReviewer, isAdminFinal, isTutorCorrection, isStudentFix } = caps;

  const canAttach =
    !!project &&
    project.status !== "publicado" &&
    project.status !== "rechazado" &&
    (user.role === "administrador" || (user.role === "estudiante" && project.studentId === user.id));

  if (!project || !form) return null;

  async function act(action: string, withMetadata = true) {
    if (!project) return;
    if ((action === "validar" && isReviewer) || (action === "reenviar_admin" && isTutorCorrection)) {
      const confirmed = window.confirm("¿Está seguro de enviar este proyecto al Administrador?");
      if (!confirmed) return;
    }
    setBusy(action);
    setError(null);
    setOk(null);
    try {
      const { project: updated } = await postJson<{ project: ProjectDTO }>(
        `/api/projects/${project.id}`,
        { action, observaciones: obs, metadata: withMetadata && canEdit ? form : undefined },
        "PATCH"
      );
      onUpdated(updated);
      const msgs: Record<string, string> = {
        guardar: "Cambios guardados.",
        validar: "Proyecto validado y enviado al Administrador.",
        devolver: "Proyecto devuelto al estudiante con observaciones.",
        reenviar: "Proyecto corregido y reenviado al tutor.",
        reenviar_admin: "Proyecto corregido y reenviado al Administrador.",
        devolver_tutor: "Proyecto devuelto al tutor con las correcciones solicitadas.",
        publicar: "¡Proyecto publicado oficialmente en el repositorio!", 
        rechazar: "Proyecto rechazado.",
      };
      setOk(msgs[action] ?? "Operación realizada.");
      if (action !== "guardar") setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusy(null);
    }
  }

  async function attachPlanilla(file: File) {
    if (!project) return;
    setBusy("planilla");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", "planilla");
      fd.append("file", file);
      const { project: updated } = await postForm<{ project: ProjectDTO }>(`/api/projects/${project.id}/files`, fd);
      onUpdated(updated);
      setOk("Planilla firmada adjuntada correctamente.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo adjuntar la planilla.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteProject() {
    if (!project || user.role !== "administrador") return;
    const projectId = project.id;
    if (!window.confirm(`¿Eliminar permanentemente el proyecto «${project.titulo}» y sus archivos asociados?`)) return;
    setBusy("eliminar");
    setError(null);
    try {
      await api(`/api/projects/${projectId}`, { method: "DELETE" });
      onDeleted?.(projectId);
      toast.success("Proyecto eliminado", "Se eliminó el proyecto y sus archivos sin referencias.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el proyecto.");
    } finally {
      setBusy(null);
    }
  }

  const needsObs = isReviewer || isAdminFinal || isTutorCorrection;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <BookMarked size={18} className="text-cyan-500 flex-shrink-0" />
          {project.titulo}
        </span>
      }
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} long />
          <span>· Enviado {formatDate(project.createdAt)}</span>
          {project.validatedAt && <span>· Validado {formatDate(project.validatedAt)}</span>}
          {project.publishedAt && <span>· Publicado {formatDate(project.publishedAt)}</span>}
        </div>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}
        {ok && <Alert tone="success" onClose={() => setOk(null)}>{ok}</Alert>}

        {/* Participantes y archivos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="card-flat p-4">
            <p className="text-[0.65rem] uppercase tracking-wider font-bold text-muted mb-1">Estudiante</p>
            <p className="text-sm font-semibold text-ink inline-flex items-center gap-1.5">
              <UserIcon size={14} className="text-cyan-500" /> {project.studentName}
            </p>
            <p className="text-xs text-muted">{project.studentEmail}</p>
          </div>
          <div className="card-flat p-4">
            <p className="text-[0.65rem] uppercase tracking-wider font-bold text-muted mb-1">Cuenta del Tutor</p>
            <p className="text-sm font-semibold text-ink inline-flex items-center gap-1.5">
              <UserCog size={14} className="text-amber-500" /> {project.tutorCuenta ?? "Sin asignar"}
            </p>
            <p className="text-xs text-muted">{project.tutorEmail ?? "—"}</p>
          </div>
          {!hideFiles && (
            <div className="card-flat p-4 space-y-2">
            <p className="text-[0.65rem] uppercase tracking-wider font-bold text-muted">Archivos</p>
            {project.pdf ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-ink truncate">
                  <FileText size={13} className="text-cyan-500 flex-shrink-0" />
                  <span className="truncate">{project.pdf.filename}</span>
                  <span className="text-muted2">({formatBytes(project.pdf.size)})</span>
                </span>
                <span className="flex gap-1 flex-shrink-0">
                  <a href={`/api/files/${project.pdf.id}`} target="_blank" rel="noreferrer" title="Ver" className="p-1 rounded hover:text-cyan-500 text-muted">
                    <Eye size={14} />
                  </a>
                  <a href={`/api/files/${project.pdf.id}?download=1`} title="Descargar" className="p-1 rounded hover:text-cyan-500 text-muted">
                    <Download size={14} />
                  </a>
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted2">Sin PDF</p>
            )}
            {project.planilla ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-ink truncate">
                  <FileCheck2 size={13} className="text-emerald-500 flex-shrink-0" />
                  <span className="truncate">{project.planilla.filename}</span>
                </span>
                <span className="flex gap-1 flex-shrink-0">
                  <a href={`/api/files/${project.planilla.id}`} target="_blank" rel="noreferrer" title="Ver" className="p-1 rounded hover:text-cyan-500 text-muted">
                    <Eye size={14} />
                  </a>
                  <a href={`/api/files/${project.planilla.id}?download=1`} title="Descargar" className="p-1 rounded hover:text-cyan-500 text-muted">
                    <Download size={14} />
                  </a>
                </span>
              </div>
            ) : (
              <p className="text-xs text-amber-500 font-medium">Planilla firmada pendiente</p>
            )}
            {canAttach && (
              <>
                <input
                  ref={planillaRef}
                  type="file"
                  accept="application/pdf,.pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void attachPlanilla(f);
                    e.target.value = "";
                  }}
                />
                <SecondaryButton
                  size="sm"
                  icon={<Paperclip size={13} />}
                  loading={busy === "planilla"}
                  onClick={() => planillaRef.current?.click()}
                >
                  {project.planilla ? "Reemplazar planilla" : "Adjuntar planilla firmada"}
                </SecondaryButton>
              </>
            )}
            </div>
          )}
        </div>

        {project.observaciones && (
          <Alert
            tone={project.status === "rechazado" ? "error" : "warning"}
            title={project.status === "devuelto_tutor" ? "Correcciones solicitadas por el Administrador" : "Observaciones"}
          >
            {project.observaciones}
          </Alert>
        )}

        {/* Metadatos */}
        <div className="card-flat p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-ink">Metadatos del proyecto</h4>
            {!canEdit && <span className="text-[0.68rem] text-muted2 uppercase tracking-wider">Solo lectura</span>}
          </div>
          <MetadataFields value={form} onChange={setForm} tutors={tutors} disabled={!canEdit} showTutorAccount={user.role === "estudiante"} canChangeTutorAccount={false} />
        </div>

        {/* Acciones por rol */}
        {(canEdit || canAttach || user.role === "administrador") && (
          <div className="card-flat p-5 space-y-4">
            {canEdit && needsObs && (
              <Field
                label={
                  isTutorCorrection
                    ? "Respuesta del tutor a las correcciones del administrador"
                    : isReviewer
                    ? "Observaciones para el estudiante / administrador"
                    : "Observaciones del administrador"
                }
                hint={isTutorCorrection ? "Opcional: agrega una nota antes de reenviar." : "Obligatorias al devolver o rechazar."}
              >
                <textarea
                  className="textarea-base"
                  rows={3}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Escribe aquí tus observaciones..."
                />
              </Field>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              {canEdit && (
                <SecondaryButton icon={<Save size={14} />} loading={busy === "guardar"} onClick={() => act("guardar")}>
                  Guardar cambios
                </SecondaryButton>
              )}

              {isStudentFix && (
                <PrimaryButton icon={<Send size={15} />} loading={busy === "reenviar"} onClick={() => act("reenviar")}>
                  Corregir y reenviar al tutor
                </PrimaryButton>
              )}

              {isReviewer && (
                <>
                  <SecondaryButton
                    tone="warning"
                    icon={<Undo2 size={14} />}
                    loading={busy === "devolver"}
                    onClick={() => act("devolver")}
                  >
                    Devolver al estudiante
                  </SecondaryButton>
                  <PrimaryButton icon={<CheckCircle2 size={15} />} loading={busy === "validar"} onClick={() => act("validar")}>
                    Validar y enviar al Administrador
                  </PrimaryButton>
                </>
              )}

              {isTutorCorrection && (
                <PrimaryButton
                  icon={<Send size={15} />}
                  loading={busy === "reenviar_admin"}
                  onClick={() => act("reenviar_admin")}
                >
                  Corregir y reenviar al Administrador
                </PrimaryButton>
              )}

              {isAdminFinal && (
                <>
                  <SecondaryButton
                    tone="warning"
                    icon={<Undo2 size={14} />}
                    loading={busy === "devolver_tutor"}
                    onClick={() => act("devolver_tutor")}
                  >
                    Devolver al tutor
                  </SecondaryButton>
                  <SecondaryButton
                    tone="danger"
                    icon={<XCircle size={14} />} 
                    loading={busy === "rechazar"}
                    onClick={() => act("rechazar")}
                  >
                    Rechazar
                  </SecondaryButton>
                  <PrimaryButton
                    icon={<CheckCircle2 size={15} />}
                    loading={busy === "publicar"}
                    disabled={!project.planilla}
                    onClick={() => act("publicar")}
                  >
                    {project.planilla ? "Publicar en el repositorio" : "Publicar (falta planilla)"}
                  </PrimaryButton>
                </>
              )}

              {user.role === "administrador" && (
                <SecondaryButton
                  tone="danger"
                  icon={<Trash2 size={14} />}
                  loading={busy === "eliminar"}
                  onClick={deleteProject}
                >
                  Eliminar proyecto
                </SecondaryButton>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
