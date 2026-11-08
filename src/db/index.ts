import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const DATABASE_URL: string = databaseUrl;

export type DatabaseProvider = "neon" | "render" | "local" | "otro";

/** Detecta el proveedor a partir de la URL (Neon, Render, local u otro). */
export function databaseProvider(url: string = DATABASE_URL): DatabaseProvider {
  if (/neon\.tech/i.test(url)) return "neon";
  if (/render\.com/i.test(url)) return "render";
  if (/@(localhost|127\.0\.0\.1)(:|\/)/i.test(url)) return "local";
  return "otro";
}

const provider = databaseProvider();
const sslEnv = process.env.DATABASE_SSL?.trim().toLowerCase();
// Neon / Render exigen TLS. Localmente se desactiva salvo que DATABASE_SSL=true.
export const databaseSsl = sslEnv ? sslEnv === "true" || sslEnv === "require" : provider !== "local";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: DATABASE_URL,
    ssl: databaseSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true" } : undefined,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

// Nota: Neon pooled (PgBouncer) rechaza parámetros de arranque (`options`).
// El search_path se fija con SET dentro de la migración, no al conectar.

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
