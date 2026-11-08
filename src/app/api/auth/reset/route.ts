import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, hashPassword, HttpError, revokeUserSessions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { consumeCode } from "@/lib/codes";
import { ensureSchema } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";

/** Paso 2 de recuperación: valida el código de 6 dígitos y cambia la contraseña. */
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = (await req.json()) as { email?: string; code?: string; password?: string; confirm?: string };
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();
    const password = body.password || "";
    const confirm = body.confirm || "";

    if (!email) throw new HttpError(400, "Correo requerido.");
    if (password.length < 6) throw new HttpError(400, "La nueva contraseña debe tener al menos 6 caracteres.");
    if (password !== confirm) throw new HttpError(400, "Las contraseñas no coinciden.");

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new HttpError(400, "Código inválido o cuenta inexistente.");

    await consumeCode(user, "reset_password", code);

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(password),
        // Al demostrar acceso al correo, la cuenta queda verificada.
        emailVerified: true,
        verifiedAt: user.verifiedAt ?? new Date(),
      })
      .where(eq(users.id, user.id));

    // Cierra todas las sesiones previas por seguridad.
    await revokeUserSessions(user.id);
    await logAudit({ user, action: "CONTRASENA_RESTABLECIDA", entity: "usuario", entityId: user.id });

    return Response.json({ ok: true, message: "Contraseña restablecida. Ya puedes iniciar sesión." });
  } catch (e) {
    return handleError(e);
  }
}
