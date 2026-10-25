import type {
  Assinante, Assinatura, ConfigPlataforma, Database, Fatura, Modulo, Plano, Plataforma, StatusAssinatura, UsoTenant,
} from '../types';
import { addDays, diffDays, lastMonths, pad, today } from '../utils/format';
import { MODULOS, PERMISSOES_PADRAO, VERSAO_DADOS } from './seed';
import { segmentoPorId } from './segmentos';

/** Base da empresa dona da plataforma: acesso completo e acesso ao console. */
export const TENANT_PRINCIPAL = 'principal';

/** Módulos que todo plano inclui (sem eles o sistema não funciona). */
export const ESSENCIAIS: Modulo[] = ['inicio', 'usuarios', 'configuracoes'];

/** Módulos que geram dados — usados para medir a adoção do sistema por cada empresa. */
export const MODULOS_DADOS: Modulo[] = ['clientes', 'orcamentos', 'funil', 'ordens', 'equipamentos', 'agenda', 'financeiro', 'servicos', 'estoque', 'contratos', 'treinamentos', 'social'];

/** Coleção da base → módulo (mesmo mapa do Worker). */
export const MODULO_DA_COLECAO: Record<string, Modulo> = {
  clientes: 'clientes', orcamentos: 'orcamentos', oportunidades: 'funil', ordens: 'ordens', equipamentos: 'equipamentos',
  compromissos: 'agenda', tarefas: 'agenda', lancamentos: 'financeiro', usuarios: 'usuarios', servicos: 'servicos',
  pecas: 'estoque', movimentos: 'estoque', contratos: 'contratos', turmas: 'treinamentos', posts: 'social', seguidores: 'social',
  mensagens: 'clientes',
};

const BASICO: Modulo[] = ['inicio', 'clientes', 'orcamentos', 'ordens', 'agenda', 'servicos', 'financeiro', 'usuarios', 'configuracoes'];
const INTERMEDIARIO: Modulo[] = [...BASICO, 'funil', 'contratos', 'equipamentos', 'estoque', 'relatorios'];

export const PLANOS_PADRAO: Plano[] = [
  {
    id: 'basico', nome: 'Básico', ordem: 1, ativo: true, precoMensal: 89, descontoAnual: 0.15, maxUsuarios: 2, precoUsuarioExtra: 29,
    descricao: 'Para quem está saindo da planilha: clientes, orçamentos, OS, agenda e caixa.', modulos: BASICO,
  },
  {
    id: 'intermediario', nome: 'Intermediário', ordem: 2, ativo: true, precoMensal: 179, descontoAnual: 0.15, maxUsuarios: 5, precoUsuarioExtra: 25,
    descricao: 'Para equipes em crescimento: funil de vendas, contratos recorrentes, estoque e relatórios.', modulos: INTERMEDIARIO, destaque: true,
  },
  {
    id: 'completo', nome: 'Completo', ordem: 3, ativo: true, precoMensal: 299, descontoAnual: 0.15, maxUsuarios: 10, precoUsuarioExtra: 19,
    descricao: 'Gestão completa: planejamento financeiro, treinamentos/turmas e social media com atribuição de vendas.', modulos: MODULOS.map((m) => m.id),
  },
];

export const CONFIG_PADRAO: ConfigPlataforma = { id: 'geral', precoModuloAvulso: 39, diasTrial: 14, diasTolerancia: 10, investimentoAquisicaoMes: 1200 };

const r2 = (v: number) => Math.round(v * 100) / 100;
export const cfgDe = (p: Plataforma): ConfigPlataforma => ({ ...CONFIG_PADRAO, ...p.config.find((c) => c.id === 'geral') });
export const planoDe = (p: Plataforma, id: string) => p.planos.find((x) => x.id === id);

/** Mensalidade da empresa: plano (com desconto de fidelidade anual) + usuários e módulos extras − desconto negociado. */
export function valorMensal(a: Pick<Assinante, 'ciclo' | 'usuariosExtras' | 'modulosExtras' | 'descontoPct'>, plano: Plano | undefined, cfg: ConfigPlataforma) {
  if (!plano) return 0;
  const base = plano.precoMensal * (a.ciclo === 'Anual' ? 1 - plano.descontoAnual : 1);
  const extras = a.usuariosExtras * plano.precoUsuarioExtra + a.modulosExtras.filter((m) => !plano.modulos.includes(m)).length * cfg.precoModuloAvulso;
  return r2((base + extras) * (1 - (a.descontoPct || 0)));
}

/** Status que geram receita (entram no MRR). */
export const PAGANTE: StatusAssinatura[] = ['Ativa', 'Inadimplente'];
export const mrrDe = (a: Assinante, p: Plataforma) => (PAGANTE.includes(a.status) ? valorMensal(a, planoDe(p, a.planoId), cfgDe(p)) : 0);

export function modulosLiberados(a: Assinante, plano: Plano | undefined): Modulo[] {
  return [...new Set([...ESSENCIAIS, ...(plano?.modulos ?? []), ...a.modulosExtras])];
}

/** Motivo de bloqueio do acesso da empresa (null = acesso liberado). */
export function bloqueio(a: Assinante | undefined, hoje = today()): string | null {
  if (!a) return 'Empresa não encontrada na plataforma.';
  if (a.status === 'Suspensa') return 'Acesso suspenso. Regularize a assinatura com o suporte Pivot Hub.';
  if (a.status === 'Cancelada') return 'Assinatura cancelada. Fale com o comercial Pivot Hub para reativar.';
  if (a.status === 'Trial' && a.trialFim && a.trialFim < hoje) return 'O período de teste terminou. Fale com o comercial Pivot Hub para contratar um plano.';
  return null;
}

export function assinaturaDe(tenant: string, p: Plataforma): Assinatura {
  if (tenant === TENANT_PRINCIPAL) {
    return { tenant, principal: true, empresa: 'Conta principal', plano: 'Interno', status: 'Ativa', modulos: MODULOS.map((m) => m.id), maxUsuarios: 999, valorMensal: 0 };
  }
  const a = p.assinantes.find((x) => x.id === tenant);
  const plano = a && planoDe(p, a.planoId);
  return {
    tenant, principal: false, empresa: a?.empresa ?? '—', plano: plano?.nome ?? '—', status: a?.status ?? 'Cancelada',
    modulos: a ? modulosLiberados(a, plano) : ESSENCIAIS, maxUsuarios: (plano?.maxUsuarios ?? 1) + (a?.usuariosExtras ?? 0),
    valorMensal: a ? valorMensal(a, plano, cfgDe(p)) : 0, trialFim: a?.trialFim,
    ofertas: p.planos.filter((x) => x.ativo).sort((x, y) => x.ordem - y.ordem)
      .map(({ id, nome, precoMensal, maxUsuarios, modulos }) => ({ id, nome, precoMensal, maxUsuarios, modulos })),
  };
}

/** Menor plano que libera o módulo (para a mensagem de upgrade). */
export function planoQueLibera(p: Plataforma | null, m: Modulo): string | null {
  const planos = (p?.planos.length ? p.planos : PLANOS_PADRAO).filter((x) => x.ativo).sort((a, b) => a.ordem - b.ordem);
  return planos.find((x) => x.modulos.includes(m))?.nome ?? null;
}

/** Uso medido numa base real. */
export function usoDaBase(db: Database): UsoTenant {
  const em = new Set<Modulo>();
  let registros = 0;
  for (const [col, mod] of Object.entries(MODULO_DA_COLECAO)) {
    const n = ((db as unknown as Record<string, unknown[]>)[col] ?? []).length;
    if (col !== 'usuarios') registros += n;
    if (n > 0 && col !== 'usuarios') em.add(mod);
  }
  const ativos = db.usuarios.filter((u) => u.status === 'Ativo');
  const ultimo = db.usuarios.map((u) => u.ultimoAcesso).filter(Boolean).sort().pop();
  return { usuarios: ativos.length, ultimoAcesso: ultimo, modulosEmUso: [...em], registros, real: true };
}

/** Uso de uma empresa: medido (base real) ou simulado (empresa de demonstração sem base). */
export function usoDe(a: Assinante, uso: Record<string, UsoTenant>, p: Plataforma): UsoTenant {
  if (uso[a.id]) return uso[a.id];
  const s = a.usoSimulado ?? { usuarios: 1, diasSemAcesso: 30, modulosEmUso: 1, registros: 0 };
  // empresas de demonstração: módulos centrais primeiro e os demais variando por empresa
  const todos = modulosLiberados(a, planoDe(p, a.planoId)).filter((m) => MODULOS_DADOS.includes(m));
  const centrais = todos.filter((m) => ['clientes', 'orcamentos', 'ordens'].includes(m));
  const resto = todos.filter((m) => !centrais.includes(m));
  const giro = resto.length ? s.registros % resto.length : 0;
  const lib = [...centrais, ...resto.slice(giro), ...resto.slice(0, giro)];
  const d = new Date(); d.setDate(d.getDate() - s.diasSemAcesso); d.setHours(9 + (s.registros % 9), (s.registros * 7) % 60);
  return { usuarios: s.usuarios, ultimoAcesso: d.toISOString(), modulosEmUso: lib.slice(0, s.modulosEmUso), registros: s.registros, real: false };
}

/** Faturas em aberto com vencimento passado. */
export const vencida = (f: Fatura, hoje = today()) => f.status === 'Em aberto' && f.vencimento < hoje;

export interface Saude { score: number; nivel: 'Saudável' | 'Atenção' | 'Risco'; diasSemAcesso: number | null; adocao: number; atrasoDias: number }

/** Saúde da conta (0–100): recência de acesso (40) + adoção dos módulos contratados (30) + pagamento em dia (30). */
export function saudeDe(a: Assinante, uso: UsoTenant, p: Plataforma, hoje = today()): Saude {
  const dias = uso.ultimoAcesso ? Math.max(0, diffDays(hoje, uso.ultimoAcesso.slice(0, 10))) : null;
  const rec = dias === null ? 0 : dias <= 3 ? 40 : dias <= 7 ? 30 : dias <= 14 ? 15 : dias <= 30 ? 5 : 0;
  const lib = modulosLiberados(a, planoDe(p, a.planoId)).filter((m) => MODULOS_DADOS.includes(m));
  const adocao = lib.length ? uso.modulosEmUso.filter((m) => lib.includes(m)).length / lib.length : 0;
  const abertas = p.faturas.filter((f) => f.assinanteId === a.id && vencida(f, hoje));
  const atrasoDias = abertas.length ? Math.max(...abertas.map((f) => diffDays(hoje, f.vencimento))) : 0;
  const tol = cfgDe(p).diasTolerancia;
  const pag = atrasoDias === 0 ? 30 : atrasoDias <= tol ? 12 : 0;
  const score = Math.round(rec + adocao * 30 + pag);
  return { score, nivel: score >= 70 ? 'Saudável' : score >= 40 ? 'Atenção' : 'Risco', diasSemAcesso: dias, adocao, atrasoDias };
}

/** Senha provisória legível (sem caracteres ambíguos). */
export function senhaProvisoria() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join('');
}

/**
 * Base inicial de uma empresa nova: o responsável como proprietário, permissões padrão e as pré-definições
 * do segmento (catálogo de serviços com preços sugeridos e itens de estoque zerados para conferência).
 */
export function criarBaseVazia(a: Pick<Assinante, 'empresa' | 'cnpj' | 'telefone' | 'email' | 'cidade' | 'responsavel'>, segmento = 'generico', comCatalogo = true): Database {
  const seg = segmentoPorId(segmento);
  return {
    clientes: [], orcamentos: [], oportunidades: [], ordens: [], equipamentos: [], compromissos: [], tarefas: [], lancamentos: [],
    usuarios: [{ id: 'u1', nome: a.responsavel, email: a.email.trim().toLowerCase(), perfil: 'Proprietário', status: 'Ativo', ultimoAcesso: '' }],
    servicos: comCatalogo ? seg.servicos.map(([nome, categoria, preco, custo, duracaoHoras], i) => ({ id: `sv${i + 1}`, nome, categoria, preco, custo, duracaoHoras, ativo: true })) : [],
    // itens chegam zerados e sem mínimo: a empresa define após contar o estoque (evita alerta falso no 1º dia)
    pecas: comCatalogo ? seg.materiais.map(([nome, categoria, custoUnit, precoVenda], i) => ({
      id: `mt${i + 1}`, nome, categoria, sku: `${seg.id.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`, quantidade: 0, minimo: 0, custoUnit, precoVenda,
    })) : [],
    movimentos: [], contratos: [], turmas: [], posts: [], seguidores: [], mensagens: [],
    permissoes: PERMISSOES_PADRAO,
    empresa: {
      nome: a.empresa, cnpj: a.cnpj, telefone: a.telefone, email: a.email.trim().toLowerCase(), endereco: a.cidade,
      metaMensal: 10000, diasAlertaOrcamento: 5, versaoDados: VERSAO_DADOS, metaPostsSemana: 3, segmento: seg.id,
    },
  };
}

/* ---------------- Dados de demonstração da plataforma ---------------- */
type Def = {
  id: string; empresa: string; segmento: string; cidade: string; resp: string; origem: Assinante['origem'];
  plano: string; meses: number; ciclo?: Assinante['ciclo']; mudancas?: [number, string][]; cancel?: [number, string];
  status?: StatusAssinatura; extrasU?: number; extrasM?: Modulo[]; desc?: number; uso: [number, number, number, number];
  atraso?: number; dia?: number; trialDias?: number; trial?: boolean;
};

const DEFS: Def[] = [
  { id: 'a01', empresa: 'Oficina Motor Forte', segmento: 'Oficina mecânica', cidade: 'Vitória/ES', resp: 'Ricardo Alves', origem: 'Indicação', plano: 'intermediario', meses: 11, uso: [4, 1, 8, 1840], trial: true },
  { id: 'a02', empresa: 'Clínica Bem Estar Estética', segmento: 'Clínica estética', cidade: 'Vila Velha/ES', resp: 'Juliana Prado', origem: 'Instagram', plano: 'basico', meses: 10, ciclo: 'Anual', mudancas: [[4, 'intermediario']], uso: [5, 0, 9, 2300], trial: true },
  { id: 'a03', empresa: 'Idiomas Global', segmento: 'Escola de idiomas', cidade: 'Serra/ES', resp: 'Fernanda Luz', origem: 'Google', plano: 'completo', meses: 9, ciclo: 'Anual', uso: [8, 2, 11, 3100] },
  { id: 'a04', empresa: 'Assistência Técnica Conecta', segmento: 'Assistência técnica', cidade: 'Cariacica/ES', resp: 'Paulo Mendes', origem: 'Parceiro contábil', plano: 'intermediario', meses: 8, mudancas: [[2, 'completo']], uso: [6, 1, 11, 2650], trial: true },
  { id: 'a05', empresa: 'Agência Pulso Digital', segmento: 'Agência de marketing', cidade: 'Vitória/ES', resp: 'Bruna Costa', origem: 'Evento', plano: 'completo', meses: 8, desc: 0.1, uso: [9, 0, 10, 1980] },
  { id: 'a06', empresa: 'Studio Bella Salão', segmento: 'Salão de beleza', cidade: 'Guarapari/ES', resp: 'Camila Rocha', origem: 'Instagram', plano: 'basico', meses: 7, uso: [2, 24, 2, 210], trial: true },
  { id: 'a07', empresa: 'Contábil Exata', segmento: 'Contabilidade', cidade: 'Vitória/ES', resp: 'Marcos Teixeira', origem: 'Site', plano: 'intermediario', meses: 7, ciclo: 'Anual', uso: [5, 3, 7, 1500] },
  { id: 'a08', empresa: 'Pet Shop Amigo Fiel', segmento: 'Pet shop', cidade: 'Serra/ES', resp: 'Larissa Gomes', origem: 'Instagram', plano: 'basico', meses: 6, cancel: [1, 'Preço alto para o uso / pouca adoção'], uso: [1, 40, 1, 90], trial: true },
  { id: 'a09', empresa: 'Academia Ritmo', segmento: 'Academia', cidade: 'Vila Velha/ES', resp: 'Diego Santos', origem: 'Google', plano: 'intermediario', meses: 6, mudancas: [[2, 'basico']], uso: [3, 6, 4, 620] },
  { id: 'a10', empresa: 'Elétrica Luz & Força', segmento: 'Serviços elétricos', cidade: 'Cariacica/ES', resp: 'Anderson Lima', origem: 'Indicação', plano: 'basico', meses: 5, status: 'Inadimplente', atraso: 2, dia: 5, uso: [2, 9, 4, 380] },
  { id: 'a11', empresa: 'Buffet Sabor & Arte', segmento: 'Eventos e buffet', cidade: 'Vitória/ES', resp: 'Patrícia Nunes', origem: 'Evento', plano: 'intermediario', meses: 5, uso: [4, 2, 7, 870], trial: true },
  { id: 'a12', empresa: 'Foto Clique Estúdio', segmento: 'Fotografia', cidade: 'Vila Velha/ES', resp: 'Rafael Dias', origem: 'Instagram', plano: 'basico', meses: 4, cancel: [2, 'Encerrou as atividades'], uso: [1, 70, 1, 60] },
  { id: 'a13', empresa: 'RH Prime Consultoria', segmento: 'Consultoria de RH', cidade: 'Vitória/ES', resp: 'Tatiane Freitas', origem: 'Parceiro contábil', plano: 'completo', meses: 3, ciclo: 'Anual', uso: [7, 1, 9, 940], trial: true },
  { id: 'a14', empresa: 'Dedetizadora Protege', segmento: 'Controle de pragas', cidade: 'Serra/ES', resp: 'Gustavo Reis', origem: 'Google', plano: 'intermediario', meses: 3, atraso: 1, dia: 5, uso: [3, 4, 6, 410] },
  { id: 'a15', empresa: 'Lava Jato Brilho', segmento: 'Estética automotiva', cidade: 'Cariacica/ES', resp: 'Wesley Martins', origem: 'Indicação', plano: 'basico', meses: 2, uso: [2, 1, 6, 410], trial: true },
  { id: 'a16', empresa: 'Escola de Música Acorde', segmento: 'Escola de música', cidade: 'Vitória/ES', resp: 'Renata Moura', origem: 'Site', plano: 'intermediario', meses: 1, extrasM: ['treinamentos'], uso: [3, 4, 7, 300], trial: true },
  { id: 'a17', empresa: 'Clínica Odonto Sorriso', segmento: 'Odontologia', cidade: 'Vila Velha/ES', resp: 'Dra. Helena Castro', origem: 'Instagram', plano: 'completo', meses: 0, status: 'Trial', trialDias: 10, uso: [3, 1, 7, 260] },
  { id: 'a18', empresa: 'Marcenaria Arte Madeira', segmento: 'Marcenaria', cidade: 'Serra/ES', resp: 'Joel Batista', origem: 'Google', plano: 'intermediario', meses: 0, status: 'Trial', trialDias: 5, uso: [1, 4, 1, 35] },
  { id: 'a19', empresa: 'Gráfica Rápida Print', segmento: 'Gráfica', cidade: 'Vitória/ES', resp: 'Sérgio Paiva', origem: 'Evento', plano: 'intermediario', meses: 9, status: 'Suspensa', atraso: 3, dia: 10, uso: [3, 35, 4, 700] },
  { id: 'a20', empresa: 'Consertos Já Refrigeração', segmento: 'Refrigeração', cidade: 'Cariacica/ES', resp: 'Valter Souza', origem: 'Parceiro contábil', plano: 'basico', meses: 0, trialDias: 20, extrasU: 1, uso: [3, 2, 5, 150], trial: true },
  { id: 'a21', empresa: 'Confeitaria Doce Encanto', segmento: 'Confeitaria', cidade: 'Vila Velha/ES', resp: 'Aline Ferraz', origem: 'Instagram', plano: 'basico', meses: 1, status: 'Cancelada', trial: true, uso: [1, 25, 1, 12] },
];

const mesAtras = (n: number, hoje: string) => {
  const [y, m] = hoje.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export function createPlataformaSeed(): Plataforma {
  const hoje = today();
  const cfg = CONFIG_PADRAO;
  const planos = PLANOS_PADRAO;
  const assinantes: Assinante[] = [];
  const faturas: Fatura[] = [];
  const doc = (i: number) => `${pad(10 + i)}.${pad(30 + i)}${i % 10}.${pad(40 + i)}${i % 7}/0001-${pad(i * 3 % 100)}`;

  DEFS.forEach((d, i) => {
    const dia = d.dia ?? [5, 10, 15, 20][i % 4];
    const inicioMes = mesAtras(d.meses, hoje);
    // dia de entrada: no mês atual, alguns dias atrás; nos anteriores, dia variado
    const inicio = d.meses === 0 ? addDays(hoje, -(d.trialDias ?? 3)) : `${inicioMes}-${pad(1 + (i * 5) % 26)}`;
    const trialFim = d.trial || d.status === 'Trial' ? addDays(inicio, cfg.diasTrial) : undefined;
    const ciclo = d.ciclo ?? 'Mensal';
    const planoNoMes = (k: number) => { // k = meses atrás
      let p = d.plano;
      for (const [quando, novo] of d.mudancas ?? []) if (k <= quando) p = novo;
      return p;
    };
    const historico: Assinante['historico'] = [];
    if (trialFim) historico.push({ data: inicio, tipo: 'Teste grátis', detalhe: `Início do teste de ${cfg.diasTrial} dias no plano ${planos.find((p) => p.id === d.plano)!.nome}` });
    else historico.push({ data: inicio, tipo: 'Contratação', detalhe: `Plano ${planos.find((p) => p.id === d.plano)!.nome} · ${ciclo}` });
    const convertido = d.status !== 'Trial' && d.status !== 'Cancelada' && trialFim ? (trialFim <= hoje ? trialFim : undefined) : undefined;
    if (convertido) historico.push({ data: convertido, tipo: 'Conversão', detalhe: 'Teste convertido em assinatura paga' });
    for (const [quando, novo] of d.mudancas ?? []) {
      const ant = planoNoMes(quando + 1), np = planos.find((p) => p.id === novo)!;
      const up = planos.find((p) => p.id === ant)!.ordem < np.ordem;
      historico.push({ data: `${mesAtras(quando, hoje)}-0${1 + (i % 8)}`, tipo: up ? 'Upgrade' : 'Downgrade', detalhe: `${planos.find((p) => p.id === ant)!.nome} → ${np.nome}` });
    }

    const base: Assinante = {
      id: d.id, empresa: d.empresa, cnpj: doc(i + 1), segmento: d.segmento, cidade: d.cidade, responsavel: d.resp,
      email: `${d.resp.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^dra?\.\s*/, '').split(' ')[0]}@${d.empresa.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '').slice(0, 14)}.com.br`,
      telefone: `(27) 9${pad(80 + i)}${pad(10 + i)}-${pad(20 + i)}${pad(30 + i)}`, origem: d.origem, planoId: planoNoMes(0), ciclo,
      status: d.status ?? 'Ativa', inicio, trialFim, convertidoEm: convertido,
      fimFidelidade: ciclo === 'Anual' ? addDays(inicio, 365) : undefined, diaVencimento: dia,
      usuariosExtras: d.extrasU ?? 0, modulosExtras: d.extrasM ?? [], descontoPct: d.desc ?? 0,
      provisionado: false, usoSimulado: { usuarios: d.uso[0], diasSemAcesso: d.uso[1], modulosEmUso: d.uso[2], registros: d.uso[3] }, historico,
    };
    if (d.desc) historico.push({ data: inicio, tipo: 'Negociação', detalhe: `Desconto de ${Math.round(d.desc * 100)}% na mensalidade` });

    // Faturas mensais: do primeiro mês pago até o mês atual (ou até o cancelamento/suspensão)
    const primeiro = trialFim ? Math.max(0, d.meses - (trialFim.slice(0, 7) > inicioMes ? 1 : 0)) : d.meses;
    const fimK = d.cancel ? d.cancel[0] : d.status === 'Suspensa' ? 1 : 0;
    if (d.status !== 'Trial' && !(d.status === 'Cancelada' && !d.cancel)) {
      for (let k = primeiro; k >= fimK; k--) {
        if (d.cancel && k === d.cancel[0]) break;
        const comp = mesAtras(k, hoje);
        const plano = planos.find((p) => p.id === planoNoMes(k));
        const valor = valorMensal(base, plano, cfg);
        const venc = `${comp}-${pad(dia)}`;
        const emAtraso = (d.atraso ?? 0) > 0 && k < fimK + (d.atraso ?? 0);
        const pago = !emAtraso && venc < hoje;
        faturas.push({
          id: `f-${d.id}-${comp}`, assinanteId: d.id, competencia: comp, vencimento: venc, valor, planoId: plano!.id,
          status: pago ? 'Paga' : 'Em aberto', pagoEm: pago ? addDays(venc, (i + k) % 4 - 1) : undefined,
        });
      }
    }
    if (d.cancel) {
      const quando = `${mesAtras(d.cancel[0], hoje)}-${pad(Math.min(dia + 2, 28))}`;
      Object.assign(base, { status: 'Cancelada', canceladoEm: quando, motivoCancelamento: d.cancel[1], valorNoCancelamento: valorMensal(base, planos.find((p) => p.id === base.planoId), cfg) });
      historico.push({ data: quando, tipo: 'Cancelamento', detalhe: d.cancel[1] });
    }
    if (d.status === 'Cancelada' && !d.cancel && trialFim) {
      Object.assign(base, { canceladoEm: trialFim, motivoCancelamento: 'Não converteu após o teste', valorNoCancelamento: 0 });
      historico.push({ data: trialFim, tipo: 'Cancelamento', detalhe: 'Não converteu após o teste' });
    }
    if (d.status === 'Suspensa') historico.push({ data: addDays(hoje, -12), tipo: 'Suspensão', detalhe: `${d.atraso} faturas em aberto` });
    if (d.status === 'Inadimplente') historico.push({ data: addDays(hoje, -6), tipo: 'Inadimplência', detalhe: 'Fatura vencida além da tolerância' });
    historico.sort((a, b) => a.data.localeCompare(b.data));
    assinantes.push(base);
  });

  return { planos, assinantes, faturas, config: [cfg] };
}

/** Meses (yyyy-mm) para as séries do console. */
export const mesesConsole = (n: number) => lastMonths(n);

/** Próximo vencimento no dia contratado (mesma regra do Worker); no teste grátis, após o fim do teste. */
export function proximoVencimento(a: Pick<Assinante, 'status' | 'trialFim' | 'diaVencimento'>, hoje = today()) {
  const base = a.status === 'Trial' && a.trialFim && a.trialFim > hoje ? a.trialFim : hoje;
  const [y, m, d] = base.split('-').map(Number);
  const dia = Math.min(28, Math.max(1, a.diaVencimento || 10));
  if (dia > d) return `${y}-${pad(m)}-${pad(dia)}`;
  const prox = new Date(y, m, dia);
  return `${prox.getFullYear()}-${pad(prox.getMonth() + 1)}-${pad(dia)}`;
}

/** CPF/CNPJ com dígitos verificadores válidos (mesma regra do Worker; o Asaas recusa documentos inválidos). */
export function documentoValido(valor: string) {
  const d = valor.replace(/\D/g, '');
  if (!/^(\d{11}|\d{14})$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const soma = (n: number, pesos: number[]) => pesos.reduce((t, p, i) => t + Number(d[i]) * p, 0) % n;
  if (d.length === 11) {
    const v = (len: number) => { const s = soma(11, Array.from({ length: len }, (_, i) => len + 1 - i)) * 10 % 11; return s === 10 ? 0 : s; };
    return v(9) === Number(d[9]) && v(10) === Number(d[10]);
  }
  const dv = (pesos: number[]) => { const s = soma(11, pesos); return s < 2 ? 0 : 11 - s; };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(p1) === Number(d[12]) && dv([6, ...p1]) === Number(d[13]);
}
