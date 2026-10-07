/**
 * TechGest · Worker Cloudflare
 * Serve o app (index.html estático) e a API /api/* com persistência no D1.
 *
 * Tabelas (ver worker/schema.sql):
 *   items(col, id, data, updated_at)  → registros de cada coleção em JSON
 *   config(key, data)                 → permissoes, empresa
 *   credentials(user_id, salt, hash)  → senhas (PBKDF2), nunca enviadas ao cliente
 */

const COLS = [
  'clientes', 'orcamentos', 'oportunidades', 'ordens', 'equipamentos', 'compromissos', 'tarefas', 'lancamentos', 'usuarios',
  'servicos', 'pecas', 'movimentos', 'contratos', 'turmas', 'posts', 'seguidores',
];
const MODULO = {
  clientes: 'clientes', orcamentos: 'orcamentos', oportunidades: 'funil', ordens: 'ordens', equipamentos: 'equipamentos',
  compromissos: 'agenda', tarefas: 'agenda', lancamentos: 'financeiro', usuarios: 'usuarios',
  servicos: 'servicos', pecas: 'estoque', movimentos: 'estoque', contratos: 'contratos', turmas: 'treinamentos',
  posts: 'social', seguidores: 'social',
};
const SENHA_PADRAO = '123456';
const TOKEN_HORAS = 12;
const PBKDF2_ITER = 100000;

const enc = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const erro = (msg, status = 400) => json({ error: msg }, status);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ---------------- Senhas e tokens ---------------- */
async function hashSenha(senha, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { salt: b64(salt), hash: b64(bits) };
}
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/**
 * Chave que assina as sessões. Usa o secret AUTH_SECRET se ele existir; senão gera uma chave
 * aleatória no primeiro uso e guarda no D1 (tabela `secrets`, nunca exposta pela API).
 * Assim o sistema fica operacional sem nenhuma configuração manual.
 */
let segredoCache = null;
async function segredo(env) {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (segredoCache) return segredoCache;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
  const novo = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT OR IGNORE INTO secrets (key, value) VALUES ('auth', ?)").bind(novo).run();
  const r = await env.DB.prepare("SELECT value FROM secrets WHERE key = 'auth'").first();
  segredoCache = r.value;
  return segredoCache;
}
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await segredo(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
async function criarToken(env, userId) {
  const payload = `${userId}.${Date.now() + TOKEN_HORAS * 3600_000}`;
  return `${payload}.${await hmac(env, payload)}`;
}
async function validarToken(env, token) {
  const partes = (token || '').split('.');
  if (partes.length !== 3) return null;
  const [uid, exp, sig] = partes;
  if (Number(exp) < Date.now()) return null;
  return iguais(sig, await hmac(env, `${uid}.${exp}`)) ? uid : null;
}

/* ---------------- Acesso ao banco ---------------- */
async function getItem(env, col, id) {
  const r = await env.DB.prepare('SELECT data FROM items WHERE col = ? AND id = ?').bind(col, id).first();
  return r ? JSON.parse(r.data) : null;
}
async function getConfig(env, key) {
  const r = await env.DB.prepare('SELECT data FROM config WHERE key = ?').bind(key).first();
  return r ? JSON.parse(r.data) : null;
}
const upsertStmt = (env, col, item) => env.DB
  .prepare('INSERT INTO items (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
  .bind(col, String(item.id), JSON.stringify(item), new Date().toISOString());
const configStmt = (env, key, data) => env.DB
  .prepare('INSERT INTO config (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data')
  .bind(key, JSON.stringify(data));

/** Cria as tabelas se ainda não existirem (banco novo ou recriado). */
async function garantirEsquema(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS items (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (col, id))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, data TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
  ]);
}

async function inicializado(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials').first();
  return (r?.n ?? 0) > 0;
}

/** Grava uma base completa (primeira carga, restauração de backup ou reset). */
async function gravarBase(env, db) {
  if (!db || !Array.isArray(db.usuarios) || !db.usuarios.length) throw new Error('Base inválida: sem usuários.');
  const stmts = [env.DB.prepare('DELETE FROM items'), env.DB.prepare('DELETE FROM config')];
  for (const col of COLS) for (const item of db[col] ?? []) stmts.push(upsertStmt(env, col, item));
  stmts.push(configStmt(env, 'permissoes', db.permissoes ?? {}), configStmt(env, 'empresa', db.empresa ?? {}));
  // Credenciais: mantém as senhas de quem continua existindo; cria a padrão para novos; remove órfãs
  const ids = db.usuarios.map((u) => String(u.id));
  const existentes = new Set((await env.DB.prepare('SELECT user_id FROM credentials').all()).results.map((r) => r.user_id));
  stmts.push(env.DB.prepare(`DELETE FROM credentials WHERE user_id NOT IN (${ids.map(() => '?').join(',')})`).bind(...ids));
  for (const id of ids) {
    if (existentes.has(id)) continue;
    const { salt, hash } = await hashSenha(SENHA_PADRAO);
    stmts.push(env.DB.prepare('INSERT INTO credentials (user_id, salt, hash) VALUES (?, ?, ?)').bind(id, salt, hash));
  }
  // D1 aceita lotes grandes, mas dividimos por segurança
  for (let i = 0; i < stmts.length; i += 400) await env.DB.batch(stmts.slice(i, i + 400));
}

async function podeEscrever(env, user, col, item) {
  if (user.perfil === 'Proprietário') return true;
  const perms = (await getConfig(env, 'permissoes')) ?? {};
  const mods = perms[user.perfil] ?? [];
  if (mods.includes(MODULO[col])) return true;
  // Quem opera OS pode gerar a receita da OS finalizada; contratos e turmas geram suas cobranças
  if (col === 'lancamentos' && item?.osId && mods.includes('ordens')) return true;
  if (col === 'lancamentos' && item?.categoria === 'Recorrência' && mods.includes('contratos')) return true;
  if (col === 'lancamentos' && item?.turmaId && mods.includes('treinamentos')) return true;
  return false;
}

/* ---------------- Rotas ---------------- */
async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const body = ['POST', 'PUT'].includes(method) ? await req.json().catch(() => null) : null;

  // Públicas
  if (path === '/status' && method === 'GET') {
    await garantirEsquema(env);
    return json({ ok: true, initialized: await inicializado(env) });
  }

  if (path === '/bootstrap' && method === 'POST') {
    if (await inicializado(env)) return erro('Banco já inicializado.', 409);
    await gravarBase(env, body?.db);
    return json({ ok: true });
  }

  if (path === '/login' && method === 'POST') {
    const email = String(body?.email ?? '').trim().toLowerCase();
    const r = await env.DB.prepare("SELECT data FROM items WHERE col = 'usuarios' AND lower(json_extract(data, '$.email')) = ?").bind(email).first();
    const u = r ? JSON.parse(r.data) : null;
    const cred = u ? await env.DB.prepare('SELECT salt, hash FROM credentials WHERE user_id = ?').bind(String(u.id)).first() : null;
    const ok = cred ? iguais((await hashSenha(String(body?.senha ?? ''), cred.salt)).hash, cred.hash) : false;
    if (!u || !ok) return erro('E-mail ou senha inválidos.', 401);
    if (u.status !== 'Ativo') return erro('Usuário inativo. Fale com o administrador.', 403);
    u.ultimoAcesso = new Date().toISOString();
    await upsertStmt(env, 'usuarios', u).run();
    return json({ token: await criarToken(env, u.id), userId: u.id });
  }

  // Autenticadas
  const uid = await validarToken(env, (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const user = uid ? await getItem(env, 'usuarios', uid) : null;
  if (!user || user.status !== 'Ativo') return erro('Sessão expirada. Entre novamente.', 401);
  const dono = user.perfil === 'Proprietário';

  if (path === '/db' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT col, data FROM items').all()).results;
    const db = Object.fromEntries(COLS.map((c) => [c, []]));
    for (const r of rows) if (db[r.col]) db[r.col].push(JSON.parse(r.data));
    db.permissoes = (await getConfig(env, 'permissoes')) ?? {};
    db.empresa = (await getConfig(env, 'empresa')) ?? {};
    return json(db);
  }

  const m = path.match(/^\/items\/([a-z]+)\/([^/]+)$/);
  if (m) {
    const [, col, id] = m;
    if (!COLS.includes(col)) return erro('Coleção inválida.', 404);
    if (method === 'PUT') {
      if (!body || String(body.id) !== decodeURIComponent(id)) return erro('Registro inválido.');
      if (!(await podeEscrever(env, user, col, body))) return erro('Sem permissão para este módulo.', 403);
      if (col === 'usuarios') {
        const antes = await getItem(env, col, body.id);
        if (antes?.perfil === 'Proprietário' && (body.perfil !== 'Proprietário' || body.status !== 'Ativo')) {
          const donos = (await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE col='usuarios' AND json_extract(data,'$.perfil')='Proprietário' AND json_extract(data,'$.status')='Ativo'").first()).n;
          if (donos <= 1) return erro('É preciso manter ao menos um proprietário ativo.', 409);
        }
        if (!antes) {
          const { salt, hash } = await hashSenha(SENHA_PADRAO);
          await env.DB.prepare('INSERT OR REPLACE INTO credentials (user_id, salt, hash) VALUES (?, ?, ?)').bind(String(body.id), salt, hash).run();
        }
      }
      await upsertStmt(env, col, body).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      const atual = await getItem(env, col, decodeURIComponent(id));
      if (!(await podeEscrever(env, user, col, atual))) return erro('Sem permissão para este módulo.', 403);
      if (col === 'usuarios' && String(atual?.id) === String(user.id)) return erro('Você não pode excluir o próprio usuário.', 409);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM items WHERE col = ? AND id = ?').bind(col, decodeURIComponent(id)),
        ...(col === 'usuarios' ? [env.DB.prepare('DELETE FROM credentials WHERE user_id = ?').bind(decodeURIComponent(id))] : []),
      ]);
      return json({ ok: true });
    }
  }

  const c = path.match(/^\/config\/(permissoes|empresa)$/);
  if (c && method === 'PUT') {
    if (c[1] === 'permissoes' && !dono) return erro('Somente o proprietário altera permissões.', 403);
    if (c[1] === 'empresa' && !dono) {
      const perms = (await getConfig(env, 'permissoes')) ?? {};
      if (!(perms[user.perfil] ?? []).includes('configuracoes')) return erro('Sem permissão.', 403);
    }
    await configStmt(env, c[1], body).run();
    return json({ ok: true });
  }

  if (path === '/password' && method === 'POST') {
    const alvo = String(body?.userId ?? user.id);
    const nova = String(body?.nova ?? '');
    if (nova.length < 6) return erro('A nova senha deve ter ao menos 6 caracteres.');
    if (alvo === String(user.id)) {
      const cred = await env.DB.prepare('SELECT salt, hash FROM credentials WHERE user_id = ?').bind(alvo).first();
      if (!cred || !iguais((await hashSenha(String(body?.atual ?? ''), cred.salt)).hash, cred.hash)) return erro('Senha atual incorreta.', 403);
    } else if (!dono) return erro('Somente o proprietário redefine senhas de outros usuários.', 403);
    const { salt, hash } = await hashSenha(nova);
    await env.DB.prepare('INSERT OR REPLACE INTO credentials (user_id, salt, hash) VALUES (?, ?, ?)').bind(alvo, salt, hash).run();
    return json({ ok: true });
  }

  if (path === '/reset' && method === 'POST') {
    if (!dono) return erro('Somente o proprietário pode substituir a base.', 403);
    await gravarBase(env, body?.db);
    return json({ ok: true });
  }

  return erro('Rota não encontrada.', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return erro(e instanceof Error ? e.message : 'Erro interno.', 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
