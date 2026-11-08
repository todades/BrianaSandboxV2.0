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

---

## 9. Caso exacto: `getaddrinfo ENOTFOUND base`

Si los logs muestran:

```text
Código: ENOTFOUND · Detalle: getaddrinfo ENOTFOUND base
```

significa que `DATABASE_URL` tiene como servidor el texto **`base`**. Eso no es
un servidor real; suele venir de copiar un ejemplo incompleto.

**Arreglo en Render:**

1. Ve a **Render → tu servicio → Environment**.
2. Edita `DATABASE_URL` y pega la cadena completa de tu base real:
   - **Neon:** Console → Connect → Connection string (pooled). Debe verse como
     `postgresql://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
   - **Render Postgres:** Connect → **External Database URL**. Debe verse como
     `postgresql://usuario:clave@dpg-xxxx-a.oregon-postgres.render.com/base?sslmode=require`.
3. El host (lo que va entre `@` y la siguiente `/`) debe ser `ep-...neon.tech`
   o `dpg-...render.com`. **No** debe ser `base`, `host` ni `localhost`.
4. Mantén `DATABASE_SSL=true`.
5. Guarda y haz **Manual Deploy → Clear build cache & deploy**.

No basta con cambiar la contraseña: hay que reemplazar la cadena completa.

---

## 10. Caso exacto: “La base de datos de producción está desactualizada”

Si BRIANA abre pero al iniciar sesión muestra:

```text
La base de datos de producción está desactualizada (falta una columna o tabla).
```

entonces `DATABASE_URL` ya conecta, pero el esquema de Neon/Render Postgres no
tiene las columnas nuevas (por ejemplo `users.is_active`).

**Arreglo rápido en Neon:**

1. Neon Console → tu proyecto → **SQL Editor**.
2. Descarga `neon-fix.sql` o `production-schema.sql` desde `/downloads/`.
3. Copia todo el SQL, pégalo en el editor y ejecútalo.
4. Vuelve a BRIANA e inicia sesión.

**Arreglo por Render Shell:**

```bash
node scripts/migrate-production.cjs
```

Si el arranque automático no lo hizo, revisa que el Start Command sea
`node server.js` y que `SKIP_AUTO_MIGRATE` no esté en `true`.

---

## 11. Auto-reparación sin tocar Neon a mano (versión actual)

Desde esta versión, BRIANA aplica el esquema pendiente **sola** contra la misma
base de `DATABASE_URL`:

- al arrancar (`server.js`);
- en `GET /api/health`;
- al iniciar sesión / registrarse / verificar / recuperar.

Por tanto, tras subir estos archivos y redesplegar, **no necesitas pegar SQL en
Neon**. Basta con abrir:

```text
https://TU-SERVICIO.onrender.com/api/health
```

Respuesta esperada:

```json
{ "ok": true, "adminReady": true, "schema": { "ok": true, "missingTables": [], "missingColumns": [] } }
```

- `schema.ok: true` → el esquema ya está completo; inicia sesión.
- `schema.ok: false` → mira `missingTables` / `missingColumns` y `host`.
  El `host` te dice a qué base se conectó Render; compáralo con el endpoint de
  Neon donde crees que está tu datos. Si son distintos, corrige `DATABASE_URL`.
- `schema.error` → muestra el motivo exacto (permisos, SSL, etc.) sin contraseñas.

La auto-reparación es idempotente: no borra datos ni duplica tablas.

---

## 12. Caso real detectado: faltan `users.name`, `users.email`, `users.password_hash`

Si `/api/health` devuelve:

```json
"missingColumns": ["users.name", "users.email", "users.password_hash"]
```

la tabla `users` existía con un diseño antiguo. La migración actual ahora:

- añade `name`, `email`, `password_hash` y el resto de columnas requeridas;
- recupera datos desde `nombre`, `correo`, `password` / `clave` cuando existen;
- rellena correos únicos temporales si no hay correo recuperable;
- deja `password_hash` vacío cuando la contraseña antigua no era un hash scrypt compatible;
- verifica el esquema después de migrar y no marca la reparación como terminada si aún falta algo.

Después de redesplegar, `/api/health` debe mostrar `schema.ok: true`. El administrador se sincroniza con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Los usuarios antiguos sin hash compatible deben usar recuperación de contraseña.

---

## 13. Caso real: “Credenciales incorrectas” con `administrador@gmail.com`

Si el esquema ya está bien (`schema.ok: true`, `adminReady: true`) pero el login
dice **Credenciales incorrectas**, el correo/clave no coincide con las variables
de Render.

- El correo válido es **`ADMIN_EMAIL`** en Render → Environment.
- La contraseña válida es **`ADMIN_PASSWORD`** en Render → Environment.
- `Briana#Admin2025` solo sirve si no existe `ADMIN_PASSWORD` o si esa variable
  contiene exactamente ese valor.

La versión actual expone en `/api/health` un bloque seguro:

```json
"admin": {
  "email": "correo-configurado",
  "passwordSource": "ADMIN_PASSWORD",
  "defaultPasswordActive": false
}
```

No muestra la contraseña. El botón **Acceso administrativo** consulta ese correo
y lo precarga. Si quieres entrar con `administrador@gmail.com`, configura:

```text
ADMIN_EMAIL=administrador@gmail.com
ADMIN_PASSWORD=una_clave_nueva_y_segura
```

Guarda y redespliega. BRIANA degrada al administrador anterior y sincroniza el
nuevo en una transacción.

---

## 14. Solicitudes de tutor, aprobación y eliminación de cuentas

Desde esta versión:

- Registrarse como **Tutor** crea una **solicitud pendiente** (`approval_status = pending`).
- El tutor debe verificar su correo, pero **no puede iniciar sesión** hasta que
  el administrador apruebe la solicitud.
- El administrador ve las solicitudes en **Panel de Administración → Cuentas**.
- En esa pestaña puede **aprobar**, **rechazar**, **activar/desactivar** y
  **eliminar** cuentas de estudiante o tutor.
- Los estudiantes solo pueden seleccionar tutores **aprobados** en el Sandbox.
- La migración añade `users.approval_status` y relaja columnas opcionales
  antiguas (`cedula`, `phone`, `trayecto`) para evitar el error genérico 500 al
  registrar tutores.

Si `/api/health` muestra `missingColumns: ["users.approval_status"]`, redespliega
o ejecuta `node scripts/migrate-production.cjs`. La migración es idempotente.

---

## 15. Error 500 al registrarse: causa y corrección definitiva

**Síntoma:** al crear una cuenta (tutor o estudiante) aparece
“No se pudo completar la operación”, aunque `/api/health` dice `schema.ok: true`.

**Causa:** la base de producción tiene restos de ediciones manuales
(columnas `is_active`/`email_verified` con otro tipo, `role` como texto,
etiquetas de enum faltantes o `id` sin secuencia). Además, ejecutar toda la
migración en una sola llamada provocaba el error `55P04` de Postgres
(“unsafe use of new value”) al añadir etiquetas de enum y usarlas seguidas.

**Corrección incluida en esta versión:**

- La migración se ejecuta en **dos fases**: primero los enums (Parte 1) y
  después tablas y datos (Parte 2), cada una confirmada por separado.
- Normaliza tipos heredados sin borrar filas: booleanos creados como
  texto/número, `role`/`approval_status` creados como texto e `id` sin secuencia.
- Completa las etiquetas faltantes de los 4 enums (`user_role`,
  `user_approval_status`, `code_purpose`, `project_status`).
- `/api/health` ahora muestra `usersColumns` (tipo de cada columna),
  `enumLabels` y `typeProblems` para ver la deriva exacta.
- Los errores de base de datos responden con mensajes claros en español
  (duplicado, campo obligatorio, valor inválido, tipo incompatible, regla rota)
  en vez del genérico 500.

**Qué hacer:** redespliega con el código actualizado. La migración corre sola
al arrancar. Si el registro sigue fallando, el mensaje indicará la tabla,
columna o restricción exacta: pégalo tal cual para corregirlo.


---

## 16. Deploy que falla en arranque con `42P17` (functions in index predicate)

**Síntoma en logs de Render:**

```text
[BRIANA] Intento 1/3 de actualización de esquema falló.
[BRIANA] Código: 42P17 · Detalle: functions in index predicate must be marked IMMUTABLE
```

**Causa:** el script intentaba crear el índice parcial
`users_single_administrator_idx ... WHERE role = 'administrador'`.
Comparar una columna enum con un literal dentro del predicado de un índice
usa una función no inmutable y Postgres moderno lo rechaza.

**Corrección:** se eliminó esa creación del script. El administrador único se
sigue garantizando de dos formas que no fallan:

1. La migración degrada a `tutor` cualquier administrador distinto del más antiguo.
2. `ensureSystemAccounts()` (src/lib/seed.ts) lo refuerza en cada arranque.

Si tu base ya tiene ese índice creado de antes, se deja intacto (funciona bien);
simplemente ya no se intenta crear de nuevo.

**Qué hacer:** redesplega con el código actualizado
(`briana-fuente-completa.zip`). La migración del arranque terminará y el
servicio levantará.
