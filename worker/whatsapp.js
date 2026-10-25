/**
 * Pivot Hub · Integração com o WhatsApp Business (Cloud API da Meta)
 *
 * Cada empresa (tenant) conecta o próprio número do WhatsApp Business:
 *   - credenciais guardadas na tabela secrets, chave `wa:<tenant>` (token e app secret nunca voltam para o navegador);
 *   - envio de mensagens de texto e de modelos aprovados pela Meta (obrigatórios fora da janela de 24 h);
 *   - webhook próprio por empresa: /api/whatsapp/webhook/<tenant>
 *       GET  → verificação da Meta (hub.verify_token)
 *       POST → mensagens recebidas e status de entrega, autenticados pela assinatura X-Hub-Signature-256
 *   - toda mensagem fica registrada na coleção `mensagens` da empresa; contato desconhecido vira oportunidade no funil.
 */

const GRAPH_PADRAO = 'https://graph.facebook.com';
const VERSAO_PADRAO = 'v23.0';
const enc = new TextEncoder();

const chave = (tenant) => `wa:${tenant}`;
const agora = () => new Date().toISOString();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const aleatorio = (n = 24) => hex(crypto.getRandomValues(new Uint8Array(n)));

/** Somente dígitos, com DDI 55 para números brasileiros informados sem ele. */
export function normalizarTelefone(tel) {
  const d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}
/** DDD + 8 últimos dígitos: casa números com e sem o nono dígito (o WhatsApp às vezes omite). */
export function chaveTelefone(tel) {
  let d = normalizarTelefone(tel);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d.length >= 10 ? `${d.slice(0, 2)}${d.slice(-8)}` : d;
}

async function lerConfig(env, tenant) {
  const r = await env.DB.prepare('SELECT value FROM secrets WHERE key = ?').bind(chave(tenant)).first();
  return r ? JSON.parse(r.value) : null;
}
async function gravarConfig(env, tenant, cfg) {
  await env.DB.prepare('INSERT INTO secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(chave(tenant), JSON.stringify(cfg)).run();
}
const mascarar = (s) => (s ? `••••${String(s).slice(-4)}` : '');

/** O que o navegador pode ver da configuração (sem token nem app secret). */
function publica(cfg, origem, tenant) {
  return {
    configurado: !!(cfg?.phoneNumberId && cfg?.token),
    phoneNumberId: cfg?.phoneNumberId ?? '',
    wabaId: cfg?.wabaId ?? '',
    numero: cfg?.numero ?? '',
    nomeVerificado: cfg?.nomeVerificado ?? '',
    token: mascarar(cfg?.token),
    appSecret: mascarar(cfg?.appSecret),
    verifyToken: cfg?.verifyToken ?? '',
    webhookUrl: `${origem}/api/whatsapp/webhook/${tenant}`,
    modelo: cfg?.modelo ?? { nome: '', idioma: 'pt_BR' },
    ultimoEvento: cfg?.ultimoEvento ?? null,
  };
}

async function graph(env, cfg, path, init = {}) {
  const base = (env.WHATSAPP_GRAPH_URL || GRAPH_PADRAO).replace(/\/$/, '');
  const versao = env.WHATSAPP_GRAPH_VERSION || VERSAO_PADRAO;
  const res = await fetch(`${base}/${versao}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json', ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(traduzirErro(e) || `WhatsApp respondeu ${res.status}.`);
    err.codigo = e.code;
    err.status = res.status;
    throw err;
  }
  return data;
}
function traduzirErro(e) {
  switch (e.code) {
    case 131047: return 'O cliente não conversa com a empresa há mais de 24 horas. Envie um modelo aprovado ou use o link do WhatsApp.';
    case 131026: return 'O número não está no WhatsApp ou não pode receber mensagens.';
    case 190: return 'O token de acesso da Meta é inválido ou expirou. Gere um novo em Configurações.';
    case 100: return e.error_data?.details || e.message || 'Parâmetro inválido para a API do WhatsApp.';
    case 132001: return 'O modelo de mensagem não existe ou não foi aprovado pela Meta.';
    default: return e.error_data?.details || e.message || '';
  }
}

/* ---------------- envio ---------------- */
async function enviar(env, cfg, para, texto, usarModelo, nomeCliente) {
  const corpo = usarModelo && cfg.modelo?.nome
    ? {
        type: 'template',
        template: {
          name: cfg.modelo.nome, language: { code: cfg.modelo.idioma || 'pt_BR' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: nomeCliente || 'cliente' }, { type: 'text', text: texto.replace(/\s*\n+\s*/g, ' ').slice(0, 1000) }] }],
        },
      }
    : { type: 'text', text: { body: texto, preview_url: true } };
  const r = await graph(env, cfg, `${cfg.phoneNumberId}/messages`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: para, ...corpo }) });
  return { id: r.messages?.[0]?.id ?? '', modelo: corpo.type === 'template' };
}

/* ---------------- rotas autenticadas (dentro de /api/whatsapp) ---------------- */
/**
 * @param ctx { tenant, user, dono, perms } da sessão; util = helpers do index.js
 */
export async function rotasWhatsApp(req, env, path, method, body, ctx, util) {
  const { json, erro, upsert, getItem } = util;
  const { tenant, user, dono, perms } = ctx;
  const origem = new URL(req.url).origin;
  const podeConfigurar = dono || (perms[user.perfil] ?? []).includes('configuracoes');

  if (path === '/config' && method === 'GET') return json(publica(await lerConfig(env, tenant), origem, tenant));

  if (path === '/config' && method === 'PUT') {
    if (!podeConfigurar) return erro('Somente o proprietário configura o WhatsApp.', 403);
    const atual = (await lerConfig(env, tenant)) ?? {};
    const phoneNumberId = String(body?.phoneNumberId ?? atual.phoneNumberId ?? '').trim();
    if (!/^\d{6,30}$/.test(phoneNumberId)) return erro('Informe o "Identificação do número de telefone" (Phone number ID) da Meta: somente números.');
    const novo = {
      ...atual,
      phoneNumberId,
      wabaId: String(body?.wabaId ?? atual.wabaId ?? '').trim(),
      // campos sensíveis: em branco mantém o valor já salvo
      token: String(body?.token ?? '').trim() || atual.token || '',
      appSecret: String(body?.appSecret ?? '').trim() || atual.appSecret || '',
      verifyToken: atual.verifyToken || aleatorio(16),
      modelo: { nome: String(body?.modelo?.nome ?? atual.modelo?.nome ?? '').trim(), idioma: String(body?.modelo?.idioma ?? atual.modelo?.idioma ?? 'pt_BR').trim() || 'pt_BR' },
    };
    if (!novo.token) return erro('Informe o token de acesso permanente gerado na Meta.');
    if (!novo.appSecret) return erro('Informe a chave secreta do aplicativo (App secret): ela autentica as mensagens recebidas.');
    // valida as credenciais lendo o número na Meta antes de salvar
    try {
      const info = await graph(env, novo, `${phoneNumberId}?fields=display_phone_number,verified_name`);
      novo.numero = info.display_phone_number ?? '';
      novo.nomeVerificado = info.verified_name ?? '';
    } catch (e) {
      return erro(`Não foi possível validar na Meta: ${e.message}`, 400);
    }
    await gravarConfig(env, tenant, novo);
    return json(publica(novo, origem, tenant));
  }

  if (path === '/config' && method === 'DELETE') {
    if (!podeConfigurar) return erro('Somente o proprietário configura o WhatsApp.', 403);
    await env.DB.prepare('DELETE FROM secrets WHERE key = ?').bind(chave(tenant)).run();
    return json({ ok: true });
  }

  if (path === '/enviar' && method === 'POST') {
    const cfg = await lerConfig(env, tenant);
    if (!cfg?.token || !cfg?.phoneNumberId) return erro('O WhatsApp Business não está conectado. Use o link do WhatsApp ou conecte em Configurações.', 409);
    const para = normalizarTelefone(body?.telefone);
    const texto = String(body?.texto ?? '').trim();
    if (para.length < 12) return erro('Telefone inválido: informe DDD e número.');
    if (!texto) return erro('A mensagem está vazia.');
    if (texto.length > 4096) return erro('A mensagem passa do limite de 4.096 caracteres do WhatsApp.');
    const cliente = body?.clienteId ? await getItem(env, tenant, 'clientes', body.clienteId) : null;
    let r;
    try {
      r = await enviar(env, cfg, para, texto, !!body?.usarModelo, cliente?.nome?.split(' ')[0]);
    } catch (e) {
      // fora da janela de 24 h: tenta automaticamente o modelo aprovado, se houver
      if (e.codigo === 131047 && cfg.modelo?.nome && !body?.usarModelo) {
        try { r = await enviar(env, cfg, para, texto, true, cliente?.nome?.split(' ')[0]); } catch (e2) { return erro(e2.message, 502); }
      } else return erro(e.message, e.status === 400 ? 400 : 502);
    }
    const msg = {
      id: r.id ? `wa_${r.id}` : `wa_${Date.now()}`, waId: r.id, direcao: 'Enviada', canal: 'API', status: 'Enviada',
      telefone: para, clienteId: cliente?.id ?? body?.clienteId ?? undefined, nome: cliente?.nome ?? body?.nome ?? '',
      texto, modelo: r.modelo || undefined, referencia: body?.referencia ?? undefined, usuario: user.nome, data: agora(),
    };
    await upsert(tenant, 'mensagens', msg);
    return json({ ok: true, mensagem: msg });
  }

  if (path === '/testar' && method === 'POST') {
    const cfg = await lerConfig(env, tenant);
    if (!cfg?.token) return erro('O WhatsApp Business não está conectado.', 409);
    try {
      const info = await graph(env, cfg, `${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
      return json({ ok: true, numero: info.display_phone_number, nome: info.verified_name, qualidade: info.quality_rating ?? '—' });
    } catch (e) {
      return erro(e.message, 502);
    }
  }

  return erro('Rota não encontrada.', 404);
}

/* ---------------- webhook público (Meta) ---------------- */
async function assinaturaValida(segredo, corpo, cabecalho) {
  if (!segredo || !cabecalho?.startsWith('sha256=')) return false;
  const k = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const esperado = hex(await crypto.subtle.sign('HMAC', k, enc.encode(corpo)));
  const recebido = cabecalho.slice(7).toLowerCase();
  if (esperado.length !== recebido.length) return false;
  let r = 0;
  for (let i = 0; i < esperado.length; i++) r |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return r === 0;
}

const textoDe = (m) => {
  switch (m.type) {
    case 'text': return m.text?.body ?? '';
    case 'button': return m.button?.text ?? '';
    case 'interactive': return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '[resposta interativa]';
    case 'image': return `[imagem] ${m.image?.caption ?? ''}`.trim();
    case 'document': return `[documento] ${m.document?.filename ?? ''}`.trim();
    case 'audio': return '[áudio]';
    case 'video': return '[vídeo]';
    case 'location': return '[localização]';
    default: return `[${m.type}]`;
  }
};
const ORDEM_STATUS = { Enviada: 1, Entregue: 2, Lida: 3, Falhou: 4 };
const STATUS_WA = { sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falhou' };

export async function webhookWhatsApp(req, env, tenant, util) {
  const { json, erro, upsert, listar, getItem, tenantExiste } = util;
  if (!(await tenantExiste(tenant))) return erro('Empresa não encontrada.', 404);
  const cfg = await lerConfig(env, tenant);
  if (!cfg) return erro('WhatsApp não configurado para esta empresa.', 404);

  if (req.method === 'GET') {
    const u = new URL(req.url);
    if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === cfg.verifyToken) {
      return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return erro('Token de verificação inválido.', 403);
  }
  if (req.method !== 'POST') return erro('Método não permitido.', 405);

  const corpo = await req.text();
  if (!(await assinaturaValida(cfg.appSecret, corpo, req.headers.get('x-hub-signature-256')))) return erro('Assinatura inválida.', 401);
  let payload;
  try { payload = JSON.parse(corpo); } catch { return erro('JSON inválido.'); }

  const clientes = await listar(env, tenant, 'clientes');
  const porTelefone = new Map(clientes.filter((c) => c.telefone).map((c) => [chaveTelefone(c.telefone), c]));
  let oportunidades = null;
  let recebidas = 0, novosLeads = 0, statusAtualizados = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const nomes = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? '']));
      for (const m of v.messages ?? []) {
        const id = `wa_${m.id}`;
        if (await getItem(env, tenant, 'mensagens', id)) continue; // reentrega da Meta: idempotente
        const cliente = porTelefone.get(chaveTelefone(m.from));
        const nome = cliente?.nome ?? nomes.get(m.from) ?? '';
        const data = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : agora();
        await upsert(tenant, 'mensagens', { id, waId: m.id, direcao: 'Recebida', canal: 'API', status: 'Recebida', telefone: m.from, clienteId: cliente?.id, nome, texto: textoDe(m), data });
        recebidas++;
        // contato que ainda não é cliente nem lead em aberto → nova oportunidade no funil
        if (!cliente) {
          oportunidades ??= await listar(env, tenant, 'oportunidades');
          const aberto = oportunidades.find((o) => o.etapa !== 'Fechados' && o.telefone && chaveTelefone(o.telefone) === chaveTelefone(m.from));
          const hoje = data.slice(0, 10);
          if (aberto) {
            await upsert(tenant, 'oportunidades', { ...aberto, atualizadoEm: hoje });
          } else {
            const op = { id: `op_wa_${m.from}_${Date.now()}`, titulo: nome || `+${m.from}`, servico: textoDe(m).slice(0, 60), valor: 0, etapa: 'Leads', origem: 'WhatsApp', telefone: m.from, criadoEm: hoje, atualizadoEm: hoje };
            await upsert(tenant, 'oportunidades', op);
            oportunidades.push(op);
            novosLeads++;
          }
        }
      }
      for (const s of v.statuses ?? []) {
        const msg = await getItem(env, tenant, 'mensagens', `wa_${s.id}`);
        const novo = STATUS_WA[s.status];
        if (!msg || !novo || (ORDEM_STATUS[novo] ?? 0) <= (ORDEM_STATUS[msg.status] ?? 0)) continue;
        await upsert(tenant, 'mensagens', { ...msg, status: novo, erro: s.errors?.[0]?.title ?? msg.erro });
        statusAtualizados++;
      }
    }
  }
  await gravarConfig(env, tenant, { ...cfg, ultimoEvento: agora() });
  return json({ ok: true, recebidas, novosLeads, statusAtualizados });
}
