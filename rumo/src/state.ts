import { useEffect, useState } from 'react';
import { CHANNELS, Campaign, ChannelId } from './model';
import { CalItem, generateCalendar } from './calendar';
import { PRESETS } from './presets';

const KEY = 'rumo.state.v3';
const THEME_KEY = 'rumo.theme';

export interface Scenario {
  id: string;
  name: string;
  savedAt: string;
  campaign: Campaign;
}

export interface AppState {
  campaign: Campaign;
  calendar: CalItem[];
  utmContent: Partial<Record<ChannelId, string>>;
  calSig: string; // assinatura do plano usada para gerar o calendário
  scenarios: Scenario[];
}

/** O calendário depende do período e dos canais ativos; se isso muda, ele precisa ser refeito. */
export const calendarSignature = (c: Campaign) =>
  [c.start, c.end, ...CHANNELS.filter((ch) => (c.alloc[ch.id] ?? 0) >= 0.02).map((ch) => ch.id)].join('|');

export function initialState(presetId?: string): AppState {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const campaign = preset.build();
  return { campaign, calendar: generateCalendar(campaign), utmContent: {}, calSig: calendarSignature(campaign), scenarios: [] };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.campaign?.bench && s.campaign?.alloc && s.calSig !== undefined) return { ...s, scenarios: s.scenarios ?? [] };
    }
  } catch {
    /* sem armazenamento: segue com o exemplo */
  }
  return initialState();
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignora: o app funciona na sessão */
    }
  }, [state]);
  return [state, setState] as const;
}

export type Theme = 'dark' | 'light';
export type ThemePref = Theme | 'system';

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/**
 * Preferência de tema por pessoa: claro (padrão), escuro ou automático (segue o sistema).
 * Fica salva no navegador e é aplicada no <html>; no modo automático acompanha mudanças do sistema.
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === 'dark' || t === 'light' || t === 'system') return t;
    } catch {
      /* sem armazenamento */
    }
    return 'light';
  });
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme: Theme = pref === 'system' ? system : pref;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070B16' : '#F3F5FA');
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch {
      /* ignora */
    }
  }, [pref]);

  return { pref, theme, setPref };
}
