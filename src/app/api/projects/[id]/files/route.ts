import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, projects } from "@/db/schema";
import { handleError, HttpError, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { MAX_PDF_BYTES, MAX_PLANILLA_BYTES } from "@/lib/constants";
import { assertCanView, getProjectDTO } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Adjuntar / reemplazar la Planilla Firmada o el PDF del recurso de un proyecto existente. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const projectId = parseInt(id, 10);
    const current = await getProjectDTO(projectId);
    if (!current) throw new HttpError(404, "Proyecto no encontrado.");
    assertCanView(user, current);

    if (current.status === "publicado" || current.status === "rechazado") {
      throw new HttpError(400, "El proyecto ya fue cerrado por el Administrador.");
    }
    if (user.role === "tutor") {
      throw new HttpError(403, "El Tutor no puede reemplazar ni modificar los archivos originales del estudiante.");
    }
    const allowed =
      user.role === "administrador" ||
      (user.role === "estudiante" && current.studentId === user.id);
    if (!allowed) throw new HttpError(403, "No puedes adjuntar archivos a este proyecto.");

    const form = await req.formData();
    const kind = String(form.get("kind") || "planilla");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Selecciona un archivo.");

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (kind === "pdf") {
      if (user.role !== "estudiante") throw new HttpError(403, "Solo el estudiante puede reemplazar el PDF del recurso.");
      if (!isPdf) throw new HttpError(400, "El recurso debe ser PDF.");
      if (file.size > MAX_PDF_BYTES) throw new HttpError(400, "El PDF supera 20 MB.");
    } else {
      if (!isPdf && !file.type.startsWith("image/")) throw new HttpError(400, "La planilla debe ser PDF o imagen.");
      if (file.size > MAX_PLANILLA_BYTES) throw new HttpError(400, "La planilla supera 10 MB.");
    }

    const [row] = await db
      .insert(files)
      .values({
        filename: file.name,
        mimeType: file.type || "application/pdf",
        size: file.size,
        kind: kind === "pdf" ? "pdf" : "planilla",
        data: Buffer.from(await file.arrayBuffer()),
        uploadedBy: user.id,
      })
      .returning({ id: files.id });

    await db
      .update(projects)
      .set(kind === "pdf" ? { pdfFileId: row.id, updatedAt: new Date() } : { planillaFileId: row.id, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    await logAudit({
      user,
      action: kind === "pdf" ? "PDF_REEMPLAZADO" : "PLANILLA_ADJUNTADA",
      entity: "proyecto",
      entityId: projectId,
      details: { filename: file.name, size: file.size },
    });

    return Response.json({ project: await getProjectDTO(projectId) });
  } catch (e) {
    return handleError(e);
  }
}
