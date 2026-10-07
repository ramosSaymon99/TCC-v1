import type { Database, OrigemLead, PilarConteudo, Post, RedeSocial } from '../types';
import { addDays, diffDays, money, pct, today } from './format';

export const REDES: RedeSocial[] = ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp', 'TikTok'];
export const ORIGENS: OrigemLead[] = ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp', 'TikTok', 'Google', 'Site', 'Indicação', 'Cliente da base', 'Outros'];
export const COR_REDE: Record<RedeSocial, string> = {
  Instagram: '#d6287a', Facebook: '#1e6fe8', LinkedIn: '#0a66c2', WhatsApp: '#16a34a', TikTok: '#0f1e36',
};
export const isRede = (o?: string): o is RedeSocial => !!o && (REDES as string[]).includes(o);

/** Interações = curtidas + comentários + compartilhamentos + salvamentos. */
export const interacoes = (p: Post) => p.curtidas + p.comentarios + p.compartilhamentos + p.salvamentos;
/** Taxa de engajamento sobre alcance (padrão de mercado para contas pequenas). */
export const engajamento = (p: Post) => (p.alcance ? interacoes(p) / p.alcance : 0);

export function resumoPosts(posts: Post[]) {
  const pub = posts.filter((p) => p.status === 'Publicado');
  const alcance = pub.reduce((a, p) => a + p.alcance, 0);
  const inter = pub.reduce((a, p) => a + interacoes(p), 0);
  return {
    posts: pub.length,
    alcance,
    impressoes: pub.reduce((a, p) => a + p.impressoes, 0),
    interacoes: inter,
    engajamento: alcance ? inter / alcance : 0,
    cliques: pub.reduce((a, p) => a + p.cliques, 0),
    mensagens: pub.reduce((a, p) => a + p.mensagens, 0),
    salvamentos: pub.reduce((a, p) => a + p.salvamentos, 0),
    investimento: pub.reduce((a, p) => a + p.investimento, 0),
    alcanceMedio: pub.length ? alcance / pub.length : 0,
  };
}

/** Agrupa posts publicados por uma chave (formato, pilar, rede) com médias comparáveis. */
export function agrupar<K extends keyof Post>(posts: Post[], chave: K) {
  const grupos = new Map<string, Post[]>();
  posts.filter((p) => p.status === 'Publicado').forEach((p) => {
    const k = String(p[chave]);
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  });
  return [...grupos.entries()].map(([k, ps]) => ({ chave: k, ...resumoPosts(ps) })).sort((a, b) => b.engajamento - a.engajamento);
}

/** Atribuição: oportunidades do funil por canal de origem, com conversão, receita, CPL e ROI. */
export function atribuicao(db: Database, de: string, ate: string) {
  const ops = db.oportunidades.filter((o) => o.criadoEm >= de && o.criadoEm <= ate);
  // investimento considerado: posts do período + posts (de antes) que geraram leads do período
  const idsGeradores = new Set(ops.map((o) => o.postId).filter(Boolean));
  const posts = db.posts.filter((p) => p.status === 'Publicado' && ((p.data >= de && p.data <= ate) || idsGeradores.has(p.id)));
  const canais = new Set<string>([...ops.map((o) => o.origem ?? 'Não informado')]);
  return [...canais].map((canal) => {
    const xs = ops.filter((o) => (o.origem ?? 'Não informado') === canal);
    const fechados = xs.filter((o) => o.etapa === 'Fechados');
    const receita = fechados.reduce((a, o) => a + o.valor, 0);
    const pipeline = xs.filter((o) => o.etapa !== 'Fechados').reduce((a, o) => a + o.valor, 0);
    const investimento = isRede(canal) ? posts.filter((p) => p.rede === canal).reduce((a, p) => a + p.investimento, 0) : 0;
    return {
      canal, social: isRede(canal), leads: xs.length, fechados: fechados.length,
      conversao: xs.length ? fechados.length / xs.length : 0,
      receita, pipeline, investimento,
      cpl: investimento && xs.length ? investimento / xs.length : null,
      roi: investimento ? (receita - investimento) / investimento : null,
    };
  }).sort((a, b) => b.leads - a.leads);
}

/** Semanas (segunda a domingo) dos últimos n períodos, com o resumo de cada uma. */
export function porSemana(posts: Post[], semanas: number, hoje = today()) {
  const d = new Date(`${hoje}T12:00:00`);
  const segunda = addDays(hoje, -((d.getDay() + 6) % 7));
  return Array.from({ length: semanas }, (_, i) => {
    const ini = addDays(segunda, -(semanas - 1 - i) * 7);
    const fim = addDays(ini, 6);
    const r = resumoPosts(posts.filter((p) => p.data >= ini && p.data <= fim));
    return { ini, fim, label: `${ini.slice(8, 10)}/${ini.slice(5, 7)}`, ...r, engPct: +(r.engajamento * 100).toFixed(2) };
  });
}

export interface Pauta { titulo: string; motivo: string; pilar: PilarConteudo; categoria?: Post['categoria']; rede: RedeSocial; formato: Post['formato'] }

/** Sugestões de pauta geradas a partir dos dados do negócio (não de achismo). */
export function sugerirPautas(db: Database, hoje = today()): Pauta[] {
  const out: Pauta[] = [];
  const recentes = db.posts.filter((p) => p.data >= addDays(hoje, -30));
  const temConteudo = (cat?: string) => recentes.some((p) => p.categoria === cat);

  // Turmas com vagas abertas começando em até 21 dias
  db.turmas.filter((t) => t.status === 'Inscrições abertas' && diffDays(t.inicio, hoje) <= 21 && t.alunos.length < t.vagas).forEach((t) => {
    const promo = db.posts.some((p) => p.titulo.includes(t.curso) && p.data >= addDays(hoje, -7));
    if (!promo) out.push({
      titulo: `${t.curso}: ${t.vagas - t.alunos.length} vagas, começa ${t.inicio.slice(8, 10)}/${t.inicio.slice(5, 7)}`,
      motivo: `Turma com ${pct(t.alunos.length / t.vagas)} de ocupação e sem divulgação nos últimos 7 dias.`,
      pilar: 'Promocional', categoria: 'Treinamento', rede: 'Instagram', formato: 'Reels',
    });
  });

  // Serviços com boa margem e poucas vendas: conteúdo educativo para gerar demanda
  const ini90 = addDays(hoje, -90);
  db.servicos.filter((s) => s.ativo).forEach((s) => {
    const vendas = db.lancamentos.filter((l) => l.tipo === 'Receita' && l.descricao === s.nome && l.data >= ini90).length;
    const margem = s.preco ? (s.preco - s.custo) / s.preco : 0;
    if (vendas <= 1 && margem >= 0.85 && !temConteudo(s.categoria) && out.length < 6) out.push({
      titulo: `Quando contratar ${s.nome.toLowerCase()}?`,
      motivo: `Margem de ${pct(margem)} e só ${vendas} venda(s) em 90 dias: falta demanda, não rentabilidade.`,
      pilar: 'Educativo', categoria: s.categoria, rede: 'Instagram', formato: 'Carrossel',
    });
  });

  // OS finalizadas com nota alta: prova social
  const promotores = db.ordens.filter((o) => (o.avaliacao ?? 0) >= 9 && (o.conclusao ?? '') >= addDays(hoje, -45));
  if (promotores.length && !recentes.some((p) => p.pilar === 'Prova social')) {
    const nomes = promotores.map((o) => db.clientes.find((c) => c.id === o.clienteId)?.nome).filter(Boolean).slice(0, 2);
    out.push({
      titulo: `Depoimento de cliente: ${nomes.join(' e ')}`,
      motivo: `${promotores.length} cliente(s) deram nota 9–10 recentemente. Prova social é o 2º pilar que mais gera contatos.`,
      pilar: 'Prova social', rede: 'Instagram', formato: 'Carrossel',
    });
  }

  // Contratos: conteúdo para vender recorrência
  if (!recentes.some((p) => p.titulo.toLowerCase().includes('suporte'))) out.push({
    titulo: 'Suporte mensal: quanto custa ficar sem TI por um dia?',
    motivo: 'Contratos recorrentes dão previsibilidade; não houve conteúdo sobre suporte mensal nos últimos 30 dias.',
    pilar: 'Educativo', categoria: 'Consultoria', rede: 'LinkedIn', formato: 'Artigo',
  });
  return out.slice(0, 6);
}

/** Alertas e oportunidades da área de social media para o painel. */
export function insightsSocial(db: Database, hoje = today()) {
  const out: { kind: 'risk' | 'warn' | 'good' | 'opp'; title: string; detail: string }[] = [];
  const meta = db.empresa.metaPostsSemana ?? 3;
  const ult30 = db.posts.filter((p) => p.data >= addDays(hoje, -29) && p.data <= hoje);
  const freq = ult30.filter((p) => p.status === 'Publicado').length / (30 / 7);
  if (freq < meta * 0.8) out.push({ kind: 'warn', title: `Frequência de ${freq.toFixed(1).replace('.', ',')} posts/semana (meta ${meta})`, detail: 'Constância é o principal fator de alcance orgânico. Planeje conteúdos em lote para semanas de muita demanda operacional.' });

  const prox7 = db.posts.filter((p) => p.data > hoje && p.data <= addDays(hoje, 7) && (p.status === 'Agendado' || p.status === 'Produzindo'));
  if (prox7.length < meta) out.push({ kind: 'risk', title: `Só ${prox7.length} post(s) prontos para os próximos 7 dias`, detail: `Faltam ${meta - prox7.length} para a meta semanal. Use as sugestões de pauta abaixo.` });

  // compara formatos dentro do Instagram (principal rede) para não misturar redes de alcance diferente
  const formatos = agrupar(db.posts.filter((p) => p.rede === 'Instagram' && p.data >= addDays(hoje, -90)), 'formato').filter((f) => f.posts >= 2);
  if (formatos.length >= 2) {
    const porAlcance = [...formatos].sort((a, b) => b.alcanceMedio - a.alcanceMedio);
    const melhor = porAlcance[0], pior = porAlcance[porAlcance.length - 1];
    if (pior.alcanceMedio > 0 && melhor.alcanceMedio / pior.alcanceMedio > 1.5) out.push({ kind: 'opp', title: `No Instagram, ${melhor.chave} alcança ${(melhor.alcanceMedio / pior.alcanceMedio).toFixed(1).replace('.', ',')}× mais que ${pior.chave}`, detail: `Média de ${Math.round(melhor.alcanceMedio)} contas por post contra ${Math.round(pior.alcanceMedio)}. Priorize ${melhor.chave} no Instagram para conteúdos de topo de funil.` });
  }

  const pilares = agrupar(db.posts.filter((p) => p.data >= addDays(hoje, -90)), 'pilar');
  const maisEng = pilares[0];
  const maisMsg = [...pilares].sort((a, b) => b.mensagens / Math.max(1, b.alcance) - a.mensagens / Math.max(1, a.alcance))[0];
  if (maisEng && maisMsg && maisEng.chave !== maisMsg.chave) out.push({ kind: 'opp', title: `${maisEng.chave} engaja mais; ${maisMsg.chave} gera mais contatos`, detail: `Engajamento de ${pct(maisEng.engajamento, 1)} em ${maisEng.chave} vs ${maisMsg.mensagens} mensagens em ${maisMsg.chave}. Mix sugerido: ~60% educativo/prova social para crescer e ~25% promocional para converter.` });

  const atr = atribuicao(db, addDays(hoje, -89), hoje).filter((a) => a.social);
  const leads = atr.reduce((a, x) => a + x.leads, 0);
  const inv = atr.reduce((a, x) => a + x.investimento, 0);
  const rec = atr.reduce((a, x) => a + x.receita, 0);
  if (inv > 0) out.push({ kind: rec > inv ? 'good' : 'warn', title: `Impulsionamento: ${money(inv)} investidos em 90 dias`, detail: `${leads} leads vindos das redes (CPL ${money(leads ? inv / leads : 0)}) e ${money(rec)} em negócios fechados. ${rec > inv ? `Retorno de ${(rec / inv).toFixed(1).replace('.', ',')}× o investido.` : 'Ainda sem retorno: revise segmentação e oferta.'}` });
  return out;
}
