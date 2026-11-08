-- ============================================================================
-- BRIANA · Esquema de producción idempotente (PostgreSQL / Neon / Render)
-- Se puede ejecutar varias veces sin borrar datos.
-- Uso: node scripts/migrate-production.cjs (o pegar en el SQL Editor de Neon)
-- ============================================================================
BEGIN;

SET LOCAL search_path TO public;

SELECT pg_advisory_xact_lock(hashtext('briana:schema-migration'));

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('estudiante', 'tutor', 'administrador');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname = 'project_status') THEN
    CREATE TYPE public.project_status AS ENUM (
      'enviado_tutor', 'devuelto', 'devuelto_tutor', 'validado_tutor', 'publicado', 'rechazado'
    );
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname = 'project_status' AND e.enumlabel = 'devuelto_tutor'
  ) THEN
    ALTER TYPE public.project_status ADD VALUE 'devuelto_tutor';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname = 'code_purpose') THEN
    CREATE TYPE public.code_purpose AS ENUM ('verify_email', 'reset_password');
  END IF;
END
$$;

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
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verified_at timestamptz;
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

CREATE UNIQUE INDEX IF NOT EXISTS users_single_administrator_idx
  ON public.users (role) WHERE role = 'administrador';

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
