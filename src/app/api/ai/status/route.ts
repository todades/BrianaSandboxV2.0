import { sql } from "drizzle-orm";
import { db } from "@/db";
import { handleError, requireUser } from "@/lib/auth";
import { getGeminiKey, getModelName, maskKey, verifyGeminiKey } from "@/lib/ai";
import { getMailConfig, mailConfigured, maskEmail, verifyMailTransport } from "@/lib/mailer";
import type { AiStatus, MailStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Estado de la IA, del correo SMTP y del backend (sin exponer secretos). */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const verify = new URL(req.url).searchParams.get("verify") === "1";

    let dbOk = true;
    try {
      await db.execute(sql`select 1`);
    } catch {
      dbOk = false;
    }

    const { key, source } = await getGeminiKey();
    let active = !!key;
    let error: string | undefined;
    if (key && verify) {
      const check = await verifyGeminiKey(key);
      active = check.ok;
      error = check.error;
    }

    const mc = getMailConfig();
    const configured = mailConfigured();
    let mailVerified: boolean | null = null;
    let mailError: string | undefined;
    if (configured && verify && user.role === "administrador") {
      const check = await verifyMailTransport();
      mailVerified = check.ok;
      mailError = check.error;
    }
    const mail: MailStatus = {
      configured,
      devMode: !configured,
      host: configured ? mc.service || mc.host : null,
      port: configured && !mc.service ? mc.port : null,
      user: maskEmail(mc.user),
      from: configured ? mc.from : null,
      verified: mailVerified,
      error: mailError,
    };

    const status: AiStatus = {
      active,
      source,
      model: getModelName(),
      maskedKey: maskKey(key),
      dbOk,
      checkedAt: new Date().toISOString(),
      error,
      mail,
    };
    return Response.json(status);
  } catch (e) {
    return handleError(e);
  }
}
