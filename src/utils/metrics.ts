import type { Database, Lancamento } from '../types';
import { addDays, diffDays, lastMonths, money, monthKey, pct, today, variation } from './format';
import { insightsSocial } from './social';

export const ABERTAS = ['Aberta', 'Em andamento', 'Aguardando peças'] as const;

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const receitas = (ls: Lancamento[]) => ls.filter((l) => l.tipo === 'Receita');
export const despesas = (ls: Lancamento[]) => ls.filter((l) => l.tipo === 'Despesa');
export const inRange = (ls: Lancamento[], from: string, to: string) => ls.filter((l) => l.data >= from && l.data <= to);

/**
 * Período "mês até hoje" e o mesmo recorte de dias no mês anterior.
 * Comparar o mês parcial com o mês anterior cheio distorce a variação,
 * por isso a comparação padrão é sempre em base equivalente de dias.
 */
export function periodos(ref = today()) {
  const [y, m, d] = ref.split('-').map(Number);
  const ini = `${y}-${String(m).padStart(2, '0')}-01`;
  const prev = new Date(y, m - 2, 1);
  const diasPrev = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  const pIni = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
  const pFim = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, diasPrev)).padStart(2, '0')}`;
  const diasMes = new Date(y, m, 0).getDate();
  return { atual: [ini, ref] as const, anterior: [pIni, pFim] as const, dia: d, diasMes };
}

export function resumoPeriodo(ls: Lancamento[], from: string, to: string) {
  const r = receitas(inRange(ls, from, to));
  const dsp = despesas(inRange(ls, from, to));
  const fat = sum(r.map((x) => x.valor));
  const custo = sum(dsp.map((x) => x.valor));
  const clientes = new Set(r.map((x) => x.clienteId).filter(Boolean)).size;
  return {
    faturamento: fat, despesas: custo, lucro: fat - custo, margem: fat ? (fat - custo) / fat : 0,
    vendas: r.length, ticket: r.length ? fat / r.length : 0, clientes,
  };
}

export function serieMensal(ls: Lancamento[], n = 6) {
  const meses = lastMonths(n);
  return meses.map((mk) => {
    const doMes = ls.filter((l) => monthKey(l.data) === mk);
    const rec = sum(receitas(doMes).map((x) => x.valor));
    const desp = sum(despesas(doMes).map((x) => x.valor));
    return { mes: mk, receitas: rec, despesas: desp, lucro: rec - desp, vendas: receitas(doMes).length };
  });
}

/** Decompõe a variação de faturamento em efeito volume e efeito ticket (método de efeitos parciais). */
export function decomposicao(a: ReturnType<typeof resumoPeriodo>, b: ReturnType<typeof resumoPeriodo>) {
  const efeitoVolume = (a.vendas - b.vendas) * b.ticket;
  const efeitoTicket = (a.ticket - b.ticket) * a.vendas;
  return { efeitoVolume, efeitoTicket, total: a.faturamento - b.faturamento };
}

export interface Insight {
  kind: 'risk' | 'warn' | 'good' | 'opp';
  title: string;
  detail: string;
  action: string;
  to: string;
  peso: number; // prioridade (maior = mais relevante)
}

export function gerarInsights(db: Database): Insight[] {
  const hoje = today();
  const out: Insight[] = [];
  const p = periodos(hoje);
  const atual = resumoPeriodo(db.lancamentos, ...p.atual);
  const ant = resumoPeriodo(db.lancamentos, ...p.anterior);

  // 1. Projeção x meta
  const projecao = p.dia ? (atual.faturamento / p.dia) * p.diasMes : 0;
  const meta = db.empresa.metaMensal;
  // Com menos de 7 dias de dados a projeção linear é instável: não gera alerta de meta
  if (meta > 0 && p.dia >= 7) {
    const gap = meta - projecao;
    if (gap > meta * 0.02) {
      const restantes = p.diasMes - p.dia;
      const faltaReal = meta - atual.faturamento;
      out.push({
        kind: gap / meta > 0.1 ? 'risk' : 'warn', peso: 90,
        title: `Projeção do mês abaixo da meta em ${money(gap)}`,
        detail: `Ritmo atual projeta ${money(projecao)} (${pct(projecao / meta)} da meta de ${money(meta)}). Faltam ${money(Math.max(0, faltaReal))}${restantes > 0 ? ` em ${restantes} dia(s) — cerca de ${Math.ceil(Math.max(0, faltaReal) / Math.max(1, atual.ticket || 1))} venda(s) no ticket médio atual` : ''}.`,
        action: 'Priorizar propostas em negociação', to: '/funil',
      });
    } else {
      out.push({
        kind: 'good', peso: 40,
        title: `Ritmo projeta ${pct(projecao / meta)} da meta`,
        detail: `Projeção de ${money(projecao)} contra meta de ${money(meta)}. Avalie elevar a meta ou antecipar serviços da agenda.`,
        action: 'Ver financeiro', to: '/financeiro',
      });
    }
  }

  // 2. Decomposição da variação (volume x ticket)
  const dec = decomposicao(atual, ant);
  const v = variation(atual.faturamento, ant.faturamento);
  if (v !== null && Math.abs(v) >= 0.05) {
    const principal = Math.abs(dec.efeitoVolume) >= Math.abs(dec.efeitoTicket) ? 'volume de vendas' : 'ticket médio';
    out.push({
      kind: v > 0 ? 'good' : 'warn', peso: 70,
      title: `Faturamento ${v > 0 ? 'subiu' : 'caiu'} ${pct(Math.abs(v))} vs. mesmo período do mês anterior`,
      detail: `Principal fator: ${principal}. Efeito volume ${dec.efeitoVolume >= 0 ? '+' : ''}${money(dec.efeitoVolume)} (${atual.vendas} vs ${ant.vendas} vendas); efeito ticket ${dec.efeitoTicket >= 0 ? '+' : ''}${money(dec.efeitoTicket)} (${money(atual.ticket)} vs ${money(ant.ticket)}).`,
      action: 'Abrir relatório de vendas por serviço', to: '/relatorios',
    });
  }

  // 3. OS atrasadas
  const atrasadas = db.ordens.filter((o) => (ABERTAS as readonly string[]).includes(o.status) && o.prazo < hoje);
  if (atrasadas.length) {
    out.push({
      kind: 'risk', peso: 95,
      title: `${atrasadas.length} ordem(ns) de serviço com prazo vencido`,
      detail: `${money(sum(atrasadas.map((o) => o.valor)))} em serviços atrasados (${atrasadas.map((o) => o.numero).join(', ')}). Atraso afeta satisfação e recompra.`,
      action: 'Ver ordens atrasadas', to: '/ordens?filtro=atrasadas',
    });
  }

  // 4. Orçamentos vencendo
  const lim = addDays(hoje, db.empresa.diasAlertaOrcamento);
  const vencendo = db.orcamentos.filter((o) => ['Orçamento', 'Em análise', 'Proposta enviada'].includes(o.status) && o.validade >= hoje && o.validade <= lim);
  if (vencendo.length) {
    out.push({
      kind: 'opp', peso: 85,
      title: `${vencendo.length} proposta(s) vencem em até ${db.empresa.diasAlertaOrcamento} dias`,
      detail: `${money(sum(vencendo.map((o) => o.valor)))} em jogo. Um follow-up antes do vencimento costuma elevar a conversão.`,
      action: 'Fazer follow-up', to: '/orcamentos?filtro=vencendo',
    });
  }

  // 5. Clientes em risco (sem compra há mais de 90 dias, mas com histórico)
  const ultimaCompra = new Map<string, string>();
  const receita12m = new Map<string, number>();
  const ini12 = addDays(hoje, -365);
  for (const l of receitas(db.lancamentos)) {
    if (!l.clienteId) continue;
    if ((ultimaCompra.get(l.clienteId) ?? '') < l.data) ultimaCompra.set(l.clienteId, l.data);
    if (l.data >= ini12) receita12m.set(l.clienteId, (receita12m.get(l.clienteId) ?? 0) + l.valor);
  }
  const risco = db.clientes.filter((c) => c.status === 'Ativo' && ultimaCompra.has(c.id) && diffDays(hoje, ultimaCompra.get(c.id)!) > 90);
  if (risco.length) {
    out.push({
      kind: 'warn', peso: 60,
      title: `${risco.length} cliente(s) sem comprar há mais de 90 dias`,
      detail: `${risco.slice(0, 3).map((c) => c.nome).join(', ')}${risco.length > 3 ? '…' : ''} — somaram ${money(sum(risco.map((c) => receita12m.get(c.id) ?? 0)))} nos últimos 12 meses.`,
      action: 'Criar campanha de reativação', to: '/clientes?filtro=risco',
    });
  }

  // 6. Concentração de receita (Pareto)
  const total12 = sum([...receita12m.values()]);
  const top = [...receita12m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const share = total12 ? sum(top.map((t) => t[1])) / total12 : 0;
  if (share > 0.45) {
    const nome = (id: string) => db.clientes.find((c) => c.id === id)?.nome ?? id;
    out.push({
      kind: 'warn', peso: 45,
      title: `3 clientes concentram ${pct(share)} da receita de 12 meses`,
      detail: `${top.map(([id]) => nome(id)).join(', ')}. Dependência alta aumenta o risco caso algum deixe de comprar.`,
      action: 'Ver faturamento por cliente', to: '/relatorios',
    });
  }

  // 7. Categoria em crescimento (últimos 90 dias vs 90 anteriores)
  const r90 = receitas(inRange(db.lancamentos, addDays(hoje, -90), hoje));
  const r180 = receitas(inRange(db.lancamentos, addDays(hoje, -180), addDays(hoje, -91)));
  const cats = [...new Set(receitas(db.lancamentos).map((l) => l.categoria))];
  const cres = cats.map((c) => {
    const a = sum(r90.filter((l) => l.categoria === c).map((l) => l.valor));
    const b = sum(r180.filter((l) => l.categoria === c).map((l) => l.valor));
    return { c, a, b, v: variation(a, b) };
  }).filter((x) => x.v !== null && x.b > 0).sort((x, y) => (y.v! - x.v!));
  if (cres.length && cres[0].v! > 0.1) {
    const x = cres[0];
    out.push({
      kind: 'opp', peso: 50,
      title: `${x.c} cresceu ${pct(x.v!)} no último trimestre`,
      detail: `${money(x.a)} nos últimos 90 dias contra ${money(x.b)} nos 90 anteriores. Oportunidade de ofertar o serviço à base que ainda não o contratou (cross-sell).`,
      action: 'Abrir funil comercial', to: '/funil',
    });
  }
  const queda = cres.length ? cres[cres.length - 1] : null;
  if (queda && queda.v! < -0.15) {
    out.push({
      kind: 'warn', peso: 55,
      title: `${queda.c} caiu ${pct(Math.abs(queda.v!))} no último trimestre`,
      detail: `${money(queda.a)} vs ${money(queda.b)}. Verifique se é sazonalidade, preço ou perda de clientes específicos.`,
      action: 'Ver vendas por serviço', to: '/relatorios',
    });
  }

  // 8. Conversão de orçamentos
  const decididos = db.orcamentos.filter((o) => ['Convertido', 'Recusado'].includes(o.status));
  const conv = decididos.filter((o) => o.status === 'Convertido');
  if (decididos.length >= 3) {
    const taxa = conv.length / decididos.length;
    const pendentes = db.orcamentos.filter((o) => ['Orçamento', 'Em análise', 'Proposta enviada'].includes(o.status));
    out.push({
      kind: taxa < 0.5 ? 'warn' : 'good', peso: 35,
      title: `Conversão de orçamentos: ${pct(taxa)}`,
      detail: `${conv.length} de ${decididos.length} decididos. Aplicada às ${pendentes.length} propostas abertas, a taxa atual indica ~${money(sum(pendentes.map((o) => o.valor)) * taxa)} em receita esperada.`,
      action: 'Ver orçamentos', to: '/orcamentos',
    });
  }

  // 9. Recebíveis pendentes
  const pend = receitas(db.lancamentos).filter((l) => l.status === 'Pendente');
  if (pend.length) {
    out.push({
      kind: 'opp', peso: 65,
      title: `${money(sum(pend.map((l) => l.valor)))} a receber`,
      detail: `${pend.length} lançamento(s) de receita pendente(s). Cobrança ativa melhora o fluxo de caixa.`,
      action: 'Ver pendências', to: '/financeiro?status=Pendente',
    });
  }

  // 10. Estoque abaixo do mínimo travando OS
  const baixos = (db.pecas ?? []).filter((p) => p.quantidade < p.minimo);
  if (baixos.length) {
    const aguardando = db.ordens.filter((o) => o.status === 'Aguardando peças');
    out.push({
      kind: aguardando.length ? 'risk' : 'warn', peso: aguardando.length ? 80 : 42,
      title: `${baixos.length} peça(s) abaixo do estoque mínimo`,
      detail: `${baixos.slice(0, 3).map((p) => `${p.nome} (${p.quantidade}/${p.minimo})`).join(', ')}${baixos.length > 3 ? '…' : ''}.${aguardando.length ? ` ${aguardando.length} OS aguardando peças (${money(sum(aguardando.map((o) => o.valor)))} parados).` : ''}`,
      action: 'Ver lista de compras', to: '/estoque',
    });
  }

  // 11. Contratos a renovar
  const renov = (db.contratos ?? []).filter((c) => c.status === 'Ativo' && c.renovacao <= addDays(hoje, 30));
  if (renov.length) {
    out.push({
      kind: 'warn', peso: 75,
      title: `${renov.length} contrato(s) vencem em até 30 dias`,
      detail: `${money(sum(renov.map((c) => c.valorMensal)))}/mês de receita recorrente em jogo (${money(sum(renov.map((c) => c.valorMensal)) * 12)}/ano). Agende a conversa de renovação antes do vencimento.`,
      action: 'Ver contratos', to: '/contratos',
    });
  }
  const mesAtual = hoje.slice(0, 7);
  const semCobranca = (db.contratos ?? []).filter((c) => c.status === 'Ativo' && (c.ultimaCobranca ?? '') < mesAtual && c.inicio <= hoje);
  if (semCobranca.length) {
    out.push({
      kind: 'opp', peso: 68,
      title: `Cobranças recorrentes do mês não geradas`,
      detail: `${semCobranca.length} contrato(s) ativos somando ${money(sum(semCobranca.map((c) => c.valorMensal)))} ainda sem cobrança lançada neste mês.`,
      action: 'Gerar cobranças', to: '/contratos',
    });
  }

  // 12. Turmas abaixo do ponto de equilíbrio perto de começar
  const turmasRisco = (db.turmas ?? []).filter((t) => t.status === 'Inscrições abertas' && diffDays(t.inicio, hoje) <= 10 &&
    t.precoAluno > 0 && t.alunos.length < Math.ceil(t.custoTurma / t.precoAluno));
  for (const t of turmasRisco) {
    const faltam = Math.ceil(t.custoTurma / t.precoAluno) - t.alunos.length;
    out.push({
      kind: 'risk', peso: 72,
      title: `Turma "${t.curso}" abaixo do equilíbrio`,
      detail: `Começa em ${diffDays(t.inicio, hoje)} dia(s) com ${t.alunos.length}/${t.vagas} alunos; faltam ${faltam} inscrição(ões) para cobrir o custo de ${money(t.custoTurma)}.`,
      action: 'Ver turmas', to: '/treinamentos',
    });
  }

  // 13. Satisfação: detratores recentes
  const detratores = db.ordens.filter((o) => o.avaliacao !== undefined && o.avaliacao <= 6 && (o.conclusao ?? '') >= addDays(hoje, -60));
  if (detratores.length) {
    out.push({
      kind: 'warn', peso: 58,
      title: `${detratores.length} cliente(s) insatisfeito(s) nos últimos 60 dias`,
      detail: `${detratores.map((o) => `${o.numero} (nota ${o.avaliacao})`).join(', ')}. Um contato de recuperação reduz o risco de perda e de indicação negativa.`,
      action: 'Ver ordens de serviço', to: '/ordens',
    });
  }

  // 14. Social media: conteúdo dos próximos dias e retorno das redes
  for (const s of insightsSocial(db, hoje).filter((x) => x.kind === 'risk' || x.title.startsWith('Impulsionamento'))) {
    out.push({ ...s, peso: s.kind === 'risk' ? 52 : 38, action: 'Abrir Social Media', to: '/social' });
  }

  return out.sort((a, b) => b.peso - a.peso);
}
