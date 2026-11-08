import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Las cuentas administrativas nunca son destinatarias del flujo de tutoría.
 * Los tutores verificados se ordenan alfabéticamente; los inactivos se
 * conservan en la lista para mostrarlos como «No disponible», pero no se
 * pueden seleccionar para recibir nuevos proyectos.
 */
export async function GET() {
  try {
    await requireUser();
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.role, "tutor"), eq(users.approvalStatus, "approved")))
      .orderBy(asc(sql`lower(${users.name})`), asc(users.name));
    return Response.json({ tutors: rows });
  } catch (e) {
    return handleError(e);
  }
}
