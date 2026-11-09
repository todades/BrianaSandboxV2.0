import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";

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
    "id", "title", "codigo", "slug", "tipo_recurso", "pnf", "linea_investigacion", "autores",
    "tutor_nombre", "tutor_id", "student_id", "anio", "trayecto", "palabras_clave", "resumen",
    "pdf_file_id", "planilla_file_id", "status", "observaciones", "ai_source", "validated_at",
    "published_at", "created_at", "updated_at",
  ],
  audit_logs: ["id", "user_id", "user_name", "user_role", "action", "entity", "entity_id", "details", "created_at"],
  settings: ["key", "value", "updated_at"],
};

const REQUIRED_TABLES = Object.keys(REQUIRED_COLUMNS);

const REQUIRED_ENUM_LABELS: Record<string, readonly string[]> = {
  user_role: ["estudiante", "tutor", "administrador"],
  user_approval_status: ["pending", "approved", "rejected"],
  code_purpose: ["verify_email", "reset_password"],
  project_status: ["enviado_tutor", "devuelto", "devuelto_tutor", "validado_tutor", "publicado", "rechazado"],
};

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
  return code === "42703" || code === "42P01" || code === "42704" || code === "0A000" || code === "SCHEMA_INCOMPLETE";
}

export interface UsersColumnInfo {
  column: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
}

export interface SchemaStatus {
  ok: boolean;
  host: string | null;
  missingTables: string[];
  missingColumns: string[];
  missingEnums: string[];
  /** Columnas heredadas NOT NULL sin valor predeterminado que bloquean INSERT de cuentas. */
  registrationBlockers: string[];
  /** Tipos heredados incompatibles (p. ej. booleanos creados como texto/número). */
  typeProblems: string[];
  usersColumns: UsersColumnInfo[];
  enumLabels: Record<string, string[]>;
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
    const columnsResult = await db.execute<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
      is_identity: string;
      is_generated: string;
    }>(sql`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, is_identity, is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (${sql.join(REQUIRED_TABLES.map((t) => sql`${t}`), sql`, `)})
    `);
    const enumsResult = await db.execute<{ typname: string; enumlabel: string }>(sql`
      SELECT t.typname, e.enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname IN (${sql.join(Object.keys(REQUIRED_ENUM_LABELS).map((t) => sql`${t}`), sql`, `)})
      ORDER BY t.typname, e.enumsortorder
    `);

    const tables = new Set(tablesResult.rows.map((r) => r.table_name));
    const columns = new Set(columnsResult.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missingTables = REQUIRED_TABLES.filter((t) => !tables.has(t));
    const missingColumns = REQUIRED_TABLES.flatMap((table) =>
      REQUIRED_COLUMNS[table].filter((column) => !columns.has(`${table}.${column}`)).map((column) => `${table}.${column}`)
    );

    const enumLabels: Record<string, string[]> = {};
    for (const row of enumsResult.rows) {
      (enumLabels[row.typname] ??= []).push(row.enumlabel);
    }
    const missingEnums: string[] = [];
    for (const [typname, labels] of Object.entries(REQUIRED_ENUM_LABELS)) {
      for (const label of labels) {
        if (!enumLabels[typname]?.includes(label)) missingEnums.push(`${typname}.${label}`);
      }
    }

    const registrationBlockers = columnsResult.rows
      .filter((c) => c.table_name === "users")
      .filter((c) => !REQUIRED_COLUMNS.users.includes(c.column_name))
      .filter((c) => c.is_nullable === "NO" && c.column_default === null && c.is_identity !== "YES" && c.is_generated === "NEVER")
      .map((c) => c.column_name);

    const usersColumns: UsersColumnInfo[] = columnsResult.rows
      .filter((c) => c.table_name === "users")
      .map((c) => ({
        column: c.column_name,
        type: c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type,
        nullable: c.is_nullable === "YES",
        hasDefault: c.column_default !== null || c.is_identity === "YES",
      }))
      .sort((a, b) => a.column.localeCompare(b.column));

    const typeProblems: string[] = [];
    const byName = new Map(usersColumns.map((c) => [c.column, c]));
    const isActive = byName.get("is_active");
    if (isActive && isActive.type !== "boolean") {
      typeProblems.push(`users.is_active debe ser boolean (es ${isActive.type})`);
    }
    const verified = byName.get("email_verified");
    if (verified && verified.type !== "boolean") {
      typeProblems.push(`users.email_verified debe ser boolean (es ${verified.type})`);
    }
    const idCol = byName.get("id");
    if (idCol && !idCol.hasDefault) {
      typeProblems.push("users.id no tiene valor predeterminado (los registros nuevos fallarían)");
    }
    const role = byName.get("role");
    if (role && role.type !== "user_role" && !["character varying", "character", "text"].includes(role.type)) {
      typeProblems.push(`users.role tiene un tipo inesperado (${role.type})`);
    }
    const approval = byName.get("approval_status");
    if (approval && approval.type !== "user_approval_status" && !["character varying", "character", "text"].includes(approval.type)) {
      typeProblems.push(`users.approval_status tiene un tipo inesperado (${approval.type})`);
    }

    return {
      ok:
        missingTables.length === 0 &&
        missingColumns.length === 0 &&
        missingEnums.length === 0 &&
        registrationBlockers.length === 0 &&
        typeProblems.length === 0,
      host,
      missingTables,
      missingColumns,
      missingEnums,
      registrationBlockers,
      typeProblems,
      usersColumns,
      enumLabels,
    };
  } catch (e) {
    return {
      ok: false,
      host,
      missingTables: [...REQUIRED_TABLES],
      missingColumns: REQUIRED_TABLES.flatMap((table) => REQUIRED_COLUMNS[table].map((column) => `${table}.${column}`)),
      missingEnums: ["project_status.devuelto_tutor"],
      registrationBlockers: [],
      typeProblems: [],
      usersColumns: [],
      enumLabels: {},
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
      // Las dos partes se ejecutan en llamadas SEPARADAS: la PARTE 1 (enums)
      // debe confirmarse antes de que la PARTE 2 use los valores nuevos.
      // Enviarlo todo junto en una sola llamada provoca 55P04
      // ("unsafe use of new value") en algunas rutas de ejecución.
      const marker = "\n-- ==PART2==\n";
      const at = script.indexOf(marker);
      if (at === -1) throw new Error("Marcador -- ==PART2== ausente en production-schema.sql.");
      await pool.query(script.slice(0, at));
      await pool.query(script.slice(at + marker.length));

      const status = await schemaStatus();
      if (!status.ok) {
        const details = [
          ...status.missingTables.map((t) => `tabla ${t}`),
          ...status.missingColumns,
          ...status.missingEnums,
          ...status.registrationBlockers.map((c) => `columna heredada NOT NULL users.${c}`),
          ...status.typeProblems,
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
