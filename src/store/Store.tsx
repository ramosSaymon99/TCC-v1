import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Database, Empresa, Modulo, Perfil, Usuario } from '../types';
import { createSeed } from './seed';

const DB_KEY = 'techgest:db:v1';
const SESSION_KEY = 'techgest:session:v1';

type Collection = Exclude<keyof Database, 'permissoes' | 'empresa'>;
type Item<K extends Collection> = Database[K][number];

interface Toast { id: number; text: string; kind: 'success' | 'error' | 'info' }

interface StoreValue {
  db: Database;
  user: Usuario | null;
  login: (email: string, senha: string) => string | null;
  logout: () => void;
  upsert: <K extends Collection>(col: K, item: Item<K>) => void;
  remove: <K extends Collection>(col: K, id: string) => void;
  setPermissoes: (perfil: Perfil, modulos: Modulo[]) => void;
  setEmpresa: (e: Empresa) => void;
  resetDemo: () => void;
  can: (m: Modulo) => boolean;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
}

const Ctx = createContext<StoreValue | null>(null);

function load(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as Database;
  } catch { /* storage indisponível: usa dados de demonstração */ }
  return createSeed();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(load);
  const [userId, setUserId] = useState<string | null>(() => {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* ignore */ }
  }, [db]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const user = db.usuarios.find((u) => u.id === userId) ?? null;

  const value = useMemo<StoreValue>(() => ({
    db, user, toasts, toast,
    login: (email, senha) => {
      const u = db.usuarios.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) return 'Usuário não encontrado.';
      if (u.status !== 'Ativo') return 'Usuário inativo. Fale com o administrador.';
      if (senha !== '123456') return 'Senha incorreta.';
      setUserId(u.id);
      try { localStorage.setItem(SESSION_KEY, u.id); } catch { /* ignore */ }
      setDb((cur) => ({
        ...cur,
        usuarios: cur.usuarios.map((x) => (x.id === u.id ? { ...x, ultimoAcesso: new Date().toISOString() } : x)),
      }));
      return null;
    },
    logout: () => {
      setUserId(null);
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    },
    upsert: (col, item) => setDb((cur) => {
      const list = cur[col] as { id: string }[];
      const exists = list.some((x) => x.id === (item as { id: string }).id);
      const next = exists
        ? list.map((x) => (x.id === (item as { id: string }).id ? item : x))
        : [item, ...list];
      return { ...cur, [col]: next };
    }),
    remove: (col, id) => setDb((cur) => ({ ...cur, [col]: (cur[col] as { id: string }[]).filter((x) => x.id !== id) })),
    setPermissoes: (perfil, modulos) => setDb((cur) => ({ ...cur, permissoes: { ...cur.permissoes, [perfil]: modulos } })),
    setEmpresa: (empresa) => setDb((cur) => ({ ...cur, empresa })),
    resetDemo: () => setDb(createSeed()),
    can: (m) => !!user && (user.perfil === 'Proprietário' || db.permissoes[user.perfil]?.includes(m)),
  }), [db, user, toasts, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fora do StoreProvider');
  return v;
}

/** Mapa id → nome do cliente, usado em quase todas as telas. */
export function useClienteNome() {
  const { db } = useStore();
  return useMemo(() => {
    const map = new Map(db.clientes.map((c) => [c.id, c.nome]));
    return (id?: string) => (id ? map.get(id) ?? '—' : '—');
  }, [db.clientes]);
}
