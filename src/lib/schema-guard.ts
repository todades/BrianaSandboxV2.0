import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * BRIANA · Auto-reparación de esquema.
 * Aplica scripts/production-schema.sql contra la misma base de DATABASE_URL,
 * verifica el resultado y solo entonces marca la reparación como terminada.
 */
const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  users: [
    "id", "name", "email", "password_hash", "role", "cedula", "phone", "trayecto",
    "email_verified", "is_active", "approval_status", "verified_at", "created_at",
  ],
  verification_codes: [
    "id", "user_id", "email", "purpose", "code_hash", "attempts", "expires_at", "consumed_at", "created_at",
  ],
  sessions: ["id", "user_id", "expires_at", "created_at"],
  files: ["id", "filename", "mime_type", "size", "kind", "data", "uploaded_by", "created_at"],
  projects: [
    "id", "titulo", "codigo", "slug", "tipo_recurso", "pnf", "linea_investigacion", "autores",
    "tutor_nombre", "tutor_id", "student_id", "anio", "trayecto", "palabras_clave", "resumen",
    "pdf_file_id", "planilla_file_id", "status", "observaciones", "ai_source", "validated_at",
    "published_at", "created_at", "updated_at",
  ],
  audit_logs: ["id", "user_id", "user_name", "user_role", "action", "entity", "entity_id", "details", "created_at"],
  settings: ["key", "value", "updated_at"],
};

const REQUIRED_TABLES = Object.keys(REQUIRED_COLUMNS);

let done = false;
let pending: Promise<void> | null = null;

function errorCode(e: unknown): string | undefined {
  let current: unknown = e;
  for (let i = 0; i < 6 && current && typeof current === "object"; i += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isSchemaError(e: unknown): boolean {
  const code = errorCode(e);
  return code === "42703" || code === "42P01" || code === "42704" || code === "SCHEMA_INCOMPLETE";
}

export interface SchemaStatus {
  ok: boolean;
  host: string | null;
  missingTables: string[];
  missingColumns: string[];
  missingEnums: string[];
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
      WHERE table_schema = 'public' AND table_name IN (${sql.join(REQUIRED_TABLES.map((t) => sql`${t}`), sql`, `)})
    `);
    const columnsResult = await db.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (${sql.join(REQUIRED_TABLES.map((t) => sql`${t}`), sql`, `)})
    `);
    const enumResult = await db.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'project_status' AND e.enumlabel = 'devuelto_tutor'
    `);

    const tables = new Set(tablesResult.rows.map((r) => r.table_name));
    const columns = new Set(columnsResult.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missingTables = REQUIRED_TABLES.filter((t) => !tables.has(t));
    const missingColumns = REQUIRED_TABLES.flatMap((table) =>
      REQUIRED_COLUMNS[table].filter((column) => !columns.has(`${table}.${column}`)).map((column) => `${table}.${column}`)
    );
    const missingEnums = enumResult.rows.length === 0 ? ["project_status.devuelto_tutor"] : [];

    return {
      ok: missingTables.length === 0 && missingColumns.length === 0 && missingEnums.length === 0,
      host,
      missingTables,
      missingColumns,
      missingEnums,
    };
  } catch (e) {
    return {
      ok: false,
      host,
      missingTables: [...REQUIRED_TABLES],
      missingColumns: REQUIRED_TABLES.flatMap((table) => REQUIRED_COLUMNS[table].map((column) => `${table}.${column}`)),
      missingEnums: ["project_status.devuelto_tutor"],
      error: e instanceof Error ? e.message : "No se pudo consultar el esquema.",
    };
  }
}

export async function ensureSchema(force = false): Promise<void> {
  if (force) done = false;
  if (done) return;

  if (!pending) {
    const run = (async () => {
      const file = path.join(process.cwd(), "scripts", "production-schema.sql");
      const script = fs.readFileSync(file, "utf8");
      await db.execute(sql.raw(script));

      const status = await schemaStatus();
      if (!status.ok) {
        const details = [
          ...status.missingTables.map((t) => `tabla ${t}`),
          ...status.missingColumns,
          ...status.missingEnums,
        ].join(", ");
        const error = new Error(`La migración terminó, pero el esquema sigue incompleto: ${details || status.error || "desconocido"}`);
        (error as Error & { code?: string }).code = "SCHEMA_INCOMPLETE";
        throw error;
      }
      done = true;
    })();

    pending = run.finally(() => {
      pending = null;
    });
  }

  return pending;
}
