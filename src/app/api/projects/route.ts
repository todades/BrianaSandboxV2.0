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

const MAX_DELIVERABLE_BYTES = 15 * 1024 * 1024; // 15 MB

const WORD_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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

function isReportDoc(f: File): boolean {
  const lower = f.name.toLowerCase();
  return (
    isPdf(f) ||
    WORD_MIMES.has(f.type) ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx")
  );
}

function isSlidesFile(f: File): boolean {
  const lower = f.name.toLowerCase();
  return (
    isPdf(f) ||
    f.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lower.endsWith(".pptx")
  );
}

function isZipFile(f: File): boolean {
  const lower = f.name.toLowerCase();
  return (
    f.type === "application/zip" ||
    f.type === "application/x-zip-compressed" ||
    lower.endsWith(".zip")
  );
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Envío o guardado de borrador de un proyecto por parte del ESTUDIANTE. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(["estudiante"]);
    const form = await req.formData();

    const modeRaw = str(form, "mode") || str(form, "status");
    const targetStatus = modeRaw === "borrador" ? "borrador" : "enviado_tutor";
    const isDraft = targetStatus === "borrador";

    const title = str(form, "title");
    const tipoRecurso = str(form, "tipoRecurso") || (TIPOS_RECURSO[0] ?? "Proyecto socio-tecnológico");
    const pnf = str(form, "pnf") || "Informática";
    const lineaInvestigacion =
      str(form, "lineaInvestigacion") ||
      (LINEAS_INVESTIGACION[0] ?? "Desarrollo de Sistemas de Información");
    const autores = str(form, "autores")
      .split(";")
      .map((a) => a.trim())
      .filter(Boolean);
    const tutorNombre = str(form, "tutorNombre");
    const tutorIdRaw = str(form, "tutorId");
    const tutorId = tutorIdRaw ? parseInt(tutorIdRaw, 10) : NaN;
    const anioRaw = str(form, "anio");
    const trayecto = str(form, "trayecto");
    const codigo = str(form, "codigo");
    const slug = str(form, "slug") || slugify(title || "borrador");
    const palabrasClave = str(form, "palabrasClave");
    const resumen = str(form, "resumen");
    const repoUrl = str(form, "repoUrl");
    const aiSource = str(form, "aiSource") || null;

    if (isDraft) {
      if (title.length < 5) {
        throw new HttpError(400, "El título del borrador debe tener al menos 5 caracteres.");
      }
    } else {
      if (title.length < 8) throw new HttpError(400, "El título del proyecto es obligatorio.");
      if (!(TIPOS_RECURSO as readonly string[]).includes(tipoRecurso))
        throw new HttpError(400, "Selecciona un tipo de recurso válido.");
      if (!(PNFS as readonly string[]).includes(pnf)) throw new HttpError(400, "PNF inválido.");
      if (!(LINEAS_INVESTIGACION as readonly string[]).includes(lineaInvestigacion))
        throw new HttpError(400, "Selecciona una línea de investigación válida.");
      if (autores.length === 0)
        throw new HttpError(400, "Indica al menos un autor (separados por ;).");
      if (!Number.isFinite(tutorId))
        throw new HttpError(400, "Selecciona la cuenta del tutor que recibirá el proyecto.");
    }

    if (trayecto && !(TRAYECTOS as readonly string[]).includes(trayecto))
      throw new HttpError(400, "Trayecto inválido.");

    const anio = anioRaw ? parseInt(anioRaw, 10) : null;
    if (anioRaw && (!anio || anio < 1990 || anio > new Date().getFullYear() + 1))
      throw new HttpError(400, "Año de publicación inválido.");

    if (repoUrl && !isValidHttpUrl(repoUrl)) {
      throw new HttpError(400, "El enlace del repositorio o sistema debe ser una URL válida (http/https).");
    }

    let tutorRow: { id: number; name: string } | undefined;
    if (Number.isFinite(tutorId)) {
      const [found] = await db
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
      tutorRow = found;
    }

    if (!isDraft && !tutorRow) {
      throw new HttpError(400, "La cuenta destinataria seleccionada no existe o no está verificada.");
    }

    // 1. Informe del proyecto (PDF o Word)
    const pdf = form.get("pdf");
    let reportFile: File | null = null;
    if (pdf instanceof File && pdf.size > 0) {
      if (!isReportDoc(pdf)) {
        throw new HttpError(400, "El informe del proyecto debe ser PDF o Word (.doc, .docx).");
      }
      if (pdf.size > MAX_PDF_BYTES) {
        throw new HttpError(400, "El informe supera el máximo permitido.");
      }
      reportFile = pdf;
    } else if (!isDraft) {
      throw new HttpError(400, "Adjunta el informe del proyecto en PDF o Word.");
    }

    // 2. Diapositivas de defensa (PPTX o PDF)
    const slides = form.get("diapositivas");
    let slidesFile: File | null = null;
    if (slides instanceof File && slides.size > 0) {
      if (!isSlidesFile(slides)) {
        throw new HttpError(400, "Las diapositivas deben estar en formato PPTX o PDF.");
      }
      if (slides.size > MAX_DELIVERABLE_BYTES) {
        throw new HttpError(400, "Las diapositivas superan el máximo de 15 MB.");
      }
      slidesFile = slides;
    }

    // 3. Sistema / Código fuente (.ZIP)
    const zip = form.get("sistemaZip");
    let zipFile: File | null = null;
    if (zip instanceof File && zip.size > 0) {
      if (!isZipFile(zip)) {
        throw new HttpError(400, "El código fuente debe ser un archivo comprimido .ZIP.");
      }
      if (zip.size > MAX_DELIVERABLE_BYTES) {
        throw new HttpError(400, "El archivo .ZIP supera el máximo de 15 MB.");
      }
      zipFile = zip;
    }

    if (!isDraft && !zipFile && !repoUrl) {
      throw new HttpError(400, "Adjunta el archivo .ZIP del sistema o indica el enlace del repositorio.");
    }

    // 4. Planilla firmada (PDF o imagen)
    const planilla = form.get("planilla");
    let planillaFile: File | null = null;
    if (planilla instanceof File && planilla.size > 0) {
      const okType = isPdf(planilla) || planilla.type.startsWith("image/");
      if (!okType) throw new HttpError(400, "La planilla firmada debe ser PDF o imagen.");
      if (planilla.size > MAX_PLANILLA_BYTES) throw new HttpError(400, "La planilla supera el máximo permitido.");
      planillaFile = planilla;
    }

    let pdfId: number | null = null;
    if (reportFile) {
      const [pdfRow] = await db
        .insert(files)
        .values({
          filename: reportFile.name,
          mimeType: reportFile.type || "application/octet-stream",
          size: reportFile.size,
          kind: "pdf",
          data: Buffer.from(await reportFile.arrayBuffer()),
          uploadedBy: user.id,
        })
        .returning({ id: files.id });
      pdfId = pdfRow.id;
    }

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

    let slidesFileId: number | null = null;
    if (slidesFile) {
      const [row] = await db
        .insert(files)
        .values({
          filename: slidesFile.name,
          mimeType: slidesFile.type || "application/octet-stream",
          size: slidesFile.size,
          kind: "diapositivas",
          data: Buffer.from(await slidesFile.arrayBuffer()),
          uploadedBy: user.id,
        })
        .returning({ id: files.id });
      slidesFileId = row.id;
    }

    let zipFileId: number | null = null;
    if (zipFile) {
      const [row] = await db
        .insert(files)
        .values({
          filename: zipFile.name,
          mimeType: zipFile.type || "application/zip",
          size: zipFile.size,
          kind: "zip",
          data: Buffer.from(await zipFile.arrayBuffer()),
          uploadedBy: user.id,
        })
        .returning({ id: files.id });
      zipFileId = row.id;
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
        tutorNombre: tutorNombre || tutorRow?.name || null,
        tutorId: tutorRow?.id ?? null,
        studentId: user.id,
        anio,
        trayecto: trayecto || user.trayecto,
        palabrasClave: palabrasClave || null,
        resumen: resumen || null,
        repoUrl: repoUrl || null,
        pdfFileId: pdfId,
        planillaFileId: planillaId,
        slidesFileId,
        zipFileId,
        status: targetStatus,
        aiSource,
      })
      .returning({ id: projects.id });

    await logAudit({
      user,
      action: isDraft ? "BORRADOR_GUARDADO" : "PROYECTO_ENVIADO_TUTOR",
      entity: "proyecto",
      entityId: created.id,
      details: {
        title,
        status: targetStatus,
        tutorId: tutorRow?.id ?? null,
        tutor: tutorRow?.name ?? null,
        planilla: !!planillaId,
        diapositivas: !!slidesFileId,
        sistemaZip: !!zipFileId,
        repoUrl: repoUrl || null,
      },
    });

    const dto = await getProjectDTO(created.id);
    return Response.json({ project: dto }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
