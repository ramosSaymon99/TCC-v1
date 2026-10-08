export type ChannelId = 'google' | 'meta' | 'tiktok' | 'linkedin' | 'email' | 'influencer';

export interface Channel {
  id: ChannelId;
  name: string;
  short: string;
  color: string;
  utmSource: string;
  utmMedium: string;
}

/** Premissas de um canal. Ficam editáveis porque benchmark de mercado é ponto de partida, não verdade. */
export interface Bench {
  cpc: number; // custo por clique inicial (R$)
  convLead: number; // clique → lead (0–1)
  leadSale: number; // lead → venda (0–1)
  scale: number; // investimento (R$) em que o custo por clique já dobrou: mede a saturação do canal
  cap: number; // teto de verba útil (ex.: tamanho da base de e-mail); 0 = sem limite
}

// Ordem fixa das cores por canal (paleta categórica validada para daltonismo, slots 1–6)
export const CHANNELS: Channel[] = [
  { id: 'google', name: 'Google Ads (Pesquisa)', short: 'Google', color: '#2a78d6', utmSource: 'google', utmMedium: 'cpc' },
  { id: 'meta', name: 'Meta Ads (Instagram/Facebook)', short: 'Meta', color: '#eb6834', utmSource: 'meta', utmMedium: 'paid_social' },
  { id: 'tiktok', name: 'TikTok Ads', short: 'TikTok', color: '#1baf7a', utmSource: 'tiktok', utmMedium: 'paid_social' },
  { id: 'linkedin', name: 'LinkedIn Ads', short: 'LinkedIn', color: '#eda100', utmSource: 'linkedin', utmMedium: 'paid_social' },
  { id: 'email', name: 'E-mail marketing', short: 'E-mail', color: '#e87ba4', utmSource: 'newsletter', utmMedium: 'email' },
  { id: 'influencer', name: 'Influenciadores', short: 'Influência', color: '#008300', utmSource: 'instagram', utmMedium: 'influencer' },
];

export const channelById = (id: ChannelId) => CHANNELS.find((c) => c.id === id)!;

export interface Campaign {
  name: string;
  preset: string;
  goal: 'lucro' | 'leads';
  ticket: number;
  margin: number; // margem de contribuição (0–1)
  budget: number;
  start: string;
  end: string;
  url: string;
  alloc: Record<ChannelId, number>; // fração do orçamento (soma = 1)
  bench: Record<ChannelId, Bench>;
}

export interface ChannelResult {
  id: ChannelId;
  spend: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
  profit: number; // margem de contribuição − mídia
  cpl: number;
  cac: number;
  roas: number;
  marginalCac: number; // custo da próxima venda neste canal
}

/**
 * Cliques com retorno decrescente: o custo do clique sobe conforme o investimento cresce
 * (públicos mais caros, frequência maior). Custo marginal = cpc · (1 + S/scale) ⇒
 * cliques(S) = (scale / cpc) · ln(1 + S/scale).
 */
export function clicksFor(spend: number, b: Bench) {
  const useful = b.cap > 0 ? Math.min(spend, b.cap) : spend;
  if (useful <= 0) return 0;
  return (b.scale / b.cpc) * Math.log(1 + useful / b.scale);
}

export function simulateChannel(id: ChannelId, spend: number, c: Campaign): ChannelResult {
  const b = c.bench[id];
  const clicks = clicksFor(spend, b);
  const leads = clicks * b.convLead;
  const sales = leads * b.leadSale;
  const revenue = sales * c.ticket;
  const profit = revenue * c.margin - spend;
  const capped = b.cap > 0 && spend >= b.cap;
  const marginalCac = capped ? Infinity : (b.cpc * (1 + spend / b.scale)) / (b.convLead * b.leadSale);
  return {
    id,
    spend,
    clicks,
    leads,
    sales,
    revenue,
    profit,
    cpl: leads ? spend / leads : 0,
    cac: sales ? spend / sales : 0,
    roas: spend ? revenue / spend : 0,
    marginalCac,
  };
}

export interface Totals {
  spend: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
  profit: number;
  cpl: number;
  cac: number;
  roas: number;
  breakEvenRoas: number;
  maxCac: number; // CAC máximo antes de dar prejuízo = ticket × margem
}

export function simulate(c: Campaign, alloc = c.alloc) {
  const rows = CHANNELS.map((ch) => simulateChannel(ch.id, c.budget * (alloc[ch.id] ?? 0), c));
  const sum = (k: keyof ChannelResult) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const spend = sum('spend');
  const leads = sum('leads');
  const sales = sum('sales');
  const revenue = sum('revenue');
  const totals: Totals = {
    spend,
    clicks: sum('clicks'),
    leads,
    sales,
    revenue,
    profit: sum('profit'),
    cpl: leads ? spend / leads : 0,
    cac: sales ? spend / sales : 0,
    roas: spend ? revenue / spend : 0,
    breakEvenRoas: c.margin ? 1 / c.margin : Infinity,
    maxCac: c.ticket * c.margin,
  };
  return { rows, totals };
}

/**
 * Distribuição ótima por alocação gulosa em passos de 1% do orçamento: cada passo vai para o canal
 * com o maior ganho marginal. Como cada canal tem retorno decrescente (côncavo), o guloso chega ao ótimo.
 * Canais com fração mínima travada (ex.: e-mail para a base) podem ser excluídos via `enabled`.
 */
export function optimize(c: Campaign, enabled: ChannelId[]): Record<ChannelId, number> {
  const steps = 100;
  const step = c.budget / steps;
  const spend = Object.fromEntries(CHANNELS.map((ch) => [ch.id, 0])) as Record<ChannelId, number>;
  const value = (id: ChannelId, s: number) => {
    const r = simulateChannel(id, s, c);
    return c.goal === 'leads' ? r.leads : r.revenue * c.margin - s;
  };
  for (let i = 0; i < steps; i++) {
    let best: ChannelId | null = null;
    let bestGain = -Infinity;
    for (const id of enabled) {
      const gain = value(id, spend[id] + step) - value(id, spend[id]);
      if (gain > bestGain) {
        bestGain = gain;
        best = id;
      }
    }
    if (!best) break;
    spend[best] += step;
  }
  return Object.fromEntries(CHANNELS.map((ch) => [ch.id, c.budget ? spend[ch.id] / c.budget : 0])) as Record<ChannelId, number>;
}

/** Reequilibra as frações quando o usuário mexe em um canal: o restante é redistribuído proporcionalmente. */
export function setShare(alloc: Record<ChannelId, number>, id: ChannelId, value: number): Record<ChannelId, number> {
  const v = Math.min(1, Math.max(0, value));
  const others = CHANNELS.filter((c) => c.id !== id);
  const restBefore = others.reduce((s, c) => s + alloc[c.id], 0);
  const restAfter = 1 - v;
  const next = { ...alloc, [id]: v };
  for (const c of others) {
    next[c.id] = restBefore > 0 ? (alloc[c.id] / restBefore) * restAfter : restAfter / others.length;
  }
  return next;
}

// ---------- insights ----------

export interface Insight {
  tone: 'good' | 'warn' | 'bad' | 'info';
  title: string;
  text: string;
}

export function insights(c: Campaign, sim: ReturnType<typeof simulate>, optimal: ReturnType<typeof simulate>): Insight[] {
  const out: Insight[] = [];
  const { totals } = sim;
  const active = sim.rows.filter((r) => r.spend > 0 && r.sales > 0);
  const name = (id: ChannelId) => channelById(id).short;

  if (totals.spend > 0) {
    if (totals.profit < 0) {
      out.push({
        tone: 'bad',
        title: 'A campanha, como está, dá prejuízo',
        text: `O ROAS previsto é ${fmtX(totals.roas)} e o ponto de equilíbrio com margem de ${pct(c.margin)} é ${fmtX(
          totals.breakEvenRoas,
        )}. Cada venda custa ${brl(totals.cac)} em mídia, acima dos ${brl(totals.maxCac)} de margem que ela gera.`,
      });
    } else {
      out.push({
        tone: 'good',
        title: `Retorno previsto de ${brl(totals.profit)} sobre a mídia`,
        text: `ROAS ${fmtX(totals.roas)}, acima do ponto de equilíbrio de ${fmtX(totals.breakEvenRoas)}. Folga de ${brl(
          totals.maxCac - totals.cac,
        )} por venda antes de virar prejuízo.`,
      });
    }
  }

  const gain = c.goal === 'leads' ? optimal.totals.leads - totals.leads : optimal.totals.profit - totals.profit;
  const threshold = c.goal === 'leads' ? Math.max(1, totals.leads * 0.03) : Math.max(100, c.budget * 0.02);
  if (gain > threshold) {
    out.push({
      tone: 'info',
      title: 'Há uma distribuição melhor para o mesmo orçamento',
      text:
        c.goal === 'leads'
          ? `Redistribuir a verba gera cerca de ${num(gain)} leads a mais (+${pct(gain / Math.max(totals.leads, 1))}) sem gastar um real a mais.`
          : `Redistribuir a verba aumenta o resultado em cerca de ${brl(gain)} sem gastar um real a mais.`,
    });
  }

  if (active.length >= 2) {
    const sorted = [...active].sort((a, b) => a.cac - b.cac);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (worst.cac > best.cac * 1.25) {
      out.push({
        tone: 'info',
        title: `${name(best.id)} traz clientes ${pct(1 - best.cac / worst.cac)} mais baratos que ${name(worst.id)}`,
        text: `CAC de ${brl(best.cac)} contra ${brl(worst.cac)}. Antes de cortar ${name(worst.id)}, confira se ele cumpre outro papel (marca, público novo, remarketing).`,
      });
    }
  }

  // saturação de canal: só faz sentido apontar quando tirar verba dele e levar para outro resolve
  const optShare = (id: ChannelId) => (optimal.totals.spend ? (optimal.rows.find((r) => r.id === id)?.spend ?? 0) / optimal.totals.spend : 0);
  const saturated = sim.rows.filter(
    (r) => c.goal === 'lucro' && r.spend > 0 && r.marginalCac > totals.maxCac && optShare(r.id) < (c.alloc[r.id] ?? 0) - 0.03,
  );
  for (const r of saturated.slice(0, 2)) {
    const b = c.bench[r.id];
    out.push({
      tone: 'warn',
      title: `${name(r.id)} passou do ponto de saturação`,
      text:
        b.cap > 0 && r.spend >= b.cap
          ? `Acima de ${brl(b.cap)} esse canal não gera mais resultado (limite da base/público). Os ${brl(r.spend - b.cap)} excedentes rendem mais em outro canal.`
          : `Com ${brl(r.spend)} investidos, a próxima venda nesse canal custaria ${brl(r.marginalCac)}, mais que a margem de ${brl(
              totals.maxCac,
            )}. A verba extra rende mais em outro canal.`,
    });
  }

  if (c.goal === 'lucro' && c.budget > 0) {
    const best = bestBudget(c);
    if (best.budget < c.budget * 0.9 && best.profit > optimal.totals.profit + Math.max(100, c.budget * 0.01)) {
      out.push({
        tone: 'warn',
        title: `O orçamento passou do ponto ótimo: ${brl(best.budget)} rende mais`,
        text: `Mesmo bem distribuídos, os últimos ${brl(c.budget - best.budget)} trazem menos margem do que custam. Com ${brl(
          best.budget,
        )} o resultado sobe para cerca de ${brl(best.profit)}. Se o objetivo for volume ou marca, mantenha o orçamento sabendo desse custo.`,
      });
    } else if (best.budget > c.budget * 1.1 && best.profit > optimal.totals.profit + Math.max(100, c.budget * 0.02)) {
      out.push({
        tone: 'info',
        title: `Há espaço para escalar até ${brl(best.budget)}`,
        text: `Até esse valor, cada real a mais ainda volta com lucro: o resultado iria para cerca de ${brl(best.profit)} (+${brl(
          best.profit - optimal.totals.profit,
        )}). Escale em degraus de 20% e confira o CAC real a cada degrau.`,
      });
    }
  }

  const days = daysBetween(c.start, c.end);
  if (days > 0 && totals.spend > 0) {
    out.push({
      tone: 'info',
      title: `Ritmo: ${brl(totals.spend / days)} por dia, por ${days} dias`,
      text: `Meta diária de ${num(totals.leads / days, 1)} leads e ${num(totals.sales / days, 1)} vendas. Se nos primeiros 3 dias o CPL vier mais de 30% acima de ${brl(
        totals.cpl,
      )}, revise os criativos antes de escalar.`,
    });
  }
  return out;
}

/** Orçamento que maximiza o resultado, já com a melhor distribuição: varre de 20% a 300% do orçamento atual. */
export function bestBudget(c: Campaign) {
  const enabled = CHANNELS.map((ch) => ch.id);
  let best = { budget: c.budget, profit: -Infinity };
  for (let f = 0.2; f <= 3.0001; f += 0.05) {
    const trial = { ...c, budget: Math.round((c.budget * f) / 100) * 100 };
    const p = simulate(trial, optimize(trial, enabled)).totals.profit;
    if (p > best.profit) best = { budget: trial.budget, profit: p };
  }
  return best;
}

// ---------- formatação e datas ----------

export const brl = (v: number, digits = 0) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: digits, minimumFractionDigits: digits });
export const num = (v: number, digits = 0) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const pct = (v: number, digits = 0) => `${num(v * 100, digits)}%`;
export const fmtX = (v: number) => `${num(v, 1)}x`;

export const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5) + 1;
export const shortDate = (iso: string) => fromISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
