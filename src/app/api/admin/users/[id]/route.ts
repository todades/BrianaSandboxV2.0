import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, HttpError, requireUser, revokeUserSessions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Solo el administrador puede cambiar la disponibilidad de una cuenta de tutor. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const admin = await requireUser(["administrador"]);
    const { id: rawId } = await ctx.params;
    const id = Number.parseInt(rawId, 10);
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identificador de usuario inválido.");

    const body = (await req.json()) as { isActive?: unknown };
    if (typeof body.isActive !== "boolean") throw new HttpError(400, "Indica si la cuenta debe estar activa.");

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new HttpError(404, "Cuenta no encontrada.");
    if (target.role !== "tutor") throw new HttpError(400, "Solo se puede cambiar la disponibilidad de cuentas Tutor.");

    await db.update(users).set({ isActive: body.isActive }).where(eq(users.id, id));
    if (!body.isActive) await revokeUserSessions(id);

    await logAudit({
      user: admin,
      action: body.isActive ? "Tutor activado" : "Tutor deshabilitado",
      entity: "usuario",
      entityId: id,
      details: { tutor: target.name, correo: target.email, activo: body.isActive },
    });

    return Response.json({ id, name: target.name, email: target.email, role: "tutor" as const, isActive: body.isActive });
  } catch (e) {
    return handleError(e);
  }
}
