import type { Alimento } from '../types';

/**
 * Valores por 100 g, aproximados a partir da TACO (NEPA/Unicamp) e, na falta dela, da USDA FoodData Central.
 * Base de partida: a nutricionista pode editar e cadastrar novos alimentos na tela "Alimentos".
 */
type Row = [nome: string, grupo: string, kcal: number, prot: number, carb: number, gord: number, fibra: number, medida: string, gMedida: number];

const ROWS: Row[] = [
  ['Arroz branco cozido', 'Cereais e tubérculos', 128, 2.5, 28.1, 0.2, 1.6, 'colher de servir', 45],
  ['Arroz integral cozido', 'Cereais e tubérculos', 124, 2.6, 25.8, 1.0, 2.7, 'colher de servir', 45],
  ['Macarrão cozido', 'Cereais e tubérculos', 157, 5.8, 30.9, 0.9, 1.8, 'pegador', 60],
  ['Cuscuz de milho cozido', 'Cereais e tubérculos', 113, 2.2, 25.3, 0.7, 2.1, 'fatia média', 80],
  ['Pão francês', 'Cereais e tubérculos', 300, 8.0, 58.6, 3.1, 2.3, 'unidade', 50],
  ['Pão de forma integral', 'Cereais e tubérculos', 253, 9.4, 49.9, 3.7, 6.9, 'fatia', 25],
  ['Tapioca (goma hidratada)', 'Cereais e tubérculos', 240, 0.0, 60.0, 0.0, 0.5, 'colher de sopa', 20],
  ['Aveia em flocos', 'Cereais e tubérculos', 394, 13.9, 66.6, 8.5, 9.1, 'colher de sopa', 15],
  ['Granola sem açúcar', 'Cereais e tubérculos', 420, 10.0, 65.0, 13.0, 7.0, 'colher de sopa', 12],
  ['Batata-doce cozida', 'Cereais e tubérculos', 77, 0.6, 18.4, 0.1, 2.2, 'fatia média', 40],
  ['Batata inglesa cozida', 'Cereais e tubérculos', 52, 1.2, 11.9, 0.0, 1.3, 'unidade média', 90],
  ['Mandioca cozida', 'Cereais e tubérculos', 125, 0.6, 30.1, 0.3, 1.6, 'pedaço médio', 50],
  ['Quinoa cozida', 'Cereais e tubérculos', 120, 4.4, 21.3, 1.9, 2.8, 'colher de sopa', 20],
  ['Feijão carioca cozido', 'Leguminosas', 76, 4.8, 13.6, 0.5, 8.5, 'concha média', 85],
  ['Feijão preto cozido', 'Leguminosas', 77, 4.5, 14.0, 0.5, 8.4, 'concha média', 85],
  ['Lentilha cozida', 'Leguminosas', 93, 6.3, 16.3, 0.5, 7.9, 'concha média', 85],
  ['Grão-de-bico cozido', 'Leguminosas', 164, 8.9, 27.4, 2.6, 7.6, 'colher de sopa', 22],
  ['Tofu', 'Leguminosas', 76, 8.1, 1.9, 4.8, 0.3, 'fatia', 40],
  ['Peito de frango grelhado', 'Carnes e ovos', 159, 32.0, 0.0, 2.5, 0.0, 'filé médio', 100],
  ['Patinho grelhado', 'Carnes e ovos', 219, 35.9, 0.0, 7.3, 0.0, 'bife médio', 100],
  ['Carne moída refogada', 'Carnes e ovos', 212, 26.7, 0.0, 10.9, 0.0, 'colher de sopa', 25],
  ['Tilápia grelhada', 'Carnes e ovos', 128, 26.0, 0.0, 2.7, 0.0, 'filé médio', 120],
  ['Salmão grelhado', 'Carnes e ovos', 229, 26.1, 0.0, 13.0, 0.0, 'posta média', 120],
  ['Atum em água (lata)', 'Carnes e ovos', 116, 25.5, 0.0, 0.8, 0.0, 'colher de sopa', 20],
  ['Ovo de galinha cozido', 'Carnes e ovos', 146, 13.3, 0.6, 9.5, 0.0, 'unidade', 50],
  ['Clara de ovo cozida', 'Carnes e ovos', 52, 10.9, 0.7, 0.2, 0.0, 'unidade', 33],
  ['Peito de peru fatiado', 'Carnes e ovos', 110, 18.0, 3.0, 2.5, 0.0, 'fatia', 15],
  ['Leite desnatado', 'Leite e derivados', 35, 3.4, 4.9, 0.1, 0.0, 'copo (200 ml)', 200],
  ['Leite integral', 'Leite e derivados', 61, 3.2, 4.7, 3.3, 0.0, 'copo (200 ml)', 200],
  ['Iogurte natural integral', 'Leite e derivados', 51, 4.1, 1.9, 3.0, 0.0, 'pote', 170],
  ['Iogurte natural desnatado', 'Leite e derivados', 41, 3.8, 5.8, 0.3, 0.0, 'pote', 170],
  ['Queijo minas frescal', 'Leite e derivados', 264, 17.4, 3.2, 20.2, 0.0, 'fatia média', 30],
  ['Queijo cottage', 'Leite e derivados', 98, 11.1, 3.4, 4.3, 0.0, 'colher de sopa', 30],
  ['Whey protein (concentrado)', 'Suplementos', 400, 80.0, 8.0, 6.0, 0.0, 'scoop', 30],
  ['Banana prata', 'Frutas', 98, 1.3, 26.0, 0.1, 2.0, 'unidade média', 55],
  ['Maçã fuji', 'Frutas', 56, 0.3, 15.2, 0.0, 1.3, 'unidade média', 130],
  ['Mamão papaia', 'Frutas', 40, 0.5, 10.4, 0.1, 1.0, 'meia unidade', 150],
  ['Morango', 'Frutas', 30, 0.9, 6.8, 0.3, 1.7, 'unidade', 12],
  ['Laranja pera', 'Frutas', 37, 1.0, 8.9, 0.1, 0.8, 'unidade média', 140],
  ['Manga palmer', 'Frutas', 72, 0.4, 19.4, 0.2, 1.6, 'fatia', 80],
  ['Melancia', 'Frutas', 33, 0.9, 8.1, 0.0, 0.1, 'fatia média', 200],
  ['Uva', 'Frutas', 53, 0.7, 13.6, 0.2, 0.9, 'cacho pequeno', 100],
  ['Abacate', 'Frutas', 96, 1.2, 6.0, 8.4, 6.3, 'colher de sopa', 30],
  ['Alface crespa', 'Verduras e legumes', 11, 1.3, 1.7, 0.2, 1.8, 'folha', 10],
  ['Tomate', 'Verduras e legumes', 15, 1.1, 3.1, 0.2, 1.2, 'unidade média', 100],
  ['Brócolis cozido', 'Verduras e legumes', 25, 2.1, 4.4, 0.5, 3.4, 'ramo', 20],
  ['Cenoura crua ralada', 'Verduras e legumes', 34, 1.3, 7.7, 0.2, 3.2, 'colher de sopa', 12],
  ['Abobrinha refogada', 'Verduras e legumes', 15, 1.1, 3.0, 0.2, 1.6, 'colher de sopa', 25],
  ['Beterraba cozida', 'Verduras e legumes', 32, 1.3, 7.2, 0.1, 1.9, 'colher de sopa', 25],
  ['Couve refogada', 'Verduras e legumes', 90, 1.7, 8.7, 6.6, 5.7, 'colher de sopa', 20],
  ['Azeite de oliva extravirgem', 'Óleos e oleaginosas', 884, 0.0, 0.0, 100.0, 0.0, 'colher de sopa', 8],
  ['Manteiga', 'Óleos e oleaginosas', 726, 0.4, 0.0, 82.0, 0.0, 'ponta de faca', 5],
  ['Castanha-do-pará', 'Óleos e oleaginosas', 643, 14.5, 15.1, 63.5, 7.9, 'unidade', 4],
  ['Pasta de amendoim integral', 'Óleos e oleaginosas', 588, 25.1, 20.1, 50.4, 6.0, 'colher de sopa', 15],
  ['Chia', 'Óleos e oleaginosas', 486, 16.5, 42.1, 30.7, 34.4, 'colher de sopa', 10],
  ['Mel', 'Outros', 309, 0.0, 84.0, 0.0, 0.0, 'colher de sopa', 15],
  ['Chocolate 70% cacau', 'Outros', 598, 7.8, 45.9, 42.6, 10.9, 'quadrado', 5],
  ['Café sem açúcar', 'Outros', 2, 0.1, 0.3, 0.0, 0.0, 'xícara (50 ml)', 50],
];

export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const ALIMENTOS_BASE: Alimento[] = ROWS.map(([nome, grupo, kcal, prot, carb, gord, fibra, medida, gMedida]) => ({
  id: `al-${slug(nome)}`, nome, grupo, kcal, prot, carb, gord, fibra, medida, gMedida,
}));
