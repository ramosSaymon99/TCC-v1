/** Componentes de orientação: primeiros passos, ajuda contextual, dicas de primeira vez e seções recolhíveis. */
import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Camera, Check, ChevronDown, HelpCircle, PenLine, Smartphone, UserPlus, X } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { ativarPush, ehInstalado, ehIOS, inscricaoAtual, pushSuportado } from '../lib/push';
import { Sheet } from './ui';

const lerLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

/** Notificações ativas neste aparelho? (null enquanto verifica) */
export function useNotifAtiva() {
  const [ativa, setAtiva] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pushSuportado()) { setAtiva(false); return; }
    inscricaoAtual().then((s) => setAtiva(!!s && Notification.permission === 'granted')).catch(() => setAtiva(false));
    const f = () => inscricaoAtual().then((s) => setAtiva(!!s)).catch(() => undefined);
    window.addEventListener('ninho-notif', f);
    return () => window.removeEventListener('ninho-notif', f);
  }, []);
  return ativa;
}

/** Ativa as notificações com um toque (pede permissão, inscreve e manda um teste). */
export async function ativarNotificacoes() {
  const info = await api.push();
  if (!info.publicKey) throw new Error('Notificações indisponíveis no momento.');
  await ativarPush(info.publicKey);
  api.uso('push_ativado');
  window.dispatchEvent(new Event('ninho-notif'));
  await api.pushTest().catch(() => undefined);
}

/* ---------- Primeiros passos ---------- */
export function PrimeirosPassos() {
  const { data, user, setAba, abrirRegistro, toast, podeEditar } = useApp();
  const notif = useNotifAtiva();
  const chave = `ninho-passos-${user.id}-${data.baby.id}`;
  const [oculto, setOculto] = useState(() => lerLS(chave) === 'ocultar');
  const [instalar, setInstalar] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const primeiro = data.baby.name.split(' ')[0];
  const passos = [
    { id: 'registro', feito: data.events.some((e) => e.user_id === user.id), titulo: 'Faça o primeiro registro', desc: `Uma mamada, fralda ou soneca de ${primeiro}.`, Icon: PenLine, acao: () => abrirRegistro('mamada'), so: podeEditar },
    { id: 'familia', feito: data.members.length > 1, titulo: 'Convide quem cuida junto', desc: 'Pai, avós, babá: cada um com seu acesso.', Icon: UserPlus, acao: () => setAba('familia'), so: true },
    { id: 'notif', feito: !!notif, titulo: 'Ative as notificações', desc: 'Lembretes de mamada, doses e recados da família.', Icon: Bell, acao: async () => { setAtivando(true); try { await ativarNotificacoes(); toast('Notificações ativadas 🔔'); } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível ativar.'); } setAtivando(false); }, so: pushSuportado() && !(ehIOS() && !ehInstalado()) },
    { id: 'instalar', feito: ehInstalado(), titulo: 'Coloque o Ninho na tela inicial', desc: 'Abre como app, mais rápido e com notificações no iPhone.', Icon: Smartphone, acao: () => setInstalar(true), so: true },
    { id: 'foto', feito: !!data.baby.photo || data.posts.length > 0, titulo: `Poste a primeira foto de ${primeiro}`, desc: 'No Dia a dia, só a família vê.', Icon: Camera, acao: () => setAba('diario'), so: podeEditar },
  ].filter((p) => p.so);
  const feitos = passos.filter((p) => p.feito).length;
  if (oculto || notif === null || feitos === passos.length) return null;
  return (
    <div className="card passos">
      <div className="card-h">
        <h2>👋 Primeiros passos</h2>
        <div className="row" style={{ gap: 6 }}>
          <span className="faint">{feitos} de {passos.length} feitos</span>
          <button className="icon-btn" aria-label="Ocultar primeiros passos" onClick={() => { gravarLS(chave, 'ocultar'); setOculto(true); }}><X size={16} /></button>
        </div>
      </div>
      <div className="passos-barra"><span style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
      <div className="stack" style={{ gap: 6, marginTop: 10 }}>
        {passos.filter((p) => !p.feito).map((p) => (
          <button key={p.id} className={`passo ${p.feito ? 'feito' : ''}`} disabled={p.feito || (p.id === 'notif' && ativando)} onClick={p.acao}>
            <span className="passo-ic">{p.feito ? <Check size={16} /> : <p.Icon size={16} />}</span>
            <span className="grow" style={{ textAlign: 'left' }}><b>{p.titulo}</b><span className="faint" style={{ display: 'block' }}>{p.desc}</span></span>
            {!p.feito && <span className="chip brand">{p.id === 'notif' && ativando ? '…' : 'Fazer'}</span>}
          </button>
        ))}
      </div>
      {instalar && <InstalarSheet onClose={() => setInstalar(false)} />}
    </div>
  );
}

export function InstalarSheet({ onClose }: { onClose: () => void }) {
  const ios = ehIOS();
  return (
    <Sheet title="📲 Ninho na tela inicial" onClose={onClose}>
      {ios ? (
        <ol className="lista-passos">
          <li>Toque em <b>Compartilhar</b> (o quadrado com a seta ↑) na barra do Safari.</li>
          <li>Role e escolha <b>Adicionar à Tela de Início</b>.</li>
          <li>Toque em <b>Adicionar</b>. Abra o Ninho pelo ícone novo e ative as notificações.</li>
        </ol>
      ) : (
        <ol className="lista-passos">
          <li>Toque no menu <b>⋮</b> do navegador (canto superior).</li>
          <li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
          <li>Confirme. O Ninho passa a abrir como um aplicativo.</li>
        </ol>
      )}
      <p className="faint">No iPhone, as notificações só funcionam com o Ninho instalado na tela inicial.</p>
    </Sheet>
  );
}

/* ---------- Comemoração + pedido de notificação na hora certa ---------- */
export function MomentoSheet({ tipo, onClose }: { tipo: 'registro' | 'convite'; onClose: () => void }) {
  const { data, toast, setAba } = useApp();
  const notif = useNotifAtiva();
  const [ativando, setAtivando] = useState(false);
  const primeiro = data.baby.name.split(' ')[0];
  const podeAtivar = pushSuportado() && !(ehIOS() && !ehInstalado());
  async function ativar() {
    setAtivando(true);
    try { await ativarNotificacoes(); toast('Notificações ativadas 🔔'); onClose(); } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível ativar.'); }
    setAtivando(false);
  }
  return (
    <Sheet title={tipo === 'registro' ? '🎉 Primeiro registro feito!' : '💌 Convite pronto!'} onClose={onClose}>
      {tipo === 'registro' ? (
        <>
          <p>Ótimo começo! A cada registro o Ninho entende melhor a rotina de {primeiro}:</p>
          <ul className="lista-passos">
            <li><b>Hoje:</b> quanto tempo desde a última mamada, sono e fralda.</li>
            <li><b>Em 2–3 dias:</b> previsão da próxima soneca e da próxima mamada.</li>
            <li><b>Em 1 semana:</b> evolução do sono e das mamadas, e sugestão de rotina.</li>
          </ul>
        </>
      ) : <p>Quando a pessoa entrar, os registros dela aparecem para você em tempo real.</p>}
      {notif === false && (
        <div className="card destaque-suave">
          <b>🔔 Quer ser avisado(a)?</b>
          <p className="faint" style={{ margin: '4px 0 10px' }}>{tipo === 'registro' ? `Lembretes de mamada e de doses, e avisos quando outro cuidador registrar algo de ${primeiro}.` : 'Saiba na hora quando a pessoa entrar e quando registrar algo.'}</p>
          {podeAtivar
            ? <button className="btn primary block" disabled={ativando} onClick={ativar}>{ativando ? 'Ativando…' : 'Ativar notificações'}</button>
            : <p className="faint">No iPhone, primeiro coloque o Ninho na tela inicial (Compartilhar → Adicionar à Tela de Início).</p>}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {tipo === 'registro' && data.members.length < 2 && <button className="btn" onClick={() => { onClose(); setAba('familia'); }}><UserPlus size={15} /> Convidar a família</button>}
        <button className="btn ghost" onClick={onClose}>Agora não</button>
      </div>
    </Sheet>
  );
}

/* ---------- Ajuda contextual "?" ---------- */
export function Ajuda({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button type="button" className="ajuda-btn" aria-label={`Ajuda: ${titulo}`} onClick={(e) => { e.stopPropagation(); setAberta(true); }}><HelpCircle size={16} /></button>
      {aberta && <Sheet title={titulo} onClose={() => setAberta(false)}><div className="ajuda-texto">{children}</div></Sheet>}
    </>
  );
}

/* ---------- Dica que aparece uma vez só ---------- */
export function DicaUnica({ id, children }: { id: string; children: ReactNode }) {
  const chave = `ninho-dica-${id}`;
  const [vista, setVista] = useState(() => lerLS(chave) === '1');
  if (vista) return null;
  return (
    <div className="dica-unica" role="note">
      <span>💡</span>
      <div className="grow">{children}</div>
      <button className="btn sm" onClick={() => { gravarLS(chave, '1'); setVista(true); }}>Entendi</button>
    </div>
  );
}

/* ---------- Seção recolhível (lembra se a pessoa abriu ou fechou) ---------- */
export function Secao({ id, titulo, extra, aberta: padrao = true, children, className = '' }: { id: string; titulo: ReactNode; extra?: ReactNode; aberta?: boolean; children: ReactNode; className?: string }) {
  const chave = `ninho-secao-${id}`;
  const [aberta, setAberta] = useState(() => { const v = lerLS(chave); return v == null ? padrao : v === '1'; });
  const alternar = () => { gravarLS(chave, aberta ? '0' : '1'); setAberta(!aberta); };
  return (
    <div className={`card secao ${aberta ? 'aberta' : ''} ${className}`}>
      <div className="card-h secao-h" role="button" tabIndex={0} aria-expanded={aberta} onClick={alternar} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && alternar()}>
        <h2>{titulo}</h2>
        <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>{extra}<button className="icon-btn" aria-label={aberta ? 'Recolher' : 'Abrir'} onClick={alternar}><ChevronDown size={16} style={{ transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} /></button></div>
      </div>
      {aberta && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

/** Seletor da aba "Casa": Mural (materiais, compras, recados, leite) e Família (cuidadores, rotina, plantão, conta). */
export function CasaTabs({ atual }: { atual: 'mural' | 'familia' }) {
  const { setAba } = useApp();
  return (
    <div className="seg casa-tabs" role="tablist" aria-label="Casa">
      <button role="tab" aria-selected={atual === 'mural'} className={atual === 'mural' ? 'on' : ''} onClick={() => setAba('mural')}>🧺 Mural</button>
      <button role="tab" aria-selected={atual === 'familia'} className={atual === 'familia' ? 'on' : ''} onClick={() => setAba('familia')}>👨‍👩‍👧 Família e ajustes</button>
    </div>
  );
}
