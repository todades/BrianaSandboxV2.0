# BRIANA · Cómo acomodarlo en Render (arranque + base de datos)

## 1. Qué pasó y qué significa cada error

### Error A: `Cannot find module '/opt/render/project/src/server.js'`
Render compilaba Next.js pero ejecutaba `node server.js` y ese archivo no existía.
**Solución:** `server.js` en la raíz del repositorio (incluido en el parche) y
`package.json` con `"start": "node server.js"`.

### Error B (tu captura actual): `Failed query: select ... "is_active" ... from "users"`
El sitio ya arranca, pero **la base de datos de producción está desactualizada**:
le faltan columnas/tablas nuevas (`users.is_active`, `email_verified`,
`project_status = devuelto_tutor`, etc.). No es un problema de contraseña.
**Solución:** aplicar el esquema idempotente `scripts/production-schema.sql`.

---

## 2. Forma recomendada (automática)

1. Copia al repositorio los archivos del parche (respetando rutas):
   - `server.js`
   - `scripts/migrate-production.cjs`
   - `scripts/production-schema.sql`
   - `package.json` / `package-lock.json`
   - `render.yaml`, `.nvmrc`
   - `src/lib/auth.ts` (mensajes claros, ya no muestra SQL crudo)
2. Súbelos a GitHub y en Render: **Manual Deploy → Deploy latest commit**
   (o *Clear build cache & deploy*).
3. Al arrancar, `server.js` ejecuta la migración **antes** de aceptar tráfico.
   En los logs verás: `[BRIANA] Esquema de base de datos verificado/actualizado.`
4. Entra con el correo y clave de `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   (en tu captura: `brianaadmin@gmail.com`). La cuenta administradora se
   crea/verifica automáticamente si no existe.

Configuración del servicio en Render:

```text
Build Command:  npm ci --include=dev && npm run build
Start Command:  node server.js
Health Check:   /api/health
NODE_VERSION:   22
```

Variables obligatorias: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NAME`. Para correo: `EMAIL_HOST`, `EMAIL_PORT`,
`EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`.

---

## 3. Alternativa manual en Neon (sin redeploy)

1. Abre **Neon → tu proyecto → SQL Editor**.
2. Pega el contenido completo de `scripts/production-schema.sql`.
3. Ejecuta. Es idempotente: no borra datos, solo agrega lo que falta.
4. Recarga BRIANA e inicia sesión.

## 4. Alternativa por terminal (local o Render Shell)

```bash
DATABASE_URL="postgresql://usuario:clave@host/base?sslmode=require" \
  node scripts/migrate-production.cjs
```

En Windows (PowerShell):

```powershell
$env:DATABASE_URL="postgresql://usuario:clave@host/base?sslmode=require"
node scripts/migrate-production.cjs
```

---

## 5. Archivos de arranque (contenido exacto)

### `package.json` (scripts relevantes)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node server.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "engines": { "node": ">=20.18.0" }
}
```

### `server.js`

Consulta el archivo `server.js` incluido en el parche: arranca Next.js en
`0.0.0.0:$PORT`, aplica la migración idempotente con reintentos y maneja
SIGTERM/SIGINT. No usa Express ni reemplaza las rutas `/api`.

---

## 6. Ajustes funcionales incluidos

- Confirmación del tutor: `¿Está seguro de enviar este proyecto al Administrador?`
- Tutor: PDF/planilla en solo lectura (bloqueo también en la API, HTTP 403).
- Tutores: orden alfabético + buscador; sin correo del administrador.
- Cédula 6–9 dígitos; teléfono VE 11 dígitos (0412/0414/0416/0422/0424/0426).
- Correo con formato válido + confirmación por código de 6 dígitos.
- Limpieza del formulario tras envío y alerta de éxito.
- Administrador puede devolver el proyecto al tutor para corrección.
- `handleError`: si falta una columna/tabla responde 503 con instrucciones,
  sin exponer la consulta SQL ni parámetros.

---

## 7. Verificación rápida

```bash
npm ci --include=dev
npm run typecheck
npm run build
npm start
# otra terminal:
curl http://localhost:3000/api/health
```

Debe devolver `{"ok":true,...}`. Si ves `schemaOutdated: true`, ejecuta la
migración (sección 3 o 4) y reintenta.

> Nota: Render Free bloquea SMTP saliente. El arranque y la base quedan
> corregidos, pero para enviar códigos por correo necesitas instancia de pago
> o un transporte HTTPS.

---

## 8. Si Render vuelve a marcar “Deploy failed / Exited with status 1”

El aviso rojo de `npm audit` (vulnerabilities) **no es la causa** del fallo de
arranque; es una advertencia. El fallo real aparece después de `Build successful`.

1. Copia también la carpeta `scripts/` completa del parche. Si solo copiaste
   `server.js`, faltará `scripts/migrate-production.cjs`.
2. En Render → **Shell** (o en tu máquina con las mismas variables) ejecuta:

```bash
npm run check:render
```

o equivalentemente:

```bash
node scripts/doctor-render.cjs
```

Para aplicar la migración desde el diagnóstico:

```bash
node scripts/doctor-render.cjs --fix
```

3. Si el diagnóstico dice que falta una variable, agrégala en
   **Render → Environment** y vuelve a desplegar.
4. Si dice que `DATABASE_URL` apunta a `localhost`, cámbiala por la URL externa
   de Neon/Render Postgres con `?sslmode=require` y `DATABASE_SSL=true`.
5. Si dice que falta `scripts/migrate-production.cjs`, sube la carpeta
   `scripts/` completa al repositorio.
6. Logs esperados tras un arranque correcto:

```text
[BRIANA] Esquema de base de datos verificado/actualizado.
[BRIANA] Servidor listo en http://0.0.0.0:10000
```
