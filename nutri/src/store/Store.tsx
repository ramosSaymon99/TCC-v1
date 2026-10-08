import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Config, Database } from '../types';
import { createSeed, VERSAO } from './seed';
import { resumirPacientes, type ResumoPaciente } from '../utils/metrics';

const DB_KEY = 'nutrigest:db:v1';

type Collection = Exclude<keyof Database, 'config' | 'versao'>;
type Item<K extends Collection> = Database[K][number];

interface Toast { id: number; text: string; kind: 'success' | 'error' }

interface StoreValue {
  db: Database;
  resumo: Map<string, ResumoPaciente>;
  upsert: <K extends Collection>(col: K, item: Item<K>) => void;
  remove: <K extends Collection>(col: K, id: string) => void;
  setConfig: (c: Config) => void;
  replaceDb: (db: Database) => void;
  resetDemo: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
}

const Ctx = createContext<StoreValue | null>(null);

function load(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Database;
      if (db.versao === VERSAO && Array.isArray(db.pacientes)) return db;
    }
  } catch { /* sem acesso ao armazenamento ou base corrompida: usa a demonstração */ }
  return createSeed();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* ignore */ }
  }, [db]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const resumo = useMemo(() => resumirPacientes(db), [db]);

  const value = useMemo<StoreValue>(() => ({
    db, resumo, toasts, toast,
    upsert: (col, item) => setDb((cur) => {
      const list = cur[col] as { id: string }[];
      const id = (item as { id: string }).id;
      const next = list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? item : x)) : [item, ...list];
      return { ...cur, [col]: next };
    }),
    remove: (col, id) => setDb((cur) => ({ ...cur, [col]: (cur[col] as { id: string }[]).filter((x) => x.id !== id) })),
    setConfig: (config) => setDb((cur) => ({ ...cur, config })),
    replaceDb: (novo) => setDb(novo),
    resetDemo: () => setDb(createSeed()),
  }), [db, resumo, toasts, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fora do StoreProvider');
  return v;
}

export function usePaciente() {
  const { db } = useStore();
  return useMemo(() => {
    const map = new Map(db.pacientes.map((p) => [p.id, p]));
    return (id?: string) => (id ? map.get(id) : undefined);
  }, [db.pacientes]);
}
