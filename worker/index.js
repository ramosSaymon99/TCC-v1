/**
 * Pivot Hub · Worker Cloudflare
 * Serve o app (index.html estático) e a API /api/* com persistência no D1.
 *
 * Multiempresa (SaaS): cada empresa assinante é um "tenant" com dados isolados.
 * Tabelas (ver worker/schema.sql):
 *   dados(tenant, col, id, data, updated_at) → registros de cada coleção em JSON
 *   ajustes(tenant, key, data)               → permissoes, empresa
 *   senhas(tenant, user_id, salt, hash)      → senhas (PBKDF2), nunca enviadas ao cliente
 *   secrets(key, value)                      → chave que assina as sessões
 * O tenant "principal" é a empresa dona da plataforma (acesso ao console SaaS).
 * O tenant "_plataforma" guarda planos, assinantes, faturas e configurações comerciais.
 * Cobrança automática das assinaturas: ver worker/asaas.js.
 */
import { aposSalvarAssinante, rotasAdminAsaas, rotinaDiaria, valorMensalDe, webhookAsaas } from './asaas.js';


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
const TODOS_MODULOS = ['inicio', 'clientes', 'orcamentos', 'funil', 'contratos', 'ordens', 'equipamentos', 'estoque', 'treinamentos',
  'agenda', 'servicos', 'financeiro', 'relatorios', 'planejamento', 'social', 'usuarios', 'configuracoes'];
const ESSENCIAIS = ['inicio', 'usuarios', 'configuracoes'];
const PRINCIPAL = 'principal';
const PLAT = '_plataforma';
const PLAT_COLS = ['planos', 'assinantes', 'faturas', 'config'];
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
const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // horário de Brasília
const tenantValido = (t) => /^[A-Za-z0-9_-]{2,40}$/.test(t) && t !== PLAT && t !== PRINCIPAL;

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
function senhaProvisoria() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => abc[n % abc.length]).join('');
}
/**
 * Chave que assina as sessões. Usa o secret AUTH_SECRET se ele existir; senão gera uma chave
 * aleatória no primeiro uso e guarda no D1 (tabela `secrets`, nunca exposta pela API).
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
async function criarToken(env, tenant, userId) {
  const payload = `${tenant}.${userId}.${Date.now() + TOKEN_HORAS * 3600_000}`;
  return `${payload}.${await hmac(env, payload)}`;
}
async function validarToken(env, token) {
  const partes = (token || '').split('.');
  if (partes.length !== 4) return null;
  const [tenant, uid, exp, sig] = partes;
  if (Number(exp) < Date.now()) return null;
  return iguais(sig, await hmac(env, `${tenant}.${uid}.${exp}`)) ? { tenant, uid } : null;
}

/* ---------------- Acesso ao banco ---------------- */
async function getItem(env, tenant, col, id) {
  const r = await env.DB.prepare('SELECT data FROM dados WHERE tenant = ? AND col = ? AND id = ?').bind(tenant, col, String(id)).first();
  return r ? JSON.parse(r.data) : null;
}
async function listar(env, tenant, col) {
  return (await env.DB.prepare('SELECT data FROM dados WHERE tenant = ? AND col = ?').bind(tenant, col).all()).results.map((r) => JSON.parse(r.data));
}
async function getConfig(env, tenant, key) {
  const r = await env.DB.prepare('SELECT data FROM ajustes WHERE tenant = ? AND key = ?').bind(tenant, key).first();
  return r ? JSON.parse(r.data) : null;
}
const upsertStmt = (env, tenant, col, item) => env.DB
  .prepare('INSERT INTO dados (tenant, col, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant, col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
  .bind(tenant, col, String(item.id), JSON.stringify(item), new Date().toISOString());
const configStmt = (env, tenant, key, data) => env.DB
  .prepare('INSERT INTO ajustes (tenant, key, data) VALUES (?, ?, ?) ON CONFLICT(tenant, key) DO UPDATE SET data = excluded.data')
  .bind(tenant, key, JSON.stringify(data));
const senhaStmt = (env, tenant, userId, salt, hash) => env.DB
  .prepare('INSERT OR REPLACE INTO senhas (tenant, user_id, salt, hash) VALUES (?, ?, ?, ?)').bind(tenant, String(userId), salt, hash);

/** Cria as tabelas e, uma única vez, move a base antiga (sem tenant) para a empresa principal. */
let esquemaOk = false;
async function garantirEsquema(env) {
  if (esquemaOk) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS dados (tenant TEXT NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant, col, id))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ajustes (tenant TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tenant, key))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS senhas (tenant TEXT NOT NULL, user_id TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (tenant, user_id))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
  ]);
  const migrado = await env.DB.prepare("SELECT value FROM secrets WHERE key = 'multiempresa'").first();
  if (!migrado) {
    const antigas = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('items', 'config', 'credentials')").all()).results.map((r) => r.name);
    const stmts = [];
    if (antigas.includes('items')) stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO dados (tenant, col, id, data, updated_at) SELECT '${PRINCIPAL}', col, id, data, updated_at FROM items`));
    if (antigas.includes('config')) stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO ajustes (tenant, key, data) SELECT '${PRINCIPAL}', key, data FROM config`));
    if (antigas.includes('credentials')) stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO senhas (tenant, user_id, salt, hash) SELECT '${PRINCIPAL}', user_id, salt, hash FROM credentials`));
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO secrets (key, value) VALUES ('multiempresa', '1')"));
    await env.DB.batch(stmts);
  }
  esquemaOk = true;
}

async function inicializado(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM senhas WHERE tenant = ?').bind(PRINCIPAL).first();
  return (r?.n ?? 0) > 0;
}

/** E-mail já usado por outro usuário (em qualquer empresa)? Login é por e-mail, então ele precisa ser único. */
async function emailEmUso(env, email, tenant, userId) {
  const rows = (await env.DB.prepare("SELECT tenant, id FROM dados WHERE col = 'usuarios' AND tenant <> ? AND lower(json_extract(data, '$.email')) = ?")
    .bind(PLAT, String(email).trim().toLowerCase()).all()).results;
  return rows.some((r) => !(r.tenant === tenant && r.id === String(userId)));
}

/**
 * Grava uma base completa de uma empresa (primeira carga, backup, reset ou provisionamento).
 * Mantém as senhas de quem continua existindo; usuários novos recebem `senhaNovos` (ou a padrão).
 */
async function gravarBase(env, tenant, db, senhaNovos) {
  if (!db || !Array.isArray(db.usuarios) || !db.usuarios.length) throw new Error('Base inválida: sem usuários.');
  const stmts = [env.DB.prepare('DELETE FROM dados WHERE tenant = ?').bind(tenant), env.DB.prepare('DELETE FROM ajustes WHERE tenant = ?').bind(tenant)];
  for (const col of COLS) for (const item of db[col] ?? []) stmts.push(upsertStmt(env, tenant, col, item));
  stmts.push(configStmt(env, tenant, 'permissoes', db.permissoes ?? {}), configStmt(env, tenant, 'empresa', db.empresa ?? {}));
  const ids = db.usuarios.map((u) => String(u.id));
  const existentes = new Set((await env.DB.prepare('SELECT user_id FROM senhas WHERE tenant = ?').bind(tenant).all()).results.map((r) => r.user_id));
  stmts.push(env.DB.prepare(`DELETE FROM senhas WHERE tenant = ? AND user_id NOT IN (${ids.map(() => '?').join(',')})`).bind(tenant, ...ids));
  for (const id of ids) {
    if (existentes.has(id)) continue;
    const { salt, hash } = await hashSenha(senhaNovos ?? SENHA_PADRAO);
    stmts.push(senhaStmt(env, tenant, id, salt, hash));
  }
  for (let i = 0; i < stmts.length; i += 400) await env.DB.batch(stmts.slice(i, i + 400));
}

/* ---------------- Plano e assinatura ---------------- */
async function assinaturaDe(env, tenant) {
  if (tenant === PRINCIPAL) {
    return { tenant, principal: true, empresa: 'Conta principal', plano: 'Interno', status: 'Ativa', modulos: TODOS_MODULOS, maxUsuarios: 999, valorMensal: 0 };
  }
  const a = await getItem(env, PLAT, 'assinantes', tenant);
  const plano = a ? await getItem(env, PLAT, 'planos', a.planoId) : null;
  const cfg = (await getItem(env, PLAT, 'config', 'geral')) ?? { precoModuloAvulso: 39 };
  const modulos = [...new Set([...ESSENCIAIS, ...(plano?.modulos ?? []), ...(a?.modulosExtras ?? [])])];
  const valor = valorMensalDe(a, plano, cfg);
  return {
    tenant, principal: false, empresa: a?.empresa ?? '—', plano: plano?.nome ?? '—', status: a?.status ?? 'Cancelada', modulos,
    maxUsuarios: (plano?.maxUsuarios ?? 1) + (a?.usuariosExtras ?? 0), valorMensal: valor, trialFim: a?.trialFim,
    _bloqueio: !a ? 'Empresa não encontrada na plataforma.'
      : a.status === 'Suspensa' ? 'Acesso suspenso. Regularize a assinatura com o suporte Pivot Hub.'
        : a.status === 'Cancelada' ? 'Assinatura cancelada. Fale com o comercial Pivot Hub para reativar.'
          : a.status === 'Trial' && a.trialFim && a.trialFim < hojeISO() ? 'O período de teste terminou. Fale com o comercial Pivot Hub para contratar um plano.'
            : null,
  };
}

function podeEscrever(ctx, col, item) {
  const { user, perms, assinatura } = ctx;
  const plano = assinatura.modulos;
  if (!plano.includes(MODULO[col])) {
    // receitas geradas por módulos liberados (OS, contratos e turmas) continuam permitidas
    const viaModulo = col === 'lancamentos' && ((item?.osId && plano.includes('ordens')) || (item?.categoria === 'Recorrência' && plano.includes('contratos')) || (item?.turmaId && plano.includes('treinamentos')));
    if (!viaModulo) return false;
  }
  if (user.perfil === 'Proprietário') return true;
  const mods = perms[user.perfil] ?? [];
  if (mods.includes(MODULO[col])) return true;
  if (col === 'lancamentos' && item?.osId && mods.includes('ordens')) return true;
  if (col === 'lancamentos' && item?.categoria === 'Recorrência' && mods.includes('contratos')) return true;
  if (col === 'lancamentos' && item?.turmaId && mods.includes('treinamentos')) return true;
  return false;
}

/* ---------------- Rotas da empresa ---------------- */
async function api(req, env, url) {
  await garantirEsquema(env);
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  // Webhook do Asaas: autenticado pelo token próprio (lê o corpo por conta própria)
  if (path === '/asaas/webhook' && method === 'POST') return webhookAsaas(req, env, json);
  const body = ['POST', 'PUT'].includes(method) ? await req.json().catch(() => null) : null;

  // Públicas
  if (path === '/status' && method === 'GET') return json({ ok: true, initialized: await inicializado(env), multiempresa: true });

  if (path === '/bootstrap' && method === 'POST') {
    if (await inicializado(env)) return erro('Banco já inicializado.', 409);
    await gravarBase(env, PRINCIPAL, body?.db);
    return json({ ok: true });
  }

  if (path === '/login' && method === 'POST') {
    const email = String(body?.email ?? '').trim().toLowerCase();
    const buscar = async (e) => (await env.DB.prepare("SELECT tenant, data FROM dados WHERE col = 'usuarios' AND tenant <> ? AND lower(json_extract(data, '$.email')) = ?").bind(PLAT, e).all()).results;
    // Bases criadas antes da troca de marca ainda guardam os e-mails @techgest.com até a migração v4 rodar
    let rows = await buscar(email);
    if (!rows.length && email.endsWith('@pivothub.com')) rows = await buscar(email.replace(/@pivothub\.com$/, '@techgest.com'));
    for (const r of rows) {
      const u = JSON.parse(r.data);
      const cred = await env.DB.prepare('SELECT salt, hash FROM senhas WHERE tenant = ? AND user_id = ?').bind(r.tenant, String(u.id)).first();
      if (!cred || !iguais((await hashSenha(String(body?.senha ?? ''), cred.salt)).hash, cred.hash)) continue;
      if (u.status !== 'Ativo') return erro('Usuário inativo. Fale com o administrador.', 403);
      const assinatura = await assinaturaDe(env, r.tenant);
      if (assinatura._bloqueio) return erro(assinatura._bloqueio, 403);
      u.ultimoAcesso = new Date().toISOString();
      await upsertStmt(env, r.tenant, 'usuarios', u).run();
      return json({ token: await criarToken(env, r.tenant, u.id), userId: u.id, tenant: r.tenant });
    }
    return erro('E-mail ou senha inválidos.', 401);
  }

  // Autenticadas
  const sessao = await validarToken(env, (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const user = sessao ? await getItem(env, sessao.tenant, 'usuarios', sessao.uid) : null;
  if (!user || user.status !== 'Ativo') return erro('Sessão expirada. Entre novamente.', 401);
  const tenant = sessao.tenant;
  const assinatura = await assinaturaDe(env, tenant);
  if (assinatura._bloqueio) return json({ error: assinatura._bloqueio, bloqueado: true }, 403);
  const dono = user.perfil === 'Proprietário';
  const perms = (await getConfig(env, tenant, 'permissoes')) ?? {};
  const ctx = { tenant, user, dono, perms, assinatura };

  if (path.startsWith('/admin/')) {
    if (tenant !== PRINCIPAL || !dono) return erro('Acesso restrito ao administrador da plataforma.', 403);
    return admin(req, env, path.slice(6), method, body, user);
  }

  if (path === '/db' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT col, data FROM dados WHERE tenant = ?').bind(tenant).all()).results;
    const db = Object.fromEntries(COLS.map((c) => [c, []]));
    for (const r of rows) if (db[r.col]) db[r.col].push(JSON.parse(r.data));
    db.permissoes = perms;
    db.empresa = (await getConfig(env, tenant, 'empresa')) ?? {};
    const { _bloqueio, ...pub } = assinatura;
    if (!pub.principal) {
      // próxima mensalidade em aberto (com link de pagamento do Asaas, quando houver)
      const hoje = hojeISO();
      const abertas = (await listar(env, PLAT, 'faturas')).filter((f) => f.assinanteId === tenant && f.status === 'Em aberto').sort((a, b) => a.vencimento.localeCompare(b.vencimento));
      if (abertas[0]) pub.faturaAberta = { valor: abertas[0].valor, vencimento: abertas[0].vencimento, link: abertas[0].link, vencida: abertas[0].vencimento < hoje };
      const reg = await getItem(env, PLAT, 'assinantes', tenant);
      if (reg?.cobranca?.ativa) pub.forma = reg.cobranca.forma;
      pub.ofertas = (await listar(env, PLAT, 'planos')).filter((p) => p.ativo).sort((a, b) => a.ordem - b.ordem)
        .map(({ id, nome, precoMensal, maxUsuarios, modulos }) => ({ id, nome, precoMensal, maxUsuarios, modulos }));
    }
    db._assinatura = pub;
    return json(db);
  }

  const m = path.match(/^\/items\/([a-z]+)\/([^/]+)$/);
  if (m) {
    const [, col, idRaw] = m;
    const id = decodeURIComponent(idRaw);
    if (!COLS.includes(col)) return erro('Coleção inválida.', 404);
    if (method === 'PUT') {
      if (!body || String(body.id) !== id) return erro('Registro inválido.');
      if (!podeEscrever(ctx, col, body)) return erro(assinatura.modulos.includes(MODULO[col]) ? 'Sem permissão para este módulo.' : `Módulo não incluído no plano ${assinatura.plano}.`, 403);
      if (col === 'usuarios') {
        const antes = await getItem(env, tenant, col, body.id);
        if (antes?.perfil === 'Proprietário' && (body.perfil !== 'Proprietário' || body.status !== 'Ativo')) {
          const donos = (await env.DB.prepare("SELECT COUNT(*) AS n FROM dados WHERE tenant = ? AND col='usuarios' AND json_extract(data,'$.perfil')='Proprietário' AND json_extract(data,'$.status')='Ativo'").bind(tenant).first()).n;
          if (donos <= 1) return erro('É preciso manter ao menos um proprietário ativo.', 409);
        }
        if (await emailEmUso(env, body.email, tenant, body.id)) return erro('Este e-mail já é usado por outro usuário da plataforma.', 409);
        if (body.status === 'Ativo' && antes?.status !== 'Ativo') {
          const ativos = (await env.DB.prepare("SELECT COUNT(*) AS n FROM dados WHERE tenant = ? AND col='usuarios' AND id <> ? AND json_extract(data,'$.status')='Ativo'").bind(tenant, String(body.id)).first()).n;
          if (ativos + 1 > assinatura.maxUsuarios) return erro(`Limite de ${assinatura.maxUsuarios} usuário(s) ativo(s) do plano ${assinatura.plano} atingido. Faça upgrade ou contrate usuários extras.`, 403);
        }
        if (!antes) {
          const { salt, hash } = await hashSenha(SENHA_PADRAO);
          await senhaStmt(env, tenant, body.id, salt, hash).run();
        }
      }
      await upsertStmt(env, tenant, col, body).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      const atual = await getItem(env, tenant, col, id);
      if (!podeEscrever(ctx, col, atual)) return erro('Sem permissão para este módulo.', 403);
      if (col === 'usuarios' && String(atual?.id) === String(user.id)) return erro('Você não pode excluir o próprio usuário.', 409);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM dados WHERE tenant = ? AND col = ? AND id = ?').bind(tenant, col, id),
        ...(col === 'usuarios' ? [env.DB.prepare('DELETE FROM senhas WHERE tenant = ? AND user_id = ?').bind(tenant, id)] : []),
      ]);
      return json({ ok: true });
    }
  }

  const c = path.match(/^\/config\/(permissoes|empresa)$/);
  if (c && method === 'PUT') {
    if (c[1] === 'permissoes' && !dono) return erro('Somente o proprietário altera permissões.', 403);
    if (c[1] === 'empresa' && !dono && !(perms[user.perfil] ?? []).includes('configuracoes')) return erro('Sem permissão.', 403);
    await configStmt(env, tenant, c[1], body).run();
    return json({ ok: true });
  }

  if (path === '/password' && method === 'POST') {
    const alvo = String(body?.userId ?? user.id);
    const nova = String(body?.nova ?? '');
    if (nova.length < 6) return erro('A nova senha deve ter ao menos 6 caracteres.');
    if (alvo === String(user.id)) {
      const cred = await env.DB.prepare('SELECT salt, hash FROM senhas WHERE tenant = ? AND user_id = ?').bind(tenant, alvo).first();
      if (!cred || !iguais((await hashSenha(String(body?.atual ?? ''), cred.salt)).hash, cred.hash)) return erro('Senha atual incorreta.', 403);
    } else if (!dono) return erro('Somente o proprietário redefine senhas de outros usuários.', 403);
    if (!(await getItem(env, tenant, 'usuarios', alvo))) return erro('Usuário não encontrado.', 404);
    const { salt, hash } = await hashSenha(nova);
    await senhaStmt(env, tenant, alvo, salt, hash).run();
    return json({ ok: true });
  }

  if (path === '/reset' && method === 'POST') {
    if (!dono) return erro('Somente o proprietário pode substituir a base.', 403);
    for (const u of body?.db?.usuarios ?? []) {
      if (await emailEmUso(env, u.email, tenant, u.id)) return erro(`O e-mail ${u.email} já é usado em outra empresa da plataforma.`, 409);
    }
    await gravarBase(env, tenant, body?.db);
    return json({ ok: true });
  }

  return erro('Rota não encontrada.', 404);
}

/* ---------------- Console da plataforma (somente proprietários da empresa principal) ---------------- */
async function admin(req, env, path, method, body, user) {
  if (path.startsWith('/asaas/')) return rotasAdminAsaas(req, env, path.slice(6), method, body, user, json, erro);

  if (path === '/dados' && method === 'GET') {
    const out = {};
    for (const col of PLAT_COLS) out[col] = await listar(env, PLAT, col);
    // Uso real de cada empresa provisionada: usuários ativos, último acesso e módulos com dados
    const contagem = (await env.DB.prepare('SELECT tenant, col, COUNT(*) AS n FROM dados WHERE tenant NOT IN (?, ?) GROUP BY tenant, col').bind(PLAT, PRINCIPAL).all()).results;
    const usuarios = (await env.DB.prepare("SELECT tenant, json_extract(data, '$.status') AS status, json_extract(data, '$.ultimoAcesso') AS acesso FROM dados WHERE col = 'usuarios' AND tenant NOT IN (?, ?)").bind(PLAT, PRINCIPAL).all()).results;
    const uso = {};
    for (const r of contagem) {
      const u = (uso[r.tenant] ??= { usuarios: 0, modulosEmUso: [], registros: 0, real: true });
      if (r.col === 'usuarios') continue;
      u.registros += r.n;
      if (r.n > 0 && !u.modulosEmUso.includes(MODULO[r.col])) u.modulosEmUso.push(MODULO[r.col]);
    }
    for (const r of usuarios) {
      const u = (uso[r.tenant] ??= { usuarios: 0, modulosEmUso: [], registros: 0, real: true });
      if (r.status === 'Ativo') u.usuarios += 1;
      if (r.acesso && (!u.ultimoAcesso || r.acesso > u.ultimoAcesso)) u.ultimoAcesso = r.acesso;
    }
    out.uso = uso;
    return json(out);
  }

  if (path === '/bootstrap' && method === 'POST') {
    const ja = await env.DB.prepare("SELECT COUNT(*) AS n FROM dados WHERE tenant = ? AND col = 'planos'").bind(PLAT).first();
    if (ja.n > 0) return erro('Plataforma já inicializada.', 409);
    const stmts = [];
    for (const col of PLAT_COLS) for (const item of body?.plataforma?.[col] ?? []) stmts.push(upsertStmt(env, PLAT, col, item));
    for (let i = 0; i < stmts.length; i += 400) await env.DB.batch(stmts.slice(i, i + 400));
    return json({ ok: true });
  }

  const it = path.match(/^\/itens\/(planos|assinantes|faturas|config)\/([^/]+)$/);
  if (it) {
    const [, col, idRaw] = it;
    const id = decodeURIComponent(idRaw);
    if (method === 'PUT') {
      if (!body || String(body.id) !== id) return erro('Registro inválido.');
      const antes = col === 'assinantes' ? await getItem(env, PLAT, col, id) : null;
      // os identificadores da cobrança automática são mantidos pelo servidor
      let registro = body;
      if (col === 'assinantes' && antes) {
        // eventos gravados pelo servidor (webhook, rotina) não se perdem se a tela estiver desatualizada
        const chave = (h) => `${h.data}|${h.tipo}|${h.detalhe}`;
        const hist = [...(antes.historico ?? []), ...(body.historico ?? [])].filter((h, i, arr) => arr.findIndex((x) => chave(x) === chave(h)) === i)
          .sort((x, y) => x.data.localeCompare(y.data));
        registro = { ...body, historico: hist, ...(antes.cobranca ? { cobranca: antes.cobranca } : {}) };
      }
      await upsertStmt(env, PLAT, col, registro).run();
      if (col === 'assinantes') return json({ ok: true, ...(await aposSalvarAssinante(env, antes, registro)) });
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      if (col === 'assinantes') return erro('Use a exclusão de empresa.', 400);
      await env.DB.prepare('DELETE FROM dados WHERE tenant = ? AND col = ? AND id = ?').bind(PLAT, col, id).run();
      return json({ ok: true });
    }
  }

  // Provisiona uma empresa nova: registro comercial + base própria com o responsável como proprietário
  if (path === '/empresas' && method === 'POST') {
    const a = body?.assinante, db = body?.db;
    if (!a || !tenantValido(String(a.id))) return erro('Identificador de empresa inválido.');
    if (await getItem(env, PLAT, 'assinantes', a.id)) return erro('Empresa já cadastrada.', 409);
    for (const u of db?.usuarios ?? []) if (await emailEmUso(env, u.email, a.id, u.id)) return erro(`O e-mail ${u.email} já é usado na plataforma.`, 409);
    const senha = senhaProvisoria();
    await gravarBase(env, a.id, db, senha);
    await upsertStmt(env, PLAT, 'assinantes', { ...a, provisionado: true }).run();
    return json({ ok: true, senha });
  }

  const emp = path.match(/^\/empresas\/([^/]+)(\/senha)?$/);
  if (emp) {
    const id = decodeURIComponent(emp[1]);
    if (!tenantValido(id)) return erro('Empresa inválida.');
    if (emp[2] && method === 'POST') {
      const donos = (await listar(env, id, 'usuarios')).filter((u) => u.perfil === 'Proprietário' && u.status === 'Ativo');
      if (!donos.length) return erro('A empresa não tem proprietário ativo.', 404);
      const senha = senhaProvisoria();
      const { salt, hash } = await hashSenha(senha);
      await senhaStmt(env, id, donos[0].id, salt, hash).run();
      return json({ ok: true, senha, email: donos[0].email });
    }
    if (!emp[2] && method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM dados WHERE tenant = ?').bind(id),
        env.DB.prepare('DELETE FROM ajustes WHERE tenant = ?').bind(id),
        env.DB.prepare('DELETE FROM senhas WHERE tenant = ?').bind(id),
        env.DB.prepare("DELETE FROM dados WHERE tenant = ? AND col = 'assinantes' AND id = ?").bind(PLAT, id),
        env.DB.prepare("DELETE FROM dados WHERE tenant = ? AND col = 'faturas' AND json_extract(data, '$.assinanteId') = ?").bind(PLAT, id),
      ]);
      return json({ ok: true });
    }
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
  /** Rotina diária (Cron Trigger): reconcilia pagamentos do Asaas e, se ativada, aplica a régua de inadimplência. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => { await garantirEsquema(env); await rotinaDiaria(env); })());
  },
};
