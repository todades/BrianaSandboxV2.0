# BRIANA · Arreglar “base de datos de producción desactualizada” en Neon

Este paso aplica el esquema que BRIANA necesita sin borrar tus datos.

## Pasos exactos

1. Abre **Neon Console** → tu proyecto.
2. Entra en **SQL Editor**.
3. Descarga y abre este archivo SQL:
   - `neon-fix.sql` (recomendado)
   - o `production-schema.sql` (mismo contenido)
4. Copia **todo** el contenido del archivo.
5. Pégalo en el SQL Editor de Neon.
6. Pulsa **Run** / **Execute**.
7. Debe terminar sin error. Si pregunta por transacción, acepta ejecutar el script completo.
8. Vuelve a BRIANA en Render e inicia sesión.

## Verificación opcional en Neon

Ejecuta esto en el SQL Editor:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('is_active', 'email_verified', 'verified_at');
```

Debe devolver al menos:

- `email_verified`
- `is_active`
- `verified_at`

Y esta consulta debe devolver `devuelto_tutor`:

```sql
SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'project_status';
```

## Si prefieres Render Shell

En Render → Shell:

```bash
node scripts/migrate-production.cjs
```

o:

```bash
npm run db:migrate
```

## Importante

- No borres la base ni la tabla `users` manualmente.
- No cambies `DATABASE_URL` a `localhost` ni a `base`.
- Si cambiaste `ADMIN_PASSWORD` en Render, BRIANA sincroniza esa clave al iniciar sesión/healthcheck.
