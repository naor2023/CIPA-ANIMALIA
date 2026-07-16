CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS records (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  employee_name TEXT NOT NULL,
  registration TEXT,
  department TEXT NOT NULL,
  job_title TEXT,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Novo',
  priority TEXT NOT NULL DEFAULT 'Média',
  due_date DATE,
  internal_notes TEXT DEFAULT '',
  assigned_to TEXT DEFAULT '',
  mural_status TEXT NOT NULL DEFAULT 'Em avaliação',
  resolution TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE INDEX IF NOT EXISTS idx_records_department ON records(department);
CREATE INDEX IF NOT EXISTS idx_records_priority ON records(priority);
CREATE INDEX IF NOT EXISTS idx_records_due_date ON records(due_date);

CREATE TABLE IF NOT EXISTS attachments (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_logs(record_id, created_at);
