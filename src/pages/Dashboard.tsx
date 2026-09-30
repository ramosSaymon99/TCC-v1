import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileText, Lightbulb, TrendingUp, Users, Wallet, Wrench } from 'lucide-react';
import { useClienteNome, useStore } from '../store/Store';
import { Avatar, Badge, Kpi, Trend } from '../components/ui';
import { date, DIAS_SEMANA, MESES_LONGOS, money, monthLabel, moneyShort, parseDate, pct, today, variation } from '../utils/format';
import { ABERTAS, gerarInsights, periodos, resumoPeriodo, serieMensal } from '../utils/metrics';

const INSIGHT_ICON = { risk: AlertTriangle, warn: AlertTriangle, good: CheckCircle2, opp: Lightbulb };
const INSIGHT_TONE = { risk: 'red', warn: 'orange', good: 'green', opp: 'blue' };

export default function Dashboard() {
  const { db, user } = useStore();
  const nome = useClienteNome();
  const nav = useNavigate();
  const hoje = today();
  const p = periodos(hoje);

  const atual = resumoPeriodo(db.lancamentos, ...p.atual);
  const ant = resumoPeriodo(db.lancamentos, ...p.anterior);
  const meta = db.empresa.metaMensal;
  const projecao = p.dia ? (atual.faturamento / p.dia) * p.diasMes : 0;

  const propAtual = db.orcamentos.filter((o) => o.criadoEm >= p.atual[0] && o.criadoEm <= p.atual[1]).length;
  const propAnt = db.orcamentos.filter((o) => o.criadoEm >= p.anterior[0] && o.criadoEm <= p.anterior[1]).length;

  const emAndamento = db.ordens.filter((o) => (ABERTAS as readonly string[]).includes(o.status));
  const atrasadas = emAndamento.filter((o) => o.prazo < hoje);

  const serie = useMemo(() => serieMensal(db.lancamentos, 6).map((s, i, arr) => ({
    ...s, label: monthLabel(s.mes), parcial: i === arr.length - 1,
  })), [db.lancamentos]);
  const insights = useMemo(() => gerarInsights(db), [db]);

  const proximos = db.compromissos
    .filter((c) => c.data >= hoje)
    .sort((a, b) => (a.data + a.inicio).localeCompare(b.data + b.inicio))
    .slice(0, 4);
  const ultimosClientes = [...db.clientes].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 4);
  const hojeD = parseDate(hoje);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Olá, {user?.nome.split(' ')[0]}!</h1>
          <p>Resumo do seu negócio em {DIAS_SEMANA[hojeD.getDay()].toLowerCase()}, {hojeD.getDate()} de {MESES_LONGOS[hojeD.getMonth()]}. Comparações usam o mesmo período (dias 1–{p.dia}) do mês anterior.</p>
        </div>
      </div>

      <div className="grid kpis">
        <Kpi icon={<Wallet size={20} />} tone="blue" label="Faturamento do mês" value={money(atual.faturamento)}
          foot={<><Trend value={variation(atual.faturamento, ant.faturamento)} /> vs. mesmo período</>}>
          <div className="meter" title={`Meta: ${money(meta)}`}><span style={{ width: `${Math.min(100, (atual.faturamento / meta) * 100)}%` }} /></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>{pct(atual.faturamento / meta)} da meta · projeção {moneyShort(projecao)}</div>
        </Kpi>
        <Kpi icon={<Users size={20} />} tone="green" label="Clientes ativos no mês" value={atual.clientes}
          foot={<><Delta a={atual.clientes} b={ant.clientes} /> · ticket médio {money(atual.ticket)}</>} />
        <Kpi icon={<FileText size={20} />} tone="purple" label="Propostas enviadas" value={propAtual}
          foot={<><Delta a={propAtual} b={propAnt} /> vs. mesmo período</>} />
        <Kpi icon={<Wrench size={20} />} tone="orange" label="Serviços em andamento" value={emAndamento.length}
          foot={atrasadas.length
            ? <span className="text-danger strong">{atrasadas.length} com prazo vencido</span>
            : <span className="text-success strong">Todos dentro do prazo</span>} />
      </div>

      <div className="card mt">
        <div className="card-head">
          <div>
            <h3 className="row"><Lightbulb size={16} color="var(--primary)" /> Onde agir agora</h3>
            <div className="card-sub">Alertas e oportunidades calculados automaticamente a partir dos dados, em ordem de prioridade.</div>
          </div>
        </div>
        <div className="insights grid g-3" style={{ display: 'grid' }}>
          {insights.slice(0, 6).map((i) => {
            const Icon = INSIGHT_ICON[i.kind];
            return (
              <div key={i.title} className={`insight ${i.kind}`}>
                <div className={`ico tone-${INSIGHT_TONE[i.kind]}`}><Icon size={16} /></div>
                <div>
                  <div className="t">{i.title}</div>
                  <div className="d">{i.detail}</div>
                  <Link className="a" to={i.to}>{i.action} <ArrowRight size={12} /></Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid g-3-2 mt">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Faturamento dos últimos 6 meses</h3>
              <div className="card-sub">Barras: faturamento · Linha: lucro líquido · Mês atual parcial</div>
            </div>
            <Link className="link" to="/financeiro">Ver financeiro</Link>
          </div>
          <div className="chart-box" style={{ height: 270 }}>
            <ResponsiveContainer>
              <ComposedChart data={serie} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => moneyShort(v)} tickLine={false} axisLine={false} fontSize={11} width={92} />
                <Tooltip formatter={(v, n) => [money(Number(v)), n === 'receitas' ? 'Faturamento' : 'Lucro']} cursor={{ fill: '#f3f7fe' }} />
                <Bar dataKey="receitas" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {serie.map((s) => <Cell key={s.mes} fill={s.parcial ? '#9cc2f7' : '#d6e6fd'} />)}
                </Bar>
                <Line dataKey="lucro" stroke="#1e6fe8" strokeWidth={2.5} dot={{ r: 4, fill: '#1e6fe8' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Próximos compromissos</h3><Link className="link" to="/agenda">Ver agenda</Link></div>
          <ul className="list">
            {proximos.map((c) => (
              <li key={c.id}>
                <div className="time"><Clock size={14} color="var(--muted)" />{c.inicio}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{c.titulo}</div>
                  <div className="desc">{c.data === hoje ? 'Hoje' : date(c.data)} · Cliente: {nome(c.clienteId)}</div>
                </div>
              </li>
            ))}
            {proximos.length === 0 && <li className="muted">Nenhum compromisso agendado.</li>}
          </ul>
        </div>
      </div>

      <div className="grid g-3-2 mt">
        <div className="card">
          <div className="card-head"><h3>Serviços em andamento</h3><Link className="link" to="/ordens">Ver todos</Link></div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table table-compact">
              <thead><tr><th>Nº</th><th>Cliente</th><th>Serviço</th><th>Prazo</th><th>Status</th></tr></thead>
              <tbody>
                {[...emAndamento].sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 5).map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => nav(`/ordens?id=${o.id}`)}>
                    <td className="strong">{o.numero}</td>
                    <td>{nome(o.clienteId)}</td>
                    <td>{o.servico}</td>
                    <td className={o.prazo < hoje ? 'text-danger strong' : ''}>{date(o.prazo)}</td>
                    <td><Badge>{o.prazo < hoje ? 'Atrasado' : o.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Últimos clientes</h3><Link className="link" to="/clientes">Ver todos</Link></div>
          <ul className="list">
            {ultimosClientes.map((c) => (
              <li key={c.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/clientes?id=${c.id}`)}>
                <div className="person">
                  <Avatar nome={c.nome} />
                  <div style={{ minWidth: 0 }}><div className="name">{c.nome}</div><div className="meta">{c.email}</div></div>
                </div>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{date(c.criadoEm)}</span>
              </li>
            ))}
          </ul>
          <div className="row small muted" style={{ padding: '0 20px 16px' }}>
            <TrendingUp size={14} /> Ticket médio do mês: <strong style={{ color: 'var(--text)' }}>{money(atual.ticket)}</strong>
          </div>
        </div>
      </div>
    </>
  );
}

/** Para contagens pequenas, a diferença absoluta é mais honesta que a variação percentual. */
function Delta({ a, b }: { a: number; b: number }) {
  const d = a - b;
  return <span className={`trend ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`}>{d > 0 ? '+' : d < 0 ? '−' : '±'}{Math.abs(d)} <span className="muted" style={{ fontWeight: 400 }}>({b} antes)</span></span>;
}
