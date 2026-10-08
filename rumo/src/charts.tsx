import { useEffect, useMemo, useRef, useState } from 'react';
import { CHANNELS, Campaign, ChannelId, RiskResult, brl, num, pct, responseCurve, simulateChannel } from './model';

/** Largura real do contêiner, para o SVG desenhar em pixels nítidos em vez de esticar. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const kfmt = (v: number) => (v >= 1000 ? `${num(v / 1000, v >= 10000 ? 0 : 1)} mil` : num(v));

function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}

// ---------- curvas de resposta ----------

export function ResponseCurves({ c, optimal }: { c: Campaign; optimal: Record<ChannelId, number> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hidden, setHidden] = useState<Set<ChannelId>>(new Set());
  const [hoverX, setHoverX] = useState<number | null>(null);
  const height = 260;
  const m = { top: 12, right: 16, bottom: 28, left: 46 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const unit = c.goal === 'leads' ? 'leads' : 'vendas';

  const maxX = useMemo(() => {
    const spends = CHANNELS.flatMap((ch) => [c.alloc[ch.id], optimal[ch.id]]).map((s) => s * c.budget);
    return Math.max(c.budget * 0.6, ...spends.map((s) => s * 1.25), 1000);
  }, [c.alloc, c.budget, optimal]);

  const curves = useMemo(() => CHANNELS.map((ch) => ({ ch, pts: responseCurve(ch.id, c, maxX) })), [c, maxX]);
  const visible = curves.filter((x) => !hidden.has(x.ch.id));
  const maxY = Math.max(1, ...visible.flatMap((x) => x.pts.map((p) => p.value))) * 1.08;
  const yTicks = niceTicks(maxY);
  const xTicks = niceTicks(maxX, width < 500 ? 3 : 5);
  const sx = (v: number) => m.left + (v / maxX) * iw;
  const sy = (v: number) => m.top + ih - (v / maxY) * ih;
  const valueAt = (id: ChannelId, spend: number) => {
    const r = simulateChannel(id, spend, c);
    return c.goal === 'leads' ? r.leads : r.sales;
  };

  const toggle = (id: ChannelId) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="viz" ref={ref}>
      <div className="viz-legend" role="group" aria-label="Canais no gráfico">
        {CHANNELS.map((ch) => (
          <button key={ch.id} className={hidden.has(ch.id) ? 'off' : ''} onClick={() => toggle(ch.id)} aria-pressed={!hidden.has(ch.id)}>
            <span className="swatch" style={{ background: ch.color }} />
            {ch.short}
          </button>
        ))}
        <span className="viz-key">
          <span className="key-dot" /> atual <span className="key-ring" /> ótimo
        </span>
      </div>
      <svg
        width={width}
        height={height}
        className="viz-svg"
        role="img"
        aria-label={`Curvas de resposta: ${unit} por investimento em cada canal`}
        onMouseMove={(e) => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          setHoverX(x >= m.left && x <= m.left + iw ? ((x - m.left) / iw) * maxX : null);
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        <defs>
          <pattern id="grid-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" className="grid-dot" />
          </pattern>
        </defs>
        <rect x={m.left} y={m.top} width={iw} height={ih} fill="url(#grid-dots)" />
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + iw} y1={sy(t)} y2={sy(t)} className="grid-line" />
            <text x={m.left - 8} y={sy(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {kfmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={height - 8} className="tick" textAnchor="middle">
            {t === 0 ? 'R$ 0' : `R$ ${kfmt(t)}`}
          </text>
        ))}
        {visible.map(({ ch, pts }) => (
          <polyline
            key={ch.id}
            points={pts.map((p) => `${sx(p.spend)},${sy(p.value)}`).join(' ')}
            fill="none"
            stroke={ch.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}
        {visible.map(({ ch }) => {
          const cur = c.alloc[ch.id] * c.budget;
          const opt = optimal[ch.id] * c.budget;
          return (
            <g key={ch.id}>
              {opt > 0 && <circle cx={sx(opt)} cy={sy(valueAt(ch.id, opt))} r={6} fill="var(--panel)" stroke={ch.color} strokeWidth={2} />}
              {cur > 0 && <circle cx={sx(cur)} cy={sy(valueAt(ch.id, cur))} r={4.5} fill={ch.color} stroke="var(--panel)" strokeWidth={2} />}
            </g>
          );
        })}
        {hoverX !== null && (
          <line x1={sx(hoverX)} x2={sx(hoverX)} y1={m.top} y2={m.top + ih} className="crosshair" />
        )}
      </svg>
      {hoverX !== null && (
        <div className="viz-tip" style={{ left: Math.min(sx(hoverX) + 12, width - 190) }}>
          <strong>Investindo {brl(hoverX)}</strong>
          {visible
            .map(({ ch }) => ({ ch, v: valueAt(ch.id, hoverX) }))
            .sort((a, b) => b.v - a.v)
            .map(({ ch, v }) => (
              <span key={ch.id}>
                <i style={{ background: ch.color }} />
                {ch.short}
                <b>
                  {num(v, v < 10 ? 1 : 0)} {unit}
                </b>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------- risco ----------

export function RiskHistogram({ risk, forecast }: { risk: RiskResult; forecast: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 150;
  const m = { top: 22, right: 8, bottom: 24, left: 8 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const isMoney = risk.metric === 'lucro';
  const fmt = (v: number) => (isMoney ? brl(v) : `${num(v)} leads`);

  const lo = risk.values[Math.floor(risk.values.length * 0.01)];
  const hi = risk.values[Math.floor(risk.values.length * 0.99)];
  const binsN = width < 500 ? 20 : 32;
  const step = (hi - lo) / binsN || 1;
  const bins = Array.from({ length: binsN }, (_, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, n: 0 }));
  // as caudas extremas (1% de cada lado) ficam fora do desenho para não virarem um pico falso nas bordas
  for (const v of risk.values) {
    if (v < lo || v > hi) continue;
    bins[Math.min(binsN - 1, Math.floor((v - lo) / step))].n++;
  }
  const maxN = Math.max(...bins.map((b) => b.n));
  const sx = (v: number) => m.left + ((v - lo) / (hi - lo || 1)) * iw;
  const bw = iw / binsN;
  const markers = [
    { v: risk.p10, label: 'P10' },
    { v: risk.p50, label: 'P50' },
    { v: risk.p90, label: 'P90' },
  ];

  return (
    <div className="viz" ref={ref}>
      <svg width={width} height={height} className="viz-svg" role="img" aria-label="Distribuição dos resultados simulados">
        {bins.map((b, i) => {
          const h = (b.n / maxN) * ih;
          const bad = isMoney ? b.to <= 0 : b.to <= forecast * 0.8;
          return (
            <rect
              key={i}
              x={m.left + i * bw + 1}
              y={m.top + ih - h}
              width={Math.max(1, bw - 2)}
              height={h}
              rx={2}
              className={`bin ${bad ? 'bad' : ''} ${hover === i ? 'hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {isMoney && lo < 0 && hi > 0 && <line x1={sx(0)} x2={sx(0)} y1={m.top - 6} y2={m.top + ih} className="zero-line" />}
        {markers.map((mk) => (
          <g key={mk.label}>
            <line x1={sx(mk.v)} x2={sx(mk.v)} y1={m.top - 4} y2={m.top + ih} className={`pmark ${mk.label === 'P50' ? 'mid' : ''}`} />
            <text x={sx(mk.v)} y={m.top - 9} textAnchor="middle" className="tick strong">
              {mk.label}
            </text>
          </g>
        ))}
        <line x1={m.left} x2={m.left + iw} y1={m.top + ih} y2={m.top + ih} className="axis" />
        <text x={m.left} y={height - 6} className="tick">
          {fmt(lo)}
        </text>
        <text x={m.left + iw} y={height - 6} className="tick" textAnchor="end">
          {fmt(hi)}
        </text>
      </svg>
      {hover !== null && (
        <div className="viz-tip" style={{ left: Math.min(m.left + hover * bw, width - 200), top: 0 }}>
          <strong>
            {fmt(bins[hover].from)} a {fmt(bins[hover].to)}
          </strong>
          <span>{pct(bins[hover].n / risk.runs, 1)} das simulações</span>
        </div>
      )}
    </div>
  );
}
