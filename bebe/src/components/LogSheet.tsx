import { useState } from 'react';
import { Play, Trash2 } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { TIPOS } from '../lib/constants';
import { MIN, fromLocalInput, hm, idade, t, toLocalInput, uid } from '../lib/time';
import { conflitoDose } from '../lib/previsao';
import { ALERGENOS, REACOES, SINTOMAS, avaliarFebre, idCheck } from '../lib/conteudo';

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
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
  const [d, setD] = useState<EventData>(ev?.data ?? (tipo === 'fralda' ? { diaper: 'xixi' } : tipo === 'mamadeira' ? { milk: 'materno' } : tipo === 'mamada' ? { side: 'E' } : tipo === 'extracao' ? { guardar: 'geladeira' } : {}));
  const [note, setNote] = useState(ev?.note ?? '');
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<EventData>) => setD((x) => ({ ...x, ...p }));
  const info = TIPOS[tipo];
  const usaFim = COM_TIMER.includes(tipo) || tipo === 'banho';

  // Sugestão de lado: o oposto do último registrado
  const ultimoLado = data.events.filter((e) => e.type === 'mamada' && e.id !== ev?.id).sort((a, b) => t(b.start_at) - t(a.start_at))[0]?.data?.side;

  const quando = novo && modo === 'timer' ? agora : t(fromLocalInput(ini));
  const conflito = tipo === 'remedio' && d.med ? conflitoDose(data.events, d.med, quando, ev?.id) : null;
  const febre = tipo === 'saude' ? avaliarFebre(d.temp, idade(data.baby.birth_date, agora).dias, d.sintomas) : null;
  // Remédio já usado: sugere a mesma dose e intervalo da última vez
  const escolherRemedio = (med: string) => {
    const ant = data.events.filter((e) => e.type === 'remedio' && e.data?.med?.trim().toLowerCase() === med.trim().toLowerCase()).sort((a, b) => t(b.start_at) - t(a.start_at))[0];
    set(ant && novo ? { med, dose: d.dose || ant.data.dose, intervalo_h: d.intervalo_h ?? ant.data.intervalo_h, lembrar: d.lembrar ?? ant.data.lembrar } : { med });
  };

  async function salvar() {
    if (conflito?.cedo && !confirm(`${nome(conflito.anterior.user_id)} deu ${conflito.anterior.data.med} às ${hm(conflito.anterior.start_at)}. A próxima dose só está liberada a partir das ${hm(conflito.liberaEm)}.\n\nRegistrar mesmo assim?`)) return;
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
    // Efeitos extras: frasco de leite guardado e alimento introduzido (checklist da Saúde)
    const frascoId = uid();
    const extras = async () => {
      if (!ev && tipo === 'extracao' && d.ml && (d.guardar === 'geladeira' || d.guardar === 'congelador')) {
        await api.create('milk', babyId, { id: frascoId, ml: d.ml, collected_at: body.start_at, place: d.guardar });
      }
      if (tipo === 'alimentacao' && (d.novo || d.alergeno) && (d.alergeno || d.food)) {
        const nomeAlim = (d.alergeno || d.food)!.trim();
        const existe = data.checks.find((c) => c.kind === 'alimento' && c.code === slug(nomeAlim));
        const idAlim = existe?.id ?? idCheck(babyId, 'alimento', slug(nomeAlim));
        const item = { kind: 'alimento', code: slug(nomeAlim), date: body.start_at.slice(0, 10), value: d.reacao || d.acceptance || null, note: nomeAlim };
        if (existe) await api.update('checks', babyId, idAlim, d.reacao && d.reacao !== 'Sem reação' ? item : { value: existe.value || item.value });
        else if (slug(nomeAlim)) await api.create('checks', babyId, { id: idAlim, ...item });
      }
    };
    const ok = await act(
      async () => { await (ev ? api.update('events', babyId, ev.id, body) : api.create('events', babyId, { id: novoId, ...body })); await extras(); },
      ev ? 'Registro alterado ✓' : timer ? `${info.label} iniciada ⏱️` : 'Registro salvo ✓',
      ev ? () => api.update('events', babyId, ev.id, anterior!) : async () => { await api.remove('events', babyId, novoId); if (tipo === 'extracao') await api.remove('milk', babyId, frascoId).catch(() => undefined); },
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
      {tipo === 'extracao' && novo && (
        <Field label="O que fez com o leite" hint={d.guardar === 'geladeira' ? 'Validade: 12 h na geladeira.' : d.guardar === 'congelador' ? 'Validade: 15 dias no congelador/freezer.' : undefined}>
          <Choice value={d.guardar} onChange={(v) => set({ guardar: v })} options={[{ v: 'geladeira', l: '🧊 Geladeira' }, { v: 'congelador', l: '❄️ Congelador' }, { v: 'usado', l: '🍼 Usado na hora' }]} />
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
        <>
          <div className="grid g2">
            <Field label="Remédio / suplemento"><input className="input" value={d.med ?? ''} onChange={(e) => escolherRemedio(e.target.value)} placeholder="ex.: Vitamina D" list="meds" /></Field>
            <Field label="Dose (conforme a receita)"><input className="input" value={d.dose ?? ''} onChange={(e) => set({ dose: e.target.value })} placeholder="ex.: 2 gotas" /></Field>
            <datalist id="meds">{[...new Set(data.events.filter((e) => e.type === 'remedio' && e.data?.med).map((e) => e.data.med!))].map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <Field label="Intervalo mínimo entre doses" hint="Use o intervalo da receita. O app avisa se alguém tentar dar antes da hora.">
            <Choice value={d.intervalo_h ? String(d.intervalo_h) : '0'} onChange={(v) => set({ intervalo_h: Number(v) || undefined })} options={[{ v: '0', l: 'Sem intervalo' }, { v: '4', l: '4 h' }, { v: '6', l: '6 h' }, { v: '8', l: '8 h' }, { v: '12', l: '12 h' }, { v: '24', l: '24 h' }]} />
          </Field>
          {!!d.intervalo_h && (
            <label className="row" style={{ fontWeight: 700, gap: 10 }}><input type="checkbox" checked={!!d.lembrar} onChange={(e) => set({ lembrar: e.target.checked })} style={{ width: 20, height: 20 }} /> Avisar no celular quando a próxima dose estiver liberada</label>
          )}
          {conflito?.cedo && <div className="chip bad" style={{ whiteSpace: 'normal' }}>⚠️ {nome(conflito.anterior.user_id)} já deu {conflito.anterior.data.med} às {hm(conflito.anterior.start_at)}. Próxima dose só a partir das {hm(conflito.liberaEm)}.</div>}
          {conflito && !conflito.cedo && novo && <p className="faint">Última dose: {hm(conflito.anterior.start_at)} por {nome(conflito.anterior.user_id)}.</p>}
          <p className="disclaimer">O Ninho não indica remédios nem doses: registre apenas o que o pediatra receitou.</p>
        </>
      )}

      {tipo === 'saude' && (
        <>
          <Field label="Temperatura axilar (°C)">
            <input className="input" inputMode="decimal" value={d.temp != null ? String(d.temp).replace('.', ',') : ''} onChange={(e) => { const v = e.target.value.replace(',', '.'); set({ temp: v ? Number(v) : undefined }); }} placeholder="ex.: 37,9" />
          </Field>
          <Field label="Sintomas">
            <div className="choice">
              {SINTOMAS.map((x) => <button type="button" key={x} className={d.sintomas?.includes(x) ? 'on' : ''} onClick={() => set({ sintomas: d.sintomas?.includes(x) ? d.sintomas.filter((y) => y !== x) : [...(d.sintomas ?? []), x] })}>{x}</button>)}
            </div>
          </Field>
          {febre && febre.nivel !== 'ok' && <div className={`chip ${febre.nivel === 'alerta' ? 'bad' : 'warn'}`} style={{ whiteSpace: 'normal' }}>{febre.nivel === 'alerta' ? '🚨' : '⚠️'} {febre.texto}</div>}
          {febre?.nivel === 'ok' && <div className="chip ok">✓ {febre.texto}</div>}
          <p className="disclaimer">Orientação geral da Sociedade Brasileira de Pediatria. Não substitui a avaliação médica.</p>
        </>
      )}

      {tipo === 'alimentacao' && (
        <>
          <Field label="O que comeu"><input className="input" value={d.food ?? ''} onChange={(e) => set({ food: e.target.value })} placeholder="ex.: papinha de abóbora" /></Field>
          <Field label="Aceitação"><Choice value={d.acceptance} onChange={(v) => set({ acceptance: v })} options={[{ v: 'boa', l: '😋 Boa' }, { v: 'media', l: '😐 Média' }, { v: 'recusou', l: '🙅 Recusou' }]} /></Field>
          <label className="row" style={{ fontWeight: 700, gap: 10 }}><input type="checkbox" checked={!!d.novo} onChange={(e) => set({ novo: e.target.checked })} style={{ width: 20, height: 20 }} /> Primeira vez que oferece este alimento</label>
          <div className="grid g2">
            <Field label="Alimento alergênico?"><select className="input" value={d.alergeno ?? ''} onChange={(e) => set({ alergeno: e.target.value || undefined })}><option value="">Não</option>{ALERGENOS.map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Reação"><select className="input" value={d.reacao ?? ''} onChange={(e) => set({ reacao: e.target.value || undefined })}><option value="">—</option>{REACOES.map((a) => <option key={a}>{a}</option>)}</select></Field>
          </div>
          {(d.novo || d.alergeno) && <p className="faint">Vai para Saúde → Alimentos, para acompanhar a introdução alimentar.</p>}
          {d.reacao && d.reacao !== 'Sem reação' && d.reacao !== 'Recusou o alimento' && <div className="chip warn" style={{ whiteSpace: 'normal' }}>⚠️ Suspenda esse alimento e fale com o pediatra. Inchaço nos lábios/olhos ou falta de ar: procure atendimento imediatamente.</div>}
        </>
      )}

      <Field label="Observação"><textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" /></Field>
    </Sheet>
  );
}
