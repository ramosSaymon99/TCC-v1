/** Turma (perfil creche/escola): todas as crianças num só lugar, com entrada/saída e registros rápidos, também em lote. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Plus, Share2, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { PAPEIS } from '../lib/constants';
import { MIN, duracao, hm, idade, startOfDay, t, uid, ymd } from '../lib/time';
import { pl } from '../lib/texto';
import type { BabyEvent, EventData, EventType, ItemTurma, User } from '../types';
import { Avatar } from '../components/Avatar';
import { Choice, Empty, Field, Sheet } from '../components/ui';

type Toast = (msg: string, acao?: { label: string; fn: () => void }) => void;
interface Props { user: User; onAbrir: (babyId: string) => void; onCriada: (babyId: string) => Promise<void>; toast: Toast }

/** Situação de uma criança hoje, a partir dos registros. */
function situacao(i: ItemTurma, agora: number) {
  const hoje = startOfDay(agora);
  const doDia = i.events.filter((e) => t(e.start_at) >= hoje);
  const pres = doDia.filter((e) => e.type === 'presenca').sort((a, b) => t(b.start_at) - t(a.start_at))[0];
  const entrada = doDia.filter((e) => e.type === 'presenca' && e.data.acao !== 'saida').sort((a, b) => t(a.start_at) - t(b.start_at))[0];
  const presente = !!pres && pres.data.acao !== 'saida';
  const sono = i.events.find((e) => e.type === 'sono' && !e.end_at) ?? null;
  const ult = (f: (e: BabyEvent) => boolean) => doDia.filter(f).sort((a, b) => t(b.start_at) - t(a.start_at))[0];
  return {
    presente, saiu: !!pres && pres.data.acao === 'saida', pres, entrada, sono,
    fralda: ult((e) => e.type === 'fralda'),
    comeu: ult((e) => e.type === 'alimentacao' || e.type === 'mamadeira' || e.type === 'mamada'),
    registros: doDia.filter((e) => e.type !== 'presenca').length,
  };
}

/** Criança recém-cadastrada: abre o convite dos responsáveis mesmo se a tela for remontada (1ª criança). */
let conviteAposCriar: { id: string; dono: number } | null = null;
let instancias = 0;

const novoEvento = (type: EventType, data: EventData, extra: Partial<BabyEvent> = {}) => ({ id: uid(), type, start_at: new Date().toISOString(), end_at: null, data, note: null, ...extra });

export function Turma({ user, onAbrir, onCriada, toast }: Props) {
  const [lista, setLista] = useState<ItemTurma[] | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [escolha, setEscolha] = useState<{ tipo: 'fralda' | 'comeu'; ids: string[] } | null>(null);
  const [nova, setNova] = useState(false);
  const [convite, setConvite] = useState<ItemTurma | null>(null);
  const [codigo, setCodigo] = useState(false);
  const [busca, setBusca] = useState('');
  const montado = useRef(true);
  const eu = useRef(++instancias);
  useEffect(() => () => { montado.current = false; }, []);

  const carregar = useCallback(async () => {
    try { setLista(await api.turma()); } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível carregar a turma.'); setLista((l) => l ?? []); }
    setAgora(Date.now());
  }, [toast]);
  useEffect(() => {
    // Só a tela nova (remontada depois do 1º cadastro) abre o convite pendente
    if (!lista || !conviteAposCriar || conviteAposCriar.dono === eu.current) return;
    const id = conviteAposCriar.id;
    const i = lista.find((x) => x.baby.id === id);
    if (i) { conviteAposCriar = null; setConvite(i); }
  }, [lista]);
  useEffect(() => {
    void carregar();
    const i = window.setInterval(() => document.visibilityState === 'visible' && carregar(), 30_000);
    return () => clearInterval(i);
  }, [carregar]);

  const itens = useMemo(() => (lista ?? []).filter((i) => !busca.trim() || i.baby.name.toLowerCase().includes(busca.trim().toLowerCase())), [lista, busca]);
  const sits = useMemo(() => new Map((lista ?? []).map((i) => [i.baby.id, situacao(i, agora)])), [lista, agora]);
  const presentes = [...sits.values()].filter((s) => s.presente).length;
  const dormindo = [...sits.values()].filter((s) => s.presente && s.sono).length;
  const podeEditar = (i: ItemTurma) => i.access !== 'leitor';

  /** Grava um registro em várias crianças; "Desfazer" apaga todos. */
  async function registrar(ids: string[], fazer: (i: ItemTurma) => Promise<{ babyId: string; id: string; undo?: () => Promise<unknown> } | null>, ok: string) {
    const alvos = (lista ?? []).filter((i) => ids.includes(i.baby.id) && podeEditar(i));
    const feitos: { babyId: string; id: string; undo?: () => Promise<unknown> }[] = [];
    try {
      for (const i of alvos) { const r = await fazer(i); if (r) feitos.push(r); }
      setSel(new Set());
      await carregar();
      if (feitos.length) toast(ok, { label: 'Desfazer', fn: async () => { for (const f of feitos) await (f.undo ? f.undo() : api.remove('events', f.babyId, f.id)); await carregar(); toast('Desfeito'); } });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível registrar.');
      await carregar();
    }
  }
  const criar = (i: ItemTurma, type: EventType, data: EventData) => { const ev = novoEvento(type, data); return api.create('events', i.baby.id, ev).then(() => ({ babyId: i.baby.id, id: ev.id })); };

  const presenca = (ids: string[], acao: 'entrada' | 'saida') => registrar(ids, async (i) => {
    const s = sits.get(i.baby.id)!;
    if (acao === 'entrada' && s.presente) return null;
    if (acao === 'saida' && !s.presente) return null;
    // Saindo dormindo: encerra o sono antes
    if (acao === 'saida' && s.sono) await api.update('events', i.baby.id, s.sono.id, { end_at: new Date().toISOString() });
    return criar(i, 'presenca', { acao });
  }, acao === 'entrada' ? (ids.length > 1 ? 'Entradas registradas 🏫' : 'Chegada registrada 🏫') : (ids.length > 1 ? 'Saídas registradas 👋' : 'Saída registrada 👋'));

  const sono = (ids: string[], dormir: boolean) => registrar(ids, async (i) => {
    const s = sits.get(i.baby.id)!;
    if (dormir) return s.sono ? null : criar(i, 'sono', {});
    if (!s.sono) return null;
    const id = s.sono.id;
    await api.update('events', i.baby.id, id, { end_at: new Date().toISOString() });
    return { babyId: i.baby.id, id, undo: () => api.update('events', i.baby.id, id, { end_at: null }) };
  }, dormir ? 'Soneca iniciada 😴' : 'Acordou ☀️');

  const nomeSel = (ids: string[]) => (ids.length === 1 ? (lista ?? []).find((i) => i.baby.id === ids[0])?.baby.name.split(' ')[0] ?? '' : pl(ids.length, 'criança', 'crianças'));
  const alternarSel = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selIds = [...sel];
  const hojeTxt = new Date(agora).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="page turma">
      <div className="between" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <p className="faint">🏫 {user.org_nome || 'Creche'} · {hojeTxt}</p>
          <h1>Turma</h1>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setCodigo(true)}>Tenho um código</button>
          <button className="btn primary" onClick={() => setNova(true)}><Plus size={16} /> Criança</button>
        </div>
      </div>

      {lista && lista.length > 0 && (
        <div className="turma-resumo">
          <div><b>{presentes}</b><span>de {lista.length} presentes</span></div>
          <div><b>{dormindo}</b><span>dormindo</span></div>
          <div><b>{lista.length - presentes}</b><span>ausentes</span></div>
        </div>
      )}
      {lista && lista.length > 6 && <input className="input" placeholder="Buscar criança" value={busca} onChange={(e) => setBusca(e.target.value)} />}

      {lista === null ? <p className="faint">Carregando a turma…</p> : !lista.length ? (
        <div className="card">
          <Empty emoji="🏫">
            <b>Cadastre as crianças da turma.</b><br />
            Depois convide os responsáveis de cada uma: eles veem na hora o que a creche registra (chegada, refeições, sono, fraldas) e registram o que acontece em casa.
            <br /><button className="btn primary" style={{ marginTop: 10 }} onClick={() => setNova(true)}><Plus size={16} /> Cadastrar criança</button>
            <br /><span className="faint">A família já usa o Ninho? Peça a ela um convite como "Creche / escola" e toque em "Tenho um código".</span>
          </Empty>
        </div>
      ) : (
        <div className="turma-grade">
          {itens.map((i) => {
            const s = sits.get(i.baby.id)!;
            const marcado = sel.has(i.baby.id);
            const id = idade(i.baby.birth_date, agora);
            return (
              <div key={i.baby.id} className={`card turma-card ${s.presente ? 'presente' : ''} ${marcado ? 'marcado' : ''}`}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  {podeEditar(i) && <label className="turma-check" aria-label={`Selecionar ${i.baby.name}`}><input type="checkbox" checked={marcado} onChange={() => alternarSel(i.baby.id)} /></label>}
                  <button className="turma-nome" onClick={() => onAbrir(i.baby.id)} aria-label={`Abrir ${i.baby.name}`}>
                    <Avatar photo={i.baby.photo} emoji={i.baby.sex === 'M' ? '👦' : i.baby.sex === 'F' ? '👧' : '👶'} color={i.baby.color} size={46} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b>{i.baby.name}</b>
                      <span className="faint" style={{ display: 'block' }}>{id.texto}</span>
                    </span>
                  </button>
                </div>
                <div className="wrap-row" style={{ marginTop: 8 }}>
                  {s.presente
                    ? <span className="chip ok">🏫 desde {hm(s.entrada?.start_at ?? s.pres!.start_at)}</span>
                    : s.saiu ? <span className="chip">👋 saiu {hm(s.pres!.start_at)}</span> : <span className="chip">ausente</span>}
                  {s.sono && <span className="chip info">😴 há {duracao((agora - t(s.sono.start_at)) / MIN)}</span>}
                  {s.fralda && <span className="chip">🧷 {hm(s.fralda.start_at)}</span>}
                  {s.comeu && <span className="chip">🥣 {hm(s.comeu.start_at)}</span>}
                  {!i.responsaveis && i.access === 'admin' && <button className="chip warn" onClick={() => setConvite(i)}><UserPlus size={13} /> convidar responsáveis</button>}
                </div>
                {podeEditar(i) && (
                  <div className="turma-acoes">
                    {s.presente
                      ? <button onClick={() => presenca([i.baby.id], 'saida')}>👋 Saiu</button>
                      : <button className="destaque" onClick={() => presenca([i.baby.id], 'entrada')}>🏫 Chegou</button>}
                    <button onClick={() => sono([i.baby.id], !s.sono)}>{s.sono ? '☀️ Acordou' : '😴 Dormiu'}</button>
                    <button onClick={() => setEscolha({ tipo: 'fralda', ids: [i.baby.id] })}>🧷 Fralda</button>
                    <button onClick={() => setEscolha({ tipo: 'comeu', ids: [i.baby.id] })}>🥣 Comeu</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selIds.length > 0 && (
        <div className="turma-lote" role="region" aria-label="Registrar para as selecionadas">
          <div className="between"><b>{pl(selIds.length, 'criança selecionada', 'crianças selecionadas')}</b><button className="btn sm ghost" onClick={() => setSel(new Set())}>Limpar</button></div>
          <div className="turma-acoes">
            <button onClick={() => presenca(selIds, 'entrada')}>🏫 Chegaram</button>
            <button onClick={() => setEscolha({ tipo: 'comeu', ids: selIds })}>🥣 Comeram</button>
            <button onClick={() => setEscolha({ tipo: 'fralda', ids: selIds })}>🧷 Fralda</button>
            <button onClick={() => sono(selIds, true)}>😴 Dormiram</button>
            <button onClick={() => sono(selIds, false)}>☀️ Acordaram</button>
            <button onClick={() => presenca(selIds, 'saida')}>👋 Saíram</button>
          </div>
        </div>
      )}
      {lista && lista.length > 1 && !selIds.length && <p className="faint" style={{ textAlign: 'center' }}>Dica: marque várias crianças para registrar de uma vez (ex.: todas almoçaram).</p>}

      {escolha?.tipo === 'fralda' && (
        <Sheet title={`🧷 Fralda · ${nomeSel(escolha.ids)}`} onClose={() => setEscolha(null)}>
          <div className="grid g3">
            {([['xixi', '💧 Xixi'], ['coco', '💩 Cocô'], ['ambos', 'Os dois']] as const).map(([v, l]) => (
              <button key={v} className="btn block" style={{ minHeight: 56 }} onClick={() => { const ids = escolha.ids; setEscolha(null); void registrar(ids, (i) => criar(i, 'fralda', { diaper: v }), 'Fralda registrada 🧷'); }}>{l}</button>
            ))}
          </div>
        </Sheet>
      )}
      {escolha?.tipo === 'comeu' && <ComeuSheet ids={escolha.ids} titulo={nomeSel(escolha.ids)} onClose={() => setEscolha(null)} onSalvar={(food, acceptance) => { const ids = escolha.ids; setEscolha(null); void registrar(ids, (i) => criar(i, 'alimentacao', { food, acceptance }), 'Refeição registrada 🥣'); }} />}
      {nova && <NovaCrianca onClose={() => setNova(false)} onCriada={async (item) => {
        setNova(false);
        await carregar();
        conviteAposCriar = { id: item.baby.id, dono: eu.current }; // se a tela for remontada (1ª criança), a nova Turma abre o convite
        await onCriada(item.baby.id);
        // Sem remontagem (já havia crianças), esta tela abre o convite; com remontagem, a nova abre ao carregar
        window.setTimeout(() => { if (montado.current && conviteAposCriar?.id === item.baby.id) { conviteAposCriar = null; setConvite(item); } }, 400);
      }} />}
      {convite && <ConviteResponsaveis item={convite} onClose={() => setConvite(null)} />}
      {codigo && <EntrarComCodigo onClose={() => setCodigo(false)} onOk={async (babyId) => { setCodigo(false); await carregar(); await onCriada(babyId); toast('Criança adicionada à turma 🏫'); }} />}
    </div>
  );
}

function ComeuSheet({ ids, titulo, onClose, onSalvar }: { ids: string[]; titulo: string; onClose: () => void; onSalvar: (food: string, acceptance: EventData['acceptance']) => void }) {
  const h = new Date().getHours();
  const [food, setFood] = useState(h < 10 ? 'Café da manhã' : h < 14 ? 'Almoço' : h < 17 ? 'Lanche' : 'Jantar');
  const [aceit, setAceit] = useState<EventData['acceptance']>('boa');
  return (
    <Sheet title={`🥣 Refeição · ${titulo}`} onClose={onClose} footer={<button className="btn primary" onClick={() => onSalvar(food.trim() || 'Refeição', aceit)}><Check size={16} /> Registrar{ids.length > 1 ? ` para ${ids.length}` : ''}</button>}>
      <Field label="Refeição"><input className="input" value={food} onChange={(e) => setFood(e.target.value)} /></Field>
      <div className="wrap-row">{['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Fruta'].map((x) => <button key={x} className={`chip ${food === x ? 'brand' : ''}`} onClick={() => setFood(x)}>{x}</button>)}</div>
      <Field label="Como comeu"><Choice value={aceit} onChange={setAceit} options={[{ v: 'boa', l: '😋 Bem' }, { v: 'media', l: '😐 Pouco' }, { v: 'recusou', l: '🙅 Recusou' }]} /></Field>
    </Sheet>
  );
}

function NovaCrianca({ onClose, onCriada }: { onClose: () => void; onCriada: (item: ItemTurma) => Promise<void> }) {
  const [f, setF] = useState({ name: '', birth_date: '', sex: undefined as 'F' | 'M' | undefined });
  const [autorizado, setAutorizado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  async function salvar() {
    setErro('');
    if (!f.name.trim()) return setErro('Informe o nome da criança.');
    if (!f.birth_date) return setErro('Informe a data de nascimento.');
    if (!autorizado) return setErro('Confirme que a creche tem autorização dos responsáveis.');
    setBusy(true);
    try {
      const r = await api.createBaby({ name: f.name.trim(), birth_date: f.birth_date, sex: f.sex ?? null, role: 'creche', routine: null, guardian_consent: true });
      await onCriada({ baby: { id: r.id, name: f.name.trim(), birth_date: f.birth_date, sex: f.sex ?? null, settings: {} } as ItemTurma['baby'], role: 'creche', access: 'admin', events: [], responsaveis: 0 });
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    setBusy(false);
  }
  return (
    <Sheet title="Nova criança na turma" onClose={onClose} footer={<button className="btn primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Cadastrar'}</button>}>
      <Field label="Nome da criança"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex.: Lia Souza" /></Field>
      <div className="grid g2">
        <Field label="Nascimento" hint={f.birth_date ? idade(f.birth_date).texto : undefined}><input className="input" type="date" value={f.birth_date} max={ymd(Date.now())} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></Field>
        <Field label="Sexo"><Choice value={f.sex} onChange={(v) => setF({ ...f, sex: v })} options={[{ v: 'F', l: 'Menina' }, { v: 'M', l: 'Menino' }]} /></Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} />
        <span>A creche tem autorização dos responsáveis por esta criança para registrar a rotina dela no Ninho, compartilhada só com eles e com a equipe que eu convidar.</span>
      </label>
      {erro && <div className="chip bad" style={{ whiteSpace: 'normal' }}>{erro}</div>}
      <p className="faint">Em seguida você gera o convite para os responsáveis.</p>
    </Sheet>
  );
}

const RESP = ['mae', 'pai', 'avo_f', 'avo_m', 'outro'];
function ConviteResponsaveis({ item, onClose }: { item: ItemTurma; onClose: () => void }) {
  const [role, setRole] = useState('mae');
  const [cod, setCod] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const nome = item.baby.name.split(' ')[0];
  const texto = cod ? `Olá! A creche passou a registrar a rotina de ${nome} no app Ninho: chegada e saída, refeições, sono e fraldas, em tempo real. 👶\n\nToque no link para acompanhar (e registrar o que acontece em casa): ${location.origin}${location.pathname}?convite=${cod}\n\nSe pedir, o código é ${cod} (vale 7 dias).` : '';
  async function gerar() {
    setErro('');
    try { setCod((await api.invite(item.baby.id, role, 'admin')).code); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
  }
  return (
    <Sheet title={`Convidar responsáveis · ${nome}`} onClose={onClose}>
      <p className="faint">Os responsáveis entram como administradores do perfil de {nome}: veem tudo o que a creche registra, registram o que acontece em casa e podem convidar outros familiares. Gere um convite para cada pessoa.</p>
      <Field label="Quem é"><div className="choice">{PAPEIS.filter((p) => RESP.includes(p.id)).map((p) => <button key={p.id} className={role === p.id ? 'on' : ''} onClick={() => { setRole(p.id); setCod(null); }}>{p.emoji} {p.id === 'outro' ? 'Outro responsável' : p.label}</button>)}</div></Field>
      {!cod ? <button className="btn primary block" onClick={gerar}>Gerar convite</button> : (
        <div className="card" style={{ textAlign: 'center', background: 'var(--brand-soft)', borderColor: 'transparent' }}>
          <p className="faint">Código válido por 7 dias, uso único</p>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 6, color: 'var(--brand-ink)' }}>{cod}</div>
          <div className="wrap-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button className="btn sm" onClick={() => navigator.clipboard?.writeText(texto)}><Copy size={14} /> Copiar</button>
            <a className="btn sm primary" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><Share2 size={14} /> WhatsApp</a>
          </div>
          <button className="linkbtn" onClick={() => setCod(null)}>Gerar outro convite</button>
        </div>
      )}
      {erro && <div className="chip bad" style={{ whiteSpace: 'normal' }}>{erro}</div>}
    </Sheet>
  );
}

function EntrarComCodigo({ onClose, onOk }: { onClose: () => void; onOk: (babyId: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  async function entrar() {
    setBusy(true); setErro('');
    try { await onOk((await api.acceptInvite(code, 'creche')).babyId); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    setBusy(false);
  }
  return (
    <Sheet title="Entrar com código da família" onClose={onClose} footer={<button className="btn primary" disabled={busy || code.length < 6} onClick={entrar}>Adicionar à turma</button>}>
      <p className="faint">Quando a família já usa o Ninho, ela gera um convite em Casa → Família → Convidar, escolhendo "Creche / escola". Digite o código aqui.</p>
      <Field label="Código de convite"><input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} placeholder="ex.: K7P2QX" style={{ letterSpacing: 4, fontWeight: 800 }} /></Field>
      {erro && <div className="chip bad" style={{ whiteSpace: 'normal' }}>{erro}</div>}
    </Sheet>
  );
}
