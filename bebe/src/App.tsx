import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Bell, ChevronDown, Home, LayoutGrid, LogOut, Stethoscope, Users } from 'lucide-react';
import { AppCtx, type Aba, type Ctx } from './ctx';
import { api, ApiError, definirUsuarioAtual, detectarModo, getToken, SEM_REDE, sair as sairApi, sincronizar, temSessao, type Modo } from './lib/api';
import { aplicarPendentes, lerCacheBebe, lerCacheMe, limparCaches, pendentesDoBebe, salvarCacheBebe, salvarCacheMe } from './lib/offline';
import { papel } from './lib/constants';
import { criarFamiliaExemplo } from './lib/seed';
import { addDays, idade, startOfDay } from './lib/time';
import type { Baby, BabyData, BabyEvent, EventType, User } from './types';
import { LogSheet } from './components/LogSheet';
import { Sheet } from './components/ui';
import { Avatar } from './components/Avatar';
import { CentralSheet, ConfigNotificacoes, contarNaoLidas, lerVisto, montarFeed } from './components/Notificacoes';
import { definirBadge, desativarPush, limparSessaoSW, salvarSessaoSW } from './lib/push';
import { RelatorioSheet } from './components/RelatorioSheet';
import { TIPOS } from './lib/constants';
import { Auth } from './pages/Auth';
import { Onboarding } from './pages/Onboarding';
import { Hoje } from './pages/Hoje';
import { Indicadores } from './pages/Indicadores';
import { Mural } from './pages/Mural';
import { Saude } from './pages/Saude';
import { Familia } from './pages/Familia';

const ABAS: { id: Aba; label: string; Icon: typeof Home }[] = [
  { id: 'hoje', label: 'Hoje', Icon: Home },
  { id: 'indicadores', label: 'Indicadores', Icon: BarChart3 },
  { id: 'mural', label: 'Mural', Icon: LayoutGrid },
  { id: 'saude', label: 'Saúde', Icon: Stethoscope },
  { id: 'familia', label: 'Família', Icon: Users },
];
const LS_BABY = 'ninho-baby';
/** Link vindo de uma notificação: ?baby=<id>#aba */
let bebeDaUrl: string | null = new URLSearchParams(location.search).get('baby');
/** Ação vinda de atalho do ícone ou de botão da notificação: ?acao=mamada|sono|fralda|mamadeira|relatorio */
let acaoDaUrl: string | null = new URLSearchParams(location.search).get('acao');
const consumirBebeDaUrl = () => { const b = bebeDaUrl; bebeDaUrl = null; return b; };
const lerAba = (): Aba => (ABAS.some((a) => `#${a.id}` === location.hash) ? (location.hash.slice(1) as Aba) : 'hoje');

export default function App() {
  const [modo, setModo] = useState<Modo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [babies, setBabies] = useState<Baby[]>([]);
  const [babyId, setBabyId] = useState<string | null>(null);
  const [base, setData] = useState<BabyData | null>(null);
  const [filaV, setFilaV] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [aba, setAbaState] = useState<Aba>(lerAba());
  const [agora, setAgora] = useState(Date.now());
  const [registro, setRegistro] = useState<{ tipo: EventType; ev?: BabyEvent } | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [trocar, setTrocar] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; acao?: { label: string; fn: () => void } } | null>(null);
  const [central, setCentral] = useState(false);
  const [configNotif, setConfigNotif] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState(0);
  const conhecidos = useRef<Set<string> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const toastT = useRef<number>();

  const toast = useCallback((texto: string, acao?: { label: string; fn: () => void }) => {
    setMsg({ texto, acao });
    clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setMsg(null), acao ? 6000 : 2800);
  }, []);
  // A tela mostra os dados do servidor + o que está na fila offline
  const data = useMemo(() => (base && user ? aplicarPendentes(base, user.id) : base), [base, user, filaV]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendentes = useMemo(() => (base ? pendentesDoBebe(base.baby.id) : 0), [base, filaV]); // eslint-disable-line react-hooks/exhaustive-deps

  const sair = useCallback(() => {
    desativarPush().catch(() => undefined); // aparelho compartilhado não continua recebendo avisos de outra pessoa
    limparSessaoSW();
    limparCaches();
    sairApi();
    setUser(null); setBabies([]); setData(null); setBabyId(null);
  }, []);

  const reloadMe = useCallback(async (selecionar?: string) => {
    let r: Awaited<ReturnType<typeof api.me>>;
    try {
      r = await api.me();
      salvarCacheMe(r);
    } catch (e) {
      // Sem internet: abre com a última cópia salva
      const c = e instanceof ApiError && e.status === SEM_REDE ? lerCacheMe() : null;
      if (!c) throw e;
      r = c;
    }
    definirUsuarioAtual(r.user.id);
    setUser(r.user);
    salvarSessaoSW(getToken(), r.user.id);
    setBabies(r.babies);
    let alvo = selecionar ?? consumirBebeDaUrl() ?? babyId ?? localStorage.getItem(LS_BABY);
    if (!r.babies.some((b) => b.id === alvo)) alvo = r.babies[0]?.id ?? null;
    setBabyId(alvo);
    if (!alvo) setData(null);
  }, [babyId]);

  const refresh = useCallback(async () => {
    if (!babyId) return;
    const since = addDays(startOfDay(Date.now()), -66);
    try {
      if (navigator.onLine !== false && pendentesDoBebe(babyId)) await sincronizar();
      const d = await api.getBaby(babyId, new Date(since).toISOString());
      salvarCacheBebe(d);
      // Aviso dentro do app quando outro cuidador registra algo enquanto a tela está aberta
      const ids = new Set(d.events.map((e) => e.id));
      if (conhecidos.current && user) {
        const novos = d.events.filter((e) => !conhecidos.current!.has(e.id) && e.user_id !== user.id);
        if (novos.length) {
          const m = d.members.find((x) => x.user_id === novos[0].user_id);
          toast(`${TIPOS[novos[0].type].emoji} ${m?.name.split(' ')[0] ?? 'Alguém'} registrou ${TIPOS[novos[0].type].label.toLowerCase()}${novos.length > 1 ? ` (+${novos.length - 1})` : ''}`);
        }
      }
      conhecidos.current = ids;
      setData(d);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) sair();
      else if (e instanceof ApiError && e.status === 403) await reloadMe();
      else if (e instanceof ApiError && e.status === SEM_REDE) {
        setOnline(false);
        setData((atual) => atual ?? lerCacheBebe(babyId));
      }
    }
  }, [babyId, sair, reloadMe, user, toast]);

  // Inicialização: descobre se há API (Cloudflare) e se há sessão
  useEffect(() => {
    (async () => {
      setModo(await detectarModo());
      if (temSessao()) {
        try { await reloadMe(); } catch (e) { if (!(e instanceof ApiError && e.status === SEM_REDE)) sairApi(); }
      }
      setCarregando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!babyId) return;
    try { localStorage.setItem(LS_BABY, babyId); } catch { /* sem storage */ }
    setData(null);
    conhecidos.current = null;
    refresh();
  }, [babyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sem internet / voltou a conexão: envia a fila e atualiza
  useEffect(() => {
    const fila = () => setFilaV((x) => x + 1);
    const off = () => setOnline(false);
    const on = async () => {
      setOnline(true);
      const r = await sincronizar();
      if (r.enviados) toast(`✓ ${r.enviados} registro(s) feito(s) sem internet foram enviados`);
      if (r.falhas.length) toast(`${r.falhas.length} registro(s) não puderam ser enviados: ${r.falhas[0]}`);
      refresh();
    };
    window.addEventListener('ninho-fila', fila);
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { window.removeEventListener('ninho-fila', fila); window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, [refresh, toast]);

  // Sincroniza com os outros cuidadores a cada 30 s (quando a aba está visível)
  useEffect(() => {
    const i = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30_000);
    const v = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', v); };
  }, [refresh]);

  // Relógio: 1 s quando há cronômetro rodando, senão 30 s
  const temTimer = !!data?.events.some((e) => !e.end_at && (e.type === 'sono' || e.type === 'mamada'));
  useEffect(() => {
    const i = window.setInterval(() => setAgora(Date.now()), temTimer ? 1000 : 30_000);
    return () => clearInterval(i);
  }, [temTimer]);

  // Toque numa notificação com o app já aberto: o service worker manda a URL de destino
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const h = (ev: MessageEvent) => {
      if (ev.data?.tipo !== 'abrir') return;
      const u = new URL(ev.data.url);
      const b = u.searchParams.get('baby');
      if (b) setBabyId(b);
      acaoDaUrl = u.searchParams.get('acao');
      setAcaoPendente((x) => x + 1);
      const a = u.hash.slice(1) as Aba;
      if (ABAS.some((x) => x.id === a)) setAba(a);
    };
    navigator.serviceWorker.addEventListener('message', h);
    return () => navigator.serviceWorker.removeEventListener('message', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    const h = () => setAbaState(lerAba());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const setAba = useCallback((a: Aba) => {
    history.replaceState(null, '', `#${a}`);
    setAbaState(a);
    window.scrollTo({ top: 0 });
  }, []);

  const ctx = useMemo<Ctx | null>(() => {
    if (!user || !data || !modo) return null;
    const nomes = new Map(data.members.map((m) => [m.user_id, m]));
    return {
      user, babies, data, modo, agora,
      podeEditar: data.access !== 'leitor',
      podeAdmin: data.access === 'admin',
      refresh, reloadMe, toast, setAba,
      online, pendentes,
      act: async (fn, ok, desfazer) => {
        try {
          await fn();
          if (ok || desfazer) {
            toast(ok ?? 'Feito', desfazer ? {
              label: 'Desfazer',
              fn: async () => {
                setMsg(null);
                try { await desfazer(); await refresh(); toast('Desfeito ↩︎'); } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível desfazer.'); }
              },
            } : undefined);
          }
          await refresh();
          setAgora(Date.now());
          return true;
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Algo deu errado.');
          if (e instanceof ApiError && e.status === 401) sair();
          return false;
        }
      },
      nome: (id) => {
        if (!id) return '—';
        if (id === user.id) return 'Você';
        const m = nomes.get(id);
        return m ? `${m.name.split(' ')[0]} (${papel(m.role).label.toLowerCase()})` : 'ex-cuidador';
      },
      abrirRegistro: (tipo, ev) => setRegistro({ tipo, ev }),
      trocarBebe: (id) => { setBabyId(id); setTrocar(false); },
      novoBebe: () => { setTrocar(false); setOnboarding(true); },
      abrirConfigNotif: () => { setCentral(false); setConfigNotif(true); },
      abrirRelatorio: () => setRelatorio(true),
      sair,
    };
  }, [user, data, modo, babies, agora, refresh, reloadMe, toast, setAba, sair, online, pendentes]);

  // Executa a ação pedida pelo atalho/notificação assim que o bebê estiver carregado
  useEffect(() => {
    if (!ctx || !acaoDaUrl) return;
    const a = acaoDaUrl;
    acaoDaUrl = null;
    if (a === 'relatorio') { setAba('saude'); setRelatorio(true); } else if (ctx.podeEditar && ['mamada', 'mamadeira', 'sono', 'fralda', 'remedio'].includes(a)) { setAba('hoje'); setRegistro({ tipo: a as EventType }); }
  }, [ctx, acaoPendente, setAba]);

  // Contador no ícone do app (tela inicial) = notificações não lidas
  const naoLidasGlobal = ctx ? contarNaoLidas(montarFeed(ctx.data, ctx.user.id, ctx.agora), lerVisto(ctx.user.id, ctx.data.baby.id)) : 0;
  useEffect(() => { if (ctx) definirBadge(naoLidasGlobal); }, [naoLidasGlobal, central]); // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando || !modo) return <div className="auth"><div className="brand"><span className="logo">🪺</span> Ninho</div></div>;

  if (!user) {
    return (
      <Auth
        onOk={() => reloadMe()}
        onDemo={async () => {
          const id = await criarFamiliaExemplo();
          await reloadMe(id);
          toast('Família de exemplo criada ✨');
        }}
      />
    );
  }

  if (!babies.length || onboarding) {
    return (
      <>
        <Onboarding
          userName={user.name}
          onCancel={babies.length ? () => setOnboarding(false) : sair}
          onDone={async (id) => { setOnboarding(false); await reloadMe(id); setAba('hoje'); }}
        />
        {msg && <div className="toast" role="status">{msg.texto}{msg.acao && <button className="toast-acao" onClick={msg.acao.fn}>{msg.acao.label}</button>}</div>}
      </>
    );
  }

  if (!ctx) return <div className="auth"><p className="muted">Carregando a rotina…</p></div>;

  const { baby } = ctx.data;
  const Pagina = { hoje: Hoje, indicadores: Indicadores, mural: Mural, saude: Saude, familia: Familia }[aba];
  const emojiBebe = (b: Baby) => (b.sex === 'M' ? '👦' : b.sex === 'F' ? '👧' : '👶');
  const avatar = <Avatar photo={baby.photo} emoji={emojiBebe(baby)} color={baby.color || 'var(--brand)'} size={42} ring />;
  const naoLidas = naoLidasGlobal;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <aside className="side">
          <div className="brand" style={{ padding: '0 8px 16px' }}><span className="logo">🪺</span> Ninho</div>
          {ABAS.map(({ id, label, Icon }) => (
            <button key={id} className={`navitem ${aba === id ? 'on' : ''}`} onClick={() => setAba(id)}><Icon size={19} /> {label}</button>
          ))}
          <div style={{ marginTop: 'auto' }} className="stack">
            <div className="row" style={{ padding: '0 8px' }}>
              <Avatar photo={user.photo} emoji={papel(ctx.data.role).emoji} size={34} />
              <div className="faint">{user.name}<br />{modo === 'cloud' ? '☁️ Sincronizado (D1)' : '💾 Modo local'}</div>
            </div>
            <button className="navitem" onClick={sair}><LogOut size={18} /> Sair</button>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="wrap">
              <button className="babybtn grow" onClick={() => setTrocar(true)}>
                {avatar}
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{baby.name} <ChevronDown size={14} style={{ verticalAlign: 'middle' }} /></div>
                  <div className="faint">{idade(baby.birth_date, agora).texto}</div>
                </div>
              </button>
              <div className="av-stack hide-mob">
                {ctx.data.members.slice(0, 5).map((m) => <Avatar key={m.user_id} photo={m.photo} emoji={papel(m.role).emoji} size={32} />)}
              </div>
              <button className="icon-btn bell" onClick={() => setCentral(true)} aria-label="Notificações">
                <Bell size={19} />
                {naoLidas > 0 && <span className="badge">{naoLidas > 9 ? '9+' : naoLidas}</span>}
              </button>
            </div>
          </header>
          {(!online || pendentes > 0) && (
            <div className={`net-bar ${online ? 'sync' : ''}`}>
              {online ? `⏳ Enviando ${pendentes} registro(s) feito(s) sem internet…` : `📴 Sem internet — ${pendentes ? `${pendentes} registro(s) guardado(s) neste aparelho` : 'você pode continuar registrando'}; tudo será enviado quando a conexão voltar.`}
            </div>
          )}
          {user.demo && (
            <div className="demo-bar">
              ✨ Conta de exemplo — dados fictícios, apagados em até {Math.max(1, Math.round((Date.parse(user.created_at ?? new Date().toISOString()) + 24 * 3600_000 - agora) / 3600_000))} h.
              <button className="btn sm" onClick={sair}>Criar minha conta</button>
            </div>
          )}
          <main className="wrap"><Pagina /></main>
        </div>
        <nav className="bnav">
          {ABAS.map(({ id, label, Icon }) => (
            <button key={id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}><Icon size={22} />{label}</button>
          ))}
        </nav>
      </div>

      {registro && <LogSheet key={registro.ev?.id ?? registro.tipo} tipo={registro.tipo} ev={registro.ev} onClose={() => setRegistro(null)} />}
      {trocar && (
        <Sheet title="Bebês" onClose={() => setTrocar(false)}>
          {babies.map((b) => (
            <button key={b.id} className="list-item babybtn" style={{ width: '100%' }} onClick={() => ctx.trocarBebe(b.id)}>
              <Avatar photo={b.photo} emoji={emojiBebe(b)} color={b.color || 'var(--brand)'} size={44} />
              <div className="grow"><div className="nm">{b.name}</div><div className="faint">{idade(b.birth_date, agora).texto} · você é {papel(b.role).label.toLowerCase()}</div></div>
              {b.id === baby.id && <span className="chip brand">atual</span>}
            </button>
          ))}
          <button className="btn block" onClick={ctx.novoBebe}>+ Cadastrar outro bebê ou entrar com código</button>
        </Sheet>
      )}
      {central && <CentralSheet onClose={() => setCentral(false)} onConfig={ctx.abrirConfigNotif} />}
      {configNotif && <ConfigNotificacoes onClose={() => setConfigNotif(false)} />}
      {relatorio && <RelatorioSheet onClose={() => setRelatorio(false)} />}
      {msg && <div className="toast" role="status">{msg.texto}{msg.acao && <button className="toast-acao" onClick={msg.acao.fn}>{msg.acao.label}</button>}</div>}
    </AppCtx.Provider>
  );
}
