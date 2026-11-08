import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { files, projects, users } from "@/db/schema";
import { handleError, HttpError, requireUser, revokeUserSessions, toUserDTO } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ApprovalStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identificador de usuario inválido.");
  return id;
}

/** El administrador puede aprobar/rechazar tutores y activar/desactivar cuentas no administrativas. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const admin = await requireUser(["administrador"]);
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId);
    const body = (await req.json()) as { isActive?: unknown; approvalStatus?: unknown };

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new HttpError(404, "Cuenta no encontrada.");
    if (target.role === "administrador") throw new HttpError(400, "No se puede modificar la cuenta de administrador desde esta acción.");

    const updates: Partial<typeof users.$inferInsert> = {};
    let auditAction = "CUENTA_ACTUALIZADA";

    if (body.approvalStatus !== undefined) {
      if (target.role !== "tutor") throw new HttpError(400, "Solo las cuentas de tutor tienen solicitud de aprobación.");
      if (body.approvalStatus !== "pending" && body.approvalStatus !== "approved" && body.approvalStatus !== "rejected") {
        throw new HttpError(400, "Estado de aprobación inválido.");
      }
      const approvalStatus = body.approvalStatus as ApprovalStatus;
      updates.approvalStatus = approvalStatus;
      updates.isActive = approvalStatus === "approved";
      auditAction = approvalStatus === "approved" ? "TUTOR_APROBADO" : approvalStatus === "rejected" ? "TUTOR_RECHAZADO" : "TUTOR_PENDIENTE";
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") throw new HttpError(400, "Indica si la cuenta debe estar activa.");
      if (target.role === "tutor" && (updates.approvalStatus ?? target.approvalStatus) !== "approved" && body.isActive) {
        throw new HttpError(400, "Aprueba la solicitud de tutor antes de activar la cuenta.");
      }
      updates.isActive = body.isActive;
      if (body.approvalStatus === undefined) auditAction = body.isActive ? "CUENTA_ACTIVADA" : "CUENTA_DESACTIVADA";
    }

    if (Object.keys(updates).length === 0) throw new HttpError(400, "No se envió ningún cambio.");

    await db.update(users).set(updates).where(eq(users.id, id));
    if (updates.isActive === false || (updates.approvalStatus && updates.approvalStatus !== "approved")) {
      await revokeUserSessions(id);
    }

    const [fresh] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    await logAudit({
      user: admin,
      action: auditAction,
      entity: "usuario",
      entityId: id,
      details: { cuenta: target.name, email: target.email, role: target.role, approvalStatus: fresh.approvalStatus, isActive: fresh.isActive },
    });

    return Response.json({ user: toUserDTO(fresh) });
  } catch (e) {
    return handleError(e);
  }
}

/** Elimina cuentas de estudiante o tutor. Conserva auditoría y limpia archivos huérfanos de proyectos del estudiante. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const admin = await requireUser(["administrador"]);
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId);
    if (id === admin.id) throw new HttpError(400, "No puedes eliminar tu propia cuenta de administrador.");

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new HttpError(404, "Cuenta no encontrada.");
    if (target.role === "administrador") throw new HttpError(400, "No se puede eliminar una cuenta de administrador.");

    await db.transaction(async (tx) => {
      const ownedProjects = await tx
        .select({ id: projects.id, pdfFileId: projects.pdfFileId, planillaFileId: projects.planillaFileId })
        .from(projects)
        .where(eq(projects.studentId, id));

      if (ownedProjects.length) {
        await tx.delete(projects).where(eq(projects.studentId, id));
      }

      const fileIds = [...new Set(ownedProjects.flatMap((p) => [p.pdfFileId, p.planillaFileId]).filter((v): v is number => v !== null))];
      for (const fileId of fileIds) {
        const [stillUsed] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(or(eq(projects.pdfFileId, fileId), eq(projects.planillaFileId, fileId)))
          .limit(1);
        if (!stillUsed) await tx.delete(files).where(eq(files.id, fileId));
      }

      await tx.delete(users).where(eq(users.id, id));
    });

    await logAudit({
      user: admin,
      action: "CUENTA_ELIMINADA",
      entity: "usuario",
      entityId: id,
      details: { cuenta: target.name, email: target.email, role: target.role },
    });

    return Response.json({ ok: true, id });
  } catch (e) {
    return handleError(e);
  }
}
