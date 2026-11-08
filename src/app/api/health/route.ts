import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureAdmin } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    // Inicializa el administrador único del sistema si aún no existe.
    let adminReady = true;
    try {
      await ensureAdmin();
    } catch {
      adminReady = false;
    }
    return Response.json({ ok: true, service: "BRIANA", adminReady });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
