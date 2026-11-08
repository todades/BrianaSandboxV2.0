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

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...(e.data ?? {}) }, { status: e.status });
  }
  console.error("[BRIANA] Error no controlado:", e);
  const message = e instanceof Error ? e.message : "Error interno del servidor";
  return Response.json({ error: message }, { status: 500 });
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
  if (!user.isActive) {
    throw new HttpError(403, "Tu cuenta está deshabilitada. Contacta al administrador institucional.");
  }
  if (roles && !roles.includes(user.role)) {
    throw new HttpError(403, "Tu rol no tiene permisos para esta operación.");
  }
  return user;
}
