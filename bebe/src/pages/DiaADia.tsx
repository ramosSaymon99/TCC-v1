import { useMemo, useRef, useState } from 'react';
import { Camera, Heart, PartyPopper, Pencil, Trash2, X } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { papel } from '../lib/constants';
import { MARCOS } from '../lib/conteudo';
import { prepararFotoPost } from '../lib/image';
import { compartilharCartao, gerarCartao } from '../lib/cartao';
import { DIA, dataBr, dataCurta, diaSemana, fromLocalInput, hm, idade, parseYmd, startOfDay, t, toLocalInput, uid } from '../lib/time';
import type { Post } from '../types';
import { Avatar } from '../components/Avatar';
import { Empty, Field, Sheet } from '../components/ui';
import { DicaUnica } from '../components/Guia';

/** Dia a dia: fotos do bebê compartilhadas só com a família, com curtidas, marcos e o cartão de mêsversário. */
export function DiaADia() {
  const { data, user, agora, podeEditar, podeAdmin, act, nome, toast } = useApp();
  const { baby, posts } = data;
  const primeiro = baby.name.split(' ')[0];
  const gestacao = !!baby.settings?.gestacao;
  const id = idade(baby.birth_date, agora);
  const [nova, setNova] = useState<{ foto: string; taken: string } | null>(null);
  const [editar, setEditar] = useState<Post | null>(null);
  const [ver, setVer] = useState<Post | null>(null);
  const [gerando, setGerando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Mêsversário: no dia (±3 dias) em que completa mais um mês
  const nasc = new Date(parseYmd(baby.birth_date));
  const diaMes = nasc.getDate();
  const hoje = new Date(agora);
  const pertoMesversario = !gestacao && id.meses >= 1 && id.meses < 24 && Math.abs(hoje.getDate() - diaMes) <= 3;

  const grupos = useMemo(() => {
    const m = new Map<number, Post[]>();
    for (const p of posts) {
      const d = startOfDay(t(p.taken_at));
      m.set(d, [...(m.get(d) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [posts]);
  const marcos = data.checks.filter((c) => c.kind === 'marco' && c.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  async function escolher(f: File | undefined) {
    if (!f) return;
    try {
      const foto = await prepararFotoPost(f);
      // Data da foto: a do arquivo, se for recente; senão, agora
      const quando = f.lastModified && f.lastModified > agora - 60 * DIA && f.lastModified <= agora ? f.lastModified : agora;
      setNova({ foto, taken: toLocalInput(quando) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível usar esta foto.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }
  async function cartao() {
    setGerando(true);
    try {
      const blob = await gerarCartao(data, agora);
      const r = await compartilharCartao(blob, primeiro);
      api.uso('cartao_mesversario', r, baby.id);
      if (r === 'baixado') toast('Cartão salvo nos downloads 🎉');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar o cartão.');
    }
    setGerando(false);
  }
  const curtir = (p: Post) => act(() => api.likePost(baby.id, p.id));

  return (
    <div className="page">
      <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>Dia a dia</h1>
          <p className="faint">{gestacao ? `Fotos da barriga e da espera por ${primeiro}` : `Fotos do dia a dia de ${primeiro}`}, vistas só pela família.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {!gestacao && <button className="btn" disabled={gerando} onClick={cartao}><PartyPopper size={16} /> {gerando ? 'Gerando…' : `Cartão de ${id.meses >= 1 ? `${id.meses} ${id.meses === 1 ? 'mês' : 'meses'}` : `${id.dias} dias`}`}</button>}
          {podeEditar && (
            <label className="btn primary">
              <Camera size={16} /> Postar foto
              <input ref={input} type="file" accept="image/*" hidden onChange={(e) => escolher(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>

      <DicaUnica id="diario">As fotos ficam guardadas por dia e só os cuidadores de {primeiro} veem. Toque no ❤️ para curtir e, no mêsversário, gere um cartão para compartilhar.</DicaUnica>

      {pertoMesversario && (
        <div className="card mesversario">
          <div className="row" style={{ gap: 14 }}>
            <div style={{ fontSize: 40 }}>🎂</div>
            <div className="grow">
              <b>{hoje.getDate() === diaMes ? `Hoje ${primeiro} completa ${id.meses} ${id.meses === 1 ? 'mês' : 'meses'}!` : `Mêsversário de ${id.meses} ${id.meses === 1 ? 'mês' : 'meses'}`}</b>
              <div className="faint">Gere um cartão com foto, peso, altura e conquistas do mês para compartilhar.</div>
            </div>
            <button className="btn primary" disabled={gerando} onClick={cartao}>Gerar cartão</button>
          </div>
        </div>
      )}

      {marcos.length > 0 && (
        <div className="card">
          <div className="card-h"><h2>⭐ Momentos marcantes</h2><span className="faint">marcos registrados em Saúde</span></div>
          <div className="wrap-row">
            {marcos.slice(0, 8).map((m) => <span key={m.id} className="chip brand">{MARCOS.find((x) => x.code === m.code)?.nome.split(' (')[0] ?? m.code} · {dataBr(m.date!)}</span>)}
          </div>
        </div>
      )}

      {grupos.length ? grupos.map(([dia, lista]) => (
        <section key={dia} className="stack" style={{ gap: 10 }}>
          <h3 className="dia-titulo">{dia === startOfDay(agora) ? 'Hoje' : dia === startOfDay(agora) - DIA ? 'Ontem' : `${diaSemana(dia)}, ${dataCurta(dia)}`}{!gestacao && dia >= parseYmd(baby.birth_date) && <span className="faint"> · {idade(baby.birth_date, dia).texto}</span>}</h3>
          <div className="feed">
            {lista.map((p) => {
              const m = data.members.find((x) => x.user_id === p.user_id);
              const curtido = p.likes.includes(user.id);
              const meu = p.user_id === user.id;
              return (
                <article key={p.id} className="post">
                  <button className="post-foto" onClick={() => setVer(p)} aria-label="Ver foto em tela cheia">
                    {p.photo ? <img src={p.photo} alt={p.caption || `Foto de ${primeiro}`} loading="lazy" /> : <div className="faint" style={{ padding: 40 }}>Foto indisponível</div>}
                  </button>
                  <div className="post-corpo">
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar photo={m?.photo} emoji={papel(m?.role).emoji} size={28} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b>{nome(p.user_id).split(' ')[0]}</b> <span className="faint">· {hm(p.taken_at)}</span>
                      </div>
                      {(meu || podeAdmin) && podeEditar && <button className="icon-btn" aria-label="Editar legenda" onClick={() => setEditar(p)}><Pencil size={15} /></button>}
                    </div>
                    {p.caption && <p className="legenda">{p.caption}</p>}
                    <div className="row" style={{ gap: 8 }}>
                      <button className={`curtir ${curtido ? 'on' : ''}`} onClick={() => curtir(p)} aria-pressed={curtido}>
                        <Heart size={16} fill={curtido ? 'currentColor' : 'none'} /> {p.likes.length || ''}
                      </button>
                      {p.likes.length > 0 && <span className="faint" style={{ fontSize: 12 }}>{p.likes.map((u) => (u === user.id ? 'você' : nome(u).split(' ')[0])).join(', ')}</span>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )) : (
        <div className="card">
          <Empty emoji="📸">
            {podeEditar ? <>Poste a primeira foto de {primeiro}! Ela fica guardada aqui, por dia, e só a família vê.<br /><button className="btn sm primary" style={{ marginTop: 10 }} onClick={() => input.current?.click()}><Camera size={14} /> Escolher foto</button></> : 'Ainda não há fotos.'}
          </Empty>
        </div>
      )}

      {nova && <NovaFoto foto={nova.foto} taken={nova.taken} onClose={() => setNova(null)} />}
      {editar && <EditarFoto post={editar} onClose={() => setEditar(null)} />}
      {ver && (
        <div className="visor" onClick={() => setVer(null)} role="dialog" aria-modal="true">
          <button className="icon-btn visor-fechar" aria-label="Fechar"><X size={20} /></button>
          {ver.photo && <img src={ver.photo} alt={ver.caption || ''} />}
          {ver.caption && <p>{ver.caption}</p>}
        </div>
      )}
    </div>
  );
}

function NovaFoto({ foto, taken, onClose }: { foto: string; taken: string; onClose: () => void }) {
  const { data, act } = useApp();
  const [legenda, setLegenda] = useState('');
  const [quando, setQuando] = useState(taken);
  const [enviando, setEnviando] = useState(false);
  async function postar() {
    setEnviando(true);
    const ok = await act(() => api.createPost(data.baby.id, { id: uid(), photo: foto, caption: legenda.trim() || undefined, taken_at: fromLocalInput(quando) }), 'Foto postada 📸');
    setEnviando(false);
    if (ok) onClose();
  }
  return (
    <Sheet title="Nova foto" onClose={onClose} footer={<button className="btn primary" disabled={enviando} onClick={postar}>{enviando ? 'Enviando…' : 'Postar'}</button>}>
      <img src={foto} alt="Prévia" className="previa-post" />
      <Field label="Legenda"><textarea className="input" value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="ex.: Primeiro banho de sol ☀️" maxLength={500} /></Field>
      <Field label="Quando foi"><input className="input" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></Field>
      <p className="faint">A foto é reduzida para economizar internet e fica visível só para os cuidadores deste bebê.</p>
    </Sheet>
  );
}

function EditarFoto({ post, onClose }: { post: Post; onClose: () => void }) {
  const { data, act } = useApp();
  const [legenda, setLegenda] = useState(post.caption ?? '');
  const [quando, setQuando] = useState(toLocalInput(t(post.taken_at)));
  return (
    <Sheet title="Editar foto" onClose={onClose} footer={<>
      <button className="btn danger" onClick={async () => confirm('Excluir esta foto para todos?') && (await act(() => api.removePost(data.baby.id, post.id), 'Foto excluída')) && onClose()}><Trash2 size={16} /> Excluir</button>
      <button className="btn primary" onClick={async () => (await act(() => api.updatePost(data.baby.id, post.id, { caption: legenda, taken_at: fromLocalInput(quando) }), 'Foto atualizada')) && onClose()}>Salvar</button>
    </>}>
      {post.photo && <img src={post.photo} alt="" className="previa-post" />}
      <Field label="Legenda"><textarea className="input" value={legenda} onChange={(e) => setLegenda(e.target.value)} maxLength={500} /></Field>
      <Field label="Quando foi"><input className="input" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></Field>
    </Sheet>
  );
}
