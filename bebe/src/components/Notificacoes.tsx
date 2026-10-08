import { useEffect, useState } from 'react';
import { BellOff, BellRing, Send, Settings } from 'lucide-react';
import { useApp, type Aba } from '../ctx';
import { api } from '../lib/api';
import { TIPOS, papel } from '../lib/constants';
import { insights } from '../lib/metrics';
import { ativarPush, desativarPush, ehInstalado, ehIOS, inscricaoAtual, pushSuportado } from '../lib/push';
import { DIA, haQuanto, hm, startOfDay, t } from '../lib/time';
import type { BabyData, NotifPrefs } from '../types';
import { descreve } from '../pages/Hoje';
import { Avatar } from './Avatar';
import { Field, Sheet } from './ui';

export interface ItemFeed { id: string; at: number; criado: number; emoji: string; titulo: string; texto: string; aba: Aba; quem?: string; alerta?: boolean }

const chaveVisto = (userId: string, babyId: string) => `ninho-visto-${userId}-${babyId}`;
export function lerVisto(userId: string, babyId: string) {
  try { return Number(localStorage.getItem(chaveVisto(userId, babyId))) || 0; } catch { return 0; }
}
function gravarVisto(userId: string, babyId: string, ms: number) {
  try { localStorage.setItem(chaveVisto(userId, babyId), String(ms)); } catch { /* sem storage */ }
}

/** Central de notificações: o que os outros cuidadores fizeram + alertas atuais do bebê. */
export function montarFeed(data: BabyData, userId: string, agora: number): ItemFeed[] {
  const itens: ItemFeed[] = [];
  const nome = data.baby.name.split(' ')[0];
  for (const i of insights(data, agora).filter((x) => x.nivel === 'alerta' || x.nivel === 'atencao')) {
    itens.push({ id: `ins-${i.titulo}`, at: agora, criado: agora, emoji: i.nivel === 'alerta' ? '🚨' : '⚠️', titulo: i.titulo, texto: i.acao ?? i.detalhe, aba: (i.aba as Aba) ?? 'hoje', alerta: true });
  }
  const desde = agora - DIA;
  for (const e of data.events) {
    const quando = t(e.start_at);
    if (e.user_id === userId || quando < desde) continue;
    itens.push({ id: `ev-${e.id}`, at: quando, criado: t(e.created_at ?? e.start_at), emoji: TIPOS[e.type].emoji, titulo: `${nome}: ${TIPOS[e.type].label.toLowerCase()}`, texto: descreve(e, agora), aba: 'hoje', quem: e.user_id });
  }
  for (const n of data.notes) {
    const quando = t(n.created_at);
    if (n.user_id === userId || quando < agora - 7 * DIA) continue;
    itens.push({ id: `nota-${n.id}`, at: quando, criado: quando, emoji: '📌', titulo: 'Novo recado', texto: n.text, aba: 'mural', quem: n.user_id });
  }
  return itens.sort((a, b) => Number(!!b.alerta) - Number(!!a.alerta) || b.at - a.at).slice(0, 60);
}

export function contarNaoLidas(feed: ItemFeed[], visto: number) {
  return feed.filter((i) => (i.alerta ? false : i.criado > visto)).length + feed.filter((i) => i.alerta && i.emoji === '🚨').length;
}

export function CentralSheet({ onClose, onConfig }: { onClose: () => void; onConfig: () => void }) {
  const { data, user, agora, setAba, nome } = useApp();
  const [visto] = useState(() => lerVisto(user.id, data.baby.id));
  const feed = montarFeed(data, user.id, agora);
  useEffect(() => { gravarVisto(user.id, data.baby.id, Date.now()); }, [user.id, data.baby.id]);
  const membro = (id?: string) => data.members.find((m) => m.user_id === id);
  return (
    <Sheet title="Notificações" onClose={onClose} footer={<button className="btn" onClick={onConfig}><Settings size={16} /> Configurar avisos no celular</button>}>
      {feed.length ? (
        <div>
          {feed.map((i) => {
            const m = membro(i.quem);
            return (
              <div key={i.id} className={`notif ${!i.alerta && i.criado > visto ? 'novo' : ''}`} onClick={() => { setAba(i.aba); onClose(); }} style={{ cursor: 'pointer' }}>
                {m ? <Avatar photo={m.photo} emoji={papel(m.role).emoji} size={38} /> : <span className="tl-ico" style={{ background: i.alerta ? 'var(--warn-soft)' : 'var(--surface-2)' }}>{i.emoji}</span>}
                <div className="grow">
                  <div style={{ fontWeight: 800 }}>{m ? <>{i.emoji} </> : null}{i.titulo}</div>
                  <div className="muted" style={{ fontSize: 13.5 }}>{i.texto}</div>
                  <div className="faint">{i.alerta ? 'agora' : `${i.at >= startOfDay(agora) ? `hoje às ${hm(i.at)}` : `ontem às ${hm(i.at)}`} · ${haQuanto(i.at, agora)}${i.quem ? ` · ${nome(i.quem)}` : ''}`}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="muted">Nada novo por aqui. 💛</p>}
    </Sheet>
  );
}

const CATS: { k: keyof Omit<NotifPrefs, 'silencio'>; t: string; d: string }[] = [
  { k: 'lembretes', t: '🍼 Lembretes', d: 'Mamada passou do intervalo planejado e cronômetro esquecido ligado' },
  { k: 'recados', t: '📌 Recados', d: 'Novos recados no mural' },
  { k: 'estoque', t: '🛒 Materiais acabando', d: 'Quando um item fica abaixo do mínimo ou acaba' },
  { k: 'consultas', t: '🩺 Consultas', d: '24 h e 2 h antes, e quando alguém agenda' },
  { k: 'familia', t: '👋 Família', d: 'Quando um novo cuidador entra' },
  { k: 'atividade', t: '📝 Cada registro', d: 'Toda mamada, fralda e sono registrados pelos outros (bom para quem está longe)' },
];

export function ConfigNotificacoes({ onClose }: { onClose: () => void }) {
  const { modo, toast } = useApp();
  const [info, setInfo] = useState<{ publicKey: string | null; prefs: NotifPrefs; devices: number } | null>(null);
  const [inscrito, setInscrito] = useState(false);
  const [busy, setBusy] = useState(false);
  const suporta = pushSuportado();
  const iosSemInstalar = ehIOS() && !ehInstalado();
  const permissao = suporta ? Notification.permission : 'default';

  useEffect(() => {
    api.push().then(setInfo).catch((e) => toast(e.message));
    inscricaoAtual().then((s) => setInscrito(!!s)).catch(() => undefined);
  }, [toast]);

  async function alternar() {
    setBusy(true);
    try {
      if (inscrito) {
        await desativarPush();
        setInscrito(false);
        toast('Notificações desativadas neste aparelho');
      } else {
        await ativarPush(info!.publicKey!);
        setInscrito(true);
        const r = await api.pushTest();
        toast(r.enviados ? 'Pronto! Enviamos uma notificação de teste 🔔' : 'Ativado. Se o teste não chegar, confira as permissões do navegador.');
      }
      setInfo(await api.push());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível ativar.');
    }
    setBusy(false);
  }
  async function salvar(p: Partial<NotifPrefs>) {
    if (!info) return;
    const prefs = { ...info.prefs, ...p };
    setInfo({ ...info, prefs });
    try { await api.pushPrefs(p); } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao salvar.'); }
  }

  return (
    <Sheet title="Notificações" onClose={onClose}>
      <div className="card" style={{ background: inscrito ? 'var(--ok-soft)' : 'var(--surface-2)', boxShadow: 'none' }}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          {inscrito ? <BellRing size={26} color="var(--ok)" /> : <BellOff size={26} color="var(--ink-3)" />}
          <div className="grow">
            <b>{inscrito ? 'Ativadas neste aparelho' : 'Desativadas neste aparelho'}</b>
            <p className="faint">{info ? `${info.devices} aparelho(s) seu(s) recebendo avisos` : 'Carregando…'}</p>
          </div>
        </div>
        {modo === 'local' ? (
          <p className="muted" style={{ marginTop: 10 }}>Os avisos no celular funcionam quando o app está publicado no Cloudflare. Neste modo, use o sino 🔔 dentro do app.</p>
        ) : iosSemInstalar ? (
          <p className="muted" style={{ marginTop: 10 }}>No iPhone/iPad: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>, abra o Ninho pelo ícone e ative aqui (iOS 16.4 ou mais recente).</p>
        ) : !suporta ? (
          <p className="muted" style={{ marginTop: 10 }}>Este navegador não suporta notificações. Use Chrome, Edge, Firefox ou Safari atualizados.</p>
        ) : permissao === 'denied' ? (
          <p className="muted" style={{ marginTop: 10 }}>As notificações deste site estão bloqueadas. Libere em <b>Configurações do navegador → Notificações</b> e tente de novo.</p>
        ) : (
          <div className="wrap-row" style={{ marginTop: 12 }}>
            <button className={`btn ${inscrito ? '' : 'primary'}`} disabled={busy || !info?.publicKey} onClick={alternar}>{busy ? 'Aguarde…' : inscrito ? 'Desativar neste aparelho' : 'Ativar neste aparelho'}</button>
            {inscrito && <button className="btn" disabled={busy} onClick={async () => { const r = await api.pushTest(); toast(r.enviados ? 'Teste enviado 🔔' : 'Nenhum aparelho recebeu. Reative as notificações.'); }}><Send size={15} /> Testar</button>}
          </div>
        )}
      </div>

      <h3>O que avisar</h3>
      <p className="faint" style={{ marginTop: -8 }}>Vale para todos os seus aparelhos e todos os bebês que você acompanha. Você não recebe aviso do que você mesmo registrou.</p>
      {info && CATS.map((c) => (
        <label key={c.k} className="between" style={{ cursor: 'pointer', gap: 12 }}>
          <span><b>{c.t}</b><br /><span className="faint">{c.d}</span></span>
          <span className="switch"><input type="checkbox" checked={!!info.prefs[c.k]} onChange={(e) => salvar({ [c.k]: e.target.checked })} /><span /></span>
        </label>
      ))}

      {info && (
        <>
          <label className="between" style={{ cursor: 'pointer', gap: 12 }}>
            <span><b>🌙 Horário de silêncio</b><br /><span className="faint">Não enviar avisos neste intervalo</span></span>
            <span className="switch"><input type="checkbox" checked={info.prefs.silencio.on} onChange={(e) => salvar({ silencio: { ...info.prefs.silencio, on: e.target.checked } })} /><span /></span>
          </label>
          {info.prefs.silencio.on && (
            <div className="grid g2">
              <Field label="De"><input className="input" type="time" value={info.prefs.silencio.de} onChange={(e) => salvar({ silencio: { ...info.prefs.silencio, de: e.target.value } })} /></Field>
              <Field label="Até"><input className="input" type="time" value={info.prefs.silencio.ate} onChange={(e) => salvar({ silencio: { ...info.prefs.silencio, ate: e.target.value } })} /></Field>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
