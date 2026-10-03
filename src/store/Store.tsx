import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Database, Empresa, Modulo, Perfil, Usuario } from '../types';
import { createSeed, migrar } from './seed';

const DB_KEY = 'techgest:db:v1';
const SESSION_KEY = 'techgest:session:v1';
const TOKEN_KEY = 'techgest:token:v1';

type Collection = Exclude<keyof Database, 'permissoes' | 'empresa'>;
type Item<K extends Collection> = Database[K][number];

interface Toast { id: number; text: string; kind: 'success' | 'error' | 'info' }

/**
 * Modo "remote": publicado no Cloudflare (Worker + D1) — dados no banco, login validado no servidor.
 * Modo "local": arquivo aberto direto ou hospedagem sem API — dados no localStorage do navegador.
 */
export type Modo = 'checking' | 'remote' | 'local';

interface StoreValue {
  db: Database;
  user: Usuario | null;
  modo: Modo;
  login: (email: string, senha: string) => Promise<string | null>;
  logout: () => void;
  upsert: <K extends Collection>(col: K, item: Item<K>) => void;
  remove: <K extends Collection>(col: K, id: string) => void;
  setPermissoes: (perfil: Perfil, modulos: Modulo[]) => void;
  setEmpresa: (e: Empresa) => void;
  replaceDb: (db: Database) => Promise<string | null>;
  resetDemo: () => Promise<string | null>;
  changePassword: (nova: string, atual?: string, userId?: string) => Promise<string | null>;
  can: (m: Modulo) => boolean;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
}

const Ctx = createContext<StoreValue | null>(null);

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

function loadLocal(): Database {
  const raw = ls.get(DB_KEY);
  if (raw) {
    try {
      const db = JSON.parse(raw) as Database;
      return migrar(db) ?? db;
    } catch { /* base corrompida: usa demonstração */ }
  }
  return createSeed();
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = ls.get(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error || `Erro ${res.status}`), { status: res.status });
  return data as T;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<Modo>('checking');
  const [db, setDb] = useState<Database>(() => (location.protocol.startsWith('http') ? createSeed() : loadLocal()));
  const [userId, setUserId] = useState<string | null>(() => ls.get(SESSION_KEY));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const modoRef = useRef<Modo>('checking');
  modoRef.current = modo;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const sair = useCallback(() => {
    setUserId(null);
    ls.del(SESSION_KEY); ls.del(TOKEN_KEY);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      const remoto = await call<Database>('/db');
      const migrado = migrar(remoto);
      setDb(migrado ?? remoto);
      // Base criada antes dos módulos novos: o proprietário grava a versão completada no banco
      if (migrado) await call('/reset', { method: 'POST', body: JSON.stringify({ db: migrado }) }).catch(() => undefined);
    } catch (e) {
      if ((e as { status?: number }).status === 401) sair();
      else throw e;
    }
  }, [sair]);

  // Detecta se existe a API do Worker; na primeira execução, popula o banco com os dados de demonstração.
  useEffect(() => {
    (async () => {
      if (!location.protocol.startsWith('http')) { setModo('local'); return; }
      let status: { ok?: boolean; initialized?: boolean };
      try { status = await call('/status'); } catch { setDb(loadLocal()); setModo('local'); return; }
      if (!status.ok) { setDb(loadLocal()); setModo('local'); return; }
      if (!status.initialized) {
        try { await call('/bootstrap', { method: 'POST', body: JSON.stringify({ db: createSeed() }) }); } catch { /* outro acesso já inicializou */ }
      }
      if (ls.get(TOKEN_KEY)) await recarregar().catch(() => toast('Não foi possível carregar os dados do servidor.', 'error'));
      setModo('remote');
    })();
  }, [recarregar, toast]);

  useEffect(() => {
    if (modo === 'local') ls.set(DB_KEY, JSON.stringify(db));
  }, [db, modo]);

  /** Aplica a mudança na tela na hora e sincroniza com o servidor; se falhar, recarrega do banco. */
  const sync = useCallback((path: string, init: RequestInit) => {
    if (modoRef.current !== 'remote') return;
    call(path, init).catch((e: Error & { status?: number }) => {
      toast(e.message || 'Falha ao salvar no servidor.', 'error');
      if (e.status === 401) sair(); else recarregar().catch(() => undefined);
    });
  }, [toast, sair, recarregar]);

  const user = db.usuarios.find((u) => u.id === userId) ?? null;

  const value = useMemo<StoreValue>(() => ({
    db, user, modo, toasts, toast,
    login: async (email, senha) => {
      if (modo === 'remote') {
        try {
          const r = await call<{ token: string; userId: string }>('/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
          ls.set(TOKEN_KEY, r.token); ls.set(SESSION_KEY, r.userId);
          await recarregar();
          setUserId(r.userId);
          return null;
        } catch (e) { return (e as Error).message; }
      }
      const u = db.usuarios.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) return 'Usuário não encontrado.';
      if (u.status !== 'Ativo') return 'Usuário inativo. Fale com o administrador.';
      if (senha !== '123456') return 'Senha incorreta.';
      setUserId(u.id);
      ls.set(SESSION_KEY, u.id);
      setDb((cur) => ({ ...cur, usuarios: cur.usuarios.map((x) => (x.id === u.id ? { ...x, ultimoAcesso: new Date().toISOString() } : x)) }));
      return null;
    },
    logout: sair,
    upsert: (col, item) => {
      setDb((cur) => {
        const list = cur[col] as { id: string }[];
        const id = (item as { id: string }).id;
        const next = list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? item : x)) : [item, ...list];
        return { ...cur, [col]: next };
      });
      sync(`/items/${col}/${encodeURIComponent((item as { id: string }).id)}`, { method: 'PUT', body: JSON.stringify(item) });
    },
    remove: (col, id) => {
      setDb((cur) => ({ ...cur, [col]: (cur[col] as { id: string }[]).filter((x) => x.id !== id) }));
      sync(`/items/${col}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    setPermissoes: (perfil, modulos) => {
      const permissoes = { ...db.permissoes, [perfil]: modulos };
      setDb((cur) => ({ ...cur, permissoes }));
      sync('/config/permissoes', { method: 'PUT', body: JSON.stringify(permissoes) });
    },
    setEmpresa: (empresa) => {
      setDb((cur) => ({ ...cur, empresa }));
      sync('/config/empresa', { method: 'PUT', body: JSON.stringify(empresa) });
    },
    replaceDb: async (novo) => {
      if (modo === 'remote') {
        try { await call('/reset', { method: 'POST', body: JSON.stringify({ db: novo }) }); await recarregar(); }
        catch (e) { return (e as Error).message; }
      } else setDb(novo);
      return null;
    },
    resetDemo: async () => {
      const seed = createSeed();
      if (modo === 'remote') {
        try { await call('/reset', { method: 'POST', body: JSON.stringify({ db: seed }) }); await recarregar(); }
        catch (e) { return (e as Error).message; }
      } else setDb(seed);
      return null;
    },
    changePassword: async (nova, atual, alvo) => {
      if (modo !== 'remote') return 'Alteração de senha disponível apenas na versão publicada com banco de dados.';
      try { await call('/password', { method: 'POST', body: JSON.stringify({ nova, atual, userId: alvo }) }); return null; }
      catch (e) { return (e as Error).message; }
    },
    can: (m) => !!user && (user.perfil === 'Proprietário' || db.permissoes[user.perfil]?.includes(m)),
  }), [db, user, modo, toasts, toast, sair, sync, recarregar]);

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
