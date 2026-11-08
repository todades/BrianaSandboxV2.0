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
  require("dotenv").config();
} catch {
  /* dotenv es opcional si el entorno ya está inyectado */
}

const { migrateDatabase } = require("./scripts/migrate-production.cjs");

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
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await migrateDatabase(process.env.DATABASE_URL);
      return;
    } catch (error) {
      console.error(`[BRIANA] Intento ${attempt}/${attempts} de actualización de esquema falló:`, error.message);
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function main() {
  await prepareDatabase();

  const app = next({ dev, hostname, port });
  await app.prepare();
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
  console.error("[BRIANA] Revisa DATABASE_URL/SSL o ejecuta: node scripts/migrate-production.cjs");
  process.exit(1);
});
