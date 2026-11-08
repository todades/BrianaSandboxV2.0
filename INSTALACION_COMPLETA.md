# BRIANA · Instalación completa para Render / Neon

## Error que resuelve este paquete

Si Render muestra:

```text
Module not found: Can't resolve './useProjectList'
Module not found: Can't resolve '@/lib/project-filters'
```

significa que copiaste solo algunos archivos. `AdminDashboard.tsx` necesita
componentes y utilidades adicionales. Este paquete incluye el proyecto completo.

## Descarga

Usa preferiblemente:

- `briana-fuente-completa.zip`

También se actualiza:

- `briana-render-fix.zip`

No uses parches antiguos parciales.

## Instalación en un repositorio existente

1. Haz respaldo de tu repositorio actual.
2. Descarga y descomprime `briana-fuente-completa.zip`.
3. Copia todo el contenido descomprimido a la raíz de tu repositorio.
4. Acepta reemplazar archivos.
5. Conserva tu `.env` local si ya lo tenías; el ZIP no incluye `.env`.
6. En Render, configura las variables en Environment, no en el repositorio.

Estructura esperada:

```text
BrianaSandboxV2.0/
  server.js
  package.json
  package-lock.json
  tsconfig.json
  next.config.ts
  render.yaml
  scripts/
  src/
    app/
    components/
    db/
    lib/
  public/
```

## Variables mínimas en Render

```text
DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
DATABASE_SSL=true
JWT_SECRET=un_secreto_largo
ADMIN_EMAIL=tu_correo_admin
ADMIN_PASSWORD=tu_clave_admin
ADMIN_NAME=administrador
```

Opcionales para correo/IA:

```text
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=...
EMAIL_PASS=...
EMAIL_FROM=...
GEMINI_API_KEY=...
```

## Comandos en Render

- Build Command: `npm ci --include=dev && npm run build`
- Start Command: `node server.js`
- Health Check Path: `/api/health`

## Verificación local antes de subir

```bash
npm ci --include=dev
npm run typecheck
npm run build
npm run check:render
```

`check:render` puede avisar si faltan variables locales; lo importante es que no
faltan archivos fuente. Para probar arranque local:

```bash
npm start
```

Luego abre:

```text
http://localhost:3000/api/health
```

## Subir a GitHub y Render

```bash
git add .
git commit -m "Proyecto completo BRIANA: solicitudes de tutor y cuentas"
git push origin main
```

En Render: **Manual Deploy → Clear build cache & deploy**.

## Después del deploy

Abre:

```text
https://TU-SERVICIO.onrender.com/api/health
```

Debe mostrar `schema.ok: true`. Si no, ejecuta en Render Shell:

```bash
node scripts/migrate-production.cjs
```

## Flujo nuevo

- Tutor se registra como solicitud pendiente.
- Administrador entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Panel de Administración → Cuentas: aprobar/rechazar, activar/desactivar,
  eliminar cuentas de estudiante/tutor.
- Estudiantes solo seleccionan tutores aprobados.
