import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./auth";
import { DEFAULT_ADMIN_EMAIL } from "./constants";

export const DEFAULT_ADMIN_PASSWORD = "Briana#Admin2025";

export function getAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "administrador";
  return { email, password, name };
}

export function getAdminPasswordSource() {
  return process.env.ADMIN_PASSWORD?.trim() ? "ADMIN_PASSWORD" : "fallback";
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
let pending: Promise<void> | null = null;

/**
 * Garantiza las cuentas del sistema en una transacción:
 * - Un único administrador sincronizado con ADMIN_EMAIL / ADMIN_PASSWORD.
 * - Si cambia ADMIN_EMAIL, degrada al administrador anterior antes de crear/promover el nuevo.
 * - Tutor de demostración opcional.
 */
export async function ensureSystemAccounts(force = false): Promise<void> {
  if (force) lastEnsure = 0;
  if (!force && Date.now() - lastEnsure < 60_000) return;
  if (pending) return pending;

  pending = (async () => {
    const { email, password, name } = getAdminCredentials();

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('briana:admin-seed'))`);

      // Degradar cualquier administrador distinto antes de insertar/promover,
      // para no violar el índice único de administrador.
      await tx
        .update(users)
        .set({ role: "tutor" })
        .where(and(eq(users.role, "administrador"), ne(users.email, email)));

      const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1);

      if (!existing) {
        await tx.insert(users).values({
          name,
          email,
          passwordHash: hashPassword(password),
          role: "administrador",
          emailVerified: true,
          isActive: true,
          verifiedAt: new Date(),
        });
      } else {
        const updates: Partial<typeof users.$inferInsert> = {
          role: "administrador",
          name,
          emailVerified: true,
          isActive: true,
        };
        if (!existing.verifiedAt) updates.verifiedAt = new Date();
        if (!existing.passwordHash || !verifyPassword(password, existing.passwordHash)) {
          updates.passwordHash = hashPassword(password);
        }
        await tx.update(users).set(updates).where(eq(users.id, existing.id));
      }

      const demo = getDemoTutor();
      if (demo && demo.email !== email) {
        const [found] = await tx.select().from(users).where(eq(users.email, demo.email)).limit(1);
        if (!found) {
          await tx.insert(users).values({
            name: demo.name,
            email: demo.email,
            passwordHash: hashPassword(demo.password),
            role: "tutor",
            emailVerified: true,
            isActive: true,
            verifiedAt: new Date(),
          });
        } else {
          await tx
            .update(users)
            .set({ role: "tutor", emailVerified: true, isActive: true, verifiedAt: found.verifiedAt ?? new Date() })
            .where(eq(users.id, found.id));
        }
      }
    });

    lastEnsure = Date.now();
  })();

  try {
    await pending;
  } catch (e) {
    lastEnsure = 0;
    throw e;
  } finally {
    pending = null;
  }
}

/** Alias retro-compatible. */
export const ensureAdmin = ensureSystemAccounts;
