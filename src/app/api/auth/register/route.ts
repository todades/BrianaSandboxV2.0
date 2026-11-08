import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, hashPassword, HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { TRAYECTOS } from "@/lib/constants";
import { getAdminCredentials } from "@/lib/seed";
import { sendCode } from "@/lib/codes";
import type { CodeDispatch } from "@/lib/types";
import { cedulaValidationError, isValidEmailAddress, phoneValidationError } from "@/lib/validation";
import { ensureSchema } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";

/**
 * Registro de Estudiante o Tutor.
 * La cuenta queda PENDIENTE hasta confirmar el código de 6 dígitos enviado al correo.
 * No se crea sesión aquí.
 */
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = (await req.json()) as Record<string, string>;
    const accountType = (body.accountType || "").toLowerCase();
    const name = (body.name || "").trim();
    const cedula = (body.cedula || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const phone = (body.phone || "").trim();
    const trayecto = (body.trayecto || "").trim();
    const password = body.password || "";
    const confirm = body.confirm || "";

    // El rol administrador NO admite registro abierto.
    if (accountType !== "estudiante" && accountType !== "tutor") {
      throw new HttpError(400, "Tipo de cuenta inválido. Solo se permite Estudiante o Tutor.");
    }
    if (name.length < 3) throw new HttpError(400, "Ingresa tu nombre completo.");
    if (!/^[\p{L}]+(?:[ '\-’][\p{L}]+)*$/u.test(name)) {
      throw new HttpError(400, "El nombre completo solo puede contener letras, espacios, guion o apóstrofo; no se permiten números.");
    }
    if (!isValidEmailAddress(email)) {
      throw new HttpError(400, "Ingresa un correo válido (por ejemplo, nombre@gmail.com) y confirma que puedes recibir el código de verificación.");
    }
    if (email === getAdminCredentials().email) {
      throw new HttpError(400, "Ese correo está reservado para el administrador del sistema.");
    }
    const cedulaError = cedulaValidationError(cedula);
    if (cedulaError) throw new HttpError(400, cedulaError);
    const phoneError = phoneValidationError(phone);
    if (phoneError) throw new HttpError(400, phoneError);
    if (password.length < 6) throw new HttpError(400, "La contraseña debe tener al menos 6 caracteres.");
    if (password !== confirm) throw new HttpError(400, "Las contraseñas no coinciden.");
    if (accountType === "estudiante" && !(TRAYECTOS as readonly string[]).includes(trayecto)) {
      throw new HttpError(400, "Selecciona el trayecto del estudiante.");
    }

    const [exists] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (exists) {
      if (!exists.emailVerified) {
        // Cuenta creada pero nunca verificada: reenviamos el código y llevamos al usuario a la verificación.
        let dispatch: Partial<CodeDispatch> = {};
        let note: string | null = null;
        try {
          dispatch = await sendCode(exists, "verify_email");
        } catch (e) {
          note = e instanceof Error ? e.message : null;
        }
        throw new HttpError(409, "Esta cuenta ya existe pero aún no ha sido verificada. Introduce el código enviado a tu correo.", {
          needsVerification: true,
          email: exists.email,
          name: exists.name,
          delivered: dispatch.delivered ?? false,
          devCode: dispatch.devCode ?? null,
          expiresAt: dispatch.expiresAt ?? null,
          ttlMinutes: dispatch.ttlMinutes ?? null,
          cooldownSeconds: dispatch.cooldownSeconds ?? 60,
          mailError: dispatch.mailError ?? null,
          note,
        });
      }
      throw new HttpError(409, "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.");
    }

    const [created] = await db
      .insert(users)
      .values({
        name,
        email,
        cedula,
        phone: phone || null,
        trayecto: accountType === "estudiante" ? trayecto : null,
        role: accountType,
        passwordHash: hashPassword(password),
        emailVerified: false,
      })
      .returning();

    let dispatch: CodeDispatch | null = null;
    let sendError: string | null = null;
    try {
      dispatch = await sendCode(created, "verify_email");
    } catch (e) {
      sendError = e instanceof Error ? e.message : "No se pudo enviar el código de verificación.";
    }

    await logAudit({
      user: created,
      action: "REGISTRO_CUENTA",
      entity: "usuario",
      entityId: created.id,
      details: { role: created.role, email: created.email, codigoEnviado: dispatch?.delivered ?? false },
    });

    const payload: CodeDispatch & { pendingVerification: true } = {
      pendingVerification: true,
      email: created.email,
      name: created.name,
      delivered: dispatch?.delivered ?? false,
      devCode: dispatch?.devCode ?? null,
      expiresAt: dispatch?.expiresAt ?? null,
      ttlMinutes: dispatch?.ttlMinutes ?? null,
      cooldownSeconds: dispatch?.cooldownSeconds ?? 60,
      mailError: dispatch?.mailError ?? sendError,
    };
    return Response.json(payload, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
