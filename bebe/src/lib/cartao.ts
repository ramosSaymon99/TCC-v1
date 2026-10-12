/** Cartão de mêsversário (imagem 1080×1350 para compartilhar no WhatsApp/Instagram), gerado no próprio aparelho. */
import type { BabyData } from '../types';
import { MARCOS } from './conteudo';
import { mediaDiaria, serieDiaria } from './metrics';
import { addDays, duracao, idade, parseYmd, startOfDay } from './time';

const carregar = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => ok(null);
  i.src = src;
});

function texto(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, tam: number, peso = 700, cor = '#2b2a33', alinhar: CanvasTextAlign = 'center') {
  ctx.font = `${peso} ${tam}px Nunito, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = cor;
  ctx.textAlign = alinhar;
  ctx.fillText(t, x, y);
}
function caixa(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, cor: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = cor;
  ctx.fill();
}

export async function gerarCartao(d: BabyData, agora = Date.now()): Promise<Blob> {
  const { baby } = d;
  const id = idade(baby.birth_date, agora);
  const cor = baby.color || '#e0708a';
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff7f2'; // fundo opaco: transparência viraria preto no JPEG
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#fff7f200');
  g.addColorStop(1, `${cor}40`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Foto: a mais recente do Dia a dia ou a do perfil
  const fotoUrl = d.posts[0]?.photo || baby.photo;
  const foto = fotoUrl ? await carregar(fotoUrl) : null;
  const fx = 240;
  const fy = 90;
  const fl = 600;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(fx, fy, fl, fl, 60);
  ctx.clip();
  if (foto) {
    const m = Math.min(foto.naturalWidth, foto.naturalHeight);
    ctx.drawImage(foto, (foto.naturalWidth - m) / 2, (foto.naturalHeight - m) / 2, m, m, fx, fy, fl, fl);
  } else {
    ctx.fillStyle = `${cor}33`;
    ctx.fillRect(fx, fy, fl, fl);
    texto(ctx, baby.sex === 'M' ? '👦' : baby.sex === 'F' ? '👧' : '👶', W / 2, fy + fl / 2 + 90, 260, 400);
  }
  ctx.restore();

  const meses = id.meses;
  texto(ctx, baby.name.split(' ')[0], W / 2, 800, 92, 900, '#2b2a33');
  texto(ctx, meses >= 1 ? `${meses} ${meses === 1 ? 'mês' : 'meses'} de muito amor` : `${id.dias} dias de muito amor`, W / 2, 870, 50, 800, cor);

  // Números do mês
  const pesos = d.growth.filter((x) => x.weight_g).sort((a, b) => a.date.localeCompare(b.date));
  const alturas = d.growth.filter((x) => x.height_cm).sort((a, b) => a.date.localeCompare(b.date));
  const m7 = mediaDiaria(serieDiaria(d.events, addDays(startOfDay(agora), -1), 7, baby.routine, agora));
  const dados = [
    ['Peso', pesos.length ? `${(pesos[pesos.length - 1].weight_g! / 1000).toFixed(2).replace('.', ',')} kg` : '—'],
    ['Altura', alturas.length ? `${String(alturas[alturas.length - 1].height_cm).replace('.', ',')} cm` : '—'],
    ['Sono por dia', m7.sleepMin ? duracao(m7.sleepMin) : '—'],
    ['Mamadas/dia', m7.feeds ? m7.feeds.toFixed(1).replace('.', ',') : '—'],
  ];
  const bw = 225;
  const gap = 20;
  const x0 = (W - (bw * 4 + gap * 3)) / 2;
  dados.forEach(([rot, val], i) => {
    const x = x0 + i * (bw + gap);
    caixa(ctx, x, 920, bw, 150, 28, '#ffffffcc');
    texto(ctx, val, x + bw / 2, 1000, 42, 900);
    texto(ctx, rot, x + bw / 2, 1045, 26, 700, '#6d6a78');
  });

  // Conquistas do último mês (marcos)
  const ini = addDays(parseYmd(baby.birth_date), 0);
  const recentes = d.checks.filter((x) => x.kind === 'marco' && x.date && parseYmd(x.date) >= Math.max(ini, agora - 35 * 86400_000))
    .map((x) => MARCOS.find((m) => m.code === x.code)?.nome.split(' (')[0]).filter(Boolean).slice(0, 2);
  if (recentes.length) texto(ctx, `🎉 ${recentes.join(' · ')}`, W / 2, 1140, 34, 800, '#2b2a33');

  texto(ctx, '🪺 Ninho · a rotina do bebê compartilhada pela família', W / 2, H - 70, 30, 700, '#6d6a78');
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível gerar a imagem.'))), 'image/jpeg', 0.9));
}

/** Compartilha (celular) ou baixa (computador) o cartão. */
export async function compartilharCartao(blob: Blob, nome: string) {
  const file = new File([blob], `${nome.toLowerCase().replace(/\s+/g, '-')}-mesversario.jpg`, { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: `${nome} · mêsversário` }); return 'compartilhado'; } catch { /* cancelado */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return 'baixado';
}
