import { cookies, headers } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type UserRow } from "@/db/schema";
import type { Role } from "./constants";
import type { UserDTO } from "./types";
import { signJwt, verifyJwt } from "./jwt";

export const SESSION_COOKIE = "briana_session";
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 7));

interface SessionClaims extends Record<string, unknown> {
  sid: string;
  uid: number;
  role: Role;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */
export class HttpError extends Error {
  status: number;
  data?: Record<string, unknown>;
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function postgresInfo(e: unknown): { code?: string; table?: string; column?: string; constraint?: string } {
  const out: { code?: string; table?: string; column?: string; constraint?: string } = {};
  let current: unknown = e;
  for (let i = 0; i < 6 && current && typeof current === "object"; i += 1) {
    const o = current as Record<string, unknown>;
    if (!out.code && typeof o.code === "string") out.code = o.code;
    for (const key of ["table", "column", "constraint"] as const) {
      if (!out[key] && typeof o[key] === "string") out[key] = o[key] as string;
    }
    current = o.cause;
  }
  return out;
}

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...(e.data ?? {}) }, { status: e.status });
  }
  console.error("[BRIANA] Error no controlado:", e);

  const info = postgresInfo(e);
  const code = info.code;
  if (code === "23505") {
    return Response.json({ error: "Ya existe una cuenta con esos datos. Comprueba el correo y vuelve a intentarlo." }, { status: 409 });
  }
  if (code === "23502") {
    return Response.json({
      error: `La base antigua exige el campo «${info.column ?? "desconocido"}», que no existe en el formulario actual. Actualiza el esquema y vuelve a intentarlo.`,
      schemaOutdated: true,
      missingColumn: info.column ?? null,
    }, { status: 503 });
  }
  // 42703 columna inexistente · 42P01 tabla inexistente · 42704 tipo/objeto inexistente · 0A000 DDL no soportado
  if (code === "42703" || code === "42P01" || code === "42704" || code === "0A000" || code === "SCHEMA_INCOMPLETE") {
    return Response.json(
      {
        error:
          "La base de datos de producción está desactualizada (falta una columna o tabla). BRIANA intenta repararla automáticamente al arrancar, en /api/health y al iniciar sesión. Si el mensaje persiste, abre /api/health para ver qué falta y a qué base estás conectado, o ejecuta node scripts/migrate-production.cjs con DATABASE_URL.",
        schemaOutdated: true,
      },
      { status: 503 }
    );
  }
  if (code === "22P02") {
    return Response.json({
      error: "La base de datos rechazó un valor porque una lista (estado, rol o aprobación) está desactualizada. Vuelve a desplegar para actualizar el esquema.",
      schemaOutdated: true,
      pgCode: code,
      table: info.table ?? null,
      column: info.column ?? null,
    }, { status: 503 });
  }
  if (code === "42804") {
    return Response.json({
      error: `Tipo de dato incompatible en la base de datos${info.table ? ` (tabla ${info.table}` : ""}${info.column ? `, columna ${info.column}` : ""}${info.table ? ")" : ""}. Vuelve a desplegar para normalizar el esquema.`,
      schemaOutdated: true,
      pgCode: code,
      table: info.table ?? null,
      column: info.column ?? null,
    }, { status: 503 });
  }
  if (code === "23503") {
    return Response.json({
      error: `Referencia inválida en la base de datos${info.constraint ? ` (restricción ${info.constraint})` : ""}. Verifica los datos seleccionados.`,
      pgCode: code,
    }, { status: 400 });
  }
  if (code === "23514") {
    return Response.json({
      error: `Los datos no cumplen una regla de la base de datos${info.constraint ? ` (restricción ${info.constraint})` : ""}. Contacta al administrador para revisar reglas heredadas.`,
      pgCode: code,
    }, { status: 400 });
  }
  if (code === "25P02" || code === "57P01") {
    return Response.json({
      error: "La conexión con la base de datos se interrumpió en medio de la operación. Inténtalo de nuevo en unos segundos.",
      retryable: true,
    }, { status: 503 });
  }

  return Response.json(
    { error: "No se pudo completar la operación. Inténtalo de nuevo o contacta al administrador." },
    { status: 500 }
  );
}

/* ------------------------------------------------------------------ */
/* Passwords (scrypt nativo de Node)                                   */
/* ------------------------------------------------------------------ */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* ------------------------------------------------------------------ */
/* DTO                                                                 */
/* ------------------------------------------------------------------ */
export function toUserDTO(u: UserRow): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    cedula: u.cedula,
    phone: u.phone,
    trayecto: u.trayecto,
    emailVerified: u.emailVerified,
    isActive: u.isActive,
    approvalStatus: u.approvalStatus,
    createdAt: u.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Sessions: JWT firmado con JWT_SECRET + registro revocable en BD     */
/* ------------------------------------------------------------------ */
export async function createSession(user: Pick<UserRow, "id" | "role">): Promise<string> {
  const sid = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt });
  const token = signJwt({ sid, uid: user.id, role: user.role } satisfies SessionClaims, SESSION_DAYS * 86400);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

async function readClaimsList(): Promise<SessionClaims[]> {
  const store = await cookies();
  const requestHeaders = await headers();
  const cookieToken = store.get(SESSION_COOKIE)?.value;
  const authorization = requestHeaders.get("authorization") ?? "";
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const tokens = [...new Set([cookieToken, bearerToken].filter((t): t is string => !!t))];
  const claims: SessionClaims[] = [];

  for (const token of tokens) {
    const decoded = verifyJwt<SessionClaims>(token);
    if (decoded && typeof decoded.sid === "string" && Number.isInteger(decoded.uid)) claims.push(decoded);
  }
  return claims;
}

export async function destroySession(): Promise<void> {
  const claims = await readClaimsList();
  for (const claim of claims) {
    await db.delete(sessions).where(eq(sessions.id, claim.sid));
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function revokeUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const claimsList = await readClaimsList();
  for (const claims of claimsList) {
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, claims.sid), eq(sessions.userId, claims.uid), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (rows[0]?.user) return rows[0].user.isActive ? rows[0].user : null;
  }
  return null;
}

export async function requireUser(roles?: Role[]): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) {
    throw new HttpError(401, "Tu sesión venció o dejó de ser válida. Inicia sesión otra vez.", {
      authExpired: true,
    });
  }
  if (user.approvalStatus === "pending") {
    throw new HttpError(403, "Tu solicitud de tutor está pendiente de aprobación por el administrador.", { approvalPending: true });
  }
  if (user.approvalStatus === "rejected") {
    throw new HttpError(403, "Tu solicitud de tutor fue rechazada por el administrador.", { approvalRejected: true });
  }
  if (!user.isActive) {
    throw new HttpError(403, "Tu cuenta está deshabilitada. Contacta al administrador institucional.");
  }
  if (roles && !roles.includes(user.role)) {
    throw new HttpError(403, "Tu rol no tiene permisos para esta operación.");
  }
  return user;
}
