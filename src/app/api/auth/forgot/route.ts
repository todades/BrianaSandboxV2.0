import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendCode } from "@/lib/codes";
import { isValidEmailAddress } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Paso 1 de recuperación: envía un código de 6 dígitos al correo registrado. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = (body.email || "").trim().toLowerCase();
    if (!isValidEmailAddress(email)) throw new HttpError(400, "Ingresa un correo válido, por ejemplo nombre@gmail.com.");

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      // No revelamos si el correo existe.
      return Response.json({
        ok: true,
        email,
        delivered: false,
        devCode: null,
        expiresAt: null,
        ttlMinutes: null,
        cooldownSeconds: 60,
        mailError: null,
        note: "Si el correo está registrado en BRIANA, recibirás un código de 6 dígitos.",
      });
    }

    const dispatch = await sendCode(user, "reset_password");
    await logAudit({
      user,
      action: "Solicitud de recuperación de contraseña",
      entity: "usuario",
      entityId: user.id,
      details: { codigoEnviado: dispatch.delivered },
    });
    return Response.json({ ok: true, ...dispatch });
  } catch (e) {
    return handleError(e);
  }
}
