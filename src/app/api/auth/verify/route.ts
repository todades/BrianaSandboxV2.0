import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, handleError, HttpError, toUserDTO } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { consumeCode } from "@/lib/codes";

export const dynamic = "force-dynamic";

/** Confirma el código de 6 dígitos de registro y activa la cuenta (crea la sesión). */
export async function POST(req: Request) {
  try {
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
      await logAudit({ user, action: "Cuenta verificada", entity: "usuario", entityId: user.id });
    }

    const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const sessionToken = await createSession(fresh);
    await logAudit({ user: fresh, action: "Inicio de sesión tras verificación", entity: "usuario", entityId: fresh.id, details: { metodo: "verificacion" } });
    const payload = { user: toUserDTO(fresh) };
    return Response.json(
      req.headers.get("x-briana-embedded") === "1" ? { ...payload, sessionToken } : payload
    );
  } catch (e) {
    return handleError(e);
  }
}
