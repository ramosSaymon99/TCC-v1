import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, DollarSign, MessageCircle, Plus, Scale, TrendingUp, UserPlus, Users, Wallet,
} from 'lucide-react';
import { useStore } from '../store/Store';
import { Badge, Kpi, PageHeader, Trend } from '../components/ui';
import { ConsultaModal, PacienteModal } from '../components/modais';
import { addDays, date, DIAS_SEMANA, int, lastMonths, monthLabel, money, moneyShort, parseDate, pct, today, variation } from '../utils/format';
import {
  aReceber, contarAtendimentos, faturamento, fimMes, inicioMes, linkWhatsApp, ocupacao, periodoEquivalenteAnterior, porCanal, primeiroNome, taxaRetorno, ABERTAS,
} from '../utils/metrics';
import { evolucao } from '../utils/nutri';
import { ORIGENS } from '../types';

interface Insight { tone: 'risk' | 'warn' | 'good' | 'opp'; icon: ReactNode; titulo: string; texto: ReactNode; acao: string; to: string; peso: number }

export default function Dashboard() {
  const { db, resumo } = useStore();
  const nav = useNavigate();
  const [modal, setModal] = useState<'consulta' | 'paciente' | null>(null);
  const hoje = today();
  const cfg = db.config;

  const k = useMemo(() => {
    const ini = inicioMes(hoje), fim = fimMes(hoje);
    const eq = periodoEquivalenteAnterior(hoje);
    const fat = faturamento(db, ini, hoje);
    const fatAnt = faturamento(db, eq.de, eq.ate);
    const at = contarAtendimentos(db, ini, hoje);
    const atAnt = contarAtendimentos(db, eq.de, eq.ate);
    // Projeção: realizado + consultas ainda agendadas no mês, descontando a taxa de faltas observada
    const agendadoMes = db.consultas.filter((c) => ABERTAS(c) && c.data > hoje && c.data <= fim).reduce((s, c) => s + c.valor, 0);
    const noShow90 = contarAtendimentos(db, addDays(hoje, -90), hoje).noShow;
    const projecao = fat.total + agendadoMes * (1 - noShow90);
    const ticket = at.realizadas ? (fat.total - fat.porFonte.Pacotes - fat.porFonte['Outras receitas']) / Math.max(1, db.consultas.filter((c) => c.status === 'Realizada' && c.valor > 0 && c.data >= ini && c.data <= hoje).length) : 0;
    const valorFaltas = db.consultas.filter((c) => c.status === 'Faltou' && c.data >= ini && c.data <= hoje).reduce((s, c) => s + (c.valor || cfg.precos.Retorno), 0);
    const ocup7 = ocupacao(db, hoje, addDays(hoje, 6));
    const ret = taxaRetorno(db, resumo, hoje);
    const receber = aReceber(db, hoje);
    const lista = [...resumo.entries()];
    const ativos = lista.filter(([, r]) => r.status === 'Em acompanhamento').length;
    const vencidos = lista.filter(([, r]) => r.status === 'Retorno vencido');
    return { fat, fatAnt, at, atAnt, projecao, ticket, valorFaltas, ocup7, ret, receber, ativos, vencidos, noShow90 };
  }, [db, resumo, hoje, cfg.precos.Retorno]);

  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const nome = (id: string) => db.pacientes.find((p) => p.id === id)?.nome ?? '';
    const amanha = addDays(hoje, 1);

    const semConf = db.consultas.filter((c) => c.status === 'Agendada' && (c.data === hoje || c.data === amanha));
    if (semConf.length) out.push({
      tone: 'warn', icon: <MessageCircle size={16} />, peso: 95,
      titulo: `${semConf.length} consulta(s) de hoje/amanhã sem confirmação`,
      texto: <>Com a taxa de faltas atual ({pct(k.noShow90)}), cerca de {Math.max(1, Math.round(semConf.length * k.noShow90))} pode(m) não comparecer. Confirmar por WhatsApp reduz faltas e libera o horário para encaixe.</>,
      acao: 'Confirmar pela agenda', to: '/agenda',
    });

    if (k.vencidos.length) {
      const pot = k.vencidos.length * cfg.precos.Retorno;
      const top = k.vencidos.sort((a, b) => (a[1].diasSemConsulta ?? 0) - (b[1].diasSemConsulta ?? 0)).slice(0, 3).map(([id]) => primeiroNome(nome(id)));
      out.push({
        tone: 'risk', icon: <Users size={16} />, peso: 90,
        titulo: `${k.vencidos.length} pacientes com retorno vencido — ${money(pot)} em consultas não agendadas`,
        texto: <>Passaram de {cfg.retornoDias} dias sem consulta e não têm retorno marcado. Os mais recentes ({top.join(', ')}) têm maior chance de voltar se contatados agora.</>,
        acao: 'Ver lista e enviar convite', to: '/pacientes?status=Retorno vencido',
      });
    }

    // Platô: pacientes de emagrecimento em acompanhamento sem perda nas duas últimas avaliações
    const plato = db.pacientes.filter((p) => {
      if (p.objetivo !== 'Emagrecimento' || resumo.get(p.id)?.status !== 'Em acompanhamento') return false;
      const ev = evolucao(db.avaliacoes.filter((a) => a.pacienteId === p.id));
      return ev.ord.length >= 3 && ev.deltaUltima !== null && ev.deltaUltima > -0.3;
    });
    if (plato.length) out.push({
      tone: 'warn', icon: <Scale size={16} />, peso: 70,
      titulo: `${plato.length} paciente(s) de emagrecimento sem perda de peso na última avaliação`,
      texto: <>Platô é o momento de maior risco de desistência. Revise o plano alimentar antes do próximo retorno: {plato.slice(0, 3).map((p) => primeiroNome(p.nome)).join(', ')}{plato.length > 3 ? '…' : ''}.</>,
      acao: 'Abrir pacientes', to: '/pacientes?status=Em acompanhamento',
    });

    if (k.ocup7.horasLivres >= 6) {
      const encaixes = Math.floor((k.ocup7.horasLivres * 60) / cfg.duracoes.Retorno);
      out.push({
        tone: 'opp', icon: <CalendarDays size={16} />, peso: k.vencidos.length ? 80 : 50,
        titulo: `${int(Math.round(k.ocup7.horasLivres))} h livres na agenda dos próximos 7 dias (ocupação ${pct(k.ocup7.taxa)})`,
        texto: <>Cabem até {encaixes} retornos. {k.vencidos.length ? <>Ofereça esses horários aos {k.vencidos.length} pacientes com retorno vencido — potencial de até {money(Math.min(encaixes, k.vencidos.length) * cfg.precos.Retorno)}.</> : 'Avalie campanha para novos pacientes ou parceria com academias.'}</>,
        acao: 'Ver agenda', to: '/agenda',
      });
    }

    if (k.at.realizadas + k.at.faltas >= 8 && k.at.noShow > 0.1) out.push({
      tone: 'risk', icon: <AlertTriangle size={16} />, peso: 75,
      titulo: `Faltas em ${pct(k.at.noShow)} das consultas do mês (${k.at.faltas})`,
      texto: <>Acima da referência de 10%. Impacto estimado de {money(k.valorFaltas)} em horários perdidos. Confirme 24 h antes e combine política de remarcação/cobrança em caso de falta sem aviso.</>,
      acao: 'Ver faltas na agenda', to: '/agenda',
    });

    const receberTotal = k.receber.reduce((s, r) => s + r.valor, 0);
    if (receberTotal > 0) out.push({
      tone: 'warn', icon: <Wallet size={16} />, peso: 60,
      titulo: `${money(receberTotal)} a receber (${k.receber.length} pendência(s))`,
      texto: <>Pendência mais antiga desde {date(k.receber[0].data)}. Cobrar logo após a consulta reduz inadimplência.</>,
      acao: 'Ir para o financeiro', to: '/financeiro',
    });

    // Projeção x meta
    const gap = cfg.metaMensal - k.projecao;
    if (gap > 0) out.push({
      tone: 'opp', icon: <TrendingUp size={16} />, peso: 65,
      titulo: `Projeção do mês: ${money(k.projecao)} — faltam ${money(gap)} para a meta`,
      texto: <>Equivale a cerca de {Math.ceil(gap / cfg.precos.Retorno)} retornos ou {Math.ceil(gap / cfg.precos['Primeira consulta'])} primeiras consultas. A alavanca mais barata é recuperar retornos vencidos.</>,
      acao: 'Ver pacientes', to: '/pacientes?status=Retorno vencido',
    });
    else out.push({
      tone: 'good', icon: <CheckCircle2 size={16} />, peso: 30,
      titulo: `Projeção do mês (${money(k.projecao)}) acima da meta de ${money(cfg.metaMensal)}`,
      texto: <>Considera o realizado e as consultas agendadas, descontando a taxa de faltas dos últimos 90 dias.</>,
      acao: 'Ver financeiro', to: '/financeiro',
    });

    // Canal com melhor e pior retenção
    const canais = porCanal(db, resumo, addDays(hoje, -365), hoje, ORIGENS).filter((c) => c.pacientes >= 4);
    if (canais.length >= 2) {
      const ord = [...canais].sort((a, b) => b.ltv - a.ltv);
      const melhor = ord[0], pior = ord[ord.length - 1];
      if (melhor.ltv > pior.ltv * 1.3) out.push({
        tone: 'opp', icon: <UserPlus size={16} />, peso: 40,
        titulo: `Pacientes vindos de ${melhor.origem} valem ${(melhor.ltv / pior.ltv).toFixed(1).replace('.', ',')}× os de ${pior.origem}`,
        texto: <>Receita média por paciente: {money(melhor.ltv)} × {money(pior.ltv)}. Direcione esforço de captação para o canal que retém mais.</>,
        acao: 'Analisar captação', to: '/captacao',
      });
    }
    return out.sort((a, b) => b.peso - a.peso).slice(0, 6);
  }, [db, resumo, k, hoje, cfg]);

  const serie = useMemo(() => lastMonths(6).map((m) => {
    const de = `${m}-01`, ate = fimMes(de);
    const f = faturamento(db, de, ate > hoje ? hoje : ate);
    return { mes: monthLabel(m), Consultas: f.total - f.porFonte.Pacotes - f.porFonte['Outras receitas'], Pacotes: f.porFonte.Pacotes, Outras: f.porFonte['Outras receitas'] };
  }), [db, hoje]);

  const agendaHoje = db.consultas.filter((c) => c.data === hoje && c.status !== 'Cancelada').sort((a, b) => a.hora.localeCompare(b.hora));
  const pac = (id: string) => db.pacientes.find((p) => p.id === id);
  const metaPct = cfg.metaMensal ? k.fat.total / cfg.metaMensal : 0;
  const h = parseDate(hoje);
  const saudacao = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <PageHeader title={`${saudacao}, ${primeiroNome(cfg.nome.replace(/^Dra?\.\s*/, ''))}`} subtitle={`${DIAS_SEMANA[h.getDay()]}, ${date(hoje)} · comparações com o mesmo número de dias do mês anterior`}>
        <button className="btn" onClick={() => setModal('paciente')}><UserPlus size={16} /> Novo paciente</button>
        <button className="btn btn-primary" onClick={() => setModal('consulta')}><Plus size={16} /> Nova consulta</button>
      </PageHeader>

      <div className="grid kpis">
        <Kpi icon={<DollarSign size={20} />} tone="green" label="Faturamento do mês" value={moneyShort(k.fat.total)}
          foot={<><Trend value={variation(k.fat.total, k.fatAnt.total)} /> vs. {moneyShort(k.fatAnt.total)}</>}>
          <div className="meter"><span style={{ width: `${Math.min(100, metaPct * 100)}%` }} /></div>
          <div className="kpi-foot" style={{ marginTop: 6 }}>{pct(metaPct)} da meta · projeção {moneyShort(k.projecao)}</div>
        </Kpi>
        <Kpi icon={<CalendarCheck size={20} />} tone="blue" label="Consultas realizadas" value={int(k.at.realizadas)}
          foot={<><Trend value={variation(k.at.realizadas, k.atAnt.realizadas)} /> · {k.at.primeiras} primeiras · ticket {money(k.ticket)}</>} />
        <Kpi icon={<AlertTriangle size={20} />} tone={k.at.noShow > 0.1 ? 'red' : 'orange'} label="Taxa de faltas (mês)" value={pct(k.at.noShow, 1)}
          foot={<><Trend value={k.atAnt.noShow ? k.at.noShow - k.atAnt.noShow : null} invert suffix="p.p." /> · {money(k.valorFaltas)} em horários perdidos</>} />
        <Kpi icon={<Users size={20} />} tone="purple" label="Pacientes em acompanhamento" value={int(k.ativos)}
          foot={<>{k.vencidos.length} com retorno vencido · retorno {pct(k.ret.taxa)}</>} />
      </div>

      <div className="grid g-3-2 mt">
        <div className="card">
          <div className="card-head"><div><h3>Onde agir agora</h3><div className="card-sub">Alertas gerados a partir da agenda, prontuários e financeiro — ordenados por impacto</div></div></div>
          <div className="insights">
            {insights.map((i) => (
              <div key={i.titulo} className={`insight ${i.tone}`}>
                <div className={`ico tone-${i.tone === 'risk' ? 'red' : i.tone === 'warn' ? 'orange' : i.tone === 'good' ? 'green' : 'blue'}`}>{i.icon}</div>
                <div>
                  <div className="t">{i.titulo}</div>
                  <div className="d">{i.texto}</div>
                  <Link className="a" to={i.to}>{i.acao} <ArrowRight size={13} /></Link>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3>Agenda de hoje</h3><div className="card-sub">{agendaHoje.length} atendimento(s)</div></div><Link className="link" to="/agenda">Abrir agenda</Link></div>
          {agendaHoje.length === 0 ? <div className="empty">Nenhuma consulta hoje. Use o tempo para contatar pacientes com retorno vencido.</div> : (
            <ul className="list">
              {agendaHoje.map((c) => {
                const p = pac(c.pacienteId);
                return (
                  <li key={c.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/pacientes/${c.pacienteId}`)}>
                    <span className="time">{c.hora}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="title">{p?.nome}</div>
                      <div className="desc">{c.tipo} · {p?.objetivo}</div>
                    </div>
                    {c.status === 'Agendada' && p
                      ? <a className="btn btn-sm wa" href={linkWhatsApp(p.telefone, `Olá, ${primeiroNome(p.nome)}! Confirmando sua consulta hoje às ${c.hora}. Posso confirmar?`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><MessageCircle size={14} /> Confirmar</a>
                      : <Badge>{c.status}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="divider" style={{ margin: '0 20px' }} />
          <div className="stat-mini" style={{ padding: 16, gridTemplateColumns: '1fr 1fr' }}>
            <div><span>Ocupação próximos 7 dias</span><b>{pct(k.ocup7.taxa)}</b></div>
            <div><span>A receber</span><b>{moneyShort(k.receber.reduce((s, r) => s + r.valor, 0))}</b></div>
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-head"><div><h3>Faturamento — últimos 6 meses</h3><div className="card-sub">Consultas avulsas, pacotes vendidos e outras receitas · linha = meta mensal</div></div></div>
        <div className="chart-box" style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={serie} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e4e9f1" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => moneyShort(Number(v))} width={78} />
              <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: 'rgba(15,138,99,.06)' }} />
              <ReferenceLine y={cfg.metaMensal} stroke="#d97706" strokeDasharray="4 4" />
              <Bar dataKey="Consultas" stackId="a" fill="#0f8a63" />
              <Bar dataKey="Pacotes" stackId="a" fill="#5cc49b" />
              <Bar dataKey="Outras" stackId="a" fill="#b9e6d3" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="legend" style={{ padding: '0 20px 16px' }}>
          <span><i style={{ background: '#0f8a63' }} />Consultas</span><span><i style={{ background: '#5cc49b' }} />Pacotes</span><span><i style={{ background: '#b9e6d3' }} />Outras receitas</span><span><i style={{ background: '#d97706' }} />Meta</span>
        </div>
      </div>

      {modal === 'consulta' && <ConsultaModal onClose={() => setModal(null)} />}
      {modal === 'paciente' && <PacienteModal onClose={() => setModal(null)} onSaved={(id) => nav(`/pacientes/${id}`)} />}
    </>
  );
}
