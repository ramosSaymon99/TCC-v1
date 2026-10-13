import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowRight, BadgeDollarSign, CheckCircle2, Clock, Hourglass, Lightbulb, Megaphone, Repeat, TrendingDown, Users, Wallet,
} from 'lucide-react';
import { usePlataforma } from '../../store/PlataformaStore';
import { Kpi, PageHeader, Trend } from '../../components/ui';
import { MESES_LONGOS, money, moneyShort, pct, today, variation } from '../../utils/format';
import { insightsSaas, kpis, linhas, serieMrr } from '../../utils/saas';
import { cfgDe, PAGANTE } from '../../store/plataforma';

const ICON = { risk: AlertTriangle, warn: AlertTriangle, good: CheckCircle2, opp: Lightbulb };
const TONE = { risk: 'red', warn: 'orange', good: 'green', opp: 'blue' };

export default function ConsoleVisao() {
  const { dados, uso, carregando } = usePlataforma();
  const ls = useMemo(() => linhas(dados, uso), [dados, uso]);
  const serie = useMemo(() => (dados.planos.length ? serieMrr(dados, 12) : []), [dados]);
  const k = useMemo(() => (serie.length ? kpis(dados, serie, ls) : null), [dados, serie, ls]);
  const ins = useMemo(() => (k ? insightsSaas(dados, ls, serie, k) : []), [dados, ls, serie, k]);

  if (carregando || !k) return <div className="card empty" style={{ marginTop: 40 }}>Carregando a plataforma…</div>;
  const cfg = cfgDe(dados);
  const cur = serie[serie.length - 1];
  const mesNome = MESES_LONGOS[Number(today().slice(5, 7)) - 1];

  const porPlano = [...dados.planos].sort((a, b) => a.ordem - b.ordem).map((p) => {
    const xs = ls.filter((a) => a.planoId === p.id && PAGANTE.includes(a.status));
    const mrr = xs.reduce((s, a) => s + a.mrr, 0);
    const cancel = ls.filter((a) => a.planoId === p.id && a.status === 'Cancelada' && a.valorNoCancelamento).length;
    return { p, n: xs.length, mrr, share: k.mrr ? mrr / k.mrr : 0, arpa: xs.length ? mrr / xs.length : 0, cancel, saudaveis: xs.filter((a) => a.saude.nivel === 'Saudável').length };
  });

  const canais = Object.entries(ls.reduce<Record<string, { total: number; pag: number; mrr: number; trials: number; conv: number }>>((acc, a) => {
    const c = (acc[a.origem] ??= { total: 0, pag: 0, mrr: 0, trials: 0, conv: 0 });
    c.total++; c.mrr += a.mrr;
    if (PAGANTE.includes(a.status)) c.pag++;
    if (a.trialFim && a.trialFim < today()) { c.trials++; if (a.convertidoEm) c.conv++; }
    return acc;
  }, {})).sort((a, b) => b[1].mrr - a[1].mrr);

  const mov = [
    { l: `MRR em ${MESES_LONGOS[(Number(cur.mes.slice(5)) + 10) % 12]}`, v: k.mrrAnt, cls: '' },
    { l: `Novos assinantes (${cur.novosN})`, v: cur.novo, cls: 'text-success' },
    { l: 'Expansão (upgrades e extras)', v: cur.expansao, cls: 'text-success' },
    { l: 'Contração (downgrades)', v: -cur.contracao, cls: 'text-danger' },
    { l: `Cancelamentos (${cur.churnN})`, v: -cur.churn, cls: 'text-danger' },
  ];
  const maxMov = Math.max(...mov.map((m) => Math.abs(m.v)), 1);

  return (
    <>
      <PageHeader title="Console da plataforma" subtitle={`Receita recorrente, carteira de assinantes e saúde das contas do Pivot Hub · ${mesNome}.`}>
        <Link className="btn" to="/console/planos">Planos e preços</Link>
        <Link className="btn btn-primary" to="/console/assinantes?novo=1">Nova empresa</Link>
      </PageHeader>

      <div className="grid kpis">
        <Kpi icon={<Repeat size={20} />} tone="blue" label="MRR (receita recorrente mensal)" value={money(k.mrr)}
          foot={<><Trend value={variation(k.mrr, k.mrrAnt)} /> vs. mês anterior · ARR {moneyShort(k.arr)}</>} />
        <Kpi icon={<Users size={20} />} tone="green" label="Assinantes pagantes" value={k.pagantes}
          foot={`Ticket médio (ARPA) ${money(k.arpa)}/mês`} />
        <Kpi icon={<TrendingDown size={20} />} tone="red" label="Churn do mês" value={pct(k.churnReceita, 1)}
          foot={<>{k.churnN} cancelamento(s) · NRR <strong className={k.nrr !== null && k.nrr >= 1 ? 'text-success' : 'text-danger'}>{k.nrr === null ? '—' : pct(k.nrr)}</strong></>} />
        <Kpi icon={<Wallet size={20} />} tone="orange" label="Inadimplência" value={money(k.vencido)}
          foot={k.vencido ? <span className="text-danger strong">{k.inadimplentes} empresa(s) · {pct(k.mrr ? k.vencido / k.mrr : 0)} do MRR</span> : <span className="text-success strong">Nenhuma fatura vencida</span>} />
      </div>
      <div className="grid kpis mt">
        <Kpi icon={<Hourglass size={20} />} tone="purple" label="Testes grátis ativos" value={k.trials}
          foot={<>{k.trialsVencendo} terminam em 7 dias · conversão {k.conversao === null ? '—' : pct(k.conversao)}{k.trialsBase ? ` (${k.trialsBase} testes)` : ''}</>} />
        <Kpi icon={<Megaphone size={20} />} tone="blue" label="CAC (custo por assinante)" value={k.cac === null ? '—' : money(k.cac)}
          foot={`${money(cfg.investimentoAquisicaoMes)}/mês em aquisição · ${k.novos3m} novos em 3 meses`} />
        <Kpi icon={<BadgeDollarSign size={20} />} tone="green" label="LTV estimado" value={k.ltv === null ? '—' : money(k.ltv)}
          foot={`ARPA ÷ churn médio de ${pct(k.churnMedio, 1)}/mês${k.ltv && k.cac ? ` · LTV/CAC ${(k.ltv / k.cac).toFixed(1).replace('.', ',')}x` : ''}`} />
        <Kpi icon={<Clock size={20} />} tone="orange" label="Payback do CAC" value={k.payback === null ? '—' : `${k.payback.toFixed(1).replace('.', ',')} meses`}
          foot="Meses de mensalidade para recuperar o custo de aquisição" />
      </div>

      <div className="card mt">
        <div className="card-head">
          <div>
            <h3 className="row"><Lightbulb size={16} color="var(--primary)" /> Onde agir agora</h3>
            <div className="card-sub">Riscos e oportunidades da carteira, ordenados pelo valor em jogo.</div>
          </div>
        </div>
        <div className="insights grid g-3" style={{ display: 'grid' }}>
          {ins.slice(0, 6).map((i) => {
            const Icon = ICON[i.tone];
            return (
              <div key={i.titulo} className={`insight ${i.tone}`}>
                <div className={`ico tone-${TONE[i.tone]}`}><Icon size={16} /></div>
                <div>
                  <div className="t">{i.titulo}</div>
                  <div className="d">{i.texto}</div>
                  {i.to && <Link className="a" to={i.to}>{i.acao} <ArrowRight size={12} /></Link>}
                </div>
              </div>
            );
          })}
          {!ins.length && <div className="muted small">Nenhum alerta: carteira saudável.</div>}
        </div>
      </div>

      <div className="grid g-3-2 mt">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Evolução do MRR (12 meses)</h3>
              <div className="card-sub">Barras: MRR · Linha: assinantes pagantes · meses anteriores pelas faturas emitidas</div>
            </div>
          </div>
          <div className="chart-box" style={{ height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={serie} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis yAxisId="v" tickFormatter={(v) => moneyShort(v)} tickLine={false} axisLine={false} fontSize={11} width={80} />
                <YAxis yAxisId="n" orientation="right" tickLine={false} axisLine={false} fontSize={11} width={30} allowDecimals={false} />
                <Tooltip formatter={(v, n) => (n === 'mrr' ? [money(Number(v)), 'MRR'] : [v, 'Pagantes'])} cursor={{ fill: '#f3f7fe' }} />
                <Bar yAxisId="v" dataKey="mrr" fill="#9cc2f7" radius={[6, 6, 0, 0]} maxBarSize={38} />
                <Line yAxisId="n" dataKey="pagantes" stroke="#1e6fe8" strokeWidth={2.5} dot={{ r: 3, fill: '#1e6fe8' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Por que o MRR mudou neste mês</h3>
              <div className="card-sub">Decomposição da variação de {money(k.mrr - k.mrrAnt)}</div>
            </div>
          </div>
          <div className="card-pad" style={{ display: 'grid', gap: 12 }}>
            {mov.map((m, i) => (
              <div key={m.l}>
                <div className="row between small"><span>{m.l}</span><strong className={m.cls}>{i > 0 && m.v > 0 ? '+' : ''}{money(m.v)}</strong></div>
                {i > 0 && <div className="meter"><span style={{ width: `${(Math.abs(m.v) / maxMov) * 100}%`, background: m.v >= 0 ? 'var(--success)' : 'var(--danger)' }} /></div>}
              </div>
            ))}
            <div className="divider" />
            <div className="row between"><strong>MRR atual</strong><strong>{money(k.mrr)}</strong></div>
          </div>
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head"><div><h3>Receita por plano</h3><div className="card-sub">Onde está o dinheiro e a saúde de cada faixa</div></div><Link className="link" to="/console/planos">Editar planos</Link></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Plano</th><th className="num">Pagantes</th><th className="num">MRR</th><th className="num">% MRR</th><th className="num">ARPA</th></tr></thead>
              <tbody>
                {porPlano.map((x) => (
                  <tr key={x.p.id}>
                    <td className="strong">{x.p.nome}<div className="sub">{money(x.p.precoMensal)}/mês · {x.n ? pct(x.saudaveis / x.n) : '—'} saudáveis</div></td>
                    <td className="num">{x.n}</td>
                    <td className="num strong">{money(x.mrr)}</td>
                    <td className="num">{pct(x.share)}<div className="meter"><span style={{ width: `${x.share * 100}%` }} /></div></td>
                    <td className="num">{money(x.arpa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Aquisição por canal</h3><div className="card-sub">Quais canais trazem assinantes que pagam e ficam</div></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Canal</th><th className="num">Empresas</th><th className="num">Pagantes</th><th className="num">MRR</th><th className="num">Conv. teste</th></tr></thead>
              <tbody>
                {canais.map(([c, x]) => (
                  <tr key={c}>
                    <td className="strong">{c}</td>
                    <td className="num">{x.total}</td>
                    <td className="num">{x.pag}</td>
                    <td className="num strong">{money(x.mrr)}</td>
                    <td className="num">{x.trials ? `${pct(x.conv / x.trials)} (${x.conv}/${x.trials})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-head"><div><h3>Movimento do MRR mês a mês</h3><div className="card-sub">Crescimento líquido = novos + expansão − contração − cancelamentos</div></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Mês</th><th className="num">Novos</th><th className="num">Expansão</th><th className="num">Contração</th><th className="num">Cancelamentos</th><th className="num">Líquido</th><th className="num">MRR</th></tr></thead>
            <tbody>
              {serie.slice(-6).reverse().map((s) => {
                const liq = s.novo + s.expansao - s.contracao - s.churn;
                return (
                  <tr key={s.mes}>
                    <td className="strong">{s.label}</td>
                    <td className="num text-success">{s.novo ? `+${money(s.novo)}` : '—'}<div className="sub">{s.novosN ? `${s.novosN} empresa(s)` : ''}</div></td>
                    <td className="num text-success">{s.expansao ? `+${money(s.expansao)}` : '—'}</td>
                    <td className="num text-danger">{s.contracao ? `−${money(s.contracao)}` : '—'}</td>
                    <td className="num text-danger">{s.churn ? `−${money(s.churn)}` : '—'}<div className="sub">{s.churnN ? `${s.churnN} empresa(s)` : ''}</div></td>
                    <td className={`num strong ${liq >= 0 ? 'text-success' : 'text-danger'}`}>{liq >= 0 ? '+' : '−'}{money(Math.abs(liq))}</td>
                    <td className="num strong">{money(s.mrr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
