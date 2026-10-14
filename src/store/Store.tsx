import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Assinatura, Database, Empresa, Modulo, Perfil, Usuario } from '../types';
import { createSeed, migrar } from './seed';
import { assinaturaDe, bloqueio, TENANT_PRINCIPAL } from './plataforma';
import { perfilDaEmpresa, type PerfilNegocio } from './segmentos';
import { ls, loadPlataformaLocal, loadTenantLocal, saveTenantLocal, SESSION_KEY, TENANT_KEY, TOKEN_KEY } from './local';

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
  /** Empresa (base) logada e o que o plano dela libera. */
  tenant: string;
  assinatura: Assinatura | null;
  /** Perfil do negócio (segmento + listas personalizadas): categorias, catálogo e nomes das telas. */
  negocio: PerfilNegocio;
  /** Proprietário da empresa principal: acessa o console da plataforma SaaS. */
  adminPlataforma: boolean;
  login: (email: string, senha: string) => Promise<string | null>;
  logout: () => void;
  upsert: <K extends Collection>(col: K, item: Item<K>) => void;
  remove: <K extends Collection>(col: K, id: string) => void;
  setPermissoes: (perfil: Perfil, modulos: Modulo[]) => void;
  setEmpresa: (e: Empresa) => void;
  replaceDb: (db: Database) => Promise<string | null>;
  resetDemo: () => Promise<string | null>;
  changePassword: (nova: string, atual?: string, userId?: string) => Promise<string | null>;
  /** Perfil do usuário E plano da empresa permitem o módulo. */
  can: (m: Modulo) => boolean;
  /** O plano da empresa inclui o módulo (independente do perfil). */
  liberado: (m: Modulo) => boolean;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
}

const Ctx = createContext<StoreValue | null>(null);

export async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = ls.get(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; bloqueado?: boolean };
    throw Object.assign(new Error(d.error || `Erro ${res.status}`), { status: res.status, bloqueado: !!d.bloqueado });
  }
  return data as T;
}

const tenantInicial = () => ls.get(TENANT_KEY) || TENANT_PRINCIPAL;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<Modo>('checking');
  const [tenant, setTenant] = useState<string>(tenantInicial);
  const [db, setDb] = useState<Database>(() => (location.protocol.startsWith('http') ? createSeed() : loadTenantLocal(tenantInicial()) ?? createSeed()));
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
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
    ls.del(SESSION_KEY); ls.del(TOKEN_KEY); ls.del(TENANT_KEY);
    setTenant(TENANT_PRINCIPAL);
    setAssinatura(null);
    // volta para a base principal (a tela de login lista os usuários de demonstração dela)
    setDb(modoRef.current === 'local' ? loadTenantLocal(TENANT_PRINCIPAL)! : createSeed());
  }, []);

  const recarregar = useCallback(async () => {
    try {
      const { _assinatura, ...remoto } = await call<Database & { _assinatura?: Assinatura }>('/db');
      const migrado = migrar(remoto as Database);
      setDb(migrado ?? (remoto as Database));
      setAssinatura(_assinatura ?? null);
      // Base criada antes dos módulos novos: o proprietário grava a versão completada no banco
      if (migrado) await call('/reset', { method: 'POST', body: JSON.stringify({ db: migrado }) }).catch(() => undefined);
    } catch (e) {
      const err = e as Error & { status?: number; bloqueado?: boolean };
      if (err.status === 401 || err.bloqueado) { if (err.bloqueado) toast(err.message, 'error'); sair(); }
      else throw e;
    }
  }, [sair, toast]);

  // Detecta se existe a API do Worker; na primeira execução, popula o banco com os dados de demonstração.
  useEffect(() => {
    (async () => {
      const local = () => {
        const t = tenantInicial();
        setDb(loadTenantLocal(t) ?? createSeed());
        setAssinatura(assinaturaDe(t, loadPlataformaLocal()));
        setModo('local');
      };
      if (!location.protocol.startsWith('http')) { local(); return; }
      let status: { ok?: boolean; initialized?: boolean };
      try { status = await call('/status'); } catch { local(); return; }
      if (!status.ok) { local(); return; }
      if (!status.initialized) {
        try { await call('/bootstrap', { method: 'POST', body: JSON.stringify({ db: createSeed() }) }); } catch { /* outro acesso já inicializou */ }
      }
      if (ls.get(TOKEN_KEY)) await recarregar().catch(() => toast('Não foi possível carregar os dados do servidor.', 'error'));
      setModo('remote');
    })();
  }, [recarregar, toast]);

  useEffect(() => {
    if (modo === 'local') saveTenantLocal(tenant, db);
  }, [db, modo, tenant]);

  /** Aplica a mudança na tela na hora e sincroniza com o servidor; se falhar, recarrega do banco. */
  const sync = useCallback((path: string, init: RequestInit) => {
    if (modoRef.current !== 'remote') return;
    call(path, init).catch((e: Error & { status?: number; bloqueado?: boolean }) => {
      toast(e.message || 'Falha ao salvar no servidor.', 'error');
      if (e.status === 401 || e.bloqueado) sair(); else recarregar().catch(() => undefined);
    });
  }, [toast, sair, recarregar]);

  const user = db.usuarios.find((u) => u.id === userId) ?? null;
  const negocio = useMemo(() => perfilDaEmpresa(db.empresa), [db.empresa]);
  const liberado = useCallback((m: Modulo) => !assinatura || assinatura.modulos.includes(m), [assinatura]);

  const value = useMemo<StoreValue>(() => ({
    db, user, modo, toasts, toast, tenant, assinatura, liberado, negocio,
    adminPlataforma: tenant === TENANT_PRINCIPAL && user?.perfil === 'Proprietário',
    login: async (email, senha) => {
      if (modo === 'remote') {
        try {
          const r = await call<{ token: string; userId: string; tenant: string }>('/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
          ls.set(TOKEN_KEY, r.token); ls.set(SESSION_KEY, r.userId); ls.set(TENANT_KEY, r.tenant);
          setTenant(r.tenant);
          await recarregar();
          setUserId(r.userId);
          return null;
        } catch (e) { return (e as Error).message; }
      }
      // Modo local: procura o e-mail na base principal e nas empresas criadas neste navegador
      const plataforma = loadPlataformaLocal();
      const alvo = email.trim().toLowerCase();
      const candidatos = [TENANT_PRINCIPAL, ...plataforma.assinantes.filter((a) => a.provisionado).map((a) => a.id)];
      for (const t of candidatos) {
        const base = t === tenant ? db : loadTenantLocal(t);
        const u = base?.usuarios.find((x) => x.email.toLowerCase() === alvo);
        if (!base || !u) continue;
        if (u.status !== 'Ativo') return 'Usuário inativo. Fale com o administrador.';
        if (senha !== '123456') return 'Senha incorreta.';
        if (t !== TENANT_PRINCIPAL) {
          const motivo = bloqueio(plataforma.assinantes.find((a) => a.id === t));
          if (motivo) return motivo;
        }
        setTenant(t); ls.set(TENANT_KEY, t);
        setAssinatura(assinaturaDe(t, plataforma));
        setDb({ ...base, usuarios: base.usuarios.map((x) => (x.id === u.id ? { ...x, ultimoAcesso: new Date().toISOString() } : x)) });
        setUserId(u.id);
        ls.set(SESSION_KEY, u.id);
        return null;
      }
      return 'Usuário não encontrado.';
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
      // Empresas assinantes recebem os dados de exemplo mantendo os próprios usuários e cadastro
      const seed = createSeed();
      const novo = tenant === TENANT_PRINCIPAL ? seed : { ...seed, usuarios: db.usuarios, permissoes: db.permissoes, empresa: { ...db.empresa, versaoDados: seed.empresa.versaoDados } };
      if (modo === 'remote') {
        try { await call('/reset', { method: 'POST', body: JSON.stringify({ db: novo }) }); await recarregar(); }
        catch (e) { return (e as Error).message; }
      } else setDb(novo);
      return null;
    },
    changePassword: async (nova, atual, alvo) => {
      if (modo !== 'remote') return 'Alteração de senha disponível apenas na versão publicada com banco de dados.';
      try { await call('/password', { method: 'POST', body: JSON.stringify({ nova, atual, userId: alvo }) }); return null; }
      catch (e) { return (e as Error).message; }
    },
    can: (m) => !!user && liberado(m) && (user.perfil === 'Proprietário' || !!db.permissoes[user.perfil]?.includes(m)),
  }), [db, user, modo, toasts, toast, tenant, assinatura, liberado, negocio, sair, sync, recarregar]);

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
