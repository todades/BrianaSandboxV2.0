import { PROJECT_STATUS, STATUS_META, type ProjectStatus } from "./constants";
import type { ProjectDTO } from "./types";

export const PROJECT_FILTER_FIELDS = [
  "todos",
  "status",
  "lineaInvestigacion",
  "tipoRecurso",
  "trayecto",
  "anio",
  "tutorId",
] as const;

export type ProjectFilterField = (typeof PROJECT_FILTER_FIELDS)[number];
export interface ProjectFilter {
  field: ProjectFilterField;
  value: string;
}

export const ALL_PROJECTS_FILTER: ProjectFilter = { field: "todos", value: "" };
export const UNSPECIFIED_FILTER_VALUE = "Sin especificar";

export const PROJECT_FILTER_LABELS: Record<ProjectFilterField, string> = {
  todos: "Todos los temas",
  status: "Estado",
  lineaInvestigacion: "Línea de investigación",
  tipoRecurso: "Tipo de recurso",
  trayecto: "Trayecto",
  anio: "Año de publicación",
  tutorId: "Tutor",
};

export function projectFilterValue(project: ProjectDTO, field: ProjectFilterField): string {
  switch (field) {
    case "todos":
      return "";
    case "status":
      return project.status;
    case "lineaInvestigacion":
      return project.lineaInvestigacion || UNSPECIFIED_FILTER_VALUE;
    case "tipoRecurso":
      return project.tipoRecurso || UNSPECIFIED_FILTER_VALUE;
    case "trayecto":
      return project.trayecto || UNSPECIFIED_FILTER_VALUE;
    case "anio":
      return project.anio === null || project.anio === undefined ? UNSPECIFIED_FILTER_VALUE : String(project.anio);
    case "tutorId":
      return project.tutorId === null || project.tutorId === undefined ? UNSPECIFIED_FILTER_VALUE : String(project.tutorId);
  }
}

export function matchesProjectFilter(project: ProjectDTO, filter: ProjectFilter): boolean {
  if (filter.field === "todos" || !filter.value) return true;
  return projectFilterValue(project, filter.field) === filter.value;
}

export function isProjectFilterActive(filter: ProjectFilter): boolean {
  return filter.field !== "todos" && filter.value !== "";
}

export function matchesProjectSearch(project: ProjectDTO, search: string): boolean {
  const q = search.trim().toLocaleLowerCase("es");
  if (!q) return true;
  return [
    project.title,
    project.codigo ?? "",
    project.studentName ?? "",
    project.tutorCuenta ?? "",
    project.tutorNombre ?? "",
    project.lineaInvestigacion,
    project.tipoRecurso,
    project.trayecto ?? "",
    project.anio === null ? "" : String(project.anio),
    STATUS_META[project.status].label,
    project.observaciones ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase("es")
    .includes(q);
}

export function projectFilterLabel(filter: ProjectFilter, projects: ProjectDTO[] = []): string {
  if (!isProjectFilterActive(filter)) return "Todos los proyectos";
  if (filter.field === "status") {
    return STATUS_META[filter.value as ProjectStatus]?.short ?? filter.value;
  }
  if (filter.field === "tutorId") {
    const match = projects.find((p) => String(p.tutorId) === filter.value);
    return match?.tutorCuenta ?? match?.tutorNombre ?? `Tutor ${filter.value}`;
  }
  return filter.value;
}

export function projectFilterOptions(
  projects: ProjectDTO[],
  field: ProjectFilterField
): { value: string; label: string }[] {
  if (field === "todos") return [];
  if (field === "status") {
    const present = new Set(projects.map((p) => p.status));
    return PROJECT_STATUS.filter((s) => present.has(s)).map((s) => ({ value: s, label: STATUS_META[s].short }));
  }
  const options = new Map<string, string>();
  for (const project of projects) {
    const value = projectFilterValue(project, field);
    if (!options.has(value)) {
      let label = value;
      if (field === "tutorId" && value !== UNSPECIFIED_FILTER_VALUE) {
        label = project.tutorCuenta ?? project.tutorNombre ?? `Tutor ${value}`;
        if (project.tutorEmail) label += ` (${project.tutorEmail})`;
      }
      options.set(value, label);
    }
  }
  return [...options.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => {
      if (a.value === UNSPECIFIED_FILTER_VALUE) return 1;
      if (b.value === UNSPECIFIED_FILTER_VALUE) return -1;
      if (field === "anio") return Number(b.value) - Number(a.value);
      return a.label.localeCompare(b.label, "es");
    });
}
