import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, handleError, HttpError, toUserDTO, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureSystemAccounts, getAdminCredentials } from "@/lib/seed";
import { sendCode } from "@/lib/codes";
import type { CodeDispatch } from "@/lib/types";
import { ensureSchema, isSchemaError } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await handleLogin(req);
    } catch (e) {
      if (isSchemaError(e) && attempt === 0) {
        try {
          await ensureSchema(true);
        } catch (repairError) {
          return handleError(repairError);
        }
        continue;
      }
      return handleError(e);
    }
  }
  return handleError(new Error("No se pudo iniciar sesión."));
}

async function handleLogin(req: Request) {
  await ensureSchema();
  const body = (await req.json()) as { email?: string; password?: string };
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) throw new HttpError(400, "Ingresa tu correo y contraseña.");

  // Garantiza la existencia del administrador único antes de autenticar.
  await ensureSystemAccounts();

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if ((!user || !verifyPassword(password, user.passwordHash)) && email === getAdminCredentials().email) {
    // Si Render cambió ADMIN_EMAIL/ADMIN_PASSWORD, sincroniza una vez antes de rechazar.
    await ensureSystemAccounts(true);
    [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  }
  if (!user || !verifyPassword(password, user.passwordHash)) {
    await logAudit({ user: null, action: "LOGIN_FALLIDO", details: { email } });
    throw new HttpError(401, "Credenciales incorrectas.");
  }
  if (!user.isActive) throw new HttpError(403, "Tu cuenta está deshabilitada. Contacta al administrador institucional.");

  if (!user.emailVerified) {
    let dispatch: Partial<CodeDispatch> = {};
    let note: string | null = null;
    try {
      dispatch = await sendCode(user, "verify_email");
    } catch (e) {
      note = e instanceof Error ? e.message : null;
    }
    await logAudit({ user, action: "LOGIN_PENDIENTE_VERIFICACION", entity: "usuario", entityId: user.id });
    throw new HttpError(
      403,
      "Tu cuenta aún no ha sido verificada. Introduce el código de 6 dígitos enviado a tu correo.",
      {
        needsVerification: true,
        email: user.email,
        name: user.name,
        delivered: dispatch.delivered ?? false,
        devCode: dispatch.devCode ?? null,
        expiresAt: dispatch.expiresAt ?? null,
        ttlMinutes: dispatch.ttlMinutes ?? null,
        cooldownSeconds: dispatch.cooldownSeconds ?? 60,
        mailError: dispatch.mailError ?? null,
        note,
      }
    );
  }

  const sessionToken = await createSession(user);
  await logAudit({ user, action: "LOGIN", entity: "usuario", entityId: user.id });
  const payload = { user: toUserDTO(user) };
  // Cookie HttpOnly es el mecanismo normal. Solo en el preview embebido se
  // incluye un token para sessionStorage cuando el navegador bloquea cookies 3P.
  return Response.json(
    req.headers.get("x-briana-embedded") === "1" ? { ...payload, sessionToken } : payload
  );
}
