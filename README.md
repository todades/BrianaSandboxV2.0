# BRIANA · Repositorio Académico Institucional con IA

Sistema institucional (PNF Informática) para la entrega, validación y publicación de trabajos académicos con
extracción de metadatos por IA (Gemini), flujo multi-rol **Estudiante → Tutor → Administrador**, verificación de
cuenta y recuperación de contraseña por **códigos de 6 dígitos** enviados por correo (nodemailer).

> Stack: **Next.js (App Router) + Node.js**, **PostgreSQL (Neon)** vía Drizzle ORM, Tailwind CSS, nodemailer, Gemini API.
> El backend vive en `src/app/api/**` (equivalente a las rutas de Express) y las librerías en `src/lib/**`.

---

## 1. Flujos de seguridad por correo (6 dígitos)

| Flujo | Endpoint | Descripción |
|---|---|---|
| Registro | `POST /api/auth/register` | Crea la cuenta (Estudiante/Tutor) **sin sesión**, genera un código de 6 dígitos (hash SHA-256 en BD, expira en `CODE_TTL_MINUTES`) y lo envía por SMTP. |
| Verificación | `POST /api/auth/verify` | Valida el código (máx. 5 intentos), marca `email_verified = true` y abre la sesión. |
| Reenvío | `POST /api/auth/resend` | Nuevo código respetando `RESEND_COOLDOWN_SECONDS`. |
| Login | `POST /api/auth/login` | Bloquea cuentas no verificadas (responde `403 needsVerification`) y reenvía el código automáticamente. |
| Olvidé mi contraseña | `POST /api/auth/forgot` | Envía un código de recuperación (respuesta genérica si el correo no existe). |
| Restablecer | `POST /api/auth/reset` | Valida el código, cambia la contraseña y **revoca todas las sesiones** anteriores. |

Las sesiones usan una cookie `httpOnly` con **JWT HS256 firmado con `JWT_SECRET`** + registro revocable en la tabla `sessions`.

**Modo desarrollo:** si `EMAIL_USER`/`EMAIL_PASS` no están definidos, el código se muestra en pantalla y en la consola
del servidor para poder probar el flujo. En producción configura SMTP y los códigos solo viajan por correo.

## 2. Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | Cadena de Neon: `postgresql://USER:PASS@ep-xxx.neon.tech/neondb?sslmode=require` |
| `DATABASE_SSL` | – | `true` fuerza TLS (se activa solo si el host no es local). `DATABASE_SSL_STRICT=true` exige certificado verificado. |
| `JWT_SECRET` | ✅ | Secreto largo y aleatorio para firmar las sesiones. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | ✅ | **Administrador único** del sistema. Se crea/sincroniza automáticamente; el rol no admite registro abierto. |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` | – | SMTP (por defecto `smtp.gmail.com`, `465`, `true`). Alternativa: `EMAIL_SERVICE=gmail`. |
| `EMAIL_USER` / `EMAIL_PASS` | ✅ (prod) | Cuenta SMTP. En Gmail usa una **Contraseña de aplicación**. |
| `EMAIL_FROM` | – | Remitente visible, ej. `BRIANA Repositorio <correo@gmail.com>`. |
| `CODE_TTL_MINUTES` / `RESEND_COOLDOWN_SECONDS` | – | Vigencia del código (15) y espera entre reenvíos (60). |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | – | Clave de Gemini (también configurable desde Administrador → Servidor). Sin clave se usa un extractor heurístico local. |
| `DEMO_TUTOR_EMAIL` / `DEMO_TUTOR_NAME` / `DEMO_TUTOR_PASSWORD` | – | Tutor de demostración ya verificado (omitir en producción). |

Copia `.env.example` a `.env` para desarrollo local.

## 3. Despliegue en Render + Neon

1. **Neon:** crea un proyecto y copia la cadena de conexión (con `?sslmode=require`).
2. **Render:** *New → Blueprint* apuntando a este repositorio (usa `render.yaml`) o crea un *Web Service* Node con:
   - Build: `npm install && npx drizzle-kit push --force && npm run build`
   - Start: `npm start` · Health check: `/api/health`
3. Define las variables de la tabla anterior (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `EMAIL_USER`, `EMAIL_PASS`, …).
4. Al primer arranque, `/api/health` crea el administrador único y el esquema ya estará sincronizado con Neon.

## 4. Formulario de metadatos (Sandbox)

Secciones y campos exactos: **Título del Proyecto** (textarea obligatorio) · **Identificación y Clasificación**
(Código, Slug, Tipo de Recurso, PNF = Informática, Línea de Investigación) · **Autoría y Tutoría** (Autores `;`,
Tutor o Director, Cuenta del Tutor destinatario) · **Detalles Académicos** (Año, Trayecto = Trayecto III) ·
**Archivos Adjuntos** (Subir PDF del Recurso · Subir Planilla Firmada — requerida para aprobar).

Al enviar con éxito, el formulario se limpia por completo y aparece una alerta flotante de confirmación.

## 5. Desarrollo local

```bash
npm install
npx drizzle-kit push      # crea/sincroniza tablas
npm run dev               # http://localhost:3000
```

Cuentas iniciales: `administrador@gmail.com` (contraseña de `ADMIN_PASSWORD`) y, si está configurado,
el tutor demo `eliasvargas@gmail.com`.
