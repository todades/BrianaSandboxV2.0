# BRIANA · Cómo aplicar solicitudes de tutor y administración de cuentas

## Qué incluye este cambio

- Registro de tutor como **solicitud pendiente**.
- El tutor verifica correo, pero no inicia sesión hasta ser aprobado.
- Pestaña **Cuentas** para el administrador:
  - aprobar/rechazar solicitudes de tutor;
  - activar/desactivar cuentas;
  - eliminar cuentas de estudiante o tutor.
- Selector de tutores del estudiante: solo tutores aprobados.
- Migración automática para `users.approval_status` y columnas opcionales antiguas.

## Código descargable

Usa el parche completo:

- `briana-render-fix.zip`

Contiene, entre otros, estos archivos clave:

```text
server.js
render.yaml
scripts/production-schema.sql
scripts/migrate-production.cjs
scripts/doctor-render.cjs
src/db/schema.ts
src/lib/auth.ts
src/lib/constants.ts
src/lib/types.ts
src/lib/schema-guard.ts
src/lib/seed.ts
src/lib/audit-labels.ts
src/app/api/auth/register/route.ts
src/app/api/auth/login/route.ts
src/app/api/auth/verify/route.ts
src/app/api/admin/users/route.ts
src/app/api/admin/users/[id]/route.ts
src/app/api/tutors/route.ts
src/components/AuthView.tsx
src/components/AdminDashboard.tsx
src/components/AccountsAdmin.tsx
```

## Paso 1: copiar el código a tu proyecto

1. Descarga `briana-render-fix.zip`.
2. Descomprime el ZIP.
3. Copia las carpetas/archivos dentro de la raíz de tu repositorio BRIANA.
4. Acepta **reemplazar** los archivos existentes.
5. No copies ningún `.env` real ni credenciales. El ZIP no incluye `.env`.

En Windows debe quedarte algo así:

```text
BrianaSandboxV2.0/
  server.js
  package.json
  render.yaml
  scripts/
  src/
  public/
```

## Paso 2: subir a GitHub

Desde la carpeta del proyecto:

```bash
git add .
git commit -m "Solicitudes de tutor y administracion de cuentas"
git push origin main
```

Si usas GitHub Desktop: cambios → commit → push.

## Paso 3: desplegar en Render

En Render → tu servicio:

- Build Command: `npm ci --include=dev && npm run build`
- Start Command: `node server.js`
- Health Check Path: `/api/health`

Luego:

- **Manual Deploy → Clear build cache & deploy**

## Paso 4: verificar la base de datos

Abre:

```text
https://TU-SERVICIO.onrender.com/api/health
```

Debe decir:

```json
{
  "ready": true,
  "schema": {
    "ok": true,
    "missingColumns": []
  }
}
```

Si `schema.ok` es `false`, ejecuta en Render → Shell:

```bash
node scripts/migrate-production.cjs
```

o vuelve a desplegar. La migración es idempotente: no borra datos.

## Paso 5: entrar como administrador

Usa las variables de Render → Environment:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

No necesariamente son `administrador@gmail.com` / `Briana#Admin2025` si tú las cambiaste.

## Paso 6: probar el flujo

1. Cierra sesión.
2. Regístrate como **Tutor**.
3. Debe decir que la solicitud quedó pendiente.
4. Verifica el correo si el sistema lo pide.
5. Entra como administrador.
6. Ve a **Cuentas**.
7. Aprueba la solicitud de tutor.
8. Inicia sesión como tutor.
9. Como administrador, en **Cuentas**, puedes eliminar cuentas de estudiante o tutor.

## Si aparece error

- `missingColumns`: ejecuta `node scripts/migrate-production.cjs`.
- `Credenciales incorrectas`: revisa `ADMIN_EMAIL` y `ADMIN_PASSWORD` en Render.
- `ENOTFOUND`: `DATABASE_URL` tiene un host inventado; usa la URL real de Neon.
- `unsupported startup parameter`: usa el parche actual; no agregues `options` al pool.
