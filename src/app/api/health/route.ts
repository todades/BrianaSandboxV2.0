import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureAdmin, getAdminCredentials, getAdminPasswordSource, DEFAULT_ADMIN_PASSWORD } from "@/lib/seed";
import { ensureSchema, schemaStatus } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  let schemaError: string | undefined;

  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    return Response.json(
      { ok: false, ready: false, error: e instanceof Error ? e.message : "Sin conexión a la base de datos." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    await ensureSchema();
  } catch (e) {
    schemaError = e instanceof Error ? e.message : "No se pudo aplicar el esquema.";
  }

  let schema = await schemaStatus();
  if (!schema.ok && !schemaError) {
    try {
      await ensureSchema(true);
      schema = await schemaStatus();
    } catch (e) {
      schemaError = e instanceof Error ? e.message : "No se pudo reparar el esquema.";
    }
  }
  if (schemaError) schema.error = schemaError;

  let adminReady = true;
  if (schema.ok) {
    try {
      await ensureAdmin();
    } catch {
      adminReady = false;
    }
  } else {
    adminReady = false;
  }

  const adminCredentials = getAdminCredentials();
  const admin = {
    email: adminCredentials.email,
    passwordSource: getAdminPasswordSource(),
    defaultPasswordActive: adminCredentials.password === DEFAULT_ADMIN_PASSWORD,
  };

  return Response.json(
    { ok: true, ready: schema.ok && adminReady && !schemaError, service: "BRIANA", adminReady, admin, schema },
    { headers: { "Cache-Control": "no-store" } }
  );
}
