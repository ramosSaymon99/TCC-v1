/** Notificações push no navegador/celular (Service Worker + Push API). */
import { api } from './api';

export const pushSuportado = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const ehInstalado = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (seguro) navigator.serviceWorker.register('./sw.js').catch(() => { /* ex.: arquivo aberto direto do disco */ });
}

async function registro() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('O serviço de notificações ainda não carregou. Recarregue a página e tente de novo.');
  return reg;
}

export async function inscricaoAtual(): Promise<PushSubscription | null> {
  if (!pushSuportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const chave = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function ativarPush(publicKey: string) {
  if (!pushSuportado()) throw new Error('Este navegador não suporta notificações.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão negada. Libere as notificações do site nas configurações do navegador.');
  const reg = await registro();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave(publicKey) });
  await api.pushSubscribe(sub.toJSON(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  return sub;
}

export async function desativarPush() {
  const sub = await inscricaoAtual();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/* ---- Sessão para ações direto da notificação e contador no ícone (tela inicial) ---- */
const CACHE = 'ninho-sessao';

/** Guarda a sessão para o service worker executar ações ("Acordou", "Eu compro") sem abrir o app. */
export async function salvarSessaoSW(token: string, userId: string) {
  try { await (await caches.open(CACHE)).put('./__sessao', new Response(JSON.stringify({ token, userId }))); } catch { /* sem Cache Storage */ }
}
export async function limparSessaoSW() {
  try { await caches.delete(CACHE); } catch { /* sem Cache Storage */ }
  definirBadge(0);
}

/** Número no ícone do app (iOS 16.4+ instalado, Android, Windows, macOS). */
export async function definirBadge(n: number) {
  try { await (await caches.open(CACHE)).put('./__badge', new Response(String(n))); } catch { /* sem Cache Storage */ }
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) await nav.setAppBadge?.(n);
    else await nav.clearAppBadge?.();
  } catch { /* plataforma sem contador */ }
}
