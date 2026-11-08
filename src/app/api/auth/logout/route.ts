import { destroySession, getCurrentUser, handleError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (user) await logAudit({ user, action: "Cierre de sesión", entity: "usuario", entityId: user.id });
    await destroySession();
    return Response.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
