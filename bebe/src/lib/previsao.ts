/** Previsões e resumos da fase bebê: próxima mamada, noite, passagem de turno, doses e leite guardado. */
import type { BabyData, BabyEvent, EventData, EventType, Milk, Routine } from '../types';
import { HORA, MIN, addDays, minutosDoDia, startOfDay, t } from './time';
import { VALIDADE_LEITE_H } from './conteudo';

const ehMamada = (e: BabyEvent) => e.type === 'mamada' || e.type === 'mamadeira';

/** Próxima mamada pelo intervalo médio real das últimas 24 h (mín. 3 mamadas). */
export function proximaMamada(events: BabyEvent[], agora: number) {
  const feeds = events.filter((e) => ehMamada(e) && t(e.start_at) > agora - 24 * HORA && t(e.start_at) <= agora).sort((a, b) => t(a.start_at) - t(b.start_at));
  if (feeds.length < 3) return null;
  const ints: number[] = [];
  for (let i = 1; i < feeds.length; i++) ints.push((t(feeds[i].start_at) - t(feeds[i - 1].start_at)) / MIN);
  const media = ints.reduce((a, b) => a + b, 0) / ints.length;
  const ultima = t(feeds[feeds.length - 1].start_at);
  return { ultima, intervaloMin: Math.round(media), previsao: ultima + media * MIN, mamadas: feeds.length };
}

/** Resumo da última noite (hora de dormir da rotina → hora de acordar). */
export function resumoNoite(events: BabyEvent[], routine: Routine | null | undefined, agora: number) {
  const dorme = minutosDoDia(routine?.bedtime || '19:00');
  const acorda = minutosDoDia(routine?.wake || '07:00');
  const hoje = startOfDay(agora);
  const ini = addDays(hoje, -1) + dorme * MIN;
  const fim = hoje + acorda * MIN;
  if (agora < fim - 30 * MIN) return null; // a noite ainda não terminou
  const sonos = events.filter((e) => e.type === 'sono' && t(e.start_at) < fim && (e.end_at ? t(e.end_at) : agora) > ini)
    .map((e) => ({ a: Math.max(ini, t(e.start_at)), b: Math.min(fim, e.end_at ? t(e.end_at) : agora) }))
    .filter((s) => s.b > s.a).sort((x, y) => x.a - y.a);
  const totalMin = sonos.reduce((s, x) => s + (x.b - x.a) / MIN, 0);
  if (!sonos.length) return null;
  const maiorMin = Math.max(...sonos.map((x) => (x.b - x.a) / MIN));
  const despertares = Math.max(0, sonos.length - 1);
  const naNoite = events.filter((e) => t(e.start_at) >= ini && t(e.start_at) < fim && e.type !== 'sono');
  const mamadas = naNoite.filter(ehMamada).length;
  const porPessoa: Record<string, number> = {};
  for (const e of naNoite) porPessoa[e.user_id] = (porPessoa[e.user_id] ?? 0) + 1;
  return { ini, fim, totalMin, maiorMin, despertares, mamadas, porPessoa };
}

export interface Dose { med: string; dose?: string; ultima: number; quem: string; intervaloH?: number; liberaEm?: number; liberada: boolean; lembrar?: boolean }

/** Última dose de cada remédio dos últimos 3 dias, com o horário em que a próxima fica liberada. */
export function doses(events: BabyEvent[], agora: number): Dose[] {
  const out = new Map<string, Dose>();
  for (const e of events.filter((x) => x.type === 'remedio' && x.data?.med && t(x.start_at) > agora - 3 * 24 * HORA).sort((a, b) => t(b.start_at) - t(a.start_at))) {
    const k = e.data.med!.trim().toLowerCase();
    if (out.has(k)) continue;
    const h = Number(e.data.intervalo_h) || undefined;
    const libera = h ? t(e.start_at) + h * HORA : undefined;
    out.set(k, { med: e.data.med!, dose: e.data.dose, ultima: t(e.start_at), quem: e.user_id, intervaloH: h, liberaEm: libera, liberada: !libera || agora >= libera, lembrar: e.data.lembrar });
  }
  return [...out.values()];
}
/** Dose dada antes do intervalo mínimo da anterior? */
export function conflitoDose(events: BabyEvent[], med: string, quando: number, ignorarId?: string) {
  const k = med.trim().toLowerCase();
  if (!k) return null;
  const ant = events.filter((e) => e.type === 'remedio' && e.id !== ignorarId && e.data?.med?.trim().toLowerCase() === k && t(e.start_at) <= quando)
    .sort((a, b) => t(b.start_at) - t(a.start_at))[0];
  if (!ant) return null;
  const h = Number(ant.data.intervalo_h) || 0;
  const libera = t(ant.start_at) + h * HORA;
  return { anterior: ant, liberaEm: libera, cedo: h > 0 && quando < libera };
}

/** O que aconteceu desde a última visita desta pessoa (feito pelos outros cuidadores). */
export function resumoDesde(d: BabyData, desde: number, meuId: string, agora: number) {
  const evs = d.events.filter((e) => e.user_id !== meuId && (t(e.start_at) >= desde || (e.end_at && t(e.end_at) >= desde))).sort((a, b) => t(a.start_at) - t(b.start_at));
  const notas = d.notes.filter((n) => n.user_id !== meuId && t(n.created_at) >= desde && !n.done && n.kind !== 'pergunta');
  const contar = (f: (e: BabyEvent) => boolean) => evs.filter(f).length;
  const sonoMin = evs.filter((e) => e.type === 'sono').reduce((s, e) => s + (Math.min(e.end_at ? t(e.end_at) : agora, agora) - Math.max(t(e.start_at), desde)) / MIN, 0);
  const ultimo = (tp: EventType[]) => [...evs].reverse().find((e) => tp.includes(e.type));
  return {
    total: evs.length,
    mamadas: contar(ehMamada),
    fraldas: contar((e) => e.type === 'fralda'),
    sonoMin: Math.max(0, sonoMin),
    remedios: evs.filter((e) => e.type === 'remedio'),
    saude: evs.filter((e) => e.type === 'saude'),
    ultMamada: ultimo(['mamada', 'mamadeira']),
    ultFralda: ultimo(['fralda']),
    quem: [...new Set(evs.map((e) => e.user_id))],
    notas,
  };
}

/** Frascos de leite guardados, com validade (geladeira 12 h, congelador 15 dias). */
export function leiteGuardado(milk: Milk[], agora: number) {
  return milk.filter((m) => !m.used_at).map((m) => {
    const h = m.place === 'congelador' ? VALIDADE_LEITE_H.congelador : VALIDADE_LEITE_H.geladeira;
    const vence = t(m.collected_at) + h * HORA;
    const restaH = (vence - agora) / HORA;
    return { ...m, vence, restaH, vencido: restaH <= 0, vencendo: restaH > 0 && restaH < (m.place === 'congelador' ? 48 : 3) };
  }).sort((a, b) => a.vence - b.vence);
}

/** Atalhos "repetir": os últimos registros de tipos simples, para registrar de novo com um toque. */
export function sugestoesRepetir(events: BabyEvent[]) {
  const out: { tipo: EventType; data: EventData; ref: BabyEvent }[] = [];
  const vistos = new Set<string>();
  for (const e of [...events].sort((a, b) => t(b.start_at) - t(a.start_at))) {
    if (!['fralda', 'mamadeira', 'mamada'].includes(e.type)) continue; // remédio fica de fora por segurança
    const chave = e.type === 'fralda' ? `fralda-${e.data.diaper}` : e.type;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const data: EventData = e.type === 'mamada' ? { side: e.data.side === 'E' ? 'D' : e.data.side === 'D' ? 'E' : 'ambos' } : { ...e.data };
    out.push({ tipo: e.type, data, ref: e });
    if (out.length >= 3) break;
  }
  return out;
}

/** Madrugada: 22h às 6h (tela escura, botões maiores). */
export const ehMadrugada = (ms = Date.now()) => { const h = new Date(ms).getHours(); return h >= 22 || h < 6; };
