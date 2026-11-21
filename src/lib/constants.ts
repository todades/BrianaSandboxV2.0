import { z } from "zod";

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
  title: "Ej: Sistema de Gestión Automatizado...",
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
export type ApprovalStatus = "pending" | "approved" | "rejected";

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pendiente de aprobación",
  approved: "Aprobada",
  rejected: "Rechazada",
};

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

/** Validaciones compartidas entre la interfaz y las rutas del servidor. */
export const CEDULA_MIN_DIGITS = 6;
export const CEDULA_MAX_DIGITS = 9;
export const CEDULA_PATTERN = /^\d{6,9}$/;

export function cedulaValidationError(value: string): string | null {
  if (!/^\d+$/.test(value)) return "La cédula solo admite números, sin letras ni signos.";
  if (value.length < CEDULA_MIN_DIGITS) return `La cédula debe tener al menos ${CEDULA_MIN_DIGITS} dígitos.`;
  if (value.length > CEDULA_MAX_DIGITS) return `La cédula no debe superar ${CEDULA_MAX_DIGITS} dígitos.`;
  return null;
}

export const VENEZUELAN_MOBILE_PREFIXES = ["0412", "0414", "0416", "0422", "0424", "0426"] as const;
export const VENEZUELAN_MOBILE_PATTERN = /^04(?:12|14|16|22|24|26)\d{7}$/;
export const VENEZUELAN_MOBILE_HTML_PATTERN = "04(12|14|16|22|24|26)[0-9]{7}";

export function isValidEmailAddress(input: string): boolean {
  const email = input.trim();
  if (!email || email.length > 254) return false;

  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (local.length > 64 || !domain.includes(".")) return false;
  if (!/^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63)) return false;
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,63}$/i.test(tld) || /^xn--[a-z0-9-]{2,59}$/i.test(tld);
}

/** El teléfono es opcional; si se informa, exige un móvil venezolano completo. */
export function phoneValidationError(value: string): string | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "El teléfono solo admite números, sin espacios ni guiones.";
  if (value.length !== 11) return "El teléfono debe tener 11 dígitos, por ejemplo 04121234567.";
  if (!VENEZUELAN_MOBILE_PATTERN.test(value)) {
    return `El teléfono debe comenzar con ${VENEZUELAN_MOBILE_PREFIXES.slice(0, -1).join(", ")} o ${VENEZUELAN_MOBILE_PREFIXES.at(-1)} y tener 11 dígitos.`;
  }
  return null;
}

/* ================================================================== */
/* Validaciones de Proyectos con Zod                                   */
/* ================================================================== */

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const fileSchema = (allowedTypes: string[], label: string) =>
  z
    .custom<File | null>((file) => file instanceof File, {
      message: `Falta adjuntar el archivo obligatorio: ${label}.`,
    })
    .refine((file) => file && file.size <= MAX_FILE_SIZE, {
      message: `El archivo de ${label} supera el límite máximo permitido de 15 MB.`,
    })
    .refine((file) => file && allowedTypes.includes(file.type), {
      message: `Formato inválido en ${label}. Solo se permiten los formatos aceptados.`,
    });

export const projectSubmissionSchema = z.object({
  titulo: z.string().min(15, "El título es muy corto; debe tener al menos 15 caracteres."),
  trayecto: z.enum(["Trayecto I", "Trayecto II", "Trayecto III", "Trayecto IV"], {
    message: "Debes seleccionar un Trayecto académico válido.",
  }),
  resumen: z.string().min(50, "El resumen debe contener al menos 50 caracteres descriptivos."),
  repoUrl: z
    .string()
    .url("La URL del repositorio o sistema no es válida (debe iniciar con https://).")
    .optional()
    .or(z.literal("")),

  // Entregables
  informe: fileSchema(["application/pdf"], "Informe del Proyecto (PDF)"),
  diapositivas: fileSchema(
    [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    "Diapositivas de Defensa (PDF o PPTX)"
  ),
  planillas: fileSchema(["application/pdf"], "Planillas de Evaluación Firmadas (PDF)"),
  sistemaZip: z.custom<File | null>().optional(),
});

export const fullProjectSchema = projectSubmissionSchema.refine(
  (data) => Boolean(data.repoUrl) || data.sistemaZip instanceof File,
  {
    message: "Debes subir el código fuente del sistema (.ZIP) o proporcionar un enlace funcional.",
    path: ["repoUrl"],
  }
);
