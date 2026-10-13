import type { Modulo } from '../types';

/** Módulo dono de cada rota (usado para esconder links de módulos fora do plano ou do perfil). */
const ROTAS: [string, Modulo][] = [
  ['/clientes', 'clientes'], ['/orcamentos', 'orcamentos'], ['/funil', 'funil'], ['/contratos', 'contratos'], ['/social', 'social'],
  ['/ordens', 'ordens'], ['/equipamentos', 'equipamentos'], ['/estoque', 'estoque'], ['/treinamentos', 'treinamentos'], ['/agenda', 'agenda'],
  ['/financeiro', 'financeiro'], ['/relatorios', 'relatorios'], ['/planejamento', 'planejamento'], ['/servicos', 'servicos'],
  ['/usuarios', 'usuarios'], ['/configuracoes', 'configuracoes'],
];

export const moduloDaRota = (to: string): Modulo => ROTAS.find(([r]) => to === r || to.startsWith(`${r}?`) || to.startsWith(`${r}/`))?.[1] ?? 'inicio';
