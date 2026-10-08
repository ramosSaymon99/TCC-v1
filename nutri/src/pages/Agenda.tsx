import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, MessageCircle, Plus, UserX, XCircle, Pencil, Wallet } from 'lucide-react';
import { useStore } from '../store/Store';
import { Badge, Empty, PageHeader, RowMenu } from '../components/ui';
import { ConsultaModal } from '../components/modais';
import type { Consulta } from '../types';
import { addDays, date, DIAS_SEMANA, money, parseDate, pct, today } from '../utils/format';
import { contarAtendimentos, linkWhatsApp, ocupacao, primeiroNome } from '../utils/metrics';

const EV: Record<Consulta['tipo'], string> = { 'Primeira consulta': 'ev-primeira', 'Retorno': 'ev-retorno', 'Online': 'ev-online', 'Bioimpedância': 'ev-bio' };

const inicioSemana = (iso: string) => addDays(iso, -((parseDate(iso).getDay() + 6) % 7));

export default function Agenda() {
  const { db, upsert, toast } = useStore();
  const nav = useNavigate();
  const hoje = today();
  const [view, setView] = useState<'dia' | 'semana'>('dia');
  const [ref, setRef] = useState(hoje);
  const [modal, setModal] = useState<{ c?: Consulta; data?: string } | null>(null);

  const de = view === 'dia' ? ref : inicioSemana(ref);
  const ate = view === 'dia' ? ref : addDays(de, 6);
  const dias = useMemo(() => {
    const out: string[] = [];
    for (let d = de; d <= ate; d = addDays(d, 1)) {
      const w = parseDate(d).getDay();
      if (view === 'dia' || (w >= 1 && w <= Math.max(5, db.config.diasSemana))) out.push(d);
    }
    return out;
  }, [de, ate, view, db.config.diasSemana]);

  const doPeriodo = db.consultas.filter((c) => c.data >= de && c.data <= ate).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const occ = ocupacao(db, de, ate);
  const cont = contarAtendimentos(db, de, ate);
  const previsto = doPeriodo.filter((c) => c.status !== 'Cancelada' && c.status !== 'Faltou').reduce((s, c) => s + c.valor, 0);
  const semConfirmar = db.consultas.filter((c) => c.status === 'Agendada' && c.data >= hoje && c.data <= addDays(hoje, 2)).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  const pac = (id: string) => db.pacientes.find((p) => p.id === id);

  const mudar = (c: Consulta, status: Consulta['status'], extra: Partial<Consulta> = {}) => {
    upsert('consultas', { ...c, status, ...extra });
    toast(`Consulta marcada como ${status.toLowerCase()}.`);
  };
  const andar = (n: number) => setRef(addDays(ref, view === 'dia' ? n : n * 7));

  const acoes = (c: Consulta) => [
    { label: <><CheckCircle2 size={14} /> Confirmar</>, onClick: () => mudar(c, 'Confirmada'), hidden: c.status !== 'Agendada' },
    { label: <><CheckCircle2 size={14} /> Marcar como realizada</>, onClick: () => mudar(c, 'Realizada'), hidden: c.status === 'Realizada' },
    { label: <><Wallet size={14} /> Realizada e paga</>, onClick: () => mudar(c, 'Realizada', { pago: true }), hidden: c.status === 'Realizada' || c.pago },
    { label: <><Wallet size={14} /> Registrar pagamento</>, onClick: () => { upsert('consultas', { ...c, pago: true }); toast('Pagamento registrado.'); }, hidden: c.status !== 'Realizada' || c.pago || c.valor === 0 },
    { label: <><UserX size={14} /> Paciente faltou</>, onClick: () => mudar(c, 'Faltou'), hidden: c.status === 'Faltou' || c.status === 'Realizada' },
    { label: <><Pencil size={14} /> Editar / remarcar</>, onClick: () => setModal({ c }) },
    { label: <><XCircle size={14} /> Cancelar</>, onClick: () => mudar(c, 'Cancelada'), danger: true, hidden: c.status === 'Cancelada' || c.status === 'Realizada' },
  ];

  const Evento = ({ c, compacto }: { c: Consulta; compacto?: boolean }) => {
    const p = pac(c.pacienteId);
    const off = c.status === 'Cancelada' || c.status === 'Faltou';
    if (compacto) return (
      <div className={`mini ${EV[c.tipo]} ${off ? 'ev-off' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setModal({ c })}>
        <b>{c.hora}</b> {p ? primeiroNome(p.nome) : '—'}<div className="muted">{c.tipo}{c.status !== 'Agendada' ? ` · ${c.status}` : ''}</div>
      </div>
    );
    return (
      <div className={`event ${EV[c.tipo]} ${off ? 'ev-off' : ''}`}>
        <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => nav(`/pacientes/${c.pacienteId}`)}>
          <div className="t">{p?.nome ?? '—'}</div>
          <div className="s">{c.tipo} · {c.duracao} min · {c.pacoteId ? 'pacote' : money(c.valor)}{c.status === 'Realizada' && c.valor > 0 && !c.pago ? ' · pagamento pendente' : ''}</div>
          {c.obs && <div className="s">{c.obs}</div>}
        </div>
        <div className="row">
          {c.status === 'Agendada' && p && (
            <a className="btn btn-sm wa" href={linkWhatsApp(p.telefone, `Olá, ${primeiroNome(p.nome)}! Passando para confirmar sua consulta ${c.data === hoje ? 'hoje' : `em ${date(c.data)}`} às ${c.hora}. Posso confirmar?`)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
          )}
          <Badge>{c.status}</Badge>
          <RowMenu actions={acoes(c)} />
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Agenda" subtitle="Consultas, confirmações e ocupação da capacidade de atendimento">
        <div className="seg">
          <button className={view === 'dia' ? 'active' : ''} onClick={() => setView('dia')}>Dia</button>
          <button className={view === 'semana' ? 'active' : ''} onClick={() => setView('semana')}>Semana</button>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ data: view === 'dia' ? ref : hoje })}><Plus size={16} /> Nova consulta</button>
      </PageHeader>

      <div className="drawer-layout">
        <div className="card">
          <div className="toolbar between" style={{ justifyContent: 'space-between' }}>
            <div className="row">
              <button className="btn btn-icon" onClick={() => andar(-1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
              <button className="btn" onClick={() => setRef(hoje)}>Hoje</button>
              <button className="btn btn-icon" onClick={() => andar(1)} aria-label="Próximo"><ChevronRight size={16} /></button>
              <input className="input" type="date" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} style={{ width: 160 }} />
            </div>
            <div className="strong">{view === 'dia' ? `${DIAS_SEMANA[parseDate(ref).getDay()]}, ${date(ref)}` : `${date(de)} a ${date(ate)}`}</div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            {view === 'dia' ? (
              doPeriodo.length === 0 ? <Empty text="Nenhuma consulta neste dia." /> : doPeriodo.map((c) => (
                <div key={c.id} className="agenda-slot"><div className="hr">{c.hora}</div><Evento c={c} /></div>
              ))
            ) : (
              <div className="week" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(130px, 1fr))` }}>
                {dias.map((d) => (
                  <div key={d} className={`day ${d === hoje ? 'today' : ''}`} onDoubleClick={() => setModal({ data: d })}>
                    <h5>{DIAS_SEMANA[parseDate(d).getDay()].slice(0, 3)} · {date(d).slice(0, 5)}</h5>
                    {doPeriodo.filter((c) => c.data === d).map((c) => <Evento key={c.id} c={c} compacto />)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="legend" style={{ padding: '0 20px 16px' }}>
            <span><i style={{ background: 'var(--primary)' }} />Primeira consulta</span>
            <span><i style={{ background: '#2563eb' }} />Retorno</span>
            <span><i style={{ background: 'var(--purple)' }} />Online</span>
            <span><i style={{ background: '#f59e0b' }} />Bioimpedância</span>
            {view === 'semana' && <span className="muted">Dê dois cliques num dia para agendar</span>}
          </div>
        </div>

        <div className="side-panel" style={{ display: 'grid', gap: 16 }}>
          <div className="card card-pad">
            <h3 style={{ fontSize: 14.5 }}>Resumo do período</h3>
            <div className="card-sub">Capacidade: {db.config.horasDia} h/dia · {db.config.diasSemana} dias/semana</div>
            <div className="meter" style={{ height: 8, marginTop: 14 }}><span style={{ width: `${Math.min(100, occ.taxa * 100)}%`, background: occ.taxa > 0.9 ? 'var(--warning)' : undefined }} /></div>
            <div className="row between small" style={{ marginTop: 6 }}><span>Ocupação <b>{pct(occ.taxa)}</b></span><span className="muted">{Math.round(occ.horasLivres)} h livres</span></div>
            <div className="stat-mini" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
              <div><span>Consultas</span><b>{doPeriodo.filter((c) => c.status !== 'Cancelada').length}</b></div>
              <div><span>Receita prevista</span><b>{money(previsto)}</b></div>
              <div><span>Faltas</span><b className={cont.faltas ? 'text-danger' : ''}>{cont.faltas}</b></div>
              <div><span>Canceladas</span><b>{cont.canceladas}</b></div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div><h3>Aguardando confirmação</h3><div className="card-sub">Próximos 2 dias · envie a mensagem e marque como confirmada</div></div></div>
            {semConfirmar.length === 0 ? <div className="empty" style={{ padding: 24 }}>Tudo confirmado.</div> : (
              <ul className="list">
                {semConfirmar.map((c) => {
                  const p = pac(c.pacienteId);
                  return (
                    <li key={c.id}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="title">{p?.nome}</div>
                        <div className="desc">{date(c.data)} às {c.hora} · {c.tipo}</div>
                      </div>
                      {p && <a className="btn btn-icon btn-sm wa" title="Enviar WhatsApp" href={linkWhatsApp(p.telefone, `Olá, ${primeiroNome(p.nome)}! Passando para confirmar sua consulta em ${date(c.data)} às ${c.hora}. Posso confirmar?`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /></a>}
                      <button className="btn btn-sm" onClick={() => mudar(c, 'Confirmada')}>Confirmar</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {modal && <ConsultaModal consulta={modal.c} data={modal.data} onClose={() => setModal(null)} />}
    </>
  );
}
