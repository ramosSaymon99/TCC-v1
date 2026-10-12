/**
 * Conteúdo de referência da fase bebê. Faixas aproximadas, sempre com a orientação de conversar com o pediatra.
 * Fontes: Caderneta da Criança (Ministério da Saúde), Sociedade Brasileira de Pediatria (SBP),
 * Guia Alimentar para Crianças Brasileiras Menores de 2 Anos (MS) e Rede Brasileira de Bancos de Leite Humano.
 */

/** Marcos do desenvolvimento: [código, descrição, mês em que costuma aparecer, mês-limite para conversar com o pediatra]. */
export const MARCOS: { code: string; nome: string; de: number; ate: number; area: string }[] = [
  { code: 'sorriso', nome: 'Sorriso social (sorri de volta)', de: 1, ate: 3, area: 'Social' },
  { code: 'olhar', nome: 'Acompanha objetos e rostos com o olhar', de: 1, ate: 3, area: 'Visão' },
  { code: 'sons', nome: 'Emite sons (arrulhos, "aaa", "ooo")', de: 2, ate: 4, area: 'Linguagem' },
  { code: 'cabeca', nome: 'Sustenta a cabeça', de: 2, ate: 4, area: 'Motor' },
  { code: 'pega', nome: 'Pega objetos e leva à boca', de: 3, ate: 6, area: 'Motor fino' },
  { code: 'rola', nome: 'Rola (de barriga para cima e para baixo)', de: 4, ate: 7, area: 'Motor' },
  { code: 'senta', nome: 'Senta sem apoio', de: 6, ate: 9, area: 'Motor' },
  { code: 'balbucia', nome: 'Balbucia ("dadada", "bababa")', de: 6, ate: 9, area: 'Linguagem' },
  { code: 'nome', nome: 'Reage quando chamam pelo nome', de: 6, ate: 9, area: 'Social' },
  { code: 'engatinha', nome: 'Engatinha ou se arrasta', de: 7, ate: 12, area: 'Motor' },
  { code: 'tchau', nome: 'Dá tchau ou bate palmas', de: 9, ate: 12, area: 'Social' },
  { code: 'pinca', nome: 'Pega pequenos objetos com o polegar e o indicador (pinça)', de: 9, ate: 12, area: 'Motor fino' },
  { code: 'em_pe', nome: 'Fica em pé com apoio', de: 9, ate: 12, area: 'Motor' },
  { code: 'palavras', nome: 'Primeiras palavras com sentido ("mamã", "papá")', de: 10, ate: 15, area: 'Linguagem' },
  { code: 'anda', nome: 'Anda sozinho', de: 12, ate: 18, area: 'Motor' },
];

/** Triagens neonatais (o "checklist do recém-nascido"). */
export const TESTES_RN: { code: string; nome: string; quando: string; dias: number }[] = [
  { code: 'coracao', nome: 'Teste do coraçãozinho (oximetria)', quando: 'Na maternidade, entre 24 e 48 h de vida', dias: 2 },
  { code: 'olhinho', nome: 'Teste do olhinho (reflexo vermelho)', quando: 'Na maternidade e nas consultas de rotina', dias: 3 },
  { code: 'linguinha', nome: 'Teste da linguinha (frênulo)', quando: 'Na maternidade', dias: 3 },
  { code: 'pezinho', nome: 'Teste do pezinho', quando: 'Entre o 3º e o 5º dia de vida', dias: 5 },
  { code: 'orelhinha', nome: 'Teste da orelhinha (triagem auditiva)', quando: 'Até 1 mês de vida (de preferência na maternidade)', dias: 30 },
];
export const RESULTADOS_TESTE = [
  { v: 'normal', l: '✅ Normal' },
  { v: 'refazer', l: '🔁 Refazer' },
  { v: 'alterado', l: '⚠️ Alterado' },
] as const;

/** Alimentos que mais causam alergia: oferecer um por vez e observar (a partir dos 6 meses). */
export const ALERGENOS = ['Leite de vaca', 'Ovo', 'Trigo', 'Soja', 'Amendoim', 'Castanhas', 'Peixe', 'Frutos do mar', 'Gergelim'];
export const REACOES = ['Sem reação', 'Manchas ou vermelhidão na pele', 'Coceira', 'Inchaço (lábios, olhos)', 'Vômito', 'Diarreia', 'Recusou o alimento'];

export const SINTOMAS = ['Tosse', 'Coriza / nariz entupido', 'Vômito', 'Diarreia', 'Manchas na pele', 'Irritabilidade', 'Recusa para mamar', 'Sonolência excessiva', 'Dificuldade para respirar'];
/** Sintomas que pedem atendimento sem esperar (qualquer idade). */
export const SINTOMAS_URGENTES = ['Dificuldade para respirar', 'Sonolência excessiva', 'Manchas na pele'];

/** Orientação de febre (temperatura axilar), SBP. */
export function avaliarFebre(temp: number | undefined, diasDeVida: number, sintomas: string[] = []) {
  const urgente = sintomas.filter((s) => SINTOMAS_URGENTES.includes(s));
  if (urgente.length) return { nivel: 'alerta' as const, texto: `${urgente.join(', ')}: procure atendimento médico agora.` };
  if (temp == null) return null;
  if (temp >= 37.8 && diasDeVida < 90) return { nivel: 'alerta' as const, texto: 'Febre em bebê com menos de 3 meses: procure atendimento médico imediatamente.' };
  if (temp >= 39.5) return { nivel: 'alerta' as const, texto: 'Febre alta: fale com o pediatra ou procure atendimento.' };
  if (temp >= 37.8) return { nivel: 'atencao' as const, texto: 'Febre. Ofereça mais mamadas, observe o estado geral e siga a orientação do pediatra. Febre por mais de 48 h pede avaliação.' };
  if (temp < 35.5) return { nivel: 'atencao' as const, texto: 'Temperatura baixa: aqueça o bebê, meça de novo e fale com o pediatra se continuar.' };
  return { nivel: 'ok' as const, texto: 'Temperatura normal.' };
}

/** Leite materno extraído: validade (Rede Brasileira de Bancos de Leite Humano). */
export const VALIDADE_LEITE_H = { geladeira: 12, congelador: 15 * 24 } as const;

/** Mala da maternidade. */
export const MALA: { code: string; nome: string; grupo: 'Bebê' | 'Mãe' | 'Documentos' }[] = [
  { code: 'b_bodies', nome: '6 bodies e 6 mijões (tamanho RN e P)', grupo: 'Bebê' },
  { code: 'b_saida', nome: 'Roupa de saída da maternidade', grupo: 'Bebê' },
  { code: 'b_manta', nome: 'Manta ou cueiro', grupo: 'Bebê' },
  { code: 'b_meias', nome: 'Meias, luvas e touca', grupo: 'Bebê' },
  { code: 'b_fraldas', nome: 'Fraldas RN e lenços umedecidos', grupo: 'Bebê' },
  { code: 'b_cadeirinha', nome: 'Bebê-conforto instalado no carro', grupo: 'Bebê' },
  { code: 'm_camisolas', nome: 'Camisolas ou pijamas abertos na frente', grupo: 'Mãe' },
  { code: 'm_sutia', nome: 'Sutiã de amamentação e absorventes para seios', grupo: 'Mãe' },
  { code: 'm_absorventes', nome: 'Absorventes pós-parto e calcinhas confortáveis', grupo: 'Mãe' },
  { code: 'm_higiene', nome: 'Itens de higiene pessoal', grupo: 'Mãe' },
  { code: 'm_carregador', nome: 'Carregador de celular', grupo: 'Mãe' },
  { code: 'd_documentos', nome: 'Documentos com foto e cartão do plano/SUS', grupo: 'Documentos' },
  { code: 'd_prenatal', nome: 'Cartão da gestante e exames do pré-natal', grupo: 'Documentos' },
];

/** Dica da semana pela idade (semanas de vida). */
export const DICAS: { ate: number; titulo: string; texto: string; fonte: string }[] = [
  { ate: 1, titulo: 'Primeiros dias', texto: 'Amamente em livre demanda: 8 a 12 mamadas por dia é o esperado. A partir do 5º dia, 6 ou mais fraldas de xixi por dia indicam que o bebê está mamando bem.', fonte: 'SBP / Ministério da Saúde' },
  { ate: 2, titulo: 'Coto umbilical', texto: 'Mantenha o coto limpo e seco (álcool 70% a cada troca, se orientado na maternidade). Ele costuma cair entre 7 e 15 dias. Vermelhidão ao redor ou mau cheiro pedem avaliação.', fonte: 'Ministério da Saúde' },
  { ate: 4, titulo: 'Sono seguro', texto: 'Sempre de barriga para cima, em berço firme e sem travesseiros, protetores, cobertores soltos ou bichinhos. É a principal proteção contra a morte súbita do lactente.', fonte: 'SBP' },
  { ate: 6, titulo: 'Pico de choro', texto: 'O choro costuma aumentar por volta de 6 semanas e diminuir depois. Confira fome, fralda, sono e calor. Choro inconsolável ou com febre: fale com o pediatra.', fonte: 'SBP' },
  { ate: 9, titulo: 'Vacinas dos 2 meses', texto: 'Pentavalente, VIP (pólio), Pneumocócica 10 e Rotavírus. Leve a caderneta e marque na aba Saúde quando aplicar.', fonte: 'Programa Nacional de Imunizações' },
  { ate: 12, titulo: 'Tempo de bruços', texto: 'Alguns minutos de barriga para baixo, acordado e sempre com um adulto olhando, fortalecem pescoço e ombros.', fonte: 'SBP' },
  { ate: 17, titulo: 'Sono mais picado', texto: 'Perto dos 4 meses o sono pode ficar mais curto e com mais despertares. É comum e passa. Um ritual curto antes de dormir (banho, luz baixa, mamada) ajuda.', fonte: 'SBP' },
  { ate: 26, titulo: 'Leite materno exclusivo', texto: 'Até os 6 meses, só leite materno: não é preciso oferecer água, chás ou sucos. Se usa fórmula, siga a diluição indicada pelo pediatra.', fonte: 'Ministério da Saúde / OMS' },
  { ate: 30, titulo: 'Início da introdução alimentar', texto: 'Aos 6 meses: comida amassada com garfo (não liquidificada), variada e sem sal e sem açúcar. Ofereça água nos intervalos.', fonte: 'Guia Alimentar para Crianças < 2 anos (MS)' },
  { ate: 39, titulo: 'Um alimento novo por vez', texto: 'Ofereça alimentos novos um de cada vez e observe por alguns dias, principalmente os que mais causam alergia (ovo, amendoim, peixe). Registre em Saúde → Alimentos.', fonte: 'SBP' },
  { ate: 52, titulo: 'Casa segura', texto: 'O bebê começa a explorar tudo: proteja tomadas, quinas e escadas, e guarde remédios e produtos de limpeza no alto e trancados.', fonte: 'SBP' },
  { ate: 9999, titulo: '1 ano!', texto: 'Hora das vacinas de 12 meses (Tríplice viral, Pneumo e Meningo ACWY). Mel só depois de 1 ano. Açúcar e ultraprocessados: evite até os 2 anos.', fonte: 'PNI / Guia Alimentar (MS)' },
];
export const dicaDaSemana = (semanas: number) => DICAS.find((d) => semanas <= d.ate) ?? DICAS[DICAS.length - 1];

/** Gestação: semanas a partir da data prevista do parto (40 semanas). */
export function semanasGestacao(dpp: string, agora = Date.now()) {
  const [y, m, d] = dpp.split('-').map(Number);
  const faltam = Math.ceil((new Date(y, m - 1, d).getTime() - agora) / 86400_000);
  const semanas = Math.max(0, Math.floor((280 - faltam) / 7));
  return { faltam, semanas, dias: Math.max(0, (280 - faltam) % 7), trimestre: semanas < 14 ? 1 : semanas < 28 ? 2 : 3 };
}
export const DICAS_GESTACAO: { ate: number; texto: string }[] = [
  { ate: 13, texto: 'Primeiro trimestre: comece o pré-natal o quanto antes e tome o ácido fólico conforme orientação médica.' },
  { ate: 27, texto: 'Segundo trimestre: bom momento para montar o enxoval e convidar a família para o Ninho.' },
  { ate: 35, texto: 'Terceiro trimestre: deixe a mala da maternidade pronta e o bebê-conforto instalado no carro.' },
  { ate: 99, texto: 'Reta final: combine com a família quem cuida de quê nos primeiros dias. A rotina do bebê começa no Ninho assim que ele nascer.' },
];

/** Id de um item de checklist, único por bebê (a tabela é compartilhada entre todas as famílias). */
export const idCheck = (babyId: string, kind: string, code: string) => `${kind}_${code}_${babyId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`.slice(0, 64);
