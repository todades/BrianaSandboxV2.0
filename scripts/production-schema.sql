-- ============================================================================
-- BRIANA · Esquema de producción idempotente (PostgreSQL / Neon / Render)
-- Se puede ejecutar varias veces sin borrar datos.
-- Uso: node scripts/migrate-production.cjs (o pegar en el SQL Editor de Neon)
-- ============================================================================

-- ============================================================================
-- PARTE 1 · Tipos enumerados (fuera de transacción explícita).
-- Cada sentencia se confirma por separado: compatible con Neon pooled y con
-- ALTER TYPE ... ADD VALUE. Idempotente y tolerante a ejecuciones simultáneas.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'user_role') THEN
    BEGIN
      CREATE TYPE public.user_role AS ENUM ('estudiante', 'tutor', 'administrador');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'project_status') THEN
    BEGIN
      CREATE TYPE public.project_status AS ENUM (
        'enviado_tutor', 'devuelto', 'devuelto_tutor', 'validado_tutor', 'publicado', 'rechazado'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'code_purpose') THEN
    BEGIN
      CREATE TYPE public.code_purpose AS ENUM ('verify_email', 'reset_password');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'user_approval_status') THEN
    BEGIN
      CREATE TYPE public.user_approval_status AS ENUM ('pending', 'approved', 'rejected');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- Asegura todas las etiquetas necesarias (por si un tipo se creó a mano incompleto).
DO $$
DECLARE
  want text[] := ARRAY[
    'user_role|estudiante', 'user_role|tutor', 'user_role|administrador',
    'user_approval_status|pending', 'user_approval_status|approved', 'user_approval_status|rejected',
    'code_purpose|verify_email', 'code_purpose|reset_password',
    'project_status|enviado_tutor', 'project_status|devuelto', 'project_status|devuelto_tutor',
    'project_status|validado_tutor', 'project_status|publicado', 'project_status|rechazado'
  ];
  item text;
  tname text;
  lbl text;
BEGIN
  FOREACH item IN ARRAY want LOOP
    tname := split_part(item, '|', 1);
    lbl := split_part(item, '|', 2);
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = tname AND e.enumlabel = lbl
    ) THEN
      BEGIN
        EXECUTE format('ALTER TYPE public.%I ADD VALUE %L', tname, lbl);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END
$$;

-- ==PART2==
-- ============================================================================
-- PARTE 2 · Tablas, columnas, índices y datos (transaccional).
-- Se ejecuta en una llamada SEPARADA después de la PARTE 1, para que los
-- valores de enum recién añadidos ya estén confirmados al usarlos (evita 55P04).
-- ============================================================================
BEGIN;

SET LOCAL search_path TO public;

SELECT pg_advisory_xact_lock(hashtext('briana:schema-migration'));

-- Tipos enumerados: ver PARTE 1 (se crean fuera de la transacción explícita).

-- ---------------------------------------------------------------------------
-- Users: crea la tabla si falta y repara tablas antiguas sin borrar filas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email varchar(255) NOT NULL,
  password_hash text NOT NULL,
  role public.user_role NOT NULL,
  cedula varchar(50),
  phone varchar(50),
  trayecto varchar(50),
  email_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  approval_status public.user_approval_status NOT NULL DEFAULT 'approved',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email varchar(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role public.user_role;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cedula varchar(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone varchar(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trayecto varchar(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approval_status public.user_approval_status NOT NULL DEFAULT 'approved';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Normaliza tipos heredados de ediciones manuales (sin borrar filas).
-- 1) users.id sin secuencia (tablas recreadas a mano): restaura autoincremento.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint') AND column_default IS NULL
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS public.users_id_briana_seq;
    ALTER TABLE public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_briana_seq');
    PERFORM setval('public.users_id_briana_seq', COALESCE((SELECT max(id) FROM public.users), 0) + 1, false);
  END IF;
END
$$;

-- 2) Booleanos heredados con otro tipo (texto/número) -> boolean, conservando el significado.
DO $$
DECLARE
  col text;
  ctype text;
  fallback_text text;
BEGIN
  FOREACH col IN ARRAY ARRAY['is_active', 'email_verified'] LOOP
    SELECT data_type INTO ctype FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = col;
    IF ctype IS NOT NULL AND ctype <> 'boolean' THEN
      fallback_text := CASE WHEN col = 'is_active' THEN 'true' ELSE 'false' END;
      EXECUTE format('ALTER TABLE public.users ALTER COLUMN %I DROP DEFAULT', col);
      EXECUTE
        'ALTER TABLE public.users ALTER COLUMN ' || quote_ident(col) || ' TYPE boolean USING (' ||
        'CASE WHEN ' || quote_ident(col) || ' IS NULL THEN ' || fallback_text ||
        ' WHEN pg_typeof(' || quote_ident(col) || ')::text IN (''smallint'',''integer'',''bigint'',''numeric'',''real'',''double precision'')' ||
        ' THEN (CASE WHEN (' || quote_ident(col) || ')::text ~ ''^-?[0-9]+(\.[0-9]+)?$'' THEN ((' || quote_ident(col) || ')::text::numeric <> 0) ELSE ' || fallback_text || ' END)' ||
        ' WHEN lower((' || quote_ident(col) || ')::text) IN (''t'',''true'',''1'',''y'',''yes'',''si'',''sí'',''s'',''activo'',''activa'',''active'',''enabled'',''on'') THEN true' ||
        ' WHEN lower((' || quote_ident(col) || ')::text) IN (''f'',''false'',''0'',''n'',''no'',''inactivo'',''inactiva'',''disabled'',''off'','''') THEN false' ||
        ' ELSE ' || fallback_text || ' END)';
      EXECUTE format('ALTER TABLE public.users ALTER COLUMN %I SET DEFAULT %s', col, fallback_text);
      EXECUTE format('ALTER TABLE public.users ALTER COLUMN %I SET NOT NULL', col);
    END IF;
  END LOOP;
END
$$;

-- 3) role / approval_status creados como texto -> convierte al enum conservando valores válidos.
DO $$
DECLARE ctype text;
BEGIN
  SELECT data_type INTO ctype FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role';
  IF ctype IN ('character varying', 'character', 'text') THEN
    UPDATE public.users SET role = 'estudiante'
    WHERE role IS NULL OR lower(btrim(role::text)) NOT IN ('estudiante', 'tutor', 'administrador');
    UPDATE public.users SET role = lower(btrim(role::text))
    WHERE role::text IS DISTINCT FROM lower(btrim(role::text));
    ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.users ALTER COLUMN role TYPE public.user_role USING (role::text::public.user_role);
    ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'estudiante';
    ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
  END IF;
END
$$;

DO $$
DECLARE ctype text;
BEGIN
  SELECT data_type INTO ctype FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'approval_status';
  IF ctype IN ('character varying', 'character', 'text') THEN
    UPDATE public.users SET approval_status = 'approved'
    WHERE approval_status IS NULL OR lower(btrim(approval_status::text)) NOT IN ('pending', 'approved', 'rejected');
    UPDATE public.users SET approval_status = lower(btrim(approval_status::text))
    WHERE approval_status::text IS DISTINCT FROM lower(btrim(approval_status::text));
    ALTER TABLE public.users ALTER COLUMN approval_status DROP DEFAULT;
    ALTER TABLE public.users ALTER COLUMN approval_status TYPE public.user_approval_status USING (approval_status::text::public.user_approval_status);
    ALTER TABLE public.users ALTER COLUMN approval_status SET DEFAULT 'approved';
    ALTER TABLE public.users ALTER COLUMN approval_status SET NOT NULL;
  END IF;
END
$$;

-- Campos opcionales en el diseño actual: evita errores 500 en bases antiguas
-- donde cedula/teléfono/trayecto quedaron como NOT NULL.
ALTER TABLE public.users ALTER COLUMN cedula DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN trayecto DROP NOT NULL;
UPDATE public.users SET approval_status = 'approved' WHERE approval_status IS NULL;
ALTER TABLE public.users ALTER COLUMN approval_status SET DEFAULT 'approved';
ALTER TABLE public.users ALTER COLUMN approval_status SET NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Recupera datos desde columnas antiguas si existen.
DO $$
DECLARE legacy_column text;
BEGIN
  FOREACH legacy_column IN ARRAY ARRAY['nombre','full_name','nombre_completo','nombres'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name=legacy_column) THEN
      EXECUTE format('UPDATE public.users SET name = %I::text WHERE name IS NULL', legacy_column);
    END IF;
  END LOOP;

  FOREACH legacy_column IN ARRAY ARRAY['correo','correo_electronico','email_address','mail'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name=legacy_column) THEN
      EXECUTE format('UPDATE public.users SET email = lower(btrim(%I::text)) WHERE email IS NULL', legacy_column);
    END IF;
  END LOOP;

  FOREACH legacy_column IN ARRAY ARRAY['password','passwordhash','clave','contrasena'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name=legacy_column) THEN
      EXECUTE format('UPDATE public.users SET password_hash = %I::text WHERE password_hash IS NULL AND %I::text ~ $re$^[a-f0-9]{32}:[a-f0-9]{128}$re$', legacy_column, legacy_column);
    END IF;
  END LOOP;
END
$$;

UPDATE public.users SET name = 'Usuario ' || id::text WHERE name IS NULL OR btrim(name) = '';
UPDATE public.users SET email = lower(btrim(email)) WHERE email IS NOT NULL;
UPDATE public.users SET email = 'usuario-' || id::text || '@migrado.briana' WHERE email IS NULL OR btrim(email) = '';
UPDATE public.users SET password_hash = '' WHERE password_hash IS NULL;
UPDATE public.users SET role = 'estudiante' WHERE role IS NULL;

-- Evita que un índice único falle por correos duplicados heredados.
UPDATE public.users u
SET email = 'usuario-' || u.id::text || '@migrado.briana'
WHERE EXISTS (
  SELECT 1 FROM public.users x
  WHERE lower(x.email) = lower(u.email) AND x.id < u.id
);

ALTER TABLE public.users ALTER COLUMN name SET DEFAULT '';
ALTER TABLE public.users ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN password_hash SET DEFAULT '';
ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'estudiante';
ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;

CREATE INDEX IF NOT EXISTS users_role_idx ON public.users (role);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON public.users (email);

-- Administrador único: si hubiera más de uno, se conserva el más antiguo.
UPDATE public.users SET role = 'tutor'
WHERE role = 'administrador'
  AND id <> (SELECT id FROM public.users WHERE role = 'administrador' ORDER BY id LIMIT 1);

-- NOTA: no se crea aquí el índice parcial WHERE role = 'administrador'.
-- Comparar un enum con un literal en el predicado de un índice falla en
-- Postgres moderno con 42P17 ("functions in index predicate must be marked
-- IMMUTABLE"). El administrador único se garantiza con el UPDATE anterior y
-- con ensureSystemAccounts() en cada arranque (src/lib/seed.ts).

-- ---------------------------------------------------------------------------
-- Códigos de verificación / recuperación
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  purpose public.code_purpose NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS user_id integer REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS email varchar(255) NOT NULL DEFAULT '';
ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS purpose public.code_purpose NOT NULL DEFAULT 'verify_email';
ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS code_hash text NOT NULL DEFAULT '';
ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes');
ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
ALTER TABLE public.verification_codes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS codes_user_purpose_idx ON public.verification_codes (user_id, purpose);

-- ---------------------------------------------------------------------------
-- Sesiones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id varchar(128) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id integer REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS sessions_user_idx ON public.sessions (user_id);

-- ---------------------------------------------------------------------------
-- Archivos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.files (
  id serial PRIMARY KEY,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  kind varchar(30) NOT NULL,
  data bytea NOT NULL,
  uploaded_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.files ADD COLUMN IF NOT EXISTS filename text NOT NULL DEFAULT '';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS mime_type text NOT NULL DEFAULT 'application/pdf';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS size integer NOT NULL DEFAULT 0;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS kind varchar(30) NOT NULL DEFAULT 'pdf';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS data bytea NOT NULL DEFAULT decode('', 'hex');
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS uploaded_by integer REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id serial PRIMARY KEY,
  titulo text NOT NULL,
  codigo varchar(100),
  slug varchar(255),
  tipo_recurso text NOT NULL,
  pnf text NOT NULL DEFAULT 'Informática',
  linea_investigacion text NOT NULL,
  autores text[] NOT NULL DEFAULT '{}'::text[],
  tutor_nombre text,
  tutor_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  student_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  anio integer,
  trayecto varchar(50),
  palabras_clave text,
  resumen text,
  pdf_file_id integer REFERENCES public.files(id) ON DELETE SET NULL,
  planilla_file_id integer REFERENCES public.files(id) ON DELETE SET NULL,
  status public.project_status NOT NULL DEFAULT 'enviado_tutor',
  observaciones text,
  ai_source varchar(40),
  validated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS titulo text NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS codigo varchar(100);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug varchar(255);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tipo_recurso text NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pnf text NOT NULL DEFAULT 'Informática';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS linea_investigacion text NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS autores text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tutor_nombre text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tutor_id integer REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS student_id integer REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS anio integer;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS trayecto varchar(50);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS palabras_clave text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS resumen text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pdf_file_id integer REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS planilla_file_id integer REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status public.project_status NOT NULL DEFAULT 'enviado_tutor';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ai_source varchar(40);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS projects_student_idx ON public.projects (student_id);
CREATE INDEX IF NOT EXISTS projects_tutor_idx ON public.projects (tutor_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects (status);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id serial PRIMARY KEY,
  user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  user_name text,
  user_role varchar(30),
  action varchar(80) NOT NULL,
  entity varchar(40),
  entity_id integer,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id integer REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_role varchar(30);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action varchar(80) NOT NULL DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity varchar(40);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id integer;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS audit_created_idx ON public.audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  key varchar(80) PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS value text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMIT;
