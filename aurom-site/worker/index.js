/**
 * Aurom Tech · Worker Cloudflare do site
 * Serve o site estático (public/) e recebe o formulário de orçamento em /api/contato.
 *
 * Usa o mesmo banco D1 do TechGest (techgest-db):
 *   leads  → registro completo de cada pedido (ver worker/schema.sql)
 *   items  → cada pedido também entra como oportunidade na etapa "Leads" do Funil Comercial
 *
 * Variáveis opcionais (Settings → Variables and Secrets):
 *   ALLOWED_ORIGINS  domínios extras aceitos, separados por vírgula (ex.: https://auromtech.com.br)
 *   NOTIFY_WEBHOOK   URL de webhook (Discord, Slack, Google Chat…) avisada a cada novo pedido
 */

const SERVICOS = {
  web: 'Desenvolvimento Web e de Software',
  mobile: 'Desenvolvimento Mobile',
  manutencao: 'Manutenção de Computadores',
  redes: 'Infraestrutura de Redes',
  seguranca: 'Segurança de Dados',
  upgrade: 'Upgrade e Troca de Hardware',
  outro: 'Ainda não sei / outro',
};
const PRAZOS = ['Urgente, algo parou', 'Nas próximas semanas', 'Estou planejando'];
const LIMITE_POR_IP = 5;      // pedidos
const JANELA_MIN = 10;        // minutos

const enc = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const erro = (msg, status = 400, campo) => json({ error: msg, ...(campo ? { campo } : {}) }, status);
const limpa = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let esquemaOk = false;
async function garantirEsquema(env) {
  if (esquemaOk) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, protocolo TEXT NOT NULL, criado_em TEXT NOT NULL, nome TEXT NOT NULL, empresa TEXT,
      telefone TEXT NOT NULL, email TEXT, servico TEXT NOT NULL, prazo TEXT, mensagem TEXT NOT NULL, pagina TEXT,
      ip_hash TEXT, status TEXT NOT NULL DEFAULT 'Novo')`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS leads_ip_tempo ON leads (ip_hash, criado_em)'),
    // Tabela do TechGest; criada aqui só se o sistema ainda não tiver sido publicado
    env.DB.prepare('CREATE TABLE IF NOT EXISTS items (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (col, id))'),
  ]);
  esquemaOk = true;
}

function origemPermitida(req, env, url) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // navegadores sempre mandam em POST com fetch; ferramentas de teste não
  const extras = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return origin === url.origin || extras.includes(origin);
}

function validar(b) {
  const d = {
    nome: limpa(b.nome, 120),
    empresa: limpa(b.empresa, 120),
    telefone: limpa(b.telefone, 30),
    email: limpa(b.email, 160).toLowerCase(),
    servico: limpa(b.servico, 20),
    prazo: limpa(b.prazo, 40),
    mensagem: limpa(b.mensagem, 3000),
    pagina: limpa(b.pagina, 200),
  };
  if (d.nome.length < 2) return ['Informe seu nome.', 'nome'];
  const digitos = d.telefone.replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 13) return ['Informe um telefone com DDD.', 'telefone'];
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return ['Confira o e-mail.', 'email'];
  if (!SERVICOS[d.servico]) return ['Escolha o serviço.', 'servico'];
  if (!PRAZOS.includes(d.prazo)) d.prazo = PRAZOS[1];
  if (d.mensagem.length < 5) return ['Conte um pouco sobre a necessidade.', 'mensagem'];
  return [null, null, d];
}

async function notificar(env, d, protocolo) {
  if (!env.NOTIFY_WEBHOOK) return;
  const texto = [
    `Novo pedido de orçamento · ${protocolo}`,
    `${d.nome}${d.empresa ? ` (${d.empresa})` : ''} · ${d.telefone}${d.email ? ` · ${d.email}` : ''}`,
    `Serviço: ${SERVICOS[d.servico]} · Prazo: ${d.prazo}`,
    d.mensagem,
  ].join('\n');
  // "content" é lido pelo Discord; "text" pelo Slack e Google Chat
  await fetch(env.NOTIFY_WEBHOOK, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: texto, text: texto }),
  }).catch(() => {});
}

async function contato(req, env, ctx, url) {
  if (!origemPermitida(req, env, url)) return erro('Origem não permitida.', 403);
  if (Number(req.headers.get('content-length') || 0) > 20000) return erro('Mensagem grande demais.', 413);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return erro('Envio inválido.');

  // Campo invisível: robôs preenchem, pessoas não. Responde como sucesso para não dar pista.
  if (limpa(body.website, 200)) return json({ ok: true, protocolo: 'AT-0' });

  const [msg, campo, d] = validar(body);
  if (msg) return erro(msg, 422, campo);

  await garantirEsquema(env);
  const agora = new Date();
  const ipHash = await sha256(`${req.headers.get('cf-connecting-ip') || 'local'}|aurom`);
  const desde = new Date(agora.getTime() - JANELA_MIN * 60_000).toISOString();
  const recentes = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ? AND criado_em > ?').bind(ipHash, desde).first();
  if ((recentes?.n ?? 0) >= LIMITE_POR_IP) return erro('Recebemos vários pedidos seguidos daqui. Aguarde alguns minutos ou fale pelo WhatsApp.', 429);

  const id = crypto.randomUUID();
  const iso = agora.toISOString();
  const protocolo = `AT-${iso.slice(2, 10).replace(/-/g, '')}-${id.slice(0, 4).toUpperCase()}`;
  const servicoNome = SERVICOS[d.servico];
  const oportunidade = {
    id: `site-${id}`,
    titulo: d.empresa ? `${d.nome} · ${d.empresa}` : d.nome,
    servico: servicoNome,
    valor: 0,
    etapa: 'Leads',
    criadoEm: iso.slice(0, 10),
    atualizadoEm: iso.slice(0, 10),
    origem: 'Site',
    protocolo,
    contato: { telefone: d.telefone, email: d.email },
    prazo: d.prazo,
    observacoes: d.mensagem,
  };

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO leads (id, protocolo, criado_em, nome, empresa, telefone, email, servico, prazo, mensagem, pagina, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, protocolo, iso, d.nome, d.empresa, d.telefone, d.email, servicoNome, d.prazo, d.mensagem, d.pagina, ipHash),
    env.DB.prepare('INSERT INTO items (col, id, data, updated_at) VALUES (?, ?, ?, ?)')
      .bind('oportunidades', oportunidade.id, JSON.stringify(oportunidade), iso),
  ]);

  ctx.waitUntil(notificar(env, d, protocolo));
  return json({ ok: true, protocolo });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        if (url.pathname === '/api/status' && req.method === 'GET') return json({ ok: true });
        if (url.pathname === '/api/contato' && req.method === 'POST') return await contato(req, env, ctx, url);
        return erro('Rota não encontrada.', 404);
      } catch (e) {
        console.error(e);
        return erro('Não foi possível registrar agora. Tente de novo ou fale pelo WhatsApp.', 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
