/** Gera ~5 semanas de rotina realista para apresentar o app (bebê de ~3–4 meses). */
import type { Routine } from '../types';
import { DIA, MIN, addDays, startOfDay, uid, ymd } from './time';

export const ROTINA_DEMO: Routine = {
  wake: '07:00', bedtime: '19:30', feedIntervalMin: 210,
  feeds: ['07:00', '10:00', '13:00', '16:00', '18:45', '23:30', '03:30'],
  naps: ['08:30', '11:30', '14:30', '17:00'],
};

function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** cuidadores: ids por papel (mae, pai, avo_f, baba). Quem faltar recebe o id da mãe. */
export function gerarDemo(birth: string, cuidadores: Record<string, string>, agora = Date.now()) {
  const rnd = prng(42);
  const var_ = (n: number) => (rnd() - 0.5) * 2 * n;
  const mae = cuidadores.mae;
  const quem = (papel: string) => cuidadores[papel] ?? mae;
  const events: Record<string, unknown>[] = [];
  const hoje = startOfDay(agora);
  const add = (type: string, ini: number, fim: number | null, data: Record<string, unknown>, user: string, note?: string) => {
    if (ini > agora) return;
    events.push({ id: uid(), type, start_at: new Date(ini).toISOString(), end_at: fim == null || fim > agora ? null : new Date(fim).toISOString(), data, user_id: user, note: note ?? null });
  };

  for (let i = 35; i >= 0; i--) {
    const d = addDays(hoje, -i);
    const semana = new Date(d).getDay();
    const fimDeSemana = semana === 0 || semana === 6;
    const recente = i <= 6; // última semana: sono mais picado (salto de desenvolvimento)
    const diurno = (h: number) => (fimDeSemana ? (h < 13 ? quem('pai') : quem('avo_f')) : h >= 8 && h < 17 ? quem('baba') : mae);
    const at = (h: number, m: number, jitter = 15) => d + (h * 60 + m + var_(jitter)) * MIN;

    // Mamadas
    const horarios: [number, number][] = [[7, 0], [10, 0], [13, 0], [16, 0], [18, 45], [23, 30]];
    if (!(i < 20 && rnd() < 0.45)) horarios.push([3, 30]); // vai largando a mamada das 3h30
    if (recente && rnd() < 0.6) horarios.push([1, 30]);
    for (const [h, m] of horarios) {
      const ini = at(h, m, 25);
      const u = h < 6 || h >= 22 ? (rnd() < 0.8 ? mae : quem('pai')) : diurno(h);
      if (u === quem('baba') && u !== mae) add('mamadeira', ini, ini + 15 * MIN, { ml: Math.round(110 + rnd() * 50), milk: rnd() < 0.7 ? 'materno' : 'formula' }, u);
      else add('mamada', ini, ini + (12 + rnd() * 16) * MIN, { side: (['E', 'D', 'ambos'] as const)[Math.floor(rnd() * 3)] }, mae);
    }

    // Sonecas
    const sonecas: [number, number, number][] = [[8, 30, 80], [11, 30, 95], [14, 30, 70], [17, 0, 35]];
    for (const [h, m, dur] of sonecas) {
      const ini = at(h, m, 20);
      const f = recente ? 0.7 : 1;
      add('sono', ini, ini + (dur * f + var_(15)) * MIN, { quality: rnd() < 0.8 ? 'tranquilo' : 'agitado' }, diurno(h));
    }
    // Noite (de d às 19h30 até d+1): blocos interrompidos pelas mamadas noturnas
    const noite0 = at(19, 30, 20);
    const blocos: [number, number][] = recente ? [[noite0, at(22, 50)], [at(23, 55), at(24 + 1, 20)], [at(24 + 1, 55), at(24 + 3, 20)], [at(24 + 3, 55), at(24 + 6, 40)]] : [[noite0, at(23, 20)], [at(23, 55), at(24 + 3, 20)], [at(24 + 3, 55), at(24 + 6, 50)]];
    for (const [a, b] of blocos) if (b > a) add('sono', a, b, { quality: 'tranquilo' }, a > d + 22 * 60 * MIN ? mae : quem('pai'));

    // Fraldas
    const nFraldas = 6 + Math.floor(rnd() * 3);
    for (let k = 0; k < nFraldas; k++) {
      const h = 6.5 + (k * 15) / nFraldas;
      const coco = rnd() < (i < 10 ? 0.22 : 0.32);
      add('fralda', d + (h * 60 + var_(20)) * MIN, null, { diaper: coco ? (rnd() < 0.7 ? 'ambos' : 'coco') : 'xixi', consistency: coco ? (rnd() < 0.8 ? 'pastoso' : 'líquido') : undefined, color: coco ? 'amarelo' : undefined }, diurno(h));
    }
    add('banho', at(18, 20, 10), at(18, 35, 5), {}, fimDeSemana ? quem('pai') : mae);
    add('remedio', at(9, 0, 30), null, { med: 'Vitamina D', dose: '2 gotas' }, diurno(9));
  }

  const nasc = startOfDay(new Date(birth + 'T12:00').getTime());
  const idadeDias = Math.floor((hoje - nasc) / DIA);
  const pesagens = [[0, 3320, 49], [7, 3240, 49.5], [15, 3610, 51], [30, 4280, 53.5], [60, 5320, 57.5], [90, 6080, 60.5]];
  const growth = pesagens.filter(([dd]) => dd <= idadeDias).map(([dd, w, h]) => ({ id: uid(), date: ymd(addDays(nasc, dd)), weight_g: w, height_cm: h, head_cm: null, source: 'consulta', note: dd === 0 ? 'Nascimento' : 'Puericultura', user_id: mae }));

  const supplies = [
    { name: 'Fralda tamanho M', category: 'Fraldas e higiene', unit: 'un', qty: 22, min_qty: 30, auto_type: 'fralda', per_use: 1, buyer_id: quem('pai'), note: 'Marca que não assa' },
    { name: 'Lenço umedecido', category: 'Fraldas e higiene', unit: 'pacote', qty: 3, min_qty: 2 },
    { name: 'Pomada para assaduras', category: 'Fraldas e higiene', unit: 'tubo', qty: 1, min_qty: 1 },
    { name: 'Fórmula infantil (lata 800 g)', category: 'Alimentação', unit: 'lata', qty: 1, min_qty: 1, note: 'Só para complementar com a babá' },
    { name: 'Saquinhos de leite materno', category: 'Alimentação', unit: 'un', qty: 14, min_qty: 10 },
    { name: 'Vitamina D (gotas)', category: 'Saúde e remédios', unit: 'frasco', qty: 1, min_qty: 1 },
    { name: 'Sabonete líquido infantil', category: 'Banho', unit: 'frasco', qty: 0, min_qty: 1 },
    { name: 'Body manga longa tam. M', category: 'Roupas', unit: 'un', qty: 4, min_qty: 6, note: 'Está esfriando à noite' },
  ].map((s) => ({ id: uid(), per_use: 1, auto_type: null, buyer_id: null, note: null, ...s }));

  const notes = [
    { id: uid(), text: 'Vitamina D: 2 gotas todo dia de manhã, junto com a mamada das 10h.', pinned: 1, done: 0, user_id: mae },
    { id: uid(), text: 'Leite congelado: usar sempre o mais antigo primeiro (data no saquinho).', pinned: 1, done: 0, user_id: mae },
    { id: uid(), text: 'Ela tem dormido melhor com o ruído branco ligado na soneca da tarde.', pinned: 0, done: 0, user_id: quem('baba') },
    { id: uid(), text: 'Comprar termômetro digital novo.', pinned: 0, done: 1, user_id: quem('pai') },
  ];
  const appointments = [
    { id: uid(), date: new Date(addDays(hoje, 2) + 9.5 * 3600_000).toISOString(), title: 'Consulta de puericultura (4 meses)', doctor: 'Dra. Helena', note: 'Levar a caderneta de vacinação', done: 0, user_id: mae },
    { id: uid(), date: new Date(addDays(nasc, 60) + 10 * 3600_000).toISOString(), title: 'Consulta de puericultura (2 meses)', doctor: 'Dra. Helena', done: 1, user_id: mae },
  ].filter((a) => new Date(a.date).getTime() > nasc);

  const vacinas = ['bcg', 'hepb_0', 'penta_1', 'vip_1', 'pneumo_1', 'rota_1', 'menc_1'];
  return { seed: { events, growth, supplies, notes, appointments }, vacinas: vacinas.map((c) => ({ code: c, date: ymd(addDays(nasc, c.endsWith('_0') || c === 'bcg' ? 1 : c === 'menc_1' ? 92 : 61)) })) };
}

export const nascimentoDemo = (agora = Date.now()) => ymd(addDays(startOfDay(agora), -108));

/** Rotina sugerida como ponto de partida, por faixa etária (ajustável pela família). */
export function rotinaSugerida(dias: number): Routine {
  if (dias < 90) return { wake: '06:30', bedtime: '19:30', feedIntervalMin: 180, feeds: ['06:30', '09:30', '12:30', '15:30', '18:30', '21:30', '00:30', '03:30'], naps: ['08:00', '11:00', '14:00', '16:30'] };
  if (dias < 180) return { wake: '07:00', bedtime: '19:30', feedIntervalMin: 240, feeds: ['07:00', '10:00', '13:00', '16:00', '19:00', '23:00'], naps: ['09:00', '12:00', '15:00', '17:15'] };
  if (dias < 365) return { wake: '07:00', bedtime: '19:30', feedIntervalMin: 240, feeds: ['07:00', '09:30', '12:00', '15:00', '18:00', '19:30'], naps: ['09:30', '13:30'] };
  if (dias < 1095) return { wake: '07:00', bedtime: '20:00', feeds: ['07:30', '10:00', '12:00', '15:00', '18:30'], naps: ['13:00'] };
  return { wake: '07:00', bedtime: '20:30', feeds: ['07:30', '10:00', '12:00', '15:30', '19:00'], naps: [] };
}
