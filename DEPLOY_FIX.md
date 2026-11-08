# BRIANA · Corrección de arranque en Render y ajustes funcionales

## Diagnóstico

El build de Next.js termina correctamente, pero Render intenta ejecutar:

```text
node server.js
```

y el repositorio no tenía ese archivo en la raíz. Por eso aparece:

```text
Error: Cannot find module '/opt/render/project/src/server.js'
code: 'MODULE_NOT_FOUND'
```

La solución no es crear un Express paralelo ni mover las rutas API. BRIANA usa Next.js App Router; el archivo `server.js` de la raíz debe arrancar la aplicación compilada por `next build`.

---

## 1. Archivos que debes copiar a la raíz del repositorio

### `package.json`

```json
{
  "name": "briana",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node server.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@types/nodemailer": "^8.0.2",
    "dotenv": "17.3.1",
    "drizzle-orm": "0.45.2",
    "lucide-react": "^1.69.0",
    "next": "16.2.6",
    "nodemailer": "^10.3.1",
    "pg": "8.20.0",
    "playwright": "^1.65.0",
    "react": "19.2.6",
    "react-dom": "19.2.6"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.1.17",
    "@types/node": "22.19.15",
    "@types/pg": "8.18.0",
    "@types/react": "19.2.6",
    "@types/react-dom": "19.2.3",
    "drizzle-kit": "0.31.10",
    "eslint": "9.39.4",
    "eslint-config-next": "16.2.6",
    "postcss": "8.5.8",
    "tailwindcss": "4.1.17",
    "typescript": "5.9.3"
  },
  "version": "1.0.0",
  "description": "BRIANA · Repositorio académico institucional con Next.js, PostgreSQL y IA",
  "engines": {
    "node": ">=20.18.0"
  }
}
```

> Si tu `package.json` tiene otras dependencias propias, conserva esas dependencias y cambia únicamente `name`, `scripts.start`, `scripts.build` y `engines`. No borbes dependencias que tu proyecto ya use.

### `server.js` (raíz, NO `src/server.js`)

```js
/**
 * BRIANA · Arranque de producción para Render.
 *
 * Render puede ejecutar `node server.js` o `npm start`.
 * Este archivo NO sustituye las rutas de Next.js: sirve la aplicación ya
 * compilada por `next build`, incluidas las rutas `/api/*`.
 */
const http = require("node:http");
const next = require("next");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV === "development";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[BRIANA] PORT inválido:", process.env.PORT);
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((error) => {
        console.error("[BRIANA] Error atendiendo la solicitud:", error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        }
        res.end(JSON.stringify({ error: "Error interno del servidor." }));
      });
    });

    server.on("error", (error) => {
      console.error("[BRIANA] No se pudo iniciar el servidor:", error);
      process.exit(1);
    });

    server.listen(port, hostname, () => {
      console.log(`[BRIANA] Servidor listo en http://${hostname}:${port}`);
    });

    const shutdown = () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10000).unref();
    };

    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  })
  .catch((error) => {
    console.error("[BRIANA] Falló el arranque de Next.js:", error);
    process.exit(1);
  });
```

### `.nvmrc`

```text
22
```

---

## 2. Configuración exacta en Render

En **Render → tu servicio → Settings**:

```text
Build Command:
npm ci --include=dev && npx drizzle-kit push --force && npm run build

Start Command:
node server.js

Health Check Path:
/api/health
```

Si ya tienes las tablas creadas y no quieres sincronizar esquema en cada build, puedes usar:

```text
npm ci --include=dev && npm run build
```

y ejecutar `npx drizzle-kit push` aparte cuando cambies el esquema.

Variables mínimas:

```text
NODE_ENV=production
NODE_VERSION=22
DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
DATABASE_SSL=true
JWT_SECRET=un_secreto_largo
ADMIN_EMAIL=administrador@gmail.com
ADMIN_PASSWORD=tu_clave_maestra
ADMIN_NAME=administrador
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_password_de_aplicacion
EMAIL_FROM=BRIANA <tu_correo@gmail.com>
```

No subas `.env` al repositorio.

> Importante: Render Free bloquea salida SMTP en los puertos habituales. El arranque quedará corregido, pero para enviar códigos por Gmail/SMTP necesitas una instancia de pago o cambiar el transporte de correo a una API HTTPS.

---

## 3. Si usas `render.yaml`

El archivo corregido usa:

```yaml
buildCommand: npm ci --include=dev && npx drizzle-kit push --force && npm run build
startCommand: node server.js
healthCheckPath: /api/health
```

No apuntes a `src/server.js`. El archivo correcto está en la raíz: `./server.js`.

---

## 4. Ajustes funcionales incluidos en el parche

- `src/components/ProjectViews.tsx`
  - Confirmación exacta al enviar al administrador:
    `¿Está seguro de enviar este proyecto al Administrador?`
  - Tutor con archivos originales en solo lectura.
  - Devolución del administrador al tutor para corrección.
- `src/app/api/projects/[id]/files/route.ts`
  - Bloqueo HTTP 403 si un tutor intenta reemplazar PDF/planilla.
- `src/app/api/projects/[id]/route.ts`
  - Transiciones tutor ↔ estudiante y administrador → tutor.
- `src/app/api/tutors/route.ts`
  - Solo tutores como destinatarios; orden alfabético; sin correo del administrador.
- `src/components/MetadataFields.tsx`
  - Buscador de tutores y orden alfabético también en cliente.
- `src/lib/validation.ts`, `src/components/ui.tsx`, `src/app/api/auth/register/route.ts`
  - Cédula numérica de 6 a 9 dígitos.
  - Teléfono venezolano de 11 dígitos: 0412, 0414, 0416, 0422, 0424, 0426.
  - Correo con formato válido; la propiedad del buzón se confirma con el código de 6 dígitos.
- `src/components/SandboxPanel.tsx`
  - Limpieza de formulario/archivos tras envío y alerta de éxito.
  - Placeholders HTML nativos: desaparecen al escribir.

---

## 5. Verificación local antes de subir

```bash
npm ci --include=dev
npm run typecheck
npm run build
npm start
```

En otra terminal:

```bash
curl http://localhost:3000/api/health
```

Debe responder JSON con `ok: true`.

Luego sube los cambios y en Render usa **Manual Deploy → Clear build cache & deploy** si quedó cacheado el comando anterior.
