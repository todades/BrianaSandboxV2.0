import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, projects, users } from "@/db/schema";
import { handleError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** PostgreSQL puede devolver integer/numeric (por ejemplo anio) como número. */
async function groupCount(column: string): Promise<{ key: string; total: number }[]> {
  const rows = await db.execute<{ key: unknown; total: number }>(
    sql`select ${sql.identifier(column)} as key, count(*)::int as total from projects group by 1 order by 2 desc`
  );
  return rows.rows.map((r) => ({
    key: r.key === null || r.key === undefined || r.key === "" ? "Sin especificar" : String(r.key),
    total: Number(r.total),
  }));
}

export async function GET() {
  try {
    await requireUser(["administrador"]);

    const [usersByRole, byStatus, byLinea, byTipo, byTrayecto, byAnio] = await Promise.all([
      db.select({ role: users.role, total: count() }).from(users).groupBy(users.role),
      groupCount("status"),
      groupCount("linea_investigacion"),
      groupCount("tipo_recurso"),
      groupCount("trayecto"),
      groupCount("anio"),
    ]);

    const tutorsLoad = await db
      .select({ id: users.id, name: users.name, email: users.email, total: count(projects.id) })
      .from(users)
      .leftJoin(projects, eq(projects.tutorId, users.id))
      .where(eq(users.role, "tutor"))
      .groupBy(users.id, users.name, users.email)
      .orderBy(desc(count(projects.id)));

    const recent = await db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        updatedAt: projects.updatedAt,
        studentName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(projects.studentId, users.id))
      .orderBy(desc(projects.updatedAt))
      .limit(8);

    const [{ aiCalls }] = await db
      .select({ aiCalls: count() })
      .from(auditLogs)
      .where(eq(auditLogs.action, "IA_EXTRACCION_METADATOS"));

    const [{ totalProjects }] = await db.select({ totalProjects: count() }).from(projects);

    return Response.json({
      totals: {
        projects: totalProjects,
        published: byStatus.find((s) => s.key === "publicado")?.total ?? 0,
        pendingAdmin: byStatus.find((s) => s.key === "validado_tutor")?.total ?? 0,
        pendingTutor: byStatus.find((s) => s.key === "enviado_tutor")?.total ?? 0,
        users: usersByRole.reduce((a, r) => a + Number(r.total), 0),
        aiCalls: Number(aiCalls),
      },
      usersByRole: usersByRole.map((r) => ({ role: String(r.role), total: Number(r.total) })),
      byStatus,
      byLinea,
      byTipo,
      byTrayecto: byTrayecto.sort((a, b) => a.key.localeCompare(b.key, "es")),
      byAnio: byAnio.sort((a, b) => {
        if (a.key === "Sin especificar") return 1;
        if (b.key === "Sin especificar") return -1;
        return Number(b.key) - Number(a.key) || b.key.localeCompare(a.key, "es");
      }),
      tutorsLoad: tutorsLoad.map((t) => ({ ...t, total: Number(t.total) })),
      recent: recent.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
    });
  } catch (e) {
    return handleError(e);
  }
}
