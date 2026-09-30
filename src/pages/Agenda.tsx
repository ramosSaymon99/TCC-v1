import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import { useClienteNome, useStore } from '../store/Store';
import type { Compromisso, Tarefa, TipoCompromisso } from '../types';
import { Badge, Modal, PageHeader } from '../components/ui';
import { ClienteSelect, Field, Options } from '../components/fields';
import { addDays, DIAS_SEMANA, MESES_LONGOS, parseDate, pct, toISODate, today, uid } from '../utils/format';

const TIPOS: TipoCompromisso[] = ['Treinamento', 'Manutenção', 'Reunião', 'Atendimento'];
const CAPACIDADE_H = 8;
const COR_TIPO: Record<TipoCompromisso, string> = { Treinamento: '#1e6fe8', Manutenção: '#16a34a', Reunião: '#f59e0b', Atendimento: '#e11d48' };
const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

export default function Agenda() {
  const { db, upsert, remove, toast } = useStore();
  const nome = useClienteNome();
  const [view, setView] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [dia, setDia] = useState(today());
  const [editing, setEditing] = useState<Compromisso | null>(null);
  const [novaTarefa, setNovaTarefa] = useState('');
  const [prio, setPrio] = useState<Tarefa['prioridade']>('Média');
  const hoje = today();
  const d = parseDate(dia);

  const doDia = (iso: string) => db.compromissos.filter((c) => c.data === iso).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const eventos = doDia(dia);
  const ocupadoMin = eventos.reduce((a, c) => a + Math.max(0, minutos(c.fim) - minutos(c.inicio)), 0);
  const tarefas = db.tarefas.filter((t) => t.data === dia || (dia === hoje && t.data < hoje && !t.concluida))
    .sort((a, b) => Number(a.concluida) - Number(b.concluida) || ['Alta', 'Média', 'Baixa'].indexOf(a.prioridade) - ['Alta', 'Média', 'Baixa'].indexOf(b.prioridade));

  const passo = view === 'dia' ? 1 : view === 'semana' ? 7 : 0;
  const navegar = (dir: 1 | -1) => {
    if (view === 'mes') setDia(toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    else setDia(addDays(dia, dir * passo));
  };
  const inicioSemana = addDays(dia, -d.getDay());
  const titulo = view === 'mes'
    ? `${MESES_LONGOS[d.getMonth()][0].toUpperCase()}${MESES_LONGOS[d.getMonth()].slice(1)} de ${d.getFullYear()}`
    : view === 'semana'
      ? `Semana de ${parseDate(inicioSemana).getDate()}/${parseDate(inicioSemana).getMonth() + 1} a ${parseDate(addDays(inicioSemana, 6)).getDate()}/${parseDate(addDays(inicioSemana, 6)).getMonth() + 1}`
      : `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_LONGOS[d.getMonth()]}`;

  const addTarefa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaTarefa.trim()) return;
    upsert('tarefas', { id: uid(), titulo: novaTarefa.trim(), data: dia, concluida: false, prioridade: prio });
    setNovaTarefa('');
  };

  return (
    <>
      <PageHeader title="Agenda e Tarefas" subtitle="Organize seus compromissos e tarefas do dia.">
        <button className="btn btn-primary" onClick={() => setEditing({ id: uid(), titulo: '', tipo: 'Atendimento', data: dia, inicio: '09:00', fim: '10:00' })}>
          <Plus size={16} /> Novo compromisso
        </button>
      </PageHeader>

      <div className="grid g-3-2">
        <div className="card">
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div className="seg">
              {(['dia', 'semana', 'mes'] as const).map((v) => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}</button>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setDia(hoje)}>Hoje</button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navegar(-1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
              <strong style={{ minWidth: 180, textAlign: 'center' }}>{titulo}</strong>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navegar(1)} aria-label="Próximo"><ChevronRight size={16} /></button>
            </div>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            {view === 'dia' && (
              <>
                <div className="row small muted" style={{ marginBottom: 12, gap: 12 }}>
                  <span>Ocupação do dia: <strong style={{ color: 'var(--text)' }}>{(ocupadoMin / 60).toFixed(1).replace('.', ',')}h de {CAPACIDADE_H}h</strong> ({pct(ocupadoMin / (CAPACIDADE_H * 60))})</span>
                  <div className="meter" style={{ flex: 1, marginTop: 0 }}><span style={{ width: `${Math.min(100, (ocupadoMin / (CAPACIDADE_H * 60)) * 100)}%`, background: ocupadoMin > CAPACIDADE_H * 60 ? 'var(--danger)' : undefined }} /></div>
                </div>
                {eventos.map((c) => (
                  <div key={c.id} className="agenda-slot">
                    <div className="hr">{c.inicio} - {c.fim}</div>
                    <div className={`event ev-${c.tipo}`} style={{ cursor: 'pointer' }} onClick={() => setEditing(c)}>
                      <div>
                        <div className="t">{c.titulo}</div>
                        <div className="s">{c.clienteId ? nome(c.clienteId) : 'Sem cliente'}{c.local ? <> · <MapPin size={11} /> {c.local}</> : null}</div>
                      </div>
                      <span className="small muted">{c.tipo}</span>
                    </div>
                  </div>
                ))}
                {eventos.length === 0 && <div className="empty">Nenhum compromisso neste dia. Capacidade livre para novos atendimentos.</div>}
              </>
            )}

            {view === 'semana' && (
              <div className="week">
                {Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i)).map((iso) => (
                  <div key={iso} className={`day ${iso === hoje ? 'today' : ''}`} onClick={() => { setDia(iso); setView('dia'); }} style={{ cursor: 'pointer' }}>
                    <h5>{DIAS_SEMANA[parseDate(iso).getDay()].slice(0, 3)} {parseDate(iso).getDate()}</h5>
                    {doDia(iso).map((c) => (
                      <div key={c.id} className={`mini ev-${c.tipo}`}><strong>{c.inicio}</strong> {c.titulo}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {view === 'mes' && (() => {
              const first = new Date(d.getFullYear(), d.getMonth(), 1);
              const start = addDays(toISODate(first), -first.getDay());
              return (
                <div className="month">
                  {DIAS_SEMANA.map((w) => <div key={w} className="dow">{w.slice(0, 3)}</div>)}
                  {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((iso) => {
                    const ev = doDia(iso);
                    return (
                      <div key={iso} className={`cell ${parseDate(iso).getMonth() !== d.getMonth() ? 'out' : ''} ${iso === hoje ? 'today' : ''}`} onClick={() => { setDia(iso); setView('dia'); }}>
                        <div className="n">{parseDate(iso).getDate()}</div>
                        {ev.slice(0, 2).map((c) => <div key={c.id} className={`pill ev-${c.tipo}`}>{c.inicio} {c.titulo}</div>)}
                        {ev.length > 2 && <div className="muted">+{ev.length - 2}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="legend" style={{ marginTop: 16 }}>
              {TIPOS.map((t) => <span key={t}><i style={{ background: COR_TIPO[t] }} />{t}</span>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Tarefas {dia === hoje ? 'do dia' : `de ${d.getDate()}/${d.getMonth() + 1}`}</h3>
            <span className="small muted">{tarefas.filter((t) => t.concluida).length}/{tarefas.length} concluídas</span>
          </div>
          <div style={{ padding: '8px 20px 20px' }}>
            {tarefas.map((t) => (
              <div key={t.id} className={`task ${t.concluida ? 'done' : ''}`}>
                <label className="check" style={{ flex: 1 }}>
                  <input type="checkbox" checked={t.concluida} onChange={() => upsert('tarefas', { ...t, concluida: !t.concluida })} />
                  <span className="tt">{t.titulo}{t.data < dia && <span className="small text-danger"> (atrasada)</span>}</span>
                </label>
                <Badge>{t.prioridade}</Badge>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove('tarefas', t.id)} aria-label="Remover"><Trash2 size={14} /></button>
              </div>
            ))}
            {tarefas.length === 0 && <div className="small muted" style={{ padding: '10px 0' }}>Nenhuma tarefa.</div>}
            <form onSubmit={addTarefa} className="row" style={{ marginTop: 12 }}>
              <input className="input" placeholder="Nova tarefa..." value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)} />
              <select className="select" style={{ width: 100 }} value={prio} onChange={(e) => setPrio(e.target.value as Tarefa['prioridade'])}><Options items={['Alta', 'Média', 'Baixa'] as const} /></select>
              <button className="btn btn-primary btn-icon" aria-label="Adicionar"><Plus size={16} /></button>
            </form>
          </div>
          <div className="divider" style={{ margin: 0 }} />
          <div className="card-head" style={{ paddingBottom: 6 }}><h3>Próximos 7 dias</h3></div>
          <ul className="list">
            {db.compromissos.filter((c) => c.data > dia && c.data <= addDays(dia, 7)).sort((a, b) => (a.data + a.inicio).localeCompare(b.data + b.inicio)).slice(0, 5).map((c) => (
              <li key={c.id}>
                <div className="time"><Clock size={13} color="var(--muted)" />{parseDate(c.data).getDate()}/{parseDate(c.data).getMonth() + 1}</div>
                <div><div className="title">{c.titulo}</div><div className="desc">{c.inicio} · {nome(c.clienteId)}</div></div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {editing && <CompromissoForm c={editing} onClose={() => setEditing(null)}
        onDelete={db.compromissos.some((x) => x.id === editing.id) ? () => { remove('compromissos', editing.id); toast('Compromisso removido.'); setEditing(null); } : undefined}
        onSave={(c) => {
          if (!c.titulo) return toast('Informe o título.', 'error');
          if (c.fim <= c.inicio) return toast('O horário final deve ser após o inicial.', 'error');
          const conflito = db.compromissos.find((x) => x.id !== c.id && x.data === c.data && x.inicio < c.fim && c.inicio < x.fim);
          upsert('compromissos', c);
          toast(conflito ? `Salvo, mas conflita com "${conflito.titulo}" (${conflito.inicio}-${conflito.fim}).` : 'Compromisso salvo.', conflito ? 'error' : 'success');
          setEditing(null);
        }} />}
    </>
  );
}

function CompromissoForm({ c, onClose, onSave, onDelete }: { c: Compromisso; onClose: () => void; onSave: (c: Compromisso) => void; onDelete?: () => void }) {
  const [f, setF] = useState(c);
  const set = <K extends keyof Compromisso>(k: K, v: Compromisso[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={c.titulo ? 'Editar compromisso' : 'Novo compromisso'} onClose={onClose} footer={<>
      {onDelete && <button className="btn" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={onDelete}><Trash2 size={15} /> Excluir</button>}
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" form="ag-form">Salvar</button>
    </>}>
      <form id="ag-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <Field label="Título" full><input className="input" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} required autoFocus /></Field>
        <Field label="Tipo"><select className="select" value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoCompromisso)}><Options items={TIPOS} /></select></Field>
        <Field label="Data"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} required /></Field>
        <Field label="Início"><input className="input" type="time" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} required /></Field>
        <Field label="Fim"><input className="input" type="time" value={f.fim} onChange={(e) => set('fim', e.target.value)} required /></Field>
        <Field label="Cliente"><ClienteSelect allowEmpty value={f.clienteId} onChange={(v) => set('clienteId', v || undefined)} /></Field>
        <Field label="Local"><input className="input" value={f.local ?? ''} onChange={(e) => set('local', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
