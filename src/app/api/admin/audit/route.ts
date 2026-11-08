import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { handleError, requireUser } from "@/lib/auth";
import { describeAudit } from "@/lib/audit-labels";
import type { AuditDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Consulta de solo lectura: conservar el historial completo y paginarlo. */
export async function GET(req: Request) {
  try {
    await requireUser(["administrador"]);
    const params = new URL(req.url).searchParams;
    const rawLimit = Number.parseInt(params.get("limit") || "100", 10);
    const rawOffset = Number.parseInt(params.get("offset") || "0", 10);
    const limit = Math.min(Number.isFinite(rawLimit) ? Math.max(rawLimit, 1) : 100, 100);
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const action = params.get("action")?.trim() || "";
    const where = action ? eq(auditLogs.action, action.slice(0, 80)) : undefined;

    const [rows, totals] = await Promise.all([
      db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit).offset(offset),
      db.select({ total: count() }).from(auditLogs).where(where),
    ]);

    const logs: AuditDTO[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userRole: r.userRole,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      readable: describeAudit(r.action, r.entity, r.userRole, r.details),
    }));

    return Response.json({ logs, total: totals[0]?.total ?? 0, offset, limit, action: action || null });
  } catch (e) {
    return handleError(e);
  }
}
