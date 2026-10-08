import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Lightbulb, Sparkles, XCircle } from 'lucide-react';
import {
  CHANNELS,
  Campaign,
  ChannelId,
  Insight,
  brl,
  channelById,
  daysBetween,
  fmtX,
  insights,
  num,
  optimize,
  pct,
  setShare,
  simulate,
} from '../model';
import { Card, Dot, Kpi, NumberField } from '../ui';

interface Props {
  campaign: Campaign;
  setCampaign: (patch: Partial<Campaign>) => void;
}

const ICON = { good: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Lightbulb } as const;

export default function Simulador({ campaign: c, setCampaign }: Props) {
  const [showBench, setShowBench] = useState(false);
  const enabled = CHANNELS.map((ch) => ch.id);
  const sim = useMemo(() => simulate(c), [c]);
  const optimalAlloc = useMemo(() => optimize(c, enabled), [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const optimal = useMemo(() => simulate(c, optimalAlloc), [c, optimalAlloc]);
  const tips = useMemo(() => insights(c, sim, optimal), [c, sim, optimal]);
  const { totals } = sim;

  const gain = c.goal === 'leads' ? optimal.totals.leads - totals.leads : optimal.totals.profit - totals.profit;
  const gainLabel = c.goal === 'leads' ? `+${num(gain)} leads` : `+${brl(gain)}`;
  const days = daysBetween(c.start, c.end);

  return (
    <div className="sim">
      <div className="sim-side">
        <Card title="Briefing">
          <div className="seg" role="radiogroup" aria-label="Objetivo">
            {(['lucro', 'leads'] as const).map((g) => (
              <button key={g} role="radio" aria-checked={c.goal === g} className={c.goal === g ? 'on' : ''} onClick={() => setCampaign({ goal: g })}>
                {g === 'lucro' ? 'Maximizar resultado' : 'Maximizar leads'}
              </button>
            ))}
          </div>
          <div className="grid2">
            <NumberField label="Orçamento de mídia" prefix="R$" value={c.budget} step={1000} onChange={(v) => setCampaign({ budget: v })} />
            <NumberField label="Ticket médio" prefix="R$" value={c.ticket} step={10} onChange={(v) => setCampaign({ ticket: v })} />
            <NumberField
              label="Margem de contribuição"
              suffix="%"
              value={c.margin}
              scale={100}
              max={1}
              onChange={(v) => setCampaign({ margin: v })}
              hint="Preço − custos variáveis"
            />
            <label className="field">
              <span className="field-label">Duração</span>
              <span className="static">{days > 0 ? `${days} dias` : 'Datas inválidas'}</span>
            </label>
            <label className="field">
              <span className="field-label">Início</span>
              <input type="date" value={c.start} onChange={(e) => e.target.value && setCampaign({ start: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Fim</span>
              <input type="date" value={c.end} min={c.start} onChange={(e) => e.target.value && setCampaign({ end: e.target.value })} />
            </label>
          </div>
        </Card>

        <Card
          title="Distribuição da verba"
          action={
            <button className="btn btn-primary sm" onClick={() => setCampaign({ alloc: optimalAlloc })} disabled={gain <= 0.5}>
              <Sparkles size={15} /> Otimizar{gain > 0.5 && <span className="gain">{gainLabel}</span>}
            </button>
          }
        >
          <p className="muted small">
            Arraste para redistribuir. O traço cinza mostra a sugestão do otimizador para{' '}
            {c.goal === 'leads' ? 'gerar mais leads' : 'maximizar o resultado'}.
          </p>
          <ul className="alloc">
            {CHANNELS.map((ch) => {
              const share = c.alloc[ch.id];
              return (
                <li key={ch.id}>
                  <div className="alloc-head">
                    <span className="alloc-name">
                      <Dot color={ch.color} /> {ch.short}
                    </span>
                    <span className="alloc-val">
                      <strong>{pct(share)}</strong> <span className="muted">{brl(c.budget * share)}</span>
                    </span>
                  </div>
                  <div className="range-wrap">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(share * 100)}
                      aria-label={`Fatia de ${ch.name}`}
                      style={{ ['--fill' as string]: `${share * 100}%`, ['--c' as string]: ch.color }}
                      onChange={(e) => setCampaign({ alloc: setShare(c.alloc, ch.id, Number(e.target.value) / 100) })}
                    />
                    <span className="opt-mark" style={{ left: `calc(8px + (100% - 16px) * ${optimalAlloc[ch.id]})` }} title={`Sugerido: ${pct(optimalAlloc[ch.id])}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="sim-main">
        <div className="kpis">
          <Kpi label="Leads" value={num(totals.leads)} sub={`CPL ${brl(totals.cpl, 2)}`} />
          <Kpi label="Vendas" value={num(totals.sales, totals.sales < 10 ? 1 : 0)} sub={`${brl(totals.revenue)} em receita`} />
          <Kpi
            label="CAC"
            value={brl(totals.cac)}
            sub={`máximo ${brl(totals.maxCac)}`}
            tone={totals.cac <= totals.maxCac ? 'good' : 'bad'}
          />
          <Kpi
            label="ROAS"
            value={fmtX(totals.roas)}
            sub={`equilíbrio ${fmtX(totals.breakEvenRoas)}`}
            tone={totals.roas >= totals.breakEvenRoas ? 'good' : 'bad'}
          />
          <Kpi
            label="Resultado"
            value={brl(totals.profit)}
            sub="margem − mídia"
            tone={totals.profit >= 0 ? 'good' : 'bad'}
          />
        </div>

        <Card title="O que os números dizem" className="insights-card">
          <ul className="insights">
            {tips.map((t, i) => (
              <InsightRow key={i} insight={t} />
            ))}
          </ul>
        </Card>

        <Card title="Funil previsto">
          <div className="funnel">
            <FunnelStep label="Cliques" value={totals.clicks} />
            <FunnelArrow rate={totals.clicks ? totals.leads / totals.clicks : 0} />
            <FunnelStep label="Leads" value={totals.leads} />
            <FunnelArrow rate={totals.leads ? totals.sales / totals.leads : 0} />
            <FunnelStep label="Vendas" value={totals.sales} digits={totals.sales < 10 ? 1 : 0} />
          </div>
        </Card>

        <Card title="Custo por venda (CAC) por canal">
          <CacChart rows={sim.rows} maxCac={totals.maxCac} />
        </Card>

        <Card title="Detalhe por canal" className="table-card">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Verba</th>
                  <th>Leads</th>
                  <th>CPL</th>
                  <th>Vendas</th>
                  <th>CAC</th>
                  <th>ROAS</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {sim.rows.map((r) => (
                  <tr key={r.id} className={r.spend === 0 ? 'off' : ''}>
                    <td>
                      <Dot color={channelById(r.id).color} /> {channelById(r.id).short}
                    </td>
                    <td>{brl(r.spend)}</td>
                    <td>{num(r.leads)}</td>
                    <td>{r.leads ? brl(r.cpl, 2) : '–'}</td>
                    <td>{num(r.sales, 1)}</td>
                    <td className={r.sales && r.cac > totals.maxCac ? 'neg' : ''}>{r.sales ? brl(r.cac) : '–'}</td>
                    <td>{r.spend ? fmtX(r.roas) : '–'}</td>
                    <td className={r.profit < 0 ? 'neg' : 'pos'}>{r.spend ? brl(r.profit) : '–'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{brl(totals.spend)}</td>
                  <td>{num(totals.leads)}</td>
                  <td>{brl(totals.cpl, 2)}</td>
                  <td>{num(totals.sales, 1)}</td>
                  <td>{brl(totals.cac)}</td>
                  <td>{fmtX(totals.roas)}</td>
                  <td className={totals.profit < 0 ? 'neg' : 'pos'}>{brl(totals.profit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card
          title="Premissas por canal"
          action={
            <button className="btn btn-ghost sm" onClick={() => setShowBench(!showBench)} aria-expanded={showBench}>
              {showBench ? 'Ocultar' : 'Editar'} <ChevronDown size={15} className={showBench ? 'rot' : ''} />
            </button>
          }
        >
          <p className="muted small">
            <Info size={14} className="inline-icon" /> Valores de referência para o modelo escolhido. Troque pelos números reais das suas
            campanhas anteriores: a simulação fica tão boa quanto as premissas.
          </p>
          {showBench && (
            <div className="bench">
              {CHANNELS.map((ch) => (
                <BenchRow key={ch.id} id={ch.id} c={c} setCampaign={setCampaign} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const Icon = ICON[insight.tone];
  return (
    <li className={`insight ${insight.tone}`}>
      <Icon size={18} />
      <div>
        <strong>{insight.title}</strong>
        <p>{insight.text}</p>
      </div>
    </li>
  );
}

function FunnelStep({ label, value, digits = 0 }: { label: string; value: number; digits?: number }) {
  return (
    <div className="funnel-step">
      <span className="muted small">{label}</span>
      <strong>{num(value, digits)}</strong>
    </div>
  );
}

function FunnelArrow({ rate }: { rate: number }) {
  return (
    <div className="funnel-arrow" aria-label={`taxa de ${pct(rate, 1)}`}>
      <span>{pct(rate, rate < 0.1 ? 1 : 0)}</span>
      <svg viewBox="0 0 40 10" width="40" height="10" aria-hidden>
        <path d="M0 5h36M32 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function CacChart({ rows, maxCac }: { rows: ReturnType<typeof simulate>['rows']; maxCac: number }) {
  const [hover, setHover] = useState<ChannelId | null>(null);
  const data = rows.filter((r) => r.sales > 0);
  if (data.length === 0) return <p className="muted">Distribua verba em algum canal para ver a comparação.</p>;
  // a escala para em 3× o CAC máximo para um canal muito caro não esmagar os demais
  const top = Math.min(Math.max(maxCac, ...data.map((r) => r.cac)), maxCac * 3) * 1.08;
  return (
    <div className="cac-chart">
      <div className="cac-rows">
        {data.map((r) => {
          const ch = channelById(r.id);
          const over = r.cac > maxCac;
          return (
            <div
              key={r.id}
              className={`cac-row ${hover && hover !== r.id ? 'dim' : ''}`}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="cac-label">{ch.short}</span>
              <div className="cac-track">
                <div
                  className={`cac-bar ${r.cac > top ? 'clipped' : ''}`}
                  style={{ width: `${Math.min(r.cac / top, 1) * 100}%`, background: ch.color }}
                  title={r.cac > top ? 'Barra cortada: valor fora da escala' : undefined}
                />
                {hover === r.id && (
                  <div className="tip" style={{ left: `${Math.min((r.cac / top) * 100, 70)}%` }}>
                    <strong>{ch.name}</strong>
                    <span>
                      CAC {brl(r.cac)} · CPL {brl(r.cpl, 2)}
                    </span>
                    <span>
                      {num(r.sales, 1)} vendas com {brl(r.spend)}
                    </span>
                  </div>
                )}
              </div>
              <span className={`cac-value ${over ? 'neg' : ''}`}>
                {brl(r.cac)}
                {over && <AlertTriangle size={13} aria-label="acima do CAC máximo" />}
              </span>
            </div>
          );
        })}
        <div className="cac-limit" style={{ left: `calc(var(--label-w) + (100% - var(--label-w) - var(--value-w)) * ${maxCac / top})` }}>
          <span>CAC máximo {brl(maxCac)}</span>
        </div>
      </div>
      <p className="muted small">Barras que passam da linha tracejada custam mais por venda do que a venda deixa de margem.</p>
    </div>
  );
}

function BenchRow({ id, c, setCampaign }: { id: ChannelId; c: Campaign; setCampaign: (p: Partial<Campaign>) => void }) {
  const ch = channelById(id);
  const b = c.bench[id];
  const set = (patch: Partial<typeof b>) => setCampaign({ bench: { ...c.bench, [id]: { ...b, ...patch } } });
  return (
    <div className="bench-row">
      <span className="bench-name">
        <Dot color={ch.color} /> {ch.short}
      </span>
      <NumberField label="Custo por clique" prefix="R$" digits={2} step={0.1} value={b.cpc} min={0.01} onChange={(v) => set({ cpc: v })} />
      <NumberField label="Clique → lead" suffix="%" digits={1} scale={100} max={1} value={b.convLead} onChange={(v) => set({ convLead: v })} />
      <NumberField label="Lead → venda" suffix="%" digits={1} scale={100} max={1} value={b.leadSale} onChange={(v) => set({ leadSale: v })} />
      <NumberField
        label="Saturação"
        prefix="R$"
        step={500}
        min={100}
        value={b.scale}
        onChange={(v) => set({ scale: v })}
        hint="Verba em que o clique dobra de preço"
      />
      <NumberField
        label="Teto de verba"
        prefix="R$"
        step={500}
        value={b.cap}
        onChange={(v) => set({ cap: v })}
        hint="0 = sem limite (ex.: tamanho da base)"
      />
    </div>
  );
}
