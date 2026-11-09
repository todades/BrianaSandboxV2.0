import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  customType,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */
export const roleEnum = pgEnum("user_role", ["estudiante", "tutor", "administrador"]);

export const projectStatusEnum = pgEnum("project_status", [
  "enviado_tutor", // Estudiante -> Tutor
  "devuelto", // Tutor -> Estudiante (correcciones)
  "devuelto_tutor", // Administrador -> Tutor (correcciones)
  "validado_tutor", // Tutor -> Administrador
  "publicado", // Administrador publica en el repositorio
  "rechazado", // Administrador rechaza
]);

export const codePurposeEnum = pgEnum("code_purpose", ["verify_email", "reset_password"]);

export const userApprovalStatusEnum = pgEnum("user_approval_status", ["pending", "approved", "rejected"]);

/* ------------------------------------------------------------------ */
/* Custom bytea type for binary file storage                           */
/* ------------------------------------------------------------------ */
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    cedula: varchar("cedula", { length: 50 }),
    phone: varchar("phone", { length: 50 }),
    trayecto: varchar("trayecto", { length: 50 }),
    emailVerified: boolean("email_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    approvalStatus: userApprovalStatusEnum("approval_status").notNull().default("approved"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("users_role_idx").on(t.role)]
);

/* ------------------------------------------------------------------ */
/* Códigos de 6 dígitos (verificación de cuenta / recuperación)        */
/* ------------------------------------------------------------------ */
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    purpose: codePurposeEnum("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("codes_user_purpose_idx").on(t.userId, t.purpose)]
);

/* ------------------------------------------------------------------ */
/* Sessions (cookie JWT firmada + registro revocable en BD)            */
/* ------------------------------------------------------------------ */
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

/* ------------------------------------------------------------------ */
/* Files (PDF del recurso / Planilla firmada) stored in PostgreSQL     */
/* ------------------------------------------------------------------ */
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  kind: varchar("kind", { length: 30 }).notNull(), // "pdf" | "planilla"
  data: bytea("data").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    codigo: varchar("codigo", { length: 100 }),
    slug: varchar("slug", { length: 255 }),
    tipoRecurso: text("tipo_recurso").notNull(),
    pnf: text("pnf").notNull().default("Informática"),
    lineaInvestigacion: text("linea_investigacion").notNull(),
    autores: text("autores")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tutorNombre: text("tutor_nombre"),
    tutorId: integer("tutor_id").references(() => users.id, { onDelete: "set null" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    anio: integer("anio"),
    trayecto: varchar("trayecto", { length: 50 }),
    palabrasClave: text("palabras_clave"),
    resumen: text("resumen"),
    pdfFileId: integer("pdf_file_id").references(() => files.id, { onDelete: "set null" }),
    planillaFileId: integer("planilla_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    status: projectStatusEnum("status").notNull().default("enviado_tutor"),
    observaciones: text("observaciones"),
    aiSource: varchar("ai_source", { length: 40 }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("projects_student_idx").on(t.studentId),
    index("projects_tutor_idx").on(t.tutorId),
    index("projects_status_idx").on(t.status),
  ]
);

/* ------------------------------------------------------------------ */
/* Audit logs                                                          */
/* ------------------------------------------------------------------ */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    userRole: varchar("user_role", { length: 30 }),
    action: varchar("action", { length: 80 }).notNull(),
    entity: varchar("entity", { length: 40 }),
    entityId: integer("entity_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)]
);

/* ------------------------------------------------------------------ */
/* Server settings (e.g. Gemini key configured from the admin panel)   */
/* ------------------------------------------------------------------ */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type AuditRow = typeof auditLogs.$inferSelect;
export type VerificationCodeRow = typeof verificationCodes.$inferSelect;
