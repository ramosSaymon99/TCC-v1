-- Ninho · esquema do banco D1 (o Worker também cria tudo sozinho no primeiro acesso)
-- O bebê é o registro central: cuidadores, eventos, mural e saúde se ligam a ele por baby_id.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS babies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, birth_date TEXT NOT NULL, sex TEXT,
  color TEXT, routine TEXT, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
-- Vínculo cuidador ↔ bebê: papel (mãe, pai, avó, babá...) e nível de acesso (admin, editor, leitor)
CREATE TABLE IF NOT EXISTS members (
  baby_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, access TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY (baby_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members (user_id);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY, baby_id TEXT NOT NULL, role TEXT NOT NULL, access TEXT NOT NULL,
  created_by TEXT NOT NULL, expires_at TEXT NOT NULL, used_by TEXT
);
-- Rotina registrada: mamada, mamadeira, sono, fralda, remédio, banho, alimentação, outro
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, type TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT,
  data TEXT, note TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_baby_start ON events (baby_id, start_at);
CREATE TABLE IF NOT EXISTS growth (
  id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, date TEXT NOT NULL, weight_g REAL, height_cm REAL, head_cm REAL,
  source TEXT, note TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_baby ON growth (baby_id, date);
-- Mural de materiais de uso (fraldas, lenços, fórmula, remédios...) com estoque e baixa automática
CREATE TABLE IF NOT EXISTS supplies (
  id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT, unit TEXT, qty REAL NOT NULL DEFAULT 0,
  min_qty REAL NOT NULL DEFAULT 0, auto_type TEXT, per_use REAL DEFAULT 1, buyer_id TEXT, note TEXT,
  user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplies_baby ON supplies (baby_id);
-- Recados entre cuidadores
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, text TEXT NOT NULL, pinned INTEGER DEFAULT 0, done INTEGER DEFAULT 0,
  user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_baby ON notes (baby_id);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, doctor TEXT, note TEXT,
  done INTEGER DEFAULT 0, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_baby ON appointments (baby_id, date);
CREATE TABLE IF NOT EXISTS vaccines (
  baby_id TEXT NOT NULL, code TEXT NOT NULL, date TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (baby_id, code)
);
CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
