import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { leiteGuardado } from '../lib/previsao';
import { duracao, fromLocalInput, hm, toLocalInput } from '../lib/time';
import { Choice, Empty, Field, Sheet } from './ui';

/** Estoque de leite materno extraído: cada frasco com validade (geladeira 12 h, congelador 15 dias). */
export function LeiteMaterno() {
  const { data, agora, act, podeEditar, nome } = useApp();
  const [novo, setNovo] = useState(false);
  const frascos = leiteGuardado(data.milk, agora);
  const totalMl = frascos.filter((f) => !f.vencido).reduce((s, f) => s + f.ml, 0);
  const usar = (id: string) => act(() => api.update('milk', data.baby.id, id, { used_at: new Date().toISOString() }), 'Frasco usado ✓', () => api.update('milk', data.baby.id, id, { used_at: null }));
  const descartar = (id: string) => act(() => api.remove('milk', data.baby.id, id), 'Frasco descartado');
  const restante = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} dias` : duracao(h * 60));
  return (
    <div className="card">
      <div className="card-h"><h2>🥛 Leite materno guardado</h2>{podeEditar && <button className="btn sm primary" onClick={() => setNovo(true)}><Plus size={14} /> Frasco</button>}</div>
      <p className="faint" style={{ marginBottom: 8 }}>{frascos.length ? `${frascos.filter((f) => !f.vencido).length} frasco(s) válidos · ${totalMl} ml. Use primeiro o que vence antes.` : 'Ao registrar uma extração, escolha "geladeira" ou "congelador" e o frasco aparece aqui.'}</p>
      {frascos.length ? frascos.map((f, i) => (
        <div key={f.id} className="list-item">
          <div className="tl-ico" style={{ background: f.vencido ? 'var(--bad-soft)' : f.vencendo ? 'var(--warn-soft)' : 'var(--info-soft)' }}>{f.place === 'congelador' ? '❄️' : '🧊'}</div>
          <div className="grow">
            <b>{f.ml} ml</b> <span className="faint">· {f.place === 'congelador' ? 'congelador' : 'geladeira'}{i === 0 && !f.vencido ? ' · usar primeiro' : ''}</span>
            <div className="faint">extraído {new Date(f.collected_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {nome(f.user_id).split(' ')[0]}</div>
            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span className={`chip ${f.vencido ? 'bad' : f.vencendo ? 'warn' : ''}`}>{f.vencido ? 'vencido' : `vence em ${restante(f.restaH)}`}</span>
              {podeEditar && !f.vencido && <button className="btn sm" onClick={() => usar(f.id)}>Usar</button>}
              {podeEditar && <button className="icon-btn" aria-label="Descartar" onClick={() => descartar(f.id)}><Trash2 size={15} /></button>}
            </div>
          </div>
        </div>
      )) : <Empty emoji="🍼">Nenhum frasco guardado.</Empty>}
      <p className="disclaimer">Validade do leite cru: até 12 h na geladeira e até 15 dias no congelador ou freezer (Rede Brasileira de Bancos de Leite Humano). Descongele na geladeira e não recongele.</p>
      {novo && <NovoFrasco onClose={() => setNovo(false)} />}
      {frascos.some((f) => f.vencendo) && <p className="faint">⏰ {frascos.filter((f) => f.vencendo).map((f) => `${f.ml} ml vence às ${hm(f.vence)}`).join(' · ')}</p>}
    </div>
  );
}

function NovoFrasco({ onClose }: { onClose: () => void }) {
  const { data, act } = useApp();
  const [f, setF] = useState({ ml: '', quando: toLocalInput(Date.now()), place: 'geladeira' as 'geladeira' | 'congelador' });
  async function salvar() {
    const ml = Number(f.ml);
    if (!ml) return alert('Informe a quantidade em ml.');
    if (await act(() => api.create('milk', data.baby.id, { ml, collected_at: fromLocalInput(f.quando), place: f.place }), 'Frasco guardado ✓')) onClose();
  }
  return (
    <Sheet title="Novo frasco de leite" onClose={onClose} footer={<button className="btn primary" onClick={salvar}>Salvar</button>}>
      <div className="grid g2">
        <Field label="Quantidade (ml)"><input className="input" type="number" inputMode="numeric" value={f.ml} onChange={(e) => setF({ ...f, ml: e.target.value })} placeholder="ex.: 120" /></Field>
        <Field label="Extraído em"><input className="input" type="datetime-local" value={f.quando} onChange={(e) => setF({ ...f, quando: e.target.value })} /></Field>
      </div>
      <Field label="Onde"><Choice value={f.place} onChange={(v) => setF({ ...f, place: v })} options={[{ v: 'geladeira', l: '🧊 Geladeira' }, { v: 'congelador', l: '❄️ Congelador' }]} /></Field>
    </Sheet>
  );
}
