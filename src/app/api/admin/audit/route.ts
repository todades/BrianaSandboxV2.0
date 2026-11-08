import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { handleError, requireUser } from "@/lib/auth";
import type { AuditDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser(["administrador"]);
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") || "200", 10), 500);
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
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
    }));
    return Response.json({ logs });
  } catch (e) {
    return handleError(e);
  }
}
