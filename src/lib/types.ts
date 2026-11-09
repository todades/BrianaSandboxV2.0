import type { ApprovalStatus, ProjectStatus, Role } from "./constants";

export interface UserDTO {
  id: number;
  name: string;
  email: string;
  role: Role;
  cedula: string | null;
  phone: string | null;
  trayecto: string | null;
  emailVerified: boolean;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

export interface MetadataForm {
  title: string;
  codigo: string;
  slug: string;
  tipoRecurso: string;
  pnf: string;
  lineaInvestigacion: string;
  autores: string; // separados por ;
  tutorNombre: string;
  tutorId: string; // id de la cuenta destinataria (como string para el <select>)
  anio: string;
  trayecto: string;
  palabrasClave: string;
  resumen: string;
}

export interface FileInfo {
  id: number;
  filename: string;
  size: number;
}

export interface ProjectDTO {
  id: number;
  title: string;
  codigo: string | null;
  slug: string | null;
  tipoRecurso: string;
  pnf: string;
  lineaInvestigacion: string;
  autores: string[];
  tutorNombre: string | null;
  tutorId: number | null;
  tutorEmail: string | null;
  tutorCuenta: string | null;
  studentId: number;
  studentName: string | null;
  studentEmail: string | null;
  anio: number | null;
  trayecto: string | null;
  palabrasClave: string | null;
  resumen: string | null;
  status: ProjectStatus;
  observaciones: string | null;
  aiSource: string | null;
  pdf: FileInfo | null;
  planilla: FileInfo | null;
  validatedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditDTO {
  id: number;
  userId: number | null;
  userName: string | null;
  userRole: string | null;
  action: string;
  entity: string | null;
  entityId: number | null;
  details: unknown;
  createdAt: string;
  readable?: {
    action: string;
    entity: string;
    role: string;
    detail: string;
  };
}

export interface AiExtraction {
  source: "gemini" | "heuristico";
  model?: string;
  message?: string;
  metadata: Partial<MetadataForm>;
}

export interface MailStatus {
  configured: boolean;
  devMode: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  verified: boolean | null;
  error?: string;
}

export interface AiStatus {
  active: boolean;
  source: "env" | "servidor" | null;
  model: string;
  maskedKey: string | null;
  dbOk: boolean;
  checkedAt: string;
  error?: string;
  mail: MailStatus;
}

/** Respuesta estándar al emitir un código de 6 dígitos. */
export interface CodeDispatch {
  email: string;
  name?: string | null;
  delivered: boolean;
  devCode: string | null;
  expiresAt: string | null;
  ttlMinutes: number | null;
  cooldownSeconds: number;
  mailError: string | null;
  note?: string | null;
}

export interface ServerSettings {
  geminiConfigured: boolean;
  geminiSource: "env" | "servidor" | null;
  maskedKey: string | null;
  envKeyPresent: boolean;
  adminEmail: string;
  adminName: string;
  env: {
    nodeEnv: string;
    jwtSecret: boolean;
    emailUser: boolean;
    emailPass: boolean;
    emailFrom: string | null;
    geminiKey: boolean;
    databaseProvider: string;
    databaseSsl: boolean;
    demoTutor: boolean;
    codeTtlMinutes: number;
    resendCooldownSeconds: number;
  };
}
