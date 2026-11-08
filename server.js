/**
 * BRIANA · Arranque de producción para Render.
 *
 * Render puede ejecutar `node server.js` o `npm start`.
 * Este archivo NO sustituye las rutas de Next.js: sirve la aplicación ya
 * compilada por `next build`, incluidas las rutas `/api/*`.
 *
 * Antes de aceptar tráfico aplica el esquema idempotente de PostgreSQL
 * (scripts/production-schema.sql) para que columnas como users.is_active
 * existan siempre en la base de producción.
 */
const http = require("node:http");
const next = require("next");

// En Render las variables vienen del panel; en local se leen desde .env.
try {
  require("dotenv").config({ quiet: true });
} catch {
  try { require("dotenv").config(); } catch { /* entorno inyectado */ }
}

let migrateDatabase;
let databaseHost;
let isPlaceholderDatabaseHost;
try {
  ({ migrateDatabase, databaseHost, isPlaceholderDatabaseHost } = require("./scripts/migrate-production.cjs"));
} catch (error) {
  console.error("[BRIANA] No se pudo cargar scripts/migrate-production.cjs.");
  console.error("[BRIANA] Copia la carpeta scripts completa del parche (migrate-production.cjs y production-schema.sql), no solo server.js.");
  console.error("[BRIANA] Detalle:", error.message);
  process.exit(1);
}

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV === "development";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[BRIANA] PORT inválido:", process.env.PORT);
  process.exit(1);
}

async function prepareDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("[BRIANA] DATABASE_URL no definida; se omite la migración automática.");
    return;
  }
  if (process.env.SKIP_AUTO_MIGRATE === "true") {
    console.log("[BRIANA] Migración automática omitida por SKIP_AUTO_MIGRATE=true.");
    return;
  }

  const dbHost = databaseHost ? databaseHost(process.env.DATABASE_URL) : null;
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (dbHost && isPlaceholderDatabaseHost && isPlaceholderDatabaseHost(dbHost)) {
    const error = new Error(
      `DATABASE_URL usa el host de ejemplo "${dbHost}". No es un servidor real. Copia la cadena completa de Neon (ep-...neon.tech) o la External Database URL de Render Postgres en Render → Environment.`
    );
    error.code = "INVALID_DATABASE_HOST";
    throw error;
  }
  if (process.env.RENDER && dbHost && localHosts.has(dbHost)) {
    const error = new Error(
      `DATABASE_URL apunta a "${dbHost}". Render no puede usar la base local; usa la URL externa de Neon/Render Postgres.`
    );
    error.code = "INVALID_DATABASE_HOST";
    throw error;
  }

  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await migrateDatabase(process.env.DATABASE_URL);
      return;
    } catch (error) {
      console.error(`[BRIANA] Intento ${attempt}/${attempts} de actualización de esquema falló.`);
      console.error(`[BRIANA] Código: ${error.code || "sin código"} · Detalle: ${error.message}`);
      if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
        console.error(`[BRIANA] El host de DATABASE_URL no resolvió en DNS: ${dbHost || "desconocido"}.`);
        console.error('[BRIANA] Corrige DATABASE_URL: el servidor debe ser ep-...neon.tech (Neon) o dpg-...render.com (Render), no "base" ni "host".');
      }
      if (attempt === attempts) {
        const wrapped = new Error(`No se pudo inicializar PostgreSQL: ${error.message}`);
        wrapped.code = error.code;
        throw wrapped;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function main() {
  await prepareDatabase();

  const app = next({ dev, hostname, port });
  try {
    await app.prepare();
  } catch (error) {
    console.error("[BRIANA] Next.js no pudo cargar la compilación (.next). Ejecuta npm run build en el build command.");
    throw error;
  }
  const handle = app.getRequestHandler();

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error("[BRIANA] Error atendiendo la solicitud:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify({ error: "Error interno del servidor." }));
    });
  });

  server.on("error", (error) => {
    console.error("[BRIANA] No se pudo iniciar el servidor:", error);
    process.exit(1);
  });

  server.listen(port, hostname, () => {
    console.log(`[BRIANA] Servidor listo en http://${hostname}:${port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("[BRIANA] Falló el arranque:", error.message);
  if (error.code) console.error("[BRIANA] Código de error:", error.code);
  console.error("[BRIANA] Diagnóstico seguro: node scripts/doctor-render.cjs");
  console.error("[BRIANA] Si el esquema está desactualizado: node scripts/migrate-production.cjs");
  process.exit(1);
});
