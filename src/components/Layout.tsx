import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, BarChart3, Boxes, Building2, CalendarDays, ChevronDown, ClipboardList, DollarSign, FileText, Filter, GraduationCap, Home, Layers, LayoutDashboard,
  Lock, LogOut, Menu, Megaphone, Monitor, Receipt, Repeat, Settings, Tag, Target, UserCog, Users, Wrench,
} from 'lucide-react';
import { BuscaGlobal } from './BuscaGlobal';
import { useStore } from '../store/Store';
import type { Modulo } from '../types';
import { Avatar, Logo } from './ui';
import { addDays, date, diffDays, money, today } from '../utils/format';
import { ABERTAS } from '../utils/metrics';

type NavItem = { to: string; label: string; icon: ReactNode; mod: Modulo };
const NAV: { secao?: string; itens: NavItem[] }[] = [
  { itens: [{ to: '/', label: 'Início', icon: <Home size={18} />, mod: 'inicio' }] },
  { secao: 'Comercial', itens: [
    { to: '/clientes', label: 'Clientes', icon: <Users size={18} />, mod: 'clientes' },
    { to: '/orcamentos', label: 'Orçamentos', icon: <FileText size={18} />, mod: 'orcamentos' },
    { to: '/funil', label: 'Funil Comercial', icon: <Filter size={18} />, mod: 'funil' },
    { to: '/contratos', label: 'Contratos', icon: <Repeat size={18} />, mod: 'contratos' },
    { to: '/social', label: 'Social Media', icon: <Megaphone size={18} />, mod: 'social' },
  ] },
  { secao: 'Operação', itens: [
    { to: '/ordens', label: 'Ordens de Serviço', icon: <Wrench size={18} />, mod: 'ordens' },
    { to: '/equipamentos', label: 'Equipamentos', icon: <Monitor size={18} />, mod: 'equipamentos' },
    { to: '/estoque', label: 'Estoque de Peças', icon: <Boxes size={18} />, mod: 'estoque' },
    { to: '/treinamentos', label: 'Treinamentos', icon: <GraduationCap size={18} />, mod: 'treinamentos' },
    { to: '/agenda', label: 'Agenda', icon: <CalendarDays size={18} />, mod: 'agenda' },
  ] },
  { secao: 'Gestão', itens: [
    { to: '/financeiro', label: 'Financeiro', icon: <DollarSign size={18} />, mod: 'financeiro' },
    { to: '/relatorios', label: 'Relatórios', icon: <BarChart3 size={18} />, mod: 'relatorios' },
    { to: '/planejamento', label: 'Planejamento', icon: <Target size={18} />, mod: 'planejamento' },
    { to: '/servicos', label: 'Serviços e Preços', icon: <Tag size={18} />, mod: 'servicos' },
  ] },
  { secao: 'Sistema', itens: [
    { to: '/usuarios', label: 'Usuários', icon: <UserCog size={18} />, mod: 'usuarios' },
    { to: '/configuracoes', label: 'Configurações', icon: <Settings size={18} />, mod: 'configuracoes' },
  ] },
];

const FECHADAS_KEY = 'techgest:nav-fechadas:v1';
const lerFechadas = (): string[] | null => {
  try { const v = localStorage.getItem(FECHADAS_KEY); return v ? JSON.parse(v) as string[] : null; } catch { return null; }
};

/** Cabeçalho de seção recolhível; recolhida, mostra o total de alertas dos itens para nada ficar escondido. */
function Secao({ titulo, aberta, alerta, perigo, onToggle }: { titulo: string; aberta: boolean; alerta?: number; perigo?: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`nav-section nav-toggle ${aberta ? 'aberta' : ''}`} aria-expanded={aberta}
      onClick={(e) => { e.stopPropagation(); onToggle(); }} title={aberta ? 'Recolher' : 'Expandir'}>
      <span>{titulo}</span>
      {!aberta && !!alerta && <span className="count" style={perigo ? { background: 'var(--danger)' } : undefined}>{alerta}</span>}
      <ChevronDown size={14} className="chev" />
    </button>
  );
}

const NAV_PLATAFORMA = [
  { to: '/console', label: 'Visão da plataforma', icon: <LayoutDashboard size={18} /> },
  { to: '/console/assinantes', label: 'Empresas assinantes', icon: <Building2 size={18} /> },
  { to: '/console/planos', label: 'Planos e preços', icon: <Layers size={18} /> },
  { to: '/console/faturas', label: 'Faturamento SaaS', icon: <Receipt size={18} /> },
];

export default function Layout() {
  const { user, logout, can, liberado, db, assinatura, adminPlataforma } = useStore();
  // Proprietário vê os módulos fora do plano com cadeado (vitrine de upgrade); demais perfis só o que podem usar
  const visivel = (m: Modulo) => can(m) || (user?.perfil === 'Proprietário' && !liberado(m));
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  // Seções recolhidas (lembradas no navegador). Primeiro acesso: só a seção da página atual fica aberta.
  const [fechadas, setFechadas] = useState<string[] | null>(lerFechadas);
  const ativa = (to: string) => (to === '/' ? false : loc.pathname === to || loc.pathname.startsWith(`${to}/`));
  const secaoAtual = [...NAV.filter((g) => g.secao).map((g) => ({ s: g.secao!, tos: g.itens.map((i) => i.to) })), { s: 'Plataforma SaaS', tos: NAV_PLATAFORMA.map((i) => i.to) }]
    .find((g) => g.tos.some(ativa))?.s;
  const todas = [...NAV.filter((g) => g.secao).map((g) => g.secao!), 'Plataforma SaaS'];
  const fechadasEf = fechadas ?? todas.filter((s) => s !== secaoAtual);
  const aberta = (s: string) => !fechadasEf.includes(s);
  const alternar = (s: string) => {
    const prox = aberta(s) ? [...fechadasEf, s] : fechadasEf.filter((x) => x !== s);
    setFechadas(prox);
    try { localStorage.setItem(FECHADAS_KEY, JSON.stringify(prox)); } catch { /* armazenamento indisponível */ }
  };

  const hoje = today();
  const atrasadas = db.ordens.filter((o) => (ABERTAS as readonly string[]).includes(o.status) && o.prazo < hoje).length;
  const tarefasHoje = db.tarefas.filter((t) => t.data <= hoje && !t.concluida).length;
  const abertas = db.ordens.filter((o) => (ABERTAS as readonly string[]).includes(o.status)).length;
  const baixos = db.pecas.filter((p) => p.quantidade < p.minimo).length;
  const renovar = db.contratos.filter((c) => c.status === 'Ativo' && c.renovacao <= addDays(hoje, 30)).length;
  const alerts = [
    atrasadas && { text: `${atrasadas} OS com prazo vencido`, to: '/ordens?filtro=atrasadas' },
    tarefasHoje && { text: `${tarefasHoje} tarefa(s) pendente(s) para hoje`, to: '/agenda' },
    baixos && { text: `${baixos} peça(s) abaixo do estoque mínimo`, to: '/estoque' },
    renovar && { text: `${renovar} contrato(s) para renovar em 30 dias`, to: '/contratos' },
  ].filter(Boolean) as { text: string; to: string }[];

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">Pivot Hub</div>
            <div className="brand-sub">Gestão Comercial</div>
          </div>
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {NAV.map((g) => {
            const itens = g.itens.filter((n) => visivel(n.mod));
            if (!itens.length) return null;
            const alertaOrdens = itens.some((n) => n.mod === 'ordens') ? abertas : 0;
            const alertaEstoque = itens.some((n) => n.mod === 'estoque') ? baixos : 0;
            const mostrar = !g.secao || aberta(g.secao);
            return (
              <div key={g.secao ?? 'inicio'} style={{ display: 'contents' }}>
                {g.secao && <Secao titulo={g.secao} aberta={mostrar} alerta={alertaOrdens + alertaEstoque} perigo={alertaEstoque > 0} onToggle={() => alternar(g.secao!)} />}
                {/* recolhida: continua mostrando a página aberta, para não perder a referência */}
                {itens.filter((n) => mostrar || ativa(n.to)).map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'} className={liberado(n.mod) ? undefined : 'locked'} title={liberado(n.mod) ? undefined : 'Fora do seu plano'}>
                    {n.icon}{n.label}{!liberado(n.mod) && <Lock size={13} className="lock" />}
                    {n.mod === 'ordens' && abertas > 0 && <span className="count">{abertas}</span>}
                    {n.mod === 'estoque' && baixos > 0 && <span className="count" style={{ background: 'var(--danger)' }}>{baixos}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
          {adminPlataforma && (
            <>
              <Secao titulo="Plataforma SaaS" aberta={aberta('Plataforma SaaS')} onToggle={() => alternar('Plataforma SaaS')} />
              {NAV_PLATAFORMA.filter((n) => aberta('Plataforma SaaS') || ativa(n.to)).map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/console'}>{n.icon}{n.label}</NavLink>)}
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <button className="btn btn-ghost btn-sm" style={{ color: '#c9d6ee', width: '100%', justifyContent: 'flex-start' }} onClick={() => { logout(); nav('/login'); }}>
            <LogOut size={16} /> Sair
          </button>
          <div className="assinatura-sistema">Powered by <span>Kaivo</span></div>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={20} /></button>
          <BuscaGlobal />
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
                <div className="meta">{user.perfil}{assinatura && !assinatura.principal ? ` · Plano ${assinatura.plano}` : adminPlataforma ? ' · Admin da plataforma' : ''}</div>
              </div>
            </div>
          )}
        </header>
        <main className="content" key={loc.pathname}>
          <AvisoAssinatura />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Avisos da assinatura da empresa: teste grátis acabando e fatura em atraso. */
function AvisoAssinatura() {
  const { assinatura, user } = useStore();
  if (!assinatura || assinatura.principal) return null;
  const dono = user?.perfil === 'Proprietário';
  if (assinatura.status === 'Trial' && assinatura.trialFim) {
    const dias = diffDays(assinatura.trialFim, today());
    return (
      <div className={`insight ${dias <= 3 ? 'warn' : 'opp'}`} style={{ marginBottom: 16 }}>
        <div className="d"><strong>Teste grátis do plano {assinatura.plano}:</strong> {dias > 0 ? `faltam ${dias} dia(s) (até ${date(assinatura.trialFim)}).` : 'termina hoje.'}{dono ? ' Fale com o comercial Pivot Hub para contratar e manter seus dados.' : ''}</div>
      </div>
    );
  }
  const f = assinatura.faturaAberta;
  const pagar = f?.link && <a className="btn btn-sm btn-primary" href={f.link} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Pagar agora</a>;
  if (dono && (assinatura.status === 'Inadimplente' || f?.vencida)) {
    return (
      <div className="insight risk row" style={{ marginBottom: 16 }}>
        <div className="d"><strong>Mensalidade em atraso{f ? ` (${money(f.valor)}, venceu em ${date(f.vencimento)})` : ''}.</strong> Regularize para evitar a suspensão do acesso da equipe. A baixa é automática após o pagamento.</div>
        {pagar}
      </div>
    );
  }
  if (dono && f?.link && diffDays(f.vencimento, today()) <= 5) {
    return (
      <div className="insight opp row" style={{ marginBottom: 16 }}>
        <div className="d"><strong>Sua mensalidade de {money(f.valor)} vence em {date(f.vencimento)}.</strong> Pague por Pix, boleto ou cartão pelo link seguro do Asaas.</div>
        {pagar}
      </div>
    );
  }
  return null;
}
