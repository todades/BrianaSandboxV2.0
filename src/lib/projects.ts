import { and, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { files, projects, users, type UserRow } from "@/db/schema";
import type { ProjectDTO } from "./types";
import { HttpError } from "./auth";

const student = alias(users, "student");
const tutor = alias(users, "tutor");
const pdfFile = alias(files, "pdf_file");
const planillaFile = alias(files, "planilla_file");

function baseQuery() {
  return db
    .select({
      project: projects,
      studentName: student.name,
      studentEmail: student.email,
      tutorCuenta: tutor.name,
      tutorEmail: tutor.email,
      pdfId: pdfFile.id,
      pdfName: pdfFile.filename,
      pdfSize: pdfFile.size,
      planillaId: planillaFile.id,
      planillaName: planillaFile.filename,
      planillaSize: planillaFile.size,
    })
    .from(projects)
    .leftJoin(student, eq(projects.studentId, student.id))
    .leftJoin(tutor, eq(projects.tutorId, tutor.id))
    .leftJoin(pdfFile, eq(projects.pdfFileId, pdfFile.id))
    .leftJoin(planillaFile, eq(projects.planillaFileId, planillaFile.id));
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number];

function toDTO(r: Row): ProjectDTO {
  const p = r.project;
  return {
    id: p.id,
    title: p.title,
    codigo: p.codigo,
    slug: p.slug,
    tipoRecurso: p.tipoRecurso,
    pnf: p.pnf,
    lineaInvestigacion: p.lineaInvestigacion,
    autores: p.autores ?? [],
    tutorNombre: p.tutorNombre,
    tutorId: p.tutorId,
    tutorEmail: r.tutorEmail,
    tutorCuenta: r.tutorCuenta,
    studentId: p.studentId,
    studentName: r.studentName,
    studentEmail: r.studentEmail,
    anio: p.anio,
    trayecto: p.trayecto,
    palabrasClave: p.palabrasClave,
    resumen: p.resumen,
    status: p.status,
    observaciones: p.observaciones,
    aiSource: p.aiSource,
    pdf: r.pdfId ? { id: r.pdfId, filename: r.pdfName ?? "recurso.pdf", size: r.pdfSize ?? 0 } : null,
    planilla: r.planillaId
      ? { id: r.planillaId, filename: r.planillaName ?? "planilla.pdf", size: r.planillaSize ?? 0 }
      : null,
    validatedAt: p.validatedAt?.toISOString() ?? null,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listProjectsFor(user: UserRow, status?: string | null): Promise<ProjectDTO[]> {
  const conditions: SQL[] = [];
  if (user.role === "estudiante") conditions.push(eq(projects.studentId, user.id));
  if (user.role === "tutor") conditions.push(eq(projects.tutorId, user.id));
  if (status) conditions.push(eq(projects.status, status as ProjectDTO["status"]));

  const rows = await baseQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projects.updatedAt));
  return rows.map(toDTO);
}

export async function getProjectDTO(id: number): Promise<ProjectDTO | null> {
  const rows = await baseQuery().where(eq(projects.id, id)).limit(1);
  return rows[0] ? toDTO(rows[0]) : null;
}

export function assertCanView(user: UserRow, p: ProjectDTO): void {
  if (user.role === "administrador") return;
  if (user.role === "tutor" && p.tutorId === user.id) return;
  if (user.role === "estudiante" && p.studentId === user.id) return;
  if (p.status === "publicado") return;
  throw new HttpError(403, "No tienes acceso a este proyecto.");
}
