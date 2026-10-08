import type { Alimento, Refeicao } from '../types';
import { uid } from '../utils/format';
import type { Metas } from '../utils/nutri';

/** Estrutura de partida (~1.800 kcal) usada para gerar a sugestão de plano escalada para a meta do paciente. */
const BASE: { nome: string; hora: string; itens: [string, number][] }[] = [
  { nome: 'Café da manhã', hora: '07:00', itens: [['al-pao-de-forma-integral', 50], ['al-ovo-de-galinha-cozido', 100], ['al-mamao-papaia', 150], ['al-cafe-sem-acucar', 50]] },
  { nome: 'Lanche da manhã', hora: '10:00', itens: [['al-iogurte-natural-desnatado', 170], ['al-aveia-em-flocos', 20]] },
  { nome: 'Almoço', hora: '12:30', itens: [['al-arroz-integral-cozido', 120], ['al-feijao-carioca-cozido', 85], ['al-peito-de-frango-grelhado', 120], ['al-alface-crespa', 40], ['al-tomate', 60], ['al-azeite-de-oliva-extravirgem', 8]] },
  { nome: 'Lanche da tarde', hora: '16:00', itens: [['al-banana-prata', 55], ['al-pasta-de-amendoim-integral', 15]] },
  { nome: 'Jantar', hora: '19:30', itens: [['al-batata-doce-cozida', 120], ['al-tilapia-grelhada', 120], ['al-brocolis-cozido', 80], ['al-azeite-de-oliva-extravirgem', 5]] },
];

export const NOMES_REFEICAO = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Pré-treino', 'Pós-treino'];

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);

/** Fontes de proteína do modelo: ajustadas primeiro para bater a meta de proteína. */
const PROTEICOS = new Set(['al-ovo-de-galinha-cozido', 'al-iogurte-natural-desnatado', 'al-peito-de-frango-grelhado', 'al-tilapia-grelhada']);
/** Bebidas, folhas e azeite ficam fixos. */
const FIXOS = new Set(['al-cafe-sem-acucar', 'al-alface-crespa', 'al-tomate', 'al-azeite-de-oliva-extravirgem']);

export function sugerirRefeicoes(metas: Metas, alimentos: Alimento[]): Refeicao[] {
  const map = new Map(alimentos.map((a) => [a.id, a]));
  const base = BASE.map((r) => ({ ...r, itens: r.itens.filter(([id]) => map.has(id)) }));
  const montar = (fp: number, fr: number): Refeicao[] => base.map((r) => ({
    id: uid(), nome: r.nome, hora: r.hora,
    itens: r.itens.map(([alimentoId, g]) => ({ alimentoId, gramas: FIXOS.has(alimentoId) ? g : round5(g * (PROTEICOS.has(alimentoId) ? fp : fr)) })),
  }));
  const parcial = (fp: number, fr: number, grupo: 'P' | 'R' | 'F') => {
    const t = { kcal: 0, prot: 0 };
    for (const r of base) for (const [id, g] of r.itens) {
      const tipo = FIXOS.has(id) ? 'F' : PROTEICOS.has(id) ? 'P' : 'R';
      if (tipo !== grupo) continue;
      const a = map.get(id)!, q = (g * (tipo === 'P' ? fp : tipo === 'R' ? fr : 1)) / 100;
      t.kcal += a.kcal * q; t.prot += a.prot * q;
    }
    return t;
  };
  // Ajuste alternado: proteína pelas fontes proteicas, energia restante pelos demais alimentos
  let fp = 1, fr = 1;
  for (let i = 0; i < 8; i++) {
    const P = parcial(1, fr, 'P'), R = parcial(fp, fr, 'R'), F = parcial(fp, fr, 'F');
    fp = Math.min(3, Math.max(0.3, (metas.prot - R.prot - F.prot) / (P.prot || 1)));
    const P2 = parcial(fp, fr, 'P'), R1 = parcial(fp, 1, 'R');
    fr = Math.min(3, Math.max(0.3, (metas.kcal - P2.kcal - F.kcal) / (R1.kcal || 1)));
  }
  return montar(fp, fr);
}

export const ORIENTACOES_PADRAO = [
  'Beber água ao longo do dia (meta diária indicada no plano).',
  'Mastigar devagar e fazer as refeições sem telas, sempre que possível.',
  'Priorizar alimentos in natura; evitar ultraprocessados e bebidas açucaradas.',
  'As quantidades podem ser substituídas por alimentos do mesmo grupo — em caso de dúvida, fale comigo.',
].join('\n');
