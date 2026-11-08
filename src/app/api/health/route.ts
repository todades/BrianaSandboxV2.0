import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureAdmin } from "@/lib/seed";
import { ensureSchema, schemaStatus } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  let schemaError: string | undefined;
  try {
    await ensureSchema();
  } catch (e) {
    schemaError = e instanceof Error ? e.message : "No se pudo aplicar el esquema.";
  }

  try {
    await db.execute(sql`select 1`);
    let adminReady = true;
    try {
      await ensureAdmin();
    } catch {
      adminReady = false;
    }
    const schema = await schemaStatus();
    if (schemaError) schema.error = schemaError;
    return Response.json({ ok: true, service: "BRIANA", adminReady, schema });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Sin conexión a la base de datos." },
      { status: 500 }
    );
  }
}
