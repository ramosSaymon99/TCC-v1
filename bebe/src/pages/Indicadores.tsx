import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useApp } from '../ctx';
import { COR_COCO, TIPOS, papel } from '../lib/constants';
import { ehNoturno, estatisticas, fimEvento, mediaDiaria, referencias, serieDiaria, type Stats } from '../lib/metrics';
import { DIA, MIN, addDays, dataCurta, diaSemana, duracao, hm, idade, startOfDay, t } from '../lib/time';
import { Delta, Empty, Seg } from '../components/ui';
import { descreve } from './Hoje';
import { Avatar } from '../components/Avatar';

type Periodo = 'dia' | 'semana' | 'mes';
const N: Record<Periodo, number> = { dia: 1, semana: 7, mes: 30 };

export function Indicadores() {
  const { data, agora, nome, user } = useApp();
  const { baby } = data;
  const hoje = startOfDay(agora);
  const [per, setPer] = useState<Periodo>('semana');
  const [fim, setFim] = useState(hoje);
  const [quem, setQuem] = useState<string>('todos');
  const n = N[per];
  const ref = referencias(idade(baby.birth_date, agora).dias);

  // Filtro por cuidador: mostra o que aquela pessoa registrou (ex.: relatório do turno da babá)
  const events = useMemo(() => (quem === 'todos' ? data.events : data.events.filter((e) => e.user_id === quem)), [data.events, quem]);

  const r = useMemo(() => {
    const ehHoje = fim === hoje;
    const frac = ehHoje ? (agora - hoje) / DIA : 1;
    const atualDias = serieDiaria(events, fim, n, baby.routine, agora);
    let antDias = serieDiaria(events, addDays(fim, -n), n, baby.routine, agora);
    let fracAnt = 1;
    if (per === 'dia' && ehHoje) {
      // Hoje parcial × ontem até o mesmo horário (base equivalente)
      antDias = [{ dia: addDays(hoje, -1), ...estatisticas(events, addDays(hoje, -1), addDays(hoje, -1) + (agora - hoje), baby.routine, agora) }];
      fracAnt = frac;
    }
    const atual = per === 'dia' ? atualDias[0] : mediaDiaria(atualDias, frac);
    const ant = per === 'dia' ? antDias[0] : mediaDiaria(antDias, fracAnt);
    const total = per === 'dia' ? atualDias[0] : (() => { const s = mediaDiaria(atualDias, 1); return { ...s, byUser: s.byUser }; })();
    return { atualDias, atual, ant, total, frac };
  }, [events, fim, n, per, hoje, agora, baby.routine]);

  const { atual, ant } = r;
  const sufixo = per === 'dia' ? '' : '/dia';
  const serie = r.atualDias.map((d) => ({
    nome: per === 'mes' ? dataCurta(d.dia) : `${diaSemana(d.dia)} ${new Date(d.dia).getDate()}`,
    noturno: +(d.nightSleepMin / 60).toFixed(1), diurno: +(d.daySleepMin / 60).toFixed(1),
    mamadas: d.feeds, ml: d.bottleMl, xixi: d.wet, coco: d.poop,
  }));

  // Decomposição da variação do sono (noturno × diurno)
  const dSono = atual.sleepMin - ant.sleepMin;
  const dNoite = atual.nightSleepMin - ant.nightSleepMin;
  const dDia = atual.daySleepMin - ant.daySleepMin;

  const titulo = per === 'dia' ? (fim === hoje ? 'Hoje' : `${diaSemana(fim)} ${dataCurta(fim)}`) : `${dataCurta(addDays(fim, -n + 1))} – ${dataCurta(fim)}`;
  const compara = per === 'dia' ? (fim === hoje ? 'ontem no mesmo horário' : 'dia anterior') : `${n} dias anteriores`;

  function exportar() {
    const de = addDays(fim, -n + 1);
    const linhas = [['data', 'inicio', 'fim', 'tipo', 'detalhe', 'registrado_por', 'observacao']];
    for (const e of events.filter((e) => t(e.start_at) >= de && t(e.start_at) < addDays(fim, 1))) {
      const ini = new Date(e.start_at);
      linhas.push([ini.toLocaleDateString('pt-BR'), hm(e.start_at), e.end_at ? hm(e.end_at) : '', TIPOS[e.type].label, descreve(e, agora), nome(e.user_id), e.note ?? '']);
    }
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `ninho-${baby.name.split(' ')[0].toLowerCase()}-${per}.csv`;
    a.click();
  }

  return (
    <div className="page">
      <div className="between" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1>Indicadores</h1>
          <p className="faint">{titulo} · comparado com {compara}</p>
        </div>
        <button className="btn sm" onClick={exportar}><Download size={15} /> CSV</button>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <Seg value={per} onChange={(v) => { setPer(v); }} options={[{ v: 'dia', l: 'Dia' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mês' }]} />
          <div className="row">
            <button className="icon-btn" onClick={() => setFim(addDays(fim, -n))} aria-label="Anterior"><ChevronLeft size={16} /></button>
            <button className="btn sm" disabled={fim === hoje} onClick={() => setFim(hoje)}>Atual</button>
            <button className="icon-btn" disabled={fim >= hoje} onClick={() => setFim(Math.min(hoje, addDays(fim, n)))} aria-label="Próximo"><ChevronRight size={16} /></button>
          </div>
          <select className="input" style={{ width: 'auto', minHeight: 38, padding: '6px 10px', fontSize: 14 }} value={quem} onChange={(e) => setQuem(e.target.value)}>
            <option value="todos">Todos os cuidadores</option>
            {data.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === user.id ? 'Só meus registros' : `${papel(m.role).label} · ${m.name.split(' ')[0]}`}</option>)}
          </select>
        </div>
      </div>

      {quem !== 'todos' && <div className="chip info" style={{ alignSelf: 'flex-start' }}>Mostrando apenas o que {nome(quem)} registrou</div>}

      <div className="grid g4">
        <Kpi lab="😴 Sono total" val={duracao(atual.sleepMin)} suf={sufixo} a={atual.sleepMin} b={ant.sleepMin} faixa={per !== 'dia' || fim !== hoje ? [ref.sonoH[0] * 60, ref.sonoH[1] * 60] : undefined} max={ref.sonoH[1] * 60 * 1.3} sub={`ref. ${ref.sonoH[0]}–${ref.sonoH[1]} h`} />
        <Kpi lab="🌙 Sono noturno" val={duracao(atual.nightSleepMin)} suf={sufixo} a={atual.nightSleepMin} b={ant.nightSleepMin} sub={`maior bloco ${duracao(atual.longestSleepMin)}`} />
        <Kpi lab="☀️ Sonecas" val={atual.naps.toFixed(per === 'dia' ? 0 : 1)} suf={sufixo} a={atual.naps} b={ant.naps} neutro sub={`${duracao(atual.daySleepMin)} de sono diurno`} />
        <Kpi lab="🍼 Mamadas" val={atual.feeds.toFixed(per === 'dia' ? 0 : 1)} suf={sufixo} a={atual.feeds} b={ant.feeds} faixa={ref.mamadas && (per !== 'dia' || fim !== hoje) ? ref.mamadas : undefined} max={ref.mamadas ? ref.mamadas[1] * 1.4 : undefined} sub={ref.mamadas ? `ref. ${ref.mamadas[0]}–${ref.mamadas[1]}` : `${atual.breastFeeds.toFixed(0)} no peito`} />
        <Kpi lab="⏱️ Intervalo médio" val={atual.avgFeedIntervalMin ? duracao(atual.avgFeedIntervalMin) : '—'} a={atual.avgFeedIntervalMin ?? 0} b={ant.avgFeedIntervalMin ?? 0} neutro sub="entre mamadas" />
        <Kpi lab="🥛 Mamadeira" val={`${Math.round(atual.bottleMl)} ml`} suf={sufixo} a={atual.bottleMl} b={ant.bottleMl} neutro sub={`${duracao(atual.breastMin)} no peito${sufixo}`} />
        <Kpi lab="💧 Fraldas de xixi" val={atual.wet.toFixed(per === 'dia' ? 0 : 1)} suf={sufixo} a={atual.wet} b={ant.wet} faixa={ref.fraldasMolhadas && (per !== 'dia' || fim !== hoje) ? [ref.fraldasMolhadas, ref.fraldasMolhadas * 1.7] : undefined} max={ref.fraldasMolhadas ? ref.fraldasMolhadas * 2 : undefined} sub={ref.fraldasMolhadas ? `ref. ≥ ${ref.fraldasMolhadas}/dia` : `${atual.diapers.toFixed(0)} trocas`} />
        <Kpi lab="💩 Cocôs" val={atual.poop.toFixed(per === 'dia' ? 0 : 1)} suf={sufixo} a={atual.poop} b={ant.poop} neutro sub={`${atual.diapers.toFixed(per === 'dia' ? 0 : 1)} trocas${sufixo}`} />
      </div>

      <div className="card">
        <div className="card-h"><h2>Leitura do período</h2></div>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          {ant.sleepMin > 0 ? (
            <li>
              Sono {dSono >= 0 ? 'aumentou' : 'diminuiu'} <b>{duracao(Math.abs(dSono))}{sufixo}</b> ({Math.round((atual.sleepMin / ant.sleepMin - 1) * 100)}%).
              {Math.abs(dSono) > 10 && <> A maior parte veio do sono <b>{Math.abs(dNoite) >= Math.abs(dDia) ? 'noturno' : 'diurno (sonecas)'}</b> ({Math.abs(dNoite) >= Math.abs(dDia) ? `${dNoite >= 0 ? '+' : '−'}${duracao(Math.abs(dNoite))}` : `${dDia >= 0 ? '+' : '−'}${duracao(Math.abs(dDia))}`}).</>}
            </li>
          ) : <li>Sem base de comparação de sono no período anterior.</li>}
          {ant.feeds > 0 && <li>Mamadas: {atual.feeds.toFixed(1)} × {ant.feeds.toFixed(1)}{sufixo}{atual.avgFeedIntervalMin && ant.avgFeedIntervalMin ? `; intervalo médio passou de ${duracao(ant.avgFeedIntervalMin)} para ${duracao(atual.avgFeedIntervalMin)}` : ''}.</li>}
          {ref.fraldasMolhadas && per !== 'dia' && <li>Fraldas de xixi: {atual.wet.toFixed(1)}/dia {atual.wet >= ref.fraldasMolhadas ? '— dentro da referência de hidratação (≥ 6).' : '— abaixo da referência de 6/dia; confira se todas as trocas foram registradas.'}</li>}
          <li>{atual.registros.toFixed(per === 'dia' ? 0 : 1)} registros{sufixo} no período{quem === 'todos' ? ` por ${Object.keys(r.atualDias.reduce((a, d) => ({ ...a, ...d.byUser }), {} as Record<string, number>)).length} cuidador(es)` : ''}.</li>
        </ul>
        <p className="disclaimer" style={{ marginTop: 10 }}>Referências gerais (AAP, AASM, SBP). Cada bebê tem seu ritmo — use os dados para conversar com o pediatra, não para diagnosticar.</p>
      </div>

      {per !== 'dia' && (
        <div className="grid md2">
          <div className="card">
            <div className="card-h"><h2>Sono por dia (h)</h2></div>
            <div style={{ height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={serie} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="nome" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ReferenceArea y1={ref.sonoH[0]} y2={ref.sonoH[1]} fill="var(--ok)" fillOpacity={0.08} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="noturno" name="Noturno" stackId="s" fill={TIPOS.sono.cor} />
                  <Bar dataKey="diurno" name="Sonecas" stackId="s" fill="#A7B0EC" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Alimentação por dia</h2></div>
            <div style={{ height: 230 }}>
              <ResponsiveContainer>
                <ComposedChart data={serie} margin={{ left: -20, right: -10, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="nome" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis yAxisId="a" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis yAxisId="b" orientation="right" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="a" dataKey="mamadas" name="Mamadas" fill={TIPOS.mamada.cor} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="b" dataKey="ml" name="ml mamadeira" stroke={TIPOS.mamadeira.cor} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Fraldas por dia</h2></div>
            <div style={{ height: 210 }}>
              <ResponsiveContainer>
                <BarChart data={serie} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="nome" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="xixi" name="Xixi" fill={TIPOS.fralda.cor} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="coco" name="Cocô" fill={COR_COCO} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Cuidadores dias={r.atualDias} />
        </div>
      )}

      <Padrao fim={fim} dias={per === 'mes' ? 30 : 7} />
      {per === 'dia' && <Cuidadores dias={r.atualDias} />}
    </div>
  );
}

function Kpi({ lab, val, suf = '', a, b, sub, neutro, faixa, max }: { lab: string; val: string; suf?: string; a: number; b: number; sub: string; neutro?: boolean; faixa?: number[]; max?: number }) {
  const pos = (x: number) => `${Math.min(100, Math.max(0, (x / (max || 1)) * 100))}%`;
  const dentro = faixa ? a >= faixa[0] && a <= faixa[1] : true;
  return (
    <div className="card kpi">
      <div className="lab">{lab}</div>
      <div className="val">{val}<span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{suf}</span></div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Delta atual={a} anterior={b} neutro={neutro} /><span className="sub">{sub}</span></div>
      {faixa && max && (
        <div className="ref" title="Faixa de referência para a idade">
          <span className="band" style={{ left: pos(faixa[0]), width: `calc(${pos(faixa[1])} - ${pos(faixa[0])})` }} />
          <span className="dot" style={{ left: pos(a), background: dentro ? 'var(--ok)' : 'var(--warn)' }} />
        </div>
      )}
    </div>
  );
}

function Cuidadores({ dias }: { dias: Stats[] }) {
  const { data, user } = useApp();
  const tot: Record<string, number> = {};
  for (const d of dias) for (const [u, c] of Object.entries(d.byUser)) tot[u] = (tot[u] ?? 0) + c;
  const soma = Object.values(tot).reduce((a, b) => a + b, 0);
  const lista = data.members.map((m) => ({ m, n: tot[m.user_id] ?? 0 })).sort((a, b) => b.n - a.n);
  return (
    <div className="card">
      <div className="card-h"><h2>Quem cuidou</h2><span className="faint">{soma} registros</span></div>
      {soma ? (
        <div className="stack" style={{ gap: 10 }}>
          {lista.map(({ m, n }) => (
            <div key={m.user_id} className="hbar">
              <Avatar photo={m.photo} emoji={papel(m.role).emoji} size={28} />
              <span style={{ width: 84, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.user_id === user.id ? 'Você' : m.name.split(' ')[0]}</span>
              <div className="track"><div className="fill" style={{ width: `${(n / soma) * 100}%`, background: 'var(--brand)' }} /></div>
              <span className="num" style={{ width: 44, textAlign: 'right', fontWeight: 800, fontSize: 13 }}>{Math.round((n / soma) * 100)}%</span>
            </div>
          ))}
        </div>
      ) : <Empty emoji="🤝">Sem registros no período.</Empty>}
    </div>
  );
}

/** Padrão 24h: cada linha é um dia; blocos de sono e marcadores de mamada/fralda. */
function Padrao({ fim, dias }: { fim: number; dias: number }) {
  const { data, agora } = useApp();
  const linhas = Array.from({ length: dias }, (_, i) => addDays(fim, -i));
  const pct = (ms: number, d: number) => `${((ms - d) / DIA) * 100}%`;
  return (
    <div className="card">
      <div className="card-h">
        <h2>Padrão do dia (24 h)</h2>
        <div className="row faint" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span><span style={{ color: TIPOS.sono.cor }}>■</span> sono</span>
          <span><span style={{ color: TIPOS.mamada.cor }}>●</span> mamada</span>
          <span><span style={{ color: COR_COCO }}>●</span> cocô</span>
        </div>
      </div>
      <div className="pat">
        {linhas.map((d) => {
          const fimD = addDays(d, 1);
          const evs = data.events.filter((e) => t(e.start_at) < fimD && fimEvento(e, agora) > d);
          return (
            <div key={d} className="pat-row">
              <span className="pat-lab">{diaSemana(d)} {new Date(d).getDate()}</span>
              <div className="pat-bar">
                {evs.filter((e) => e.type === 'sono').map((e) => {
                  const a = Math.max(t(e.start_at), d);
                  const b = Math.min(fimEvento(e, agora), fimD);
                  return <span key={e.id} style={{ left: pct(a, d), width: pct(b - a + d, d), background: ehNoturno(a, data.baby.routine) ? TIPOS.sono.cor : '#A7B0EC', borderRadius: 3 }} title={`${hm(a)}–${hm(b)} · ${duracao((b - a) / MIN)}`} />;
                })}
                {evs.filter((e) => (e.type === 'mamada' || e.type === 'mamadeira') && t(e.start_at) >= d).map((e) => (
                  <span key={e.id} style={{ left: pct(t(e.start_at), d), top: 4, bottom: 4, width: 8, borderRadius: 8, background: TIPOS[e.type].cor, border: '1.5px solid var(--surface)' }} title={`${TIPOS[e.type].label} ${hm(e.start_at)}`} />
                ))}
                {evs.filter((e) => e.type === 'fralda' && (e.data.diaper === 'coco' || e.data.diaper === 'ambos') && t(e.start_at) >= d).map((e) => (
                  <span key={e.id} style={{ left: pct(t(e.start_at), d), top: 10, bottom: 0, width: 6, borderRadius: 6, background: COR_COCO }} title={`Cocô ${hm(e.start_at)}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pat-axis" style={{ marginTop: 4 }}>{['0h', '6h', '12h', '18h', '24h'].map((h) => <span key={h}>{h}</span>)}</div>
    </div>
  );
}
