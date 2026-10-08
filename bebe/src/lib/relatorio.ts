/**
 * Relatório em PDF para levar ao pediatra. Gerado no próprio aparelho (nenhum dado sai para terceiros).
 * Foco no que o pediatra usa: crescimento, sono, alimentação, eliminações, remédios, vacinas e dúvidas da família.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import type { BabyData, BabyEvent } from '../types';
import { ACESSOS, VACINAS, papel } from './constants';
import { ehNoturno, fimEvento, insights, mediaDiaria, referencias, serieDiaria, type Dia } from './metrics';
import { DIA, MIN, addDays, dataBr, duracao, hm, idade, parseYmd, startOfDay, t, ymd } from './time';

const COR = { marca: '#C9566F', marcaClara: '#FBE6EB', tinta: '#2B2A33', tinta2: '#5F5D6B', tinta3: '#8F8C99', linha: '#E6E1DC', fundo: '#FAF8F6', sono: '#6B78D6', sonoDia: '#A7B0EC', mamada: '#E0708A', mamadeira: '#EE9B4A', xixi: '#2FA391', coco: '#A0713F', ok: '#2B9A7F', alerta: '#C98316' };
const W = 210;
const M = 14; // margem
const CW = W - 2 * M;
const FIM_PAGINA = 282;

/** A fonte padrão do PDF usa WinAnsi: troca símbolos fora dela e remove emojis. */
const txt = (s: string) => s
  .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/→/g, '->').replace(/×/g, 'x').replace(/•/g, '·')
  .replace(/[^\u0000-ÿ]/g, '').replace(/\s{2,}/g, ' ').trim();

export interface OpcoesRelatorio { dias: number; duvidas: string; geradoPor: string }

export async function gerarRelatorio(data: BabyData, op: OpcoesRelatorio): Promise<{ blob: Blob; nome: string }> {
  const { jsPDF } = await import('jspdf');
  const doc: JsPDF = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const agora = Date.now();
  const { baby, events } = data;
  const id = idade(baby.birth_date, agora);
  const ref = referencias(id.dias);
  const r = baby.routine;
  const nome = baby.name;

  // Período: N dias completos terminando ontem (o dia de hoje ainda está incompleto)
  const ultimo = addDays(startOfDay(agora), -1);
  const n = op.dias;
  const inicio = addDays(ultimo, -n + 1);
  const dias = serieDiaria(events, ultimo, n, r, agora);
  const anteriores = serieDiaria(events, addDays(ultimo, -n), n, r, agora);
  const comRegistro = dias.filter((d) => d.registros > 0);
  const media = mediaDiaria(comRegistro.length ? comRegistro : dias);
  const mediaAnt = mediaDiaria(anteriores.filter((d) => d.registros > 0));
  const evPeriodo = events.filter((e) => t(e.start_at) >= inicio && t(e.start_at) < addDays(ultimo, 1));

  let y = 0;
  const cor = (c: string) => { doc.setTextColor(c); };
  const fonte = (tam: number, estilo: 'normal' | 'bold' = 'normal', c = COR.tinta) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); cor(c); };
  const novaPagina = () => { doc.addPage(); y = 16; };
  const garantir = (h: number) => { if (y + h > FIM_PAGINA) novaPagina(); };
  const texto = (s: string, x: number, yy: number, o?: { align?: 'left' | 'center' | 'right'; maxWidth?: number }) => doc.text(txt(s), x, yy, o);
  const paragrafo = (s: string, largura = CW, x = M, altLinha = 4.6) => {
    const linhas = doc.splitTextToSize(txt(s), largura) as string[];
    for (const l of linhas) { garantir(altLinha); doc.text(l, x, y); y += altLinha; }
  };
  const secao = (titulo: string, sub?: string) => {
    garantir(16);
    y += 3;
    doc.setFillColor(COR.marca);
    doc.rect(M, y - 4.2, 1.6, 5.6, 'F');
    fonte(12.5, 'bold');
    texto(titulo, M + 4, y);
    if (sub) { fonte(8.5, 'normal', COR.tinta3); texto(sub, W - M, y, { align: 'right' }); }
    y += 6;
  };

  /** Tabela simples com cabeçalho, zebra e quebra de página. */
  const tabela = (cab: string[], linhas: string[][], larguras: number[], o: { alinhar?: ('left' | 'right' | 'center')[]; destaque?: (i: number) => string | null } = {}) => {
    const total = larguras.reduce((a, b) => a + b, 0);
    const ws = larguras.map((l) => (l / total) * CW);
    const xs = ws.map((_, i) => M + ws.slice(0, i).reduce((a, b) => a + b, 0));
    const desenhaCab = () => {
      doc.setFillColor(COR.marcaClara);
      doc.rect(M, y - 4.3, CW, 6.4, 'F');
      fonte(8, 'bold', COR.tinta2);
      cab.forEach((c, i) => { const al = o.alinhar?.[i] ?? 'left'; texto(c, al === 'right' ? xs[i] + ws[i] - 2 : al === 'center' ? xs[i] + ws[i] / 2 : xs[i] + 2, y, { align: al }); });
      y += 6.4;
    };
    garantir(14);
    desenhaCab();
    linhas.forEach((l, li) => {
      fonte(8.8);
      const quebras = l.map((c, i) => doc.splitTextToSize(txt(c), ws[i] - 4) as string[]);
      const h = Math.max(...quebras.map((q) => q.length)) * 4 + 2.2;
      if (y + h > FIM_PAGINA) { novaPagina(); desenhaCab(); fonte(8.8); }
      if (li % 2) { doc.setFillColor(COR.fundo); doc.rect(M, y - 4.1, CW, h, 'F'); }
      const dest = o.destaque?.(li);
      quebras.forEach((q, i) => {
        const al = o.alinhar?.[i] ?? 'left';
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
        cor(dest && i === l.length - 1 ? dest : COR.tinta);
        q.forEach((linha, k) => doc.text(linha, al === 'right' ? xs[i] + ws[i] - 2 : al === 'center' ? xs[i] + ws[i] / 2 : xs[i] + 2, y + k * 4, { align: al }));
      });
      y += h;
    });
    doc.setDrawColor(COR.linha);
    doc.line(M, y - 3.6, M + CW, y - 3.6);
    y += 2;
  };

  /** Gráfico de barras (empilhadas ou lado a lado) com eixo e faixa de referência opcional. */
  const barras = (titulo: string, rotulos: string[], series: { nome: string; valores: number[]; cor: string }[], o: { empilhado?: boolean; faixa?: [number, number]; unidade?: string; altura?: number }) => {
    const h = o.altura ?? 42;
    garantir(h + 16);
    fonte(9.5, 'bold');
    texto(titulo, M, y);
    // legenda
    let lx = W - M;
    fonte(7.5, 'normal', COR.tinta2);
    [...series].reverse().forEach((s) => {
      const w = doc.getTextWidth(txt(s.nome));
      lx -= w;
      texto(s.nome, lx, y);
      lx -= 4;
      doc.setFillColor(s.cor);
      doc.rect(lx, y - 2.4, 2.6, 2.6, 'F');
      lx -= 4;
    });
    y += 3;
    const x0 = M + 9;
    const largura = CW - 9;
    const totais = rotulos.map((_, i) => (o.empilhado ? series.reduce((a, s) => a + s.valores[i], 0) : Math.max(...series.map((s) => s.valores[i]))));
    const maxV = Math.max(1, ...totais, o.faixa?.[1] ?? 0) * 1.12;
    const passo = maxV > 20 ? Math.ceil(maxV / 4 / 5) * 5 : Math.max(1, Math.ceil(maxV / 4));
    const py = (v: number) => y + h - (v / maxV) * h;
    if (o.faixa) {
      doc.setFillColor('#E3F4EE');
      doc.rect(x0, py(o.faixa[1]), largura, py(o.faixa[0]) - py(o.faixa[1]), 'F');
    }
    fonte(7, 'normal', COR.tinta3);
    doc.setDrawColor(COR.linha);
    for (let v = 0; v <= maxV; v += passo) {
      doc.line(x0, py(v), x0 + largura, py(v));
      texto(String(v), x0 - 1.5, py(v) + 1, { align: 'right' });
    }
    const slot = largura / rotulos.length;
    const bw = Math.min(9, slot * (o.empilhado ? 0.62 : 0.8));
    rotulos.forEach((rot, i) => {
      const cx = x0 + slot * i + slot / 2;
      if (o.empilhado) {
        let base = 0;
        for (const s of series) {
          const v = s.valores[i];
          if (v > 0) { doc.setFillColor(s.cor); doc.rect(cx - bw / 2, py(base + v), bw, py(base) - py(base + v), 'F'); }
          base += v;
        }
      } else {
        const sw = bw / series.length;
        series.forEach((s, k) => {
          const v = s.valores[i];
          if (v > 0) { doc.setFillColor(s.cor); doc.rect(cx - bw / 2 + k * sw, py(v), sw - 0.3, py(0) - py(v), 'F'); }
        });
      }
      if (rotulos.length <= 16 || i % 2 === 0) { fonte(6.6, 'normal', COR.tinta3); texto(rot, cx, y + h + 3.6, { align: 'center' }); }
    });
    y += h + 9;
  };

  /* ================= Página 1: cabeçalho ================= */
  doc.setFillColor(COR.marca);
  doc.rect(0, 0, W, 34, 'F');
  fonte(9, 'normal', '#FFFFFF');
  texto('NINHO · RELATÓRIO PARA CONSULTA PEDIÁTRICA', M, 11);
  fonte(22, 'bold', '#FFFFFF');
  texto(nome, M, 22);
  fonte(10, 'normal', '#FFFFFF');
  texto(`${id.texto} · nascimento em ${dataBr(baby.birth_date)}${baby.sex ? ` · ${baby.sex === 'F' ? 'menina' : 'menino'}` : ''}`, M, 29);
  fonte(8.5, 'normal', '#FFFFFF');
  texto(`Período: ${dataBr(ymd(inicio))} a ${dataBr(ymd(ultimo))} (${n} dias)`, W - M, 11, { align: 'right' });
  texto(`Gerado em ${new Date(agora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, W - M, 16, { align: 'right' });
  texto(`por ${op.geradoPor}`, W - M, 21, { align: 'right' });
  y = 44;

  // Cartões-resumo
  const pesos = data.growth.filter((g) => g.weight_g).sort((a, b) => a.date.localeCompare(b.date));
  const ultPeso = pesos[pesos.length - 1];
  const penPeso = ultPeso ? [...pesos].reverse().find((g) => g.date < ultPeso.date && (parseYmd(ultPeso.date) - parseYmd(g.date)) / DIA >= 5) : undefined;
  const ganho = ultPeso && penPeso ? (ultPeso.weight_g! - penPeso.weight_g!) / ((parseYmd(ultPeso.date) - parseYmd(penPeso.date)) / DIA) : null;
  const cartoes: [string, string, string][] = [
    ['Peso atual', ultPeso ? `${(ultPeso.weight_g! / 1000).toFixed(2).replace('.', ',')} kg` : '—', ultPeso ? `em ${dataBr(ultPeso.date)}` : 'sem registro'],
    ['Ganho de peso', ganho != null ? `${Math.round(ganho)} g/dia` : '—', ref.ganhoGDia ? `ref. ${ref.ganhoGDia[0]}–${ref.ganhoGDia[1]} g/dia` : 'entre pesagens'],
    ['Sono / dia', duracao(media.sleepMin), `ref. ${ref.sonoH[0]}–${ref.sonoH[1]} h`],
    ['Mamadas / dia', media.feeds.toFixed(1).replace('.', ','), ref.mamadas ? `ref. ${ref.mamadas[0]}–${ref.mamadas[1]}` : `${media.breastFeeds.toFixed(1).replace('.', ',')} no peito`],
    ['Xixi / cocô', `${media.wet.toFixed(1).replace('.', ',')} / ${media.poop.toFixed(1).replace('.', ',')}`, ref.fraldasMolhadas ? `xixi ref. >= ${ref.fraldasMolhadas}/dia` : 'fraldas por dia'],
  ];
  const cw = (CW - 4 * 3) / 5;
  cartoes.forEach(([l, v, s], i) => {
    const x = M + i * (cw + 3);
    doc.setFillColor(COR.fundo);
    doc.setDrawColor(COR.linha);
    doc.roundedRect(x, y, cw, 21, 2, 2, 'FD');
    fonte(7, 'bold', COR.tinta3);
    texto(l.toUpperCase(), x + 3, y + 5);
    fonte(13, 'bold');
    texto(v, x + 3, y + 12.5);
    fonte(7, 'normal', COR.tinta2);
    texto(s, x + 3, y + 17.5, { maxWidth: cw - 5 });
  });
  y += 29;

  // Dados gerais
  fonte(9);
  const cuidadores = data.members.map((m) => `${m.name} (${papel(m.role).label.toLowerCase()}${m.access === 'admin' ? `, ${ACESSOS.admin.label.toLowerCase()}` : ''})`).join('; ');
  paragrafo(`Cuidadores que registram a rotina: ${cuidadores}.`);
  if (baby.notes) { fonte(9, 'bold'); paragrafo(`Observações da família: ${baby.notes}`); }
  paragrafo(`Dias com registros no período: ${comRegistro.length} de ${n}. Médias calculadas apenas sobre dias com registro.${comRegistro.length < n * 0.7 ? ' Atenção: período com poucos registros; interpretar com cautela.' : ''}`);
  if (r && (r.feeds?.length || r.naps?.length)) paragrafo(`Rotina planejada pela família: acorda ${r.wake ?? '—'}, dorme ${r.bedtime ?? '—'}; mamadas ${r.feeds.join(', ') || '—'}; sonecas ${r.naps.join(', ') || '—'}.`);

  /* ================= Resumo do período ================= */
  secao('Resumo do período', `média por dia · comparação com os ${n} dias anteriores`);
  const minMax = (f: (d: Dia) => number, fmt: (v: number) => string) => {
    const vs = comRegistro.map(f);
    return vs.length ? `${fmt(Math.min(...vs))} – ${fmt(Math.max(...vs))}` : '—';
  };
  const varia = (a: number, b: number) => (b > 0 ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%` : '—');
  const num = (v: number, c = 1) => v.toFixed(c).replace('.', ',');
  const foraFaixa = (v: number, f?: number[] | null) => (f ? (v < f[0] || v > f[1] ? COR.alerta : COR.ok) : null);
  const linhasResumo: [string, string, string, string, string, string | null][] = [
    ['Sono total', duracao(media.sleepMin), minMax((d) => d.sleepMin, duracao), varia(media.sleepMin, mediaAnt.sleepMin), `${ref.sonoH[0]}–${ref.sonoH[1]} h`, foraFaixa(media.sleepMin / 60, ref.sonoH)],
    ['  Sono noturno', duracao(media.nightSleepMin), minMax((d) => d.nightSleepMin, duracao), varia(media.nightSleepMin, mediaAnt.nightSleepMin), `${r?.bedtime ?? '19:00'}–${r?.wake ?? '07:00'}`, null],
    ['  Sono diurno (sonecas)', duracao(media.daySleepMin), minMax((d) => d.daySleepMin, duracao), varia(media.daySleepMin, mediaAnt.daySleepMin), '—', null],
    ['  Número de sonecas', num(media.naps), minMax((d) => d.naps, (v) => String(v)), varia(media.naps, mediaAnt.naps), '—', null],
    ['  Maior período contínuo', duracao(Math.max(0, ...comRegistro.map((d) => d.longestSleepMin))), '—', '—', '—', null],
    ['Mamadas (total)', num(media.feeds), minMax((d) => d.feeds, (v) => String(v)), varia(media.feeds, mediaAnt.feeds), ref.mamadas ? `${ref.mamadas[0]}–${ref.mamadas[1]}` : '—', foraFaixa(media.feeds, ref.mamadas)],
    ['  No peito', `${num(media.breastFeeds)} · ${duracao(media.breastMin)}`, minMax((d) => d.breastFeeds, (v) => String(v)), varia(media.breastFeeds, mediaAnt.breastFeeds), '—', null],
    ['  Mamadeira', `${num(media.bottles)} · ${Math.round(media.bottleMl)} ml`, minMax((d) => d.bottleMl, (v) => `${Math.round(v)} ml`), varia(media.bottleMl, mediaAnt.bottleMl), '—', null],
    ['  Intervalo médio entre mamadas', media.avgFeedIntervalMin ? duracao(media.avgFeedIntervalMin) : '—', '—', mediaAnt.avgFeedIntervalMin && media.avgFeedIntervalMin ? varia(media.avgFeedIntervalMin, mediaAnt.avgFeedIntervalMin) : '—', ref.intervaloMaxH ? `até ${ref.intervaloMaxH} h` : '—', null],
    ['Fraldas com xixi', num(media.wet), minMax((d) => d.wet, (v) => String(v)), varia(media.wet, mediaAnt.wet), ref.fraldasMolhadas ? `>= ${ref.fraldasMolhadas}` : '—', ref.fraldasMolhadas ? (media.wet < ref.fraldasMolhadas ? COR.alerta : COR.ok) : null],
    ['Evacuações (cocô)', num(media.poop), minMax((d) => d.poop, (v) => String(v)), varia(media.poop, mediaAnt.poop), 'variável', null],
  ];
  if (media.solids > 0) linhasResumo.push(['Refeições sólidas', num(media.solids), minMax((d) => d.solids, (v) => String(v)), varia(media.solids, mediaAnt.solids), '—', null]);
  tabela(['Indicador', 'Média/dia', 'Mín – máx', 'Var.', 'Referência'], linhasResumo.map((l) => l.slice(0, 5) as string[]), [52, 30, 30, 15, 26], { alinhar: ['left', 'right', 'right', 'right', 'right'], destaque: (i) => linhasResumo[i][5] });

  /* ================= Gráficos ================= */
  const rot = dias.map((d) => `${new Date(d.dia).getDate()}/${new Date(d.dia).getMonth() + 1}`);
  barras('Sono por dia (horas)', rot, [
    { nome: 'Noturno', valores: dias.map((d) => d.nightSleepMin / 60), cor: COR.sono },
    { nome: 'Sonecas', valores: dias.map((d) => d.daySleepMin / 60), cor: COR.sonoDia },
  ], { empilhado: true, faixa: [ref.sonoH[0], ref.sonoH[1]] });
  barras('Mamadas por dia', rot, [
    { nome: 'Peito', valores: dias.map((d) => d.breastFeeds), cor: COR.mamada },
    { nome: 'Mamadeira', valores: dias.map((d) => d.bottles), cor: COR.mamadeira },
  ], { empilhado: true, faixa: ref.mamadas ? [ref.mamadas[0], ref.mamadas[1]] : undefined, altura: 34 });
  barras('Fraldas por dia', rot, [
    { nome: 'Xixi', valores: dias.map((d) => d.wet), cor: COR.xixi },
    { nome: 'Cocô', valores: dias.map((d) => d.poop), cor: COR.coco },
  ], { altura: 30 });

  /* ================= Padrão de 24 h ================= */
  const linhas24 = dias.slice(-Math.min(n, 14)).reverse();
  const alt = 4.6;
  garantir(linhas24.length * (alt + 1) + 22);
  secao('Padrão de 24 horas', `últimos ${linhas24.length} dias · barras = sono, marcas = mamadas e cocô`);
  const x0 = M + 14;
  const lw = CW - 14;
  fonte(6.8, 'normal', COR.tinta3);
  for (let h = 0; h <= 24; h += 3) texto(`${h}h`, x0 + (h / 24) * lw, y, { align: 'center' });
  y += 2;
  for (const d of linhas24) {
    const fimD = addDays(d.dia, 1);
    fonte(7, 'normal', COR.tinta2);
    texto(`${new Date(d.dia).getDate()}/${new Date(d.dia).getMonth() + 1}`, x0 - 2, y + alt - 1, { align: 'right' });
    doc.setFillColor(COR.fundo);
    doc.rect(x0, y, lw, alt, 'F');
    const evs = events.filter((e) => t(e.start_at) < fimD && fimEvento(e, agora) > d.dia);
    for (const e of evs.filter((x) => x.type === 'sono')) {
      const a = Math.max(t(e.start_at), d.dia);
      const b = Math.min(fimEvento(e, agora), fimD);
      doc.setFillColor(ehNoturno(a, r) ? COR.sono : COR.sonoDia);
      doc.rect(x0 + ((a - d.dia) / DIA) * lw, y + 0.4, Math.max(0.4, ((b - a) / DIA) * lw), alt - 0.8, 'F');
    }
    for (const e of evs.filter((x) => (x.type === 'mamada' || x.type === 'mamadeira') && t(x.start_at) >= d.dia)) {
      doc.setFillColor(e.type === 'mamada' ? COR.mamada : COR.mamadeira);
      doc.circle(x0 + ((t(e.start_at) - d.dia) / DIA) * lw, y + alt / 2, 1.05, 'F');
    }
    for (const e of evs.filter((x) => x.type === 'fralda' && (x.data.diaper === 'coco' || x.data.diaper === 'ambos') && t(x.start_at) >= d.dia)) {
      doc.setFillColor(COR.coco);
      doc.rect(x0 + ((t(e.start_at) - d.dia) / DIA) * lw - 0.5, y + alt - 1.3, 1, 1.3, 'F');
    }
    y += alt + 1;
  }
  y += 3;

  /* ================= Eliminações e alimentação ================= */
  const cocos = evPeriodo.filter((e) => e.type === 'fralda' && (e.data.diaper === 'coco' || e.data.diaper === 'ambos'));
  if (cocos.length) {
    secao('Evacuações', `${cocos.length} no período`);
    const conta = (f: (e: BabyEvent) => string | undefined) => {
      const m = new Map<string, number>();
      for (const e of cocos) { const k = f(e) || 'não informado'; m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / cocos.length) * 100)}%`).join(' · ');
    };
    fonte(9);
    paragrafo(`Consistência: ${conta((e) => e.data.consistency)}.`);
    paragrafo(`Cor: ${conta((e) => e.data.color)}.`);
    const maiorIntervalo = cocos.map((e) => t(e.start_at)).sort((a, b) => a - b).reduce((acc, v, i, arr) => (i ? Math.max(acc, v - arr[i - 1]) : 0), 0);
    if (maiorIntervalo) paragrafo(`Maior intervalo sem evacuar no período: ${duracao(maiorIntervalo / MIN)}.`);
  }
  const solidos = evPeriodo.filter((e) => e.type === 'alimentacao');
  if (solidos.length) {
    secao('Alimentação complementar', `${solidos.length} registros`);
    const porAlimento = new Map<string, { n: number; boa: number; rec: number }>();
    for (const e of solidos) {
      const k = (e.data.food || 'não informado').toLowerCase();
      const c = porAlimento.get(k) ?? { n: 0, boa: 0, rec: 0 };
      c.n++; if (e.data.acceptance === 'boa') c.boa++; if (e.data.acceptance === 'recusou') c.rec++;
      porAlimento.set(k, c);
    }
    tabela(['Alimento', 'Vezes', 'Aceitação boa', 'Recusou'], [...porAlimento.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([k, c]) => [k, String(c.n), String(c.boa), String(c.rec)]), [60, 20, 25, 20], { alinhar: ['left', 'right', 'right', 'right'] });
  }

  /* ================= Crescimento ================= */
  if (data.growth.length) {
    secao('Crescimento', ganho != null ? `ganho entre as duas últimas pesagens: ${Math.round(ganho)} g/dia` : undefined);
    const med = [...data.growth].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    tabela(['Data', 'Idade', 'Peso', 'Comprimento', 'Perím. cefálico', 'Local'], med.map((g) => [
      dataBr(g.date), idade(baby.birth_date, parseYmd(g.date)).texto, g.weight_g ? `${(g.weight_g / 1000).toFixed(3).replace('.', ',')} kg` : '—',
      g.height_cm ? `${String(g.height_cm).replace('.', ',')} cm` : '—', g.head_cm ? `${String(g.head_cm).replace('.', ',')} cm` : '—', g.source === 'consulta' ? 'consulta' : 'casa',
    ]), [22, 32, 22, 24, 24, 18], { alinhar: ['left', 'left', 'right', 'right', 'right', 'left'] });
  }

  /* ================= Remédios ================= */
  const remedios = evPeriodo.filter((e) => e.type === 'remedio');
  if (remedios.length) {
    secao('Remédios e suplementos', 'registrados no período');
    const porMed = new Map<string, BabyEvent[]>();
    for (const e of remedios) { const k = e.data.med || 'não informado'; porMed.set(k, [...(porMed.get(k) ?? []), e]); }
    tabela(['Nome', 'Dose', 'Doses no período', 'Último registro'], [...porMed.entries()].map(([k, es]) => {
      const ult = es.sort((a, b) => t(b.start_at) - t(a.start_at))[0];
      return [k, ult.data.dose || '—', String(es.length), `${new Date(ult.start_at).toLocaleDateString('pt-BR')} ${hm(ult.start_at)}`];
    }), [45, 30, 25, 30], { alinhar: ['left', 'left', 'right', 'left'] });
  }

  /* ================= Vacinas ================= */
  secao('Vacinas', 'conforme registros no app — conferir com a caderneta');
  const aplicadas = new Map(data.vaccines.map((v) => [v.code, v.date]));
  const semRegistro = VACINAS.filter((v) => !aplicadas.has(v.code));
  const atrasadas = semRegistro.filter((v) => id.dias > v.meses * 30.4 + 30);
  const previstas = semRegistro.filter((v) => id.dias >= v.meses * 30.4 - 15 && id.dias <= v.meses * 30.4 + 30);
  const proximas = semRegistro.filter((v) => id.dias < v.meses * 30.4 - 15).slice(0, 4);
  fonte(9);
  paragrafo(`Aplicadas (${aplicadas.size}): ${VACINAS.filter((v) => aplicadas.has(v.code)).map((v) => `${v.nome} (${dataBr(aplicadas.get(v.code)!)})`).join('; ') || 'nenhuma registrada'}.`);
  if (atrasadas.length) { fonte(9, 'bold', COR.alerta); paragrafo(`Atrasadas, sem registro (${atrasadas.length}): ${atrasadas.map((v) => v.nome).join('; ')}.`); }
  if (previstas.length) { fonte(9, 'bold'); paragrafo(`Previstas para a idade atual: ${previstas.map((v) => v.nome).join('; ')}.`); }
  if (!atrasadas.length && !previstas.length) { fonte(9, 'bold', COR.ok); paragrafo('Nenhuma vacina pendente para a idade pelos registros.'); }
  if (proximas.length) { fonte(8.8, 'normal', COR.tinta2); paragrafo(`Próximas: ${proximas.map((v) => `${v.nome} (${v.meses} meses)`).join('; ')}.`); }

  /* ================= Pontos de atenção ================= */
  // Só observações de tendência; avisos do momento (última mamada, ritmo de hoje) e de logística ficam de fora
  const pontos = insights(data, agora).filter((i) => i.nivel !== 'positivo' && !/estoque|acabou|vacina|consulta|última mamada|até agora|hoje|cuidados|registros da semana/i.test(i.titulo));
  if (pontos.length) {
    secao('Observações do app', 'geradas automaticamente a partir dos registros');
    for (const p of pontos.slice(0, 6)) {
      fonte(9, 'bold');
      paragrafo(`· ${p.titulo}`);
      fonte(8.8, 'normal', COR.tinta2);
      paragrafo(p.detalhe, CW - 4, M + 3);
      y += 1;
    }
  }

  /* ================= Dúvidas e anotações ================= */
  const duvidas = op.duvidas.split('\n').map((l) => l.trim()).filter(Boolean);
  secao('Dúvidas da família para a consulta');
  fonte(9.5);
  if (duvidas.length) duvidas.forEach((d, i) => { paragrafo(`${i + 1}. ${d}`); y += 0.8; });
  else { fonte(9, 'normal', COR.tinta3); paragrafo('Nenhuma dúvida anotada.'); }
  garantir(48);
  secao('Anotações do pediatra');
  doc.setDrawColor(COR.linha);
  for (let i = 0; i < 6; i++) { doc.line(M, y + 2, W - M, y + 2); y += 7; }

  /* ================= Rodapé em todas as páginas ================= */
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    fonte(7, 'normal', COR.tinta3);
    doc.setDrawColor(COR.linha);
    doc.line(M, 288, W - M, 288);
    texto(`${nome} · Relatório Ninho · dados registrados pelos cuidadores; referências gerais (AAP, AASM, SBP, PNI) não substituem a avaliação clínica.`, M, 292);
    texto(`Página ${p} de ${total}`, W - M, 292, { align: 'right' });
  }

  const arquivo = `relatorio-${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')}-${ymd(agora)}.pdf`;
  return { blob: doc.output('blob'), nome: arquivo };
}
