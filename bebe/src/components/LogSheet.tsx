import { useState } from 'react';
import { Play, Trash2 } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { TIPOS } from '../lib/constants';
import { MIN, fromLocalInput, t, toLocalInput, uid } from '../lib/time';
import type { BabyEvent, EventData, EventType } from '../types';
import { Choice, Field, Sheet } from './ui';

const COM_TIMER: EventType[] = ['mamada', 'sono'];

export function LogSheet({ tipo, ev, onClose }: { tipo: EventType; ev?: BabyEvent; onClose: () => void }) {
  const { data, act, podeEditar, nome } = useApp();
  const agora = Date.now();
  const novo = !ev;
  const [modo, setModo] = useState<'timer' | 'manual'>(novo && COM_TIMER.includes(tipo) ? 'timer' : 'manual');
  const [ini, setIni] = useState(toLocalInput(ev ? t(ev.start_at) : agora - (tipo === 'sono' ? 60 : tipo === 'mamada' ? 15 : 0) * MIN));
  const [fim, setFim] = useState(ev?.end_at ? toLocalInput(t(ev.end_at)) : ev ? '' : toLocalInput(agora));
  const [d, setD] = useState<EventData>(ev?.data ?? (tipo === 'fralda' ? { diaper: 'xixi' } : tipo === 'mamadeira' ? { milk: 'materno' } : tipo === 'mamada' ? { side: 'E' } : {}));
  const [note, setNote] = useState(ev?.note ?? '');
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<EventData>) => setD((x) => ({ ...x, ...p }));
  const info = TIPOS[tipo];
  const usaFim = COM_TIMER.includes(tipo) || tipo === 'banho';

  // Sugestão de lado: o oposto do último registrado
  const ultimoLado = data.events.filter((e) => e.type === 'mamada' && e.id !== ev?.id).sort((a, b) => t(b.start_at) - t(a.start_at))[0]?.data?.side;

  async function salvar() {
    setSalvando(true);
    const timer = novo && modo === 'timer';
    const body = {
      type: tipo,
      start_at: timer ? new Date().toISOString() : fromLocalInput(ini),
      end_at: timer ? null : usaFim ? (fim ? fromLocalInput(fim) : null) : null,
      data: d,
      note: note.trim() || null,
    };
    if (body.end_at && body.end_at < body.start_at) {
      setSalvando(false);
      alert('O término não pode ser antes do início.');
      return;
    }
    const babyId = data.baby.id;
    const novoId = uid();
    const anterior = ev && { type: ev.type, start_at: ev.start_at, end_at: ev.end_at ?? null, data: ev.data, note: ev.note ?? null };
    const ok = await act(
      () => (ev ? api.update('events', babyId, ev.id, body) : api.create('events', babyId, { id: novoId, ...body })),
      ev ? 'Registro alterado ✓' : timer ? `${info.label} iniciada ⏱️` : 'Registro salvo ✓',
      ev ? () => api.update('events', babyId, ev.id, anterior!) : () => api.remove('events', babyId, novoId),
    );
    setSalvando(false);
    if (ok) onClose();
  }
  async function excluir() {
    if (!ev) return;
    const copia = { id: ev.id, type: ev.type, start_at: ev.start_at, end_at: ev.end_at ?? null, data: ev.data, note: ev.note ?? null };
    if (await act(() => api.remove('events', data.baby.id, ev.id), 'Registro excluído', () => api.create('events', data.baby.id, copia))) onClose();
  }

  return (
    <Sheet
      title={<span>{info.emoji} {ev ? 'Editar' : 'Registrar'} {info.label.toLowerCase()}</span>}
      onClose={onClose}
      footer={podeEditar && (
        <>
          {ev && <button className="btn danger" onClick={excluir}><Trash2 size={16} /> Excluir</button>}
          <button className="btn primary" disabled={salvando} onClick={salvar}>
            {novo && modo === 'timer' ? <><Play size={16} /> Iniciar agora</> : 'Salvar'}
          </button>
        </>
      )}
    >
      {!podeEditar && <div className="chip warn">Seu acesso é somente leitura.</div>}
      {ev && <p className="faint">Registrado por {nome(ev.user_id)}</p>}

      {novo && COM_TIMER.includes(tipo) && (
        <Choice value={modo} onChange={setModo} options={[{ v: 'timer', l: '⏱️ Cronometrar agora' }, { v: 'manual', l: '✍️ Já aconteceu' }]} />
      )}

      {tipo === 'mamada' && (
        <Field label="Peito" hint={ultimoLado && novo ? `Última mamada: ${ultimoLado === 'E' ? 'esquerdo' : ultimoLado === 'D' ? 'direito' : 'ambos'} — comece pelo outro.` : undefined}>
          <Choice value={d.side} onChange={(v) => set({ side: v })} options={[{ v: 'E', l: 'Esquerdo' }, { v: 'D', l: 'Direito' }, { v: 'ambos', l: 'Ambos' }]} />
        </Field>
      )}

      {(modo === 'manual' || !novo) && (
        <div className={`grid ${usaFim ? 'g2' : ''}`}>
          <Field label={usaFim ? 'Início' : 'Horário'}><input className="input" type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
          {usaFim && <Field label="Término" hint={!fim ? 'Vazio = em andamento' : undefined}><input className="input" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></Field>}
        </div>
      )}

      {(tipo === 'mamadeira' || tipo === 'extracao') && (
        <Field label="Quantidade (ml)">
          <input className="input" type="number" inputMode="numeric" min={0} value={d.ml ?? ''} onChange={(e) => set({ ml: e.target.value ? Number(e.target.value) : undefined })} placeholder="ex.: 120" />
        </Field>
      )}
      {tipo === 'mamadeira' && (
        <Field label="Leite"><Choice value={d.milk} onChange={(v) => set({ milk: v })} options={[{ v: 'materno', l: 'Materno' }, { v: 'formula', l: 'Fórmula' }]} /></Field>
      )}

      {tipo === 'sono' && (
        <Field label="Como foi"><Choice value={d.quality} onChange={(v) => set({ quality: v })} options={[{ v: 'tranquilo', l: '😌 Tranquilo' }, { v: 'agitado', l: '😣 Agitado' }]} /></Field>
      )}

      {tipo === 'fralda' && (
        <>
          <Field label="Fralda">
            <Choice value={d.diaper} onChange={(v) => set({ diaper: v })} options={[{ v: 'xixi', l: '💧 Xixi' }, { v: 'coco', l: '💩 Cocô' }, { v: 'ambos', l: '💧💩 Ambos' }, { v: 'seca', l: 'Seca' }]} />
          </Field>
          {(d.diaper === 'coco' || d.diaper === 'ambos') && (
            <div className="grid g2">
              <Field label="Consistência">
                <select className="input" value={d.consistency ?? ''} onChange={(e) => set({ consistency: e.target.value || undefined })}>
                  <option value="">—</option>{['líquido', 'pastoso', 'firme', 'com muco'].map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Cor">
                <select className="input" value={d.color ?? ''} onChange={(e) => set({ color: e.target.value || undefined })}>
                  <option value="">—</option>{['amarelo', 'verde', 'marrom', 'escuro', 'outra'].map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          )}
          {data.supplies.some((s) => s.auto_type === 'fralda') && novo && <p className="faint">Dá baixa automática de 1 fralda no Mural.</p>}
        </>
      )}

      {tipo === 'remedio' && (
        <div className="grid g2">
          <Field label="Remédio / suplemento"><input className="input" value={d.med ?? ''} onChange={(e) => set({ med: e.target.value })} placeholder="ex.: Vitamina D" list="meds" /></Field>
          <Field label="Dose"><input className="input" value={d.dose ?? ''} onChange={(e) => set({ dose: e.target.value })} placeholder="ex.: 2 gotas" /></Field>
          <datalist id="meds">{[...new Set(data.events.filter((e) => e.type === 'remedio' && e.data?.med).map((e) => e.data.med!))].map((m) => <option key={m} value={m} />)}</datalist>
        </div>
      )}

      {tipo === 'alimentacao' && (
        <>
          <Field label="O que comeu"><input className="input" value={d.food ?? ''} onChange={(e) => set({ food: e.target.value })} placeholder="ex.: papinha de abóbora" /></Field>
          <Field label="Aceitação"><Choice value={d.acceptance} onChange={(v) => set({ acceptance: v })} options={[{ v: 'boa', l: '😋 Boa' }, { v: 'media', l: '😐 Média' }, { v: 'recusou', l: '🙅 Recusou' }]} /></Field>
        </>
      )}

      <Field label="Observação"><textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" /></Field>
    </Sheet>
  );
}
