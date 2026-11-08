import { useEffect, useState } from 'react';
import { BellOff, BellRing, Send, Settings } from 'lucide-react';
import { useApp, type Aba } from '../ctx';
import { api } from '../lib/api';
import { TIPOS, papel } from '../lib/constants';
import { agruparCompras, insights } from '../lib/metrics';
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
/** Alertas já vistos na central (o mesmo alerta não fica contando no sino para sempre). */
const chaveAlertas = (userId: string, babyId: string) => `ninho-alertas-vistos-${userId}-${babyId}`;
export function lerAlertasVistos(userId: string, babyId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(chaveAlertas(userId, babyId)) ?? '[]') as string[]); } catch { return new Set(); }
}
function gravarAlertasVistos(userId: string, babyId: string, ids: string[]) {
  try { localStorage.setItem(chaveAlertas(userId, babyId), JSON.stringify(ids.slice(0, 50))); } catch { /* sem storage */ }
}

/** Central de notificações: o que os outros cuidadores fizeram + alertas atuais do bebê. */
export function montarFeed(data: BabyData, userId: string, agora: number): ItemFeed[] {
  const itens: ItemFeed[] = [];
  const nome = data.baby.name.split(' ')[0];
  for (const i of agruparCompras(insights(data, agora)).filter((x) => x.nivel === 'alerta' || x.nivel === 'atencao')) {
    itens.push({ id: `ins-${i.titulo}`, at: agora, criado: agora, emoji: i.nivel === 'alerta' ? '🚨' : '⚠️', titulo: i.titulo, texto: i.acao ?? i.detalhe, aba: (i.aba as Aba) ?? 'hoje', alerta: true });
  }
  const desde = agora - DIA;
  for (const e of data.events) {
    const quando = t(e.start_at);
    if (e.user_id === userId || quando < desde) continue;
    itens.push({ id: `ev-${e.id}`, at: quando, criado: t(e.created_at ?? e.start_at), emoji: TIPOS[e.type].emoji, titulo: `${nome}: ${TIPOS[e.type].label.toLowerCase()}`, texto: descreve(e, agora), aba: 'hoje', quem: e.user_id });
  }
  for (const n of data.notes.filter((x) => x.kind !== 'pergunta')) {
    const quando = t(n.created_at);
    if (n.user_id === userId || quando < agora - 7 * DIA) continue;
    itens.push({ id: `nota-${n.id}`, at: quando, criado: quando, emoji: '📌', titulo: 'Novo recado', texto: n.text, aba: 'mural', quem: n.user_id });
  }
  return itens.sort((a, b) => Number(!!b.alerta) - Number(!!a.alerta) || b.at - a.at).slice(0, 60);
}

/** Sino: só o que é novo desde a última abertura (atividade nova e alertas ainda não vistos). */
export function contarNaoLidas(feed: ItemFeed[], visto: number, alertasVistos: Set<string> = new Set()) {
  return feed.filter((i) => (i.alerta ? !alertasVistos.has(i.id) : i.criado > visto)).length;
}

export function CentralSheet({ onClose, onConfig }: { onClose: () => void; onConfig: () => void }) {
  const { data, user, agora, setAba, nome } = useApp();
  const [visto] = useState(() => lerVisto(user.id, data.baby.id));
  const [alertasVistos] = useState(() => lerAlertasVistos(user.id, data.baby.id));
  const feed = montarFeed(data, user.id, agora);
  const alertas = feed.filter((i) => i.alerta);
  const atividade = feed.filter((i) => !i.alerta);
  useEffect(() => {
    gravarVisto(user.id, data.baby.id, Date.now());
    gravarAlertasVistos(user.id, data.baby.id, alertas.map((i) => i.id));
  }, [user.id, data.baby.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const membro = (id?: string) => data.members.find((m) => m.user_id === id);
  const linha = (i: ItemFeed) => {
    const m = membro(i.quem);
    const novo = i.alerta ? !alertasVistos.has(i.id) : i.criado > visto;
    return (
      <div key={i.id} className={`notif ${novo ? 'novo' : ''}`} onClick={() => { setAba(i.aba); onClose(); }} style={{ cursor: 'pointer' }}>
        {m ? <Avatar photo={m.photo} emoji={papel(m.role).emoji} size={38} /> : <span className="tl-ico" style={{ background: i.alerta ? 'var(--warn-soft)' : 'var(--surface-2)' }}>{i.emoji}</span>}
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{m ? <>{i.emoji} </> : null}{i.titulo}</div>
          <div className="muted" style={{ fontSize: 13.5 }}>{i.texto}</div>
          {!i.alerta && <div className="faint">{`${i.at >= startOfDay(agora) ? `hoje às ${hm(i.at)}` : `ontem às ${hm(i.at)}`} · ${haQuanto(i.at, agora)}${i.quem ? ` · ${nome(i.quem)}` : ''}`}</div>}
        </div>
      </div>
    );
  };
  return (
    <Sheet title="Notificações" onClose={onClose} footer={<button className="btn" onClick={onConfig}><Settings size={16} /> Configurar avisos no celular</button>}>
      {alertas.length > 0 && (
        <section>
          <h3 className="notif-sec">Precisa de atenção</h3>
          {alertas.map(linha)}
        </section>
      )}
      <section>
        <h3 className="notif-sec">Atividade da família</h3>
        {atividade.length ? atividade.map(linha) : <p className="muted">Nada novo da família nas últimas 24 h. 💛</p>}
      </section>
    </Sheet>
  );
}

const CATS: { k: keyof Omit<NotifPrefs, 'silencio' | 'noite'>; t: string; d: string }[] = [
  { k: 'cronometro', t: '⏱️ Cronômetro na tela de bloqueio', d: 'Sono ou mamada em andamento fica fixo na tela, com botão "Acordou"/"Terminou"' },
  { k: 'lembretes', t: '🍼 Lembretes', d: 'Hora da mamada, janela de sono chegando, próxima dose liberada, febre registrada e cronômetro esquecido' },
  { k: 'recados', t: '📌 Recados', d: 'Novos recados no mural' },
  { k: 'estoque', t: '🛒 Materiais acabando', d: 'Quando um item fica abaixo do mínimo ou acaba' },
  { k: 'consultas', t: '🩺 Consultas', d: '24 h e 2 h antes, e quando alguém agenda' },
  { k: 'familia', t: '👋 Família e fotos', d: 'Quando um novo cuidador entra e quando alguém posta foto no Dia a dia' },
  { k: 'atividade', t: '📝 Registros dos outros', d: 'Mamada, fralda e sono registrados pelos outros. Para não lotar o celular, vem no máximo 1 aviso a cada 30 min, com um resumo' },
  // À noite, com o plantão definido em Família, lembretes, cronômetro e registros vão só para quem está de plantão
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
        api.uso('push_desativado');
        toast('Notificações desativadas neste aparelho');
      } else {
        await ativarPush(info!.publicKey!);
        setInscrito(true);
        api.uso('push_ativado');
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
            <p className="faint">{info ? `${info.devices === 1 ? '1 aparelho seu' : `${info.devices} aparelhos seus`} recebendo avisos` : 'Carregando…'}</p>
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
            <span><b>😴 Noite tranquila</b><br /><span className="faint">À noite, cronômetro e registros dos outros não chegam no seu celular (só para quem está de plantão). Dose, febre e mamada atrasada continuam avisando.</span></span>
            <span className="switch"><input type="checkbox" checked={info.prefs.noite?.on ?? true} onChange={(e) => salvar({ noite: { ...(info.prefs.noite ?? { de: '22:00', ate: '06:00' }), on: e.target.checked } })} /><span /></span>
          </label>
          {(info.prefs.noite?.on ?? true) && (
            <div className="grid g2">
              <Field label="De"><input className="input" type="time" value={info.prefs.noite?.de ?? '22:00'} onChange={(e) => salvar({ noite: { ...(info.prefs.noite ?? { on: true, ate: '06:00' }), de: e.target.value } })} /></Field>
              <Field label="Até"><input className="input" type="time" value={info.prefs.noite?.ate ?? '06:00'} onChange={(e) => salvar({ noite: { ...(info.prefs.noite ?? { on: true, de: '22:00' }), ate: e.target.value } })} /></Field>
            </div>
          )}
          <label className="between" style={{ cursor: 'pointer', gap: 12 }}>
            <span><b>🔕 Horário de silêncio total</b><br /><span className="faint">Não enviar nenhum aviso neste intervalo, nem os importantes</span></span>
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
