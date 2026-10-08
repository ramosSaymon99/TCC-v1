import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Lightbulb, Megaphone, Repeat, UserPlus, Wallet } from 'lucide-react';
import { useStore } from '../store/Store';
import { Kpi, PageHeader, Trend } from '../components/ui';
import { OBJETIVOS, ORIGENS } from '../types';
import { addDays, lastMonths, monthLabel, money, pct, today, variation } from '../utils/format';
import { noPeriodo, porCanal, taxaRetorno } from '../utils/metrics';
import { evolucao } from '../utils/nutri';

const CORES = ['#2f6b4f', '#8fc79f', '#e0894f', '#9b86e0', '#f2c94c', '#c9c2b2'];

export default function Captacao() {
  const { db, resumo } = useStore();
  const hoje = today();
  const [meses, setMeses] = useState(12);
  const de = addDays(hoje, -Math.round(meses * 30.4)), ate = hoje;
  const antDe = addDays(de, -Math.round(meses * 30.4)), antAte = addDays(de, -1);

  const canais = useMemo(() => porCanal(db, resumo, de, ate, ORIGENS), [db, resumo, de, ate]);
  const novos = db.pacientes.filter((p) => noPeriodo(p.criadoEm, de, ate)).length;
  const novosAnt = db.pacientes.filter((p) => noPeriodo(p.criadoEm, antDe, antAte)).length;
  const ret = taxaRetorno(db, resumo, hoje);
  const invest = canais.reduce((s, c) => s + c.investimento, 0);
  const comConsulta = [...resumo.values()].filter((r) => r.realizadas > 0);
  const ltvGeral = comConsulta.length ? comConsulta.reduce((s, r) => s + r.receita, 0) / comConsulta.length : 0;
  const novosPagos = canais.filter((c) => c.investimento > 0).reduce((s, c) => s + c.novos, 0);

  const serie = lastMonths(meses).map((m) => {
    const row: Record<string, string | number> = { mes: monthLabel(m) };
    for (const o of ORIGENS) row[o] = db.pacientes.filter((p) => p.origem === o && p.criadoEm.startsWith(m)).length;
    return row;
  });

  // Funil de permanência: quantos pacientes chegam à 2ª, 3ª, 4ª… consulta
  const funil = useMemo(() => {
    const base = [...resumo.values()].filter((r) => r.primeira && r.primeira <= addDays(hoje, -45));
    const etapas = [1, 2, 3, 4, 5].map((n) => ({ etapa: n === 5 ? '5 ou mais' : `${n}ª consulta`, n, qtd: base.filter((r) => r.realizadas >= n).length }));
    return etapas.map((e, i) => ({ ...e, pct: base.length ? e.qtd / base.length : 0, perda: i ? 1 - e.qtd / (etapas[i - 1].qtd || 1) : 0 }));
  }, [resumo, hoje]);
  const maiorPerda = funil.slice(1).sort((a, b) => b.perda - a.perda)[0];

  const objetivos = OBJETIVOS.map((o) => {
    const ps = db.pacientes.filter((p) => p.objetivo === o);
    const deltas = ps.map((p) => evolucao(db.avaliacoes.filter((a) => a.pacienteId === p.id))).filter((e) => e.ord.length >= 2).map((e) => e.deltaTotal);
    return {
      objetivo: o, pacientes: ps.length,
      retorno: taxaRetorno(db, resumo, hoje, (p) => p.objetivo === o).taxa,
      ltv: ps.length ? ps.reduce((s, p) => s + (resumo.get(p.id)?.receita ?? 0), 0) / Math.max(1, ps.filter((p) => (resumo.get(p.id)?.realizadas ?? 0) > 0).length) : 0,
      delta: deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null,
    };
  }).filter((o) => o.pacientes > 0);

  const insights: { t: string; d: ReactNode }[] = [];
  const comVolume = canais.filter((c) => c.pacientes >= 3);
  if (comVolume.length >= 2) {
    const porLtv = [...comVolume].sort((a, b) => b.ltv - a.ltv);
    const melhor = porLtv[0], pior = porLtv[porLtv.length - 1];
    insights.push({ t: `${melhor.origem} traz os pacientes mais valiosos`, d: <>Receita média de {money(melhor.ltv)} por paciente e {melhor.consultasPorPaciente.toFixed(1).replace('.', ',')} consultas cada, contra {money(pior.ltv)} em {pior.origem}. Cada paciente a mais por {melhor.origem} vale {money(melhor.ltv - pior.ltv)} a mais.</> });
    const ind = canais.find((c) => c.origem === 'Indicação');
    if (ind && ind.ltv >= melhor.ltv * 0.9) insights.push({ t: 'Programa de indicação estruturado', d: <>Indicação tem custo zero e retém bem. Ofereça um benefício (ex.: retorno com desconto) a quem indicar — {Math.ceil(db.config.metaMensal * 0.1 / Math.max(1, ind.ltv))} indicações/mês já somam ~10% da meta mensal em receita de ciclo de vida.</> });
  }
  canais.filter((c) => c.investimento > 0 && c.cac !== null).forEach((c) => {
    const razao = c.cac ? c.ltv / c.cac : 0;
    insights.push({ t: `${c.origem}: LTV/CAC de ${razao.toFixed(1).replace('.', ',')}×`, d: <>Investimento de {money(c.investimento)} para {c.novos} novos pacientes (CAC {money(c.cac ?? 0)}). {razao < 3 ? 'Abaixo de 3× — revise segmentação/criativos ou foque o orçamento no canal mais rentável.' : 'Saudável (acima de 3×) — há espaço para escalar com controle.'}</> });
  });
  if (maiorPerda && maiorPerda.perda > 0.25) insights.push({ t: `Maior perda na passagem para ${maiorPerda.n === 5 ? '5 ou mais consultas' : `a ${maiorPerda.etapa}`}: ${pct(maiorPerda.perda)}`, d: <>Saia da consulta anterior com o retorno já agendado e ofereça pacote de acompanhamento — pacientes com pacote têm retorno garantido no período.</> });

  return (
    <>
      <PageHeader title="Captação e retenção" subtitle="De onde vêm os pacientes, quanto custam, quanto ficam e quanto valem">
        <div className="seg">{[6, 12].map((m) => <button key={m} className={meses === m ? 'active' : ''} onClick={() => setMeses(m)}>{m} meses</button>)}</div>
      </PageHeader>

      <div className="grid kpis">
        <Kpi icon={<UserPlus size={20} />} tone="green" label="Novos pacientes" value={novos} foot={<><Trend value={variation(novos, novosAnt)} /> vs. {meses} meses anteriores</>} />
        <Kpi icon={<Repeat size={20} />} tone="blue" label="Taxa de retorno" value={pct(ret.taxa)} foot={<>{ret.voltaram} de {ret.base} voltaram após a 1ª consulta</>} />
        <Kpi icon={<Wallet size={20} />} tone="purple" label="Receita média por paciente" value={money(ltvGeral)} foot={<>LTV histórico de quem já consultou</>} />
        <Kpi icon={<Megaphone size={20} />} tone="orange" label="Investimento em anúncios" value={money(invest)} foot={<>CAC dos canais pagos: {novosPagos ? money(invest / novosPagos) : '—'}</>} />
      </div>

      <div className="card mt">
        <div className="card-head"><div><h3>Desempenho por canal de origem</h3><div className="card-sub">Novos e investimento no período · LTV, retorno e consultas consideram todo o histórico</div></div></div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table table-compact">
            <thead><tr><th>Canal</th><th className="num">Novos</th><th className="num">% dos novos</th><th className="num">Consultas/paciente</th><th className="num">Taxa de retorno</th><th className="num">LTV</th><th className="num">Investimento</th><th className="num">CAC</th><th className="num">ROI</th></tr></thead>
            <tbody>
              {[...canais].sort((a, b) => b.ltv - a.ltv).map((c) => (
                <tr key={c.origem}>
                  <td className="strong">{c.origem}</td>
                  <td className="num">{c.novos}</td>
                  <td className="num">{pct(c.novos / (novos || 1))}</td>
                  <td className="num">{c.consultasPorPaciente.toFixed(1).replace('.', ',')}</td>
                  <td className={`num ${c.retorno && c.retorno < ret.taxa - 0.1 ? 'text-danger' : ''}`}>{pct(c.retorno)}</td>
                  <td className="num strong">{money(c.ltv)}</td>
                  <td className="num">{c.investimento ? money(c.investimento) : '—'}</td>
                  <td className="num">{c.cac !== null ? money(c.cac) : '—'}</td>
                  <td className={`num ${c.roi !== null && c.roi < 0 ? 'text-danger' : 'text-success'}`}>{c.roi !== null ? pct(c.roi) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small muted" style={{ padding: '10px 20px 16px' }}>ROI = (receita gerada pelos novos pacientes do canal − investimento) ÷ investimento. Registre gastos de marketing no Financeiro com o canal correspondente.</div>
      </div>

      {insights.length > 0 && (
        <div className="card mt">
          <div className="card-head"><h3>Leituras e recomendações</h3></div>
          <div className="insights">
            {insights.map((i) => (
              <div key={i.t} className="insight opp"><div className="ico tone-blue"><Lightbulb size={16} /></div><div><div className="t">{i.t}</div><div className="d">{i.d}</div></div></div>
            ))}
          </div>
        </div>
      )}

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head"><div><h3>Novos pacientes por mês e canal</h3></div></div>
          <div className="chart-box" style={{ height: 290 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#efe9dc" />
                <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {ORIGENS.map((o, i) => <Bar key={o} dataKey={o} stackId="a" fill={CORES[i]} radius={i === ORIGENS.length - 1 ? [4, 4, 0, 0] : undefined} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Funil de permanência</h3><div className="card-sub">Pacientes com 1ª consulta há mais de 45 dias que chegaram a cada etapa</div></div></div>
          <div style={{ padding: '16px 20px' }}>
            {funil.map((f) => (
              <div key={f.etapa} className="bar-target">
                <span className="strong">{f.etapa}</span>
                <div className="meter"><span style={{ width: `${f.pct * 100}%` }} /></div>
                <span><b>{f.qtd}</b> ({pct(f.pct)}){f.perda > 0 ? <span className="text-danger"> −{pct(f.perda)}</span> : ''}</span>
              </div>
            ))}
          </div>
          <div className="divider" style={{ margin: '0 20px' }} />
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Objetivo</th><th className="num">Pacientes</th><th className="num">Retorno</th><th className="num">LTV</th><th className="num">Δ peso médio</th></tr></thead>
              <tbody>
                {objetivos.map((o) => (
                  <tr key={o.objetivo}>
                    <td className="strong">{o.objetivo}</td><td className="num">{o.pacientes}</td><td className="num">{pct(o.retorno)}</td><td className="num">{money(o.ltv)}</td>
                    <td className="num">{o.delta === null ? '—' : `${o.delta > 0 ? '+' : ''}${o.delta.toFixed(1).replace('.', ',')} kg`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
