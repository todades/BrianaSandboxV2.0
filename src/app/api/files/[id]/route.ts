import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { files, projects } from "@/db/schema";
import { handleError, HttpError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Descarga/visualización protegida de archivos almacenados en PostgreSQL. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const fileId = parseInt(id, 10);

    const [owner] = await db
      .select({ studentId: projects.studentId, tutorId: projects.tutorId, status: projects.status })
      .from(projects)
      .where(or(eq(projects.pdfFileId, fileId), eq(projects.planillaFileId, fileId)))
      .limit(1);

    if (owner) {
      const ok =
        user.role === "administrador" ||
        owner.studentId === user.id ||
        owner.tutorId === user.id ||
        owner.status === "publicado";
      if (!ok) throw new HttpError(403, "No tienes acceso a este archivo.");
    } else if (user.role !== "administrador") {
      throw new HttpError(404, "Archivo no encontrado.");
    }

    const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
    if (!row) throw new HttpError(404, "Archivo no encontrado.");

    const download = new URL(req.url).searchParams.get("download") === "1";
    const safeName = row.filename.replace(/[^\w.\-() ]+/g, "_");
    return new Response(new Uint8Array(row.data), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(row.size),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
