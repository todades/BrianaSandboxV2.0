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
