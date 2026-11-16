/**
 * Introdução alimentar: catálogo de alimentos com formas de oferecer e cortar por idade, guia e sugestões.
 * Base: Guia Alimentar para Crianças Brasileiras Menores de 2 Anos (Ministério da Saúde, 2019) e
 * orientações da Sociedade Brasileira de Pediatria. Conteúdo educativo: não substitui o pediatra.
 */

export type Grupo = 'fruta' | 'legume' | 'verdura' | 'cereal' | 'leguminosa' | 'proteina' | 'outro';
export const GRUPOS: Record<Grupo, { nome: string; emoji: string }> = {
  fruta: { nome: 'Frutas', emoji: '🍌' },
  legume: { nome: 'Legumes', emoji: '🥕' },
  verdura: { nome: 'Verduras', emoji: '🥬' },
  cereal: { nome: 'Cereais e tubérculos', emoji: '🍚' },
  leguminosa: { nome: 'Feijões', emoji: '🫘' },
  proteina: { nome: 'Carnes e ovos', emoji: '🍗' },
  outro: { nome: 'Outros', emoji: '🥜' },
};

export interface Alimento {
  id: string;
  nome: string;
  emoji: string;
  grupo: Grupo;
  /** Um dos alimentos que mais causam alergia: oferecer sozinho e observar. */
  alergenico?: boolean;
  /** Risco de engasgo se oferecido do jeito errado (formato, dureza). */
  risco?: boolean;
  /** 6 a 8 meses: bebê pega com a mão inteira (preensão palmar). */
  m6: string;
  /** 9 a 11 meses: começa o movimento de pinça (polegar e indicador). */
  m9: string;
  /** A partir de 12 meses: comida da família. */
  m12: string;
  dica?: string;
}

/** Ordem sugerida para os primeiros alimentos (sabores suaves, texturas fáceis e grupos variados). */
export const ORDEM_INICIAL = [
  'abobora', 'banana', 'batata-doce', 'abacate', 'cenoura', 'mamao', 'chuchu', 'brocolis', 'pera', 'mandioquinha',
  'feijao', 'arroz', 'frango', 'maca', 'abobrinha', 'manga', 'carne', 'ovo', 'batata', 'lentilha', 'couve-flor',
  'beterraba', 'melancia', 'peixe', 'mandioca', 'inhame', 'macarrao', 'couve', 'vagem', 'laranja', 'graodebico',
  'amendoim', 'goiaba', 'morango', 'iogurte', 'aveia', 'espinafre', 'uva', 'gergelim', 'tomate',
];

export const ALIMENTOS: Alimento[] = [
  // Frutas
  { id: 'banana', nome: 'Banana', emoji: '🍌', grupo: 'fruta', m6: 'Meia banana com parte da casca (vira um "cabo" para segurar) ou amassada com garfo.', m9: 'Rodelas cortadas ao meio ou pedaços do tamanho da ponta do dedo.', m12: 'Em pedaços ou inteira descascada, na mão.', dica: 'Passe a banana em aveia ou coco ralado sem açúcar para não escorregar da mão.' },
  { id: 'abacate', nome: 'Abacate', emoji: '🥑', grupo: 'fruta', m6: 'Fatias grossas (largura de 2 dedos) ou amassado. Bem maduro.', m9: 'Cubinhos macios.', m12: 'Cubos ou amassado no pão.', dica: 'Sem açúcar: ofereça puro ou com um pouco de banana. É rico em gordura boa.' },
  { id: 'mamao', nome: 'Mamão', emoji: '🧡', grupo: 'fruta', m6: 'Tiras grossas sem casca e sem sementes, ou amassado.', m9: 'Cubinhos.', m12: 'Cubos ou fatias.' },
  { id: 'manga', nome: 'Manga', emoji: '🥭', grupo: 'fruta', m6: 'Tiras grossas maduras ou o caroço limpo (com pouca polpa) para roer.', m9: 'Cubinhos.', m12: 'Cubos ou fatias.' },
  { id: 'maca', nome: 'Maçã', emoji: '🍎', grupo: 'fruta', risco: true, m6: 'Cozida ou assada até ficar macia, em fatias grossas, ou raspada com colher.', m9: 'Cozida em cubinhos ou crua ralada fina.', m12: 'Crua em fatias finas (não em cubos duros).', dica: 'Crua e em pedaço duro é risco de engasgo antes de 1 ano: prefira cozida.' },
  { id: 'pera', nome: 'Pera', emoji: '🍐', grupo: 'fruta', m6: 'Bem madura em fatias grossas, ou cozida, ou raspada.', m9: 'Cubinhos macios.', m12: 'Fatias finas.' },
  { id: 'melancia', nome: 'Melancia', emoji: '🍉', grupo: 'fruta', m6: 'Palitos grossos sem sementes.', m9: 'Cubinhos sem sementes.', m12: 'Fatias ou cubos.', dica: 'Ótima para dias quentes. Tire todas as sementes.' },
  { id: 'laranja', nome: 'Laranja', emoji: '🍊', grupo: 'fruta', m6: 'Gomo inteiro para o bebê chupar (sem sementes), segurado por um adulto, ou o suco no copo dentro da refeição.', m9: 'Gomos sem a película, em pedaços.', m12: 'Gomos.', dica: 'Prefira a fruta ao suco. Suco, se oferecer, só natural, sem açúcar e no copo.' },
  { id: 'goiaba', nome: 'Goiaba', emoji: '🍈', grupo: 'fruta', m6: 'Raspada ou amassada, sem sementes.', m9: 'Pedaços macios sem sementes.', m12: 'Fatias.' },
  { id: 'morango', nome: 'Morango', emoji: '🍓', grupo: 'fruta', m6: 'Inteiro e grande (o bebê roe) ou amassado.', m9: 'Cortado em 4 no comprimento.', m12: 'Em pedaços.', dica: 'Pode avermelhar a pele ao redor da boca pelo contato: isso não é necessariamente alergia.' },
  { id: 'uva', nome: 'Uva', emoji: '🍇', grupo: 'fruta', risco: true, m6: 'Amassada, sem semente.', m9: 'Cortada em 4 no comprimento, sem semente.', m12: 'Cortada em 4 no comprimento (até 4–5 anos).', dica: 'Uva inteira é uma das principais causas de engasgo: sempre cortada no comprimento.' },
  // Legumes
  { id: 'abobora', nome: 'Abóbora', emoji: '🎃', grupo: 'legume', m6: 'Cozida ou assada em palitos grossos (amassa entre os dedos) ou amassada.', m9: 'Cubinhos macios.', m12: 'Em pedaços, no prato da família.', dica: 'Sabor adocicado, costuma ser bem aceita como um dos primeiros alimentos.' },
  { id: 'batata-doce', nome: 'Batata-doce', emoji: '🍠', grupo: 'cereal', m6: 'Cozida ou assada em palitos grossos ou amassada.', m9: 'Cubinhos ou "chips" assados macios.', m12: 'Em pedaços.' },
  { id: 'cenoura', nome: 'Cenoura', emoji: '🥕', grupo: 'legume', risco: true, m6: 'Cozida até ficar macia, em palitos grossos, ou amassada.', m9: 'Cozida em rodelas cortadas ao meio ou cubinhos.', m12: 'Cozida em pedaços ou crua ralada fina.', dica: 'Crua em palito ou rodela é dura: risco de engasgo antes dos 4 anos.' },
  { id: 'chuchu', nome: 'Chuchu', emoji: '🥒', grupo: 'legume', m6: 'Cozido em palitos ou amassado.', m9: 'Cubinhos.', m12: 'Em pedaços.' },
  { id: 'abobrinha', nome: 'Abobrinha', emoji: '🥒', grupo: 'legume', m6: 'Cozida ou assada em palitos com casca (ajuda a segurar).', m9: 'Cubinhos ou meia-lua.', m12: 'Em pedaços.' },
  { id: 'brocolis', nome: 'Brócolis', emoji: '🥦', grupo: 'verdura', m6: '"Arvorezinha" cozida no vapor: o talo vira um cabo para o bebê segurar.', m9: 'Floretes pequenos picados.', m12: 'Picado no prato.', dica: 'Bem cozido, mas sem desmanchar.' },
  { id: 'couve-flor', nome: 'Couve-flor', emoji: '🥬', grupo: 'verdura', m6: 'Floretes grandes cozidos (o talo vira cabo) ou amassada.', m9: 'Pedaços pequenos.', m12: 'Picada.' },
  { id: 'beterraba', nome: 'Beterraba', emoji: '🟣', grupo: 'legume', m6: 'Cozida em palitos ou amassada.', m9: 'Cubinhos.', m12: 'Cozida em pedaços ou crua ralada.', dica: 'Pode deixar o cocô e o xixi avermelhados: é normal.' },
  { id: 'mandioquinha', nome: 'Mandioquinha', emoji: '🥔', grupo: 'cereal', m6: 'Cozida em palitos ou amassada.', m9: 'Cubinhos.', m12: 'Em pedaços.' },
  { id: 'vagem', nome: 'Vagem', emoji: '🫛', grupo: 'legume', m6: 'Cozida inteira e macia (o bebê segura pela ponta).', m9: 'Cortada em pedaços pequenos.', m12: 'Picada.' },
  { id: 'tomate', nome: 'Tomate', emoji: '🍅', grupo: 'legume', risco: true, m6: 'Tomate grande em fatias grossas sem pele, ou no molho caseiro sem sal.', m9: 'Cubinhos sem pele.', m12: 'Tomate-cereja cortado em 4 no comprimento.', dica: 'Tomate-cereja inteiro tem o mesmo risco da uva.' },
  // Verduras
  { id: 'couve', nome: 'Couve', emoji: '🥬', grupo: 'verdura', m6: 'Refogada e picada bem fino, misturada ao arroz ou ao feijão.', m9: 'Refogada picada.', m12: 'Refogada.', dica: 'Folhas cruas inteiras grudam no céu da boca: pique fino.' },
  { id: 'espinafre', nome: 'Espinafre', emoji: '🥬', grupo: 'verdura', m6: 'Cozido e picado bem fino, misturado em purê ou omelete.', m9: 'Picado em bolinhos ou omelete.', m12: 'Refogado.' },
  // Cereais e tubérculos
  { id: 'arroz', nome: 'Arroz', emoji: '🍚', grupo: 'cereal', m6: 'Bem cozido e amassado com feijão, ou em bolinhos que o bebê aperta na mão.', m9: 'Soltinho, com colher ou bolinhos.', m12: 'Como o da família, sem excesso de sal.' },
  { id: 'macarrao', nome: 'Macarrão', emoji: '🍝', grupo: 'cereal', alergenico: true, m6: 'Tipos grandes e fáceis de pegar (parafuso, penne) bem cozidos.', m9: 'Pedaços menores ou ao molho.', m12: 'Qualquer tipo.', dica: 'Contém trigo (glúten), um dos alergênicos: ofereça sozinho na primeira vez.' },
  { id: 'batata', nome: 'Batata', emoji: '🥔', grupo: 'cereal', m6: 'Cozida em palitos grossos ou amassada.', m9: 'Cubinhos.', m12: 'Em pedaços.' },
  { id: 'mandioca', nome: 'Mandioca', emoji: '🥔', grupo: 'cereal', m6: 'Bem cozida (sem o fio do meio) em palitos ou amassada.', m9: 'Pedaços pequenos.', m12: 'Em pedaços.' },
  { id: 'inhame', nome: 'Inhame', emoji: '🥔', grupo: 'cereal', m6: 'Cozido e amassado ou em palitos.', m9: 'Cubinhos.', m12: 'Em pedaços.' },
  { id: 'aveia', nome: 'Aveia', emoji: '🌾', grupo: 'cereal', m6: 'Em flocos misturada à fruta amassada, ou em panquequinha de banana com ovo.', m9: 'Mingau grosso ou panquequinhas.', m12: 'Como a família.' },
  // Feijões
  { id: 'feijao', nome: 'Feijão', emoji: '🫘', grupo: 'leguminosa', m6: 'Grãos amassados com o caldo, misturados ao arroz.', m9: 'Grãos levemente amassados.', m12: 'Inteiro, como o da família.', dica: 'Inclua em todo almoço e jantar: é a principal fonte de ferro vegetal.' },
  { id: 'lentilha', nome: 'Lentilha', emoji: '🫘', grupo: 'leguminosa', m6: 'Bem cozida e amassada, ou em bolinhos.', m9: 'Cozida e soltinha.', m12: 'Como a família.' },
  { id: 'graodebico', nome: 'Grão-de-bico', emoji: '🫘', grupo: 'leguminosa', risco: true, m6: 'Amassado (homus sem sal) ou em bolinhos.', m9: 'Amassado levemente com garfo.', m12: 'Amassado ou cortado ao meio.', dica: 'Inteiro é pequeno e firme: risco de engasgo antes de 1 ano.' },
  // Carnes e ovos
  { id: 'frango', nome: 'Frango', emoji: '🍗', grupo: 'proteina', m6: 'Desfiado bem fino e misturado, ou coxa cozida inteira (sem ossinhos soltos) para roer.', m9: 'Desfiado ou picado bem pequeno.', m12: 'Em pedaços pequenos.' },
  { id: 'carne', nome: 'Carne bovina', emoji: '🥩', grupo: 'proteina', m6: 'Moída e cozida, ou tiras grandes e macias para chupar o caldo.', m9: 'Moída, desfiada ou almôndegas.', m12: 'Pedaços pequenos e macios.', dica: 'Fonte importante de ferro: ofereça carne todos os dias em pequena quantidade.' },
  { id: 'peixe', nome: 'Peixe', emoji: '🐟', grupo: 'proteina', alergenico: true, m6: 'Lascas cozidas, conferindo uma a uma se não há espinhas.', m9: 'Lascas ou bolinhos.', m12: 'Em pedaços.', dica: 'Alergênico: na primeira vez, ofereça sozinho e observe.' },
  { id: 'ovo', nome: 'Ovo', emoji: '🥚', grupo: 'proteina', alergenico: true, m6: 'Bem cozido (gema e clara firmes) em quartos no comprimento, ou omelete em tiras.', m9: 'Picado ou mexido bem cozido.', m12: 'Como a família.', dica: 'Pode ser oferecido inteiro (gema e clara) desde os 6 meses, sempre bem cozido.' },
  // Outros (alergênicos)
  { id: 'amendoim', nome: 'Amendoim', emoji: '🥜', grupo: 'outro', alergenico: true, risco: true, m6: 'Pasta de amendoim pura (sem açúcar) bem fina, espalhada numa fruta ou diluída no mingau.', m9: 'Pasta fina em torradinha ou fruta.', m12: 'Pasta. Nunca inteiro antes dos 4–5 anos.', dica: 'Amendoim e castanhas inteiros são proibidos para crianças pequenas pelo risco de engasgo.' },
  { id: 'iogurte', nome: 'Iogurte natural', emoji: '🥛', grupo: 'outro', alergenico: true, m6: 'Converse com o pediatra: em geral, iogurte natural integral sem açúcar pode entrar como parte da refeição.', m9: 'Natural integral, puro ou com fruta amassada.', m12: 'Natural integral.', dica: 'Contém proteína do leite de vaca (alergênico). Nunca iogurtes adoçados ou "infantis" com açúcar.' },
  { id: 'gergelim', nome: 'Gergelim', emoji: '⚪', grupo: 'outro', alergenico: true, m6: 'Tahine (pasta de gergelim) bem fino, misturado ao homus ou ao purê.', m9: 'Tahine ou sementes moídas.', m12: 'Como a família.' },
];

/** Normaliza nomes para comparar com o que a família já registrou. */
export const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const porId = (id: string) => ALIMENTOS.find((a) => a.id === id);

/** Já oferecido? Compara com os nomes registrados (ex.: "Abóbora", "abobora cabotiá"). */
export function jaOferecido(a: Alimento, oferecidos: string[]) {
  // compara por palavras inteiras: "Abóbora cabotiá" conta como Abóbora, mas "Batata-doce" não conta como Batata
  const palavras = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const n = palavras(a.nome);
  return oferecidos.some((o) => { const c = palavras(o); return c === n || c.startsWith(n + ' ') && !ALIMENTOS.some((b) => b !== a && palavras(b.nome) !== n && c.startsWith(palavras(b.nome))); });
}

/** Fase pela idade (meses), para mostrar a forma de oferecer certa. */
export const fase = (meses: number): 'm6' | 'm9' | 'm12' => (meses < 9 ? 'm6' : meses < 12 ? 'm9' : 'm12');
export const NOME_FASE = { m6: '6 a 8 meses', m9: '9 a 11 meses', m12: 'a partir de 1 ano' } as const;

/**
 * Sugestões: o próximo alimento novo e um plano de 7 dias (um alimento novo por dia), seguindo a ordem
 * inicial, variando os grupos e trazendo um alergênico depois que a criança já experimentou alguns alimentos.
 */
export function sugestoes(oferecidos: string[]) {
  const faltam = ORDEM_INICIAL.map(porId).filter((a): a is Alimento => !!a && !jaOferecido(a, oferecidos));
  const plano: Alimento[] = [];
  const provados = ALIMENTOS.filter((a) => jaOferecido(a, oferecidos)).length;
  for (const a of faltam) {
    if (plano.length >= 7) break;
    // não repetir o mesmo grupo em dias seguidos
    if (plano.length && plano[plano.length - 1].grupo === a.grupo && faltam.some((b) => !plano.includes(b) && b.grupo !== a.grupo)) continue;
    // alergênicos só depois de 5 alimentos e no máximo um por semana
    if (a.alergenico && (provados + plano.length < 5 || plano.some((p) => p.alergenico))) continue;
    plano.push(a);
  }
  for (const a of faltam) { if (plano.length >= 7) break; if (!plano.includes(a)) plano.push(a); }
  return { hoje: plano[0] ?? null, semana: plano, provados, total: ALIMENTOS.length };
}

/** Quantidade aproximada por refeição principal (almoço/jantar), Guia Alimentar MS. */
export const QUANTIDADES = [
  { idade: '6 meses', qtd: '2 a 3 colheres de sopa no total', refeicoes: 'Leite materno + 1 fruta (lanche) + almoço' },
  { idade: '7 a 8 meses', qtd: '3 a 4 colheres de sopa no total', refeicoes: 'Leite materno + 2 frutas + almoço + jantar' },
  { idade: '9 a 11 meses', qtd: '4 a 5 colheres de sopa no total', refeicoes: 'Leite materno + 2 frutas + almoço + jantar' },
  { idade: '12 a 24 meses', qtd: '5 a 6 colheres de sopa no total', refeicoes: 'Leite materno + café da manhã + 2 lanches + almoço + jantar' },
];

export const PRONTIDAO = [
  'Tem por volta de 6 meses',
  'Senta com pouco ou nenhum apoio e firma bem a cabeça',
  'Não empurra mais a comida para fora com a língua',
  'Mostra interesse: observa, abre a boca, tenta pegar a comida',
];

export const METODOS = [
  { nome: 'Tradicional (colher)', texto: 'Comida amassada com garfo (nunca liquidificada ou peneirada), oferecida com colher. A textura vai ficando mais grossa até a comida da família por volta de 1 ano.' },
  { nome: 'BLW (o bebê se alimenta sozinho)', texto: 'Alimentos macios em pedaços que o bebê segura com a mão: palitos aos 6 meses, pedaços menores a partir dos 9. Exige atenção ao formato e à textura.' },
  { nome: 'Participativo (misto)', texto: 'Junta os dois: a família oferece na colher e o bebê também pega pedaços com a mão. É o mais comum e flexível.' },
];

export const PRATO = [
  { emoji: '🍚', parte: 'Cereal ou tubérculo', ex: 'arroz, batata, mandioca, macarrão' },
  { emoji: '🫘', parte: 'Feijão ou leguminosa', ex: 'feijão, lentilha, grão-de-bico (amassados)' },
  { emoji: '🍗', parte: 'Carne ou ovo', ex: 'frango, carne, peixe, ovo bem cozido' },
  { emoji: '🥦', parte: 'Legumes e verduras', ex: '1 ou 2: abóbora, cenoura, brócolis, couve' },
];

export const EVITAR = [
  { emoji: '🍯', item: 'Mel', motivo: 'Risco de botulismo antes de 1 ano.' },
  { emoji: '🍬', item: 'Açúcar e doces', motivo: 'Nada de açúcar, doces, biscoitos recheados e sucos adoçados antes dos 2 anos.' },
  { emoji: '🧂', item: 'Sal e temperos prontos', motivo: 'Sem sal até 1 ano. Tempere com cebola, alho, salsinha, cebolinha e ervas.' },
  { emoji: '🍟', item: 'Ultraprocessados', motivo: 'Embutidos (salsicha, presunto), salgadinhos, macarrão instantâneo, refrigerante.' },
  { emoji: '🥛', item: 'Leite de vaca como bebida', motivo: 'Mantenha o leite materno. Leite de vaca puro como bebida só com orientação do pediatra.' },
  { emoji: '🥜', item: 'Alimentos duros, redondos e pequenos', motivo: 'Amendoim e castanhas inteiros, pipoca, uva e tomate-cereja inteiros, salsicha em rodelas, bala.' },
];

export const SEGURANCA = [
  'Sempre sentado, ereto, de frente para a mesa, nunca deitado, andando ou no carro.',
  'Um adulto sempre ao lado, olhando, durante toda a refeição.',
  'Engasgo de verdade é silencioso (não tosse, não chora, fica roxo): é emergência.',
  'Tossir, fazer careta e ânsia (reflexo de gag) é normal e protege: espere, não coloque o dedo na boca.',
  'Vale a pena a família fazer um curso de primeiros socorros para bebês.',
];

export const DICAS_GERAIS = [
  'Ofereça o mesmo alimento de 8 a 15 vezes, em dias diferentes, antes de concluir que a criança não gosta.',
  'Um alimento novo por vez, principalmente os alergênicos: assim fica fácil saber o que causou uma reação.',
  'Deixe o bebê tocar, amassar e se sujar: faz parte do aprendizado.',
  'Ofereça água nos intervalos das refeições, no copo aberto.',
  'Coma junto com o bebê: ele aprende imitando a família.',
  'Respeite a fome e a saciedade: não insista nem distraia com telas para "comer mais".',
];
