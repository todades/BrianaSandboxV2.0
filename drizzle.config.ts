import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Configuración de Drizzle Kit.
 * Lee DATABASE_URL del entorno (Neon PostgreSQL en producción / Render),
 * con respaldo a la instancia local de desarrollo.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
