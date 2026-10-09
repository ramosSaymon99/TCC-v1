/**
 * Cliente da API. Detecta onde o app está rodando:
 *  - Publicado no Cloudflare (/api/status responde): dados no D1, compartilhados entre os cuidadores.
 *  - Aberto localmente / hospedagem estática: modo local, mesmo contrato da API, dados no navegador.
 */
import type { Baby, BabyData, NotifPrefs, Resource, User } from '../types';
import { uid } from './time';
import { enfileirar, enfileiravel, fila, removerDaFila, type Pendente } from './offline';

export type Modo = 'cloud' | 'local';
let modo: Modo = 'local';
let token = lerLS('ninho-token') ?? '';

function lerLS(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function gravarLS(k: string, v: string | null) {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem storage */ }
}

export async function detectarModo(): Promise<Modo> {
  let r: Response;
  try {
    r = await fetch('./api/status', { headers: { accept: 'application/json' } });
  } catch {
    // Sem internet: se este aparelho já usou a versão publicada, continua nela (com cache e fila offline)
    modo = lerLS('ninho-modo') === 'cloud' ? 'cloud' : 'local';
    return modo;
  }
  const j = await r.json().catch(() => null);
  modo = j?.ok ? 'cloud' : 'local';
  gravarLS('ninho-modo', modo);
  return modo;
}
export const getModo = () => modo;
export const temSessao = () => !!token;
export const getToken = () => token;
export function sair() {
  token = '';
  gravarLS('ninho-token', null);
}

export class ApiError extends Error {
  constructor(msg: string, public status: number) { super(msg); }
}

export const SEM_REDE = 0;
let usuarioAtual = '';
export const definirUsuarioAtual = (id: string) => { usuarioAtual = id; };

async function enviar(method: string, path: string, body?: unknown) {
  let r: Response;
  try {
    r = await fetch(`./api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem conexão com a internet.', SEM_REDE);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || 'Falha de comunicação com o servidor.', r.status);
  return j;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (modo === 'local') return local(method, path, body) as T;
  // Alterações de um bebê: se já há fila ou não há rede, entram na fila e são enviadas depois (na ordem)
  if (enfileiravel(method, path)) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!offline && !fila().length) {
      try {
        return (await enviar(method, path, body)) as T;
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== SEM_REDE) throw e;
      }
    }
    enfileirar({ method: method as Pendente['method'], path, body: body as Record<string, unknown>, userId: usuarioAtual });
    if (!offline) void sincronizar();
    return { id: (body as { id?: string })?.id, ok: true, offline: true } as T;
  }
  return (await enviar(method, path, body)) as T;
}

let sincronizando: Promise<{ enviados: number; falhas: string[] }> | null = null;
/** Envia a fila na ordem. Para no primeiro erro de rede; descarta (e informa) o que o servidor recusar. */
export function sincronizar() {
  if (modo === 'local' || !token) return Promise.resolve({ enviados: 0, falhas: [] as string[] });
  sincronizando ??= (async () => {
    let enviados = 0;
    const falhas: string[] = [];
    try {
      for (const op of fila()) {
        if (op.userId && usuarioAtual && op.userId !== usuarioAtual) { removerDaFila(op.qid); continue; } // fila de outra conta neste aparelho
        try {
          await enviar(op.method, op.path, op.body);
          enviados++;
          removerDaFila(op.qid);
        } catch (e) {
          if (e instanceof ApiError && (e.status === SEM_REDE || e.status === 401 || e.status === 429 || e.status >= 500)) break;
          falhas.push(e instanceof Error ? e.message : 'erro');
          removerDaFila(op.qid);
        }
      }
    } finally {
      sincronizando = null;
    }
    return { enviados, falhas };
  })();
  return sincronizando;
}

function guardarSessao(r: { token: string; user: User }) {
  token = r.token;
  gravarLS('ninho-token', token);
  return r.user;
}

export const api = {
  signup: async (name: string, email: string, password: string, consent: boolean) => guardarSessao(await req('POST', '/auth/signup', { name, email, password, consent })),
  authConfig: () => req<{ email: boolean; termos: string }>('GET', '/auth/config'),
  forgot: (email: string) => req<{ ok: boolean; email: boolean }>('POST', '/auth/forgot', { email }),
  reset: async (b: { token?: string; email?: string; code?: string; password: string }) => guardarSessao(await req('POST', '/auth/reset', b)),
  deleteMe: (password: string) => req<{ ok: boolean; bebesApagados: number; administracaoTransferida: number }>('DELETE', '/me', { password }),
  resetCode: (id: string, userId: string) => req<{ code: string; email: string; expira_min: number }>('POST', `/babies/${id}/members/${userId}/reset-code`),
  /** Exportação completa (LGPD – portabilidade) em JSON. */
  exportBaby: async (id: string): Promise<Blob> => {
    if (modo === 'local') return new Blob([JSON.stringify(local('GET', `/babies/${id}/export`, undefined), null, 2)], { type: 'application/json' });
    const r = await fetch(`./api/babies/${id}/export`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new ApiError((await r.json().catch(() => ({}))).error || 'Falha ao exportar.', r.status);
    return r.blob();
  },
  login: async (email: string, password: string) => guardarSessao(await req('POST', '/auth/login', { email, password })),
  me: () => req<{ user: User; babies: Baby[] }>('GET', '/me'),
  updateMe: async (b: { name: string; password?: string; newPassword?: string }) => {
    const r = await req<{ ok: boolean; token?: string }>('PUT', '/me', b);
    if (r.token) { token = r.token; gravarLS('ninho-token', token); } // trocar a senha encerra as outras sessões
    return r;
  },
  createBaby: (b: Record<string, unknown>) => req<{ id: string }>('POST', '/babies', b),
  getBaby: (id: string, since: string) => req<BabyData>('GET', `/babies/${id}?since=${encodeURIComponent(since)}`),
  updateBaby: (id: string, b: Partial<Baby>) => req('PUT', `/babies/${id}`, b),
  deleteBaby: (id: string) => req('DELETE', `/babies/${id}`),
  invite: (id: string, role: string, access: string) => req<{ code: string; expires_at: string }>('POST', `/babies/${id}/invites`, { role, access }),
  invitePreview: (code: string) => req<{ bebe: string; role: string; access: string }>('GET', `/invites/${code.trim().toUpperCase()}`),
  acceptInvite: (code: string, role?: string) => req<{ babyId: string }>('POST', '/invites/accept', { code, role }),
  updateMember: (id: string, userId: string, b: { role?: string; access?: string }) => req('PUT', `/babies/${id}/members/${userId}`, b),
  removeMember: (id: string, userId: string) => req('DELETE', `/babies/${id}/members/${userId}`),
  create: (res: Resource, id: string, item: Record<string, unknown>) => req<{ id: string }>('POST', `/babies/${id}/${res}`, { id: uid(), ...item }),
  update: (res: Resource, id: string, itemId: string, patch: Record<string, unknown>) => req('PUT', `/babies/${id}/${res}/${itemId}`, patch),
  remove: (res: Resource, id: string, itemId: string) => req('DELETE', `/babies/${id}/${res}/${itemId}`),
  setVaccine: (id: string, code: string, date: string) => req('PUT', `/babies/${id}/vaccines/${code}`, { date }),
  removeVaccine: (id: string, code: string) => req('DELETE', `/babies/${id}/vaccines/${code}`),
  seed: (id: string, data: Record<string, unknown[]>) => req('POST', `/babies/${id}/seed`, data),
  /** Métrica de uso do piloto (fire-and-forget; só na versão publicada). */
  uso: (evento: string, valor?: string | number, babyId?: string) => {
    if (modo !== 'cloud' || !token) return;
    void enviar('POST', '/uso', { evento, valor, babyId }).catch(() => undefined);
  },
  setMyPhoto: (photo: string) => req<{ photo: string }>('PUT', '/me/photo', { photo }),
  removeMyPhoto: () => req('DELETE', '/me/photo'),
  setBabyPhoto: (id: string, photo: string) => req<{ photo: string }>('PUT', `/babies/${id}/photo`, { photo }),
  removeBabyPhoto: (id: string) => req('DELETE', `/babies/${id}/photo`),
  push: () => req<{ publicKey: string | null; prefs: NotifPrefs; devices: number }>('GET', '/push'),
  pushPrefs: (p: Partial<NotifPrefs>) => req<{ prefs: NotifPrefs }>('PUT', '/push/prefs', p),
  pushSubscribe: (sub: PushSubscriptionJSON, tz: string) => req('POST', '/push/subscribe', { ...sub, tz }),
  pushUnsubscribe: (endpoint: string) => req('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => req<{ enviados: number; aparelhos: number }>('POST', '/push/test'),
};

/* =====================================================================
 * Modo local: implementa o mesmo contrato do Worker sobre o localStorage.
 * ===================================================================== */
type Row = Record<string, any>;
interface LocalDB {
  users: (User & { password: string })[];
  babies: Row[];
  members: Row[];
  invites: Row[];
  events: Row[];
  growth: Row[];
  supplies: Row[];
  notes: Row[];
  appointments: Row[];
  vaccines: Row[];
}
const LS_DB = 'ninho-local-db';
let cache: LocalDB | null = null;
function db(): LocalDB {
  if (cache) return cache;
  try { cache = JSON.parse(lerLS(LS_DB) || ''); } catch { cache = null; }
  cache ??= { users: [], babies: [], members: [], invites: [], events: [], growth: [], supplies: [], notes: [], appointments: [], vaccines: [] };
  return cache;
}
function salvar() {
  gravarLS(LS_DB, JSON.stringify(db()));
}
const falha = (msg: string, status = 400) => { throw new ApiError(msg, status); };
const NIVEL: Record<string, number> = { leitor: 1, editor: 2, admin: 3 };
const COLS: Record<Resource, string[]> = {
  events: ['type', 'start_at', 'end_at', 'data', 'note'],
  growth: ['date', 'weight_g', 'height_cm', 'head_cm', 'source', 'note'],
  supplies: ['name', 'category', 'unit', 'qty', 'min_qty', 'auto_type', 'per_use', 'buyer_id', 'note'],
  notes: ['text', 'pinned', 'done'],
  appointments: ['date', 'title', 'doctor', 'note', 'done'],
};
const pick = (res: Resource, b: Row) => Object.fromEntries(COLS[res].filter((c) => c in b).map((c) => [c, typeof b[c] === 'boolean' ? (b[c] ? 1 : 0) : b[c]]));

function local(method: string, path: string, body: any): unknown {
  const D = db();
  const agora = new Date().toISOString();
  const [rota, qs] = path.split('?');
  const r = (m: string, p: string) => method === m && rota === p;

  if (r('POST', '/auth/signup')) {
    const email = String(body.email).trim().toLowerCase();
    if (String(body.name ?? '').trim().length < 2) falha('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) falha('E-mail inválido.');
    if (String(body.password ?? '').length < 6) falha('A senha deve ter ao menos 6 caracteres.');
    if (body.consent !== true) falha('Para criar a conta, aceite a Política de Privacidade e os Termos de Uso.');
    if (D.users.some((u) => u.email === email)) falha('Este e-mail já tem cadastro. Entre com sua senha.', 409);
    const u = { id: uid(), name: String(body.name).trim(), email, password: String(body.password) };
    D.users.push(u); salvar();
    return { token: u.id, user: { id: u.id, name: u.name, email } };
  }
  if (r('POST', '/auth/login')) {
    const u = D.users.find((x) => x.email === String(body.email).trim().toLowerCase() && x.password === String(body.password));
    if (!u) falha('E-mail ou senha inválidos.', 401);
    return { token: u!.id, user: { id: u!.id, name: u!.name, email: u!.email } };
  }

  if (r('GET', '/auth/config')) return { email: false, termos: '2026-10' };
  const mci = rota.match(/^\/invites\/([A-Z0-9]{6})$/);
  if (mci && method === 'GET') {
    const inv = D.invites.find((i) => i.code === mci[1]);
    if (!inv || inv.used_by || inv.expires_at < agora) falha('Convite inválido, já usado ou expirado. Peça um novo código a quem convidou você.', 404);
    return { bebe: String(D.babies.find((b) => b.id === inv!.baby_id)?.name ?? '').split(' ')[0], role: inv!.role, access: inv!.access };
  }
  if (r('POST', '/auth/forgot')) return { ok: true, email: false };
  if (r('POST', '/auth/reset')) {
    const u = D.users.find((x) => x.email === String(body.email ?? '').trim().toLowerCase()) as Row | undefined;
    if (!u || !u.resetCode || u.resetCode.code !== String(body.code ?? '').trim().toUpperCase() || u.resetCode.exp < Date.now()) falha('Código ou link inválido ou expirado. Peça um novo.');
    if (String(body.password ?? '').length < 6) falha('A nova senha deve ter ao menos 6 caracteres.');
    u!.password = body.password;
    u!.resetCode = null;
    salvar();
    return { token: u!.id, user: { id: u!.id, name: u!.name, email: u!.email, photo: u!.photo ?? null } };
  }
  const me = D.users.find((u) => u.id === token);
  if (!me) falha('Sessão expirada. Entre novamente.', 401);
  const myId = me!.id;

  if (r('DELETE', '/me')) {
    if (!String(me!.email).endsWith('@exemplo.ninho') && body?.password !== me!.password) falha('Senha incorreta.', 403);
    let bebesApagados = 0;
    let administracaoTransferida = 0;
    for (const v of D.members.filter((m) => m.user_id === myId)) {
      const outros = D.members.filter((m) => m.baby_id === v.baby_id && m.user_id !== myId);
      if (!outros.length) {
        for (const k of ['events', 'growth', 'supplies', 'notes', 'appointments', 'vaccines', 'invites'] as const) D[k] = D[k].filter((x) => x.baby_id !== v.baby_id);
        D.babies = D.babies.filter((b) => b.id !== v.baby_id);
        bebesApagados++;
      } else if (v.access === 'admin' && !outros.some((o) => o.access === 'admin')) {
        outros[0].access = 'admin';
        administracaoTransferida++;
      }
    }
    D.members = D.members.filter((m) => m.user_id !== myId);
    D.users = D.users.filter((u) => u.id !== myId);
    salvar();
    return { ok: true, bebesApagados, administracaoTransferida };
  }
  if (r('PUT', '/me/photo')) { (me as Row).photo = body.photo; salvar(); return { photo: body.photo }; }
  if (r('DELETE', '/me/photo')) { (me as Row).photo = null; salvar(); return { ok: true }; }
  if (r('GET', '/push')) {
    const prefs = { atividade: false, cronometro: true, recados: true, lembretes: true, estoque: true, consultas: true, familia: true, silencio: { on: false, de: '22:00', ate: '06:00' }, ...((me as Row).notifPrefs ?? {}) };
    return { publicKey: null, prefs, devices: 0 };
  }
  if (r('PUT', '/push/prefs')) { (me as Row).notifPrefs = { ...((me as Row).notifPrefs ?? {}), ...body }; salvar(); return { prefs: (me as Row).notifPrefs }; }
  if (rota.startsWith('/push/')) falha('Notificações no celular exigem o app publicado no Cloudflare.', 400);
  if (r('GET', '/me')) {
    const babies = D.members.filter((m) => m.user_id === myId).map((m) => ({ ...D.babies.find((b) => b.id === m.baby_id), role: m.role, access: m.access }) as Row).filter((b) => b.id);
    return { user: { id: myId, name: me!.name, email: me!.email, photo: (me as Row).photo ?? null }, babies };
  }
  if (r('PUT', '/me')) {
    if (body.newPassword) {
      if (body.password !== me!.password) falha('Senha atual incorreta.', 403);
      me!.password = body.newPassword;
    }
    me!.name = String(body.name || me!.name).trim();
    salvar();
    return { ok: true };
  }
  if (r('POST', '/babies')) {
    if (!String(body.name ?? '').trim()) falha('Informe o nome do bebê.');
    if (body.guardian_consent !== true) falha('Confirme que você é responsável legal pela criança ou tem autorização de um responsável.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.birth_date ?? ''))) falha('Informe a data de nascimento.');
    const id = uid();
    D.babies.push({ id, name: body.name.trim(), birth_date: body.birth_date, sex: body.sex ?? null, color: body.color ?? null, routine: body.routine ?? null, notes: body.notes ?? null, created_by: myId, created_at: agora });
    D.members.push({ baby_id: id, user_id: myId, role: body.role || 'outro', access: 'admin', created_at: agora });
    if (body.weight_g || body.height_cm) D.growth.push({ id: uid(), baby_id: id, date: body.consult_date || agora.slice(0, 10), weight_g: body.weight_g || null, height_cm: body.height_cm || null, source: 'consulta', note: 'Última consulta (cadastro)', user_id: myId, created_at: agora });
    salvar();
    return { id };
  }
  if (r('POST', '/invites/accept')) {
    const inv = D.invites.find((i) => i.code === String(body.code).trim().toUpperCase());
    if (!inv || inv.used_by || inv.expires_at < agora) falha('Convite inválido ou expirado. Peça um novo código.', 404);
    inv!.used_by = myId;
    if (!D.members.some((m) => m.baby_id === inv!.baby_id && m.user_id === myId)) D.members.push({ baby_id: inv!.baby_id, user_id: myId, role: body.role || inv!.role, access: inv!.access, created_at: agora });
    salvar();
    return { babyId: inv!.baby_id };
  }

  const mb = rota.match(/^\/babies\/([^/]+)(\/.*)?$/);
  if (!mb) return falha('Rota não encontrada.', 404);
  const babyId = mb[1];
  const sub = mb[2] || '';
  const v = D.members.find((m) => m.baby_id === babyId && m.user_id === myId);
  if (!v) falha('Você não está vinculado(a) a este bebê.', 403);
  const pode = (n: string) => NIVEL[v!.access] >= NIVEL[n];
  const doBebe = (rows: Row[]) => rows.filter((x) => x.baby_id === babyId);
  const ajusteFralda = (sinal: number) => doBebe(D.supplies).filter((s) => s.auto_type === 'fralda').forEach((s) => { s.qty = Math.max(0, s.qty + sinal * (s.per_use || 1)); });

  if (method === 'GET' && sub === '') {
    const since = new URLSearchParams(qs).get('since') || '';
    const baby = D.babies.find((b) => b.id === babyId);
    return structuredClone({
      baby,
      members: doBebe(D.members).map((m) => { const u = D.users.find((x) => x.id === m.user_id) as Row | undefined; return { ...m, name: u?.name ?? '?', email: u?.email ?? '', photo: u?.photo ?? null }; }),
      events: doBebe(D.events).filter((e) => e.start_at >= since || !e.end_at).sort((a, b) => a.start_at.localeCompare(b.start_at)),
      growth: doBebe(D.growth).sort((a, b) => a.date.localeCompare(b.date)),
      supplies: doBebe(D.supplies).sort((a, b) => a.name.localeCompare(b.name)),
      notes: doBebe(D.notes).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      appointments: doBebe(D.appointments).sort((a, b) => a.date.localeCompare(b.date)),
      vaccines: doBebe(D.vaccines),
      access: v!.access, role: v!.role,
    });
  }
  if (method === 'PUT' && sub === '') {
    if (!pode('admin')) falha('Somente administradores editam o perfil do bebê.', 403);
    Object.assign(D.babies.find((b) => b.id === babyId)!, Object.fromEntries(['name', 'birth_date', 'sex', 'color', 'routine', 'notes'].filter((k) => k in body).map((k) => [k, body[k]])));
    salvar();
    return { ok: true };
  }
  if (sub === '/photo') {
    if (!pode('admin')) falha('Somente administradores trocam a foto do bebê.', 403);
    D.babies.find((b) => b.id === babyId)!.photo = method === 'PUT' ? body.photo : null;
    salvar();
    return { photo: method === 'PUT' ? body.photo : null };
  }
  if (method === 'DELETE' && sub === '') {
    if (!pode('admin')) falha('Somente administradores excluem o bebê.', 403);
    for (const k of ['events', 'growth', 'supplies', 'notes', 'appointments', 'vaccines', 'invites', 'members'] as const) D[k] = D[k].filter((x) => x.baby_id !== babyId);
    D.babies = D.babies.filter((b) => b.id !== babyId);
    salvar();
    return { ok: true };
  }
  if (method === 'POST' && sub === '/invites') {
    if (!pode('admin')) falha('Somente administradores convidam cuidadores.', 403);
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    const expires_at = new Date(Date.now() + 7 * 86400_000).toISOString();
    D.invites.push({ code, baby_id: babyId, role: body.role, access: body.access, created_by: myId, expires_at });
    salvar();
    return { code, expires_at };
  }
  if (method === 'GET' && sub === '/export') {
    if (!pode('admin')) falha('Somente administradores exportam os dados do bebê.', 403);
    return { exportado_em: agora, app: 'Ninho', ...(local('GET', `/babies/${babyId}?since=`, undefined) as Row) };
  }
  const mrc = sub.match(/^\/members\/([^/]+)\/reset-code$/);
  if (mrc && method === 'POST') {
    if (!pode('admin')) falha('Somente administradores geram código de redefinição.', 403);
    const u = D.users.find((x) => x.id === mrc[1]) as Row | undefined;
    if (!u || u.id === myId) falha('Cuidador não encontrado.', 404);
    const code = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    u!.resetCode = { code, exp: Date.now() + 30 * 60_000 };
    salvar();
    return { code, email: u!.email, expira_min: 30 };
  }
  const mm = sub.match(/^\/members\/([^/]+)$/);
  if (mm) {
    const alvo = D.members.find((m) => m.baby_id === babyId && m.user_id === mm[1]);
    if (!alvo) falha('Cuidador não encontrado.', 404);
    const admins = doBebe(D.members).filter((m) => m.access === 'admin').length;
    if (method === 'PUT') {
      if (!pode('admin') && !(mm[1] === myId && body.access === undefined)) falha('Somente administradores alteram cuidadores.', 403);
      const access = pode('admin') && body.access ? body.access : alvo!.access;
      if (alvo!.access === 'admin' && access !== 'admin' && admins <= 1) falha('O bebê precisa de ao menos um administrador.', 409);
      alvo!.role = body.role ?? alvo!.role;
      alvo!.access = access;
    } else {
      if (mm[1] !== myId && !pode('admin')) falha('Somente administradores removem cuidadores.', 403);
      if (alvo!.access === 'admin' && admins <= 1) falha('O bebê precisa de ao menos um administrador. Promova outra pessoa antes.', 409);
      D.members = D.members.filter((m) => m !== alvo);
    }
    salvar();
    return { ok: true };
  }
  const mv = sub.match(/^\/vaccines\/([a-z0-9_]+)$/);
  if (mv) {
    if (!pode('editor')) falha('Seu acesso é somente leitura.', 403);
    D.vaccines = D.vaccines.filter((x) => !(x.baby_id === babyId && x.code === mv[1]));
    if (method === 'PUT') D.vaccines.push({ baby_id: babyId, code: mv[1], date: body.date, user_id: myId });
    salvar();
    return { ok: true };
  }
  if (method === 'POST' && sub === '/seed') {
    if (!pode('admin')) falha('Somente administradores.', 403);
    for (const res of Object.keys(COLS) as Resource[]) {
      for (const it of body[res] ?? []) D[res].push({ id: it.id, baby_id: babyId, user_id: doBebe(D.members).some((m) => m.user_id === it.user_id) ? it.user_id : myId, created_at: agora, updated_at: agora, ...pick(res, it) });
    }
    salvar();
    return { ok: true };
  }
  const mr = sub.match(/^\/(events|growth|supplies|notes|appointments)(?:\/([^/]+))?$/);
  if (mr) {
    const res = mr[1] as Resource;
    const itemId = mr[2];
    if (!pode('editor')) falha('Seu acesso é somente leitura. Peça a um administrador para mudar.', 403);
    if (method === 'POST') {
      D[res].push({ id: body.id || uid(), baby_id: babyId, user_id: myId, created_at: agora, updated_at: agora, ...pick(res, body) });
      if (res === 'events' && body.type === 'fralda') ajusteFralda(-1);
    } else if (method === 'PUT') {
      const it = D[res].find((x) => x.id === itemId && x.baby_id === babyId);
      if (!it) falha('Registro não encontrado.', 404);
      Object.assign(it!, pick(res, body), { updated_at: agora });
    } else if (method === 'DELETE') {
      const it = D[res].find((x) => x.id === itemId && x.baby_id === babyId);
      if (it) {
        D[res] = D[res].filter((x) => x !== it);
        if (res === 'events' && it.type === 'fralda') ajusteFralda(1);
      }
    }
    salvar();
    return { ok: true };
  }
  return falha('Rota não encontrada.', 404);
}

/** Cria um segundo cuidador de demonstração no modo local (para ver indicadores por pessoa). */
export function localCriarUsuarioDemo(babyId: string, name: string, role: string) {
  const D = db();
  const u = { id: uid(), name, email: `${role}.${Date.now().toString(36)}@demo.ninho`, password: Math.random().toString(36) };
  D.users.push(u);
  D.members.push({ baby_id: babyId, user_id: u.id, role, access: 'editor', created_at: new Date().toISOString() });
  salvar();
  return u.id;
}
