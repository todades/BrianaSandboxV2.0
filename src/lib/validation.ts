/** Prefijos móviles de Venezuela (10 dígitos totales). */
export const MOBILE_PREFIXES = ["0412", "0414", "0416", "0422", "0424", "0426"] as const;

/** Valida teléfono móvil venezolano: prefijo 0412/0414/0416/0422/0424/0426 + 6 dígitos (10 dígitos). */
export function isValidVenezuelanPhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return MOBILE_PREFIXES.some((prefix) => digits.startsWith(prefix)) && digits.length === 10;
}

/** Validación sintáctica estricta de correo; la verificación OTP confirma acceso real al buzón. */
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
