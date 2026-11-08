import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./auth";
import { DEFAULT_ADMIN_EMAIL } from "./constants";

export function getAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Briana#Admin2025";
  const name = process.env.ADMIN_NAME || "administrador";
  return { email, password, name };
}

export function getDemoTutor() {
  const email = process.env.DEMO_TUTOR_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    name: process.env.DEMO_TUTOR_NAME || "Elias Vargas",
    password: process.env.DEMO_TUTOR_PASSWORD || "Tutor#2025",
  };
}

let lastEnsure = 0;

/**
 * Garantiza las cuentas del sistema:
 *  - UN ÚNICO Administrador predeterminado (ADMIN_EMAIL / ADMIN_PASSWORD en .env),
 *    verificado y sincronizado con las variables de entorno. Cualquier otro
 *    usuario con rol administrador es degradado a tutor.
 *  - Opcionalmente un tutor de demostración (DEMO_TUTOR_EMAIL) ya verificado.
 */
export async function ensureSystemAccounts(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastEnsure < 60_000) return; // throttle 60s
  lastEnsure = now;

  const { email, password, name } = getAdminCredentials();

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      name,
      email,
      passwordHash: hashPassword(password),
      role: "administrador",
      emailVerified: true,
      verifiedAt: new Date(),
    });
  } else {
    const admin = existing[0];
    const updates: Partial<typeof users.$inferInsert> = {};
    if (admin.role !== "administrador") updates.role = "administrador";
    if (admin.name !== name) updates.name = name;
    if (!admin.emailVerified) {
      updates.emailVerified = true;
      updates.verifiedAt = new Date();
    }
    if (!admin.isActive) updates.isActive = true;
    if (!verifyPassword(password, admin.passwordHash)) updates.passwordHash = hashPassword(password);
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, admin.id));
    }
  }

  // Administrador único: cualquier otro admin se degrada a tutor.
  const admins = await db.select().from(users).where(eq(users.role, "administrador"));
  for (const a of admins) {
    if (a.email !== email) {
      await db.update(users).set({ role: "tutor" }).where(eq(users.id, a.id));
    }
  }

  // Tutor de demostración (opcional, controlado por .env).
  const demo = getDemoTutor();
  if (demo && demo.email !== email) {
    const found = await db.select().from(users).where(eq(users.email, demo.email)).limit(1);
    if (found.length === 0) {
      await db.insert(users).values({
        name: demo.name,
        email: demo.email,
        passwordHash: hashPassword(demo.password),
        role: "tutor",
        cedula: "V-00000000",
        emailVerified: true,
        verifiedAt: new Date(),
      });
    } else if (!found[0].emailVerified) {
      await db.update(users).set({ emailVerified: true, verifiedAt: new Date() }).where(eq(users.id, found[0].id));
    }
  }
}

/** Alias retro-compatible. */
export const ensureAdmin = ensureSystemAccounts;
