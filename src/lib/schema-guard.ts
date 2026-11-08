import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";

/**
 * BRIANA · Auto-reparación de esquema.
 *
 * Aplica scripts/production-schema.sql (idempotente) contra la MISMA base que
 * usa la aplicación (DATABASE_URL). Se ejecuta una vez por proceso y se
 * re-intenta si falla. No borra datos.
 */
const REQUIRED_TABLES = [
  "users",
  "verification_codes",
  "sessions",
  "files",
  "projects",
  "audit_logs",
  "settings",
] as const;

const REQUIRED_USER_COLUMNS = [
  "id",
  "name",
  "email",
  "password_hash",
  "role",
  "cedula",
  "phone",
  "trayecto",
  "email_verified",
  "is_active",
  "verified_at",
  "created_at",
] as const;

let done = false;
let pending: Promise<void> | null = null;

export function isSchemaError(e: unknown): boolean {
  const code =
    (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "42703" || code === "42P01" || code === "42704";
}

export async function ensureSchema(): Promise<void> {
  if (done) return;
  if (!pending) {
    const run = (async () => {
      const file = path.join(process.cwd(), "scripts", "production-schema.sql");
      const script = fs.readFileSync(file, "utf8");
      // pool.query sin parámetros usa el protocolo simple de PostgreSQL,
      // que permite ejecutar el script completo (BEGIN ... COMMIT) en una llamada.
      await pool.query(script);
      done = true;
    })();
    pending = run.finally(() => {
      pending = null;
    });
  }
  return pending;
}

export interface SchemaStatus {
  ok: boolean;
  host: string | null;
  missingTables: string[];
  missingColumns: string[];
  error?: string;
}

export async function schemaStatus(): Promise<SchemaStatus> {
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL || "").hostname;
  } catch {
    host = null;
  }
  try {
    const tablesResult = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (${sql.join(
        REQUIRED_TABLES.map((t) => sql`${t}`),
        sql`, `
      )})
    `);
    const columnsResult = await db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN (${sql.join(
        REQUIRED_USER_COLUMNS.map((c) => sql`${c}`),
        sql`, `
      )})
    `);
    const tables = new Set(tablesResult.rows.map((r) => r.table_name));
    const columns = new Set(columnsResult.rows.map((r) => r.column_name));
    const missingTables = REQUIRED_TABLES.filter((t) => !tables.has(t));
    const missingColumns = REQUIRED_USER_COLUMNS.filter((c) => !columns.has(c));
    return { ok: missingTables.length === 0 && missingColumns.length === 0, host, missingTables, missingColumns };
  } catch (e) {
    return {
      ok: false,
      host,
      missingTables: [...REQUIRED_TABLES],
      missingColumns: [...REQUIRED_USER_COLUMNS],
      error: e instanceof Error ? e.message : "No se pudo consultar el esquema.",
    };
  }
}
