// Conexão com o banco SQLite (módulo nativo node:sqlite) e criação das tabelas.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const caminhoBanco = process.env.DB_PATH || resolve(raiz, 'data', 'equipamentos.db');

mkdirSync(dirname(caminhoBanco), { recursive: true });

export const db = new DatabaseSync(caminhoBanco);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS equipamentos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo          TEXT NOT NULL,
    marca         TEXT NOT NULL,
    modelo        TEXT NOT NULL,
    numero_serie  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    situacao      TEXT NOT NULL DEFAULT 'disponivel'
                  CHECK (situacao IN ('disponivel','com_cliente','aguardando_avaliacao','em_manutencao','baixado')),
    cliente_codigo TEXT,
    situacao_desde TEXT NOT NULL,
    observacao    TEXT,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS trocas (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_codigo           TEXT NOT NULL,
    equipamento_devolvido_id INTEGER NOT NULL REFERENCES equipamentos(id),
    equipamento_entregue_id  INTEGER NOT NULL REFERENCES equipamentos(id),
    data                     TEXT NOT NULL,
    responsavel              TEXT NOT NULL,
    motivo                   TEXT NOT NULL,
    observacao               TEXT,
    criado_em                TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS movimentacoes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    equipamento_id    INTEGER NOT NULL REFERENCES equipamentos(id),
    tipo              TEXT NOT NULL CHECK (tipo IN ('cadastro','entrega','devolucao','avaliacao')),
    cliente_codigo    TEXT,
    data              TEXT NOT NULL,
    responsavel       TEXT NOT NULL,
    motivo            TEXT CHECK (motivo IS NULL OR motivo IN ('cancelamento','troca','defeito_relatado','queima_relatada')),
    condicao          TEXT,
    situacao_anterior TEXT,
    situacao_nova     TEXT NOT NULL,
    troca_id          INTEGER REFERENCES trocas(id),
    observacao        TEXT,
    criado_em         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash    TEXT NOT NULL,
    perfil        TEXT NOT NULL DEFAULT 'operador' CHECK (perfil IN ('administrador','operador')),
    ativo         INTEGER NOT NULL DEFAULT 1,
    trocar_senha  INTEGER NOT NULL DEFAULT 0,
    ultimo_acesso TEXT,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    token      TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mov_equipamento ON movimentacoes(equipamento_id, data);
  CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data);
  CREATE INDEX IF NOT EXISTS idx_equip_situacao ON equipamentos(situacao);
  CREATE INDEX IF NOT EXISTS idx_equip_cliente ON equipamentos(cliente_codigo);
`);

// Bancos criados antes do login não têm a coluna que registra quem lançou a movimentação.
if (!db.prepare('PRAGMA table_info(movimentacoes)').all().some((c) => c.name === 'usuario_id')) {
  db.exec('ALTER TABLE movimentacoes ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
}

// Executa várias gravações como uma única operação: ou tudo é salvo, ou nada.
export function transacao(fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}
