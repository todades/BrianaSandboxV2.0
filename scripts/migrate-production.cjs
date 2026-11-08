/**
 * BRIANA · Migración idempotente de producción.
 *
 * Uso local o en Render Shell:
 *   DATABASE_URL="postgresql://..." node scripts/migrate-production.cjs
 *
 * También se ejecuta automáticamente desde server.js antes de aceptar tráfico.
 * No borra datos: solo crea lo que falta (columnas, tablas, índices, enums).
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { sql } = require("drizzle-orm");

const PLACEHOLDER_DATABASE_HOSTS = new Set([
  "base",
  "host",
  "hostname",
  "example",
  "example.com",
  "tu-host",
  "tuhost",
  "tudominio",
  "ep-xxxx",
  "ep-xxxx.us-east-2.aws.neon.tech",
  "xxx",
  "xxx.neon.tech",
]);

function databaseHost(connectionString) {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isPlaceholderDatabaseHost(host) {
  return PLACEHOLDER_DATABASE_HOSTS.has(String(host || "").toLowerCase());
}

function sslFor(connectionString) {
  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    const local = ["localhost", "127.0.0.1", "::1"].includes(host);
    const mode = url.searchParams.get("sslmode");
    const env = (process.env.DATABASE_SSL || "").trim().toLowerCase();
    if (env === "false") return undefined;
    if (env === "true" || env === "require" || !local || mode) {
      return { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true" };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function migrateDatabase(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL no está definida.");
  const sqlPath = path.join(__dirname, "production-schema.sql");
  const sqlScript = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString),
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  const db = drizzle(client);
  try {
    // SET normal (no startup parameter): compatible con Neon pooled.
    await client.query("SET search_path TO public");
    // Dos llamadas separadas: la PARTE 1 (enums) se confirma antes de que la
    // PARTE 2 use los valores nuevos (evita error 55P04 "unsafe use of new value").
    const marker = "\n-- ==PART2==\n";
    const at = sqlScript.indexOf(marker);
    if (at === -1) throw new Error("Marcador -- ==PART2== ausente en production-schema.sql.");
    await client.query(sqlScript.slice(0, at));
    await client.query(sqlScript.slice(at + marker.length));
    const check = await db.execute(sql.raw(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users'"
    ));
    const byName = new Map(check.rows.map((r) => [r.column_name, r]));
    const problems = [];
    for (const c of ["name", "email", "password_hash", "is_active", "email_verified", "approval_status"]) {
      if (!byName.has(c)) problems.push(`falta users.${c}`);
    }
    for (const c of ["is_active", "email_verified"]) {
      const row = byName.get(c);
      if (row && row.data_type !== "boolean") problems.push(`users.${c} debe ser boolean (es ${row.data_type})`);
    }
    const idCol = byName.get("id");
    if (idCol && !idCol.column_default) problems.push("users.id sin valor predeterminado");
    const labels = await db.execute(sql.raw(
      "SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace " +
      "WHERE n.nspname='public' AND t.typname IN ('user_role','user_approval_status','code_purpose','project_status')"
    ));
    const have = new Set(labels.rows.map((r) => `${r.typname}.${r.enumlabel}`));
    const want = {
      user_role: ["estudiante", "tutor", "administrador"],
      user_approval_status: ["pending", "approved", "rejected"],
      code_purpose: ["verify_email", "reset_password"],
      project_status: ["enviado_tutor", "devuelto", "devuelto_tutor", "validado_tutor", "publicado", "rechazado"],
    };
    for (const [typ, list] of Object.entries(want)) {
      for (const label of list) {
        if (!have.has(`${typ}.${label}`)) problems.push(`falta etiqueta ${typ}.${label}`);
      }
    }
    if (problems.length) {
      const error = new Error(`La migración terminó pero el esquema sigue incompleto: ${problems.join("; ")}`);
      error.code = "SCHEMA_INCOMPLETE";
      throw error;
    }
  } finally {
    await client.end();
  }
  console.log("[BRIANA] Esquema de base de datos verificado/actualizado.");
}

if (require.main === module) {
  try {
    require("dotenv").config();
  } catch {
    /* dotenv es opcional cuando las variables ya vienen del entorno */
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[BRIANA] Falta DATABASE_URL. Ejemplo:");
    console.error('  DATABASE_URL="postgresql://usuario:clave@host/base?sslmode=require" node scripts/migrate-production.cjs');
    process.exit(1);
  }
  migrateDatabase(url)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[BRIANA] No se pudo actualizar el esquema:", error.message);
      process.exit(1);
    });
}

module.exports = { migrateDatabase, sslFor, databaseHost, isPlaceholderDatabaseHost };
