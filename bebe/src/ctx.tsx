import { createContext, useContext } from 'react';
import type { Baby, BabyData, BabyEvent, EventType, User } from './types';
import type { Modo } from './lib/api';

export type Aba = 'hoje' | 'indicadores' | 'mural' | 'saude' | 'familia';

export interface Ctx {
  user: User;
  babies: Baby[];
  data: BabyData;
  modo: Modo;
  agora: number;
  podeEditar: boolean;
  podeAdmin: boolean;
  refresh: () => Promise<void>;
  reloadMe: (selecionar?: string) => Promise<void>;
  /** Executa uma alteração, mostra o resultado e recarrega os dados. */
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  toast: (msg: string) => void;
  nome: (userId?: string | null) => string;
  setAba: (a: Aba) => void;
  abrirRegistro: (tipo: EventType, ev?: BabyEvent) => void;
  trocarBebe: (id: string) => void;
  novoBebe: () => void;
  sair: () => void;
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);
