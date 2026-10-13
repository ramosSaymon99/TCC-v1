import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Assinante, Database, Plataforma, UsoTenant } from '../types';
import { call, useStore } from './Store';
import { createPlataformaSeed, usoDaBase } from './plataforma';
import { deleteTenantLocal, loadPlataformaLocal, loadTenantLocal, savePlataformaLocal, saveTenantLocal } from './local';

type ColPlat = keyof Plataforma;
type ItemPlat<K extends ColPlat> = Plataforma[K][number];

interface PlataformaValue {
  dados: Plataforma;
  /** Uso medido das empresas com base própria (as de demonstração usam o uso simulado). */
  uso: Record<string, UsoTenant>;
  carregando: boolean;
  salvar: <K extends ColPlat>(col: K, item: ItemPlat<K>) => void;
  excluir: (col: 'planos' | 'faturas', id: string) => void;
  /** Cria a empresa e a base dela; devolve a senha provisória do responsável. */
  criarEmpresa: (a: Assinante, db: Database) => Promise<{ senha?: string; erro?: string }>;
  redefinirSenha: (id: string) => Promise<{ senha?: string; email?: string; erro?: string }>;
  excluirEmpresa: (id: string) => Promise<string | null>;
}

const Ctx = createContext<PlataformaValue | null>(null);
const VAZIA: Plataforma = { planos: [], assinantes: [], faturas: [], config: [] };

export function PlataformaProvider({ children }: { children: ReactNode }) {
  const { modo, toast, adminPlataforma } = useStore();
  const [dados, setDados] = useState<Plataforma>(VAZIA);
  const [uso, setUso] = useState<Record<string, UsoTenant>>({});
  const [carregando, setCarregando] = useState(true);
  const remoto = modo === 'remote';

  const usoLocal = (p: Plataforma) => Object.fromEntries(p.assinantes.filter((a) => a.provisionado).flatMap((a) => {
    const base = loadTenantLocal(a.id);
    return base ? [[a.id, usoDaBase(base)]] : [];
  }));

  const recarregar = useCallback(async () => {
    if (!remoto) {
      const p = loadPlataformaLocal();
      savePlataformaLocal(p);
      setDados(p); setUso(usoLocal(p)); setCarregando(false);
      return;
    }
    try {
      let r = await call<Plataforma & { uso: Record<string, UsoTenant> }>('/admin/dados');
      if (!r.planos.length) {
        // primeiro acesso ao console: grava planos padrão e a carteira de demonstração
        await call('/admin/bootstrap', { method: 'POST', body: JSON.stringify({ plataforma: createPlataformaSeed() }) }).catch(() => undefined);
        r = await call('/admin/dados');
      }
      const { uso: u, ...p } = r;
      setDados(p); setUso(u ?? {});
    } catch (e) {
      toast((e as Error).message || 'Não foi possível carregar a plataforma.', 'error');
    } finally { setCarregando(false); }
  }, [remoto, toast]);

  useEffect(() => { if (modo !== 'checking' && adminPlataforma) recarregar(); }, [modo, adminPlataforma, recarregar]);

  // modo local: persiste a cada alteração
  useEffect(() => { if (!remoto && !carregando) savePlataformaLocal(dados); }, [dados, remoto, carregando]);

  const value = useMemo<PlataformaValue>(() => ({
    dados, uso, carregando,
    salvar: (col, item) => {
      setDados((cur) => {
        const list = cur[col] as { id: string }[];
        const id = (item as { id: string }).id;
        return { ...cur, [col]: list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? item : x)) : [item, ...list] };
      });
      if (remoto) {
        call(`/admin/itens/${col}/${encodeURIComponent((item as { id: string }).id)}`, { method: 'PUT', body: JSON.stringify(item) })
          .catch((e: Error) => { toast(e.message, 'error'); recarregar(); });
      }
    },
    excluir: (col, id) => {
      setDados((cur) => ({ ...cur, [col]: (cur[col] as { id: string }[]).filter((x) => x.id !== id) }));
      if (remoto) call(`/admin/itens/${col}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e: Error) => { toast(e.message, 'error'); recarregar(); });
    },
    criarEmpresa: async (a, db) => {
      if (remoto) {
        try {
          const r = await call<{ senha: string }>('/admin/empresas', { method: 'POST', body: JSON.stringify({ assinante: a, db }) });
          await recarregar();
          return { senha: r.senha };
        } catch (e) { return { erro: (e as Error).message }; }
      }
      const email = db.usuarios[0]?.email.toLowerCase();
      const emUso = [loadTenantLocal('principal'), ...dados.assinantes.filter((x) => x.provisionado).map((x) => loadTenantLocal(x.id))]
        .some((b) => b?.usuarios.some((u) => u.email.toLowerCase() === email));
      if (emUso) return { erro: `O e-mail ${email} já é usado na plataforma.` };
      saveTenantLocal(a.id, db);
      setDados((cur) => ({ ...cur, assinantes: [{ ...a, provisionado: true }, ...cur.assinantes] }));
      setUso((u) => ({ ...u, [a.id]: usoDaBase(db) }));
      return { senha: '123456' };
    },
    redefinirSenha: async (id) => {
      if (!remoto) {
        const dono = loadTenantLocal(id)?.usuarios.find((u) => u.perfil === 'Proprietário' && u.status === 'Ativo');
        return dono ? { senha: '123456', email: dono.email } : { erro: 'A empresa não tem proprietário ativo.' };
      }
      try { return await call<{ senha: string; email: string }>(`/admin/empresas/${encodeURIComponent(id)}/senha`, { method: 'POST' }); }
      catch (e) { return { erro: (e as Error).message }; }
    },
    excluirEmpresa: async (id) => {
      if (remoto) {
        try { await call(`/admin/empresas/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
        catch (e) { return (e as Error).message; }
      } else deleteTenantLocal(id);
      setDados((cur) => ({ ...cur, assinantes: cur.assinantes.filter((a) => a.id !== id), faturas: cur.faturas.filter((f) => f.assinanteId !== id) }));
      return null;
    },
  }), [dados, uso, carregando, remoto, toast, recarregar]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlataforma() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlataforma fora do PlataformaProvider');
  return v;
}
