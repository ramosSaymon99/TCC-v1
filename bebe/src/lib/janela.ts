/**
 * Janela de sono (tempo acordado entre um sono e outro) — usada no app e no servidor (aviso no celular).
 * Sem dependências: recebe só os registros de sono e a idade em dias.
 *
 * Referência por idade: faixas aproximadas de tempo acordado usadas em orientação de sono infantil.
 * Quando há histórico suficiente (≥ 4 sonecas na última semana), a previsão usa o ritmo do próprio bebê,
 * limitado a uma margem em torno da referência da idade.
 */
export interface SonoMin { start_at: string; end_at?: string | null }

const REF: [number, number, number][] = [
  // [até dias de vida, mínimo acordado (min), máximo acordado (min)]
  [28, 35, 60],
  [60, 45, 75],
  [90, 60, 90],
  [120, 75, 120],
  [180, 105, 150],
  [240, 120, 180],
  [300, 150, 210],
  [365, 180, 240],
  [545, 240, 330],
  [Infinity, 300, 360],
];

export function janelaReferencia(dias: number) {
  const r = REF.find(([ate]) => dias <= ate)!;
  return { min: r[1], max: r[2] };
}

const ms = (iso: string) => new Date(iso).getTime();

/** Tempo acordado antes de cada soneca da última semana (em minutos). */
export function temposAcordado(sonos: SonoMin[], agora: number) {
  const ord = sonos.filter((s) => s.end_at && ms(s.start_at) > agora - 7 * 86400_000).sort((a, b) => ms(a.start_at) - ms(b.start_at));
  const out: number[] = [];
  for (let i = 1; i < ord.length; i++) {
    const dur = (ms(ord[i].end_at!) - ms(ord[i].start_at)) / 60000;
    if (dur > 4 * 60) continue; // sono noturno longo não é soneca
    const acordado = (ms(ord[i].start_at) - ms(ord[i - 1].end_at!)) / 60000;
    if (acordado > 10 && acordado < 8 * 60) out.push(acordado);
  }
  return out;
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Janela ideal (minutos acordado) para a próxima soneca: do histórico do bebê ou da idade. */
export function janelaSono(dias: number, sonos: SonoMin[], agora: number) {
  const ref = janelaReferencia(dias);
  const hist = temposAcordado(sonos, agora);
  if (hist.length >= 4) {
    const m = Math.min(ref.max * 1.2, Math.max(ref.min * 0.8, mediana(hist)));
    return { min: Math.round(m - 10), max: Math.round(m + 15), fonte: 'historico' as const, amostras: hist.length, ref };
  }
  return { min: ref.min, max: ref.max, fonte: 'idade' as const, amostras: hist.length, ref };
}

/** Próxima soneca: a partir de quando acordou. `null` se está dormindo ou sem registro de sono. */
export function proximaSoneca(dias: number, sonos: SonoMin[], agora: number) {
  if (sonos.some((s) => !s.end_at)) return null;
  const ult = sonos.filter((s) => s.end_at).sort((a, b) => ms(b.end_at!) - ms(a.end_at!))[0];
  if (!ult) return null;
  const acordou = ms(ult.end_at!);
  const j = janelaSono(dias, sonos, agora);
  return { acordou, ini: acordou + j.min * 60000, fim: acordou + j.max * 60000, acordadoMin: (agora - acordou) / 60000, janela: j };
}
