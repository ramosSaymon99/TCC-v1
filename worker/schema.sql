-- Esquema do banco D1 do Pivot Hub (multiempresa)
-- O próprio Worker cria estas tabelas no primeiro acesso; este arquivo serve de referência
-- ou para aplicar manualmente: npx wrangler d1 execute techgest-db --remote --file=worker/schema.sql

-- Registros de cada coleção (clientes, ordens, lancamentos...) em JSON, isolados por empresa (tenant).
-- O tenant "_plataforma" guarda planos, assinantes, faturas e configurações comerciais do SaaS.
CREATE TABLE IF NOT EXISTS dados (
  tenant TEXT NOT NULL,
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant, col, id)
);

-- Configurações de cada empresa: permissoes, empresa
CREATE TABLE IF NOT EXISTS ajustes (
  tenant TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (tenant, key)
);

-- Senhas (PBKDF2-SHA256 com salt) — nunca retornadas pela API
CREATE TABLE IF NOT EXISTS senhas (
  tenant TEXT NOT NULL,
  user_id TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (tenant, user_id)
);

-- Chave que assina as sessões (gerada automaticamente) e marcadores de migração
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
