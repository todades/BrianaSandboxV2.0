# BRIANA · Solución exacta al error “base de datos de producción desactualizada”

## Lo que significa

BRIANA ya llega a PostgreSQL/Neon, pero falta una columna o tabla nueva
(por ejemplo `users.is_active`, `users.email_verified` o el estado
`devuelto_tutor`). No es un error de contraseña.

## Opción recomendada: Neon SQL Editor

1. Abre **Neon Console**.
2. Selecciona el proyecto/base que usa Render.
   - Debe ser la misma que aparece en `DATABASE_URL` de Render.
   - Si tienes varias branches, usa la branch de producción (normalmente `main`).
3. En el menú izquierdo entra en **SQL Editor**.
4. Descarga este archivo:
   - `/downloads/neon-fix.sql`
5. Ábrelo con Bloc de notas o VS Code.
6. Copia TODO el contenido.
7. Pégalo en el SQL Editor de Neon.
8. Pulsa **Run** / **Execute**.
9. Si termina sin error, vuelve a BRIANA y prueba iniciar sesión.

## Comprobación rápida en Neon

Después de ejecutar el script, pega esto en el SQL Editor y ejecútalo:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('is_active', 'email_verified', 'verified_at');
```

Debe mostrar estas tres columnas:

- `email_verified`
- `is_active`
- `verified_at`

Si no aparecen, ejecutaste el script en otra base/branch o el script no terminó.

## Opción desde Render Shell

Si Neon SQL Editor no te funciona:

1. Render → tu servicio → **Shell**.
2. Ejecuta:

```bash
npm run db:migrate
```

o:

```bash
node scripts/migrate-production.cjs
```

Debe decir:

```text
[BRIANA] Esquema de base de datos verificado/actualizado.
```

## Para que se arregle solo en cada deploy

En Render → Settings:

- **Start Command:** `node server.js`
- **Build Command:** `npm ci --include=dev && npm run build`
- **Health Check Path:** `/api/health`

En Render → Environment:

- `DATABASE_URL` = cadena real de Neon, no `base`, no `localhost`.
- `DATABASE_SSL=true`
- `SKIP_AUTO_MIGRATE` no debe existir, o debe estar en `false`.

Luego: **Manual Deploy → Clear build cache & deploy**.

## Si sigue saliendo el mismo error

1. Confirma que Neon SQL Editor y Render usan la misma base:
   - copia el host de `DATABASE_URL` en Render (solo el host, sin contraseña)
   - compáralo con el host del proyecto Neon donde ejecutaste el SQL.
2. Si son distintos, cambia `DATABASE_URL` en Render o ejecuta el SQL en la base correcta.
3. Redespliega.
