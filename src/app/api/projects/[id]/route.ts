import { and, eq, or } from "drizzle-orm";
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
        .select({ title: projects.title, pdfFileId: projects.pdfFileId, planillaFileId: projects.planillaFileId })
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

      return { title: current.title, removedFiles };
    });

    await logAudit({
      user,
      action: "PROYECTO_ELIMINADO",
      entity: "proyecto",
      entityId: projectId,
      details: { title: deleted.title, archivosEliminados: deleted.removedFiles },
    });

    return Response.json({ ok: true, id: projectId, title: deleted.title, archivosEliminados: deleted.removedFiles });
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
 *  - Estudiante (devuelto): "guardar" / "reenviar" -> enviado_tutor.
 *  - Tutor asignado (enviado_tutor o devuelto_tutor): puede "devolver" al estudiante,
 *    "validar" o "reenviar_admin" según el estado.
 *  - Administrador (validado_tutor): "devolver_tutor", "publicar" o "rechazar".
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
    const canReturnToStudent =
      user.role === "tutor" &&
      current.tutorId === user.id &&
      (current.status === "enviado_tutor" || current.status === "devuelto_tutor");
    const canEdit = isReviewer || isTutorCorrection || isAdminFinal || isStudentFix;

    if (Object.keys(md).length > 0) {
      if (!canEdit) throw new HttpError(403, "El proyecto no puede editarse en su estado actual por tu rol.");
      if (md.title !== undefined) {
        if (md.title.trim().length < 8) throw new HttpError(400, "El título es obligatorio.");
        updates.title = md.title.trim();
      }
      if (md.codigo !== undefined) updates.codigo = md.codigo.trim() || null;
      if (md.slug !== undefined) updates.slug = md.slug.trim() || slugify(updates.title ?? current.title);
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
      if (md.tutorId !== undefined) {
        if (user.role !== "estudiante") {
          const unchanged = md.tutorId === "" ? current.tutorId === null : Number(md.tutorId) === current.tutorId;
          if (!unchanged) {
            throw new HttpError(403, "La cuenta del tutor asignado no puede modificarse durante la revisión o corrección.");
          }
        } else if (md.tutorId !== "") {
          const tid = parseInt(md.tutorId, 10);
          const [t] = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(
              and(
                eq(users.id, tid),
                eq(users.role, "tutor"),
                eq(users.emailVerified, true),
                eq(users.isActive, true)
              )
            )
            .limit(1);
          if (!t) throw new HttpError(400, "Selecciona un tutor disponible.");
          updates.tutorId = t.id;
        }
      }
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
    let auditAction = "PROYECTO_ACTUALIZADO";

    switch (action) {
      case "guardar":
        if (!canEdit) throw new HttpError(403, "No puedes editar este proyecto ahora.");
        break;
      case "reenviar":
        if (!isStudentFix) throw new HttpError(403, "Solo el estudiante puede reenviar al tutor un proyecto devuelto.");
        nextStatus = "enviado_tutor";
        updates.observaciones = observaciones || null;
        auditAction = "PROYECTO_REENVIADO_TUTOR";
        break;
      case "reenviar_admin":
        if (!isTutorCorrection) {
          throw new HttpError(403, "Solo el tutor asignado puede reenviar al Administrador un proyecto devuelto para correcciones.");
        }
        nextStatus = "validado_tutor";
        updates.validatedAt = new Date();
        updates.observaciones = null;
        auditAction = "PROYECTO_REENVIADO_ADMIN";
        break;
      case "devolver_tutor":
        if (!isAdminFinal) {
          throw new HttpError(403, "Solo el Administrador puede devolver al tutor un proyecto pendiente de publicación.");
        }
        if (observaciones.length < 5) {
          throw new HttpError(400, "Escribe las correcciones que debe realizar el tutor.");
        }
        nextStatus = "devuelto_tutor";
        updates.observaciones = observaciones;
        auditAction = "PROYECTO_DEVUELTO_TUTOR";
        break;
      case "validar":
        if (!isReviewer) throw new HttpError(403, "Solo el tutor destinatario puede validar un proyecto en revisión.");
        nextStatus = "validado_tutor";
        updates.validatedAt = new Date();
        updates.observaciones = observaciones || null;
        auditAction = "PROYECTO_VALIDADO_TUTOR";
        break;
      case "devolver":
        if (!canReturnToStudent) {
          throw new HttpError(403, "Solo el tutor asignado puede devolver este proyecto al estudiante.");
        }
        if (observaciones.length < 5) throw new HttpError(400, "Indica las correcciones que debe realizar el estudiante.");
        nextStatus = "devuelto";
        updates.observaciones = observaciones;
        auditAction = "PROYECTO_DEVUELTO_ESTUDIANTE";
        break;
      case "publicar":
        if (!isAdminFinal)
          throw new HttpError(403, "Solo el administrador puede publicar proyectos validados por el tutor.");
        if (!current.planilla)
          throw new HttpError(400, "No se puede publicar: falta la Planilla Firmada (requerida para aprobar).");
        nextStatus = "publicado";
        updates.publishedAt = new Date();
        updates.observaciones = observaciones || null;
        auditAction = "PROYECTO_PUBLICADO";
        break;
      case "rechazar":
        if (!isAdminFinal) throw new HttpError(403, "Solo el administrador puede rechazar proyectos validados.");
        if (observaciones.length < 5) throw new HttpError(400, "Indica el motivo del rechazo.");
        nextStatus = "rechazado";
        updates.observaciones = observaciones;
        auditAction = "PROYECTO_RECHAZADO";
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
        de: current.status,
        a: nextStatus ?? current.status,
        observaciones: observaciones || undefined,
        camposEditados: Object.keys(md),
        correccionesPreviasDelAdministrador:
          action === "devolver" && current.status === "devuelto_tutor" ? current.observaciones ?? undefined : undefined,
      },
    });

    const dto = await getProjectDTO(projectId);
    return Response.json({ project: dto });
  } catch (e) {
    return handleError(e);
  }
}
