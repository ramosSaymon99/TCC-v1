import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../ctx';
import { api } from '../lib/api';
import { TIPOS, VACINAS } from '../lib/constants';
import { referencias } from '../lib/metrics';
import { DIA, dataBr, fromLocalInput, idade, parseYmd, t, toLocalInput, ymd } from '../lib/time';
import type { Appointment, Growth } from '../types';
import { Empty, Field, Seg, Sheet } from '../components/ui';

export function Saude() {
  const { data, act, podeEditar, agora, nome, abrirRegistro } = useApp();
  const [aba, setAba] = useState<'crescimento' | 'consultas' | 'vacinas' | 'remedios'>('crescimento');
  const [gEdit, setGEdit] = useState<Growth | 'novo' | null>(null);
  const [cEdit, setCEdit] = useState<Appointment | 'novo' | null>(null);
  const { baby } = data;
  const id = idade(baby.birth_date, agora);
  const ref = referencias(id.dias);
  const nasc = parseYmd(baby.birth_date);

  const pesos = data.growth.filter((g) => g.weight_g || g.height_cm).sort((a, b) => a.date.localeCompare(b.date));
  const serie = pesos.map((g) => ({ idade: Math.round((parseYmd(g.date) - nasc) / DIA / 30.4 * 10) / 10, peso: g.weight_g ? g.weight_g / 1000 : null, altura: g.height_cm ?? null, data: dataBr(g.date) }));
  const ult = [...pesos].reverse().find((g) => g.weight_g);
  const pen = ult ? [...pesos].reverse().find((g) => g.weight_g && g.date < ult.date && (parseYmd(ult.date) - parseYmd(g.date)) / DIA >= 5) : undefined;
  const ganho = ult && pen ? (ult.weight_g! - pen.weight_g!) / ((parseYmd(ult.date) - parseYmd(pen.date)) / DIA) : null;

  const aplicadas = new Map(data.vaccines.map((v) => [v.code, v]));
  const grupos = [...new Set(VACINAS.map((v) => v.meses))];
  const statusVac = (meses: number, code: string) => aplicadas.has(code) ? 'ok' : id.dias > meses * 30.4 + 30 ? 'atrasada' : id.dias >= meses * 30.4 - 15 ? 'agora' : 'futura';
  const atrasadas = VACINAS.filter((v) => statusVac(v.meses, v.code) === 'atrasada').length;
  const proximas = data.appointments.filter((a) => !a.done && t(a.date) >= agora - DIA / 2);
  const remedios = data.events.filter((e) => e.type === 'remedio').sort((a, b) => t(b.start_at) - t(a.start_at));

  return (
    <div className="page">
      <div>
        <h1>Saúde</h1>
        <p className="faint">Crescimento, consultas, vacinas e remédios de {baby.name.split(' ')[0]}</p>
      </div>

      <div className="grid g4">
        <div className="card kpi"><div className="lab">⚖️ Peso atual</div><div className="val">{ult ? `${(ult.weight_g! / 1000).toFixed(2).replace('.', ',')} kg` : '—'}</div><div className="sub">{ult ? `em ${dataBr(ult.date)}` : 'sem registro'}</div></div>
        <div className="card kpi"><div className="lab">📈 Ganho de peso</div><div className="val">{ganho != null ? `${Math.round(ganho)} g/dia` : '—'}</div><div className="sub">{ref.ganhoGDia ? `ref. ${ref.ganhoGDia[0]}–${ref.ganhoGDia[1]} g/dia` : 'entre as últimas pesagens'}</div></div>
        <div className="card kpi"><div className="lab">🩺 Próxima consulta</div><div className="val" style={{ fontSize: 20 }}>{proximas[0] ? new Date(proximas[0].date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}</div><div className="sub">{proximas[0]?.title ?? 'nenhuma agendada'}</div></div>
        <div className="card kpi"><div className="lab">💉 Vacinas</div><div className="val">{aplicadas.size}</div><div className="sub" style={{ color: atrasadas ? 'var(--warn)' : undefined }}>{atrasadas ? `${atrasadas} sem registro p/ idade` : 'em dia pelos registros'}</div></div>
      </div>

      <Seg value={aba} onChange={setAba} options={[{ v: 'crescimento', l: 'Crescimento' }, { v: 'consultas', l: 'Consultas' }, { v: 'vacinas', l: 'Vacinas' }, { v: 'remedios', l: 'Remédios' }]} />

      {aba === 'crescimento' && (
        <>
          <div className="card">
            <div className="card-h"><h2>Curva de peso e altura</h2>{podeEditar && <button className="btn sm primary" onClick={() => setGEdit('novo')}><Plus size={14} /> Pesagem</button>}</div>
            {serie.length >= 2 ? (
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={serie} margin={{ left: -18, right: -12, top: 6 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="idade" type="number" domain={[0, 'dataMax']} tickFormatter={(v) => `${v}m`} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="p" tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <YAxis yAxisId="a" orientation="right" tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} labelFormatter={(v, p) => `${p?.[0]?.payload?.data ?? ''} · ${v} meses`} />
                    <Line yAxisId="p" dataKey="peso" name="Peso (kg)" stroke={TIPOS.mamada.cor} strokeWidth={2.5} connectNulls />
                    <Line yAxisId="a" dataKey="altura" name="Altura (cm)" stroke={TIPOS.sono.cor} strokeWidth={2} strokeDasharray="4 3" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty emoji="📏">Registre ao menos duas pesagens para ver a curva.</Empty>}
            <p className="disclaimer">Para comparar com as curvas da OMS (percentis), use a caderneta da criança com o pediatra.</p>
          </div>
          <div className="card">
            <div className="card-h"><h2>Registros</h2></div>
            {[...pesos].reverse().map((g) => (
              <div key={g.id} className="list-item" onClick={() => podeEditar && setGEdit(g)} style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
                <div className="grow">
                  <b>{dataBr(g.date)}</b> <span className="faint">· {idade(baby.birth_date, parseYmd(g.date)).texto}</span>
                  <div className="faint">{g.source === 'consulta' ? 'Consulta' : 'Em casa'}{g.note ? ` · ${g.note}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }} className="num">
                  {g.weight_g && <div><b>{(g.weight_g / 1000).toFixed(2).replace('.', ',')} kg</b></div>}
                  {g.height_cm && <div className="faint">{g.height_cm} cm{g.head_cm ? ` · PC ${g.head_cm}` : ''}</div>}
                </div>
              </div>
            ))}
            {!pesos.length && <Empty emoji="⚖️">Nenhuma medida registrada.</Empty>}
          </div>
        </>
      )}

      {aba === 'consultas' && (
        <div className="card">
          <div className="card-h"><h2>Consultas e exames</h2>{podeEditar && <button className="btn sm primary" onClick={() => setCEdit('novo')}><Plus size={14} /> Agendar</button>}</div>
          {data.appointments.length ? [...data.appointments].sort((a, b) => a.done - b.done || (a.done ? t(b.date) - t(a.date) : t(a.date) - t(b.date))).map((a) => (
            <div key={a.id} className="list-item" onClick={() => podeEditar && setCEdit(a)} style={{ cursor: podeEditar ? 'pointer' : 'default', opacity: a.done ? 0.6 : 1 }}>
              <div className="tl-ico" style={{ background: 'var(--info-soft)' }}>🩺</div>
              <div className="grow">
                <b>{a.title}</b>
                <div className="faint">{new Date(a.date).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}{a.doctor ? ` · ${a.doctor}` : ''}</div>
                {a.note && <div className="faint">{a.note}</div>}
              </div>
              {a.done ? <span className="chip ok">realizada</span> : t(a.date) < agora ? <span className="chip warn">confirmar</span> : <span className="chip info">agendada</span>}
            </div>
          )) : <Empty emoji="🩺">Nenhuma consulta registrada.</Empty>}
        </div>
      )}

      {aba === 'vacinas' && (
        <div className="card">
          <div className="card-h"><h2>Calendário de vacinação</h2><span className="faint">PNI · referência</span></div>
          {grupos.map((m) => (
            <div key={m} style={{ marginBottom: 12 }}>
              <h3 style={{ margin: '8px 0 4px' }}>{m === 0 ? 'Ao nascer' : m < 24 ? `${m} meses` : `${m / 12} anos`}</h3>
              {VACINAS.filter((v) => v.meses === m).map((v) => {
                const st = statusVac(v.meses, v.code);
                const ap = aplicadas.get(v.code);
                return (
                  <div key={v.code} className="list-item">
                    <input type="checkbox" disabled={!podeEditar} checked={!!ap} style={{ width: 22, height: 22 }}
                      onChange={(e) => act(() => (e.target.checked ? api.setVaccine(baby.id, v.code, ymd(agora)) : api.removeVaccine(baby.id, v.code)), e.target.checked ? 'Vacina registrada 💉' : 'Registro removido')} />
                    <div className="grow">
                      <div style={{ fontWeight: 700 }}>{v.nome}</div>
                      {ap && <div className="faint">aplicada em {dataBr(ap.date)} · {nome(ap.user_id)}</div>}
                    </div>
                    {ap && podeEditar && <input type="date" className="input" style={{ width: 150, minHeight: 36, padding: '4px 8px', fontSize: 14 }} value={ap.date} onChange={(e) => e.target.value && act(() => api.setVaccine(baby.id, v.code, e.target.value))} />}
                    {!ap && <span className={`chip ${st === 'atrasada' ? 'warn' : st === 'agora' ? 'brand' : ''}`}>{st === 'atrasada' ? 'sem registro' : st === 'agora' ? 'é a vez' : 'futura'}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          <p className="disclaimer">Calendário simplificado do Programa Nacional de Imunizações. Confirme datas e doses com a caderneta e a unidade de saúde.</p>
        </div>
      )}

      {aba === 'remedios' && (
        <div className="card">
          <div className="card-h"><h2>Remédios e suplementos</h2>{podeEditar && <button className="btn sm primary" onClick={() => abrirRegistro('remedio')}><Plus size={14} /> Dar remédio</button>}</div>
          {remedios.length ? remedios.slice(0, 40).map((e) => (
            <div key={e.id} className="list-item">
              <div className="tl-ico" style={{ background: `${TIPOS.remedio.cor}22` }}>💊</div>
              <div className="grow">
                <b>{e.data.med ?? 'Remédio'}</b> {e.data.dose && <span className="faint">· {e.data.dose}</span>}
                <div className="faint">{new Date(e.start_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {nome(e.user_id)}</div>
              </div>
            </div>
          )) : <Empty emoji="💊">Nenhum remédio registrado nos últimos dias.</Empty>}
        </div>
      )}

      {gEdit && <GrowthSheet item={gEdit === 'novo' ? null : gEdit} onClose={() => setGEdit(null)} />}
      {cEdit && <ConsultaSheet item={cEdit === 'novo' ? null : cEdit} onClose={() => setCEdit(null)} />}
    </div>
  );
}

function GrowthSheet({ item, onClose }: { item: Growth | null; onClose: () => void }) {
  const { data, act } = useApp();
  const [f, setF] = useState({ date: item?.date ?? ymd(Date.now()), peso: item?.weight_g ? String(item.weight_g / 1000) : '', altura: item?.height_cm ? String(item.height_cm) : '', pc: item?.head_cm ? String(item.head_cm) : '', source: item?.source ?? 'consulta', note: item?.note ?? '' });
  const num = (s: string) => (s ? Number(s.replace(',', '.')) : null);
  async function salvar() {
    const peso = num(f.peso);
    if (!peso && !num(f.altura)) return alert('Informe o peso ou a altura.');
    const body = { date: f.date, weight_g: peso ? Math.round(peso * 1000) : null, height_cm: num(f.altura), head_cm: num(f.pc), source: f.source, note: f.note || null };
    if (await act(() => (item ? api.update('growth', data.baby.id, item.id, body) : api.create('growth', data.baby.id, body)), 'Medida registrada')) onClose();
  }
  return (
    <Sheet title={item ? 'Editar medida' : 'Nova pesagem / medida'} onClose={onClose} footer={<>
      {item && <button className="btn danger" onClick={async () => confirm('Excluir?') && (await act(() => api.remove('growth', data.baby.id, item.id))) && onClose()}><Trash2 size={16} /></button>}
      <button className="btn primary" onClick={salvar}>Salvar</button>
    </>}>
      <div className="grid g2">
        <Field label="Data"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Onde"><select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="consulta">Consulta</option><option value="casa">Em casa / farmácia</option></select></Field>
        <Field label="Peso (kg)"><input className="input" inputMode="decimal" value={f.peso} onChange={(e) => setF({ ...f, peso: e.target.value })} placeholder="ex.: 5,32" /></Field>
        <Field label="Altura (cm)"><input className="input" inputMode="decimal" value={f.altura} onChange={(e) => setF({ ...f, altura: e.target.value })} placeholder="ex.: 58" /></Field>
        <Field label="Perímetro cefálico (cm)"><input className="input" inputMode="decimal" value={f.pc} onChange={(e) => setF({ ...f, pc: e.target.value })} /></Field>
      </div>
      <Field label="Observação"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Sheet>
  );
}

function ConsultaSheet({ item, onClose }: { item: Appointment | null; onClose: () => void }) {
  const { data, act } = useApp();
  const [f, setF] = useState({ date: toLocalInput(item ? t(item.date) : Date.now() + 7 * DIA), title: item?.title ?? 'Consulta de puericultura', doctor: item?.doctor ?? '', note: item?.note ?? '', done: item?.done ?? 0 });
  async function salvar() {
    const body = { ...f, date: fromLocalInput(f.date), doctor: f.doctor || null, note: f.note || null };
    if (await act(() => (item ? api.update('appointments', data.baby.id, item.id, body) : api.create('appointments', data.baby.id, body)), 'Consulta salva')) onClose();
  }
  return (
    <Sheet title={item ? 'Editar consulta' : 'Agendar consulta'} onClose={onClose} footer={<>
      {item && <button className="btn danger" onClick={async () => confirm('Excluir?') && (await act(() => api.remove('appointments', data.baby.id, item.id))) && onClose()}><Trash2 size={16} /></button>}
      <button className="btn primary" onClick={salvar}>Salvar</button>
    </>}>
      <Field label="Tipo"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} list="tipos-consulta" /></Field>
      <datalist id="tipos-consulta">{['Consulta de puericultura', 'Vacinação', 'Teste do pezinho', 'Pediatra – retorno', 'Odontopediatra', 'Exame'].map((x) => <option key={x} value={x} />)}</datalist>
      <div className="grid g2">
        <Field label="Data e hora"><input className="input" type="datetime-local" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Profissional / local"><input className="input" value={f.doctor} onChange={(e) => setF({ ...f, doctor: e.target.value })} /></Field>
      </div>
      <Field label="Anotações (dúvidas, orientações)"><textarea className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <label className="row" style={{ fontWeight: 700, gap: 10 }}><input type="checkbox" checked={!!f.done} onChange={(e) => setF({ ...f, done: e.target.checked ? 1 : 0 })} style={{ width: 20, height: 20 }} /> Consulta realizada</label>
    </Sheet>
  );
}
