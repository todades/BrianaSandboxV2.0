import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type CodePurpose = "verify_email" | "reset_password";

export interface MailConfig {
  service: string | null;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

/* ------------------------------------------------------------------ */
/* Configuración desde variables de entorno institucionales            */
/*   EMAIL_USER, EMAIL_PASS (App Password), EMAIL_FROM,                 */
/*   EMAIL_HOST (smtp.gmail.com), EMAIL_PORT (465), EMAIL_SECURE,       */
/*   EMAIL_SERVICE (opcional: "gmail", "outlook", ...)                  */
/* ------------------------------------------------------------------ */
export function getMailConfig(): MailConfig {
  const user = process.env.EMAIL_USER?.trim() || null;
  const pass = (process.env.EMAIL_PASS ?? process.env.EMAIL_PASSWORD ?? "").trim() || null;
  const service = process.env.EMAIL_SERVICE?.trim() || null;
  const host = process.env.EMAIL_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.EMAIL_PORT || 465);
  const secure = process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE.trim() === "true" : port === 465;
  const from =
    process.env.EMAIL_FROM?.trim() || (user ? `BRIANA Repositorio <${user}>` : "BRIANA Repositorio <no-reply@briana.local>");
  return { service, host, port, secure, user, pass, from };
}

export function mailConfigured(): boolean {
  const c = getMailConfig();
  return !!(c.user && c.pass);
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "••••";
  const visible = local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

const g = globalThis as typeof globalThis & { __brianaMailer?: Transporter; __brianaMailerKey?: string };

export function getTransporter(): Transporter | null {
  const c = getMailConfig();
  if (!c.user || !c.pass) return null;
  const key = `${c.service}|${c.host}|${c.port}|${c.secure}|${c.user}`;
  if (g.__brianaMailer && g.__brianaMailerKey === key) return g.__brianaMailer;

  const options: SMTPTransport.Options = {
    ...(c.service ? { service: c.service } : { host: c.host, port: c.port, secure: c.secure }),
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
  g.__brianaMailer = nodemailer.createTransport(options);
  g.__brianaMailerKey = key;
  return g.__brianaMailer;
}

export async function verifyMailTransport(): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "SMTP no configurado (EMAIL_USER / EMAIL_PASS)." };
  try {
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo verificar el servidor SMTP." };
  }
}

/* ------------------------------------------------------------------ */
/* Plantilla institucional del correo con el código de 6 dígitos       */
/* ------------------------------------------------------------------ */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildCodeEmail(opts: { name: string; code: string; purpose: CodePurpose; ttlMinutes: number }) {
  const { name, code, purpose, ttlMinutes } = opts;
  const isVerify = purpose === "verify_email";
  const subject = isVerify
    ? `Tu código de verificación BRIANA: ${code}`
    : `Código para restablecer tu contraseña BRIANA: ${code}`;
  const heading = isVerify ? "Verifica tu cuenta" : "Restablece tu contraseña";
  const intro = isVerify
    ? "Gracias por registrarte en BRIANA, el repositorio académico institucional. Introduce este código en la pantalla de confirmación para activar tu cuenta."
    : "Recibimos una solicitud para restablecer la contraseña de tu cuenta BRIANA. Introduce este código para autorizar el cambio.";
  const safeName = escapeHtml(name || "usuario");
  const spaced = code.split("").join(" ");

  const text = `${heading}\n\nHola ${name},\n\n${intro}\n\nCódigo: ${code}\n\nEl código expira en ${ttlMinutes} minutos. Si no solicitaste esta acción, ignora este mensaje.\n\n— BRIANA · Sistema Institucional · PNF Informática`;

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#070d1b;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070d1b;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#0d1629;border:1px solid #1e2a4a;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <div style="display:inline-block;width:52px;height:52px;line-height:52px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#38bdf8);color:#fff;font-size:26px;font-weight:900;">B</div>
          <div style="margin-top:12px;font-size:22px;font-weight:900;letter-spacing:.25em;color:#fff;">BRIANA</div>
          <div style="font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:#38bdf8;margin-top:4px;">Repositorio Académico · IA</div>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <h1 style="margin:0 0 10px;font-size:20px;color:#fff;">${heading}</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;">Hola <strong style="color:#e2e8f0;">${safeName}</strong>, ${escapeHtml(intro)}</p>
        </td></tr>
        <tr><td style="padding:8px 32px;" align="center">
          <div style="display:inline-block;padding:18px 28px;border-radius:14px;background:#0a1224;border:1px solid #2a3a64;box-shadow:0 0 30px rgba(56,189,248,.25);">
            <span style="font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:.35em;color:#38bdf8;">${spaced}</span>
          </div>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;">
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#94a3b8;">⏱ El código expira en <strong style="color:#e2e8f0;">${ttlMinutes} minutos</strong> y solo puede usarse una vez.</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Si no solicitaste esta acción, ignora este mensaje. Nunca compartas este código con nadie: el personal de BRIANA jamás te lo pedirá.</p>
        </td></tr>
        <tr><td style="padding:14px 32px;background:#0a1224;border-top:1px solid #1e2a4a;text-align:center;font-size:11px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;">BRIANA · Sistema Institucional · PNF Informática</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

export async function sendCodeEmail(opts: {
  to: string;
  name: string;
  code: string;
  purpose: CodePurpose;
  ttlMinutes: number;
}): Promise<{ delivered: boolean; error?: string }> {
  const transporter = getTransporter();
  const { subject, text, html } = buildCodeEmail(opts);

  if (!transporter) {
    // Modo desarrollo: sin SMTP el código se registra en la consola del servidor.
    console.log(`[BRIANA][MAIL:DEV] ${opts.purpose} → ${opts.to} · código ${opts.code}`);
    return { delivered: false, error: "SMTP no configurado (EMAIL_USER / EMAIL_PASS)." };
  }

  try {
    await transporter.sendMail({ from: getMailConfig().from, to: opts.to, subject, text, html });
    return { delivered: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido al enviar el correo.";
    console.error("[BRIANA][MAIL] Error enviando correo:", message);
    return { delivered: false, error: message };
  }
}
