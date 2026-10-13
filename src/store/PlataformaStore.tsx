import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Assinante, Database, FormaPagamento, Plataforma, UsoTenant } from '../types';
import { call, useStore } from './Store';
import { createPlataformaSeed, usoDaBase } from './plataforma';
import { deleteTenantLocal, loadPlataformaLocal, loadTenantLocal, savePlataformaLocal, saveTenantLocal } from './local';

type ColPlat = keyof Plataforma;
type ItemPlat<K extends ColPlat> = Plataforma[K][number];

export interface AsaasStatus {
  configurado: boolean;
  ambiente: 'sandbox' | 'produção' | null;
  webhook: boolean;
  saldo?: number;
  erro?: string;
  ultimoEvento?: { evento: string; resultado: string; recebidoEm: string } | null;
  rotina?: { em: string } | null;
}

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
  /** Integração Asaas (somente na versão publicada; no modo local devolve null/erro). */
  asaas: {
    disponivel: boolean;
    status: () => Promise<AsaasStatus | null>;
    configurarWebhook: () => Promise<string | null>;
    sincronizar: () => Promise<{ erro?: string; faturas?: number; assinantes?: number }>;
    ativar: (id: string, forma: FormaPagamento) => Promise<string | null>;
    desativar: (id: string) => Promise<string | null>;
  };
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
  // pagamentos chegam pelo webhook a qualquer momento: atualiza ao voltar para a aba
  useEffect(() => {
    if (!remoto || !adminPlataforma) return;
    const onFocus = () => { if (document.visibilityState === 'visible') recarregar(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [remoto, adminPlataforma, recarregar]);

  const trocar = (registro: Assinante) => setDados((cur) => ({ ...cur, assinantes: cur.assinantes.map((a) => (a.id === registro.id ? registro : a)) }));

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
        call<{ registro?: Assinante; aviso?: string }>(`/admin/itens/${col}/${encodeURIComponent((item as { id: string }).id)}`, { method: 'PUT', body: JSON.stringify(item) })
          .then((r) => {
            // o servidor pode ter ajustado a empresa (ex.: valor atualizado no Asaas)
            if (col === 'assinantes' && r.registro) trocar(r.registro);
            if (r.aviso) toast(r.aviso, 'error');
          })
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
    asaas: {
      disponivel: remoto,
      status: async () => (remoto ? call<AsaasStatus>('/admin/asaas/status').catch(() => null) : null),
      configurarWebhook: async () => {
        try { await call('/admin/asaas/webhook', { method: 'POST' }); return null; } catch (e) { return (e as Error).message; }
      },
      sincronizar: async () => {
        try { const r = await call<{ faturas: number; assinantes: number }>('/admin/asaas/sincronizar', { method: 'POST' }); await recarregar(); return r; }
        catch (e) { return { erro: (e as Error).message }; }
      },
      ativar: async (id, forma) => {
        try { await call(`/admin/asaas/ativar/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ forma }) }); await recarregar(); return null; }
        catch (e) { return (e as Error).message; }
      },
      desativar: async (id) => {
        try { await call(`/admin/asaas/desativar/${encodeURIComponent(id)}`, { method: 'POST' }); await recarregar(); return null; }
        catch (e) { return (e as Error).message; }
      },
    },
  }), [dados, uso, carregando, remoto, toast, recarregar]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlataforma() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlataforma fora do PlataformaProvider');
  return v;
}
