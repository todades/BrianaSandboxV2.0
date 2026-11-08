import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, handleError, HttpError, toUserDTO } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { consumeCode } from "@/lib/codes";
import { ensureSchema } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";

/** Confirma el código de 6 dígitos de registro y activa la cuenta (crea la sesión). */
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = (await req.json()) as { email?: string; code?: string };
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();
    if (!email) throw new HttpError(400, "Correo requerido.");

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new HttpError(404, "No existe una cuenta con ese correo.");

    if (!user.emailVerified) {
      await consumeCode(user, "verify_email", code);
      await db
        .update(users)
        .set({ emailVerified: true, verifiedAt: new Date() })
        .where(eq(users.id, user.id));
      await logAudit({ user, action: "CUENTA_VERIFICADA", entity: "usuario", entityId: user.id });
    }

    const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (fresh.role === "tutor" && fresh.approvalStatus === "pending") {
      throw new HttpError(403, "Correo verificado. Tu solicitud de tutor quedó pendiente de aprobación por el administrador.", { approvalPending: true });
    }
    if (fresh.role === "tutor" && fresh.approvalStatus === "rejected") {
      throw new HttpError(403, "Tu solicitud de tutor fue rechazada por el administrador.", { approvalRejected: true });
    }
    if (!fresh.isActive) throw new HttpError(403, "Tu cuenta está deshabilitada. Contacta al administrador institucional.");
    const sessionToken = await createSession(fresh);
    await logAudit({ user: fresh, action: "LOGIN", entity: "usuario", entityId: fresh.id, details: { via: "verificacion" } });
    const payload = { user: toUserDTO(fresh) };
    return Response.json(
      req.headers.get("x-briana-embedded") === "1" ? { ...payload, sessionToken } : payload
    );
  } catch (e) {
    return handleError(e);
  }
}
