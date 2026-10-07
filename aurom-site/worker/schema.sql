-- Pedidos de orçamento recebidos pelo site (criada automaticamente pelo Worker)
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  protocolo TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  nome TEXT NOT NULL,
  empresa TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  servico TEXT NOT NULL,
  prazo TEXT,
  mensagem TEXT NOT NULL,
  pagina TEXT,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'Novo'
);
CREATE INDEX IF NOT EXISTS leads_ip_tempo ON leads (ip_hash, criado_em);
