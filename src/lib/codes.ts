import { createHash, randomInt, timingSafeEqual } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { verificationCodes, type UserRow } from "@/db/schema";
import { HttpError } from "./auth";
import { getJwtSecret } from "./jwt";
import { mailConfigured, sendCodeEmail, type CodePurpose } from "./mailer";
import type { CodeDispatch } from "./types";

export const CODE_TTL_MINUTES = Math.max(3, Number(process.env.CODE_TTL_MINUTES || 15));
export const RESEND_COOLDOWN_SECONDS = Math.max(0, Number(process.env.RESEND_COOLDOWN_SECONDS || 60));
const MAX_ATTEMPTS = 5;

function hashCode(code: string, userId: number, purpose: CodePurpose): string {
  // Se almacena solo el hash del código (con "pepper" del servidor), nunca el código en claro.
  return createHash("sha256").update(`${code}:${userId}:${purpose}:${getJwtSecret()}`).digest("hex");
}

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Emite un nuevo código de 6 dígitos (invalida los anteriores del mismo propósito). */
export async function issueCode(user: UserRow, purpose: CodePurpose): Promise<{ code: string; expiresAt: Date }> {
  const [last] = await db
    .select({ createdAt: verificationCodes.createdAt })
    .from(verificationCodes)
    .where(and(eq(verificationCodes.userId, user.id), eq(verificationCodes.purpose, purpose)))
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (last && RESEND_COOLDOWN_SECONDS > 0) {
    const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed);
      throw new HttpError(429, `Espera ${wait} segundo${wait === 1 ? "" : "s"} antes de solicitar otro código.`, {
        retryAfter: wait,
      });
    }
  }

  await db
    .delete(verificationCodes)
    .where(and(eq(verificationCodes.userId, user.id), eq(verificationCodes.purpose, purpose)));

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);
  await db.insert(verificationCodes).values({
    userId: user.id,
    email: user.email,
    purpose,
    codeHash: hashCode(code, user.id, purpose),
    expiresAt,
  });
  return { code, expiresAt };
}

/** Valida y consume un código. Lanza HttpError con mensaje claro si no es válido. */
export async function consumeCode(user: UserRow, purpose: CodePurpose, input: string): Promise<void> {
  const code = (input || "").replace(/\D/g, "");
  if (code.length !== 6) throw new HttpError(400, "El código debe tener 6 dígitos.");

  const [row] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.userId, user.id),
        eq(verificationCodes.purpose, purpose),
        isNull(verificationCodes.consumedAt)
      )
    )
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (!row) throw new HttpError(400, "No hay un código activo. Solicita uno nuevo.");

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(verificationCodes).where(eq(verificationCodes.id, row.id));
    throw new HttpError(400, "El código ha expirado. Solicita uno nuevo.");
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.delete(verificationCodes).where(eq(verificationCodes.id, row.id));
    throw new HttpError(429, "Demasiados intentos fallidos. Solicita un nuevo código.");
  }

  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashCode(code, user.id, purpose), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    const attempts = row.attempts + 1;
    await db.update(verificationCodes).set({ attempts }).where(eq(verificationCodes.id, row.id));
    const left = MAX_ATTEMPTS - attempts;
    throw new HttpError(
      400,
      left > 0
        ? `Código incorrecto. Te queda${left === 1 ? "" : "n"} ${left} intento${left === 1 ? "" : "s"}.`
        : "Código incorrecto. Solicita un nuevo código."
    );
  }

  await db.update(verificationCodes).set({ consumedAt: new Date() }).where(eq(verificationCodes.id, row.id));
}

/** Emite el código y lo envía por correo (nodemailer). Sin SMTP → modo desarrollo. */
export async function sendCode(user: UserRow, purpose: CodePurpose): Promise<CodeDispatch> {
  const { code, expiresAt } = await issueCode(user, purpose);
  const mail = await sendCodeEmail({
    to: user.email,
    name: user.name,
    code,
    purpose,
    ttlMinutes: CODE_TTL_MINUTES,
  });
  const devMode = !mailConfigured();
  return {
    email: user.email,
    name: user.name,
    delivered: mail.delivered,
    // Sin servidor SMTP configurado se expone el código para poder probar el flujo.
    devCode: devMode ? code : null,
    expiresAt: expiresAt.toISOString(),
    ttlMinutes: CODE_TTL_MINUTES,
    cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    mailError: mail.error ?? null,
  };
}
