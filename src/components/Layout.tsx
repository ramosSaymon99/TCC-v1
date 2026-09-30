import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, BarChart3, CalendarDays, ClipboardList, DollarSign, FileText, Filter, Home, LogOut, Menu,
  Monitor, Settings, UserCog, Users, Wrench,
} from 'lucide-react';
import { useStore } from '../store/Store';
import type { Modulo } from '../types';
import { Avatar, Logo } from './ui';
import { today } from '../utils/format';
import { ABERTAS } from '../utils/metrics';

const NAV: { to: string; label: string; icon: ReactNode; mod: Modulo }[] = [
  { to: '/', label: 'Início', icon: <Home size={18} />, mod: 'inicio' },
  { to: '/clientes', label: 'Clientes', icon: <Users size={18} />, mod: 'clientes' },
  { to: '/orcamentos', label: 'Orçamentos', icon: <FileText size={18} />, mod: 'orcamentos' },
  { to: '/funil', label: 'Funil Comercial', icon: <Filter size={18} />, mod: 'funil' },
  { to: '/ordens', label: 'Ordens de Serviço', icon: <Wrench size={18} />, mod: 'ordens' },
  { to: '/equipamentos', label: 'Equipamentos', icon: <Monitor size={18} />, mod: 'equipamentos' },
  { to: '/agenda', label: 'Agenda', icon: <CalendarDays size={18} />, mod: 'agenda' },
  { to: '/financeiro', label: 'Financeiro', icon: <DollarSign size={18} />, mod: 'financeiro' },
  { to: '/relatorios', label: 'Relatórios', icon: <BarChart3 size={18} />, mod: 'relatorios' },
  { to: '/usuarios', label: 'Usuários', icon: <UserCog size={18} />, mod: 'usuarios' },
  { to: '/configuracoes', label: 'Configurações', icon: <Settings size={18} />, mod: 'configuracoes' },
];

export default function Layout() {
  const { user, logout, can, db } = useStore();
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  const hoje = today();
  const atrasadas = db.ordens.filter((o) => (ABERTAS as readonly string[]).includes(o.status) && o.prazo < hoje).length;
  const tarefasHoje = db.tarefas.filter((t) => t.data <= hoje && !t.concluida).length;
  const abertas = db.ordens.filter((o) => (ABERTAS as readonly string[]).includes(o.status)).length;
  const alerts = [
    atrasadas && { text: `${atrasadas} OS com prazo vencido`, to: '/ordens?filtro=atrasadas' },
    tarefasHoje && { text: `${tarefasHoje} tarefa(s) pendente(s) para hoje`, to: '/agenda' },
  ].filter(Boolean) as { text: string; to: string }[];

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">TechGest</div>
            <div className="brand-sub">Gestão Comercial</div>
          </div>
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {NAV.filter((n) => can(n.mod)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              {n.icon}{n.label}
              {n.mod === 'ordens' && abertas > 0 && <span className="count">{abertas}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="btn btn-ghost btn-sm" style={{ color: '#c9d6ee', width: '100%', justifyContent: 'flex-start' }} onClick={() => { logout(); nav('/login'); }}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={20} /></button>
          <div className="grow" />
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setNotif((v) => !v)} aria-label="Notificações">
              <Bell size={19} />
              {alerts.length > 0 && <span style={{ position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 8, background: 'var(--danger)' }} />}
            </button>
            {notif && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 280, zIndex: 50, boxShadow: 'var(--shadow-lg)' }}>
                <div className="card-head" style={{ paddingBottom: 8 }}><h3>Alertas</h3></div>
                {alerts.length === 0 && <div className="empty" style={{ padding: 20 }}>Nenhum alerta no momento.</div>}
                <ul className="list">
                  {alerts.map((a) => (
                    <li key={a.text} style={{ cursor: 'pointer' }} onClick={() => { setNotif(false); nav(a.to); }}>
                      <ClipboardList size={16} color="var(--danger)" /><span className="small">{a.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {user && (
            <div className="person" style={{ paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
              <Avatar nome={user.nome} navy />
              <div className="hide-sm">
                <div className="name">{user.nome}</div>
                <div className="meta">{user.perfil}{user.perfil === 'Proprietário' ? ' (MEI)' : ''}</div>
              </div>
            </div>
          )}
        </header>
        <main className="content" key={loc.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
