import { useEffect, useState } from 'react';
import { CHANNELS, Campaign, ChannelId } from './model';
import { CalItem, generateCalendar } from './calendar';
import { PRESETS } from './presets';

const KEY = 'rumo.state.v2';

export interface AppState {
  campaign: Campaign;
  calendar: CalItem[];
  utmContent: Partial<Record<ChannelId, string>>;
  calSig: string; // assinatura do plano usada para gerar o calendário
}

/** O calendário depende do período e dos canais ativos; se isso muda, ele precisa ser refeito. */
export const calendarSignature = (c: Campaign) =>
  [c.start, c.end, ...CHANNELS.filter((ch) => (c.alloc[ch.id] ?? 0) >= 0.02).map((ch) => ch.id)].join('|');

export function initialState(presetId?: string): AppState {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const campaign = preset.build();
  return { campaign, calendar: generateCalendar(campaign), utmContent: {}, calSig: calendarSignature(campaign) };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.campaign?.bench && s.campaign?.alloc && s.calSig !== undefined) return s;
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
