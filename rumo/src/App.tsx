import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, Link2, SlidersHorizontal } from 'lucide-react';
import { Campaign } from './model';
import { PRESETS } from './presets';
import { AppState, initialState, useAppState } from './state';
import Simulador from './tabs/Simulador';
import Links from './tabs/Links';
import Calendario from './tabs/Calendario';
import Plano from './tabs/Plano';

const TABS = [
  { id: 'simulador', label: 'Simulador', icon: SlidersHorizontal },
  { id: 'links', label: 'Links e QR', icon: Link2 },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'plano', label: 'Plano', icon: FileText },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TABS.find((t) => t.id === h)?.id ?? 'simulador') as TabId;
};

export type Update = (fn: (s: AppState) => AppState) => void;

export default function App() {
  const [state, setState] = useAppState();
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const update: Update = (fn) => setState((s) => fn(s));
  const setCampaign = (patch: Partial<Campaign>) => update((s) => ({ ...s, campaign: { ...s.campaign, ...patch } }));
  const presetLabel = useMemo(() => PRESETS.find((p) => p.id === state.campaign.preset)?.label, [state.campaign.preset]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
          <a className="logo" href="#/simulador" aria-label="Rumo">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
              <rect width="32" height="32" rx="8" fill="var(--accent)" />
              <path d="M9 22 15 10l3 7 2-3 3 8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Rumo</span>
          </a>
          <label className="preset">
            <span className="sr-only">Começar de um exemplo</span>
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                if (confirm('Carregar este exemplo substitui a campanha atual. Continuar?')) setState(initialState(id));
              }}
            >
              <option value="">Exemplos de campanha…</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.hint}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="campaign-title">
          <input
            aria-label="Nome da campanha"
            value={state.campaign.name}
            onChange={(e) => setCampaign({ name: e.target.value })}
          />
          {presetLabel && <span className="chip">Modelo: {presetLabel}</span>}
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <a key={t.id} role="tab" aria-selected={tab === t.id} href={`#/${t.id}`} className={tab === t.id ? 'on' : ''}>
              <t.icon size={16} />
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === 'simulador' && <Simulador campaign={state.campaign} setCampaign={setCampaign} />}
        {tab === 'links' && <Links state={state} update={update} />}
        {tab === 'calendario' && <Calendario state={state} update={update} />}
        {tab === 'plano' && <Plano state={state} />}
      </main>
      <footer className="footer">Rumo · planejador de campanhas · os números são estimativas a partir das premissas informadas</footer>
    </div>
  );
}
