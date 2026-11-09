"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Shield,
  Mail,
  Eye,
  EyeOff,
  GraduationCap,
  UserCog,
  ShieldCheck,
  ArrowLeft,
  MailCheck,
  KeyRound,
  RefreshCw,
  Clock,
  Wand2,
} from "lucide-react";
import { api, ApiError, postJson } from "@/lib/api-client";
import { DEFAULT_ADMIN_EMAIL, TRAYECTOS } from "@/lib/constants";
import type { CodeDispatch, UserDTO } from "@/lib/types";
import { isValidEmailAddress, VENEZUELAN_MOBILE_HTML_PATTERN, VENEZUELAN_MOBILE_PREFIXES } from "@/lib/validation";
import {
  Alert,
  Field,
  onlyDigits,
  onlyNameLetters,
  PrimaryButton,
  SecondaryButton,
  validateCedula,
  validateFullName,
  validatePhone,
} from "./ui";
import { useToast } from "./toast";

type View = "login" | "register" | "verify" | "forgot" | "reset";
type AccountType = "estudiante" | "tutor";

/* ------------------------------------------------------------------ */
/* Entrada de código de 6 dígitos                                      */
/* ------------------------------------------------------------------ */
function CodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function focusAt(i: number) {
    refs.current[Math.max(0, Math.min(5, i))]?.focus();
  }

  function commit(next: string, focusIndex: number) {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    focusAt(focusIndex);
  }

  function handleChange(i: number, raw: string) {
    const v = raw.replace(/\D/g, "");
    if (!v) {
      commit(value.slice(0, i), i);
      return;
    }
    if (v.length > 1) {
      // Pegado o autocompletado del sistema operativo.
      const merged = (value.slice(0, i) + v).slice(0, 6);
      commit(merged, merged.length);
      return;
    }
    const merged = value.slice(0, i) + v + value.slice(i + 1);
    commit(merged, i + 1);
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        commit(value.slice(0, i) + value.slice(i + 1), i);
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i), i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(i + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text) commit(text, text.length);
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={`code-box ${d ? "filled" : ""}`}
          aria-label={`Dígito ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estado del envío de código                                          */
/* ------------------------------------------------------------------ */
function toDispatch(email: string, d: Record<string, unknown> | null | undefined): CodeDispatch {
  const get = <T,>(k: string, fallback: T): T => (d && k in d && d[k] !== undefined ? (d[k] as T) : fallback);
  return {
    email: get<string>("email", email),
    name: get<string | null>("name", null),
    delivered: get<boolean>("delivered", false),
    devCode: get<string | null>("devCode", null),
    expiresAt: get<string | null>("expiresAt", null),
    ttlMinutes: get<number | null>("ttlMinutes", null),
    cooldownSeconds: get<number>("cooldownSeconds", 60),
    mailError: get<string | null>("mailError", null),
    note: get<string | null>("note", null),
  };
}

function DispatchStatus({ d, onUseCode }: { d: CodeDispatch; onUseCode: (code: string) => void }) {
  return (
    <div className="space-y-2">
      {d.devCode ? (
        <Alert tone="warning" titulo="Modo desarrollo: servidor SMTP no configurado">
          El correo no se envió porque faltan <code className="font-mono">EMAIL_USER / EMAIL_PASS</code>. Tu código
          de prueba es{" "}
          <b className="font-mono text-base tracking-[0.3em] text-ink">{d.devCode}</b>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => onUseCode(d.devCode!)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-500 hover:text-cyan-400"
            >
              <Wand2 size={12} /> Usar este código
            </button>
          </div>
        </Alert>
      ) : d.delivered ? (
        <Alert tone="success" titulo="Código enviado">
          Revisa la bandeja de entrada de <b>{d.email}</b> (y la carpeta de spam).
        </Alert>
      ) : d.mailError ? (
        <Alert tone="error" titulo="No se pudo enviar el correo">
          {d.mailError} Puedes intentarlo de nuevo con «Reenviar código».
        </Alert>
      ) : d.note ? (
        <Alert tone="info">{d.note}</Alert>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vista principal de autenticación                                    */
/* ------------------------------------------------------------------ */
export function AuthView({ onAuth }: { onAuth: (user: UserDTO) => void }) {
  const toast = useToast();
  const [view, setView] = useState<View>("login");
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("estudiante");
  const [trayecto, setTrayecto] = useState<string>("Trayecto I");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [cedula, setCedula] = useState("");
  const [phone, setPhone] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name: string | null;
    cedula: string | null;
    phone: string | null;
  }>({ name: null, cedula: null, phone: null });

  // Flujo de códigos de 6 dígitos
  const [otp, setOtp] = useState("");
  const [dispatch, setDispatch] = useState<CodeDispatch | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function go(v: View) {
    setView(v);
    setError(null);
    setInfo(null);
    if (v === "login" || v === "register") {
      setAdminMode(false);
      setOtp("");
    }
  }

  function startCodeFlow(v: "verify" | "reset", d: CodeDispatch) {
    setDispatch(d);
    setOtp("");
    setCooldown(d.cooldownSeconds || 60);
    setView(v);
  }

  /* ---------------- Login ---------------- */
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { user } = await postJson<{ user: UserDTO }>("/api/auth/login", { email, password });
      toast.success(`Bienvenido, ${user.name}`, "Sesión iniciada correctamente.");
      onAuth(user);
    } catch (err) {
      if (err instanceof ApiError && err.data?.needsVerification) {
        setInfo(err.message);
        startCodeFlow("verify", toDispatch(email, err.data));
      } else if (err instanceof ApiError && (err.data?.approvalPending || err.data?.approvalRejected)) {
        setInfo(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
      }
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- Registro ---------------- */
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!isValidEmailAddress(email)) {
      setError("Ingresa un correo válido (por ejemplo, nombre@gmail.com) y confirma que puedes recibir el código.");
      return;
    }

    // Validación estricta de nombre, cédula y teléfono antes del envío.
    const nameErr = validateFullName(name);
    const cedErr = validateCedula(cedula);
    const phErr = validatePhone(phone);
    setFieldErrors({ name: nameErr, cedula: cedErr, phone: phErr });
    if (nameErr || cedErr || phErr) {
      setError(nameErr || cedErr || phErr);
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const res = await postJson<Record<string, unknown>>("/api/auth/register", {
        accountType,
        name,
        cedula,
        email,
        phone,
        trayecto,
        password,
        confirm: password2,
      });
      if (accountType === "tutor" || res.approvalPending) {
        setInfo("Solicitud de tutor enviada. Confirma tu correo con el código de 6 dígitos; luego el administrador debe aprobar la solicitud antes de que puedas iniciar sesión como tutor.");
      } else {
        setInfo("Cuenta creada. Confirma tu correo con el código de 6 dígitos para activarla.");
      }
      startCodeFlow("verify", toDispatch(email, res));
    } catch (err) {
      if (err instanceof ApiError && err.data?.needsVerification) {
        setInfo(err.message);
        startCodeFlow("verify", toDispatch(email, err.data));
      } else {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
      }
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- Verificación ---------------- */
  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError("Introduce los 6 dígitos del código.");
      return;
    }
    setLoading(true);
    try {
      const target = dispatch?.email || email;
      const { user } = await postJson<{ user: UserDTO }>("/api/auth/verify", { email: target, code: otp });
      toast.success("¡Cuenta verificada!", "Tu correo fue confirmado y ya tienes acceso al repositorio.");
      onAuth(user);
    } catch (err) {
      if (err instanceof ApiError && (err.data?.approvalPending || err.data?.approvalRejected)) {
        setInfo(err.message);
        setView("login");
        setOtp("");
        toast.info("Correo verificado", err.message);
      } else {
        setError(err instanceof Error ? err.message : "No se pudo verificar el código.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(purpose: "verify_email" | "reset_password") {
    setResending(true);
    setError(null);
    try {
      const target = dispatch?.email || email;
      const res = await postJson<Record<string, unknown>>("/api/auth/resend", { email: target, purpose });
      const d = toDispatch(target, res);
      setDispatch(d);
      setOtp("");
      setCooldown(d.cooldownSeconds || 60);
      toast.info("Código reenviado", d.delivered ? `Enviado a ${d.email}.` : "Se generó un nuevo código.");
    } catch (err) {
      if (err instanceof ApiError && typeof err.data?.retryAfter === "number") {
        setCooldown(err.data.retryAfter as number);
      }
      setError(err instanceof Error ? err.message : "No se pudo reenviar el código.");
    } finally {
      setResending(false);
    }
  }

  /* ---------------- Recuperación ---------------- */
  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await postJson<Record<string, unknown>>("/api/auth/forgot", { email });
      setInfo("Introduce el código de 6 dígitos y tu nueva contraseña.");
      setPassword("");
      setPassword2("");
      startCodeFlow("reset", toDispatch(email, res));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la recuperación.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError("Introduce los 6 dígitos del código.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const target = dispatch?.email || email;
      await postJson("/api/auth/reset", { email: target, code: otp, password, confirm: password2 });
      toast.success("Contraseña restablecida", "Ya puedes iniciar sesión con tu nueva contraseña.");
      setPassword("");
      setPassword2("");
      setOtp("");
      go("login");
      setInfo("Contraseña actualizada correctamente. Inicia sesión.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  function adminAccess() {
    go("login");
    setAdminMode(true);
    setEmail(DEFAULT_ADMIN_EMAIL);
    setPassword("");
    setInfo("Consultando el correo administrativo configurado en el servidor...");
    void api<{ admin?: { email?: string; defaultPasswordActive?: boolean; passwordSource?: string } }>("/api/health")
      .then((health) => {
        const adminEmail = health.admin?.email || DEFAULT_ADMIN_EMAIL;
        setEmail(adminEmail);
        if (health.admin?.defaultPasswordActive) {
          setInfo(`Administrador configurado: ${adminEmail}. La contraseña por defecto está activa; cámbiala en producción con ADMIN_PASSWORD.`);
        } else {
          setInfo(`Administrador configurado: ${adminEmail}. Usa la contraseña de la variable ADMIN_PASSWORD en Render → Environment.`);
        }
      })
      .catch(() => {
        setInfo("Modo administrativo: ingresa el correo ADMIN_EMAIL y la contraseña ADMIN_PASSWORD configurados en el servidor.");
      });
  }

  /* ---------------- Subcomponentes de campo (sin iconos internos) ---------------- */
  const passwordField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    show: boolean,
    toggle: () => void,
    autoComplete: string
  ) => (
    <Field label={label} required>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className="input-base pr-11"
          placeholder="••••••••"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted2 hover:text-cyan-500 transition"
          aria-label="Mostrar u ocultar contraseña"
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  );

  const emailField = (
    <Field label="Correo Electrónico" required>
      <input
        type="email"
        className="input-base"
        placeholder="usuario@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
    </Field>
  );

  const isTabView = view === "login" || view === "register";
  const headerTitle: Record<View, { titulo: string; subtitle: string; icon: typeof MailCheck }> = {
    login: { titulo: "", subtitle: "", icon: MailCheck },
    register: { titulo: "", subtitle: "", icon: MailCheck },
    verify: {
      titulo: "Confirma tu correo",
      subtitle: `Introduce el código de 6 dígitos enviado a ${dispatch?.email || email}.`,
      icon: MailCheck,
    },
    forgot: {
      titulo: "Recuperar contraseña",
      subtitle: "Te enviaremos un código de 6 dígitos para autorizar el cambio seguro de tu contraseña.",
      icon: KeyRound,
    },
    reset: {
      titulo: "Nueva contraseña",
      subtitle: `Código enviado a ${dispatch?.email || email}. Introdúcelo junto con tu nueva contraseña.`,
      icon: KeyRound,
    },
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-grid bg-radial-glow relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-cyan-500/15 blur-3xl" />

      <div className="w-full max-w-md fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 shield-glow rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center mb-5">
            <Shield size={36} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-black tracking-[0.2em] text-ink">BRIANA</h1>
          <p className="mt-2 text-sm text-muted text-center max-w-xs leading-relaxed">
            Inicia sesión o crea una cuenta para acceder al repositorio académico.
          </p>
        </div>

        <div className="card p-6">
          {isTabView ? (
            <div className="flex p-1 gap-1 rounded-xl bg-app border border-line mb-6">
              {(["login", "register"] as View[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => go(t)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
                    view === t
                      ? "bg-gradient-to-r from-blue-600 to-cyan-400 text-white shadow-md"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {t === "login" ? "Iniciar sesión" : "Registrarse"}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => go("login")}
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-cyan-500 mb-4"
              >
                <ArrowLeft size={14} /> Volver a iniciar sesión
              </button>
              <div className="flex items-start gap-3">
                {(() => {
                  const Icon = headerTitle[view].icon;
                  return (
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600/20 to-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-500 flex-shrink-0">
                      <Icon size={20} />
                    </div>
                  );
                })()}
                <div>
                  <h2 className="text-lg font-bold text-ink leading-tight">{headerTitle[view].titulo}</h2>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{headerTitle[view].subtitle}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 mb-4 empty:hidden">
            {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}
            {info && (
              <Alert tone={adminMode ? "warning" : "info"} onClose={() => setInfo(null)}>
                {info}
              </Alert>
            )}
          </div>

          {/* ======================= LOGIN ======================= */}
          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              {emailField}
              {passwordField("Contraseña", password, setPassword, showPass, () => setShowPass((s) => !s), "current-password")}
              <div className="pt-2">
                <PrimaryButton type="submit" full loading={loading}>
                  INICIAR SESIÓN
                </PrimaryButton>
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <button type="button" onClick={() => go("forgot")} className="text-muted hover:text-cyan-500 transition">
                  ¿Olvidaste tu contraseña?
                </button>
                <button
                  type="button"
                  onClick={adminAccess}
                  className="text-cyan-500 hover:text-cyan-400 font-semibold inline-flex items-center gap-1"
                >
                  <ShieldCheck size={12} />
                  Acceso administrativo
                </button>
              </div>
            </form>
          )}

          {/* ======================= REGISTRO ======================= */}
          {view === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <Field label="Tipo de Cuenta" required hint="El rol Administrador no admite registro abierto.">
                <div className="grid grid-cols-2 gap-2">
                  {(["estudiante", "tutor"] as AccountType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAccountType(t)}
                      className={`py-2.5 rounded-lg text-sm font-medium transition border inline-flex items-center justify-center gap-1.5 ${
                        accountType === t
                          ? "bg-cyan-500/15 border-cyan-400/50 text-cyan-500"
                          : "bg-field border-line text-muted hover:text-ink"
                      }`}
                    >
                      {t === "estudiante" ? <GraduationCap size={15} /> : <UserCog size={15} />}
                      {t === "estudiante" ? "Estudiante" : "Tutor"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Nombre Completo" required hint="Solo letras, espacios y guiones; no se permiten números.">
                <input
                  className="input-base"
                  placeholder="Ej: Christopher Farias"
                  value={name}
                  maxLength={120}
                  onChange={(e) => {
                    const nextName = onlyNameLetters(e.target.value);
                    setName(nextName);
                    if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: validateFullName(nextName) }));
                  }}
                  onBlur={() => setFieldErrors((f) => ({ ...f, name: validateFullName(name) }))}
                  aria-invalid={!!fieldErrors.name}
                  required
                  autoComplete="name"
                />
                {fieldErrors.name && <p className="text-xs text-red-500 font-medium">{fieldErrors.name}</p>}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Cédula" required hint="Solo números · 6 a 9 dígitos">
                  <input
                    className="input-base"
                    placeholder="12345678"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={9}
                    value={cedula}
                    onChange={(e) => setCedula(onlyDigits(e.target.value, 9))}
                    onBlur={() => setFieldErrors((f) => ({ ...f, cedula: validateCedula(cedula) }))}
                    required
                    autoComplete="off"
                    aria-invalid={!!fieldErrors.cedula}
                  />
                  {fieldErrors.cedula && <p className="text-xs text-red-500 font-medium">{fieldErrors.cedula}</p>}
                </Field>
                <Field label="Teléfono" hint={`Móvil venezolano: ${VENEZUELAN_MOBILE_PREFIXES.slice(0, -1).join(", ")} o ${VENEZUELAN_MOBILE_PREFIXES.at(-1)} + 7 dígitos. Ejemplo: 04221234567.`}>
                  <input
                    className="input-base"
                    placeholder="04221234567"
                    inputMode="numeric"
                    pattern={VENEZUELAN_MOBILE_HTML_PATTERN}
                    titulo="Usa un móvil venezolano de 11 dígitos: 0412, 0414, 0416, 0422, 0424 o 0426."
                    maxLength={11}
                    value={phone}
                    onChange={(e) => {
                      const v = onlyDigits(e.target.value, 11);
                      setPhone(v);
                      setFieldErrors((f) => ({ ...f, phone: v.length > 0 && v.length < 11 ? null : validatePhone(v) }));
                    }}
                    onBlur={() => setFieldErrors((f) => ({ ...f, phone: validatePhone(phone) }))}
                    autoComplete="tel-national"
                    aria-invalid={!!fieldErrors.phone}
                  />
                  {fieldErrors.phone && <p className="text-xs text-red-500 font-medium">{fieldErrors.phone}</p>}
                </Field>
              </div>

              {emailField}

              {accountType === "estudiante" && (
                <Field label="Trayecto del Estudiante" required>
                  <select className="select-base" value={trayecto} onChange={(e) => setTrayecto(e.target.value)}>
                    {TRAYECTOS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              )}

              {passwordField("Contraseña", password, setPassword, showPass, () => setShowPass((s) => !s), "new-password")}
              {passwordField(
                "Confirmar Contraseña",
                password2,
                setPassword2,
                showPass2,
                () => setShowPass2((s) => !s),
                "new-password"
              )}

              <p className="text-[0.72rem] text-muted2 leading-relaxed">
                Al crear la cuenta recibirás un <b className="text-ink">código de 6 dígitos</b> en tu correo. No
                podrás iniciar sesión hasta confirmarlo.
              </p>

              <div className="pt-1">
                <PrimaryButton type="submit" full loading={loading}>
                  CREAR CUENTA
                </PrimaryButton>
              </div>
            </form>
          )}

          {/* ======================= VERIFICAR CUENTA ======================= */}
          {view === "verify" && (
            <form onSubmit={handleVerify} className="space-y-5">
              {dispatch && <DispatchStatus d={dispatch} onUseCode={setOtp} />}

              <Field label="Código de verificación (6 dígitos)" required>
                <div className="py-2">
                  <CodeInput value={otp} onChange={setOtp} disabled={loading} />
                </div>
              </Field>

              <p className="text-[0.72rem] text-muted2 flex items-center justify-center gap-1.5">
                <Clock size={12} /> El código expira en {dispatch?.ttlMinutes ?? 15} minutos y admite 5 intentos.
              </p>

              <PrimaryButton type="submit" full loading={loading} disabled={otp.length !== 6} icon={<MailCheck size={16} />}>
                VERIFICAR CUENTA
              </PrimaryButton>

              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => go("login")} className="text-muted hover:text-cyan-500">
                  Usar otra cuenta
                </button>
                <SecondaryButton
                  size="sm"
                  icon={<RefreshCw size={12} />}
                  loading={resending}
                  disabled={cooldown > 0}
                  onClick={() => handleResend("verify_email")}
                >
                  {cooldown > 0 ? `Reenviar código (${cooldown}s)` : "Reenviar código"}
                </SecondaryButton>
              </div>
            </form>
          )}

          {/* ======================= OLVIDÉ MI CONTRASEÑA ======================= */}
          {view === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-4">
              {emailField}
              <PrimaryButton type="submit" full loading={loading} icon={<Mail size={16} />}>
                ENVIAR CÓDIGO
              </PrimaryButton>
              <p className="text-[0.72rem] text-muted2 text-center">
                ¿Problemas con tu correo? Contacta al administrador institucional ({DEFAULT_ADMIN_EMAIL}).
              </p>
            </form>
          )}

          {/* ======================= RESTABLECER ======================= */}
          {view === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              {dispatch && <DispatchStatus d={dispatch} onUseCode={setOtp} />}

              <Field label="Código de recuperación (6 dígitos)" required>
                <div className="py-2">
                  <CodeInput value={otp} onChange={setOtp} disabled={loading} />
                </div>
              </Field>

              {passwordField("Nueva Contraseña", password, setPassword, showPass, () => setShowPass((s) => !s), "new-password")}
              {passwordField(
                "Confirmar Nueva Contraseña",
                password2,
                setPassword2,
                showPass2,
                () => setShowPass2((s) => !s),
                "new-password"
              )}

              <PrimaryButton
                type="submit"
                full
                loading={loading}
                disabled={otp.length !== 6 || !password || !password2}
                icon={<KeyRound size={16} />}
              >
                RESTABLECER CONTRASEÑA
              </PrimaryButton>

              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => go("forgot")} className="text-muted hover:text-cyan-500">
                  Cambiar correo
                </button>
                <SecondaryButton
                  size="sm"
                  icon={<RefreshCw size={12} />}
                  loading={resending}
                  disabled={cooldown > 0}
                  onClick={() => handleResend("reset_password")}
                >
                  {cooldown > 0 ? `Reenviar código (${cooldown}s)` : "Reenviar código"}
                </SecondaryButton>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-[0.7rem] text-muted2 mt-6 tracking-wider uppercase">
          © {new Date().getFullYear()} BRIANA · Sistema Institucional · PNF Informática
        </p>
      </div>
    </div>
  );
}
