import { db } from "@/db";
import { auditLogs, type UserRow } from "@/db/schema";

export async function logAudit(params: {
  user: UserRow | null;
  action: string;
  entity?: string;
  entityId?: number | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: params.user?.id ?? null,
      userName: params.user?.name ?? "Sistema",
      userRole: params.user?.role ?? "sistema",
      action: params.action,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      details: params.details ?? null,
    });
  } catch (e) {
    console.error("[BRIANA] No se pudo registrar auditoría:", e);
  }
}
