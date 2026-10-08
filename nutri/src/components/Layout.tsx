import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Apple, Bell, Calculator, CalendarDays, DollarSign, Home, Megaphone, Menu, Settings, Users, AlertCircle } from 'lucide-react';
import { useStore } from '../store/Store';
import { Avatar, Logo } from './ui';
import { addDays, normalize, today } from '../utils/format';
import { aReceber, ABERTAS } from '../utils/metrics';

const NAV = [
  { itens: [{ to: '/', label: 'Início', icon: <Home size={18} /> }] },
  { secao: 'Atendimento', itens: [
    { to: '/agenda', label: 'Agenda', icon: <CalendarDays size={18} /> },
    { to: '/pacientes', label: 'Pacientes', icon: <Users size={18} /> },
  ] },
  { secao: 'Clínico', itens: [
    { to: '/alimentos', label: 'Alimentos', icon: <Apple size={18} /> },
    { to: '/calculadoras', label: 'Calculadoras', icon: <Calculator size={18} /> },
  ] },
  { secao: 'Gestão', itens: [
    { to: '/financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
    { to: '/captacao', label: 'Captação e retenção', icon: <Megaphone size={18} /> },
    { to: '/configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
  ] },
];

function BuscaPaciente() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const res = useMemo(() => {
    const t = normalize(q.trim());
    if (t.length < 2) return [];
    return db.pacientes.filter((p) => normalize(p.nome).includes(t) || p.telefone.replace(/\D/g, '').includes(t.replace(/\D/g, '') || '§')).slice(0, 6);
  }, [q, db.pacientes]);
  return (
    <div className="search" style={{ maxWidth: 380, position: 'relative' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input className="input" placeholder="Buscar paciente por nome ou telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <div className="card" style={{ position: 'absolute', top: 40, left: 0, right: 0, zIndex: 60, boxShadow: 'var(--shadow-lg)', padding: 6 }}>
          {res.map((p) => (
            <button key={p.id} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', height: 'auto', padding: 8 }} onClick={() => { setQ(''); nav(`/pacientes/${p.id}`); }}>
              <div className="person"><Avatar nome={p.nome} /><div style={{ textAlign: 'left' }}><div className="name">{p.nome}</div><div className="meta">{p.objetivo} · {p.telefone}</div></div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { db, resumo } = useStore();
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  const hoje = today();
  const amanha = addDays(hoje, 1);
  const semConfirmar = db.consultas.filter((c) => c.status === 'Agendada' && (c.data === hoje || c.data === amanha)).length;
  const receber = aReceber(db).length;
  const vencidos = [...resumo.values()].filter((r) => r.status === 'Retorno vencido').length;
  const hojeN = db.consultas.filter((c) => c.data === hoje && (ABERTAS(c) || c.status === 'Realizada')).length;
  const alerts = [
    semConfirmar && { text: `${semConfirmar} consulta(s) de hoje/amanhã sem confirmação`, to: '/agenda' },
    vencidos && { text: `${vencidos} paciente(s) com retorno vencido`, to: '/pacientes?status=Retorno vencido' },
    receber && { text: `${receber} pagamento(s) pendente(s)`, to: '/financeiro' },
  ].filter(Boolean) as { text: string; to: string }[];

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">NutriGest</div>
            <div className="brand-sub">Consultório de Nutrição</div>
          </div>
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {NAV.map((g) => (
            <div key={g.secao ?? 'inicio'} style={{ display: 'contents' }}>
              {g.secao && <div className="nav-section">{g.secao}</div>}
              {g.itens.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                  {n.icon}{n.label}
                  {n.to === '/agenda' && hojeN > 0 && <span className="count">{hojeN}</span>}
                  {n.to === '/pacientes' && vencidos > 0 && <span className="count" style={{ background: 'var(--warning)' }}>{vencidos}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">Dados salvos neste navegador · faça backup em Configurações</div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={20} /></button>
          <BuscaPaciente />
          <div className="grow" />
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setNotif((v) => !v)} aria-label="Alertas">
              <Bell size={19} />
              {alerts.length > 0 && <span style={{ position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 8, background: 'var(--danger)' }} />}
            </button>
            {notif && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 300, zIndex: 50, boxShadow: 'var(--shadow-lg)' }}>
                <div className="card-head" style={{ paddingBottom: 8 }}><h3>Alertas</h3></div>
                {alerts.length === 0 && <div className="empty" style={{ padding: 20 }}>Nenhum alerta no momento.</div>}
                <ul className="list">
                  {alerts.map((a) => (
                    <li key={a.text} style={{ cursor: 'pointer' }} onClick={() => { setNotif(false); nav(a.to); }}>
                      <AlertCircle size={16} color="var(--warning)" /><span className="small">{a.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="person" style={{ paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
            <Avatar nome={db.config.nome.replace(/^Dra?\.\s*/, '')} navy />
            <div className="hide-sm">
              <div className="name">{db.config.nome}</div>
              <div className="meta">{db.config.crn}</div>
            </div>
          </div>
        </header>
        <main className="content" key={loc.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
