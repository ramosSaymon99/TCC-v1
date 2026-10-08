/**
 * Web Push (RFC 8030/8291/8292) usando apenas WebCrypto — sem dependências.
 *  - VAPID: par de chaves ECDSA P-256 gerado no primeiro uso e guardado na tabela `secrets`.
 *  - Criptografia do conteúdo: aes128gcm (ECDH P-256 + HKDF-SHA256 + AES-128-GCM).
 */

const enc = new TextEncoder();
export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let i = 0;
  for (const a of arrs) { out.set(a, i); i += a.length; }
  return out;
};

let vapidCache = null;
/** Chaves VAPID: { publicKey (base64url, 65 bytes), privateJwk } */
export async function vapid(env) {
  if (vapidCache) return vapidCache;
  let r = await env.DB.prepare("SELECT value FROM secrets WHERE key = 'vapid'").first();
  if (!r) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64url(await crypto.subtle.exportKey('raw', kp.publicKey));
    const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
    await env.DB.prepare("INSERT OR IGNORE INTO secrets (key, value) VALUES ('vapid', ?)").bind(JSON.stringify({ publicKey: pub, privateJwk: priv })).run();
    r = await env.DB.prepare("SELECT value FROM secrets WHERE key = 'vapid'").first();
  }
  vapidCache = JSON.parse(r.value);
  return vapidCache;
}

async function vapidHeader(env, endpoint) {
  const { publicKey, privateJwk } = await vapid(env);
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:contato@ninho.app' })));
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${payload}`));
  return `vapid t=${header}.${payload}.${b64url(sig)}, k=${publicKey}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Criptografa o payload para uma inscrição (aes128gcm, RFC 8291). */
export async function encrypt(p256dh, auth, payload, salt = crypto.getRandomValues(new Uint8Array(16)), asKeys) {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const as = asKeys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Envia uma notificação. Retorna o status HTTP do serviço de push (404/410 = inscrição expirada). */
export async function sendPush(env, sub, data, urgency = 'normal') {
  const body = await encrypt(sub.p256dh, sub.auth, JSON.stringify(data));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidHeader(env, sub.endpoint),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '43200',
      urgency,
      topic: (data.tag || 'ninho').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'ninho',
    },
    body,
  });
  return r.status;
}
