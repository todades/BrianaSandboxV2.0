import { handleError, HttpError, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getGeminiKey, maskKey, saveGeminiKey, verifyGeminiKey } from "@/lib/ai";
import { getAdminCredentials, getDemoTutor } from "@/lib/seed";
import { databaseProvider, databaseSsl } from "@/db";
import { isJwtSecretConfigured } from "@/lib/jwt";
import { getMailConfig } from "@/lib/mailer";
import { CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS } from "@/lib/codes";
import type { ServerSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser(["administrador"]);
    const { key, source } = await getGeminiKey();
    const admin = getAdminCredentials();
    const mail = getMailConfig();
    const payload: ServerSettings = {
      geminiConfigured: !!key,
      geminiSource: source,
      maskedKey: maskKey(key),
      envKeyPresent: !!process.env.GEMINI_API_KEY,
      adminEmail: admin.email,
      adminName: admin.name,
      env: {
        nodeEnv: process.env.NODE_ENV || "development",
        jwtSecret: isJwtSecretConfigured(),
        emailUser: !!mail.user,
        emailPass: !!mail.pass,
        emailFrom: mail.user ? mail.from : null,
        geminiKey: !!process.env.GEMINI_API_KEY,
        databaseProvider: databaseProvider(),
        databaseSsl,
        demoTutor: !!getDemoTutor(),
        codeTtlMinutes: CODE_TTL_MINUTES,
        resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
      },
    };
    return Response.json(payload);
  } catch (e) {
    return handleError(e);
  }
}

/** Actualiza la clave de Gemini en modo directo (se guarda solo en el servidor). */
export async function POST(req: Request) {
  try {
    const user = await requireUser(["administrador"]);
    const body = (await req.json()) as { geminiKey?: string };
    const key = (body.geminiKey || "").trim();
    if (!key) throw new HttpError(400, "Ingresa la clave de Gemini.");
    if (key.length < 20) throw new HttpError(400, "La clave parece incompleta.");

    const check = await verifyGeminiKey(key);
    await saveGeminiKey(key);
    await logAudit({
      user,
      action: "IA_CLAVE_ACTUALIZADA",
      entity: "configuracion",
      details: { verificada: check.ok, error: check.error },
    });

    return Response.json({
      ok: true,
      verified: check.ok,
      error: check.error,
      maskedKey: maskKey(key),
      envKeyPresent: !!process.env.GEMINI_API_KEY,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser(["administrador"]);
    await saveGeminiKey(null);
    await logAudit({ user, action: "IA_CLAVE_ELIMINADA", entity: "configuracion" });
    return Response.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
