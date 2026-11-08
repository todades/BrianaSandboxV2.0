/* Opciones institucionales EXACTAS para los desplegables del Sandbox */

export const TIPOS_RECURSO = [
  "Proyecto socio-tecnológico",
  "Trabajo Especial de Grado (Tesis)",
  "Pasantía",
  "Artículo de Investigación",
  "Servicio Comunitario",
] as const;

export const PNFS = ["Informática"] as const;

export const LINEAS_INVESTIGACION = [
  "Seguridad Informática.",
  "Software Educativo",
  "Desarrollo de Sistemas de Información y Modelo de Datos (LSD, LAW, LTE)",
  "Inteligencia Artificial.",
  "Gestión de Información (LGI)",
  "Programación Avanzada",
  "Redes Informáticas",
  "Soporte Técnico (LRI, LST)",
  "Seguridad en Redes de Computadoras",
  "Calidad en el Desarrollo de Sistemas Informáticos",
  "PRUEBA DE LINEA DE INVESTIGACION COMUNITARIO",
  "Plataforma Tecnológica en Educación",
  "Línea de prueba",
  "Administración y Minería de Datos",
  "Software Libre",
] as const;

export const TRAYECTOS = ["Trayecto I", "Trayecto II", "Trayecto III", "Trayecto IV"] as const;
export const DEFAULT_TRAYECTO = "Trayecto III";

/* Placeholders exactos del formulario */
export const PLACEHOLDERS = {
  titulo: "Ej: Sistema de Gestión Automatizado...",
  codigo: "Ej: SCEPNFINF-2025-10",
  slug: "ej-sistema-gestion",
  autores: "Ej: Juan Díaz; María Pérez",
  tutor: "Ej: Dr. Luis Martínez",
  anio: "Ej: 2026",
} as const;

export const SELECT_PLACEHOLDERS = {
  tipo: "Seleccione tipo...",
  linea: "Seleccione línea...",
  tutorCuenta: "Selecciona al tutor destinatario",
} as const;

export const TUTOR_CUENTA_NOTA = "La entrega aparecerá únicamente en la cuenta del tutor seleccionado.";

export const PROJECT_STATUS = [
  "enviado_tutor",
  "devuelto",
  "devuelto_tutor",
  "validado_tutor",
  "publicado",
  "rechazado",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type Role = "estudiante" | "tutor" | "administrador";

export const STATUS_META: Record<
  ProjectStatus,
  { label: string; short: string; tone: "cyan" | "amber" | "blue" | "emerald" | "red" }
> = {
  enviado_tutor: { label: "Enviado al tutor · En revisión", short: "En revisión (Tutor)", tone: "cyan" },
  devuelto: { label: "Devuelto por el tutor · Requiere correcciones", short: "Devuelto al estudiante", tone: "amber" },
  devuelto_tutor: { label: "Devuelto por el administrador · Requiere correcciones del tutor", short: "Devuelto al tutor", tone: "amber" },
  validado_tutor: {
    label: "Validado por el tutor · Pendiente del Administrador",
    short: "Pendiente (Admin)",
    tone: "blue",
  },
  publicado: { label: "Publicado en el repositorio institucional", short: "Publicado", tone: "emerald" },
  rechazado: { label: "Rechazado por el Administrador", short: "Rechazado", tone: "red" },
};

export const ROLE_LABEL: Record<Role, string> = {
  estudiante: "Estudiante",
  tutor: "Tutor",
  administrador: "Administrador",
};

export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_PLANILLA_BYTES = 10 * 1024 * 1024; // 10 MB

export const DEFAULT_ADMIN_EMAIL = "administrador@gmail.com";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
