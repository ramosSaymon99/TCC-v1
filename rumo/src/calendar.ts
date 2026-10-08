import { CHANNELS, Campaign, ChannelId, addDays, daysBetween } from './model';

export type Status = 'planejado' | 'producao' | 'pronto';
export type Phase = 'Preparação' | 'Aquecimento' | 'Lançamento' | 'Sustentação' | 'Última chamada' | 'Análise';

export interface CalItem {
  id: string;
  date: string;
  channel: ChannelId | 'geral';
  phase: Phase;
  title: string;
  format: string;
  status: Status;
}

export const PHASES: { phase: Phase; color: string }[] = [
  { phase: 'Preparação', color: 'var(--phase-0)' },
  { phase: 'Aquecimento', color: 'var(--phase-1)' },
  { phase: 'Lançamento', color: 'var(--phase-2)' },
  { phase: 'Sustentação', color: 'var(--phase-3)' },
  { phase: 'Última chamada', color: 'var(--phase-4)' },
  { phase: 'Análise', color: 'var(--phase-0)' },
];

/** Divide o período em fases: aquecimento (25%), lançamento (10%), sustentação (resto), última chamada (15%). */
export function phaseWindows(c: Campaign) {
  const days = Math.max(daysBetween(c.start, c.end), 4);
  const warm = Math.max(1, Math.round(days * 0.25));
  const launch = Math.max(1, Math.round(days * 0.1));
  const last = Math.max(1, Math.round(days * 0.15));
  const sustain = Math.max(0, days - warm - launch - last);
  const w = [
    { phase: 'Aquecimento' as Phase, start: c.start, days: warm },
    { phase: 'Lançamento' as Phase, start: addDays(c.start, warm), days: launch },
    { phase: 'Sustentação' as Phase, start: addDays(c.start, warm + launch), days: sustain },
    { phase: 'Última chamada' as Phase, start: addDays(c.start, warm + launch + sustain), days: last },
  ];
  return w.filter((x) => x.days > 0).map((x) => ({ ...x, end: addDays(x.start, x.days - 1) }));
}

let seq = 0;
const id = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

export function generateCalendar(c: Campaign): CalItem[] {
  const items: CalItem[] = [];
  const add = (date: string, channel: CalItem['channel'], phase: Phase, title: string, format: string) =>
    items.push({ id: id(), date, channel, phase, title, format, status: 'planejado' });

  const active = CHANNELS.filter((ch) => (c.alloc[ch.id] ?? 0) >= 0.02).map((ch) => ch.id);
  const has = (ch: ChannelId) => active.includes(ch);
  const win = phaseWindows(c);
  const at = (p: Phase) => win.find((w) => w.phase === p);
  const warm = at('Aquecimento');
  const launch = at('Lançamento');
  const sustain = at('Sustentação');
  const last = at('Última chamada');

  add(addDays(c.start, -5), 'geral', 'Preparação', 'Briefing de criativos e copy por fase', 'Documento');
  add(addDays(c.start, -2), 'geral', 'Preparação', 'Checklist técnico: pixels, eventos de conversão, UTMs e página testados', 'Checklist');

  if (warm) {
    if (has('meta')) add(warm.start, 'meta', 'Aquecimento', 'Campanha de alcance com vídeo curto para criar público de remarketing', 'Reels 15s');
    if (has('tiktok')) add(warm.start, 'tiktok', 'Aquecimento', 'Vídeos nativos de bastidores e problema que o produto resolve', 'Vídeo 9:16');
    if (has('linkedin')) add(warm.start, 'linkedin', 'Aquecimento', 'Anúncio de conteúdo (guia/material rico) para gerar audiência qualificada', 'Document Ad');
    if (has('email')) add(addDays(warm.start, 1), 'email', 'Aquecimento', 'E-mail de conteúdo: o problema e o custo de não resolver', 'E-mail');
    if (has('influencer')) add(addDays(warm.start, 1), 'influencer', 'Aquecimento', 'Envio do briefing e aprovação dos roteiros com influenciadores', 'Roteiro');
    if (has('email') && warm.days >= 5) add(addDays(warm.start, Math.floor(warm.days / 2) + 1), 'email', 'Aquecimento', 'E-mail com prova social (caso, depoimento, número)', 'E-mail');
    add(warm.end, 'geral', 'Aquecimento', 'Antecipar a oferta para a base: lista VIP / pré-cadastro', 'Post + stories');
  }

  if (launch) {
    if (has('google')) add(launch.start, 'google', 'Lançamento', 'Ativar pesquisa: marca + termos de intenção de compra', 'Search');
    if (has('meta')) add(launch.start, 'meta', 'Lançamento', 'Conversão com 3 criativos de oferta + remarketing do aquecimento', 'Carrossel + Reels');
    if (has('tiktok')) add(launch.start, 'tiktok', 'Lançamento', 'Spark Ads com os vídeos de melhor retenção do aquecimento', 'Vídeo 9:16');
    if (has('linkedin')) add(launch.start, 'linkedin', 'Lançamento', 'Lead Gen Form com oferta direta (demo/diagnóstico)', 'Lead Gen Form');
    if (has('email')) add(launch.start, 'email', 'Lançamento', 'E-mail de abertura: a oferta está no ar', 'E-mail');
    if (has('influencer')) add(launch.start, 'influencer', 'Lançamento', 'Publicações dos influenciadores com cupom próprio', 'Reels + stories');
    add(addDays(launch.start, 2), 'geral', 'Lançamento', 'Leitura de 72h: CPL e CAC por canal × meta; pausar criativos fracos', 'Análise');
  }

  if (sustain && sustain.days > 0) {
    for (let d = 0; d < sustain.days; d += 7) {
      const day = addDays(sustain.start, d);
      add(day, 'geral', 'Sustentação', 'Revisão semanal: realocar verba para o canal com menor CAC marginal', 'Análise');
      if (has('meta') || has('tiktok')) add(addDays(day, 1), has('meta') ? 'meta' : 'tiktok', 'Sustentação', 'Novos criativos para evitar fadiga (frequência > 3)', 'Criativo');
      if (has('email')) add(addDays(day, 2), 'email', 'Sustentação', 'E-mail de objeções: preço, prazo, garantia', 'E-mail');
    }
  }

  if (last) {
    if (has('email')) add(last.start, 'email', 'Última chamada', 'E-mail: faltam poucos dias, bônus encerra', 'E-mail');
    if (has('meta')) add(last.start, 'meta', 'Última chamada', 'Remarketing de urgência para quem visitou e não comprou', 'Stories');
    if (has('influencer')) add(addDays(last.start, Math.max(0, last.days - 2)), 'influencer', 'Última chamada', 'Repost dos influenciadores: última chance do cupom', 'Stories');
    if (has('google')) add(last.start, 'google', 'Última chamada', 'Aumentar lance nos termos de marca para capturar a demanda final', 'Search');
    if (has('email')) add(last.end, 'email', 'Última chamada', 'E-mail: encerra hoje à meia-noite', 'E-mail');
  }

  add(addDays(c.end, 3), 'geral', 'Análise', 'Relatório final: previsto × realizado, CAC por canal e aprendizados', 'Relatório');

  return items.sort((a, b) => a.date.localeCompare(b.date));
}
