import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, projects, users } from "@/db/schema";
import { handleError, HttpError, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  LINEAS_INVESTIGACION,
  MAX_PDF_BYTES,
  MAX_PLANILLA_BYTES,
  PNFS,
  TIPOS_RECURSO,
  TRAYECTOS,
  slugify,
} from "@/lib/constants";
import { getProjectDTO, listProjectsFor } from "@/lib/projects";

export const dynamic = "force-dynamic";

/** Listado de proyectos según el rol (estudiante: propios, tutor: asignados, admin: todos). */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const status = new URL(req.url).searchParams.get("status");
    const list = await listProjectsFor(user, status);
    return Response.json({ projects: list });
  } catch (e) {
    return handleError(e);
  }
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function isPdf(f: File): boolean {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

/** Envío de un proyecto por parte del ESTUDIANTE (único rol autorizado a subir). */
export async function POST(req: Request) {
  try {
    const user = await requireUser(["estudiante"]);
    const form = await req.formData();

    const title = str(form, "title");
    const tipoRecurso = str(form, "tipoRecurso");
    const pnf = str(form, "pnf") || "Informática";
    const lineaInvestigacion = str(form, "lineaInvestigacion");
    const autores = str(form, "autores")
      .split(";")
      .map((a) => a.trim())
      .filter(Boolean);
    const tutorNombre = str(form, "tutorNombre");
    const tutorId = parseInt(str(form, "tutorId"), 10);
    const anioRaw = str(form, "anio");
    const trayecto = str(form, "trayecto");
    const codigo = str(form, "codigo");
    const slug = str(form, "slug") || slugify(title);
    const palabrasClave = str(form, "palabrasClave");
    const resumen = str(form, "resumen");
    const aiSource = str(form, "aiSource") || null;

    if (title.length < 8) throw new HttpError(400, "El título del proyecto es obligatorio.");
    if (!(TIPOS_RECURSO as readonly string[]).includes(tipoRecurso))
      throw new HttpError(400, "Selecciona un tipo de recurso válido.");
    if (!(PNFS as readonly string[]).includes(pnf)) throw new HttpError(400, "PNF inválido.");
    if (!(LINEAS_INVESTIGACION as readonly string[]).includes(lineaInvestigacion))
      throw new HttpError(400, "Selecciona una línea de investigación válida.");
    if (autores.length === 0) throw new HttpError(400, "Indica al menos un autor (separados por ;).");
    if (!Number.isFinite(tutorId)) throw new HttpError(400, "Selecciona la cuenta del tutor que recibirá el proyecto.");
    if (trayecto && !(TRAYECTOS as readonly string[]).includes(trayecto))
      throw new HttpError(400, "Trayecto inválido.");
    const anio = anioRaw ? parseInt(anioRaw, 10) : null;
    if (anioRaw && (!anio || anio < 1990 || anio > new Date().getFullYear() + 1))
      throw new HttpError(400, "Año de publicación inválido.");

    const [tutorRow] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          eq(users.id, tutorId),
          eq(users.role, "tutor"),
          eq(users.emailVerified, true),
          eq(users.isActive, true)
        )
      )
      .limit(1);
    if (!tutorRow) throw new HttpError(400, "La cuenta destinataria seleccionada no existe o no está verificada.");

    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0) throw new HttpError(400, "Adjunta el PDF del recurso.");
    if (!isPdf(pdf)) throw new HttpError(400, "El recurso debe ser un archivo PDF.");
    if (pdf.size > MAX_PDF_BYTES) throw new HttpError(400, "El PDF supera el máximo de 20 MB.");

    const planilla = form.get("planilla");
    let planillaFile: File | null = null;
    if (planilla instanceof File && planilla.size > 0) {
      const okType = isPdf(planilla) || planilla.type.startsWith("image/");
      if (!okType) throw new HttpError(400, "La planilla firmada debe ser PDF o imagen.");
      if (planilla.size > MAX_PLANILLA_BYTES) throw new HttpError(400, "La planilla supera el máximo de 10 MB.");
      planillaFile = planilla;
    }

    const [pdfRow] = await db
      .insert(files)
      .values({
        filename: pdf.name,
        mimeType: pdf.type || "application/pdf",
        size: pdf.size,
        kind: "pdf",
        data: Buffer.from(await pdf.arrayBuffer()),
        uploadedBy: user.id,
      })
      .returning({ id: files.id });

    let planillaId: number | null = null;
    if (planillaFile) {
      const [row] = await db
        .insert(files)
        .values({
          filename: planillaFile.name,
          mimeType: planillaFile.type || "application/pdf",
          size: planillaFile.size,
          kind: "planilla",
          data: Buffer.from(await planillaFile.arrayBuffer()),
          uploadedBy: user.id,
        })
        .returning({ id: files.id });
      planillaId = row.id;
    }

    const [created] = await db
      .insert(projects)
      .values({
        title,
        codigo: codigo || null,
        slug,
        tipoRecurso,
        pnf,
        lineaInvestigacion,
        autores,
        tutorNombre: tutorNombre || tutorRow.name,
        tutorId: tutorRow.id,
        studentId: user.id,
        anio,
        trayecto: trayecto || user.trayecto,
        palabrasClave: palabrasClave || null,
        resumen: resumen || null,
        pdfFileId: pdfRow.id,
        planillaFileId: planillaId,
        status: "enviado_tutor",
        aiSource,
      })
      .returning({ id: projects.id });

    await logAudit({
      user,
      action: "PROYECTO_ENVIADO_TUTOR",
      entity: "proyecto",
      entityId: created.id,
      details: { title, tutorId: tutorRow.id, tutor: tutorRow.name, planilla: !!planillaId },
    });

    const dto = await getProjectDTO(created.id);
    return Response.json({ project: dto }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
