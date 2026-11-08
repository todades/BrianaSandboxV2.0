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
    await db.execute(sql.raw("SET search_path TO public"));
    await db.execute(sql.raw(sqlScript));
    const check = await db.execute(sql.raw(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('name','email','password_hash','is_active','email_verified')"
    ));
    const present = new Set(check.rows.map((r) => r.column_name));
    const missing = ["name", "email", "password_hash", "is_active", "email_verified"].filter((c) => !present.has(c));
    if (missing.length) {
      const error = new Error(`La migración terminó pero faltan columnas en users: ${missing.join(", ")}`);
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
