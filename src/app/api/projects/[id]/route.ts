import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { files, projects, users } from "@/db/schema";
import { handleError, HttpError, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  LINEAS_INVESTIGACION,
  TIPOS_RECURSO,
  TRAYECTOS,
  slugify,
  type ProjectStatus,
} from "@/lib/constants";
import { assertCanView, getProjectDTO } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const dto = await getProjectDTO(parseInt(id, 10));
    if (!dto) throw new HttpError(404, "Proyecto no encontrado.");
    assertCanView(user, dto);
    return Response.json({ project: dto });
  } catch (e) {
    return handleError(e);
  }
}

/** Eliminación permanente disponible únicamente para el administrador. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(["administrador"]);
    const { id: rawId } = await ctx.params;
    const projectId = Number.parseInt(rawId, 10);
    if (!Number.isSafeInteger(projectId) || projectId < 1) throw new HttpError(400, "Identificador de proyecto inválido.");

    const deleted = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ titulo: projects.titulo, pdfFileId: projects.pdfFileId, planillaFileId: projects.planillaFileId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!current) throw new HttpError(404, "Proyecto no encontrado.");

      await tx.delete(projects).where(eq(projects.id, projectId));

      const fileIds = [...new Set([current.pdfFileId, current.planillaFileId].filter((fileId): fileId is number => fileId !== null))];
      let removedFiles = 0;
      for (const fileId of fileIds) {
        const [stillUsed] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(or(eq(projects.pdfFileId, fileId), eq(projects.planillaFileId, fileId)))
          .limit(1);
        if (!stillUsed) {
          await tx.delete(files).where(eq(files.id, fileId));
          removedFiles += 1;
        }
      }

      return { titulo: current.titulo, removedFiles };
    });

    await logAudit({
      user,
      action: "Proyecto eliminado",
      entity: "proyecto",
      entityId: projectId,
      details: { titulo: deleted.titulo, archivosEliminados: deleted.removedFiles },
    });

    return Response.json({ ok: true, id: projectId, titulo: deleted.titulo, archivosEliminados: deleted.removedFiles });
  } catch (e) {
    return handleError(e);
  }
}

type Action =
  | "guardar"
  | "validar"
  | "devolver"
  | "reenviar"
  | "reenviar_admin"
  | "devolver_tutor"
  | "publicar"
  | "rechazar";

interface PatchBody {
  action: Action;
  observaciones?: string;
  metadata?: Record<string, string>;
}

/**
 * Flujo institucional:
 *  - Estudiante (status devuelto): "guardar" / "reenviar" -> enviado_tutor
 *  - Tutor asignado (enviado_tutor): "guardar", "validar" -> validado_tutor, "devolver" -> devuelto
 *  - Administrador (validado_tutor): "guardar", "publicar" -> publicado (requiere planilla), "rechazar" -> rechazado
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const projectId = parseInt(id, 10);
    const current = await getProjectDTO(projectId);
    if (!current) throw new HttpError(404, "Proyecto no encontrado.");
    assertCanView(user, current);

    const body = (await req.json()) as PatchBody;
    const action = body.action;
    const md = body.metadata ?? {};
    const observaciones = (body.observaciones ?? "").trim();

    const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };

    // Capacidades según rol y estado (el administrador también puede ser el revisor destinatario).
    const isReviewer =
      (user.role === "tutor" || user.role === "administrador") &&
      current.tutorId === user.id &&
      current.status === "enviado_tutor";
    const isAdminFinal = user.role === "administrador" && current.status === "validado_tutor";
    const isTutorCorrection =
      user.role === "tutor" && current.tutorId === user.id && current.status === "devuelto_tutor";
    const isStudentFix =
      user.role === "estudiante" && current.studentId === user.id && current.status === "devuelto";
    const canEdit = isReviewer || isTutorCorrection || isAdminFinal || isStudentFix;

    if (Object.keys(md).length > 0) {
      if (!canEdit) throw new HttpError(403, "El proyecto no puede editarse en su estado actual por tu rol.");
      if (md.titulo !== undefined) {
        if (md.titulo.trim().length < 8) throw new HttpError(400, "El título es obligatorio.");
        updates.titulo = md.titulo.trim();
      }
      if (md.codigo !== undefined) updates.codigo = md.codigo.trim() || null;
      if (md.slug !== undefined) updates.slug = md.slug.trim() || slugify(updates.titulo ?? current.titulo);
      if (md.tipoRecurso !== undefined) {
        if (!(TIPOS_RECURSO as readonly string[]).includes(md.tipoRecurso))
          throw new HttpError(400, "Tipo de recurso inválido.");
        updates.tipoRecurso = md.tipoRecurso;
      }
      if (md.lineaInvestigacion !== undefined) {
        if (!(LINEAS_INVESTIGACION as readonly string[]).includes(md.lineaInvestigacion))
          throw new HttpError(400, "Línea de investigación inválida.");
        updates.lineaInvestigacion = md.lineaInvestigacion;
      }
      if (md.autores !== undefined) {
        const list = md.autores.split(";").map((a) => a.trim()).filter(Boolean);
        if (!list.length) throw new HttpError(400, "Indica al menos un autor.");
        updates.autores = list;
      }
      if (md.tutorNombre !== undefined) updates.tutorNombre = md.tutorNombre.trim() || null;
      // La cuenta del tutor destinatario solo la elige el estudiante al crear el proyecto.
      // Ni el tutor ni el administrador pueden cambiarla durante correcciones.
      if (md.anio !== undefined) {
        const y = md.anio.trim() ? parseInt(md.anio, 10) : null;
        if (md.anio.trim() && (!y || y < 1990 || y > new Date().getFullYear() + 1))
          throw new HttpError(400, "Año inválido.");
        updates.anio = y;
      }
      if (md.trayecto !== undefined) {
        if (md.trayecto && !(TRAYECTOS as readonly string[]).includes(md.trayecto))
          throw new HttpError(400, "Trayecto inválido.");
        updates.trayecto = md.trayecto || null;
      }
      if (md.palabrasClave !== undefined) updates.palabrasClave = md.palabrasClave.trim() || null;
      if (md.resumen !== undefined) updates.resumen = md.resumen.trim() || null;
    }

    let nextStatus: ProjectStatus | null = null;
    let auditAction = "Proyecto actualizado";

    switch (action) {
      case "guardar":
        if (!canEdit) throw new HttpError(403, "No puedes editar este proyecto ahora.");
        break;
      case "reenviar":
        if (!isStudentFix) throw new HttpError(403, "Solo el estudiante puede reenviar un proyecto devuelto.");
        nextStatus = "enviado_tutor";
        updates.observaciones = null;
        auditAction = "Proyecto reenviado al tutor por el estudiante";
        break;
      case "reenviar_admin":
        if (!isTutorCorrection) {
          throw new HttpError(403, "Solo el tutor asignado puede reenviar al administrador un proyecto devuelto para correcciones.");
        }
        nextStatus = "validado_tutor";
        updates.validatedAt = new Date();
        updates.observaciones = null;
        auditAction = "Proyecto reenviado al administrador por el tutor";
        break;
      case "devolver_tutor":
        if (!isAdminFinal) {
          throw new HttpError(403, "Solo el administrador puede devolver al tutor un proyecto pendiente de publicación.");
        }
        if (observaciones.length < 5) {
          throw new HttpError(400, "Escribe las correcciones que debe realizar el tutor.");
        }
        nextStatus = "devuelto_tutor";
        updates.observaciones = observaciones;
        auditAction = "Proyecto devuelto al tutor por el administrador";
        break;
      case "validar":
        if (!isReviewer) throw new HttpError(403, "Solo el tutor destinatario puede validar un proyecto en revisión.");
        nextStatus = "validado_tutor";
        updates.validatedAt = new Date();
        updates.observaciones = observaciones || null;
        auditAction = "Proyecto validado por el tutor";
        break;
      case "devolver":
        if (!isReviewer) throw new HttpError(403, "Solo el tutor destinatario puede devolver un proyecto.");
        if (observaciones.length < 5) throw new HttpError(400, "Indica las observaciones para el estudiante.");
        nextStatus = "devuelto";
        updates.observaciones = observaciones;
        auditAction = "Proyecto devuelto al estudiante";
        break;
      case "publicar":
        if (!isAdminFinal)
          throw new HttpError(403, "Solo el administrador puede publicar proyectos validados por el tutor.");
        if (!current.planilla)
          throw new HttpError(400, "No se puede publicar: falta la Planilla Firmada (requerida para aprobar).");
        nextStatus = "publicado";
        updates.publishedAt = new Date();
        updates.observaciones = observaciones || null;
        auditAction = "Proyecto publicado en el repositorio";
        break;
      case "rechazar":
        if (!isAdminFinal) throw new HttpError(403, "Solo el administrador puede rechazar proyectos validados.");
        if (observaciones.length < 5) throw new HttpError(400, "Indica el motivo del rechazo.");
        nextStatus = "rechazado";
        updates.observaciones = observaciones;
        auditAction = "Proyecto rechazado por el administrador";
        break;
      default:
        throw new HttpError(400, "Acción no reconocida.");
    }

    if (nextStatus) updates.status = nextStatus;

    await db.update(projects).set(updates).where(eq(projects.id, projectId));
    await logAudit({
      user,
      action: auditAction,
      entity: "proyecto",
      entityId: projectId,
      details: {
        estadoAnterior: current.status,
        estadoNuevo: nextStatus ?? current.status,
        observaciones: observaciones || undefined,
        camposModificados: Object.keys(md),
      },
    });

    const dto = await getProjectDTO(projectId);
    return Response.json({ project: dto });
  } catch (e) {
    return handleError(e);
  }
}
