/* Ninho · Service Worker
 * - Mostra as notificações push no formato da tela de bloqueio (título curto, horário do fato, ações).
 * - Executa ações direto da notificação ("Acordou", "Eu compro") sem abrir o app, usando a sessão salva.
 * - Mantém o contador no ícone do app (tela inicial) com a Badging API.
 * - Guarda o app (HTML, JS, CSS, ícones) para ele abrir mesmo sem internet.
 */
const CACHE = 'ninho-sessao';
const SHELL = 'ninho-app-v1';

/** Baixa a página e os arquivos que ela referencia (nomes com hash mudam a cada versão). */
async function guardarApp() {
  const c = await caches.open(SHELL);
  const r = await fetch('./', { cache: 'no-cache' });
  if (!r.ok) return;
  const html = await r.clone().text();
  await c.put('./', r);
  const arquivos = [...html.matchAll(/(?:src|href)="\.?\/?((?:assets\/)[^"]+)"/g)].map((m) => `./${m[1]}`);
  await Promise.all([...arquivos, './manifest.webmanifest', './icon-192.png', './badge-96.png', './favicon.svg'].map((u) => c.add(u).catch(() => undefined)));
}
self.addEventListener('install', (e) => { e.waitUntil(guardarApp().catch(() => undefined)); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  // Página: rede primeiro (sempre a versão nova), cache se estiver sem internet
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(SHELL)).put('./', r.clone());
        return r;
      } catch {
        return (await caches.match('./', { cacheName: SHELL })) || Response.error();
      }
    })());
    return;
  }
  // Arquivos estáticos com hash e ícones: cache primeiro
  if (url.pathname.includes('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    })());
  }
});

async function lerSessao() {
  const r = await (await caches.open(CACHE)).match('./__sessao');
  return r ? r.json() : null;
}
async function contador(delta) {
  const c = await caches.open(CACHE);
  const r = await c.match('./__badge');
  const n = delta === 0 ? 0 : Math.max(0, (r ? Number(await r.text()) : 0) + delta);
  await c.put('./__badge', new Response(String(n)));
  try {
    if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch { /* plataforma sem contador no ícone */ }
}

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const opcoes = {
    body: d.body || '',
    icon: d.icon || './icon-192.png',
    badge: './badge-96.png',
    tag: d.tag,
    renotify: !!d.tag && d.renotify !== false,
    silent: !!d.silent,
    requireInteraction: !!d.sticky,
    timestamp: d.ts || Date.now(),
    actions: (d.actions || []).slice(0, 2),
    data: { url: d.url || './', acoes: d.acoes || {}, babyId: d.babyId },
    lang: 'pt-BR',
  };
  if (d.image) opcoes.image = d.image;
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Ninho', opcoes),
    d.silent ? Promise.resolve() : contador(1),
  ]));
});

/** Métrica do piloto: só o tipo de ação, sem conteúdo. */
async function registrarUso(evento, valor, babyId) {
  try {
    const s = await lerSessao();
    if (!s?.token) return;
    await fetch(new URL('./api/uso', self.registration.scope), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` }, body: JSON.stringify({ evento, valor, babyId }) });
  } catch { /* sem rede: ignora */ }
}

async function executar(acao, notif) {
  const s = await lerSessao();
  if (!s?.token) return false;
  const troca = (v) => (v === '$agora' ? new Date().toISOString() : v === '$eu' ? s.userId : v);
  const body = Object.fromEntries(Object.entries(acao.api.body || {}).map(([k, v]) => [k, troca(v)]));
  const r = await fetch(new URL(`./api${acao.api.path}`, self.registration.scope), {
    method: acao.api.method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) return false;
  if (acao.ok) await self.registration.showNotification(acao.ok.title, { body: acao.ok.body, icon: './icon-192.png', badge: './badge-96.png', tag: notif.tag, silent: true });
  return true;
}

async function abrir(url) {
  const alvo = new URL(url || './', self.registration.scope).href;
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of janelas) {
    if (c.url.startsWith(self.registration.scope)) {
      await c.focus();
      c.postMessage({ tipo: 'abrir', url: alvo });
      return;
    }
  }
  await self.clients.openWindow(alvo);
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const dados = n.data || {};
  const acao = event.action && dados.acoes ? dados.acoes[event.action] : null;
  n.close();
  event.waitUntil((async () => {
    await contador(-1);
    registrarUso(event.action ? 'notif_acao' : 'notif_clique', event.action || (n.tag || '').split('-')[0], dados.babyId);
    if (acao?.api) {
      // Ação direta (ex.: "Acordou"): grava sem abrir o app; se falhar (sessão expirada), abre o app
      if (await executar(acao, n)) return;
    }
    await abrir(acao?.url || dados.url);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.tipo === 'zerar-badge') event.waitUntil(contador(0));
});
