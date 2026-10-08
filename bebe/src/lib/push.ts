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
