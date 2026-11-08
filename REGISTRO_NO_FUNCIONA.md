# BRIANA · Registro de estudiante y tutor (error 500)

## Causa comprobada

En la base antigua `users` puede tener columnas obligatorias adicionales (por ejemplo `username` o `status`) sin valor predeterminado. La aplicación nueva no las envía y PostgreSQL rechaza el registro. El chequeo anterior solo buscaba columnas faltantes, así que `/api/health` podía decir `schema.ok: true` aunque INSERT fallara.

## Reparación en esta versión

- La migración relaja únicamente columnas HEREDADAS de `users` que sean `NOT NULL` sin default y que BRIANA ya no usa. No borra cuentas ni proyectos.
- `/api/health` ahora incluye `schema.registrationBlockers` y solo marca el esquema completo si está vacío.
- El registro muestra mensajes concretos para correo duplicado o columnas heredadas obligatorias.
- Se probaron INSERT reales de estudiante y tutor sobre una base antigua con `username` y `status` obligatorios.

## Pasos en tu Render

1. Copia el ZIP `briana-fuente-completa.zip` entero a la RAÍZ del repositorio. No uses un parche viejo.
2. Sube los cambios a GitHub.
3. Render → **Manual Deploy → Clear build cache & deploy**.
4. Abre `https://brianasandboxv2-0.onrender.com/api/health`.
5. Confirma `ready: true`, `schema.ok: true`, `missingColumns: []` y `registrationBlockers: []`.
6. Vuelve a probar con un correo NUEVO que no exista ya en `users`.

## Si no puedes redesplegar

En Neon SQL Editor, en la misma branch/base de `DATABASE_URL` de Render, ejecuta el contenido COMPLETO de `neon-fix.sql` hasta `COMMIT;`. Luego recarga la aplicación. Si la API sigue mostrando el error genérico, se debe redesplegar también el código de diagnóstico.

## Si aún falla

Pega el JSON de `/api/health` (sin credenciales) y el mensaje NUEVO del formulario. Si `registrationBlockers` tiene nombres, compáralos con la tabla `users` en Neon.

La solicitud de tutor necesita verificación por correo y aprobación del administrador. La cuenta de estudiante necesita verificar su correo. Si SMTP no está configurado, el registro puede quedar pendiente hasta configurar un servicio de envío de correo; esto es distinto de un fallo de base de datos.

**Seguridad:** si una contraseña apareció visible en una captura pública, cámbiala en Render → Environment (`ADMIN_PASSWORD`) y despliega de nuevo.
