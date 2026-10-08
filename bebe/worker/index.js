/**
 * Ninho · Worker Cloudflare
 * Serve o app (index.html estático) e a API /api/* com persistência no D1 (ver worker/schema.sql).
 *
 * Modelo: o BEBÊ é o registro central. Cada cuidador (mãe, pai, avó, babá...) é um usuário
 * vinculado ao bebê pela tabela `members`, com um nível de acesso:
 *   admin  → edita o bebê, convida e remove cuidadores, apaga dados
 *   editor → registra a rotina, mural, recados e saúde
 *   leitor → só acompanha (ex.: avós que moram longe)
 */

import { vapid, sendPush } from './push.js';
import { CATEGORIAS, descreverEvento, lembretes, lerPrefs, nomePapel, notificar } from './notify.js';

const TOKEN_DIAS = 30;
const FOTO_MAX = 400_000; // ~300 KB de imagem em base64 (o app envia 320×320 JPEG, ~25 KB)
const PBKDF2_ITER = 100000;
const NIVEL = { leitor: 1, editor: 2, admin: 3 };
const PAPEIS = ['mae', 'pai', 'avo_m', 'avo_f', 'baba', 'tio', 'tia', 'irmao', 'irma', 'padrinho', 'madrinha', 'outro'];
const TIPOS_EVENTO = ['mamada', 'mamadeira', 'sono', 'fralda', 'remedio', 'banho', 'alimentacao', 'extracao', 'outro'];

/** Recursos filhos do bebê: colunas graváveis e campos obrigatórios. */
const RES = {
  events: { cols: ['type', 'start_at', 'end_at', 'data', 'note'], obrig: ['type', 'start_at'], json: ['data'] },
  growth: { cols: ['date', 'weight_g', 'height_cm', 'head_cm', 'source', 'note'], obrig: ['date'] },
  supplies: { cols: ['name', 'category', 'unit', 'qty', 'min_qty', 'auto_type', 'per_use', 'buyer_id', 'note'], obrig: ['name'] },
  notes: { cols: ['text', 'pinned', 'done'], obrig: ['text'] },
  appointments: { cols: ['date', 'title', 'doctor', 'note', 'done'], obrig: ['date', 'title'] },
};

const enc = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const erro = (msg, status = 400) => json({ error: msg }, status);
const agora = () => new Date().toISOString();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idValido = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id);

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
/** Chave das sessões: secret AUTH_SECRET, ou uma gerada no primeiro uso e guardada no D1. */
let segredoCache = null;
async function segredo(env) {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (segredoCache) return segredoCache;
  await env.DB.prepare("INSERT OR IGNORE INTO secrets (key, value) VALUES ('auth', ?)").bind(b64url(crypto.getRandomValues(new Uint8Array(32)))).run();
  segredoCache = (await env.DB.prepare("SELECT value FROM secrets WHERE key = 'auth'").first()).value;
  return segredoCache;
}
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await segredo(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
async function criarToken(env, userId) {
  const payload = `${userId}.${Date.now() + TOKEN_DIAS * 86400_000}`;
  return `${payload}.${await hmac(env, payload)}`;
}
async function validarToken(env, token) {
  const partes = (token || '').split('.');
  if (partes.length !== 3) return null;
  const [uid, exp, sig] = partes;
  if (Number(exp) < Date.now()) return null;
  return iguais(sig, await hmac(env, `${uid}.${exp}`)) ? uid : null;
}

/* ---------------- Esquema ---------------- */
const ESQUEMA = [
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS babies (id TEXT PRIMARY KEY, name TEXT NOT NULL, birth_date TEXT NOT NULL, sex TEXT, color TEXT, routine TEXT, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS members (baby_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, access TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (baby_id, user_id))',
  'CREATE INDEX IF NOT EXISTS idx_members_user ON members (user_id)',
  'CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, baby_id TEXT NOT NULL, role TEXT NOT NULL, access TEXT NOT NULL, created_by TEXT NOT NULL, expires_at TEXT NOT NULL, used_by TEXT)',
  'CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, type TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT, data TEXT, note TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_events_baby_start ON events (baby_id, start_at)',
  'CREATE TABLE IF NOT EXISTS growth (id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, date TEXT NOT NULL, weight_g REAL, height_cm REAL, head_cm REAL, source TEXT, note TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_growth_baby ON growth (baby_id, date)',
  'CREATE TABLE IF NOT EXISTS supplies (id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT, unit TEXT, qty REAL NOT NULL DEFAULT 0, min_qty REAL NOT NULL DEFAULT 0, auto_type TEXT, per_use REAL DEFAULT 1, buyer_id TEXT, note TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_supplies_baby ON supplies (baby_id)',
  'CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, text TEXT NOT NULL, pinned INTEGER DEFAULT 0, done INTEGER DEFAULT 0, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_notes_baby ON notes (baby_id)',
  'CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, baby_id TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, doctor TEXT, note TEXT, done INTEGER DEFAULT 0, user_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_appointments_baby ON appointments (baby_id, date)',
  'CREATE TABLE IF NOT EXISTS vaccines (baby_id TEXT NOT NULL, code TEXT NOT NULL, date TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (baby_id, code))',
  'CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS photos (kind TEXT NOT NULL, id TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (kind, id))',
  'CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, tz TEXT, ua TEXT, created_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs (user_id)',
  'CREATE TABLE IF NOT EXISTS notif_prefs (user_id TEXT PRIMARY KEY, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS notif_log (key TEXT PRIMARY KEY, at TEXT NOT NULL)',
];
/** Colunas adicionadas depois da 1ª versão (bancos antigos recebem via ALTER). */
const MIGRACOES = ['ALTER TABLE users ADD COLUMN photo_v TEXT', 'ALTER TABLE babies ADD COLUMN photo_v TEXT'];
let esquemaOk = false;
async function garantirEsquema(env) {
  if (esquemaOk) return;
  await env.DB.batch(ESQUEMA.map((s) => env.DB.prepare(s)));
  for (const m of MIGRACOES) {
    try { await env.DB.prepare(m).run(); } catch { /* coluna já existe */ }
  }
  esquemaOk = true;
}

/* ---------------- Helpers de dados ---------------- */
/** URL assinada da foto: só quem recebeu o link pela API (cuidadores vinculados) consegue abrir. */
async function fotoUrl(env, kind, id, v) {
  if (!v) return null;
  return `./api/photo/${kind}/${id}?v=${encodeURIComponent(v)}&s=${(await hmac(env, `foto:${kind}:${id}:${v}`)).slice(0, 24)}`;
}
const parseBaby = async (env, b) => b && { ...b, routine: b.routine ? JSON.parse(b.routine) : null, photo: await fotoUrl(env, 'baby', b.id, b.photo_v) };
const parseEvent = (e) => ({ ...e, data: e.data ? JSON.parse(e.data) : {} });
const publicUser = async (env, u) => u && { id: u.id, name: u.name, email: u.email, photo: await fotoUrl(env, 'user', u.id, u.photo_v) };

/** Valida um data URL de imagem e devolve { mime, data } (base64). */
function lerFoto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw Object.assign(new Error('Imagem inválida. Use JPG, PNG ou WebP.'), { status: 400 });
  if (m[2].length > FOTO_MAX) throw Object.assign(new Error('Imagem muito grande.'), { status: 413 });
  return { mime: m[1], data: m[2] };
}
async function salvarFoto(env, kind, id, dataUrl) {
  const { mime, data } = lerFoto(dataUrl);
  const v = Date.now().toString(36);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO photos (kind, id, mime, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at').bind(kind, id, mime, data, agora()),
    env.DB.prepare(`UPDATE ${kind === 'baby' ? 'babies' : 'users'} SET photo_v = ? WHERE id = ?`).bind(v, id),
  ]);
  return fotoUrl(env, kind, id, v);
}
async function removerFoto(env, kind, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE kind = ? AND id = ?').bind(kind, id),
    env.DB.prepare(`UPDATE ${kind === 'baby' ? 'babies' : 'users'} SET photo_v = NULL WHERE id = ?`).bind(id),
  ]);
}

async function vinculo(env, babyId, userId) {
  return env.DB.prepare('SELECT role, access FROM members WHERE baby_id = ? AND user_id = ?').bind(babyId, userId).first();
}

function limparValores(res, body) {
  const out = {};
  for (const c of RES[res].cols) {
    if (!(c in body)) continue;
    let v = body[c];
    if (RES[res].json?.includes(c)) v = JSON.stringify(v ?? {});
    else if (typeof v === 'boolean') v = v ? 1 : 0;
    else if (v !== null && typeof v === 'object') v = JSON.stringify(v);
    if (typeof v === 'string' && v.length > 4000) v = v.slice(0, 4000);
    out[c] = v ?? null;
  }
  return out;
}

async function estoque(env, babyId) {
  const r = (await env.DB.prepare('SELECT id, name, qty, min_qty, unit, buyer_id FROM supplies WHERE baby_id = ?').bind(babyId).all()).results;
  return Object.fromEntries(r.map((s) => [s.id, s]));
}

/** Baixa automática no mural: cada fralda registrada consome os itens marcados com auto_type = 'fralda'. */
const ajusteEstoque = (env, babyId, tipo, sinal) => env.DB
  .prepare('UPDATE supplies SET qty = MAX(0, qty + ? * COALESCE(per_use, 1)), updated_at = ? WHERE baby_id = ? AND auto_type = ?')
  .bind(sinal, agora(), babyId, tipo);

async function dadosDoBebe(env, babyId, since) {
  const [baby, members, events, growth, supplies, notes, appointments, vaccines] = await Promise.all([
    env.DB.prepare('SELECT * FROM babies WHERE id = ?').bind(babyId).first(),
    env.DB.prepare('SELECT m.user_id, m.role, m.access, m.created_at, u.name, u.email, u.photo_v FROM members m JOIN users u ON u.id = m.user_id WHERE m.baby_id = ? ORDER BY m.created_at').bind(babyId).all(),
    env.DB.prepare('SELECT * FROM events WHERE baby_id = ? AND (start_at >= ? OR end_at IS NULL) ORDER BY start_at').bind(babyId, since).all(),
    env.DB.prepare('SELECT * FROM growth WHERE baby_id = ? ORDER BY date').bind(babyId).all(),
    env.DB.prepare('SELECT * FROM supplies WHERE baby_id = ? ORDER BY name').bind(babyId).all(),
    env.DB.prepare('SELECT * FROM notes WHERE baby_id = ? ORDER BY created_at DESC LIMIT 200').bind(babyId).all(),
    env.DB.prepare('SELECT * FROM appointments WHERE baby_id = ? ORDER BY date').bind(babyId).all(),
    env.DB.prepare('SELECT * FROM vaccines WHERE baby_id = ?').bind(babyId).all(),
  ]);
  return {
    baby: await parseBaby(env, baby),
    members: await Promise.all(members.results.map(async ({ photo_v, ...m }) => ({ ...m, photo: await fotoUrl(env, 'user', m.user_id, photo_v) }))),
    events: events.results.map(parseEvent),
    growth: growth.results,
    supplies: supplies.results,
    notes: notes.results,
    appointments: appointments.results,
    vaccines: vaccines.results,
  };
}

/* ---------------- Rotas ---------------- */
async function api(req, env, url, ctx) {
  /** Dispara notificações sem atrasar a resposta. */
  const avisar = (babyId, cat, msg, exceto) => ctx.waitUntil(notificar(env, babyId, cat, msg, exceto).catch(() => 0));
  await garantirEsquema(env);
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const body = ['POST', 'PUT'].includes(method) ? await req.json().catch(() => ({})) : {};

  if (path === '/status' && method === 'GET') return json({ ok: true, push: true });

  // Fotos: link assinado (gerado só para quem tem acesso) e cache longo, pois a versão muda a cada troca
  const mf = path.match(/^\/photo\/(baby|user)\/([A-Za-z0-9-]+)$/);
  if (mf && method === 'GET') {
    const [, kind, id] = mf;
    const v = url.searchParams.get('v') || '';
    const s = url.searchParams.get('s') || '';
    if (!iguais(s, (await hmac(env, `foto:${kind}:${id}:${v}`)).slice(0, 24))) return erro('Link inválido.', 403);
    const f = await env.DB.prepare('SELECT mime, data FROM photos WHERE kind = ? AND id = ?').bind(kind, id).first();
    if (!f) return erro('Foto não encontrada.', 404);
    return new Response(Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)), {
      headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=31536000, immutable' },
    });
  }

  if (path === '/auth/signup' && method === 'POST') {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const senha = String(body.password ?? '');
    if (name.length < 2) return erro('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro('E-mail inválido.');
    if (senha.length < 6) return erro('A senha deve ter ao menos 6 caracteres.');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return erro('Este e-mail já tem cadastro. Entre com sua senha.', 409);
    const id = crypto.randomUUID();
    const { salt, hash } = await hashSenha(senha);
    await env.DB.prepare('INSERT INTO users (id, name, email, salt, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, email, salt, hash, agora()).run();
    return json({ token: await criarToken(env, id), user: { id, name, email } });
  }

  if (path === '/auth/login' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    const ok = u ? iguais((await hashSenha(String(body.password ?? ''), u.salt)).hash, u.hash) : false;
    if (!ok) return erro('E-mail ou senha inválidos.', 401);
    return json({ token: await criarToken(env, u.id), user: await publicUser(env, u) });
  }

  // ---- Autenticadas ----
  const uid = await validarToken(env, (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const me = uid ? await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first() : null;
  if (!me) return erro('Sessão expirada. Entre novamente.', 401);

  if (path === '/me' && method === 'GET') {
    const babies = await env.DB.prepare('SELECT b.*, m.role, m.access FROM members m JOIN babies b ON b.id = m.baby_id WHERE m.user_id = ? ORDER BY b.birth_date DESC').bind(me.id).all();
    return json({ user: await publicUser(env, me), babies: await Promise.all(babies.results.map((b) => parseBaby(env, b))) });
  }

  if (path === '/me/photo' && method === 'PUT') return json({ photo: await salvarFoto(env, 'user', me.id, body.photo) });
  if (path === '/me/photo' && method === 'DELETE') {
    await removerFoto(env, 'user', me.id);
    return json({ ok: true });
  }

  /* ---- Notificações push ---- */
  if (path === '/push' && method === 'GET') {
    const prefs = await env.DB.prepare('SELECT data FROM notif_prefs WHERE user_id = ?').bind(me.id).first();
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').bind(me.id).first()).n;
    return json({ publicKey: (await vapid(env)).publicKey, prefs: lerPrefs(prefs?.data), devices: n });
  }
  if (path === '/push/prefs' && method === 'PUT') {
    const atual = lerPrefs((await env.DB.prepare('SELECT data FROM notif_prefs WHERE user_id = ?').bind(me.id).first())?.data);
    const novo = { ...atual };
    for (const k of CATEGORIAS) if (typeof body[k] === 'boolean') novo[k] = body[k];
    if (body.silencio && typeof body.silencio === 'object') {
      const hh = (x, d) => (/^\d{2}:\d{2}$/.test(String(x)) ? x : d);
      novo.silencio = { on: !!body.silencio.on, de: hh(body.silencio.de, atual.silencio.de), ate: hh(body.silencio.ate, atual.silencio.ate) };
    }
    await env.DB.prepare('INSERT INTO notif_prefs (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data').bind(me.id, JSON.stringify(novo)).run();
    return json({ prefs: novo });
  }
  if (path === '/push/subscribe' && method === 'POST') {
    const endpoint = String(body.endpoint ?? '');
    const { p256dh, auth } = body.keys ?? {};
    // PUSH_DEV_HTTP só existe em testes locais (wrangler dev --var PUSH_DEV_HTTP:1)
    if (!(/^https:\/\//.test(endpoint) || (env.PUSH_DEV_HTTP && /^http:\/\/127\.0\.0\.1/.test(endpoint))) || !p256dh || !auth) return erro('Inscrição inválida.');
    await env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, tz, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, ua = excluded.ua')
      .bind(endpoint, me.id, p256dh, auth, String(body.tz ?? '').slice(0, 64) || null, String(req.headers.get('user-agent') ?? '').slice(0, 200), agora()).run();
    return json({ ok: true });
  }
  if (path === '/push/unsubscribe' && method === 'POST') {
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(body.endpoint ?? ''), me.id).run();
    return json({ ok: true });
  }
  if (path === '/push/test' && method === 'POST') {
    const subs = (await env.DB.prepare('SELECT * FROM push_subs WHERE user_id = ?').bind(me.id).all()).results;
    let ok = 0;
    for (const s of subs) {
      const st = await sendPush(env, s, { title: '🔔 Notificações ativadas', body: `Tudo certo, ${me.name.split(' ')[0]}! Você vai receber os avisos do Ninho neste aparelho.`, tag: 'teste', url: './#familia', icon: './icon-192.png' });
      if (st === 404 || st === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      else if (st < 300) ok++;
    }
    return json({ enviados: ok, aparelhos: subs.length });
  }

  if (path === '/me' && method === 'PUT') {
    const name = String(body.name ?? me.name).trim();
    if (name.length < 2) return erro('Informe seu nome.');
    if (body.newPassword) {
      if (String(body.newPassword).length < 6) return erro('A nova senha deve ter ao menos 6 caracteres.');
      if (!iguais((await hashSenha(String(body.password ?? ''), me.salt)).hash, me.hash)) return erro('Senha atual incorreta.', 403);
      const { salt, hash } = await hashSenha(String(body.newPassword));
      await env.DB.prepare('UPDATE users SET name = ?, salt = ?, hash = ? WHERE id = ?').bind(name, salt, hash, me.id).run();
    } else {
      await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, me.id).run();
    }
    return json({ ok: true });
  }

  // Criar bebê: quem cria vira admin, com o papel informado. O peso da última consulta vira o 1º registro de crescimento.
  if (path === '/babies' && method === 'POST') {
    const name = String(body.name ?? '').trim();
    if (!name) return erro('Informe o nome do bebê.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.birth_date ?? ''))) return erro('Informe a data de nascimento.');
    const role = PAPEIS.includes(body.role) ? body.role : 'outro';
    const id = crypto.randomUUID();
    const t = agora();
    const stmts = [
      env.DB.prepare('INSERT INTO babies (id, name, birth_date, sex, color, routine, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, name, body.birth_date, body.sex ?? null, body.color ?? null, JSON.stringify(body.routine ?? null), body.notes ?? null, me.id, t),
      env.DB.prepare('INSERT INTO members (baby_id, user_id, role, access, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, me.id, role, 'admin', t),
    ];
    if (body.weight_g || body.height_cm) {
      stmts.push(env.DB.prepare('INSERT INTO growth (id, baby_id, date, weight_g, height_cm, head_cm, source, note, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, body.consult_date || t.slice(0, 10), body.weight_g || null, body.height_cm || null, null, 'consulta', 'Última consulta (cadastro)', me.id, t, t));
    }
    await env.DB.batch(stmts);
    return json({ id });
  }

  if (path === '/invites/accept' && method === 'POST') {
    const code = String(body.code ?? '').trim().toUpperCase();
    const inv = await env.DB.prepare('SELECT * FROM invites WHERE code = ?').bind(code).first();
    if (!inv || inv.used_by || inv.expires_at < agora()) return erro('Convite inválido ou expirado. Peça um novo código.', 404);
    const ja = await vinculo(env, inv.baby_id, me.id);
    const role = PAPEIS.includes(body.role) ? body.role : inv.role;
    await env.DB.batch([
      env.DB.prepare('UPDATE invites SET used_by = ? WHERE code = ?').bind(me.id, code),
      ...(ja ? [] : [env.DB.prepare('INSERT INTO members (baby_id, user_id, role, access, created_at) VALUES (?, ?, ?, ?, ?)').bind(inv.baby_id, me.id, role, inv.access, agora())]),
    ]);
    if (!ja) avisar(inv.baby_id, 'familia', { title: `👋 ${me.name.split(' ')[0]} entrou na família`, body: `${me.name} agora acompanha como ${nomePapel(role)}.`, aba: 'familia' }, me.id);
    return json({ babyId: inv.baby_id });
  }

  // ---- Rotas de um bebê ----
  const mb = path.match(/^\/babies\/([A-Za-z0-9-]+)(\/.*)?$/);
  if (!mb) return erro('Rota não encontrada.', 404);
  const babyId = mb[1];
  const sub = mb[2] || '';
  const v = await vinculo(env, babyId, me.id);
  if (!v) return erro('Você não está vinculado(a) a este bebê.', 403);
  const pode = (nivel) => NIVEL[v.access] >= NIVEL[nivel];

  if (sub === '' && method === 'GET') {
    const since = url.searchParams.get('since') || new Date(Date.now() - 70 * 86400_000).toISOString();
    return json({ ...(await dadosDoBebe(env, babyId, since)), access: v.access, role: v.role });
  }

  if (sub === '' && method === 'PUT') {
    if (!pode('admin')) return erro('Somente administradores editam o perfil do bebê.', 403);
    const b = await env.DB.prepare('SELECT * FROM babies WHERE id = ?').bind(babyId).first();
    await env.DB.prepare('UPDATE babies SET name = ?, birth_date = ?, sex = ?, color = ?, routine = ?, notes = ? WHERE id = ?').bind(
      String(body.name ?? b.name).trim() || b.name, body.birth_date ?? b.birth_date, body.sex ?? b.sex, body.color ?? b.color,
      'routine' in body ? JSON.stringify(body.routine) : b.routine, body.notes ?? b.notes, babyId,
    ).run();
    return json({ ok: true });
  }

  if (sub === '/photo') {
    if (!pode('admin')) return erro('Somente administradores trocam a foto do bebê.', 403);
    if (method === 'PUT') return json({ photo: await salvarFoto(env, 'baby', babyId, body.photo) });
    if (method === 'DELETE') {
      await removerFoto(env, 'baby', babyId);
      return json({ ok: true });
    }
  }

  if (sub === '' && method === 'DELETE') {
    if (!pode('admin')) return erro('Somente administradores excluem o bebê.', 403);
    await env.DB.batch(['events', 'growth', 'supplies', 'notes', 'appointments', 'vaccines', 'invites', 'members'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE baby_id = ?`).bind(babyId))
      .concat(env.DB.prepare('DELETE FROM babies WHERE id = ?').bind(babyId), env.DB.prepare("DELETE FROM photos WHERE kind = 'baby' AND id = ?").bind(babyId)));
    return json({ ok: true });
  }

  if (sub === '/invites' && method === 'POST') {
    if (!pode('admin')) return erro('Somente administradores convidam cuidadores.', 403);
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => alfabeto[n % alfabeto.length]).join('');
    const role = PAPEIS.includes(body.role) ? body.role : 'outro';
    const access = NIVEL[body.access] ? body.access : 'editor';
    const expires = new Date(Date.now() + 7 * 86400_000).toISOString();
    await env.DB.prepare('INSERT INTO invites (code, baby_id, role, access, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(code, babyId, role, access, me.id, expires).run();
    return json({ code, expires_at: expires });
  }

  const mm = sub.match(/^\/members\/([A-Za-z0-9-]+)$/);
  if (mm) {
    const alvo = mm[1];
    const alvoV = await vinculo(env, babyId, alvo);
    if (!alvoV) return erro('Cuidador não encontrado.', 404);
    const admins = (await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE baby_id = ? AND access = 'admin'").bind(babyId).first()).n;
    if (method === 'PUT') {
      const proprio = alvo === me.id;
      if (!pode('admin') && !(proprio && body.access === undefined)) return erro('Somente administradores alteram cuidadores.', 403);
      const role = PAPEIS.includes(body.role) ? body.role : alvoV.role;
      const access = pode('admin') && NIVEL[body.access] ? body.access : alvoV.access;
      if (alvoV.access === 'admin' && access !== 'admin' && admins <= 1) return erro('O bebê precisa de ao menos um administrador.', 409);
      await env.DB.prepare('UPDATE members SET role = ?, access = ? WHERE baby_id = ? AND user_id = ?').bind(role, access, babyId, alvo).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      if (alvo !== me.id && !pode('admin')) return erro('Somente administradores removem cuidadores.', 403);
      if (alvoV.access === 'admin' && admins <= 1) return erro('O bebê precisa de ao menos um administrador. Promova outra pessoa antes.', 409);
      await env.DB.prepare('DELETE FROM members WHERE baby_id = ? AND user_id = ?').bind(babyId, alvo).run();
      return json({ ok: true });
    }
  }

  const mv = sub.match(/^\/vaccines\/([a-z0-9_]+)$/);
  if (mv) {
    if (!pode('editor')) return erro('Seu acesso é somente leitura.', 403);
    if (method === 'PUT') {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date)) ? body.date : agora().slice(0, 10);
      await env.DB.prepare('INSERT INTO vaccines (baby_id, code, date, user_id) VALUES (?, ?, ?, ?) ON CONFLICT(baby_id, code) DO UPDATE SET date = excluded.date, user_id = excluded.user_id')
        .bind(babyId, mv[1], date, me.id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM vaccines WHERE baby_id = ? AND code = ?').bind(babyId, mv[1]).run();
      return json({ ok: true });
    }
  }

  // Carga em lote (dados de exemplo para apresentação)
  if (sub === '/seed' && method === 'POST') {
    if (!pode('admin')) return erro('Somente administradores.', 403);
    const t = agora();
    const stmts = [];
    const membros = new Set((await env.DB.prepare('SELECT user_id FROM members WHERE baby_id = ?').bind(babyId).all()).results.map((r) => r.user_id));
    for (const res of Object.keys(RES)) {
      for (const item of (body[res] ?? []).slice(0, 3000)) {
        if (!idValido(item.id) || RES[res].obrig.some((c) => item[c] == null)) continue;
        const vals = limparValores(res, item);
        const cols = Object.keys(vals);
        stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO ${res} (id, baby_id, user_id, created_at, updated_at, ${cols.join(', ')}) VALUES (?, ?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`)
          .bind(item.id, babyId, membros.has(item.user_id) ? item.user_id : me.id, t, t, ...Object.values(vals)));
      }
    }
    for (let i = 0; i < stmts.length; i += 200) await env.DB.batch(stmts.slice(i, i + 200));
    return json({ ok: true, inseridos: stmts.length });
  }

  /** Notificações disparadas pelas alterações (vão para os outros cuidadores, conforme as preferências de cada um). */
  async function aposGravar(res, metodo, item, antes, antesEstoque) {
    const bb = await env.DB.prepare('SELECT name FROM babies WHERE id = ?').bind(babyId).first();
    const nome = bb.name.split(' ')[0];
    const quem = `${me.name.split(' ')[0]} (${nomePapel(v.role)})`;
    if (res === 'events') {
      const data = typeof item.data === 'string' ? JSON.parse(item.data || '{}') : item.data;
      const terminou = metodo === 'PUT' && antes && !antes.end_at && item.end_at;
      const cron = item.type === 'sono' || item.type === 'mamada';
      // Registro comum: aviso discreto (sem som), um por bebê — o mais recente substitui o anterior
      // (o fim de sono/mamada cronometrados já é avisado pela categoria "cronômetro", sem duplicar)
      if (metodo === 'POST' && !(cron && !item.end_at)) {
        avisar(babyId, 'atividade', { title: `${nome} · ${descreverEvento(item, data).split(' (')[0]}`, body: `${descreverEvento(item, data)} · por ${quem}`, tag: `ativ-${babyId}`, silent: true, ts: Date.parse(item.end_at || item.start_at) }, me.id);
      }
      // Cronômetro "ao vivo": fica fixo na tela de bloqueio de todos (inclusive de quem iniciou) e é substituído ao terminar
      if (cron && metodo === 'POST' && !item.end_at) {
        const desde = new Date(item.start_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        avisar(babyId, 'cronometro', {
          title: item.type === 'sono' ? `😴 ${nome} está dormindo` : `🤱 ${nome} está mamando`,
          body: `Desde ${desde}${item.type === 'mamada' && data?.side ? ` · ${({ E: 'peito esquerdo', D: 'peito direito', ambos: 'ambos os peitos' })[data.side]}` : ''} · por ${quem}`,
          tag: `timer-${item.id}`, ts: Date.parse(item.start_at), sticky: true, silent: true,
          actions: [{ action: 'encerrar', title: item.type === 'sono' ? '☀️ Acordou' : '✔️ Terminou' }, { action: 'abrir', title: 'Abrir' }],
          acoes: { encerrar: { api: { method: 'PUT', path: `/babies/${babyId}/events/${item.id}`, body: { end_at: '$agora' } } } },
        });
      }
      if (cron && terminou) {
        const h = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const min = Math.max(0, Math.round((Date.parse(item.end_at) - Date.parse(item.start_at)) / 60000));
        const dur = min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
        avisar(babyId, 'cronometro', {
          title: item.type === 'sono' ? `☀️ ${nome} acordou` : `✔️ ${nome} terminou de mamar`,
          body: `${item.type === 'sono' ? 'Dormiu' : 'Mamou'} ${dur} (${h(item.start_at)}–${h(item.end_at)}) · por ${quem}`,
          tag: `timer-${item.id}`, silent: true, ts: Date.parse(item.end_at),
        });
      }
    }
    if (res === 'notes' && metodo === 'POST') avisar(babyId, 'recados', { title: `📌 ${nome} · recado de ${me.name.split(' ')[0]}`, body: String(item.text).slice(0, 140), aba: 'mural', tag: `nota-${item.id}` }, me.id);
    if (res === 'appointments' && metodo === 'POST') avisar(babyId, 'consultas', { title: `🩺 ${nome} · consulta agendada`, body: `${item.title} em ${new Date(item.date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} · por ${quem}`, aba: 'saude', ts: Date.parse(item.date) }, me.id);
    // Estoque: avisa quando um item cruza o mínimo (por ajuste manual ou baixa automática de fralda)
    const anterior = antesEstoque ?? (res === 'supplies' && antes ? { [antes.id]: antes } : null);
    if (!anterior) return;
    const depois = await estoque(env, babyId);
    for (const s of Object.values(depois)) {
      const a = anterior[s.id];
      if (!a) continue;
      const acabou = s.qty <= 0 && a.qty > 0;
      const baixou = s.qty < s.min_qty && a.qty >= a.min_qty;
      if (acabou || baixou) {
        avisar(babyId, 'estoque', {
          title: `🛒 ${s.name.slice(0, 28)} ${acabou ? 'acabou' : 'acabando'}`,
          body: `Restam ${s.qty} ${s.unit || 'un'} (mínimo ${s.min_qty}).${s.buyer_id ? '' : ' Ninguém assumiu a compra.'}`,
          aba: 'mural', tag: `estoque-${s.id}`,
          ...(s.buyer_id ? {} : {
            actions: [{ action: 'compro', title: '🙋 Eu compro' }, { action: 'abrir', title: 'Ver mural' }],
            acoes: { compro: { api: { method: 'PUT', path: `/babies/${babyId}/supplies/${s.id}`, body: { buyer_id: '$eu' } }, ok: { title: `🛒 Combinado: você compra ${s.name.slice(0, 28)}`, body: 'Os outros cuidadores verão no mural.' } } },
          }),
        });
      }
    }
  }

  // CRUD genérico dos recursos filhos
  const mr = sub.match(/^\/(events|growth|supplies|notes|appointments)(?:\/([A-Za-z0-9_-]+))?$/);
  if (mr) {
    const [, res, itemId] = mr;
    if (!pode('editor')) return erro('Seu acesso é somente leitura. Peça a um administrador para mudar.', 403);
    if (res === 'events' && body.type && !TIPOS_EVENTO.includes(body.type)) return erro('Tipo de registro inválido.');

    if (method === 'POST' && !itemId) {
      const id = idValido(body.id) ? body.id : crypto.randomUUID();
      if (RES[res].obrig.some((c) => body[c] == null || body[c] === '')) return erro('Preencha os campos obrigatórios.');
      const vals = limparValores(res, body);
      const cols = Object.keys(vals);
      const t = agora();
      const stmts = [env.DB.prepare(`INSERT INTO ${res} (id, baby_id, user_id, created_at, updated_at, ${cols.join(', ')}) VALUES (?, ?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`)
        .bind(id, babyId, me.id, t, t, ...Object.values(vals))];
      const antesEstoque = res === 'events' && body.type === 'fralda' ? await estoque(env, babyId) : null;
      if (res === 'events' && body.type === 'fralda') stmts.push(ajusteEstoque(env, babyId, 'fralda', -1));
      await env.DB.batch(stmts);
      await aposGravar(res, 'POST', { id, ...body }, null, antesEstoque);
      return json({ id });
    }
    if (itemId && method === 'PUT') {
      const vals = limparValores(res, body);
      const cols = Object.keys(vals);
      if (!cols.length) return erro('Nada para atualizar.');
      const antes = await env.DB.prepare(`SELECT * FROM ${res} WHERE id = ? AND baby_id = ?`).bind(itemId, babyId).first();
      const r = await env.DB.prepare(`UPDATE ${res} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND baby_id = ?`)
        .bind(...Object.values(vals), agora(), itemId, babyId).run();
      if (!r.meta.changes) return erro('Registro não encontrado.', 404);
      await aposGravar(res, 'PUT', { ...antes, ...body }, antes, null);
      return json({ ok: true });
    }
    if (itemId && method === 'DELETE') {
      const atual = await env.DB.prepare(`SELECT * FROM ${res} WHERE id = ? AND baby_id = ?`).bind(itemId, babyId).first();
      if (!atual) return json({ ok: true });
      const stmts = [env.DB.prepare(`DELETE FROM ${res} WHERE id = ? AND baby_id = ?`).bind(itemId, babyId)];
      if (res === 'events' && atual.type === 'fralda') stmts.push(ajusteEstoque(env, babyId, 'fralda', 1));
      await env.DB.batch(stmts);
      return json({ ok: true });
    }
  }

  return erro('Rota não encontrada.', 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url, ctx);
      } catch (e) {
        return erro(e instanceof Error ? e.message : 'Erro interno.', e?.status || 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
  /** Cron Trigger (wrangler.toml): lembretes de mamada, cronômetro esquecido e consultas. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      await garantirEsquema(env);
      await lembretes(env);
    })());
  },
};
