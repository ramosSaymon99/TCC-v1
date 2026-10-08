/**
 * Conta e privacidade (LGPD): limite de tentativas, redefinição de senha, exclusão de conta,
 * exportação de dados e limpeza das contas de exemplo.
 */

export const DOMINIO_DEMO = '@exemplo.ninho';
export const VERSAO_TERMOS = '2026-10';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const agora = () => new Date().toISOString();

/* ---------------- Limite de tentativas ---------------- */
/**
 * Janela fixa de 15 min por chave (e-mail e IP). Retorna os minutos de espera se bloqueado, senão 0.
 * Só falhas contam; um acerto zera o contador do e-mail.
 */
const JANELA_MIN = 15;
export async function bloqueado(env, chaves, limites) {
  const limite = Date.now() - JANELA_MIN * 60_000;
  for (let i = 0; i < chaves.length; i++) {
    const r = await env.DB.prepare('SELECT count, window_start FROM login_attempts WHERE key = ?').bind(chaves[i]).first();
    if (r && Date.parse(r.window_start) > limite && r.count >= limites[i]) {
      return Math.max(1, Math.ceil((Date.parse(r.window_start) + JANELA_MIN * 60_000 - Date.now()) / 60_000));
    }
  }
  return 0;
}
export async function registrarFalha(env, chaves) {
  const limite = new Date(Date.now() - JANELA_MIN * 60_000).toISOString();
  await env.DB.batch(chaves.map((k) => env.DB.prepare(
    `INSERT INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
                                    window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END`,
  ).bind(k, agora(), limite, limite)));
}
export const limparFalhas = (env, chave) => env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(chave).run();

/* ---------------- Redefinição de senha ---------------- */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const codigoCurto = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALFABETO[b % ALFABETO.length]).join('');

/** Guarda só o hash do código/token. `tipo`: 'email' (link, 1 h) ou 'admin' (código, 30 min). */
export async function criarRedefinicao(env, userId, segredo, tipo, criadoPor) {
  const min = tipo === 'email' ? 60 : 30;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').bind(userId),
    env.DB.prepare('INSERT INTO password_resets (token_hash, user_id, kind, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256(segredo), userId, tipo, criadoPor ?? null, new Date(Date.now() + min * 60_000).toISOString(), agora()),
  ]);
}
export async function consumirRedefinicao(env, segredo, userId = null) {
  const r = await env.DB.prepare('SELECT * FROM password_resets WHERE token_hash = ?').bind(await sha256(segredo)).first();
  if (!r || r.used_at || r.expires_at < agora() || (userId && r.user_id !== userId)) return null;
  await env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(agora(), r.token_hash).run();
  return r.user_id;
}

/** Envio de e-mail pelo Resend (opcional). Sem RESEND_API_KEY, o app usa o código gerado por um administrador. */
export const emailConfigurado = (env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM);
export async function enviarEmailRedefinicao(env, para, nome, link) {
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#2b2a33">
    <h2 style="color:#c9566f">Ninho · redefinir senha</h2>
    <p>Olá, ${nome.split(' ')[0].replace(/[<>&"]/g, '')}! Recebemos um pedido para redefinir a sua senha.</p>
    <p><a href="${link}" style="display:inline-block;background:#e0708a;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Criar nova senha</a></p>
    <p style="color:#8f8c99;font-size:13px">O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [para], subject: 'Redefinir sua senha do Ninho', html }),
  });
  return r.ok;
}

/* ---------------- Exclusão de conta ---------------- */
const TABELAS_BEBE = ['events', 'growth', 'supplies', 'notes', 'appointments', 'vaccines', 'invites', 'members'];
async function apagarBebe(env, babyId) {
  await env.DB.batch([
    ...TABELAS_BEBE.map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE baby_id = ?`).bind(babyId)),
    env.DB.prepare("DELETE FROM photos WHERE kind = 'baby' AND id = ?").bind(babyId),
    env.DB.prepare('DELETE FROM babies WHERE id = ?').bind(babyId),
  ]);
}

/**
 * Exclui a conta e os dados pessoais do usuário (nome, e-mail, foto, aparelhos, preferências).
 * - Bebê em que ele é o único cuidador: o perfil do bebê e todo o histórico são apagados.
 * - Bebê compartilhado: o histórico continua com a família ("ex-cuidador"); se ele era o único
 *   administrador, a administração passa para o cuidador mais antigo.
 */
export async function excluirConta(env, userId) {
  const vinculos = (await env.DB.prepare('SELECT baby_id, access FROM members WHERE user_id = ?').bind(userId).all()).results;
  const resumo = { bebesApagados: 0, administracaoTransferida: 0 };
  for (const v of vinculos) {
    const outros = (await env.DB.prepare('SELECT user_id, access FROM members WHERE baby_id = ? AND user_id != ? ORDER BY created_at').bind(v.baby_id, userId).all()).results;
    if (!outros.length) {
      await apagarBebe(env, v.baby_id);
      resumo.bebesApagados++;
      continue;
    }
    if (v.access === 'admin' && !outros.some((o) => o.access === 'admin')) {
      await env.DB.prepare("UPDATE members SET access = 'admin' WHERE baby_id = ? AND user_id = ?").bind(v.baby_id, outros[0].user_id).run();
      resumo.administracaoTransferida++;
    }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM members WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM push_subs WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM notif_prefs WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(userId),
    env.DB.prepare("DELETE FROM photos WHERE kind = 'user' AND id = ?").bind(userId),
    env.DB.prepare('UPDATE supplies SET buyer_id = NULL WHERE buyer_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
  return resumo;
}

/** Contas de exemplo ("Explorar com uma família de exemplo") são apagadas 24 h depois de criadas. */
export async function limparContasDemo(env) {
  const limite = new Date(Date.now() - 24 * 3600_000).toISOString();
  const velhos = (await env.DB.prepare('SELECT id FROM users WHERE email LIKE ? AND created_at < ? LIMIT 200').bind(`%${DOMINIO_DEMO}`, limite).all()).results;
  for (const u of velhos) await excluirConta(env, u.id);
  await env.DB.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(new Date(Date.now() - 86400_000).toISOString()).run();
  await env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?').bind(new Date(Date.now() - 7 * 86400_000).toISOString()).run();
  return velhos.length;
}
