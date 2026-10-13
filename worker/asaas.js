/**
 * Pivot Hub · Integração com o Asaas (cobrança recorrente automática das empresas assinantes)
 *
 * Configuração (Cloudflare → Worker → Settings → Variables and Secrets):
 *   ASAAS_API_KEY      (secret)  chave da API — $aact_hmlg_... (sandbox) ou $aact_prod_... (produção)
 *   ASAAS_AMBIENTE     (opcional) "sandbox" | "producao" — por padrão é deduzido do prefixo da chave
 *   ASAAS_WEBHOOK_TOKEN(opcional) só se o webhook for cadastrado manualmente no painel do Asaas;
 *                                 pelo console o token é gerado e guardado no D1 automaticamente.
 *
 * Fluxo: empresa → cliente (cus_) + assinatura mensal (sub_) no Asaas → o Asaas gera as cobranças →
 * webhook /api/asaas/webhook dá baixa nas faturas, regulariza inadimplentes e converte testes pagos.
 * Uma rotina diária (cron) reconcilia os pagamentos caso algum evento não chegue.
 */

const PLAT = '_plataforma';
const PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const CANCELADOS = ['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'DELETED'];
const EVENTOS = [
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED',
  'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED',
];
const FORMAS = ['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD'];
const NOME_FORMA = { UNDEFINED: 'cliente escolhe', PIX: 'Pix', BOLETO: 'boleto', CREDIT_CARD: 'cartão de crédito' };

const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
const digitos = (s) => String(s ?? '').replace(/\D/g, '');
/** Erro de validação (vira HTTP 400; erros de comunicação com o Asaas viram 502). */
const falha = (msg) => Object.assign(new Error(msg), { status: 400 });

/** CPF/CNPJ com dígitos verificadores válidos (o Asaas recusa documentos inválidos). */
export function documentoValido(valor) {
  const d = digitos(valor);
  if (!/^(\d{11}|\d{14})$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (base, pesos) => { const s = pesos.reduce((t, p, i) => t + Number(base[i]) * p, 0) % 11; return s < 2 ? 0 : 11 - s; };
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const v1 = (() => { const s = p1.reduce((t, p, i) => t + Number(d[i]) * p, 0) * 10 % 11; return s === 10 ? 0 : s; })();
    const v2 = (() => { const s = p2.reduce((t, p, i) => t + Number(d[i]) * p, 0) * 10 % 11; return s === 10 ? 0 : s; })();
    return v1 === Number(d[9]) && v2 === Number(d[10]);
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [6, ...p1];
  return dv(d, p1) === Number(d[12]) && dv(d, p2) === Number(d[13]);
}

/* ---------------- Banco (mesmas tabelas do index.js) ---------------- */
async function getItem(env, col, id) {
  const r = await env.DB.prepare('SELECT data FROM dados WHERE tenant = ? AND col = ? AND id = ?').bind(PLAT, col, String(id)).first();
  return r ? JSON.parse(r.data) : null;
}
async function listar(env, col) {
  return (await env.DB.prepare('SELECT data FROM dados WHERE tenant = ? AND col = ?').bind(PLAT, col).all()).results.map((r) => JSON.parse(r.data));
}
async function salvar(env, col, item) {
  await env.DB.prepare('INSERT INTO dados (tenant, col, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant, col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(PLAT, col, String(item.id), JSON.stringify(item), new Date().toISOString()).run();
}
async function excluir(env, col, id) {
  await env.DB.prepare('DELETE FROM dados WHERE tenant = ? AND col = ? AND id = ?').bind(PLAT, col, String(id)).run();
}
async function segredoLocal(env, key) {
  const r = await env.DB.prepare('SELECT value FROM secrets WHERE key = ?').bind(key).first();
  return r?.value ?? null;
}

/** Mensalidade (mesma regra do front-end: plano + extras − desconto). */
export function valorMensalDe(a, plano, cfg) {
  if (!a || !plano) return 0;
  const base = plano.precoMensal * (a.ciclo === 'Anual' ? 1 - plano.descontoAnual : 1);
  const extras = a.usuariosExtras * plano.precoUsuarioExtra + (a.modulosExtras ?? []).filter((m) => !plano.modulos.includes(m)).length * (cfg?.precoModuloAvulso ?? 39);
  return Math.round((base + extras) * (1 - (a.descontoPct || 0)) * 100) / 100;
}
async function valorAtual(env, a) {
  const plano = await getItem(env, 'planos', a.planoId);
  const cfg = await getItem(env, 'config', 'geral');
  return { valor: valorMensalDe(a, plano, cfg), plano };
}

/* ---------------- Cliente HTTP do Asaas ---------------- */
export function asaasConfig(env) {
  const key = env.ASAAS_API_KEY;
  if (!key) return null;
  const amb = String(env.ASAAS_AMBIENTE ?? '').toLowerCase();
  const producao = amb ? amb.startsWith('prod') : key.includes('_prod_');
  return { key, producao, base: env.ASAAS_BASE_URL || (producao ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3') };
}

async function asaas(env, method, path, body) {
  const cfg = asaasConfig(env);
  if (!cfg) throw falha('Asaas não configurado: cadastre o secret ASAAS_API_KEY no Worker.');
  const res = await fetch(cfg.base + path, {
    method,
    headers: { access_token: cfg.key, 'content-type': 'application/json', 'User-Agent': 'PivotHub/1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.map((e) => e.description).join(' ') || `Asaas respondeu ${res.status}.`;
    throw Object.assign(new Error(`Asaas: ${msg}`), { status: res.status });
  }
  return data;
}

/** Próximo vencimento no dia contratado; durante o teste grátis, a primeira cobrança é após o fim do teste. */
export function proximoVencimento(a, hoje = hojeISO()) {
  const base = a.status === 'Trial' && a.trialFim && a.trialFim > hoje ? a.trialFim : hoje;
  const [y, m, d] = base.split('-').map(Number);
  const dia = Math.min(28, Math.max(1, a.diaVencimento || 10));
  const mesmoMes = `${y}-${pad(m)}-${pad(dia)}`;
  if (dia > d) return mesmoMes;
  const prox = new Date(y, m, dia); // mês seguinte
  return `${prox.getFullYear()}-${pad(prox.getMonth() + 1)}-${pad(dia)}`;
}

const evento = (a, tipo, detalhe) => [...(a.historico ?? []), { data: hojeISO(), tipo, detalhe }];

/* ---------------- Faturas a partir das cobranças do Asaas ---------------- */
async function registrarPagamento(env, a, p, nomeEvento) {
  const id = `asaas-${p.id}`;
  const atual = await getItem(env, 'faturas', id);
  const status = PAGOS.includes(p.status) ? 'Paga'
    : CANCELADOS.includes(p.status) || nomeEvento === 'PAYMENT_DELETED' || p.deleted ? 'Cancelada' : 'Em aberto';
  const fatura = {
    ...(atual ?? {}), id, assinanteId: a.id, competencia: String(p.dueDate).slice(0, 7), vencimento: p.dueDate, valor: p.value,
    valorLiquido: p.netValue, planoId: atual?.planoId ?? a.planoId, status,
    pagoEm: status === 'Paga' ? (p.clientPaymentDate || p.paymentDate || p.confirmedDate || hojeISO()) : undefined,
    asaasId: p.id, link: p.invoiceUrl || p.bankSlipUrl, forma: p.billingType,
  };
  await salvar(env, 'faturas', fatura);

  // a fatura do Asaas substitui a manual em aberto da mesma competência
  const faturas = (await listar(env, 'faturas')).filter((f) => f.assinanteId === a.id);
  for (const f of faturas) {
    if (!f.asaasId && f.competencia === fatura.competencia && f.status === 'Em aberto') await excluir(env, 'faturas', f.id);
  }

  // pagamento confirmado: converte teste e regulariza inadimplência/suspensão sem ação manual
  if (status === 'Paga' && atual?.status !== 'Paga') {
    const hoje = hojeISO();
    const outrasVencidas = faturas.some((f) => f.id !== id && f.status === 'Em aberto' && f.vencimento < hoje);
    let novo = null;
    if (a.status === 'Trial') novo = { ...a, status: 'Ativa', convertidoEm: hoje, historico: evento(a, 'Conversão', `Primeiro pagamento confirmado pelo Asaas (${NOME_FORMA[p.billingType] ?? p.billingType})`) };
    else if (['Inadimplente', 'Suspensa'].includes(a.status) && !outrasVencidas) novo = { ...a, status: 'Ativa', historico: evento(a, 'Regularização', 'Pagamento confirmado pelo Asaas: acesso normalizado') };
    if (novo) await salvar(env, 'assinantes', novo);
  }
  return fatura;
}

async function assinantePorPagamento(env, p) {
  if (p.externalReference) {
    const a = await getItem(env, 'assinantes', p.externalReference);
    if (a) return a;
  }
  const todos = await listar(env, 'assinantes');
  return todos.find((a) => p.subscription && a.cobranca?.assinaturaId === p.subscription)
    ?? todos.find((a) => p.customer && a.cobranca?.clienteId === p.customer) ?? null;
}

/** Busca no Asaas todas as cobranças das assinaturas e atualiza as faturas (rede de segurança do webhook). */
export async function reconciliar(env, somenteId) {
  const assinantes = (await listar(env, 'assinantes')).filter((a) => a.cobranca?.assinaturaId && (!somenteId || a.id === somenteId));
  let faturas = 0;
  for (const a of assinantes) {
    let offset = 0;
    for (;;) {
      const r = await asaas(env, 'GET', `/payments?subscription=${encodeURIComponent(a.cobranca.assinaturaId)}&limit=100&offset=${offset}`);
      for (const p of r.data ?? []) {
        // recarrega o assinante: um pagamento pode ter mudado o status dele
        await registrarPagamento(env, (await getItem(env, 'assinantes', a.id)) ?? a, p);
        faturas++;
      }
      if (!r.hasMore) break;
      offset += 100;
    }
  }
  return { assinantes: assinantes.length, faturas };
}

/** Régua de inadimplência (mesma regra do console): atraso > tolerância → inadimplente; > 3× → suspensa. */
export async function aplicarRegua(env) {
  const cfg = { diasTolerancia: 10, ...(await getItem(env, 'config', 'geral')) };
  const hoje = hojeISO();
  const dias = (d) => Math.round((Date.parse(hoje) - Date.parse(d)) / 86_400_000);
  const faturas = await listar(env, 'faturas');
  let inad = 0, susp = 0;
  for (const a of await listar(env, 'assinantes')) {
    const atraso = Math.max(0, ...faturas.filter((f) => f.assinanteId === a.id && f.status === 'Em aberto' && f.vencimento < hoje).map((f) => dias(f.vencimento)));
    if (a.status === 'Ativa' && atraso > cfg.diasTolerancia) {
      await salvar(env, 'assinantes', { ...a, status: 'Inadimplente', historico: evento(a, 'Inadimplência', `Rotina automática: ${atraso} dias de atraso`) }); inad++;
    } else if (a.status === 'Inadimplente' && atraso > cfg.diasTolerancia * 3) {
      await salvar(env, 'assinantes', { ...a, status: 'Suspensa', historico: evento(a, 'Suspensão', `Rotina automática: ${atraso} dias de atraso`) }); susp++;
    }
  }
  return { inadimplentes: inad, suspensas: susp };
}

/** Rotina diária (Cron Trigger). */
export async function rotinaDiaria(env) {
  const out = {};
  if (asaasConfig(env)) out.asaas = await reconciliar(env).catch((e) => ({ erro: e.message }));
  const cfg = await getItem(env, 'config', 'geral');
  if (cfg?.reguaAutomatica) out.regua = await aplicarRegua(env);
  await env.DB.prepare("INSERT OR REPLACE INTO secrets (key, value) VALUES ('rotina_ultima', ?)").bind(JSON.stringify({ em: new Date().toISOString(), ...out })).run();
  // mantém só os últimos 60 dias de eventos de webhook
  const limite = new Date(Date.now() - 60 * 86_400_000).toISOString();
  await env.DB.prepare("DELETE FROM dados WHERE tenant = ? AND col = 'asaas_eventos' AND updated_at < ?").bind(PLAT, limite).run();
  return out;
}

/* ---------------- Ativar / desativar / sincronizar uma empresa ---------------- */
async function ativar(env, id, forma) {
  const a = await getItem(env, 'assinantes', id);
  if (!a) throw falha('Empresa não encontrada.');
  if (a.cobranca?.ativa && a.cobranca.assinaturaId) throw falha('A cobrança automática já está ativa.');
  if (!FORMAS.includes(forma)) throw falha('Forma de pagamento inválida.');
  const doc = digitos(a.cnpj);
  if (!documentoValido(doc)) throw falha('CPF/CNPJ inválido no cadastro da empresa: corrija antes de ativar a cobrança (o Asaas recusa documentos inválidos).');
  const { valor, plano } = await valorAtual(env, a);
  if (!plano || valor <= 0) throw falha('A empresa precisa de um plano com valor para ser cobrada.');

  // reaproveita o cliente do Asaas (pelo id salvo ou pelo CPF/CNPJ) para não duplicar cadastro
  let clienteId = a.cobranca?.clienteId;
  if (!clienteId) {
    const existentes = await asaas(env, 'GET', `/customers?cpfCnpj=${doc}`);
    clienteId = existentes.data?.find((c) => !c.deleted)?.id;
  }
  if (!clienteId) {
    const fone = digitos(a.telefone);
    const c = await asaas(env, 'POST', '/customers', {
      name: a.empresa, cpfCnpj: doc, email: a.email, externalReference: a.id,
      ...(fone.length >= 10 ? { mobilePhone: fone } : {}),
    });
    clienteId = c.id;
  }
  const venc = proximoVencimento(a);
  const sub = await asaas(env, 'POST', '/subscriptions', {
    customer: clienteId, billingType: forma, value: valor, nextDueDate: venc, cycle: 'MONTHLY',
    description: `Pivot Hub · Plano ${plano.nome}`, externalReference: a.id,
  });
  const novo = {
    ...a,
    cobranca: { provedor: 'asaas', ativa: true, forma, clienteId, assinaturaId: sub.id, valor, proximoVencimento: venc, atualizadoEm: new Date().toISOString() },
    historico: evento(a, 'Cobrança automática', `Assinatura Asaas criada: R$ ${valor.toFixed(2).replace('.', ',')}/mês, ${NOME_FORMA[forma]}, 1º vencimento ${venc.split('-').reverse().join('/')}`),
  };
  await salvar(env, 'assinantes', novo);
  await reconciliar(env, a.id).catch(() => undefined);
  return (await getItem(env, 'assinantes', a.id)) ?? novo;
}

async function desativar(env, id, motivo = 'Cobrança automática desativada') {
  const a = await getItem(env, 'assinantes', id);
  if (!a?.cobranca?.assinaturaId) throw falha('A empresa não tem cobrança automática ativa.');
  await asaas(env, 'DELETE', `/subscriptions/${encodeURIComponent(a.cobranca.assinaturaId)}`).catch((e) => { if (e.status !== 404) throw e; });
  // cobranças futuras deixam de existir no Asaas; as vencidas continuam como dívida
  const hoje = hojeISO();
  for (const f of await listar(env, 'faturas')) {
    if (f.assinanteId === id && f.asaasId && f.status === 'Em aberto' && f.vencimento >= hoje) await salvar(env, 'faturas', { ...f, status: 'Cancelada' });
  }
  const novo = { ...a, cobranca: { ...a.cobranca, ativa: false, assinaturaId: undefined, atualizadoEm: new Date().toISOString(), erro: undefined }, historico: evento(a, 'Cobrança automática', motivo) };
  await salvar(env, 'assinantes', novo);
  return novo;
}

/**
 * Chamado depois que o console salva uma empresa: mantém a assinatura do Asaas coerente
 * (cancelamento encerra a cobrança; troca de plano/extras/desconto atualiza o valor; teste estendido adia o 1º vencimento).
 * Nunca impede o salvamento: um erro do Asaas volta como aviso e fica registrado na empresa.
 */
export async function aposSalvarAssinante(env, antes, depois) {
  if (!asaasConfig(env) || !depois.cobranca?.ativa || !depois.cobranca.assinaturaId) return { registro: depois };
  try {
    if (depois.status === 'Cancelada') return { registro: await desativar(env, depois.id, 'Cobrança encerrada junto com o cancelamento da assinatura') };
    const { valor, plano } = await valorAtual(env, depois);
    const mudancas = {};
    if (Math.abs(valor - (depois.cobranca.valor ?? 0)) > 0.004) Object.assign(mudancas, { value: valor, updatePendingPayments: true });
    if (antes?.planoId !== depois.planoId && plano) mudancas.description = `Pivot Hub · Plano ${plano.nome}`;
    if (depois.status === 'Trial' && antes?.trialFim !== depois.trialFim) mudancas.nextDueDate = proximoVencimento(depois);
    if (!Object.keys(mudancas).length) return { registro: depois };
    await asaas(env, 'PUT', `/subscriptions/${encodeURIComponent(depois.cobranca.assinaturaId)}`, mudancas);
    const novo = {
      ...depois,
      cobranca: { ...depois.cobranca, valor, proximoVencimento: mudancas.nextDueDate ?? depois.cobranca.proximoVencimento, atualizadoEm: new Date().toISOString(), erro: undefined },
      historico: mudancas.value ? evento(depois, 'Cobrança automática', `Valor no Asaas atualizado para R$ ${valor.toFixed(2).replace('.', ',')}/mês (inclui cobranças pendentes)`) : depois.historico,
    };
    await salvar(env, 'assinantes', novo);
    return { registro: novo };
  } catch (e) {
    const novo = { ...depois, cobranca: { ...depois.cobranca, erro: e.message } };
    await salvar(env, 'assinantes', novo);
    return { registro: novo, aviso: `Salvo no Pivot Hub, mas o Asaas não foi atualizado: ${e.message}` };
  }
}

/* ---------------- Rotas do console (/api/admin/asaas/...) ---------------- */
export async function rotasAdminAsaas(req, env, path, method, body, user, json, erro) {
  try {
    if (path === '/status' && method === 'GET') {
      const cfg = asaasConfig(env);
      const tokenOk = !!(env.ASAAS_WEBHOOK_TOKEN || (await segredoLocal(env, 'asaas_webhook')));
      const ult = await env.DB.prepare("SELECT data FROM dados WHERE tenant = ? AND col = 'asaas_eventos' ORDER BY updated_at DESC LIMIT 1").bind(PLAT).first();
      const rotina = await segredoLocal(env, 'rotina_ultima');
      const base = { configurado: !!cfg, ambiente: cfg ? (cfg.producao ? 'produção' : 'sandbox') : null, webhook: tokenOk, ultimoEvento: ult ? JSON.parse(ult.data) : null, rotina: rotina ? JSON.parse(rotina) : null };
      if (!cfg) return json(base);
      try {
        const saldo = await asaas(env, 'GET', '/finance/balance');
        return json({ ...base, saldo: saldo.balance });
      } catch (e) { return json({ ...base, erro: e.message }); }
    }

    if (path === '/webhook' && method === 'POST') {
      const url = `${new URL(req.url).origin}/api/asaas/webhook`;
      if (url.startsWith('http://localhost') && !env.ASAAS_BASE_URL) return erro('O Asaas não alcança localhost: configure o webhook a partir do endereço publicado.', 400);
      const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const token = Array.from(crypto.getRandomValues(new Uint32Array(48)), (n) => abc[n % abc.length]).join('');
      const dados = {
        name: 'Pivot Hub', url, email: user.email, enabled: true, interrupted: false, apiVersion: 3,
        authToken: token, sendType: 'SEQUENTIALLY', events: EVENTOS,
      };
      const lista = await asaas(env, 'GET', '/webhooks').catch(() => ({ data: [] }));
      const existente = (lista.data ?? []).find((w) => w.url === url);
      if (existente) await asaas(env, 'PUT', `/webhooks/${existente.id}`, dados);
      else await asaas(env, 'POST', '/webhooks', dados);
      await env.DB.prepare("INSERT OR REPLACE INTO secrets (key, value) VALUES ('asaas_webhook', ?)").bind(token).run();
      return json({ ok: true, url });
    }

    if (path === '/sincronizar' && method === 'POST') return json({ ok: true, ...(await reconciliar(env)) });
    if (path === '/rotina' && method === 'POST') return json({ ok: true, ...(await rotinaDiaria(env)) });

    const m = path.match(/^\/(ativar|desativar)\/([^/]+)$/);
    if (m && method === 'POST') {
      const id = decodeURIComponent(m[2]);
      const registro = m[1] === 'ativar' ? await ativar(env, id, body?.forma ?? 'UNDEFINED') : await desativar(env, id);
      return json({ ok: true, registro });
    }
    return erro('Rota não encontrada.', 404);
  } catch (e) {
    return erro(e.message || 'Falha na integração com o Asaas.', e.status && e.status < 500 ? 400 : 502);
  }
}

/* ---------------- Webhook público (/api/asaas/webhook) ---------------- */
function iguais(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function webhookAsaas(req, env, json) {
  const esperado = env.ASAAS_WEBHOOK_TOKEN || (await segredoLocal(env, 'asaas_webhook'));
  if (!esperado) return json({ error: 'Webhook não configurado.' }, 503);
  if (!iguais(req.headers.get('asaas-access-token') ?? '', esperado)) return json({ error: 'Token inválido.' }, 401);
  const ev = await req.json().catch(() => null);
  if (!ev?.event) return json({ ok: true, ignorado: 'sem evento' });
  const evId = String(ev.id ?? `${ev.event}-${ev.payment?.id}-${ev.dateCreated}`);
  // entrega "at least once": o mesmo evento pode chegar de novo
  if (await getItem(env, 'asaas_eventos', evId)) return json({ ok: true, duplicado: true });

  let resultado = 'ignorado';
  let assinanteId = null;
  const p = ev.payment;
  if (p?.id && String(ev.event).startsWith('PAYMENT_')) {
    const a = await assinantePorPagamento(env, p);
    if (a) {
      assinanteId = a.id;
      const f = await registrarPagamento(env, a, p, ev.event);
      resultado = `fatura ${f.status.toLowerCase()}`;
    } else resultado = 'cobrança sem empresa vinculada';
  }
  await salvar(env, 'asaas_eventos', {
    id: evId, evento: ev.event, pagamento: p?.id ?? null, valor: p?.value ?? null, status: p?.status ?? null,
    assinanteId, resultado, recebidoEm: new Date().toISOString(),
  });
  return json({ ok: true, resultado });
}
