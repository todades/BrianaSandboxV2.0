import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendCode } from "@/lib/codes";

export const dynamic = "force-dynamic";

/** Reenvía un código de 6 dígitos (verificación o recuperación) respetando el cooldown. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; purpose?: string };
    const email = (body.email || "").trim().toLowerCase();
    const purpose = body.purpose === "reset_password" ? "reset_password" : "verify_email";
    if (!email) throw new HttpError(400, "Correo requerido.");

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      // Respuesta genérica para no revelar si el correo existe.
      return Response.json({
        email,
        delivered: false,
        devCode: null,
        expiresAt: null,
        ttlMinutes: null,
        cooldownSeconds: 60,
        mailError: null,
        note: "Si el correo está registrado, recibirás un código.",
      });
    }
    if (purpose === "verify_email" && user.emailVerified) {
      throw new HttpError(400, "La cuenta ya está verificada. Inicia sesión.");
    }

    const dispatch = await sendCode(user, purpose);
    await logAudit({
      user,
      action: purpose === "verify_email" ? "Código de verificación reenviado" : "Código de recuperación reenviado",
      entity: "usuario",
      entityId: user.id,
      details: { correo: user.email, codigoEnviado: dispatch.delivered },
    });
    return Response.json(dispatch);
  } catch (e) {
    return handleError(e);
  }
}
