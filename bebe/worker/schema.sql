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
-- Fotos de perfil (bebê e cuidadores), servidas por link assinado
CREATE TABLE IF NOT EXISTS photos (kind TEXT NOT NULL, id TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (kind, id));
ALTER TABLE users ADD COLUMN photo_v TEXT;
ALTER TABLE babies ADD COLUMN photo_v TEXT;
-- Notificações push: aparelhos inscritos, preferências por pessoa e controle de duplicidade dos lembretes
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, tz TEXT, ua TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs (user_id);
CREATE TABLE IF NOT EXISTS notif_prefs (user_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notif_log (key TEXT PRIMARY KEY, at TEXT NOT NULL);
-- Conta e privacidade (LGPD)
ALTER TABLE users ADD COLUMN consent_at TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE babies ADD COLUMN guardian_consent_at TEXT;
ALTER TABLE babies ADD COLUMN guardian_consent_by TEXT;
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, created_by TEXT, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
-- Métricas de uso (piloto): só o nome da ação, sem conteúdo
CREATE TABLE IF NOT EXISTS uso (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, baby_id TEXT, evento TEXT NOT NULL, valor TEXT, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_uso_evento ON uso (evento, at);
-- Observabilidade anônima (painel do desenvolvedor): ver worker/observabilidade.js
CREATE TABLE IF NOT EXISTS atividade (dia TEXT NOT NULL, uid TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, coorte TEXT, pais TEXT, regiao TEXT, plataforma TEXT, modo TEXT, PRIMARY KEY (dia, uid));
CREATE INDEX IF NOT EXISTS idx_atividade_dia ON atividade (dia);
CREATE TABLE IF NOT EXISTS req_hora (hora TEXT NOT NULL, rota TEXT NOT NULL, classe TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ms_total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (hora, rota, classe));
CREATE TABLE IF NOT EXISTS erros (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, origem TEXT NOT NULL, rota TEXT, status INTEGER, mensagem TEXT, versao TEXT, plataforma TEXT);
CREATE INDEX IF NOT EXISTS idx_erros_at ON erros (at);
CREATE TABLE IF NOT EXISTS contadores (dia TEXT NOT NULL, chave TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, chave));
CREATE TABLE IF NOT EXISTS sistema (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, at TEXT NOT NULL);
-- Origem do cadastro (pseudônimo) e cidade/tipo de aparelho na atividade diária
CREATE TABLE IF NOT EXISTS origem_cadastro (uid TEXT PRIMARY KEY, dia TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, pais TEXT, regiao TEXT, cidade TEXT, plataforma TEXT, tipo TEXT, navegador TEXT, modelo TEXT, modo TEXT);
CREATE INDEX IF NOT EXISTS idx_origem_dia ON origem_cadastro (dia);
ALTER TABLE atividade ADD COLUMN cidade TEXT;
ALTER TABLE atividade ADD COLUMN tipo TEXT;
