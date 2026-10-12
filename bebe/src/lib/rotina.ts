/** Rotina: check manual dos horários planejados e sugestão de rotina a partir dos registros reais. */
import type { BabyEvent, Check, Routine } from '../types';
import { DIA, MIN, addDays, idade, pad, startOfDay, t, ymd } from './time';
import { rotinaSugerida } from './demo';

/* ---------- Check manual ---------- */
export type TipoRotina = 'mamada' | 'soneca';
/** Código do item da rotina em um dia (sem ":" porque vira parte do id). */
export const codigoRotina = (dia: number, tipo: TipoRotina, hora: string) => `${ymd(dia)}_${tipo}_${hora.replace(':', '')}`;
/** Marcações manuais do dia: código → 'feito' | 'pulado'. */
export function marcacoesDoDia(checks: Check[], dia: number) {
  const prefixo = `${ymd(dia)}_`;
  return new Map(checks.filter((c) => c.kind === 'rotina' && c.code.startsWith(prefixo)).map((c) => [c.code, c]));
}

/* ---------- Sugestão a partir dos registros ---------- */
const minDoDia = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (min: number) => { const m = ((Math.round(min / 15) * 15) % 1440 + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const moda = (v: number[]) => { const c = new Map<number, number>(); for (const x of v) c.set(x, (c.get(x) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0; };
/** Para "mamadas da noite", 00h–05h contam depois das 23h (dia do bebê começa ao acordar). */
const noDiaDoBebe = (min: number, acorda: number) => (min < acorda - 60 ? min + 1440 : min);

/** Horários típicos: usa os dias com a quantidade mais comum de itens e tira a mediana de cada posição. */
function horariosTipicos(porDia: number[][]) {
  const comDados = porDia.filter((d) => d.length);
  if (!comDados.length) return [];
  const n = moda(comDados.map((d) => d.length));
  const base = comDados.filter((d) => d.length === n);
  return Array.from({ length: n }, (_, i) => mediana(base.map((d) => d[i])));
}

export interface SugestaoRotina {
  rotina: Routine;
  dias: number;
  de: number;
  ate: number;
  sonecasRef: number;
  mudancas: string[];
}

/**
 * Sugere uma rotina pelos últimos 14 dias completos de registros (mínimo 5 dias com sono e mamadas).
 * Horários arredondados de 15 em 15 minutos.
 */
export function sugerirRotina(events: BabyEvent[], atual: Routine | null | undefined, birth: string, agora = Date.now()): SugestaoRotina | null {
  const hoje = startOfDay(agora);
  const de = addDays(hoje, -14);
  const sonos = events.filter((e) => e.type === 'sono' && e.end_at && t(e.start_at) >= de - DIA && t(e.start_at) < hoje);
  const feeds = events.filter((e) => (e.type === 'mamada' || e.type === 'mamadeira') && t(e.start_at) >= de && t(e.start_at) < hoje);

  // Sono noturno: o mais longo que começa entre 17h30 e 02h e dura 3 h ou mais
  const noites = sonos.filter((e) => { const m = minDoDia(t(e.start_at)); return (m >= 17 * 60 + 30 || m < 120) && t(e.end_at!) - t(e.start_at) >= 3 * 60 * MIN; });
  const dormir: number[] = [];
  const acordar: number[] = [];
  const diasValidos: number[] = [];
  for (let d = de; d < hoje; d = addDays(d, 1)) {
    // Hora de dormir: início do primeiro sono noturno daquela noite
    const n = noites.filter((e) => { const s = t(e.start_at); return s >= d + 17.5 * 60 * MIN && s < addDays(d, 1) + 2 * 60 * MIN; }).sort((a, b) => t(a.start_at) - t(b.start_at))[0];
    if (n) dormir.push(noDiaDoBebe(minDoDia(t(n.start_at)), 360));
    // Hora de acordar: fim do último sono que termina entre 4h e 10h
    const manha = sonos.filter((e) => { const f = t(e.end_at!); return f >= d + 4 * 60 * MIN && f <= d + 10 * 60 * MIN && t(e.start_at) < d + 7 * 60 * MIN; }).sort((a, b) => t(b.end_at!) - t(a.end_at!))[0];
    if (manha) acordar.push(minDoDia(t(manha.end_at!)));
    if (feeds.some((e) => t(e.start_at) >= d && t(e.start_at) < addDays(d, 1))) diasValidos.push(d);
  }
  if (diasValidos.length < 5 || dormir.length < 4 || acordar.length < 4) return null;
  const acorda = mediana(acordar);
  const dorme = mediana(dormir);

  // Sonecas: sonos de dia (entre acordar + 30 min e dormir − 30 min), por dia
  const sonecasPorDia = diasValidos.map((d) => sonos
    .filter((e) => { const s = t(e.start_at); const m = minDoDia(s); return s >= d && s < addDays(d, 1) && m >= acorda + 30 && m <= dorme - 30 && t(e.end_at!) - s < 4 * 60 * MIN; })
    .map((e) => minDoDia(t(e.start_at))).sort((a, b) => a - b));
  // Mamadas: do acordar até a madrugada seguinte
  const mamadasPorDia = diasValidos.map((d) => feeds
    .filter((e) => { const s = t(e.start_at); return s >= d + (acorda - 60) * MIN && s < addDays(d, 1) + (acorda - 60) * MIN; })
    .map((e) => noDiaDoBebe(minDoDia(t(e.start_at)), acorda)).sort((a, b) => a - b));
  // Junta horários a menos de 45 min (ex.: mamada dividida em duas)
  const juntar = (v: number[]) => v.reduce<number[]>((acc, x) => (acc.length && x - acc[acc.length - 1] < 45 ? acc : [...acc, x]), []);
  const naps = horariosTipicos(sonecasPorDia.map(juntar)).map(hhmm);
  const mamadas = horariosTipicos(mamadasPorDia.map(juntar));
  const ints = mamadasPorDia.flatMap((d) => d.slice(1).map((x, i) => x - d[i])).filter((x) => x >= 45);
  const intervalo = ints.length ? Math.round((mediana(ints) * 1.25) / 15) * 15 : atual?.feedIntervalMin;

  const rotina: Routine = { wake: hhmm(acorda), bedtime: hhmm(dorme), feeds: mamadas.map(hhmm), naps, feedIntervalMin: intervalo };
  const id = idade(birth, agora);
  const sonecasRef = rotinaSugerida(id.dias).naps.length;
  const mudancas: string[] = [];
  if (atual) {
    if (atual.wake && atual.wake !== rotina.wake) mudancas.push(`Acorda ${atual.wake} → ${rotina.wake}`);
    if (atual.bedtime && atual.bedtime !== rotina.bedtime) mudancas.push(`Dorme ${atual.bedtime} → ${rotina.bedtime}`);
    if ((atual.naps?.length ?? 0) !== naps.length) mudancas.push(`Sonecas: ${atual.naps?.length ?? 0} → ${naps.length} por dia`);
    if ((atual.feeds?.length ?? 0) !== rotina.feeds.length) mudancas.push(`Mamadas: ${atual.feeds?.length ?? 0} → ${rotina.feeds.length} por dia`);
  }
  return { rotina, dias: diasValidos.length, de: diasValidos[0], ate: diasValidos[diasValidos.length - 1], sonecasRef, mudancas };
}
