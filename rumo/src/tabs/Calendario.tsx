import { useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { CHANNELS, ChannelId, addDays, channelById, daysBetween, fromISO, shortDate, slugify, toISO } from '../model';
import { CalItem, PHASES, Phase, Status, generateCalendar, phaseWindows } from '../calendar';
import { AppState, calendarSignature } from '../state';
import type { Update } from '../App';
import { Card, Dot, csv, downloadFile } from '../ui';

interface Props {
  state: AppState;
  update: Update;
}

const STATUS: { id: Status; label: string }[] = [
  { id: 'planejado', label: 'Planejado' },
  { id: 'producao', label: 'Em produção' },
  { id: 'pronto', label: 'Pronto' },
];
const nextStatus = (s: Status): Status => STATUS[(STATUS.findIndex((x) => x.id === s) + 1) % STATUS.length].id;
const GERAL = { short: 'Geral', name: 'Geral', color: '#64748b' };
const channelInfo = (id: CalItem['channel']) => (id === 'geral' ? GERAL : channelById(id));
const phaseColor = (p: Phase) => PHASES.find((x) => x.phase === p)?.color ?? '#94a3b8';

/** Segunda-feira da semana da data, para agrupar o calendário. */
const weekStart = (iso: string) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
};

export default function Calendario({ state, update }: Props) {
  const c = state.campaign;
  const [filter, setFilter] = useState<CalItem['channel'] | 'todos'>('todos');
  const [draft, setDraft] = useState({ date: c.start, channel: 'geral' as CalItem['channel'], title: '' });
  const stale = state.calSig !== calendarSignature(c);
  const windows = phaseWindows(c);
  const total = daysBetween(c.start, c.end);

  const items = state.calendar.filter((i) => filter === 'todos' || i.channel === filter);
  const weeks = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const i of items) {
      const w = weekStart(i.date);
      map.set(w, [...(map.get(w) ?? []), i]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const done = state.calendar.filter((i) => i.status === 'pronto').length;
  const usedChannels = [...new Set(state.calendar.map((i) => i.channel))];

  const setItems = (fn: (list: CalItem[]) => CalItem[]) => update((s) => ({ ...s, calendar: fn(s.calendar) }));
  const regenerate = () => {
    if (state.calendar.some((i) => i.status !== 'planejado') && !confirm('Refazer o calendário apaga os status e edições atuais. Continuar?')) return;
    update((s) => ({ ...s, calendar: generateCalendar(s.campaign), calSig: calendarSignature(s.campaign) }));
  };

  const exportCsv = () =>
    downloadFile(
      `calendario-${slugify(c.name)}.csv`,
      csv([
        ['Data', 'Fase', 'Canal', 'Ação', 'Formato', 'Status'],
        ...state.calendar.map((i) => [
          fromISO(i.date).toLocaleDateString('pt-BR'),
          i.phase,
          channelInfo(i.channel).name,
          i.title,
          i.format,
          STATUS.find((s) => s.id === i.status)!.label,
        ]),
      ]),
      'text/csv',
    );

  const addItem = () => {
    if (!draft.title.trim()) return;
    const phase = windows.find((w) => draft.date >= w.start && draft.date <= w.end)?.phase ?? (draft.date < c.start ? 'Preparação' : 'Análise');
    setItems((list) =>
      [...list, { id: `u${Date.now().toString(36)}`, date: draft.date, channel: draft.channel, phase, title: draft.title.trim(), format: 'Personalizado', status: 'planejado' as Status }].sort(
        (a, b) => a.date.localeCompare(b.date),
      ),
    );
    setDraft({ ...draft, title: '' });
  };

  return (
    <div className="cal">
      {stale && (
        <div className="banner">
          <span>O período ou os canais da campanha mudaram desde que este calendário foi gerado.</span>
          <button className="btn btn-primary sm" onClick={regenerate}>
            <RefreshCw size={15} /> Refazer calendário
          </button>
        </div>
      )}

      <Card title="Fases da campanha">
        <div className="timeline" role="img" aria-label="Linha do tempo das fases">
          {windows.map((w) => (
            <div key={w.phase} className="tl-seg" style={{ flexGrow: w.days, ['--c' as string]: phaseColor(w.phase) }}>
              <span className="tl-bar" />
              <strong>{w.phase}</strong>
              <span className="muted small">
                {shortDate(w.start)}
                {w.days > 1 && ` – ${shortDate(w.end)}`}
              </span>
            </div>
          ))}
        </div>
        <p className="muted small">
          {total} dias · {state.calendar.length} ações · {done} prontas ({state.calendar.length ? Math.round((done / state.calendar.length) * 100) : 0}%)
        </p>
        <div className="progress" aria-hidden>
          <span style={{ width: `${state.calendar.length ? (done / state.calendar.length) * 100 : 0}%` }} />
        </div>
      </Card>

      <div className="cal-toolbar">
        <div className="chips" role="group" aria-label="Filtrar por canal">
          <button className={filter === 'todos' ? 'chip-btn on' : 'chip-btn'} onClick={() => setFilter('todos')}>
            Todos
          </button>
          {usedChannels.map((id) => (
            <button key={id} className={filter === id ? 'chip-btn on' : 'chip-btn'} onClick={() => setFilter(id)}>
              <Dot color={channelInfo(id).color} /> {channelInfo(id).short}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost sm" onClick={regenerate}>
            <RefreshCw size={15} /> Refazer
          </button>
          <button className="btn btn-ghost sm" onClick={exportCsv}>
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {weeks.map(([week, list]) => (
        <section key={week} className="week">
          <h3>
            Semana de {shortDate(week)} <span className="muted">a {shortDate(addDays(week, 6))}</span>
          </h3>
          <ul className="cal-list">
            {list.map((i) => {
              const ch = channelInfo(i.channel);
              return (
                <li key={i.id} className={`cal-item ${i.status}`}>
                  <div className="cal-date">
                    <span>{fromISO(i.date).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                    <strong>{fromISO(i.date).getDate()}</strong>
                  </div>
                  <div className="cal-body">
                    <input
                      className="cal-title"
                      value={i.title}
                      aria-label="Ação"
                      onChange={(e) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, title: e.target.value } : x)))}
                    />
                    <div className="cal-meta">
                      <span>
                        <Dot color={ch.color} /> {ch.short}
                      </span>
                      <span className="phase-tag" style={{ ['--c' as string]: phaseColor(i.phase) }}>
                        {i.phase}
                      </span>
                      <span className="muted">{i.format}</span>
                    </div>
                  </div>
                  <button
                    className={`status ${i.status}`}
                    onClick={() => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, status: nextStatus(x.status) } : x)))}
                    title="Clique para avançar o status"
                  >
                    {STATUS.find((s) => s.id === i.status)!.label}
                  </button>
                  <button className="icon-btn ghost" aria-label="Remover ação" onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))}>
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {weeks.length === 0 && <p className="muted center">Nenhuma ação para este filtro.</p>}

      <Card title="Adicionar ação">
        <div className="add-row">
          <label className="field">
            <span className="field-label">Data</span>
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Canal</span>
            <select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as ChannelId | 'geral' })}>
              <option value="geral">Geral</option>
              {CHANNELS.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.short}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span className="field-label">Ação</span>
            <input
              value={draft.title}
              placeholder="ex.: Live com especialista"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
          </label>
          <button className="btn btn-primary" onClick={addItem} disabled={!draft.title.trim()}>
            <Plus size={16} /> Adicionar
          </button>
        </div>
      </Card>
    </div>
  );
}
