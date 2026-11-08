import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, HttpError, requireUser, toUserDTO } from "@/lib/auth";
import { APPROVAL_LABEL, ROLE_LABEL, type ApprovalStatus, type Role } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Directorio de solo lectura para filtrar los reportes por tipo de cuenta. */
export async function GET(req: Request) {
  try {
    await requireUser(["administrador"]);
    const params = new URL(req.url).searchParams;
    const role = params.get("role");
    const approvalStatus = params.get("approvalStatus");
    if (role && !(role in ROLE_LABEL)) throw new HttpError(400, "Tipo de cuenta inválido.");
    if (approvalStatus && !(approvalStatus in APPROVAL_LABEL)) throw new HttpError(400, "Estado de aprobación inválido.");
    const conditions: SQL[] = [];
    if (role) conditions.push(eq(users.role, role as Role));
    if (approvalStatus) conditions.push(eq(users.approvalStatus, approvalStatus as ApprovalStatus));
    const rows = await db
      .select()
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(users.role), asc(sql`lower(${users.name})`), asc(users.name));
    return Response.json({ users: rows.map(toUserDTO) });
  } catch (e) {
    return handleError(e);
  }
}
