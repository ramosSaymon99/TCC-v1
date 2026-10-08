import type { Anamnese, Avaliacao, Config, Consulta, Database, Lancamento, NivelAtividade, Objetivo, Origem, Pacote, Paciente, PlanoAlimentar, TipoConsulta } from '../types';
import { addDays, diffDays as diff, parseDate, pad, today, toISODate } from '../utils/format';
import { calcularMetas } from '../utils/nutri';
import { ALIMENTOS_BASE } from './alimentos';
import { ORIENTACOES_PADRAO, sugerirRefeicoes } from './modelo';

export const VERSAO = 1;

export const CONFIG_PADRAO: Config = {
  nome: 'Dra. Marina Albuquerque',
  crn: 'CRN-3 54321',
  telefone: '(11) 98765-4321',
  email: 'contato@marinanutri.com.br',
  endereco: 'Rua das Palmeiras, 210 · sala 34 · São Paulo/SP',
  precos: { 'Primeira consulta': 280, 'Retorno': 180, 'Online': 200, 'Bioimpedância': 90 },
  duracoes: { 'Primeira consulta': 60, 'Retorno': 40, 'Online': 40, 'Bioimpedância': 20 },
  metaMensal: 16000,
  retornoDias: 45,
  horasDia: 8,
  diasSemana: 5,
};

export const ANAMNESE_VAZIA: Anamnese = {
  queixa: '', patologias: '', medicamentos: '', alergias: '', intestino: '', sono: '', aguaLitros: 0, alcool: '', rotina: '', preferencias: '', aversoes: '',
};

/** Gerador pseudoaleatório com semente: a demonstração é sempre a mesma. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMES_F = ['Ana', 'Camila', 'Juliana', 'Fernanda', 'Patrícia', 'Larissa', 'Beatriz', 'Gabriela', 'Renata', 'Aline', 'Mariana', 'Letícia', 'Vanessa', 'Carolina', 'Tatiane', 'Débora', 'Priscila', 'Isabela', 'Natália', 'Bruna', 'Luana', 'Sabrina', 'Helena', 'Rafaela', 'Cristina', 'Paula', 'Daniela', 'Simone', 'Júlia', 'Lívia'];
const NOMES_M = ['Rafael', 'Lucas', 'Thiago', 'Bruno', 'Gustavo', 'Felipe', 'Diego', 'André', 'Rodrigo', 'Marcelo', 'Eduardo', 'Vinícius', 'Leonardo', 'Paulo', 'Fábio', 'Ricardo', 'Mateus', 'Gabriel'];
const SOBRENOMES = ['Souza', 'Ferreira', 'Martins', 'Lima', 'Gomes', 'Rocha', 'Almeida', 'Ribeiro', 'Carvalho', 'Barbosa', 'Teixeira', 'Moreira', 'Duarte', 'Pires', 'Freitas', 'Nunes', 'Cardoso', 'Correia', 'Vieira', 'Mendes', 'Castro', 'Dias', 'Azevedo', 'Monteiro', 'Lopes', 'Araújo', 'Batista', 'Oliveira', 'Pereira', 'Santos', 'Costa', 'Nascimento', 'Moura', 'Barros', 'Ramos'];
/** Quantidade de pacientes da demonstração (~25 novos por mês em 8 meses). */
const TOTAL_PACIENTES = 200;

const pick = <T,>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
function weighted<T>(r: () => number, items: [T, number][]): T {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * tot;
  for (const [v, w] of items) { if ((x -= w) <= 0) return v; }
  return items[items.length - 1][0];
}

/** Probabilidade de seguir para o próximo retorno, por canal — indicação e parcerias fidelizam mais. */
const RETENCAO: Record<Origem, number> = { 'Instagram': 0.58, 'Indicação': 0.86, 'Google': 0.7, 'Convênio': 0.66, 'Parceria (academia/médico)': 0.82, 'Outros': 0.6 };
const FALTA: Record<Origem, number> = { 'Instagram': 0.15, 'Indicação': 0.04, 'Google': 0.08, 'Convênio': 0.12, 'Parceria (academia/médico)': 0.05, 'Outros': 0.08 };

const QUEIXAS: Record<Objetivo, string> = {
  'Emagrecimento': 'Ganho de peso nos últimos 2 anos, belisca à noite e pula o café da manhã.',
  'Hipertrofia': 'Treina musculação 5x/semana e não consegue ganhar massa magra.',
  'Reeducação alimentar': 'Quer organizar a rotina alimentar; come muito fora de casa.',
  'Saúde / patologia': 'Encaminhada pelo médico por alteração de glicemia e colesterol.',
  'Gestação': 'Gestante (2º trimestre), quer controlar o ganho de peso.',
  'Performance esportiva': 'Corredor amador, prepara meia maratona; cansaço nos treinos longos.',
};

export function createSeed(): Database {
  const r = rng(20251008);
  const hoje = today();
  const pacientes: Paciente[] = [];
  const consultas: Consulta[] = [];
  const avaliacoes: Avaliacao[] = [];
  const pacotes: Pacote[] = [];
  const ocupados = new Set<string>();
  const cfg = CONFIG_PADRAO;
  let seq = 0;
  const id = (p: string) => `${p}-${(++seq).toString(36)}`;

  /** Próximo dia útil livre a partir de `iso`, num horário entre 8h e 17h. */
  const slot = (iso: string): [string, string] => {
    let d = iso;
    for (let tent = 0; tent < 60; tent++) {
      const w = parseDate(d).getDay();
      if (w >= 1 && w <= cfg.diasSemana) {
        const h = 8 + Math.floor(r() * 10);
        const hora = `${pad(h === 12 ? 13 : h)}:00`;
        if (!ocupados.has(d + hora)) { ocupados.add(d + hora); return [d, hora]; }
      }
      d = addDays(d, 1);
    }
    return [d, '18:00'];
  };

  const usados = new Set<string>();
  const todos: [string, 'F' | 'M'][] = [];
  while (todos.length < TOTAL_PACIENTES) {
    const sexo = r() < 0.68 ? 'F' : 'M';
    const nome = `${pick(r, sexo === 'F' ? NOMES_F : NOMES_M)} ${pick(r, SOBRENOMES)}`;
    if (!usados.has(nome)) { usados.add(nome); todos.push([nome, sexo]); }
  }

  todos.forEach(([nome, sexo]) => {
    const origem = weighted<Origem>(r, [['Instagram', 34], ['Indicação', 24], ['Google', 15], ['Convênio', 12], ['Parceria (academia/médico)', 11], ['Outros', 4]]);
    const objetivo = sexo === 'F'
      ? weighted<Objetivo>(r, [['Emagrecimento', 45], ['Reeducação alimentar', 20], ['Saúde / patologia', 15], ['Gestação', 8], ['Hipertrofia', 7], ['Performance esportiva', 5]])
      : weighted<Objetivo>(r, [['Hipertrofia', 32], ['Emagrecimento', 30], ['Performance esportiva', 16], ['Saúde / patologia', 14], ['Reeducação alimentar', 8]]);
    const atividade = weighted<NivelAtividade>(r, objetivo === 'Hipertrofia' || objetivo === 'Performance esportiva'
      ? [['Moderado', 3], ['Intenso', 5], ['Muito intenso', 2]]
      : [['Sedentário', 4], ['Leve', 4], ['Moderado', 3], ['Intenso', 1]]);
    const alturaCm = Math.round(sexo === 'F' ? 155 + r() * 18 : 166 + r() * 20);
    const imcIni = objetivo === 'Emagrecimento' ? 27 + r() * 8 : objetivo === 'Hipertrofia' ? 21 + r() * 3 : 22 + r() * 6;
    let peso = Math.round(imcIni * (alturaCm / 100) ** 2 * 10) / 10;
    const anos = 22 + Math.floor(r() * 36);
    const nasc = toISODate(new Date(parseDate(hoje).getFullYear() - anos, Math.floor(r() * 12), 1 + Math.floor(r() * 27)));
    const criadoEm = addDays(hoje, -Math.floor(4 + r() * 236));
    const online = r() < 0.2;
    const pid = id('pac');
    const tel = `(11) 9${Math.floor(7000 + r() * 2999)}-${Math.floor(1000 + r() * 8999)}`;
    const pesoMeta = objetivo === 'Emagrecimento' ? Math.round(24 * (alturaCm / 100) ** 2) : objetivo === 'Hipertrofia' ? Math.round(peso + 4) : undefined;

    pacientes.push({
      id: pid, nome, sexo, nascimento: nasc, telefone: tel,
      email: `${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${Math.floor(r() * 90 + 10)}@email.com`,
      objetivo, origem, atividade, alturaCm, pesoMeta, criadoEm, observacoes: '',
      anamnese: {
        ...ANAMNESE_VAZIA, queixa: QUEIXAS[objetivo],
        patologias: objetivo === 'Saúde / patologia' ? pick(r, ['Pré-diabetes', 'Dislipidemia', 'Hipotireoidismo', 'Esteatose hepática']) : 'Nega',
        medicamentos: objetivo === 'Saúde / patologia' ? pick(r, ['Metformina 500 mg', 'Levotiroxina 50 mcg', 'Sinvastatina 20 mg']) : 'Nenhum',
        alergias: r() < 0.15 ? pick(r, ['Intolerância à lactose', 'Alergia a camarão', 'Sensibilidade ao glúten']) : 'Nega',
        intestino: pick(r, ['Regular, diário', 'Constipado (3x/semana)', 'Regular']),
        sono: pick(r, ['7h, reparador', '5–6h, acorda cansada(o)', '6h, irregular']),
        aguaLitros: Math.round((0.8 + r() * 1.8) * 10) / 10,
        alcool: pick(r, ['Não consome', 'Socialmente, fins de semana', '2–3 vezes por semana']),
        rotina: pick(r, ['Trabalha em escritório, almoça fora', 'Home office, cozinha em casa', 'Trabalha em turnos']),
        preferencias: pick(r, ['Gosta de frutas e saladas', 'Prefere refeições rápidas', 'Gosta de cozinhar']),
        aversoes: pick(r, ['Fígado', 'Peixe', 'Quiabo', 'Nenhuma']),
      },
    });

    // Linha do tempo de consultas
    let [dia, hora] = slot(addDays(criadoEm, Math.floor(r() * 6)));
    let n = 0;
    let pacoteAtivo: { id: string; restantes: number } | null = null;
    const ritmo = objetivo === 'Emagrecimento' ? -(0.4 + r() * 1.1) : objetivo === 'Hipertrofia' ? 0.25 + r() * 0.4 : (r() - 0.6) * 0.5;
    const plato = r() < 0.25; // parte dos pacientes estaciona nas últimas avaliações
    let continua = true;

    while (continua) {
      const tipo: TipoConsulta = n === 0 ? 'Primeira consulta' : online ? 'Online' : 'Retorno';
      const futuro = dia > hoje;
      const falta = !futuro && r() < FALTA[origem];
      const cobrePacote = !!pacoteAtivo && tipo !== 'Primeira consulta';
      const valorBase = origem === 'Convênio' ? (n === 0 ? 160 : 110) : cfg.precos[tipo];
      const status: Consulta['status'] = futuro ? (diff(dia, hoje) <= 2 && r() < 0.6 ? 'Confirmada' : 'Agendada') : falta ? 'Faltou' : 'Realizada';
      const c: Consulta = {
        id: id('con'), pacienteId: pid, data: dia, hora, duracao: cfg.duracoes[tipo], tipo, status,
        valor: cobrePacote ? 0 : valorBase,
        pago: status === 'Realizada' ? !(diff(hoje, dia) < 25 && r() < 0.12) : false,
        forma: origem === 'Convênio' ? 'Convênio' : pick(r, ['PIX', 'PIX', 'Cartão de crédito', 'Cartão de débito']),
        pacoteId: cobrePacote ? pacoteAtivo!.id : undefined,
      };
      consultas.push(c);
      if (futuro) break;

      if (status === 'Realizada') {
        if (cobrePacote) { pacoteAtivo!.restantes--; if (pacoteAtivo!.restantes <= 0) pacoteAtivo = null; }
        // Avaliação antropométrica do dia
        if (n > 0) {
          const meses = 1.2;
          const efeito = plato && n >= 3 ? (r() - 0.5) * 0.4 : ritmo * meses + (r() - 0.5) * 0.6;
          peso = Math.round((peso + efeito) * 10) / 10;
        }
        const imcAtual = peso / (alturaCm / 100) ** 2;
        avaliacoes.push({
          id: id('av'), pacienteId: pid, data: dia, peso,
          cintura: Math.round((sexo === 'F' ? 52 : 58) + imcAtual * 1.25 + (r() - 0.5) * 3),
          quadril: Math.round((sexo === 'F' ? 62 : 58) + imcAtual * 1.45 + (r() - 0.5) * 3),
          gordura: Math.round(((sexo === 'F' ? 1.2 * imcAtual + 0.23 * anos - 5.4 : 1.2 * imcAtual + 0.23 * anos - 16.2) + (r() - 0.5) * 2) * 10) / 10,
        });
        // Pacote vendido na primeira consulta para parte dos pacientes
        if (n === 0 && r() < 0.24 && origem !== 'Convênio') {
          const pk: Pacote = { id: id('pk'), pacienteId: pid, nome: 'Acompanhamento trimestral (3 retornos)', consultas: 3, valor: 480, data: dia, pago: r() > 0.1, forma: pick(r, ['PIX', 'Cartão de crédito']) };
          pacotes.push(pk);
          pacoteAtivo = { id: pk.id, restantes: 3 };
        }
        n++;
        continua = r() < RETENCAO[origem] * (n > 4 ? 0.85 : 1);
      } else {
        // Faltou: alguns remarcam, outros somem
        continua = r() < 0.6;
      }
      if (!continua) break;
      const intervalo = falta ? 4 + Math.floor(r() * 8) : 26 + Math.floor(r() * 24);
      [dia, hora] = slot(addDays(dia, intervalo));
      // Quem está no fluxo de retorno mas sem data marcada nos próximos 3 semanas fica sem agendamento
      if (dia > addDays(hoje, 21)) break;
    }

    // Avaliação de bioimpedância avulsa para alguns pacientes ativos
    if (n >= 2 && r() < 0.25) {
      const [d, h] = slot(addDays(criadoEm, 20 + Math.floor(r() * 30)));
      if (d < hoje) consultas.push({ id: id('con'), pacienteId: pid, data: d, hora: h, duracao: 20, tipo: 'Bioimpedância', status: 'Realizada', valor: cfg.precos['Bioimpedância'], pago: true, forma: 'PIX' });
    }
  });

  // Lançamentos de despesas fixas/variáveis e receitas extras
  const lancamentos: Lancamento[] = [];
  for (let m = 8; m >= 0; m--) {
    const ref = parseDate(hoje);
    const base = toISODate(new Date(ref.getFullYear(), ref.getMonth() - m, 1));
    const em = (dia: number) => addDays(base, dia - 1);
    const pago = (dia: number) => em(dia) <= hoje;
    const push = (dia: number, tipo: Lancamento['tipo'], categoria: string, descricao: string, valor: number, canal?: Origem) => {
      if (m === 0 && em(dia) > addDays(hoje, 20)) return;
      lancamentos.push({ id: id('lan'), data: em(dia), tipo, categoria, descricao, valor, pago: pago(dia), canal });
    };
    push(5, 'Despesa', 'Aluguel / sala', 'Aluguel da sala (coworking de saúde)', 1800);
    push(10, 'Despesa', 'Software e sistemas', 'Assinaturas (agenda, videochamada, nuvem)', 149);
    push(12, 'Despesa', 'Marketing', 'Impulsionamento Instagram', 500 + Math.round(r() * 300), 'Instagram');
    push(12, 'Despesa', 'Marketing', 'Google Ads', 300 + Math.round(r() * 150), 'Google');
    push(20, 'Despesa', 'Impostos e taxas', 'Simples Nacional / ISS', 520 + Math.round(r() * 260));
    if (m % 3 === 1) push(15, 'Despesa', 'Materiais e equipamentos', 'Material de consultório e fitas antropométricas', 180 + Math.round(r() * 200));
    if (m % 4 === 2) push(18, 'Despesa', 'Marketing', 'Kit de boas-vindas para parceiros (academias)', 350, 'Parceria (academia/médico)');
    if (m === 5) push(22, 'Despesa', 'Cursos e atualização', 'Curso de nutrição esportiva', 890);
    if (m % 3 === 0) push(25, 'Receita', 'Palestra / parceria', 'Palestra em academia parceira', 600);
    if (m === 2) push(8, 'Receita', 'E-book / material', 'Vendas do e-book de receitas', 740);
  }

  // Planos alimentares ativos para os pacientes com mais consultas
  const planos: PlanoAlimentar[] = [];
  const contagem = new Map<string, number>();
  consultas.forEach((c) => c.status === 'Realizada' && contagem.set(c.pacienteId, (contagem.get(c.pacienteId) ?? 0) + 1));
  pacientes.filter((p) => (contagem.get(p.id) ?? 0) >= 2).slice(0, 40).forEach((p) => {
    const ult = avaliacoes.filter((a) => a.pacienteId === p.id).sort((a, b) => b.data.localeCompare(a.data))[0];
    if (!ult) return;
    const metas = calcularMetas(p, ult.peso, ult.data);
    planos.push({
      id: id('pl'), pacienteId: p.id, nome: 'Plano alimentar', criadoEm: ult.data,
      kcalMeta: metas.kcal, protMeta: metas.prot, carbMeta: metas.carb, gordMeta: metas.gord,
      refeicoes: sugerirRefeicoes(metas, ALIMENTOS_BASE), orientacoes: ORIENTACOES_PADRAO, ativo: true,
    });
  });

  return { versao: VERSAO, config: cfg, pacientes, avaliacoes, consultas, pacotes, lancamentos, alimentos: ALIMENTOS_BASE, planos };
}
