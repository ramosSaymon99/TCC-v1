import { useState } from 'react';
import { Check, Minus, Pin, PinOff, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { CATEGORIAS_MURAL, papel } from '../lib/constants';
import { coberturaDias, statusSupply } from '../lib/metrics';
import { dataCurta, t } from '../lib/time';
import type { Supply } from '../types';
import { Empty, Field, Seg, Sheet } from '../components/ui';
import { Avatar } from '../components/Avatar';

export function Mural() {
  const { data, act, podeEditar, user, nome, agora } = useApp();
  const [aba, setAba] = useState<'materiais' | 'compras' | 'recados'>('materiais');
  const [edit, setEdit] = useState<Supply | 'novo' | null>(null);
  const [texto, setTexto] = useState('');
  const babyId = data.baby.id;

  const compras = data.supplies.filter((s) => statusSupply(s) !== 'ok' || (coberturaDias(s, data.events, agora) ?? 99) < 3);
  const porCat = CATEGORIAS_MURAL.map((c) => ({ c, itens: data.supplies.filter((s) => (s.category || 'Outros') === c) })).filter((g) => g.itens.length);
  const mudarQtd = (s: Supply, delta: number) => act(() => api.update('supplies', babyId, s.id, { qty: Math.max(0, s.qty + delta) }));
  const assumir = (s: Supply) => act(() => api.update('supplies', babyId, s.id, { buyer_id: s.buyer_id === user.id ? null : user.id }), s.buyer_id === user.id ? 'Compra liberada' : 'Combinado: você compra 🛒');

  async function addRecado() {
    if (!texto.trim()) return;
    if (await act(() => api.create('notes', babyId, { text: texto.trim(), pinned: 0, done: 0 }), 'Recado publicado')) setTexto('');
  }

  return (
    <div className="page">
      <div className="between" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1>Mural</h1>
          <p className="faint">Materiais de uso, lista de compras e recados entre cuidadores</p>
        </div>
        {podeEditar && aba !== 'recados' && <button className="btn primary" onClick={() => setEdit('novo')}><Plus size={16} /> Material</button>}
      </div>

      <div className="grid g3">
        <div className="card kpi"><div className="lab">Itens</div><div className="val">{data.supplies.length}</div><div className="sub">no mural</div></div>
        <div className="card kpi"><div className="lab">Para comprar</div><div className="val" style={{ color: compras.length ? 'var(--warn)' : undefined }}>{compras.length}</div><div className="sub">{compras.filter((c) => !c.buyer_id).length} sem responsável</div></div>
        <div className="card kpi"><div className="lab">Recados</div><div className="val">{data.notes.filter((n) => !n.done).length}</div><div className="sub">abertos</div></div>
      </div>

      <Seg value={aba} onChange={setAba} options={[{ v: 'materiais', l: '🧺 Materiais' }, { v: 'compras', l: `🛒 Compras (${compras.length})` }, { v: 'recados', l: '📌 Recados' }]} />

      {aba === 'materiais' && (porCat.length ? porCat.map(({ c, itens }) => (
        <div key={c} className="card">
          <div className="card-h"><h2>{c}</h2><span className="faint">{itens.length} item(ns)</span></div>
          {itens.map((s) => {
            const st = statusSupply(s);
            const cob = coberturaDias(s, data.events, agora);
            return (
              <div key={s.id} className="list-item">
                <div className="grow" onClick={() => podeEditar && setEdit(s)} style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <b>{s.name}</b>
                    {st === 'acabou' && <span className="chip bad">acabou</span>}
                    {st === 'baixo' && <span className="chip warn">baixo</span>}
                    {s.auto_type === 'fralda' && <span className="chip info">baixa automática</span>}
                  </div>
                  <div className="faint">
                    mínimo {s.min_qty} {s.unit || 'un'}
                    {cob != null && ` · dura ~${cob < 1 ? 'menos de 1 dia' : `${cob.toFixed(1)} dias`}`}
                    {s.buyer_id && ` · 🛒 ${nome(s.buyer_id)}`}
                    {s.note && ` · ${s.note}`}
                  </div>
                </div>
                {podeEditar && <button className="icon-btn" onClick={() => mudarQtd(s, -1)} aria-label="Usar 1"><Minus size={16} /></button>}
                <span className="tag-stock" style={{ color: st === 'ok' ? undefined : st === 'baixo' ? 'var(--warn)' : 'var(--bad)' }}>{s.qty}</span>
                {podeEditar && <button className="icon-btn" onClick={() => mudarQtd(s, 1)} aria-label="Adicionar 1"><Plus size={16} /></button>}
              </div>
            );
          })}
        </div>
      )) : <div className="card"><Empty emoji="🧺">Cadastre fraldas, lenços, fórmula, remédios e roupas para todos saberem o que tem e o que falta.</Empty></div>)}

      {aba === 'compras' && (
        <div className="card">
          <div className="card-h"><h2>Lista de compras</h2><ShoppingCart size={18} /></div>
          {compras.length ? compras.map((s) => {
            const cob = coberturaDias(s, data.events, agora);
            const sugestao = Math.max(s.min_qty * 2 - s.qty, 1);
            return (
              <div key={s.id} className="list-item">
                <div className="grow">
                  <b>{s.name}</b>
                  <div className="faint">Tem {s.qty} · mínimo {s.min_qty}{cob != null ? ` · acaba em ~${cob.toFixed(1)} dias` : ''} · sugestão: comprar {sugestao} {s.unit || 'un'}</div>
                  <div className="faint">{s.buyer_id ? `🛒 ${s.buyer_id === user.id ? 'Você vai comprar' : `${nome(s.buyer_id)} vai comprar`}` : '⚠️ Ninguém assumiu ainda'}</div>
                </div>
                {podeEditar && (
                  <div className="stack" style={{ gap: 6 }}>
                    <button className={`btn sm ${s.buyer_id === user.id ? '' : 'primary'}`} onClick={() => assumir(s)}>{s.buyer_id === user.id ? 'Desistir' : 'Eu compro'}</button>
                    <button className="btn sm" onClick={() => act(() => api.update('supplies', babyId, s.id, { qty: s.qty + sugestao, buyer_id: null }), `Comprado: +${sugestao} ${s.unit || 'un'}`)}><Check size={14} /> Comprado</button>
                  </div>
                )}
              </div>
            );
          }) : <Empty emoji="✅">Nada para comprar agora.</Empty>}
        </div>
      )}

      {aba === 'recados' && (
        <>
          {podeEditar && (
            <div className="card stack">
              <textarea className="input" placeholder="Escreva um recado para os cuidadores… (ex.: remédio às 14h, levar o casaco)" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={addRecado} disabled={!texto.trim()}>Publicar</button></div>
            </div>
          )}
          {data.notes.length ? (
            <div className="grid md2">
              {[...data.notes].sort((a, b) => b.pinned - a.pinned || a.done - b.done || t(b.created_at) - t(a.created_at)).map((n) => {
                const m = data.members.find((x) => x.user_id === n.user_id);
                return (
                  <div key={n.id} className={`note ${n.done ? 'done' : ''}`}>
                    <div style={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>{n.text}</div>
                    <div className="between" style={{ marginTop: 8 }}>
                      <span className="row" style={{ fontSize: 12, opacity: 0.8, gap: 6 }}>{m && <Avatar photo={m.photo} emoji={papel(m.role).emoji} size={22} />} {nome(n.user_id)} · {dataCurta(t(n.created_at))}</span>
                      {podeEditar && (
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn sm ghost" title={n.pinned ? 'Desafixar' : 'Fixar'} onClick={() => act(() => api.update('notes', babyId, n.id, { pinned: n.pinned ? 0 : 1 }))}>{n.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
                          <button className="btn sm ghost" title="Concluído" onClick={() => act(() => api.update('notes', babyId, n.id, { done: n.done ? 0 : 1 }))}><Check size={14} /></button>
                          <button className="btn sm ghost" title="Excluir" onClick={() => confirm('Excluir recado?') && act(() => api.remove('notes', babyId, n.id))}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <div className="card"><Empty emoji="📌">Nenhum recado ainda.</Empty></div>}
        </>
      )}

      {edit && <SupplySheet item={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SupplySheet({ item, onClose }: { item: Supply | null; onClose: () => void }) {
  const { data, act } = useApp();
  const [f, setF] = useState({
    name: item?.name ?? '', category: item?.category ?? CATEGORIAS_MURAL[0], unit: item?.unit ?? 'un', qty: item?.qty ?? 0, min_qty: item?.min_qty ?? 1,
    auto_type: item?.auto_type ?? null as string | null, per_use: item?.per_use ?? 1, buyer_id: item?.buyer_id ?? null as string | null, note: item?.note ?? '',
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  async function salvar() {
    if (!f.name.trim()) return alert('Informe o nome do material.');
    const body = { ...f, name: f.name.trim(), qty: Number(f.qty) || 0, min_qty: Number(f.min_qty) || 0, per_use: Number(f.per_use) || 1, note: f.note || null };
    if (await act(() => (item ? api.update('supplies', data.baby.id, item.id, body) : api.create('supplies', data.baby.id, body)), 'Mural atualizado')) onClose();
  }
  return (
    <Sheet title={item ? 'Editar material' : 'Novo material'} onClose={onClose} footer={<>
      {item && <button className="btn danger" onClick={async () => confirm('Remover do mural?') && (await act(() => api.remove('supplies', data.baby.id, item.id), 'Removido')) && onClose()}><Trash2 size={16} /> Remover</button>}
      <button className="btn primary" onClick={salvar}>Salvar</button>
    </>}>
      <Field label="Material"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex.: Fralda tamanho M" /></Field>
      <div className="grid g2">
        <Field label="Categoria"><select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>{CATEGORIAS_MURAL.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Unidade"><input className="input" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="un, pacote, lata…" /></Field>
        <Field label="Quantidade atual"><input className="input" type="number" inputMode="decimal" value={f.qty} onChange={(e) => set({ qty: Number(e.target.value) })} /></Field>
        <Field label="Estoque mínimo" hint="Abaixo disso entra na lista de compras"><input className="input" type="number" inputMode="decimal" value={f.min_qty} onChange={(e) => set({ min_qty: Number(e.target.value) })} /></Field>
      </div>
      <label className="row" style={{ fontWeight: 700, gap: 10 }}>
        <input type="checkbox" checked={f.auto_type === 'fralda'} onChange={(e) => set({ auto_type: e.target.checked ? 'fralda' : null })} style={{ width: 20, height: 20 }} />
        Dar baixa automática a cada troca de fralda registrada
      </label>
      {f.auto_type === 'fralda' && <Field label="Consumo por troca"><input className="input" type="number" value={f.per_use} onChange={(e) => set({ per_use: Number(e.target.value) })} /></Field>}
      <Field label="Quem compra">
        <select className="input" value={f.buyer_id ?? ''} onChange={(e) => set({ buyer_id: e.target.value || null })}>
          <option value="">Ninguém definido</option>
          {data.members.map((m) => <option key={m.user_id} value={m.user_id}>{papel(m.role).label} · {m.name}</option>)}
        </select>
      </Field>
      <Field label="Observação"><input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Marca, onde comprar, tamanho…" /></Field>
    </Sheet>
  );
}
