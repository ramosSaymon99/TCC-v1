/**
 * Observabilidade anônima para o painel do desenvolvedor (Worker separado `ninho-painel`).
 *
 * Nada aqui guarda nome, e-mail, foto ou dado de bebê:
 *  - atividade: 1 linha por usuário por dia, com ID pseudônimo (HMAC), país/estado aproximados da rede
 *    (Cloudflare, nunca cidade), sistema do aparelho e se o app está instalado;
 *  - req_hora: contagem de requisições por hora, rota normalizada (sem ids) e classe de status;
 *  - erros: falhas do servidor, do app, de push e do cron, com textos higienizados;
 *  - contadores: totais diários de eventos de conta (cadastros, logins, exclusões...);
 *  - sistema: batimento do cron e última versão do app vista;
 *  - origem_cadastro: 1 linha por conta nova (ID pseudônimo) com local aproximado e aparelho usado no cadastro.
 * Local vem da rede (Cloudflare: país, estado e cidade aproximados), nunca de GPS.
 */

export const ESQUEMA_OBS = [
  'CREATE TABLE IF NOT EXISTS atividade (dia TEXT NOT NULL, uid TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, coorte TEXT, pais TEXT, regiao TEXT, plataforma TEXT, modo TEXT, PRIMARY KEY (dia, uid))',
  'CREATE INDEX IF NOT EXISTS idx_atividade_dia ON atividade (dia)',
  'CREATE TABLE IF NOT EXISTS req_hora (hora TEXT NOT NULL, rota TEXT NOT NULL, classe TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ms_total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (hora, rota, classe))',
  'CREATE TABLE IF NOT EXISTS erros (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, origem TEXT NOT NULL, rota TEXT, status INTEGER, mensagem TEXT, versao TEXT, plataforma TEXT)',
  'CREATE INDEX IF NOT EXISTS idx_erros_at ON erros (at)',
  'CREATE TABLE IF NOT EXISTS contadores (dia TEXT NOT NULL, chave TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, chave))',
  'CREATE TABLE IF NOT EXISTS sistema (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS origem_cadastro (uid TEXT PRIMARY KEY, dia TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, pais TEXT, regiao TEXT, cidade TEXT, plataforma TEXT, tipo TEXT, navegador TEXT, modelo TEXT, modo TEXT)',
  'CREATE INDEX IF NOT EXISTS idx_origem_dia ON origem_cadastro (dia)',
];
/** Colunas novas em tabelas já existentes (falham sem problema se já existirem). */
export const MIGRACOES_OBS = ['ALTER TABLE atividade ADD COLUMN cidade TEXT', 'ALTER TABLE atividade ADD COLUMN tipo TEXT'];

/** Dia e hora no fuso de Brasília (o público do app). */
const brt = (ms = Date.now()) => new Date(ms - 3 * 3600_000).toISOString();
export const diaBRT = (ms) => brt(ms).slice(0, 10);
const horaBRT = (ms) => brt(ms).slice(0, 13);

/** Rota sem identificadores, para agrupar (ex.: GET /babies/:id/events/:id). */
export function normalizarRota(method, path) {
  const p = path
    .replace(/^\/api/, '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/invites\/[A-Za-z0-9]{6}(?=\/|$)/, '/invites/:codigo')
    .replace(/\/vaccines\/[a-z0-9_]+/, '/vaccines/:vacina')
    .replace(/\/photo\/(baby|user)\/[^/]+/, '/photo/$1/:id')
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:id');
  return `${method} ${p || '/'}`.slice(0, 80);
}

/** Remove possíveis dados pessoais de uma mensagem de erro. */
export function higienizar(txt) {
  return String(txt ?? '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
    .replace(/\b\d{4,}\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function plataformaDe(ua = '') {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux|CrOS/i.test(ua)) return 'Linux';
  return 'Outro';
}

/** Tipo de aparelho, navegador e modelo (quando o navegador informa). Nada que identifique a pessoa. */
export function aparelhoDe(ua = '', dica = '') {
  const tipo = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'Tablet' : /iPhone|iPod|Mobile|Android/i.test(ua) ? 'Celular' : 'Computador';
  const navegador = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /EdgA?\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera' : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
    : /CriOS|Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Outro';
  let modelo = String(dica || '').replace(/[^A-Za-z0-9 ._()+-]/g, '').trim().slice(0, 40);
  if (!modelo) {
    if (/iPhone/i.test(ua)) modelo = 'iPhone';
    else if (/iPad/i.test(ua)) modelo = 'iPad';
    else if (/Android/i.test(ua)) { const m = ua.match(/Android [\d.]+; ([^;)]+)/); modelo = m && m[1].trim().length > 2 && !/^K$/.test(m[1].trim()) ? m[1].replace(/ Build.*/, '').trim().slice(0, 40) : 'Android (modelo não informado)'; }
    else modelo = { Windows: 'Computador Windows', macOS: 'Mac', Linux: 'Computador Linux' }[plataformaDe(ua)] || 'Outro';
  }
  return { tipo, navegador, modelo };
}

/** Segunda-feira da semana (YYYY-MM-DD) — coorte de cadastro para a retenção. */
function semanaDe(iso) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

const vistos = new Set(); // evita escrever a mesma atividade várias vezes no mesmo isolate

/** Marca o usuário como ativo hoje (pseudônimo). `hmac` é a função de assinatura do app. */
export async function registrarAtividade(env, hmac, user, req) {
  const dia = diaBRT();
  const chave = `${dia}:${user.id}`;
  if (vistos.has(chave)) return;
  if (vistos.size > 5000) vistos.clear();
  vistos.add(chave);
  const uid = (await hmac(env, `obs:${user.id}`)).slice(0, 16);
  const cf = req.cf || {};
  const modo = req.headers.get('x-ninho-modo') === 'app' ? 'app' : 'navegador';
  const ua = req.headers.get('user-agent') || '';
  await env.DB.prepare('INSERT OR IGNORE INTO atividade (dia, uid, demo, coorte, pais, regiao, cidade, plataforma, tipo, modo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(dia, uid, user.email.endsWith('@exemplo.ninho') ? 1 : 0, semanaDe(user.created_at), cf.country || null, cf.region || null, cf.city || null, plataformaDe(ua), aparelhoDe(ua).tipo, modo)
    .run();
  const versao = req.headers.get('x-ninho-versao');
  if (versao) await env.DB.prepare("INSERT INTO sistema (chave, valor, at) VALUES ('versao_app', ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, at = excluded.at").bind(versao.slice(0, 40), new Date().toISOString()).run();
}

/** Origem do cadastro: onde (aproximado) e em que aparelho a conta foi criada. */
export async function registrarCadastro(env, hmac, user, req) {
  const uid = (await hmac(env, `obs:${user.id}`)).slice(0, 16);
  const cf = req.cf || {};
  const ua = req.headers.get('user-agent') || '';
  const a = aparelhoDe(ua, req.headers.get('x-ninho-aparelho'));
  await env.DB.prepare('INSERT OR IGNORE INTO origem_cadastro (uid, dia, demo, pais, regiao, cidade, plataforma, tipo, navegador, modelo, modo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(uid, diaBRT(), user.email.endsWith('@exemplo.ninho') ? 1 : 0, cf.country || null, cf.region || null, cf.city || null, plataformaDe(ua), a.tipo, a.navegador, a.modelo, req.headers.get('x-ninho-modo') === 'app' ? 'app' : 'navegador')
    .run();
}

export function registrarRequisicao(env, method, path, status, ms) {
  const classe = status >= 500 ? '5xx' : status >= 400 ? '4xx' : '2xx';
  return env.DB.prepare('INSERT INTO req_hora (hora, rota, classe, n, ms_total) VALUES (?, ?, ?, 1, ?) ON CONFLICT(hora, rota, classe) DO UPDATE SET n = n + 1, ms_total = ms_total + excluded.ms_total')
    .bind(horaBRT(), normalizarRota(method, path), classe, Math.round(ms)).run();
}

export function registrarErro(env, { origem, rota = null, status = null, mensagem, versao = null, plataforma = null }) {
  return env.DB.prepare('INSERT INTO erros (at, origem, rota, status, mensagem, versao, plataforma) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), origem, rota, status, higienizar(mensagem), versao ? String(versao).slice(0, 40) : null, plataforma).run();
}

export function contar(env, chave, n = 1) {
  return env.DB.prepare('INSERT INTO contadores (dia, chave, n) VALUES (?, ?, ?) ON CONFLICT(dia, chave) DO UPDATE SET n = n + excluded.n').bind(diaBRT(), chave, n).run();
}

export function marcarSistema(env, chave, valor) {
  return env.DB.prepare('INSERT INTO sistema (chave, valor, at) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, at = excluded.at').bind(chave, String(valor), new Date().toISOString()).run();
}

/** Limpeza: requisições por hora ficam 120 dias; erros 90 dias; atividade 400 dias. */
export async function limparObservabilidade(env) {
  const d = (n) => diaBRT(Date.now() - n * 86400_000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM req_hora WHERE hora < ?').bind(d(120)),
    env.DB.prepare('DELETE FROM erros WHERE at < ?').bind(new Date(Date.now() - 90 * 86400_000).toISOString()),
    env.DB.prepare('DELETE FROM atividade WHERE dia < ?').bind(d(400)),
  ]);
}
