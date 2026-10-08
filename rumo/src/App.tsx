import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Command, FileText, GitCompare, Link2, Moon, Search, SlidersHorizontal, Sun } from 'lucide-react';
import { Campaign } from './model';
import { PRESETS } from './presets';
import { AppState, initialState, useAppState, useTheme } from './state';
import Simulador from './tabs/Simulador';
import Links from './tabs/Links';
import Calendario from './tabs/Calendario';
import Plano from './tabs/Plano';
import Cenarios, { saveScenario } from './tabs/Cenarios';

const TABS = [
  { id: 'simulador', label: 'Simulador', icon: SlidersHorizontal, key: '1' },
  { id: 'cenarios', label: 'Cenários', icon: GitCompare, key: '2' },
  { id: 'links', label: 'Links e QR', icon: Link2, key: '3' },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays, key: '4' },
  { id: 'plano', label: 'Plano', icon: FileText, key: '5' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TABS.find((t) => t.id === h)?.id ?? 'simulador') as TabId;
};
const go = (id: TabId) => (window.location.hash = `/${id}`);

export type Update = (fn: (s: AppState) => AppState) => void;

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function App() {
  const [state, setState] = useAppState();
  const [theme, setTheme] = useTheme();
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [palette, setPalette] = useState(false);
  const [optimizeSignal, setOptimizeSignal] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2200);
  };

  const update: Update = (fn) => setState((s) => fn(s));
  const setCampaign = (patch: Partial<Campaign>) => update((s) => ({ ...s, campaign: { ...s.campaign, ...patch } }));
  const presetLabel = useMemo(() => PRESETS.find((p) => p.id === state.campaign.preset)?.label, [state.campaign.preset]);

  const commands: Cmd[] = [
    ...TABS.map((t) => ({ id: `go-${t.id}`, label: `Ir para ${t.label}`, hint: `Alt+${t.key}`, run: () => go(t.id) })),
    {
      id: 'optimize',
      label: 'Otimizar distribuição da verba',
      run: () => {
        go('simulador');
        setOptimizeSignal((n) => n + 1);
      },
    },
    {
      id: 'save',
      label: 'Salvar cenário com o plano atual',
      run: () => {
        saveScenario(update, '');
        flash('Cenário salvo');
      },
    },
    { id: 'theme', label: theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    {
      id: 'print',
      label: 'Imprimir / salvar o plano em PDF',
      run: () => {
        go('plano');
        setTimeout(() => window.print(), 300);
      },
    },
    ...PRESETS.map((p) => ({
      id: `preset-${p.id}`,
      label: `Carregar exemplo: ${p.label}`,
      hint: p.hint,
      run: () => {
        if (confirm('Carregar este exemplo substitui a campanha atual (os cenários salvos ficam). Continuar?')) {
          setState((s) => ({ ...initialState(p.id), scenarios: s.scenarios }));
          flash('Exemplo carregado');
        }
      },
    })),
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const t = TABS.find((x) => x.key === e.key);
        if (t) {
          e.preventDefault();
          go(t.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Seções">
        <a className="rail-logo" href="#/simulador" aria-label="Rumo">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
            <rect width="32" height="32" rx="9" fill="var(--accent)" />
            <path d="M9 22 15 10l3 7 2-3 3 8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} title={`${t.label} (Alt+${t.key})`}>
            <t.icon size={19} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>

      <div className="workspace">
        <header className="topbar">
          <div className="title-block">
            <span className="crumb">Rumo / campanhas</span>
            <input aria-label="Nome da campanha" className="campaign-name" value={state.campaign.name} onChange={(e) => setCampaign({ name: e.target.value })} />
            {presetLabel && <span className="chip">Modelo: {presetLabel}</span>}
          </div>
          <div className="top-actions">
            <button className="cmd-btn" onClick={() => setPalette(true)} aria-label="Abrir paleta de comandos">
              <Search size={15} />
              <span>Comandos</span>
              <kbd>
                <Command size={11} />K
              </kbd>
            </button>
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <main className="main">
          {tab === 'simulador' && <Simulador campaign={state.campaign} setCampaign={setCampaign} optimizeSignal={optimizeSignal} />}
          {tab === 'cenarios' && <Cenarios state={state} update={update} />}
          {tab === 'links' && <Links state={state} update={update} />}
          {tab === 'calendario' && <Calendario state={state} update={update} />}
          {tab === 'plano' && <Plano state={state} />}
        </main>
        <footer className="footer">Estimativas a partir das premissas informadas. Ajuste-as com dados reais para decisões de verba.</footer>
      </div>

      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Palette({ commands, onClose }: { commands: Cmd[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = commands.filter((c) => norm(c.label + ' ' + (c.hint ?? '')).includes(norm(q)));
  const sel = Math.min(i, Math.max(0, list.length - 1));

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setI(0), [q]);

  const run = (c?: Cmd) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            placeholder="O que você quer fazer?"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setI(Math.min(list.length - 1, sel + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setI(Math.max(0, sel - 1));
              }
              if (e.key === 'Enter') run(list[sel]);
            }}
            aria-activedescendant={list[sel] ? `cmd-${list[sel].id}` : undefined}
            aria-controls="cmd-list"
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="cmd-list" role="listbox">
          {list.map((c, idx) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={idx === sel}
              className={idx === sel ? 'on' : ''}
              onMouseMove={() => idx !== sel && setI(idx)}
              onClick={() => run(c)}
            >
              <span>{c.label}</span>
              {c.hint && <span className="muted small">{c.hint}</span>}
            </li>
          ))}
          {list.length === 0 && <li className="muted">Nenhum comando encontrado.</li>}
        </ul>
      </div>
    </div>
  );
}
