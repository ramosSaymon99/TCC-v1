import type { Assinante, Plataforma, UsoTenant } from '../types';
import {
  cfgDe, modulosLiberados, mrrDe, PAGANTE, planoDe, saudeDe, usoDe, valorMensal, vencida, type Saude,
} from '../store/plataforma';
import { addDays, diffDays, lastMonths, money, monthLabel, pct, today } from './format';

/** Receita mensal por assinante num mês: faturas emitidas (meses passados) ou contrato vigente (mês atual). */
export function mapaMes(p: Plataforma, mes: string, mesAtual = today().slice(0, 7)): Map<string, number> {
  const m = new Map<string, number>();
  if (mes === mesAtual) {
    for (const a of p.assinantes) { const v = mrrDe(a, p); if (v > 0) m.set(a.id, v); }
    return m;
  }
  for (const f of p.faturas) if (f.competencia === mes && f.status !== 'Cancelada') m.set(f.assinanteId, (m.get(f.assinanteId) ?? 0) + f.valor);
  return m;
}

export interface PontoMrr { mes: string; label: string; mrr: number; pagantes: number; novo: number; expansao: number; contracao: number; churn: number; churnN: number; novosN: number }

/** Série do MRR com a decomposição do movimento mês a mês. */
export function serieMrr(p: Plataforma, n = 12): PontoMrr[] {
  const meses = lastMonths(n + 1);
  const mapas = meses.map((m) => mapaMes(p, m));
  return meses.slice(1).map((mes, i) => {
    const ant = mapas[i], cur = mapas[i + 1];
    let novo = 0, expansao = 0, contracao = 0, churn = 0, churnN = 0, novosN = 0;
    for (const [id, v] of cur) {
      const a = ant.get(id);
      if (a === undefined) { novo += v; novosN++; } else if (v > a) expansao += v - a; else if (v < a) contracao += a - v;
    }
    for (const [id, v] of ant) if (!cur.has(id)) { churn += v; churnN++; }
    const mrr = [...cur.values()].reduce((s, v) => s + v, 0);
    return { mes, label: monthLabel(mes), mrr, pagantes: cur.size, novo, expansao, contracao, churn, churnN, novosN };
  });
}

export interface LinhaAssinante extends Assinante {
  plano: string; mrr: number; valor: number; usoT: UsoTenant; saude: Saude; maxUsuarios: number; ocupacao: number;
  emAberto: number; vencido: number; diasTrial: number | null; modulos: number;
}

export function linhas(p: Plataforma, uso: Record<string, UsoTenant>): LinhaAssinante[] {
  const hoje = today();
  const cfg = cfgDe(p);
  return p.assinantes.map((a) => {
    const plano = planoDe(p, a.planoId);
    const u = usoDe(a, uso, p);
    const max = (plano?.maxUsuarios ?? 1) + a.usuariosExtras;
    const fats = p.faturas.filter((f) => f.assinanteId === a.id && f.status === 'Em aberto');
    return {
      ...a, plano: plano?.nome ?? '—', mrr: mrrDe(a, p), valor: valorMensal(a, plano, cfg), usoT: u, saude: saudeDe(a, u, p, hoje),
      maxUsuarios: max, ocupacao: u.usuarios / max, emAberto: fats.reduce((s, f) => s + f.valor, 0),
      vencido: fats.filter((f) => vencida(f, hoje)).reduce((s, f) => s + f.valor, 0),
      diasTrial: a.status === 'Trial' && a.trialFim ? diffDays(a.trialFim, hoje) : null,
      modulos: modulosLiberados(a, plano).length,
    };
  });
}

export interface KpisSaas {
  mrr: number; mrrAnt: number; arr: number; pagantes: number; arpa: number;
  churnLogo: number; churnReceita: number; churnN: number; nrr: number | null;
  vencido: number; inadimplentes: number; trials: number; trialsVencendo: number; conversao: number | null; trialsBase: number;
  cac: number | null; ltv: number | null; payback: number | null; churnMedio: number; novos3m: number;
}

export function kpis(p: Plataforma, serie: PontoMrr[], ls: LinhaAssinante[]): KpisSaas {
  const hoje = today();
  const cfg = cfgDe(p);
  const cur = serie[serie.length - 1], ant = serie[serie.length - 2];
  const mrr = cur.mrr, mrrAnt = ant?.mrr ?? 0;
  const pagantes = ls.filter((a) => PAGANTE.includes(a.status)).length;
  const trialsBase = p.assinantes.filter((a) => a.trialFim && a.trialFim < hoje && a.trialFim >= addDays(hoje, -120));
  // churn de receita médio dos últimos 6 meses (base do LTV)
  const taxas = serie.slice(1).map((x, i) => (serie[i].mrr ? x.churn / serie[i].mrr : 0)).slice(-6);
  const churnMedio = taxas.length ? taxas.reduce((s, v) => s + v, 0) / taxas.length : 0;
  const novos3m = serie.slice(-3).reduce((s, x) => s + x.novosN, 0);
  const cac = novos3m ? (cfg.investimentoAquisicaoMes * 3) / novos3m : null;
  const arpa = pagantes ? mrr / pagantes : 0;
  const ltv = churnMedio > 0 ? arpa / churnMedio : null;
  return {
    mrr, mrrAnt, arr: mrr * 12, pagantes, arpa,
    churnLogo: ant?.pagantes ? cur.churnN / ant.pagantes : 0, churnReceita: mrrAnt ? cur.churn / mrrAnt : 0, churnN: cur.churnN,
    nrr: mrrAnt ? (mrrAnt + cur.expansao - cur.contracao - cur.churn) / mrrAnt : null,
    vencido: ls.reduce((s, a) => s + a.vencido, 0), inadimplentes: ls.filter((a) => a.vencido > 0).length,
    trials: ls.filter((a) => a.diasTrial !== null && a.diasTrial >= 0).length,
    trialsVencendo: ls.filter((a) => a.diasTrial !== null && a.diasTrial >= 0 && a.diasTrial <= 7).length,
    conversao: trialsBase.length ? trialsBase.filter((a) => a.convertidoEm).length / trialsBase.length : null, trialsBase: trialsBase.length,
    cac, ltv, payback: cac && arpa ? cac / arpa : null, churnMedio, novos3m,
  };
}

export interface InsightSaas { tone: 'risk' | 'warn' | 'opp' | 'good'; titulo: string; texto: string; acao?: string; to?: string; valor: number }

/** "Onde agir" do console: ordena por impacto financeiro (MRR em jogo). */
export function insightsSaas(p: Plataforma, ls: LinhaAssinante[], serie: PontoMrr[], k: KpisSaas): InsightSaas[] {
  const hoje = today();
  const cfg = cfgDe(p);
  const out: InsightSaas[] = [];
  const nomes = (xs: LinhaAssinante[]) => xs.slice(0, 3).map((x) => x.empresa).join(', ') + (xs.length > 3 ? ` e mais ${xs.length - 3}` : '');

  const atrasoAlto = ls.filter((a) => a.saude.atrasoDias > cfg.diasTolerancia && a.status !== 'Suspensa' && a.status !== 'Cancelada');
  if (atrasoAlto.length) {
    const v = atrasoAlto.reduce((s, a) => s + a.vencido, 0);
    out.push({ tone: 'risk', valor: v + atrasoAlto.reduce((s, a) => s + a.mrr, 0), titulo: `${atrasoAlto.length} empresa(s) com atraso acima de ${cfg.diasTolerancia} dias`,
      texto: `${money(v)} vencidos (${nomes(atrasoAlto)}). Acione a cobrança hoje; sem regularização, suspenda o acesso para não acumular dívida e serviço sem receita.`,
      acao: 'Ver faturas vencidas', to: '/console/faturas?filtro=vencidas' });
  }

  const trials = ls.filter((a) => a.diasTrial !== null && a.diasTrial >= 0 && a.diasTrial <= 7);
  if (trials.length) {
    const pot = trials.reduce((s, a) => s + a.valor, 0);
    const frios = trials.filter((a) => a.saude.adocao < 0.3);
    out.push({ tone: 'warn', valor: pot, titulo: `${trials.length} teste(s) grátis terminam em até 7 dias`,
      texto: `${money(pot)}/mês em potencial (${nomes(trials)}).${frios.length ? ` ${frios.length} com baixa adoção (${nomes(frios)}): ofereça uma sessão de implantação antes de pedir a contratação.` : ' Ligue para fechar a contratação antes do fim do teste.'}`,
      acao: 'Ver testes', to: '/console/assinantes?status=Trial' });
  }

  const risco = ls.filter((a) => PAGANTE.includes(a.status) && a.saude.nivel === 'Risco');
  if (risco.length) {
    const v = risco.reduce((s, a) => s + a.mrr, 0);
    out.push({ tone: 'risk', valor: v * 6, titulo: `${risco.length} assinante(s) com risco de cancelamento`,
      texto: `${money(v)}/mês em risco (${pct(k.mrr ? v / k.mrr : 0)} do MRR): pouco acesso, baixa adoção ou atraso. Ação de sucesso do cliente: ligação + treinamento dos módulos não usados.`,
      acao: 'Ver contas em risco', to: '/console/assinantes?saude=Risco' });
  }

  const planosOrd = [...p.planos].filter((x) => x.ativo).sort((a, b) => a.ordem - b.ordem);
  const lotados = ls.filter((a) => PAGANTE.includes(a.status) && a.usoT.usuarios >= a.maxUsuarios);
  if (lotados.length) {
    const pot = lotados.reduce((s, a) => {
      const atual = planoDe(p, a.planoId);
      const prox = planosOrd.find((x) => x.ordem > (atual?.ordem ?? 0));
      return s + (prox ? prox.precoMensal - (atual?.precoMensal ?? 0) : atual?.precoUsuarioExtra ?? 0);
    }, 0);
    out.push({ tone: 'opp', valor: pot, titulo: `${lotados.length} empresa(s) no limite de usuários do plano`,
      texto: `${nomes(lotados)} já usam todas as licenças. Oferecer upgrade de plano (ou usuários extras) pode somar até ${money(pot)}/mês.`,
      acao: 'Ver oportunidades', to: '/console/assinantes?filtro=limite' });
  }

  const fid = ls.filter((a) => a.ciclo === 'Anual' && a.fimFidelidade && PAGANTE.includes(a.status) && diffDays(a.fimFidelidade, hoje) >= 0 && diffDays(a.fimFidelidade, hoje) <= 60);
  if (fid.length) {
    const v = fid.reduce((s, a) => s + a.mrr, 0);
    out.push({ tone: 'warn', valor: v * 3, titulo: `${fid.length} fidelidade(s) anual(is) vencem em 60 dias`,
      texto: `${money(v)}/mês a renovar (${nomes(fid)}). Antecipe a renovação com reajuste ou bônus de usuários.`, acao: 'Ver assinantes', to: '/console/assinantes' });
  }

  const mesAtual = hoje.slice(0, 7);
  const semFatura = ls.filter((a) => PAGANTE.includes(a.status) && !a.cobranca?.ativa && !p.faturas.some((f) => f.assinanteId === a.id && f.competencia === mesAtual));
  if (semFatura.length) {
    const v = semFatura.reduce((s, a) => s + a.mrr, 0);
    out.push({ tone: 'warn', valor: v, titulo: `${semFatura.length} fatura(s) do mês ainda não emitidas`,
      texto: `${money(v)} que ainda não estão em cobrança. Gere as faturas para não atrasar o caixa.`, acao: 'Gerar faturas', to: '/console/faturas' });
  }

  const cur = serie[serie.length - 1];
  if (cur && cur.contracao > 0) {
    out.push({ tone: 'warn', valor: cur.contracao * 6, titulo: `Downgrade reduziu ${money(cur.contracao)}/mês do MRR`,
      texto: 'Entenda o motivo (preço ou falta de uso de módulos) antes que vire cancelamento. Downgrade costuma anteceder o churn.', acao: 'Ver assinantes', to: '/console/assinantes' });
  }

  const ord = ls.filter((a) => a.mrr > 0).sort((a, b) => b.mrr - a.mrr);
  const top3 = ord.slice(0, 3).reduce((s, a) => s + a.mrr, 0);
  if (k.mrr && top3 / k.mrr > 0.35) {
    out.push({ tone: 'warn', valor: top3 * 0.2, titulo: `3 maiores clientes concentram ${pct(top3 / k.mrr)} do MRR`,
      texto: `${nomes(ord.slice(0, 3))}. Perder um deles impacta fortemente a receita: priorize atendimento dedicado e contratos anuais.` });
  }

  if (k.nrr !== null && k.nrr >= 1 && cur && cur.expansao > 0) {
    out.push({ tone: 'good', valor: cur.expansao, titulo: `Retenção líquida de receita em ${pct(k.nrr)}`,
      texto: `Upgrades e extras (+${money(cur.expansao)}) compensaram contrações e cancelamentos do mês. A base atual cresce sozinha; mantenha o foco em adoção.` });
  }
  if (k.ltv && k.cac) {
    const r = k.ltv / k.cac;
    out.push({ tone: r >= 3 ? 'good' : 'warn', valor: 0, titulo: `LTV/CAC estimado em ${r.toFixed(1).replace('.', ',')}x`,
      texto: r >= 3 ? `Cada R$ 1 investido em aquisição retorna cerca de R$ ${r.toFixed(1).replace('.', ',')} ao longo da vida do cliente. Há espaço para acelerar a aquisição.`
        : 'Abaixo de 3x a aquisição consome muito do valor do cliente. Revise canais com menor conversão ou o preço de entrada.' });
  }
  return out.sort((a, b) => b.valor - a.valor);
}
