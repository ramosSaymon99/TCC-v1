import type { BabyData, BabyEvent, Routine, Supply } from '../types';
import { DIA, HORA, MIN, addDays, duracao, idade, minutosDoDia, startOfDay, t } from './time';
import { VACINAS } from './constants';

const VACINA_ATRASO_DIAS = 30;

export interface Stats {
  sleepMin: number;
  daySleepMin: number;
  nightSleepMin: number;
  naps: number;
  longestSleepMin: number;
  feeds: number;
  breastFeeds: number;
  breastMin: number;
  bottles: number;
  bottleMl: number;
  avgFeedIntervalMin: number | null;
  wet: number;
  poop: number;
  diapers: number;
  meds: number;
  baths: number;
  solids: number;
  registros: number;
  byUser: Record<string, number>;
}

const vazio = (): Stats => ({
  sleepMin: 0, daySleepMin: 0, nightSleepMin: 0, naps: 0, longestSleepMin: 0, feeds: 0, breastFeeds: 0, breastMin: 0,
  bottles: 0, bottleMl: 0, avgFeedIntervalMin: null, wet: 0, poop: 0, diapers: 0, meds: 0, baths: 0, solids: 0, registros: 0, byUser: {},
});

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export const fimEvento = (e: BabyEvent, agora: number) => (e.end_at ? t(e.end_at) : agora);

/** Janela noturna a partir da rotina (padrão 19h → 7h). */
export function noite(routine?: Routine | null) {
  return {
    dorme: minutosDoDia(routine?.bedtime || '19:00'),
    acorda: minutosDoDia(routine?.wake || '07:00'),
  };
}
function minutosNoturnos(s: number, e: number, r?: Routine | null) {
  const { dorme, acorda } = noite(r);
  let total = 0;
  for (let d = addDays(startOfDay(s), -1); d <= e; d = addDays(d, 1)) {
    const n0 = d + dorme * MIN;
    const n1 = addDays(d, acorda <= dorme ? 1 : 0) + acorda * MIN;
    total += overlap(s, e, n0, n1);
  }
  return total / MIN;
}
export function ehNoturno(ms: number, r?: Routine | null) {
  const { dorme, acorda } = noite(r);
  const d = new Date(ms);
  const m = d.getHours() * 60 + d.getMinutes();
  return dorme > acorda ? m >= dorme || m < acorda : m >= dorme && m < acorda;
}

/** Indicadores de uma janela de tempo [de, ate). */
export function estatisticas(events: BabyEvent[], de: number, ate: number, routine?: Routine | null, agora = Date.now()): Stats {
  const s = vazio();
  const limite = Math.min(ate, agora);
  const mamadas: number[] = [];
  for (const e of events) {
    const ini = t(e.start_at);
    const fim = fimEvento(e, agora);
    if (e.type === 'sono') {
      const ov = overlap(ini, fim, de, limite) / MIN;
      if (ov > 0) {
        const noturno = minutosNoturnos(Math.max(ini, de), Math.min(fim, limite), routine);
        s.sleepMin += ov;
        s.nightSleepMin += noturno;
        s.daySleepMin += ov - noturno;
        s.longestSleepMin = Math.max(s.longestSleepMin, (fim - ini) / MIN);
      }
      if (ini >= de && ini < ate && !ehNoturno(ini, routine)) s.naps++;
    }
    if (ini < de || ini >= ate) continue;
    s.registros++;
    s.byUser[e.user_id] = (s.byUser[e.user_id] ?? 0) + 1;
    switch (e.type) {
      case 'mamada':
        s.feeds++; s.breastFeeds++; mamadas.push(ini);
        s.breastMin += Math.max(0, (fim - ini) / MIN);
        break;
      case 'mamadeira':
        s.feeds++; s.bottles++; mamadas.push(ini);
        s.bottleMl += Number(e.data?.ml) || 0;
        break;
      case 'fralda': {
        const d = e.data?.diaper;
        s.diapers++;
        if (d === 'xixi' || d === 'ambos') s.wet++;
        if (d === 'coco' || d === 'ambos') s.poop++;
        break;
      }
      case 'remedio': s.meds++; break;
      case 'banho': s.baths++; break;
      case 'alimentacao': s.solids++; break;
    }
  }
  mamadas.sort((a, b) => a - b);
  if (mamadas.length > 1) {
    const difs = mamadas.slice(1).map((m, i) => (m - mamadas[i]) / MIN).filter((d) => d > 20);
    if (difs.length) s.avgFeedIntervalMin = difs.reduce((a, b) => a + b, 0) / difs.length;
  }
  return s;
}

export interface Dia extends Stats { dia: number }
export function serieDiaria(events: BabyEvent[], ultimoDia: number, nDias: number, routine?: Routine | null, agora = Date.now()): Dia[] {
  const out: Dia[] = [];
  for (let i = nDias - 1; i >= 0; i--) {
    const d = addDays(ultimoDia, -i);
    out.push({ dia: d, ...estatisticas(events, d, addDays(d, 1), routine, agora) });
  }
  return out;
}

/** Média por dia das métricas aditivas de um conjunto de dias (dias inteiros ou parciais). */
export function mediaDiaria(dias: Stats[], fracaoUltimo = 1): Stats {
  const m = vazio();
  const n = Math.max(0.0001, dias.length - 1 + fracaoUltimo);
  const somaveis: (keyof Stats)[] = ['sleepMin', 'daySleepMin', 'nightSleepMin', 'naps', 'feeds', 'breastFeeds', 'breastMin', 'bottles', 'bottleMl', 'wet', 'poop', 'diapers', 'meds', 'baths', 'solids', 'registros'];
  for (const d of dias) {
    for (const k of somaveis) (m[k] as number) += (d[k] as number) / n;
    m.longestSleepMin = Math.max(m.longestSleepMin, d.longestSleepMin);
    for (const [u, c] of Object.entries(d.byUser)) m.byUser[u] = (m.byUser[u] ?? 0) + c;
  }
  const ints = dias.map((d) => d.avgFeedIntervalMin).filter((x): x is number => x != null);
  m.avgFeedIntervalMin = ints.length ? ints.reduce((a, b) => a + b, 0) / ints.length : null;
  return m;
}

/** Referências gerais por idade (AAP / AASM / SBP). Não substituem a orientação do pediatra. */
export function referencias(dias: number) {
  return {
    sonoH: dias < 90 ? [14, 17] : dias < 365 ? [12, 16] : dias < 730 ? [11, 14] : dias < 1826 ? [10, 13] : [9, 12],
    mamadas: dias < 30 ? [8, 12] : dias < 90 ? [7, 10] : dias < 180 ? [6, 8] : dias < 365 ? [4, 6] : null,
    fraldasMolhadas: dias >= 5 && dias < 365 ? 6 : null,
    intervaloMaxH: dias < 30 ? 3 : dias < 90 ? 4 : null,
    ganhoGDia: dias < 90 ? [20, 35] : dias < 180 ? [15, 20] : dias < 365 ? [10, 15] : null,
  } as { sonoH: number[]; mamadas: number[] | null; fraldasMolhadas: number | null; intervaloMaxH: number | null; ganhoGDia: number[] | null };
}

/* ---------------- Rotina planejada × realizada ---------------- */
export interface ItemRotina { hora: string; tipo: 'mamada' | 'soneca'; status: 'ok' | 'perdido' | 'pendente' | 'proximo'; real?: number }
export function aderencia(events: BabyEvent[], routine: Routine | null | undefined, dia: number, agora = Date.now()) {
  const tol = 45 * MIN;
  const itens: ItemRotina[] = [];
  if (!routine) return { itens, feitos: 0, avaliados: 0, pct: null as number | null };
  const usados = new Set<string>();
  const plano = [
    ...(routine.feeds ?? []).map((h) => ({ hora: h, tipo: 'mamada' as const })),
    ...(routine.naps ?? []).map((h) => ({ hora: h, tipo: 'soneca' as const })),
  ].sort((a, b) => minutosDoDia(a.hora) - minutosDoDia(b.hora));
  let proximoMarcado = false;
  for (const p of plano) {
    const alvo = dia + minutosDoDia(p.hora) * MIN;
    const cand = events
      .filter((e) => !usados.has(e.id) && (p.tipo === 'mamada' ? e.type === 'mamada' || e.type === 'mamadeira' : e.type === 'sono'))
      .map((e) => ({ e, d: Math.abs(t(e.start_at) - alvo) }))
      .filter((x) => x.d <= tol)
      .sort((a, b) => a.d - b.d)[0];
    let status: ItemRotina['status'];
    if (cand) { usados.add(cand.e.id); status = 'ok'; }
    else if (alvo + tol < agora) status = 'perdido';
    else if (!proximoMarcado) { status = 'proximo'; proximoMarcado = true; }
    else status = 'pendente';
    itens.push({ ...p, status, real: cand ? t(cand.e.start_at) : undefined });
  }
  const avaliados = itens.filter((i) => i.status === 'ok' || i.status === 'perdido').length;
  const feitos = itens.filter((i) => i.status === 'ok').length;
  return { itens, feitos, avaliados, pct: avaliados ? feitos / avaliados : null };
}

/* ---------------- Mural ---------------- */
export function coberturaDias(s: Supply, events: BabyEvent[], agora = Date.now()) {
  if (s.auto_type !== 'fralda') return null;
  const de = addDays(startOfDay(agora), -7);
  const n = events.filter((e) => e.type === 'fralda' && t(e.start_at) >= de && t(e.start_at) < agora).length;
  const porDia = (n / ((agora - de) / DIA)) * (s.per_use || 1);
  return porDia > 0 ? s.qty / porDia : null;
}
export const statusSupply = (s: Supply) => (s.qty <= 0 ? 'acabou' : s.qty < s.min_qty ? 'baixo' : 'ok');

/* ---------------- Insights automáticos ---------------- */
export interface Insight { nivel: 'alerta' | 'atencao' | 'positivo' | 'info'; titulo: string; detalhe: string; acao?: string; aba?: string }

export function insights(d: BabyData, agora = Date.now()): Insight[] {
  const out: Insight[] = [];
  const { baby, events } = d;
  const id = idade(baby.birth_date, agora);
  const ref = referencias(id.dias);
  const hoje = startOfDay(agora);
  const r = baby.routine;
  const nome = baby.name.split(' ')[0];

  // Última mamada × intervalo de referência
  const feeds = events.filter((e) => e.type === 'mamada' || e.type === 'mamadeira').sort((a, b) => t(b.start_at) - t(a.start_at));
  const dormindo = events.some((e) => e.type === 'sono' && !e.end_at);
  const intervaloMax = r?.feedIntervalMin ? r.feedIntervalMin / 60 : ref.intervaloMaxH;
  if (feeds[0] && intervaloMax) {
    const h = (agora - t(feeds[0].start_at)) / HORA;
    if (h > intervaloMax && h < 12) {
      out.push({
        nivel: 'atencao', titulo: `Última mamada há ${duracao(h * 60)}`,
        detalhe: `O intervalo planejado é de até ${duracao(intervaloMax * 60)}.${dormindo ? ` ${nome} está dormindo agora.` : ''}`,
        acao: dormindo ? 'Avalie com o pediatra se deve acordar para mamar nessa idade.' : 'Ofereça a próxima mamada e registre.', aba: 'hoje',
      });
    }
  }

  // Cocô
  const ultimaCoco = events.filter((e) => e.type === 'fralda' && (e.data?.diaper === 'coco' || e.data?.diaper === 'ambos')).sort((a, b) => t(b.start_at) - t(a.start_at))[0];
  const temHistorico = events.some((e) => e.type === 'fralda' && t(e.start_at) < agora - 3 * DIA);
  if (temHistorico) {
    const h = ultimaCoco ? (agora - t(ultimaCoco.start_at)) / HORA : Infinity;
    if (h > 72) {
      out.push({
        nivel: 'atencao', titulo: ultimaCoco ? `Sem cocô há ${Math.floor(h / 24)} dias` : 'Nenhum cocô registrado recentemente',
        detalhe: 'Pode ser normal em alguns bebês amamentados, mas vale observar barriga, choro e apetite.',
        acao: 'Se houver desconforto ou barriga distendida, fale com o pediatra.', aba: 'indicadores',
      });
    }
  }

  // Ritmo de hoje × média da mesma hora nos últimos 7 dias (base equivalente)
  const decorrido = agora - hoje;
  if (decorrido > 4 * HORA) {
    const hj = estatisticas(events, hoje, agora, r, agora);
    const base = [1, 2, 3, 4, 5, 6, 7].map((i) => estatisticas(events, addDays(hoje, -i), addDays(hoje, -i) + decorrido, r, agora));
    const temBase = base.filter((b) => b.registros > 0).length >= 4;
    if (temBase) {
      const mf = base.reduce((a, b) => a + b.feeds, 0) / 7;
      if (mf >= 3 && hj.feeds < mf * 0.7) {
        out.push({ nivel: 'atencao', titulo: `Menos mamadas que o habitual até agora`, detalhe: `${hj.feeds} hoje × ${mf.toFixed(1)} em média até este horário nos últimos 7 dias (${Math.round((hj.feeds / mf - 1) * 100)}%).`, acao: 'Confirme se todas foram registradas e observe a aceitação.', aba: 'indicadores' });
      }
      const mw = base.reduce((a, b) => a + b.wet, 0) / 7;
      if (ref.fraldasMolhadas && mw >= 3 && hj.wet < mw * 0.6) {
        out.push({ nivel: 'atencao', titulo: 'Poucas fraldas de xixi hoje', detalhe: `${hj.wet} até agora × ${mw.toFixed(1)} em média neste horário. A referência é ≥ ${ref.fraldasMolhadas}/dia.`, acao: 'Observe hidratação (boca, moleira, choro sem lágrima) e ofereça mais mamadas.', aba: 'indicadores' });
      }
    }
  }

  // Sono: 7 dias × 7 dias anteriores e × referência
  const s7 = mediaDiaria(serieDiaria(events, addDays(hoje, -1), 7, r, agora));
  const s14 = mediaDiaria(serieDiaria(events, addDays(hoje, -8), 7, r, agora));
  if (s7.registros > 3 && s7.sleepMin > 0) {
    const h = s7.sleepMin / 60;
    if (s14.sleepMin > 0) {
      const v = s7.sleepMin / s14.sleepMin - 1;
      if (Math.abs(v) >= 0.12) {
        out.push({
          nivel: v < 0 ? 'atencao' : 'positivo',
          titulo: `Sono ${v < 0 ? 'caiu' : 'subiu'} ${Math.abs(Math.round(v * 100))}% na semana`,
          detalhe: `${duracao(s7.sleepMin)}/dia nos últimos 7 dias × ${duracao(s14.sleepMin)}/dia na semana anterior. Noturno: ${duracao(s7.nightSleepMin)} × ${duracao(s14.nightSleepMin)}.`,
          acao: v < 0 ? 'Verifique se houve mudança de rotina, saltos de desenvolvimento, dentes ou sonecas mais curtas.' : 'Mantenha os horários que estão funcionando.',
          aba: 'indicadores',
        });
      }
    }
    if (h < ref.sonoH[0] - 1) {
      out.push({ nivel: 'info', titulo: `Sono abaixo da faixa de referência`, detalhe: `Média de ${h.toFixed(1)} h/dia; a referência geral para ${id.texto} é ${ref.sonoH[0]}–${ref.sonoH[1]} h. Pode haver sonos não registrados.`, acao: 'Registre todas as sonecas por alguns dias antes de concluir.', aba: 'indicadores' });
    }
  }

  // Rotina planejada
  if (r && (r.feeds?.length || r.naps?.length)) {
    const ad = [1, 2, 3, 4, 5, 6, 7].map((i) => aderencia(events, r, addDays(hoje, -i), agora));
    const av = ad.reduce((a, b) => a + b.avaliados, 0);
    const ok = ad.reduce((a, b) => a + b.feitos, 0);
    if (av >= 10) {
      const pct = ok / av;
      out.push({
        nivel: pct >= 0.7 ? 'positivo' : 'info', titulo: `Rotina cumprida em ${Math.round(pct * 100)}% (7 dias)`,
        detalhe: `${ok} de ${av} horários planejados aconteceram com tolerância de 45 min.`,
        acao: pct < 0.7 ? 'Se a rotina real mudou, ajuste os horários planejados em Família → Rotina.' : undefined, aba: 'familia',
      });
    }
  }

  // Carga de cuidados
  const totais = Object.entries(s7.byUser);
  const soma = totais.reduce((a, [, c]) => a + c, 0);
  if (d.members.length > 1 && soma >= 30) {
    const [topId, topN] = totais.sort((a, b) => b[1] - a[1])[0];
    const share = topN / soma;
    if (share >= 0.7) {
      const quem = d.members.find((m) => m.user_id === topId)?.name.split(' ')[0] ?? 'Uma pessoa';
      out.push({ nivel: 'info', titulo: `${quem} fez ${Math.round(share * 100)}% dos registros da semana`, detalhe: 'A carga de cuidados (ou de registro) está concentrada em uma pessoa.', acao: 'Combine turnos (ex.: madrugadas alternadas) e peça que todos registrem pelo app.', aba: 'familia' });
    }
  }

  // Mural
  for (const s of d.supplies) {
    const cob = coberturaDias(s, events, agora);
    const st = statusSupply(s);
    if (st !== 'ok' || (cob != null && cob < 3)) {
      out.push({
        nivel: st === 'acabou' ? 'alerta' : 'atencao', titulo: st === 'acabou' ? `${s.name}: acabou` : `${s.name}: estoque baixo`,
        detalhe: `${s.qty} ${s.unit || 'un'} (mínimo ${s.min_qty})${cob != null ? ` · dura ~${cob.toFixed(1)} dias no ritmo atual` : ''}.`,
        acao: s.buyer_id ? `Compra combinada com ${d.members.find((m) => m.user_id === s.buyer_id)?.name.split(' ')[0] ?? 'um cuidador'}.` : 'Defina quem compra no Mural.', aba: 'mural',
      });
    }
  }

  // Consultas
  for (const a of d.appointments.filter((x) => !x.done)) {
    const dd = (t(a.date) - agora) / DIA;
    if (dd >= -0.1 && dd <= 3) out.push({ nivel: 'info', titulo: `${a.title} ${dd < 1 ? 'hoje/amanhã' : `em ${Math.ceil(dd)} dias`}`, detalhe: `${new Date(a.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${a.doctor ? ` · ${a.doctor}` : ''}`, acao: 'Leve as dúvidas e os indicadores da semana.', aba: 'saude' });
  }

  // Vacinas atrasadas
  const aplicadas = new Set(d.vaccines.map((v) => v.code));
  const atrasadas = VACINAS.filter((v) => !aplicadas.has(v.code) && id.dias > v.meses * 30.4 + VACINA_ATRASO_DIAS);
  if (atrasadas.length && d.vaccines.length) {
    out.push({ nivel: 'atencao', titulo: `${atrasadas.length} vacina(s) sem registro para a idade`, detalhe: atrasadas.slice(0, 3).map((v) => v.nome).join(', ') + (atrasadas.length > 3 ? '…' : ''), acao: 'Confira a caderneta e marque as aplicadas em Saúde.', aba: 'saude' });
  }

  // Peso
  const pesos = d.growth.filter((g) => g.weight_g).sort((a, b) => a.date.localeCompare(b.date));
  if (pesos.length >= 2 && ref.ganhoGDia) {
    const a = pesos[pesos.length - 2];
    const b = pesos[pesos.length - 1];
    const dias = (t(b.date) - t(a.date)) / DIA;
    if (dias >= 5) {
      const g = ((b.weight_g ?? 0) - (a.weight_g ?? 0)) / dias;
      out.push({
        nivel: g < ref.ganhoGDia[0] * 0.75 ? 'atencao' : 'positivo', titulo: `Ganho de peso: ${Math.round(g)} g/dia`,
        detalhe: `Entre as duas últimas pesagens (${Math.round(dias)} dias). Referência geral para a idade: ${ref.ganhoGDia[0]}–${ref.ganhoGDia[1]} g/dia.`,
        acao: g < ref.ganhoGDia[0] * 0.75 ? 'Converse com o pediatra na próxima consulta.' : undefined, aba: 'saude',
      });
    }
  }

  const ordem = { alerta: 0, atencao: 1, info: 2, positivo: 3 };
  return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
