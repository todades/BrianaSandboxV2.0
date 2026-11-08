import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, requireUser } from "@/lib/auth";
import { DEFAULT_ADMIN_EMAIL } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Lista ordenada alfabéticamente de destinatarios verificados.
 * Los estudiantes nunca reciben el administrador como opción de tutor.
 * Los tutores inactivos se incluyen con isActive=false para mostrarlos deshabilitados.
 * El correo del administrador nunca aparece en la lista de tutores destinatarios.
 */
export async function GET() {
  try {
    const current = await requireUser();
    const recipientRoles: ("tutor" | "administrador")[] =
      current.role === "estudiante" ? ["tutor"] : ["tutor", "administrador"];
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(
        and(
          inArray(users.role, recipientRoles),
          eq(users.emailVerified, true),
          eq(users.isActive, true),
          sql`${users.email} <> ${DEFAULT_ADMIN_EMAIL}`
        )
      )
      .orderBy(asc(sql`lower(${users.name})`), asc(users.name));
    return Response.json({ tutors: rows });
  } catch (e) {
    return handleError(e);
  }
}
