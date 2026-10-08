/**
 * Uso sem internet: fila de registros pendentes + cópia local dos dados do bebê.
 *
 * - Toda alteração de um bebê (registros, mural, recados, saúde, vacinas) que falha por falta de rede vai para a fila
 *   (localStorage) e é enviada na ordem quando a conexão volta. O servidor é idempotente pelo id do registro.
 * - A tela mostra os dados do servidor + o efeito da fila (otimista), então o app funciona igual offline.
 * - Os últimos dados de cada bebê ficam em cache para abrir o app mesmo sem conexão.
 */
import type { BabyData, BabyEvent, User, Baby } from '../types';

export interface Pendente {
  qid: string;
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  at: number;
  userId: string;
  user_id?: string;
}

const LS_FILA = 'ninho-fila';
const evento = () => window.dispatchEvent(new Event('ninho-fila'));
function ler<T>(k: string, padrao: T): T {
  try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return padrao; }
}
function gravar(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento cheio ou bloqueado */ }
}

export const fila = (): Pendente[] => ler<Pendente[]>(LS_FILA, []);
const salvarFila = (f: Pendente[]) => { gravar(LS_FILA, f); evento(); };

const RE_MUT = /^\/babies\/([^/]+)\/(events|growth|supplies|notes|appointments|vaccines)(?:\/([^/]+))?$/;
/** Só alterações dentro de um bebê vão para a fila; login, convites, perfil etc. exigem conexão. */
export const enfileiravel = (method: string, path: string) => method !== 'GET' && RE_MUT.test(path);

export function enfileirar(op: Omit<Pendente, 'qid' | 'at'>) {
  let f = fila();
  const m = op.path.match(RE_MUT)!;
  // Excluir algo que ainda nem subiu: cancela a criação e as edições pendentes em vez de mandar 3 requisições
  if (op.method === 'DELETE' && m[3] && m[2] !== 'vaccines') {
    const criacao = f.find((p) => p.method === 'POST' && p.path === `/babies/${m[1]}/${m[2]}` && p.body?.id === m[3]);
    if (criacao) {
      salvarFila(f.filter((p) => p !== criacao && p.path !== op.path));
      return;
    }
  }
  // Edição de algo que ainda nem subiu: junta na criação
  if (op.method === 'PUT' && m[3] && m[2] !== 'vaccines') {
    const criacao = f.find((p) => p.method === 'POST' && p.path === `/babies/${m[1]}/${m[2]}` && p.body?.id === m[3]);
    if (criacao) {
      criacao.body = { ...criacao.body, ...op.body };
      salvarFila(f);
      return;
    }
  }
  f = [...f, { ...op, qid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at: Date.now() }];
  salvarFila(f);
}
export const removerDaFila = (qid: string) => salvarFila(fila().filter((p) => p.qid !== qid));
export const pendentesDoBebe = (babyId: string) => fila().filter((p) => p.path.startsWith(`/babies/${babyId}/`)).length;

/** Aplica a fila sobre os dados do servidor para a tela refletir o que foi feito offline. */
export function aplicarPendentes(base: BabyData, userId: string): BabyData {
  const ops = fila().filter((p) => p.path.startsWith(`/babies/${base.baby.id}/`));
  if (!ops.length) return base;
  const d: BabyData = { ...base, events: [...base.events], growth: [...base.growth], supplies: [...base.supplies], notes: [...base.notes], appointments: [...base.appointments], vaccines: [...base.vaccines] };
  for (const op of ops) {
    const [, , res, id] = op.path.match(RE_MUT)!;
    if (res === 'vaccines') {
      d.vaccines = d.vaccines.filter((v) => v.code !== id);
      if (op.method === 'PUT') d.vaccines.push({ code: id!, date: String(op.body?.date), user_id: op.user_id ?? userId });
      continue;
    }
    const lista = d[res as 'events'] as unknown as Record<string, unknown>[];
    const iso = new Date(op.at).toISOString();
    if (op.method === 'POST') {
      if (!lista.some((x) => x.id === op.body?.id)) {
        const novo: Record<string, unknown> = { user_id: userId, created_at: iso, updated_at: iso, data: {}, pinned: 0, done: 0, ...op.body, pendente: true };
        if (res === 'events') {
          lista.push(novo);
          if (novo.type === 'fralda') d.supplies = d.supplies.map((s) => (s.auto_type === 'fralda' ? { ...s, qty: Math.max(0, s.qty - (s.per_use || 1)) } : s));
        } else lista.unshift(novo);
      }
    } else if (op.method === 'PUT') {
      const i = lista.findIndex((x) => x.id === id);
      if (i >= 0) lista[i] = { ...lista[i], ...op.body, pendente: true };
    } else if (op.method === 'DELETE') {
      const alvo = lista.find((x) => x.id === id) as BabyEvent | undefined;
      (d as unknown as Record<string, unknown[]>)[res] = lista.filter((x) => x.id !== id);
      if (res === 'events' && alvo?.type === 'fralda') d.supplies = d.supplies.map((s) => (s.auto_type === 'fralda' ? { ...s, qty: s.qty + (s.per_use || 1) } : s));
    }
  }
  d.events.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return d;
}

/* ---------------- Cache para abrir sem internet ---------------- */
export const salvarCacheBebe = (d: BabyData) => gravar(`ninho-cache-${d.baby.id}`, d);
export const lerCacheBebe = (babyId: string) => ler<BabyData | null>(`ninho-cache-${babyId}`, null);
export const salvarCacheMe = (me: { user: User; babies: Baby[] }) => gravar('ninho-cache-me', me);
export const lerCacheMe = () => ler<{ user: User; babies: Baby[] } | null>('ninho-cache-me', null);
export function limparCaches() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ninho-cache-') || k === LS_FILA) localStorage.removeItem(k);
  } catch { /* sem storage */ }
  evento();
}
