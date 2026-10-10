/**
 * Ninho · Painel do desenvolvedor (Worker separado do app).
 *
 * Lê o mesmo D1 do app, mas só devolve NÚMEROS AGREGADOS: nenhuma rota deste Worker
 * seleciona nome, e-mail, foto, texto de recado ou qualquer dado de bebê. Grupos com
 * menos de K pessoas (região, aparelho) são somados em "outros" para evitar reidentificação.
 *
 * Acesso: contas próprias de administrador (tabela painel_admins), sessão em cookie
 * HttpOnly/Secure/SameSite=Strict, limite de tentativas e código de configuração inicial.
 */

const K_ANON = 3;
const SESSAO_HORAS = 12;
const PBKDF2_ITER = 100000;
const DEMO = '%@exemplo.ninho';
const enc = new TextEncoder();

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});
const erro = (msg, status = 400) => json({ error: msg }, status);
const agora = () => new Date().toISOString();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const aleatorio = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/* ---------------- Senhas, segredos e sessão ---------------- */
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
async function segredo(env, chave) {
  await env.DB.prepare('INSERT OR IGNORE INTO secrets (key, value) VALUES (?, ?)').bind(chave, aleatorio()).run();
  return (await env.DB.prepare('SELECT value FROM secrets WHERE key = ?').bind(chave).first()).value;
}
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PAINEL_SECRET || (await segredo(env, 'painel_auth'))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
const marca = (salt) => salt.replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
async function cookieSessao(env, admin) {
  const payload = `${admin.id}.${Date.now() + SESSAO_HORAS * 3600_000}.${marca(admin.salt)}`;
  const token = `${payload}.${await hmac(env, payload)}`;
  return `painel_sessao=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSAO_HORAS * 3600}`;
}
const cookieSair = 'painel_sessao=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
async function adminDaSessao(env, req) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)painel_sessao=([^;]+)/);
  const partes = m ? m[1].split('.') : [];
  if (partes.length !== 4) return null;
  const [id, exp, mc, sig] = partes;
  if (Number(exp) < Date.now() || !iguais(sig, await hmac(env, `${id}.${exp}.${mc}`))) return null;
  const a = await env.DB.prepare('SELECT * FROM painel_admins WHERE id = ?').bind(id).first();
  return a && marca(a.salt) === mc ? a : null;
}
const publico = (a) => ({ id: a.id, nome: a.nome, email: a.email, dono: !!a.dono, ultimo_acesso: a.ultimo_acesso });

/* ---------------- Limite de tentativas (mesma tabela do app) ---------------- */
async function bloqueado(env, chave, limite) {
  const r = await env.DB.prepare('SELECT count, window_start FROM login_attempts WHERE key = ?').bind(chave).first();
  if (r && Date.parse(r.window_start) > Date.now() - 15 * 60_000 && r.count >= limite) return Math.ceil((Date.parse(r.window_start) + 15 * 60_000 - Date.now()) / 60_000);
  return 0;
}
async function falha(env, chave) {
  const limite = new Date(Date.now() - 15 * 60_000).toISOString();
  await env.DB.prepare(`INSERT INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END`)
    .bind(chave, agora(), limite, limite).run();
}

/* ---------------- Esquema (só o que o painel precisa; o app cria o resto) ---------------- */
let esquemaOk = false;
async function garantirEsquema(env) {
  if (esquemaOk) return;
  await env.DB.batch([
    'CREATE TABLE IF NOT EXISTS painel_admins (id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, dono INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL, ultimo_acesso TEXT)',
    'CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS atividade (dia TEXT NOT NULL, uid TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, coorte TEXT, pais TEXT, regiao TEXT, plataforma TEXT, modo TEXT, PRIMARY KEY (dia, uid))',
    'CREATE TABLE IF NOT EXISTS req_hora (hora TEXT NOT NULL, rota TEXT NOT NULL, classe TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ms_total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (hora, rota, classe))',
    'CREATE TABLE IF NOT EXISTS erros (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, origem TEXT NOT NULL, rota TEXT, status INTEGER, mensagem TEXT, versao TEXT, plataforma TEXT)',
    'CREATE TABLE IF NOT EXISTS contadores (dia TEXT NOT NULL, chave TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, chave))',
    'CREATE TABLE IF NOT EXISTS sistema (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS uso (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, baby_id TEXT, evento TEXT NOT NULL, valor TEXT, at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS origem_cadastro (uid TEXT PRIMARY KEY, dia TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, pais TEXT, regiao TEXT, cidade TEXT, plataforma TEXT, tipo TEXT, navegador TEXT, modelo TEXT, modo TEXT)',
  ].map((s) => env.DB.prepare(s)));
  for (const m of ['ALTER TABLE atividade ADD COLUMN cidade TEXT', 'ALTER TABLE atividade ADD COLUMN tipo TEXT']) {
    try { await env.DB.prepare(m).run(); } catch { /* coluna já existe */ }
  }
  esquemaOk = true;
}

/* ---------------- Métricas (somente agregados) ---------------- */
const brtMs = (ms = Date.now()) => ms - 3 * 3600_000;
const diaBRT = (ms = Date.now()) => new Date(brtMs(ms)).toISOString().slice(0, 10);
const somaDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const inicioDiaISO = (dia) => new Date(Date.parse(`${dia}T03:00:00Z`)).toISOString(); // 00:00 de Brasília

/** Agrupa linhas com menos de K pessoas em "Outros" (anonimato k). */
function anonimizar(linhas, rotulo) {
  const ok = linhas.filter((l) => l.n >= K_ANON).sort((a, b) => b.n - a.n);
  const resto = linhas.filter((l) => l.n < K_ANON).reduce((s, l) => s + l.n, 0);
  if (resto) ok.push({ [rotulo]: `Outros (grupos com menos de ${K_ANON} pessoas)`, n: resto, agrupado: true });
  return ok;
}

async function metricas(env, dias) {
  const hoje = diaBRT();
  const ini = somaDias(hoje, -(dias - 1));
  const iniAnt = somaDias(ini, -dias);
  const iniISO = inicioDiaISO(ini);
  const iniAntISO = inicioDiaISO(iniAnt);
  const h24 = new Date(Date.now() - 24 * 3600_000).toISOString();
  const hora48 = new Date(brtMs(Date.now() - 47 * 3600_000)).toISOString().slice(0, 13);
  const REAL = `SELECT id FROM users WHERE email NOT LIKE '${DEMO}'`;
  const FAM = `SELECT DISTINCT baby_id FROM members WHERE user_id IN (${REAL})`;
  const d7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const d28 = new Date(Date.now() - 28 * 86400_000).toISOString();
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);

  const r = await env.DB.batch([
    /* 0 */ q(`SELECT COUNT(*) AS total, SUM(created_at >= ?) AS novos, SUM(created_at >= ? AND created_at < ?) AS novos_ant FROM users WHERE email NOT LIKE '${DEMO}'`, iniISO, iniAntISO, iniISO),
    /* 1 */ q(`SELECT
              (SELECT COUNT(DISTINCT uid) FROM atividade WHERE demo = 0 AND dia = ?) AS dau,
              (SELECT COUNT(DISTINCT uid) FROM atividade WHERE demo = 0 AND dia = ?) AS dau_ontem,
              (SELECT COUNT(DISTINCT uid) FROM atividade WHERE demo = 0 AND dia >= ?) AS wau,
              (SELECT COUNT(DISTINCT uid) FROM atividade WHERE demo = 0 AND dia >= ? AND dia < ?) AS wau_ant,
              (SELECT COUNT(DISTINCT uid) FROM atividade WHERE demo = 0 AND dia >= ?) AS mau,
              (SELECT COUNT(DISTINCT uid) FROM atividade WHERE demo = 0 AND dia >= ?) AS ativos_periodo,
              (SELECT COUNT(DISTINCT uid) FROM atividade WHERE demo = 0 AND dia >= ? AND dia < ?) AS ativos_periodo_ant,
              (SELECT MIN(dia) FROM atividade) AS desde`,
      hoje, somaDias(hoje, -1), somaDias(hoje, -6), somaDias(hoje, -13), somaDias(hoje, -6), somaDias(hoje, -29), ini, iniAnt, ini),
    /* 2 */ q('SELECT dia, COUNT(DISTINCT uid) AS n FROM atividade WHERE demo = 0 AND dia >= ? GROUP BY dia ORDER BY dia', ini),
    /* 3 */ q(`SELECT date(created_at, '-3 hours') AS dia, COUNT(*) AS n FROM users WHERE email NOT LIKE '${DEMO}' AND created_at >= ? GROUP BY dia`, iniISO),
    /* 4 */ q(`SELECT date(created_at, '-3 hours') AS dia, COUNT(*) AS n FROM events WHERE created_at >= ? AND user_id IN (${REAL}) GROUP BY dia`, iniISO),
    /* 5 */ q(`SELECT
              (SELECT COUNT(DISTINCT m.baby_id) FROM members m WHERE m.user_id IN (${REAL})) AS familias,
              (SELECT COUNT(DISTINCT baby_id) FROM events WHERE created_at >= ? AND user_id IN (${REAL})) AS familias_ativas,
              (SELECT COUNT(DISTINCT baby_id) FROM events WHERE created_at >= ? AND created_at < ? AND user_id IN (${REAL})) AS familias_ativas_ant,
              (SELECT ROUND(AVG(n), 2) FROM (SELECT COUNT(*) AS n FROM members WHERE baby_id IN (SELECT baby_id FROM members WHERE user_id IN (${REAL})) GROUP BY baby_id)) AS cuidadores_por_familia,
              (SELECT COUNT(*) FROM events WHERE created_at >= ? AND user_id IN (${REAL})) AS registros,
              (SELECT COUNT(*) FROM events WHERE created_at >= ? AND created_at < ? AND user_id IN (${REAL})) AS registros_ant,
              (SELECT COUNT(DISTINCT user_id) FROM push_subs WHERE user_id IN (${REAL})) AS com_push,
              (SELECT COUNT(*) FROM users WHERE email LIKE '${DEMO}') AS contas_exemplo`,
      iniISO, iniAntISO, iniISO, iniISO, iniAntISO, iniISO),
    /* 6 */ q(`SELECT hora, SUM(n) AS n, SUM(CASE WHEN classe = '5xx' THEN n ELSE 0 END) AS e5, SUM(CASE WHEN classe = '4xx' THEN n ELSE 0 END) AS e4, SUM(ms_total) AS ms FROM req_hora WHERE hora >= ? GROUP BY hora ORDER BY hora`, hora48),
    /* 7 */ q(`SELECT rota, SUM(n) AS n, SUM(CASE WHEN classe = '5xx' THEN n ELSE 0 END) AS e5, SUM(CASE WHEN classe = '4xx' THEN n ELSE 0 END) AS e4, ROUND(SUM(ms_total) * 1.0 / SUM(n)) AS ms FROM req_hora WHERE hora >= ? GROUP BY rota ORDER BY n DESC LIMIT 15`, ini),
    /* 8 */ q('SELECT pais, regiao, COUNT(DISTINCT uid) AS n FROM atividade WHERE demo = 0 AND dia >= ? GROUP BY pais, regiao', ini),
    /* 9 */ q('SELECT plataforma, modo, COUNT(DISTINCT uid) AS n FROM atividade WHERE demo = 0 AND dia >= ? GROUP BY plataforma, modo', ini),
    /* 10 */ q(`SELECT evento, COUNT(*) AS vezes, COUNT(DISTINCT user_id) AS pessoas FROM uso WHERE at >= ? AND user_id IN (${REAL}) GROUP BY evento`, iniISO),
    /* 11 */ q(`SELECT type AS tipo, COUNT(*) AS n FROM events WHERE created_at >= ? AND user_id IN (${REAL}) GROUP BY type ORDER BY n DESC`, iniISO),
    /* 12 */ q(`SELECT coorte, CAST((julianday(dia) - julianday(coorte)) / 7 AS INTEGER) AS semana, COUNT(DISTINCT uid) AS n FROM atividade WHERE demo = 0 AND coorte >= ? GROUP BY coorte, semana`, somaDias(hoje, -63)),
    /* 13 */ q(`SELECT date(substr(created_at, 1, 10), 'weekday 0', '-6 days') AS coorte, COUNT(*) AS n FROM users WHERE email NOT LIKE '${DEMO}' AND created_at >= ? GROUP BY coorte`, inicioDiaISO(somaDias(hoje, -70))),
    /* 14 */ q('SELECT origem, rota, status, mensagem, COUNT(*) AS n, MAX(at) AS ultimo, MAX(versao) AS versao, group_concat(DISTINCT plataforma) AS plataformas FROM erros WHERE at >= ? GROUP BY origem, rota, status, mensagem ORDER BY n DESC LIMIT 40', iniISO),
    /* 15 */ q("SELECT date(at, '-3 hours') AS dia, origem, COUNT(*) AS n FROM erros WHERE at >= ? GROUP BY dia, origem", iniISO),
    /* 16 */ q('SELECT origem, COUNT(*) AS n FROM erros WHERE at >= ? GROUP BY origem', h24),
    /* 17 */ q('SELECT dia, chave, n FROM contadores WHERE dia >= ?', ini),
    /* 18 */ q('SELECT chave, valor, at FROM sistema'),
    /* 19 */ q(`SELECT (SELECT COUNT(*) FROM events) AS registros, (SELECT COUNT(*) FROM babies) AS bebes, (SELECT COUNT(*) FROM users) AS contas,
                     (SELECT COUNT(*) FROM photos) AS fotos, (SELECT COUNT(*) FROM push_subs) AS aparelhos_push, (SELECT COUNT(*) FROM erros) AS erros`),
    /* 20 */ q(`SELECT SUM(n) AS n, SUM(CASE WHEN classe = '5xx' THEN n ELSE 0 END) AS e5, SUM(ms_total) AS ms FROM req_hora WHERE hora >= ?`, new Date(brtMs(Date.now() - 23 * 3600_000)).toISOString().slice(0, 13)),
    /* 21 */ q(`SELECT SUM(n) AS n, SUM(CASE WHEN classe = '5xx' THEN n ELSE 0 END) AS e5 FROM req_hora WHERE hora >= ?`, new Date(brtMs()).toISOString().slice(0, 13)),
    /* 22 */ q('SELECT dia, COUNT(DISTINCT uid) AS n FROM atividade WHERE demo = 0 AND dia >= ? AND dia < ? GROUP BY dia', somaDias(hoje, -8), hoje),
    /* 23 */ q('SELECT pais, regiao, cidade, COUNT(DISTINCT uid) AS n FROM atividade WHERE demo = 0 AND dia >= ? GROUP BY pais, regiao, cidade', ini),
    /* 24 */ q('SELECT tipo, COUNT(DISTINCT uid) AS n FROM atividade WHERE demo = 0 AND dia >= ? GROUP BY tipo', ini),
    /* 25 */ q('SELECT pais, regiao, cidade, plataforma, tipo, navegador, modelo, modo, COUNT(*) AS n FROM origem_cadastro WHERE demo = 0 AND dia >= ? GROUP BY pais, regiao, cidade, plataforma, tipo, navegador, modelo, modo', ini),
    /* 26 */ q(`SELECT COUNT(*) AS cadastros,
              SUM(EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id)) AS vinculados,
              SUM(EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.id)) AS primeiro_registro,
              SUM((SELECT COUNT(DISTINCT date(e.created_at, '-3 hours')) FROM events e WHERE e.user_id = u.id) >= 3) AS habito,
              SUM(EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id AND (SELECT COUNT(*) FROM members m2 WHERE m2.baby_id = m.baby_id) >= 2)) AS familia_2,
              AVG((SELECT MAX(0, (julianday(MIN(e.created_at)) - julianday(u.created_at)) * 24) FROM events e WHERE e.user_id = u.id AND e.created_at >= u.created_at)) AS horas_ate_1o
            FROM users u WHERE u.email NOT LIKE '${DEMO}' AND u.created_at >= ?`, iniISO),
    /* 27 */ q(`SELECT CAST(strftime('%w', created_at, '-3 hours') AS INTEGER) AS dow, CAST(strftime('%H', created_at, '-3 hours') AS INTEGER) AS h, COUNT(*) AS n FROM events WHERE created_at >= ? AND user_id IN (${REAL}) GROUP BY dow, h`, iniISO),
    /* 28 */ q(`SELECT (SELECT COUNT(*) FROM (${FAM})) AS familias,
              (SELECT COUNT(DISTINCT baby_id) FROM events WHERE baby_id IN (${FAM})) AS rotina,
              (SELECT COUNT(DISTINCT baby_id) FROM supplies WHERE baby_id IN (${FAM})) AS mural,
              (SELECT COUNT(DISTINCT baby_id) FROM notes WHERE baby_id IN (${FAM})) AS recados,
              (SELECT COUNT(*) FROM (SELECT baby_id FROM growth WHERE baby_id IN (${FAM}) GROUP BY baby_id HAVING COUNT(*) >= 2)) AS crescimento,
              (SELECT COUNT(DISTINCT baby_id) FROM appointments WHERE baby_id IN (${FAM})) AS consultas,
              (SELECT COUNT(DISTINCT baby_id) FROM vaccines WHERE baby_id IN (${FAM})) AS vacinas,
              (SELECT COUNT(*) FROM photos WHERE kind = 'baby' AND id IN (${FAM})) AS foto,
              (SELECT COUNT(DISTINCT baby_id) FROM uso WHERE evento = 'pdf_gerado' AND baby_id IN (${FAM})) AS pdf,
              (SELECT COUNT(DISTINCT m.baby_id) FROM members m JOIN push_subs p ON p.user_id = m.user_id WHERE m.baby_id IN (${FAM})) AS notificacoes,
              (SELECT COUNT(*) FROM (SELECT baby_id FROM members WHERE baby_id IN (${FAM}) GROUP BY baby_id HAVING COUNT(*) >= 2)) AS convidou`),
    /* 29 */ q(`SELECT baby_id, SUM(created_at >= ?) AS r7, SUM(created_at < ?) AS rant FROM events WHERE created_at >= ? AND baby_id IN (${FAM}) GROUP BY baby_id`, d7, d7, d28),
    /* 30 */ q(`SELECT CASE WHEN endpoint LIKE '%apple.com%' THEN 'Apple (iPhone, iPad, Mac)' WHEN endpoint LIKE '%googleapis%' THEN 'Google (Android, Chrome)'
              WHEN endpoint LIKE '%mozilla%' THEN 'Mozilla (Firefox)' WHEN endpoint LIKE '%windows%' OR endpoint LIKE '%microsoft%' THEN 'Microsoft (Edge)' ELSE 'Outro serviço' END AS servico,
              COUNT(*) AS n FROM push_subs WHERE user_id IN (${REAL}) GROUP BY servico`),
    /* 31 */ q(`SELECT date(at, '-3 hours') AS dia, SUM(evento = 'notif_enviada') AS enviadas, SUM(evento IN ('notif_clique', 'notif_acao')) AS abertas FROM uso WHERE at >= ? AND evento IN ('notif_enviada', 'notif_clique', 'notif_acao') AND user_id IN (${REAL}) GROUP BY dia`, iniISO),
    /* 32 */ q(`SELECT COUNT(*) AS n FROM origem_cadastro WHERE demo = 0`),
  ]);
  const R = r.map((x) => x.results);

  // Séries diárias completas (dias sem dado = 0)
  const diasLista = Array.from({ length: dias }, (_, i) => somaDias(ini, i));
  const mapa = (rows) => Object.fromEntries(rows.map((x) => [x.dia, x.n]));
  const [mAt, mCad, mReg] = [mapa(R[2]), mapa(R[3]), mapa(R[4])];
  const serie = diasLista.map((d) => ({ dia: d, ativos: mAt[d] ?? 0, cadastros: mCad[d] ?? 0, registros: mReg[d] ?? 0 }));

  // Regiões e aparelhos com anonimato k
  const regioes = anonimizar(R[8].map((x) => ({ regiao: x.pais === 'BR' ? x.regiao || 'Brasil (estado não identificado)' : `${x.pais || '??'}${x.regiao ? ` · ${x.regiao}` : ''}`, n: x.n })), 'regiao');
  const porPais = {};
  for (const x of R[8]) porPais[x.pais || '??'] = (porPais[x.pais || '??'] ?? 0) + x.n;
  const paises = anonimizar(Object.entries(porPais).map(([pais, n]) => ({ pais, n })), 'pais');
  const porPlat = {};
  let instalados = 0;
  let navegador = 0;
  for (const x of R[9]) {
    porPlat[x.plataforma || 'Outro'] = (porPlat[x.plataforma || 'Outro'] ?? 0) + x.n;
    if (x.modo === 'app') instalados += x.n; else navegador += x.n;
  }
  const plataformas = anonimizar(Object.entries(porPlat).map(([plataforma, n]) => ({ plataforma, n })), 'plataforma');

  // Retenção por coorte semanal de cadastro
  const tamanhos = Object.fromEntries(R[13].map((x) => [x.coorte, x.n]));
  const coortes = Object.keys(tamanhos).sort().reverse().slice(0, 8).map((c) => {
    const semanas = [0, 1, 2, 3, 4].map((s) => R[12].find((x) => x.coorte === c && x.semana === s)?.n ?? null);
    return { coorte: c, n: tamanhos[c], semanas: semanas.map((v, s) => (somaDias(c, s * 7) > hoje ? null : v == null ? 0 : v)) };
  });

  // Cidades (ativos) e origem dos cadastros, sempre com anonimato k
  const nomeLocal = (x) => (x.cidade ? `${x.cidade}${x.regiao ? ` · ${x.regiao}` : ''}` : `${x.regiao || 'local não identificado'} (cidade não identificada)`) + (x.pais && x.pais !== 'BR' ? ` · ${x.pais}` : '');
  const cidades = anonimizar(R[23].map((x) => ({ cidade: nomeLocal(x), n: x.n })), 'cidade');
  const tipos_aparelho = anonimizar(R[24].map((x) => ({ tipo: x.tipo || 'Não identificado (antes da medição)', n: x.n })), 'tipo');
  const somaPor = (rows, f) => { const m = {}; for (const x of rows) { const kk = f(x); m[kk] = (m[kk] ?? 0) + x.n; } return Object.entries(m).map(([kk, n]) => ({ k: kk, n })); };
  const dim = (rows, f, rot) => anonimizar(somaPor(rows, f).map((x) => ({ [rot]: x.k, n: x.n })), rot);
  const origem = {
    total: R[25].reduce((t, x) => t + x.n, 0),
    medidos_total: R[32][0]?.n ?? 0,
    paises: dim(R[25], (x) => x.pais || '??', 'pais'),
    estados: dim(R[25], (x) => (x.pais === 'BR' ? x.regiao || 'Brasil (estado não identificado)' : `${x.pais || '??'}${x.regiao ? ` · ${x.regiao}` : ''}`), 'regiao'),
    cidades: dim(R[25], (x) => nomeLocal(x), 'cidade'),
    sistemas: dim(R[25], (x) => x.plataforma || 'Outro', 'plataforma'),
    tipos: dim(R[25], (x) => x.tipo || 'Outro', 'tipo'),
    navegadores: dim(R[25], (x) => x.navegador || 'Outro', 'navegador'),
    modelos: dim(R[25], (x) => x.modelo || 'Outro', 'modelo'),
    modo: dim(R[25], (x) => (x.modo === 'app' ? 'App instalado' : 'Navegador'), 'modo'),
  };

  // Funil de ativação das contas criadas no período
  const f0 = R[26][0] ?? {};
  const funil = { cadastros: f0.cadastros ?? 0, vinculados: f0.vinculados ?? 0, primeiro_registro: f0.primeiro_registro ?? 0, habito: f0.habito ?? 0, familia_2: f0.familia_2 ?? 0, horas_ate_1o: f0.horas_ate_1o == null ? null : Math.round(f0.horas_ate_1o * 10) / 10 };

  // Saúde das famílias: intensidade de uso nos últimos 7 dias e quem esfriou
  const a28 = R[28][0] ?? {};
  const saude = { intensa: 0, regular: 0, leve: 0, esfriando: 0, sem_registro: Math.max(0, (a28.familias ?? 0) - (a28.rotina ?? 0)), total: a28.familias ?? 0 };
  for (const x of R[29]) {
    const porDia = x.r7 / 7;
    if (x.r7 === 0) { if (x.rant > 0) saude.esfriando++; } else if (porDia >= 7) saude.intensa++; else if (porDia >= 2) saude.regular++; else saude.leve++;
  }
  saude.paradas = Math.max(0, saude.total - saude.sem_registro - saude.intensa - saude.regular - saude.leve - saude.esfriando);
  const servicos_push = anonimizar(R[30].map((x) => ({ servico: x.servico, n: x.n })), 'servico');
  const mNot = Object.fromEntries(R[31].map((x) => [x.dia, x]));
  const notificacoes = diasLista.map((dd) => ({ dia: dd, enviadas: mNot[dd]?.enviadas ?? 0, abertas: mNot[dd]?.abertas ?? 0 }));

  const sistema = Object.fromEntries(R[18].map((x) => [x.chave, { valor: x.valor, at: x.at }]));
  const erros24 = Object.fromEntries(R[16].map((x) => [x.origem, x.n]));
  const req24 = R[20][0] ?? {};
  const reqHora = R[21][0] ?? {};
  const contadores = {};
  for (const x of R[17]) contadores[x.chave] = (contadores[x.chave] ?? 0) + x.n;
  const k = { ...R[0][0], ...R[1][0], ...R[5][0] };

  /* ---------- Alertas e leituras automáticas ---------- */
  const alertas = [];
  const pct = (a, b) => (b ? a / b : 0);
  const taxa24 = pct(req24.e5 ?? 0, req24.n ?? 0);
  if ((req24.n ?? 0) >= 20 && taxa24 >= 0.02) alertas.push({ nivel: 'critico', titulo: `Taxa de erro do servidor em ${(taxa24 * 100).toFixed(1)}% (24 h)`, detalhe: `${req24.e5} de ${req24.n} requisições falharam com erro 5xx.`, acao: 'Veja em Erros quais rotas falham e se começou após a última versão publicada.' });
  if ((reqHora.n ?? 0) >= 10 && pct(reqHora.e5 ?? 0, reqHora.n) >= 0.05) alertas.push({ nivel: 'critico', titulo: 'Pico de erros na última hora', detalhe: `${reqHora.e5} de ${reqHora.n} requisições com erro 5xx nesta hora.`, acao: 'Confira o log do Worker no Cloudflare e reverta a última publicação se necessário.' });
  const cron = sistema.cron_ultimo;
  const minCron = cron ? (Date.now() - Date.parse(cron.at)) / 60000 : Infinity;
  if (!cron) alertas.push({ nivel: 'atencao', titulo: 'Lembretes automáticos ainda não rodaram', detalhe: 'Nenhum registro do agendamento (Cron) a cada 15 min.', acao: 'Em Cloudflare → ninho → Settings → Triggers, confira se o Cron "*/15 * * * *" está ativo.' });
  else if (cron.valor === 'erro') alertas.push({ nivel: 'critico', titulo: 'A última rodada dos lembretes falhou', detalhe: `Em ${new Date(cron.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`, acao: 'Veja o erro de origem "cron" na tabela de erros.' });
  else if (minCron > 40) alertas.push({ nivel: 'critico', titulo: `Lembretes parados há ${Math.round(minCron)} min`, detalhe: 'O agendamento deveria rodar a cada 15 minutos; avisos de mamada e consulta não estão saindo.', acao: 'Confira os Cron Triggers do Worker ninho.' });
  if ((erros24.app ?? 0) >= 5) alertas.push({ nivel: 'atencao', titulo: `${erros24.app} erros de tela no app (24 h)`, detalhe: 'Falhas de JavaScript reportadas pelos aparelhos.', acao: 'Agrupe por mensagem e versão em Erros; priorize a que mais se repete.' });
  if ((erros24.push ?? 0) >= 5) alertas.push({ nivel: 'atencao', titulo: `${erros24.push} falhas de envio de notificação (24 h)`, detalhe: 'O serviço de push recusou ou não respondeu.', acao: 'Se for um único serviço (ex.: Apple), verifique as chaves VAPID e o status do serviço.' });
  const media7 = R[22].length ? R[22].reduce((s, x) => s + x.n, 0) / 7 : 0;
  if (media7 >= 3 && k.dau_ontem < media7 * 0.7) alertas.push({ nivel: 'atencao', titulo: `Ativos caíram ontem: ${k.dau_ontem} × média ${media7.toFixed(1)}`, detalhe: `Queda de ${Math.round((1 - k.dau_ontem / media7) * 100)}% em relação à média dos 7 dias anteriores.`, acao: 'Cruze com Erros e Estabilidade do mesmo dia; se não houve falha, verifique se é fim de semana ou feriado.' });
  if (media7 >= 3 && k.dau_ontem > media7 * 1.3) alertas.push({ nivel: 'positivo', titulo: `Ativos subiram ontem: ${k.dau_ontem} × média ${media7.toFixed(1)}`, detalhe: `Alta de ${Math.round((k.dau_ontem / media7 - 1) * 100)}%.`, acao: 'Identifique a origem (indicação, divulgação) para repetir.' });
  const lat = req24.n ? req24.ms / req24.n : 0;
  if ((req24.n ?? 0) >= 20 && lat > 800) alertas.push({ nivel: 'atencao', titulo: `Servidor lento: ${Math.round(lat)} ms em média (24 h)`, detalhe: 'Acima de 800 ms a experiência no celular piora.', acao: 'Veja em Estabilidade quais rotas têm o maior tempo médio.' });
  if ((contadores.logins_falhos ?? 0) >= 30) alertas.push({ nivel: 'atencao', titulo: `${contadores.logins_falhos} tentativas de login com senha errada no período`, detalhe: 'Pode ser esquecimento de senha ou tentativa de invasão (o app já bloqueia após 5 erros).', acao: 'Se concentrar em poucos dias, considere configurar a recuperação por e-mail.' });
  if (saude.total >= 3 && saude.esfriando >= 1) alertas.push({ nivel: saude.esfriando / saude.total >= 0.2 ? 'atencao' : 'info', titulo: `${saude.esfriando} família(s) pararam de registrar nos últimos 7 dias`, detalhe: `Registravam nas 3 semanas anteriores. Representam ${Math.round((saude.esfriando / saude.total) * 100)}% das famílias.`, acao: 'Veja Engajamento: se coincidir com erros ou nova versão, investigue; senão, envie um lembrete ou mensagem de reengajamento.' });
  if (funil.cadastros >= 5 && funil.primeiro_registro / funil.cadastros < 0.5) alertas.push({ nivel: 'atencao', titulo: `Só ${Math.round((funil.primeiro_registro / funil.cadastros) * 100)}% dos novos usuários fizeram o 1º registro`, detalhe: `${funil.primeiro_registro} de ${funil.cadastros} contas criadas no período.`, acao: 'Revise o primeiro acesso (cadastro do bebê → primeiro registro) e envie o vídeo "modo de uso" logo após o convite.' });
  if (funil.cadastros >= 5 && funil.vinculados / funil.cadastros < 0.7) alertas.push({ nivel: 'atencao', titulo: `${funil.cadastros - funil.vinculados} contas novas sem bebê vinculado`, detalhe: 'Criaram conta, mas não cadastraram bebê nem aceitaram convite.', acao: 'Verifique se o código/link de convite está chegando certo e se a tela de cadastro do bebê está clara.' });
  if (k.total > 0 && !(k.novos > 0) && dias >= 7) alertas.push({ nivel: 'info', titulo: 'Nenhum cadastro novo no período', detalhe: `${k.total} contas no total.`, acao: 'Normal durante piloto fechado; fora dele, revise a divulgação e o primeiro acesso.' });

  return {
    gerado_em: agora(), dias, periodo: { ini, fim: hoje }, desde_atividade: k.desde,
    kpis: {
      usuarios: k.total ?? 0, novos: k.novos ?? 0, novos_ant: k.novos_ant ?? 0,
      dau: k.dau ?? 0, dau_ontem: k.dau_ontem ?? 0, wau: k.wau ?? 0, wau_ant: k.wau_ant ?? 0, mau: k.mau ?? 0,
      ativos_periodo: k.ativos_periodo ?? 0, ativos_periodo_ant: k.ativos_periodo_ant ?? 0,
      familias: k.familias ?? 0, familias_ativas: k.familias_ativas ?? 0, familias_ativas_ant: k.familias_ativas_ant ?? 0,
      cuidadores_por_familia: k.cuidadores_por_familia ?? 0, registros: k.registros ?? 0, registros_ant: k.registros_ant ?? 0,
      com_push: k.com_push ?? 0, contas_exemplo: k.contas_exemplo ?? 0,
      req24: req24.n ?? 0, erros5xx24: req24.e5 ?? 0, latencia24: Math.round(lat),
    },
    serie, estabilidade: { horas: R[6], rotas: R[7] },
    regioes, paises, plataformas, instalacao: { app: instalados, navegador }, cidades, tipos_aparelho, origem,
    funil, calor: R[27], adocao: a28, saude, servicos_push, notificacoes,
    uso: R[10], tipos: R[11], coortes,
    erros: { lista: R[14], por_dia: R[15], ultimas24: erros24 },
    contadores, sistema, banco: R[19][0], alertas,
  };
}

/* ---------------- Rotas ---------------- */
async function api(req, env, url) {
  await garantirEsquema(env);
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  if (method !== 'GET' && req.headers.get('x-painel') !== '1') return erro('Requisição inválida.', 403); // proteção extra contra CSRF
  const body = method === 'POST' || method === 'PUT' ? await req.json().catch(() => ({})) : {};
  const totalAdmins = (await env.DB.prepare('SELECT COUNT(*) AS n FROM painel_admins').first()).n;

  if (path === '/estado' && method === 'GET') {
    const a = totalAdmins ? await adminDaSessao(env, req) : null;
    if (!totalAdmins) await segredo(env, 'painel_setup'); // gera o código de configuração inicial
    return json({ configurado: totalAdmins > 0, admin: a ? publico(a) : null });
  }

  // Primeiro acesso: cria o administrador dono com o código de configuração (lido no banco pelo desenvolvedor)
  if (path === '/setup' && method === 'POST') {
    if (totalAdmins) return erro('O painel já foi configurado.', 409);
    const espera = await bloqueado(env, `painelsetup:${ip}`, 5);
    if (espera) return erro(`Muitas tentativas. Tente de novo em ${espera} min.`, 429);
    const codigo = await segredo(env, 'painel_setup');
    if (!iguais(String(body.codigo ?? '').trim(), codigo)) {
      await falha(env, `painelsetup:${ip}`);
      return erro('Código de configuração inválido.', 403);
    }
    const nome = String(body.nome ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const senha = String(body.senha ?? '');
    if (nome.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro('Informe nome e e-mail válidos.');
    if (senha.length < 10) return erro('Use uma senha com pelo menos 10 caracteres.');
    const { salt, hash } = await hashSenha(senha);
    const a = { id: crypto.randomUUID(), nome, email, salt, hash, dono: 1, criado_em: agora(), ultimo_acesso: agora() };
    await env.DB.batch([
      env.DB.prepare('INSERT INTO painel_admins (id, nome, email, salt, hash, dono, criado_em, ultimo_acesso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(a.id, nome, email, salt, hash, 1, a.criado_em, a.ultimo_acesso),
      env.DB.prepare("DELETE FROM secrets WHERE key = 'painel_setup'"),
    ]);
    return json({ admin: publico(a) }, 200, { 'set-cookie': await cookieSessao(env, a) });
  }

  if (path === '/login' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const esperaE = await bloqueado(env, `painel:${email}`, 5);
    const esperaI = await bloqueado(env, `painelip:${ip}`, 20);
    if (esperaE || esperaI) return erro(`Muitas tentativas. Tente de novo em ${Math.max(esperaE, esperaI)} min.`, 429);
    const a = await env.DB.prepare('SELECT * FROM painel_admins WHERE email = ?').bind(email).first();
    const ok = a ? iguais((await hashSenha(String(body.senha ?? ''), a.salt)).hash, a.hash) : false;
    if (!ok) {
      await falha(env, `painel:${email}`);
      await falha(env, `painelip:${ip}`);
      return erro('E-mail ou senha inválidos.', 401);
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE painel_admins SET ultimo_acesso = ? WHERE id = ?').bind(agora(), a.id),
      env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(`painel:${email}`),
    ]);
    return json({ admin: publico(a) }, 200, { 'set-cookie': await cookieSessao(env, a) });
  }

  if (path === '/sair' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookieSair });

  // ---- Daqui para baixo, só administradores logados ----
  const admin = await adminDaSessao(env, req);
  if (!admin) return erro('Sessão expirada. Entre novamente.', 401);

  if (path === '/metricas' && method === 'GET') {
    const dias = Math.min(180, Math.max(7, Number(url.searchParams.get('dias')) || 30));
    return json(await metricas(env, dias));
  }

  if (path === '/senha' && method === 'POST') {
    if (!iguais((await hashSenha(String(body.atual ?? ''), admin.salt)).hash, admin.hash)) return erro('Senha atual incorreta.', 403);
    if (String(body.nova ?? '').length < 10) return erro('Use uma senha com pelo menos 10 caracteres.');
    const { salt, hash } = await hashSenha(String(body.nova));
    await env.DB.prepare('UPDATE painel_admins SET salt = ?, hash = ? WHERE id = ?').bind(salt, hash, admin.id).run();
    return json({ ok: true }, 200, { 'set-cookie': await cookieSessao(env, { ...admin, salt }) });
  }

  if (path === '/admins' && method === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM painel_admins ORDER BY criado_em').all();
    return json({ admins: r.results.map(publico) });
  }
  if (path === '/admins' && method === 'POST') {
    if (!admin.dono) return erro('Só o administrador principal adiciona pessoas.', 403);
    const nome = String(body.nome ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (nome.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro('Informe nome e e-mail válidos.');
    if (await env.DB.prepare('SELECT 1 FROM painel_admins WHERE email = ?').bind(email).first()) return erro('Este e-mail já tem acesso.', 409);
    const senhaTemp = aleatorio(9);
    const { salt, hash } = await hashSenha(senhaTemp);
    await env.DB.prepare('INSERT INTO painel_admins (id, nome, email, salt, hash, dono, criado_em) VALUES (?, ?, ?, ?, ?, 0, ?)').bind(crypto.randomUUID(), nome, email, salt, hash, agora()).run();
    return json({ ok: true, senha_temporaria: senhaTemp });
  }
  const md = path.match(/^\/admins\/([A-Za-z0-9-]+)$/);
  if (md && method === 'DELETE') {
    if (!admin.dono) return erro('Só o administrador principal remove pessoas.', 403);
    if (md[1] === admin.id) return erro('Você não pode remover a si mesmo.', 409);
    await env.DB.prepare('DELETE FROM painel_admins WHERE id = ? AND dono = 0').bind(md[1]).run();
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
