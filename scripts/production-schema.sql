-- ============================================================================
-- BRIANA · Esquema de producción idempotente (PostgreSQL / Neon / Render)
-- Se puede ejecutar varias veces sin borrar datos.
-- Uso:  node scripts/migrate-production.cjs   (o pegar en el SQL Editor de Neon)
-- ============================================================================
BEGIN;

-- Trabajamos siempre sobre public, sin importar el search_path del editor/cliente.
SET LOCAL search_path TO public;

SELECT pg_advisory_xact_lock(hashtext('briana:schema-migration'));

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('estudiante', 'tutor', 'administrador');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE project_status AS ENUM (
      'enviado_tutor', 'devuelto', 'devuelto_tutor', 'validado_tutor', 'publicado', 'rechazado'
    );
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'project_status' AND e.enumlabel = 'devuelto_tutor'
  ) THEN
    ALTER TYPE project_status ADD VALUE 'devuelto_tutor';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_purpose') THEN
    CREATE TYPE code_purpose AS ENUM ('verify_email', 'reset_password');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email varchar(255) NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  cedula varchar(50),
  phone varchar(50),
  trayecto varchar(50),
  email_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS cedula varchar(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS trayecto varchar(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- Administrador único: si hubiera más de uno, se conserva el más antiguo.
UPDATE users SET role = 'tutor'
WHERE role = 'administrador'
  AND id <> (SELECT id FROM users WHERE role = 'administrador' ORDER BY id LIMIT 1);

CREATE UNIQUE INDEX IF NOT EXISTS users_single_administrator_idx
  ON users (role) WHERE role = 'administrador';

-- ---------------------------------------------------------------------------
-- Códigos de verificación / recuperación
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_codes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  purpose code_purpose NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
CREATE INDEX IF NOT EXISTS codes_user_purpose_idx ON verification_codes (user_id, purpose);

-- ---------------------------------------------------------------------------
-- Sesiones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id varchar(128) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- ---------------------------------------------------------------------------
-- Archivos (PDF y planilla firmada)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id serial PRIMARY KEY,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  kind varchar(30) NOT NULL,
  data bytea NOT NULL,
  uploaded_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by integer REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id serial PRIMARY KEY,
  titulo text NOT NULL,
  codigo varchar(100),
  slug varchar(255),
  tipo_recurso text NOT NULL,
  pnf text NOT NULL DEFAULT 'Informática',
  linea_investigacion text NOT NULL,
  autores text[] NOT NULL DEFAULT '{}'::text[],
  tutor_nombre text,
  tutor_id integer REFERENCES users(id) ON DELETE SET NULL,
  student_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anio integer,
  trayecto varchar(50),
  palabras_clave text,
  resumen text,
  pdf_file_id integer REFERENCES files(id) ON DELETE SET NULL,
  planilla_file_id integer REFERENCES files(id) ON DELETE SET NULL,
  status project_status NOT NULL DEFAULT 'enviado_tutor',
  observaciones text,
  ai_source varchar(40),
  validated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS codigo varchar(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug varchar(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tutor_nombre text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tutor_id integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS anio integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS trayecto varchar(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS palabras_clave text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS resumen text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pdf_file_id integer REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planilla_file_id integer REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_source varchar(40);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS projects_student_idx ON projects (student_id);
CREATE INDEX IF NOT EXISTS projects_tutor_idx ON projects (tutor_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  user_name text,
  user_role varchar(30),
  action varchar(80) NOT NULL,
  entity varchar(40),
  entity_id integer,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- Configuración del servidor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key varchar(80) PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
