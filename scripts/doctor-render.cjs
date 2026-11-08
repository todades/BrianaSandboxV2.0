/**
 * BRIANA · Diagnóstico seguro para Render.
 * Uso: node scripts/doctor-render.cjs [--fix]
 * No imprime contraseñas ni la cadena DATABASE_URL completa.
 */
const fs = require("node:fs");
const path = require("node:path");

try {
  require("dotenv").config({ quiet: true });
} catch {
  try { require("dotenv").config(); } catch { /* entorno inyectado */ }
}

const root = path.join(__dirname, "..");
const problems = [];
const warnings = [];
const ok = (msg) => console.log(`✓ ${msg}`);
const warn = (msg) => { warnings.push(msg); console.log(`! ${msg}`); };
const bad = (msg) => { problems.push(msg); console.log(`✗ ${msg}`); };

function fileExists(rel) {
  return fs.existsSync(path.join(root, rel));
}

async function main() {
  console.log("BRIANA · diagnóstico de despliegue (sin secretos)");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
  else bad(`Node ${process.versions.node} es antiguo; usa NODE_VERSION=22.`);

  for (const rel of ["server.js", "package.json", "scripts/migrate-production.cjs", "scripts/production-schema.sql"]) {
    if (fileExists(rel)) ok(`Archivo presente: ${rel}`);
    else bad(`Falta ${rel}. Copia la carpeta/archivo completo del parche, no solo server.js.`);
  }

  if (fileExists(".next/BUILD_ID")) ok("Build de Next.js presente (.next/BUILD_ID).");
  else warn("No existe .next/BUILD_ID; ejecuta npm run build antes de npm start.");

  const required = ["DATABASE_URL", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
  for (const key of required) {
    if ((process.env[key] || "").trim()) ok(`Variable definida: ${key}`);
    else bad(`Falta la variable ${key} en Render → Environment.`);
  }

  const jwt = (process.env.JWT_SECRET || "").trim();
  if (jwt && jwt.length < 32) warn("JWT_SECRET es corto; usa al menos 32 caracteres aleatorios.");

  const smtp = ["EMAIL_USER", "EMAIL_PASS"].every((k) => (process.env[k] || "").trim());
  if (!smtp) warn("SMTP no configurado: el arranque funciona, pero no se enviarán códigos por correo.");

  let dbUrl = null;
  const raw = (process.env.DATABASE_URL || "").trim();
  if (raw) {
    try {
      dbUrl = new URL(raw);
      if (!["postgres:", "postgresql:"].includes(dbUrl.protocol)) bad("DATABASE_URL debe empezar por postgresql://");
      const host = dbUrl.hostname.toLowerCase();
      const local = ["localhost", "127.0.0.1", "::1"].includes(host);
      const placeholders = new Set(["base", "host", "hostname", "example", "example.com", "tu-host", "tuhost", "tudominio", "ep-xxxx", "xxx", "xxx.neon.tech"]);
      if (placeholders.has(host)) {
        bad(`DATABASE_URL usa el host de ejemplo "${host}". Cámbialo por el host real: ep-...neon.tech (Neon) o dpg-...render.com (Render Postgres).`);
      }
      if (process.env.RENDER && local) bad("DATABASE_URL apunta a localhost; Render necesita la URL externa de Neon/Render Postgres.");
      ok(`Base de datos destino: ${host}${dbUrl.pathname} (credenciales ocultas)`);
    } catch {
      bad("DATABASE_URL no es una URL válida.");
    }
  }

  if (problems.length === 0 && dbUrl && fileExists("scripts/migrate-production.cjs")) {
    const { Client } = require("pg");
    const { drizzle } = require("drizzle-orm/node-postgres");
    const { sql } = require("drizzle-orm");
    const { migrateDatabase, sslFor } = require("./migrate-production.cjs");
    const client = new Client({ connectionString: raw, ssl: sslFor(raw), connectionTimeoutMillis: 10000 });
    const db = drizzle(client);
    try {
      await client.connect();
      ok("Conexión PostgreSQL establecida.");
      const cols = await db.execute(sql.raw(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('name','email','password_hash','is_active','email_verified','approval_status','verified_at')"
      ));
      const enumRow = await db.execute(sql.raw(
        "SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='project_status' AND e.enumlabel='devuelto_tutor' LIMIT 1"
      ));
      const names = new Set(cols.rows.map((r) => r.column_name));
      const missing = ["name", "email", "password_hash", "is_active", "email_verified", "approval_status", "verified_at"].filter((c) => !names.has(c));
      if (missing.length || enumRow.rowCount === 0) {
        bad(`Esquema desactualizado: falta ${[...missing, enumRow.rowCount === 0 ? "project_status.devuelto_tutor" : null].filter(Boolean).join(", ")}.`);
        if (process.argv.includes("--fix")) {
          console.log("Aplicando migración idempotente...");
          await migrateDatabase(raw);
          ok("Migración aplicada. Vuelve a ejecutar el diagnóstico para confirmar.");
        } else {
          console.log("  Solución: node scripts/migrate-production.cjs");
        }
      } else {
        ok("Esquema mínimo de BRIANA presente (users.name/email/password_hash/is_active y devuelto_tutor).");
      }
    } catch (error) {
      bad(`No se pudo conectar/consultar PostgreSQL (${error.code || "sin código"}): ${error.message}`);
      if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
        console.log(`  El host '${dbUrl?.hostname || "desconocido"}' no existe en DNS. Copia la cadena completa desde Neon/Render; no uses "base" ni "host".`);
      }
      console.log("  Revisa DATABASE_URL, DATABASE_SSL=true y que Neon permita conexiones externas.");
    } finally {
      await client.end().catch(() => {});
    }
  }

  console.log("\nResumen:");
  if (problems.length === 0) {
    console.log("Listo para Render: Build=npm ci --include=dev && npm run build | Start=node server.js | Health=/api/health");
    process.exit(0);
  }
  console.log(`Corrige ${problems.length} problema(s) antes de redesplegar.`);
  process.exit(1);
}

main().catch((error) => {
  console.error("Diagnóstico falló:", error.message);
  process.exit(1);
});
