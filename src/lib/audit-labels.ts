import { STATUS_META, type ProjectStatus } from "./constants";

export interface ReadableAudit {
  action: string;
  entity: string;
  role: string;
  detail: string;
}

const ACTIONS: Record<string, string> = {
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  LOGIN_FALLIDO: "Intento de inicio de sesión no aceptado",
  LOGIN_PENDIENTE_VERIFICACION: "Acceso pendiente de confirmar el correo",
  REGISTRO_CUENTA: "Registro de una cuenta",
  SOLICITUD_TUTOR_REGISTRADA: "Solicitud de cuenta de tutor registrada",
  TUTOR_APROBADO: "Solicitud de tutor aprobada",
  TUTOR_RECHAZADO: "Solicitud de tutor rechazada",
  TUTOR_PENDIENTE: "Solicitud de tutor marcada como pendiente",
  CUENTA_ACTIVADA: "Cuenta activada",
  CUENTA_DESACTIVADA: "Cuenta desactivada",
  CUENTA_ACTUALIZADA: "Cuenta actualizada",
  CUENTA_ELIMINADA: "Cuenta eliminada",
  CUENTA_VERIFICADA: "Correo electrónico confirmado",
  RECUPERACION_SOLICITADA: "Solicitud para recuperar la contraseña",
  CONTRASENA_RESTABLECIDA: "Contraseña cambiada",
  CODIGO_VERIFICACION_REENVIADO: "Reenvío del código para confirmar el correo",
  CODIGO_RECUPERACION_REENVIADO: "Reenvío del código para recuperar la contraseña",
  TUTOR_ACTIVADO: "Cuenta de tutor habilitada",
  TUTOR_DESHABILITADO: "Cuenta de tutor deshabilitada",
  PROYECTO_ENVIADO_TUTOR: "Proyecto enviado al tutor",
  PROYECTO_ACTUALIZADO: "Proyecto actualizado",
  PROYECTO_REENVIADO_TUTOR: "Proyecto corregido y enviado al tutor",
  PROYECTO_REENVIADO_ADMIN: "Proyecto corregido y enviado al administrador",
  PROYECTO_DEVUELTO_TUTOR: "Proyecto devuelto al tutor para correcciones",
  PROYECTO_DEVUELTO_ESTUDIANTE: "Proyecto devuelto al estudiante para correcciones",
  PROYECTO_VALIDADO_TUTOR: "Proyecto aprobado por el tutor",
  PROYECTO_PUBLICADO: "Proyecto publicado",
  PROYECTO_RECHAZADO: "Proyecto rechazado",
  PROYECTO_ELIMINADO: "Proyecto eliminado",
  PDF_REEMPLAZADO: "Documento del proyecto reemplazado",
  PLANILLA_ADJUNTADA: "Planilla firmada adjuntada",
  IA_EXTRACCION_METADATOS: "Extracción de información del documento",
  IA_CLAVE_ACTUALIZADA: "Configuración de inteligencia artificial actualizada",
  IA_CLAVE_ELIMINADA: "Configuración de inteligencia artificial retirada",
};

const ENTITIES: Record<string, string> = {
  proyecto: "Proyecto",
  usuario: "Cuenta de usuario",
  archivo: "Documento",
  configuracion: "Configuración",
};

const ROLES: Record<string, string> = {
  estudiante: "Estudiante",
  tutor: "Tutor",
  administrador: "Administrador",
  sistema: "Sistema",
};

const FIELDS: Record<string, string> = {
  titulo: "Título del proyecto",
  codigo: "Código del proyecto",
  slug: "Dirección del proyecto",
  tipoRecurso: "Tipo de recurso",
  pnf: "Programa de formación",
  lineaInvestigacion: "Línea de investigación",
  autores: "Autores",
  tutorNombre: "Nombre del tutor o director",
  tutorId: "Cuenta del tutor",
  anio: "Año de publicación",
  trayecto: "Trayecto",
  palabrasClave: "Palabras clave",
  resumen: "Resumen",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusLabel(value: unknown): string | null {
  const labels: Record<ProjectStatus, string> = {
    enviado_tutor: "En revisión por el tutor",
    devuelto: "Devuelto al estudiante para correcciones",
    devuelto_tutor: "Devuelto al tutor para correcciones",
    validado_tutor: "Pendiente de revisión por el administrador",
    publicado: "Publicado",
    rechazado: "Rechazado",
  };
  const key = text(value);
  return key && key in STATUS_META ? labels[key as ProjectStatus] : null;
}

function readableKey(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function bytes(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function deliveryLabel(details: Record<string, unknown>): string | null {
  if (typeof details.codigoEnviado === "boolean") {
    return details.codigoEnviado ? "El código de confirmación fue enviado por correo." : "El código de confirmación quedó pendiente de envío por correo.";
  }
  if (typeof details.delivered === "boolean") {
    return details.delivered ? "El mensaje fue enviado por correo." : "El mensaje quedó pendiente de envío por correo.";
  }
  return null;
}

function genericDetail(details: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined || key === "error") continue;
    const label = FIELDS[key] ?? readableKey(key);
    if (typeof value === "string" && value.trim()) parts.push(`${label}: ${value.trim()}`);
    else if (typeof value === "number" && Number.isFinite(value)) parts.push(`${label}: ${value}`);
    else if (typeof value === "boolean") parts.push(`${label}: ${value ? "Sí" : "No"}`);
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) parts.push(`${label}: ${value.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Traduce la vista sin alterar el registro original ni perder el historial. */
export function describeAudit(actionCode: string, entityCode: string | null, roleCode: string | null, rawDetails: unknown): ReadableAudit {
  const details = asRecord(rawDetails);
  const action = ACTIONS[actionCode] ?? readableKey(actionCode);
  const entity = entityCode ? ENTITIES[entityCode] ?? readableKey(entityCode) : "—";
  const role = roleCode ? ROLES[roleCode] ?? readableKey(roleCode) : "—";
  const parts: string[] = [];

  const title = text(details.titulo);
  if (title) parts.push(`Proyecto: «${title}».`);
  const from = statusLabel(details.de);
  const to = statusLabel(details.a);
  if (from && to && from !== to) parts.push(`Estado anterior: ${from}. Estado actual: ${to}.`);
  else if (to) parts.push(`Estado: ${to}.`);

  const tutor = text(details.tutor);
  if (tutor) parts.push(`Tutor: ${tutor}.`);
  const observation = text(details.observaciones);
  if (observation) parts.push(`Observaciones: ${observation}${/[.!?]$/.test(observation) ? "" : "."}`);

  if (Array.isArray(details.camposEditados) && details.camposEditados.length) {
    const fields = details.camposEditados.filter((v): v is string => typeof v === "string").map((key) => FIELDS[key] ?? readableKey(key));
    parts.push(`Campos revisados: ${fields.join(", ")}.`);
  }

  const filename = text(details.filename);
  if (filename) parts.push(`Documento: ${filename}.`);
  const size = bytes(details.size);
  if (size) parts.push(`Tamaño: ${size}.`);
  if (typeof details.planilla === "boolean") parts.push(details.planilla ? "Incluye planilla firmada." : "La planilla firmada está pendiente.");
  if (typeof details.archivosEliminados === "number") parts.push(`Archivos eliminados junto con el proyecto: ${details.archivosEliminados}.`);
  if (typeof details.isActive === "boolean") parts.push(details.isActive ? "La cuenta quedó habilitada." : "La cuenta quedó deshabilitada.");

  const roleDetail = text(details.role);
  if (roleDetail && ROLES[roleDetail]) parts.push(`Tipo de cuenta: ${ROLES[roleDetail]}.`);
  const delivery = deliveryLabel(details);
  if (delivery) parts.push(delivery);
  if (details.via === "verificacion") parts.push("Acceso después de confirmar el correo.");
  if (details.source === "gemini") parts.push("Información extraída con inteligencia artificial.");
  else if (details.source === "heuristico") parts.push("Información extraída directamente del documento.");
  const model = text(details.model);
  if (model) parts.push(/gemini/i.test(model) ? "Herramienta utilizada: Google Gemini." : "Se utilizó una herramienta de inteligencia artificial.");
  if (typeof details.verificada === "boolean") parts.push(details.verificada ? "La configuración fue comprobada correctamente." : "La configuración se guardó, pero no pudo comprobarse.");

  const email = text(details.email);
  if (email) parts.push(`Correo relacionado: ${email}.`);
  const error = text(details.error);
  if (error) parts.push("La comprobación de la configuración no pudo completarse. Revisa la conexión con el servicio de inteligencia artificial.");

  if (!parts.length) {
    const generic = genericDetail(details);
    if (generic) parts.push(generic);
  }

  return { action, entity, role, detail: parts.length ? parts.join(" ") : "Sin información adicional." };
}
