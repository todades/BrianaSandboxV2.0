import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * JWT HS256 mínimo (sin dependencias) para firmar la cookie de sesión.
 * El secreto proviene de JWT_SECRET (variable institucional en Render).
 */
const g = globalThis as typeof globalThis & { __brianaJwtSecret?: string };

export function getJwtSecret(): string {
  const configured = (process.env.JWT_SECRET || process.env.SESSION_SECRET || "").trim();
  if (configured.length >= 16) return configured;
  if (!g.__brianaJwtSecret) {
    g.__brianaJwtSecret = randomBytes(48).toString("hex");
    console.warn(
      "[BRIANA] JWT_SECRET no está definido (o es muy corto). Se usa un secreto efímero: las sesiones se invalidarán al reiniciar el servidor."
    );
  }
  return g.__brianaJwtSecret;
}

export function isJwtSecretConfigured(): boolean {
  return (process.env.JWT_SECRET || process.env.SESSION_SECRET || "").trim().length >= 16;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function signJwt(payload: Record<string, unknown>, expiresInSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const signature = createHmac("sha256", getJwtSecret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyJwt<T extends Record<string, unknown>>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = createHmac("sha256", getJwtSecret()).update(`${header}.${body}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
