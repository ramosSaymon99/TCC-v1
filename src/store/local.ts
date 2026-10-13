import type { Database, Plataforma } from '../types';
import { createSeed, migrar } from './seed';
import { createPlataformaSeed, TENANT_PRINCIPAL } from './plataforma';

/** Persistência no navegador (modo local: arquivo aberto direto ou `npm run dev`, sem o Worker). */
export const DB_KEY = 'techgest:db:v1';
export const SESSION_KEY = 'techgest:session:v1';
export const TOKEN_KEY = 'techgest:token:v1';
export const TENANT_KEY = 'techgest:tenant:v1';
const PLAT_KEY = 'techgest:plataforma:v1';
const dbKey = (tenant: string) => (tenant === TENANT_PRINCIPAL ? DB_KEY : `techgest:db:${tenant}`);

export const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* armazenamento indisponível */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* armazenamento indisponível */ } },
};

/** Base de uma empresa no navegador; a principal cai nos dados de demonstração quando não existe. */
export function loadTenantLocal(tenant: string): Database | null {
  const raw = ls.get(dbKey(tenant));
  if (raw) {
    try {
      const db = JSON.parse(raw) as Database;
      return migrar(db) ?? db;
    } catch { /* base corrompida */ }
  }
  return tenant === TENANT_PRINCIPAL ? createSeed() : null;
}
export const saveTenantLocal = (tenant: string, db: Database) => ls.set(dbKey(tenant), JSON.stringify(db));
export const deleteTenantLocal = (tenant: string) => ls.del(dbKey(tenant));

export function loadPlataformaLocal(): Plataforma {
  const raw = ls.get(PLAT_KEY);
  if (raw) {
    try { return JSON.parse(raw) as Plataforma; } catch { /* corrompida: recria */ }
  }
  return createPlataformaSeed();
}
export const savePlataformaLocal = (p: Plataforma) => ls.set(PLAT_KEY, JSON.stringify(p));
