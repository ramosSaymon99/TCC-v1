import type { Alimento, Avaliacao, NivelAtividade, Objetivo, Paciente, PlanoAlimentar, Refeicao, Sexo } from '../types';
import { parseDate, today } from './format';

/** Idade em anos completos na data de referência. */
export function idade(nascimento: string, ref = today()) {
  const n = parseDate(nascimento), r = parseDate(ref);
  let a = r.getFullYear() - n.getFullYear();
  if (r.getMonth() < n.getMonth() || (r.getMonth() === n.getMonth() && r.getDate() < n.getDate())) a--;
  return a;
}

export const imc = (peso: number, alturaCm: number) => (alturaCm > 0 ? peso / (alturaCm / 100) ** 2 : 0);

export function classeImc(v: number): { label: string; tone: string } {
  if (!v) return { label: '—', tone: 'gray' };
  if (v < 18.5) return { label: 'Baixo peso', tone: 'orange' };
  if (v < 25) return { label: 'Eutrofia', tone: 'green' };
  if (v < 30) return { label: 'Sobrepeso', tone: 'orange' };
  if (v < 35) return { label: 'Obesidade I', tone: 'red' };
  if (v < 40) return { label: 'Obesidade II', tone: 'red' };
  return { label: 'Obesidade III', tone: 'red' };
}

/** Faixa de peso com IMC entre 18,5 e 24,9. */
export const pesoSaudavel = (alturaCm: number) => {
  const h2 = (alturaCm / 100) ** 2;
  return [18.5 * h2, 24.9 * h2] as const;
};

/** Taxa metabólica basal — Mifflin-St Jeor (1990). */
export const tmbMifflin = (sexo: Sexo, peso: number, alturaCm: number, anos: number) =>
  10 * peso + 6.25 * alturaCm - 5 * anos + (sexo === 'M' ? 5 : -161);

/** Taxa metabólica basal — Harris-Benedict revisada (Roza & Shizgal, 1984). */
export const tmbHarris = (sexo: Sexo, peso: number, alturaCm: number, anos: number) =>
  sexo === 'M'
    ? 88.362 + 13.397 * peso + 4.799 * alturaCm - 5.677 * anos
    : 447.593 + 9.247 * peso + 3.098 * alturaCm - 4.33 * anos;

export const FATOR_ATIVIDADE: Record<NivelAtividade, number> = {
  'Sedentário': 1.2, 'Leve': 1.375, 'Moderado': 1.55, 'Intenso': 1.725, 'Muito intenso': 1.9,
};

/** Ajuste calórico e proteína (g/kg) de partida por objetivo — ponto de partida, a nutricionista ajusta. */
export const AJUSTE_OBJETIVO: Record<Objetivo, { kcal: number; protKg: number; gordPct: number }> = {
  'Emagrecimento': { kcal: -0.2, protKg: 1.6, gordPct: 0.27 },
  'Hipertrofia': { kcal: 0.1, protKg: 2.0, gordPct: 0.25 },
  'Reeducação alimentar': { kcal: 0, protKg: 1.2, gordPct: 0.28 },
  'Saúde / patologia': { kcal: 0, protKg: 1.0, gordPct: 0.28 },
  'Gestação': { kcal: 0.12, protKg: 1.2, gordPct: 0.3 },
  'Performance esportiva': { kcal: 0.05, protKg: 1.8, gordPct: 0.25 },
};

export function rcqRisco(sexo: Sexo, cintura?: number, quadril?: number) {
  if (!cintura || !quadril) return null;
  const v = cintura / quadril;
  const limite = sexo === 'F' ? 0.85 : 0.9;
  return { valor: v, elevado: v > limite };
}

export function cinturaRisco(sexo: Sexo, cintura?: number): { label: string; tone: string } | null {
  if (!cintura) return null;
  const [a, b] = sexo === 'F' ? [80, 88] : [94, 102];
  if (cintura >= b) return { label: 'Risco muito elevado', tone: 'red' };
  if (cintura >= a) return { label: 'Risco elevado', tone: 'orange' };
  return { label: 'Adequada', tone: 'green' };
}

export interface Metas { tmb: number; get: number; kcal: number; prot: number; carb: number; gord: number; agua: number }

/** Necessidades estimadas a partir do paciente e do peso informado (normalmente o da última avaliação). */
export function calcularMetas(p: Paciente, peso: number, ref = today()): Metas {
  const anos = idade(p.nascimento, ref);
  const tmb = tmbMifflin(p.sexo, peso, p.alturaCm, anos);
  const get = tmb * FATOR_ATIVIDADE[p.atividade];
  const aj = AJUSTE_OBJETIVO[p.objetivo];
  const kcal = Math.round((get * (1 + aj.kcal)) / 10) * 10;
  const prot = Math.round(aj.protKg * peso);
  const gord = Math.round((kcal * aj.gordPct) / 9);
  const carb = Math.max(0, Math.round((kcal - prot * 4 - gord * 9) / 4));
  return { tmb, get, kcal, prot, carb, gord, agua: peso * 0.035 };
}

/* ---------- Plano alimentar ---------- */
export interface Totais { kcal: number; prot: number; carb: number; gord: number; fibra: number }
const zero = (): Totais => ({ kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0 });

export function totaisItens(itens: Refeicao['itens'], alimentos: Map<string, Alimento>): Totais {
  const t = zero();
  for (const it of itens) {
    const a = alimentos.get(it.alimentoId);
    if (!a) continue;
    const f = it.gramas / 100;
    t.kcal += a.kcal * f; t.prot += a.prot * f; t.carb += a.carb * f; t.gord += a.gord * f; t.fibra += a.fibra * f;
  }
  return t;
}

export function totaisPlano(plano: PlanoAlimentar, alimentos: Map<string, Alimento>): Totais {
  return plano.refeicoes.reduce((acc, r) => {
    const t = totaisItens(r.itens, alimentos);
    return { kcal: acc.kcal + t.kcal, prot: acc.prot + t.prot, carb: acc.carb + t.carb, gord: acc.gord + t.gord, fibra: acc.fibra + t.fibra };
  }, zero());
}

/** Quantidade em medida caseira aproximada (ex.: "2 colheres de sopa"). */
export function medidaCaseira(a: Alimento, gramas: number) {
  if (!a.gMedida) return '';
  const q = Math.round((gramas / a.gMedida) * 2) / 2;
  if (q <= 0) return '';
  return `${String(q).replace('.', ',')} × ${a.medida}`;
}

/* ---------- Evolução ---------- */
export function evolucao(avs: Avaliacao[]) {
  const ord = [...avs].sort((a, b) => a.data.localeCompare(b.data));
  const primeira = ord[0], ultima = ord[ord.length - 1], penultima = ord[ord.length - 2];
  return {
    ord, primeira, ultima,
    deltaTotal: primeira && ultima ? ultima.peso - primeira.peso : 0,
    deltaUltima: penultima && ultima ? ultima.peso - penultima.peso : null,
  };
}

/** Progresso rumo ao peso meta (0–1), considerando o peso da primeira avaliação. */
export function progressoMeta(inicial?: number, atual?: number, meta?: number) {
  if (inicial === undefined || atual === undefined || !meta || inicial === meta) return null;
  return Math.max(0, Math.min(1, (inicial - atual) / (inicial - meta)));
}
